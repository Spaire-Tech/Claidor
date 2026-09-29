"""Where a person's cloud box runs (25 September 2026).

`BoxHost` is the one thing the broker (`box_service.py`) asks of a host:
create a box from a `BoxSpec`, say whether it runs, start, stop, remove.
Two implementations, chosen by `CLAIDOR_BOX_HOST_PROVIDER`:

- `docker`: the same `docker run` the Mac performs in
  `desktop/source/electron-main/box/local-docker-host-connector.ts`
  (image, environment, labels, volumes, published ports), spoken to a
  Docker Engine at `CLAIDOR_BOX_DOCKER_HOST` over its HTTP API with httpx
  (no new dependency). Two things differ from the Mac by necessity: the
  box credential rides in `SAND_INFERENCE_RENEWAL_CREDENTIAL` instead of
  a mounted token file (the daemon is on another machine, so there is
  nothing to bind-mount), and the host bundle is uploaded into the
  container with `PUT /containers/{id}/archive` before it starts, or
  baked into `CLAIDOR_BOX_IMAGE`.
- `e2b`: a stub. The `e2b` package is not in `uv.lock` (checked 25
  September 2026: `grep -n 'name = "e2b"' server/uv.lock` finds nothing),
  and E2B's per-port hostnames are `<port>-<id>.e2b.app`, which is not
  the `<label>-<port>` shape the app's tunnel derivation reads
  (`box-connection.ts`); both are written up in
  `docs/product/cloud-computer-served.md`.

Nothing here touches the database; the broker keeps the row.
"""

from __future__ import annotations

import dataclasses
import hashlib
import io
import json
import re
import ssl
import tarfile
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Protocol
from urllib.parse import quote, urlsplit

import httpx
import structlog

from polar.config import settings

log = structlog.get_logger()

#: The box's inner ports the app dials: the gateway, the two noVNC
#: screens and the egress tunnel (`box-connection.ts`, `sand-box.ts`).
BOX_PORTS: tuple[int, ...] = (1340, 6080, 6081, 8790)
GATEWAY_PORT = 1340
PRIMARY_NOVNC_PORT = 6080
FORK_NOVNC_PORT = 6081
EGRESS_TUNNEL_PORT = 8790

BOX_HOST_UNAVAILABLE_SENTENCE = (
    "Simeon's cloud computer needs a host; set CLAIDOR_BOX_HOST_PROVIDER"
)

#: Labels of the local Docker path, so `docker ps` on the VM reads the
#: same way `docker ps` on a Mac does.
OWNER_LABEL = "com.grok-bot.local-vm"
SCHEMA_VERSION = "10"

BoxRunState = Literal["running", "stopped"]

#: Where the box host keeps each host bundle, one folder per bundle, for
#: boxes to mount read-only (DockerBoxHost.create).
BOX_HOST_BUNDLE_ROOT = "/var/lib/simeon/box-host"
#: (server, folder) pairs already written: each server has its own disk.
_installed_bundle_dirs: set[tuple[str, str]] = set()


class BoxHostError(Exception):
    """Something the host could not do; the sentence is shown to the person."""


class BoxHostUnavailable(BoxHostError):
    """No host is configured; the broker answers `unavailable`."""


class BoxBlocked(BoxHostError):
    """The host refuses this person a box for now (capacity, abuse, an
    unpaid bill): `EnsureSandBox` answers the `SAND_BOX_BLOCKED` hint with
    `retry-after`, and the app holds off for that long
    (`BrokeredHostConnector.connect`, `BOX_BLOCKED_MAX_HOLD_MS`)."""

    def __init__(
        self, reason: str, *, title: str = "", detail: str = "", retry_after_s: int = 60
    ) -> None:
        super().__init__(detail or title or reason)
        self.reason = reason
        self.title = title
        self.detail = detail
        self.retry_after_s = retry_after_s


class BoxStorageDisabled(BoxHostError):
    """`CLOUD_AGENT_STORAGE_DISABLED`: no path raises it today; the hint
    is served so a host that has the notion can."""


class BoxClientUpdateRequired(BoxHostError):
    """`SAND_CLIENT_UPDATE_REQUIRED`: the app is too old for the box
    image; no path raises it today."""


@dataclass(frozen=True)
class BoxSpec:
    """What a box is made of. `name` is the container name; the tokens
    are minted by the broker and stored on the row."""

    name: str
    gateway_token: str
    renewal_credential: str
    backend_url: str
    image: str
    workspace_volume: str
    data_volume: str
    extra_env: dict[str, str] = field(default_factory=dict)
    #: `--memory` (no swap beyond it) and `--cpus`; zero is no limit. The
    #: Mac's `docker run` sets neither (Docker Desktop's VM is the bound);
    #: a shared host needs both (`CLAIDOR_BOX_MEMORY_LIMIT_MB`, `_CPU_LIMIT`).
    memory_mb: int = 0
    cpus: float = 0.0

    def resource_limits(self) -> dict[str, int]:
        limits: dict[str, int] = {}
        if self.memory_mb > 0:
            memory = self.memory_mb * 1024 * 1024
            limits["Memory"] = memory
            limits["MemorySwap"] = memory
        if self.cpus > 0:
            limits["NanoCpus"] = int(self.cpus * 1_000_000_000)
        return limits

    def environment(self) -> list[str]:
        # The local Docker path's environment, line for line
        # (`local-docker-host-connector.ts`, the `docker run`), minus the
        # token file (the credential is in the environment here) and plus
        # `SAND_INFERENCE_RENEWAL_CREDENTIAL`, which the host's auth
        # service reads on the cloud path (`auth-service.ts`).
        env = {
            "SAND_SUPERVISOR_ENABLED": "1",
            "SAND_BOX_AUTO_UPDATE": "0",
            "SAND_USE_EXISTING_BOX_EXEC_DAEMON": "1",
            "SAND_DATA_ROOT": "/home/box/sand-data",
            "SAND_TREE_SITTER_NODE_DEPS": "/home/box/deps",
            "NODE_PATH": "/home/box/deps",
            "SAND_GATEWAY_BIND_HOST": "0.0.0.0",
            "SAND_HOST_PORT": str(GATEWAY_PORT),
            "SAND_GATEWAY_TOKEN": self.gateway_token,
            "SAND_BACKEND_URL": self.backend_url,
            "SAND_INFERENCE_RENEWAL_CREDENTIAL": self.renewal_credential,
            "SAND_INFERENCE_PROVIDER": "claidor",
            "SAND_DISABLE_TELEMETRY": "1",
            "SAND_DISABLE_ANALYTICS": "1",
            "SAND_BOX_LOG_SHIP_DISABLED": "1",
            **self.extra_env,
        }
        return [f"{key}={value}" for key, value in env.items()]


@dataclass(frozen=True)
class ProvisionedBox:
    provider_box_id: str
    host_address: str
    #: inner port → published host port
    ports: dict[int, int]
    image: str
    image_digest: str | None = None
    #: The `com.grok-bot.local-vm.host-sha256` label: which host program
    #: the container mounts. None on a container made before 29 September.
    host_sha256: str | None = None


class BoxHost(Protocol):
    #: The server's name, stored on each box it makes (`SandBox.provider`).
    name: str

    @property
    def max_running(self) -> int:
        """Boxes awake at once on this server; zero or less: no limit."""
        ...

    #: False drains the server: it keeps its boxes and takes no new one.
    accepting: bool

    async def create(self, spec: BoxSpec) -> ProvisionedBox: ...

    async def inspect(self, provider_box_id: str) -> ProvisionedBox | None:
        """The box as it is now (ports may change across restarts), or
        None when the host no longer has it."""
        ...

    async def run_state(self, provider_box_id: str) -> BoxRunState | None: ...

    async def start(self, provider_box_id: str) -> None: ...

    async def stop(self, provider_box_id: str) -> None: ...

    async def remove(self, provider_box_id: str, *, volumes: list[str]) -> None:
        """Remove the box; the named volumes too when given (a reset
        that does not preserve data)."""
        ...


# --- docker ------------------------------------------------------------------


class HostBundle:
    """The host bundle uploaded into a new container: `host/host-main.cjs`
    to `/home/box/sand-host/host-main.cjs` and `box-exec-daemon/main.cjs`
    to `/home/box/box-exec-daemon/main.cjs`, the two paths the Mac
    bind-mounts. Read once from `CLAIDOR_BOX_HOST_BUNDLE_URL` (a tar or
    tar.gz) and kept in memory."""

    HOST_MAIN = "host/host-main.cjs"
    BOX_EXEC_DAEMON = "box-exec-daemon/main.cjs"

    def __init__(self, host_main: bytes, box_exec_daemon: bytes) -> None:
        self.host_main = host_main
        self.box_exec_daemon = box_exec_daemon

    @classmethod
    def from_tar(cls, data: bytes) -> HostBundle:
        members: dict[str, bytes] = {}
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as archive:
            for member in archive.getmembers():
                name = member.name.lstrip("./")
                for wanted in (cls.HOST_MAIN, cls.BOX_EXEC_DAEMON):
                    if name == wanted or name.endswith("/" + wanted):
                        extracted = archive.extractfile(member)
                        if extracted is not None:
                            members[wanted] = extracted.read()
        missing = [n for n in (cls.HOST_MAIN, cls.BOX_EXEC_DAEMON) if n not in members]
        if missing:
            raise BoxHostError(
                f"The host bundle is missing {', '.join(missing)}; "
                "build it with `npm run package` in desktop/ and publish desktop/dist."
            )
        return cls(members[cls.HOST_MAIN], members[cls.BOX_EXEC_DAEMON])

    @property
    def host_sha256(self) -> str:
        return hashlib.sha256(self.host_main).hexdigest()

    @property
    def box_exec_daemon_sha256(self) -> str:
        return hashlib.sha256(self.box_exec_daemon).hexdigest()

    @property
    def key(self) -> str:
        """The folder on the box host that holds this bundle."""
        both = hashlib.sha256(self.host_main + b"\0" + self.box_exec_daemon)
        return both.hexdigest()[:16]

    def disk_archive(self) -> bytes:
        """The two files as the box host keeps them, one folder per
        bundle: `host-main.cjs` and `box-exec-daemon/main.cjs`."""
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w") as archive:
            for name, data in (
                ("host-main.cjs", self.host_main),
                ("box-exec-daemon/main.cjs", self.box_exec_daemon),
            ):
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = 0o644
                archive.addfile(info, io.BytesIO(data))
        return buffer.getvalue()

    @staticmethod
    def single_file_tar(name: str, data: bytes, mode: int = 0o644) -> bytes:
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w") as archive:
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = mode
            archive.addfile(info, io.BytesIO(data))
        return buffer.getvalue()


def _docker_base_url(docker_host: str) -> tuple[str, str | None]:
    """The httpx base URL and, for a unix socket, its path."""
    parts = urlsplit(docker_host)
    if parts.scheme in ("unix", ""):
        return "http://docker", parts.path or docker_host
    if parts.scheme == "tcp":
        secure = bool(settings.BOX_DOCKER_TLS_CERT)
        return f"{'https' if secure else 'http'}://{parts.netloc}", None
    if parts.scheme in ("http", "https"):
        return f"{parts.scheme}://{parts.netloc}", None
    raise BoxHostUnavailable(
        f"CLAIDOR_BOX_DOCKER_HOST={docker_host!r} is not a URL this server can dial; "
        "use http(s)://host:2376, tcp://host:2376 or unix:///var/run/docker.sock "
        "(an ssh:// daemon needs an SSH tunnel to one of those)."
    )


class _HostReachTransport(httpx.AsyncBaseTransport):
    """Every failure to reach the Docker daemon becomes a `BoxHostError`
    with the reason in it, so EnsureSandBox answers one sentence the app
    shows and `sand.box.ensure.refused` logs, and the sleeper and the wake
    log it, instead of an unhandled 500. The first real run (28 September
    2026) failed 129 times as a bare 500 on a certificate the API refused
    ("CA cert does not include key usage extension")."""

    def __init__(self, inner: httpx.AsyncBaseTransport, where: str) -> None:
        self.inner = inner
        self.where = where

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        try:
            return await self.inner.handle_async_request(request)
        except httpx.TransportError as error:
            # A timeout or a reset often carries no message at all; the
            # first run logged "could not be reached: " and nothing after.
            reason = str(error).strip() or type(error).__name__
            raise BoxHostError(
                f"Simeon's cloud computer host at {self.where} could not be "
                f"reached ({request.method} {request.url.path}): {reason}"
            ) from error

    async def aclose(self) -> None:
        await self.inner.aclose()


def docker_client_from_settings(docker_host: str | None = None) -> httpx.AsyncClient:
    docker_host = settings.BOX_DOCKER_HOST if docker_host is None else docker_host
    if not docker_host:
        raise BoxHostUnavailable(
            "CLAIDOR_BOX_HOST_PROVIDER=docker needs CLAIDOR_BOX_DOCKER_HOST."
        )
    base_url, uds = _docker_base_url(docker_host)
    verify: ssl.SSLContext | bool = True
    if settings.BOX_DOCKER_TLS_CERT:
        context = ssl.create_default_context(cafile=settings.BOX_DOCKER_TLS_CA or None)
        context.load_cert_chain(
            settings.BOX_DOCKER_TLS_CERT, settings.BOX_DOCKER_TLS_KEY or None
        )
        verify = context
    transport = _HostReachTransport(
        httpx.AsyncHTTPTransport(uds=uds, verify=verify), docker_host
    )
    return httpx.AsyncClient(
        base_url=base_url, transport=transport, timeout=httpx.Timeout(30.0, read=600.0)
    )


def docker_host_address_from_settings(
    docker_host: str | None = None, address: str | None = None
) -> str:
    address = settings.BOX_HOST_ADDRESS if address is None else address
    if address:
        return address
    parts = urlsplit(settings.BOX_DOCKER_HOST if docker_host is None else docker_host)
    if parts.hostname:
        return parts.hostname
    raise BoxHostUnavailable(
        "CLAIDOR_BOX_HOST_ADDRESS is needed when the Docker daemon is a unix socket: "
        "it is the address the API reaches the box's published ports on."
    )


class DockerBoxHost:
    """The Docker Engine HTTP API, the way the CLI would call it."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        host_address: str,
        bundle: HostBundle | None,
        platform: str = "linux/amd64",
        name: str = "docker",
        max_running: int | None = None,
        accepting: bool = True,
    ) -> None:
        self.client = client
        self.host_address = host_address
        self.bundle = bundle
        self.platform = platform
        self.name = name
        self.max_running = (
            settings.BOX_MAX_RUNNING if max_running is None else max_running
        )
        self.accepting = accepting

    async def _pull(self, image: str) -> None:
        # `repo:tag` → fromImage=repo, tag=tag; `repo@sha256:…` → fromImage as is.
        params: dict[str, str] = {"platform": self.platform}
        last = image.rsplit("/", 1)[-1]
        if "@" not in image and ":" in last:
            repo, tag = image.rsplit(":", 1)
            params["fromImage"], params["tag"] = repo, tag
        else:
            params["fromImage"] = image
        log.info("sand.box.docker.pull", image=image)
        async with self.client.stream(
            "POST", "/images/create", params=params
        ) as response:
            async for _ in response.aiter_bytes():
                pass
            if response.status_code >= 400:
                raise BoxHostError(
                    f"Docker could not pull {image}: {response.status_code}"
                )

    @property
    def expected_host_sha256(self) -> str | None:
        """The host program a box on this host should mount; None when the
        image is trusted to carry its own (no `CLAIDOR_BOX_HOST_BUNDLE_URL`)."""
        return self.bundle.host_sha256 if self.bundle is not None else None

    def bundle_dir(self) -> str:
        assert self.bundle is not None
        return f"{BOX_HOST_BUNDLE_ROOT}/{self.bundle.key}"

    async def _create_container(
        self, name: str, body: dict[str, Any], image: str
    ) -> httpx.Response:
        params = {"name": name, "platform": self.platform}
        response = await self.client.post(
            "/containers/create", params=params, json=body
        )
        if response.status_code == 404:
            await self._pull(image)
            response = await self.client.post(
                "/containers/create", params=params, json=body
            )
        if response.status_code == 409:
            # A container of that name is left from a row that was lost:
            # take it away and create again, the way the Mac replaces one
            # whose host bundle changed.
            await self.client.delete(
                f"/containers/{quote(name)}", params={"force": "true"}
            )
            response = await self.client.post(
                "/containers/create", params=params, json=body
            )
        return response

    async def _install_bundle(self, image: str) -> None:
        """Put the bundle on the box host's own disk, once per folder, so
        boxes can mount it the way the Mac does (below). The Engine API
        cannot write a host path directly, so a helper container that
        binds the folder receives the files and is removed; it is never
        started."""
        assert self.bundle is not None
        folder = self.bundle_dir()
        if (self.name, folder) in _installed_bundle_dirs:
            return
        name = f"simeon-host-bundle-{self.bundle.key}"
        body: dict[str, Any] = {
            "Image": image,
            "Labels": {"com.simeonlabs.box-bundle": "1"},
            "HostConfig": {"Binds": [f"{folder}:/bundle"]},
        }
        response = await self._create_container(name, body, image)
        if response.status_code != 201:
            raise BoxHostError(
                f"Docker could not prepare the host bundle: {response.status_code} {response.text[:300]}"
            )
        helper = str(response.json().get("Id", ""))
        try:
            written = await self.client.put(
                f"/containers/{helper}/archive",
                params={"path": "/bundle"},
                content=self.bundle.disk_archive(),
                headers={"content-type": "application/x-tar"},
            )
            if written.status_code != 200:
                raise BoxHostError(
                    f"Docker refused the host bundle: {written.status_code} {written.text[:200]}"
                )
        finally:
            await self.client.delete(
                f"/containers/{quote(helper)}", params={"force": "true"}
            )
        _installed_bundle_dirs.add((self.name, folder))
        log.info("sand.box.docker.bundle_installed", folder=folder)

    async def create(self, spec: BoxSpec) -> ProvisionedBox:
        exposed: dict[str, dict[str, Any]] = {f"{port}/tcp": {} for port in BOX_PORTS}
        labels: dict[str, str] = {
            OWNER_LABEL: "1",
            f"{OWNER_LABEL}.schema-version": SCHEMA_VERSION,
            f"{OWNER_LABEL}.inference-credential": "1",
            "com.simeonlabs.box": "1",
        }
        binds = [
            f"{spec.workspace_volume}:/workspace",
            f"{spec.data_volume}:/home/box/sand-data",
        ]
        if self.bundle is not None:
            # Exactly the Mac's layout (local-docker-host-connector.ts, the
            # `docker run`): the host program mounted read-only over
            # /home/box/sand-host/host-main.cjs and the exec daemon's folder
            # over /home/box/box-exec-daemon, with the two fingerprints as
            # labels. Until 29 September the files were copied into the
            # container instead, and the image ran its own host: the box
            # answered "unknown gateway method: getSharingState" and asked
            # Simeon Labs' server for CreateGrokBotAgent, neither of which
            # our host does. A read-only mount is what the Mac has always
            # done with this image, and it works there.
            await self._install_bundle(spec.image)
            folder = self.bundle_dir()
            binds += [
                f"{folder}/host-main.cjs:/home/box/sand-host/host-main.cjs:ro",
                f"{folder}/box-exec-daemon:/home/box/box-exec-daemon:ro",
            ]
            labels[f"{OWNER_LABEL}.host-sha256"] = self.bundle.host_sha256
            labels[f"{OWNER_LABEL}.box-exec-daemon-sha256"] = (
                self.bundle.box_exec_daemon_sha256
            )
        body: dict[str, Any] = {
            "Image": spec.image,
            "Env": spec.environment(),
            "Labels": labels,
            "ExposedPorts": exposed,
            "HostConfig": {
                "RestartPolicy": {"Name": "unless-stopped"},
                "Binds": binds,
                "PortBindings": {
                    key: [{"HostIp": "0.0.0.0", "HostPort": ""}] for key in exposed
                },
                **spec.resource_limits(),
            },
        }
        response = await self._create_container(spec.name, body, spec.image)
        if response.status_code != 201:
            raise BoxHostError(
                f"Docker could not create the box: {response.status_code} {response.text[:300]}"
            )
        container_id = str(response.json().get("Id", ""))
        try:
            started = await self.client.post(f"/containers/{container_id}/start")
            if started.status_code not in (204, 304):
                raise BoxHostError(
                    f"Docker could not start the box: {started.status_code} {started.text[:300]}"
                )
            inspected = await self.inspect(container_id)
            if inspected is None:
                raise BoxHostError("Docker lost the box right after starting it.")
        except BaseException:
            # Never leave a half-made box behind: the first run left one
            # Created container per EnsureSandBox, 89 in a few minutes.
            try:
                await self.client.delete(
                    f"/containers/{quote(container_id)}", params={"force": "true"}
                )
            except Exception as error:
                log.warning(
                    "sand.box.docker.cleanup_failed",
                    container=container_id,
                    error=str(error),
                )
            raise
        log.info(
            "sand.box.docker.created", container=container_id, ports=inspected.ports
        )
        return inspected

    async def _json(self, provider_box_id: str) -> dict[str, Any] | None:
        response = await self.client.get(f"/containers/{quote(provider_box_id)}/json")
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise BoxHostError(
                f"Docker could not inspect the box: {response.status_code}"
            )
        value = response.json()
        return value if isinstance(value, dict) else None

    async def inspect(self, provider_box_id: str) -> ProvisionedBox | None:
        value = await self._json(provider_box_id)
        if value is None:
            return None
        ports: dict[int, int] = {}
        bindings = (value.get("NetworkSettings") or {}).get("Ports") or {}
        for key, entries in bindings.items():
            inner = key.split("/", 1)[0]
            if not inner.isdigit() or not entries:
                continue
            host_port = str(entries[0].get("HostPort", ""))
            if host_port.isdigit():
                ports[int(inner)] = int(host_port)
        image_id = (
            (value.get("Image") or "") if isinstance(value.get("Image"), str) else ""
        )
        config = value.get("Config") or {}
        labels = config.get("Labels") or {}
        return ProvisionedBox(
            provider_box_id=str(value.get("Id") or provider_box_id),
            host_address=self.host_address,
            ports=ports,
            image=str(config.get("Image") or ""),
            image_digest=image_id.removeprefix("sha256:") or None,
            host_sha256=str(labels.get(f"{OWNER_LABEL}.host-sha256") or "") or None,
        )

    async def run_state(self, provider_box_id: str) -> BoxRunState | None:
        value = await self._json(provider_box_id)
        if value is None:
            return None
        return (
            "running"
            if (value.get("State") or {}).get("Running") is True
            else "stopped"
        )

    async def start(self, provider_box_id: str) -> None:
        response = await self.client.post(f"/containers/{quote(provider_box_id)}/start")
        if response.status_code not in (204, 304):
            raise BoxHostError(
                f"Docker could not start the box: {response.status_code} {response.text[:200]}"
            )

    async def stop(self, provider_box_id: str) -> None:
        response = await self.client.post(f"/containers/{quote(provider_box_id)}/stop")
        if response.status_code not in (204, 304, 404):
            raise BoxHostError(f"Docker could not stop the box: {response.status_code}")

    async def remove(self, provider_box_id: str, *, volumes: list[str]) -> None:
        response = await self.client.delete(
            f"/containers/{quote(provider_box_id)}", params={"force": "true"}
        )
        if response.status_code not in (204, 404):
            raise BoxHostError(
                f"Docker could not remove the box: {response.status_code}"
            )
        for volume in volumes:
            deleted = await self.client.delete(
                f"/volumes/{quote(volume)}", params={"force": "true"}
            )
            if deleted.status_code not in (204, 404):
                raise BoxHostError(
                    f"Docker could not remove volume {volume}: {deleted.status_code}"
                )


# --- e2b ----------------------------------------------------------------------


class E2BBoxHost:
    """Not built. `e2b` is not in the lockfile, and E2B's hostnames do
    not fit the app's tunnel rule; see the module docstring."""

    name = "e2b"
    max_running = 0
    accepting = True

    def _refuse(self) -> BoxHostUnavailable:
        return BoxHostUnavailable(
            "Simeon's cloud computer on E2B is not built yet (the e2b package is not "
            "installed); set CLAIDOR_BOX_HOST_PROVIDER=docker with a Docker daemon."
        )

    async def create(self, spec: BoxSpec) -> ProvisionedBox:
        raise self._refuse()

    async def inspect(self, provider_box_id: str) -> ProvisionedBox | None:
        raise self._refuse()

    async def run_state(self, provider_box_id: str) -> BoxRunState | None:
        raise self._refuse()

    async def start(self, provider_box_id: str) -> None:
        raise self._refuse()

    async def stop(self, provider_box_id: str) -> None:
        raise self._refuse()

    async def remove(self, provider_box_id: str, *, volumes: list[str]) -> None:
        raise self._refuse()


# --- choosing one --------------------------------------------------------------

_bundle_cache: dict[str, HostBundle] = {}
_host_override: list[BoxHost] | None = None
#: The configured servers, built once per process per configuration.
_fleet_cache: tuple[str, list[BoxHost]] | None = None


def set_box_host_for_tests(host: BoxHost | list[BoxHost] | None) -> None:
    global _host_override
    _host_override = (
        None if host is None else host if isinstance(host, list) else [host]
    )


#: Grok Bot's publish layout (`host-bundle-source.ts`): a pointer file holding
#: a commit id, and one tarball per commit id beside it.
LATEST_VERSION_FILE = "sand-host-bundle-latest.version"
HOST_BUNDLE_PREFIX = "sand-host-bundle"
_VERSION_PATTERN = re.compile(r"^[0-9a-f]{7,40}$")
#: How long a read pointer is trusted: Grok Bot's `VERSION_CACHE_TTL_MS`.
BUNDLE_POINTER_TTL = timedelta(minutes=10)
_pointer_cache: dict[str, tuple[str, datetime]] = {}


def _bundle_http() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=120.0, follow_redirects=True)


_bundle_http_factory: Callable[[], httpx.AsyncClient] = _bundle_http


def set_bundle_http_for_tests(factory: Callable[[], httpx.AsyncClient] | None) -> None:
    global _bundle_http_factory
    _bundle_http_factory = factory or _bundle_http
    _pointer_cache.clear()
    _bundle_cache.clear()


def is_bundle_channel(url: str) -> bool:
    """A folder in Grok Bot's layout, as opposed to one fixed tar file."""
    path = urlsplit(url).path
    return not path.endswith((".tgz", ".tar", ".tar.gz"))


async def _fetch_bundle(url: str) -> HostBundle:
    cached = _bundle_cache.get(url)
    if cached is not None:
        return cached
    async with _bundle_http_factory() as client:
        response = await client.get(url)
    if response.status_code != 200:
        raise BoxHostError(f"The host bundle at {url} answered {response.status_code}.")
    bundle = HostBundle.from_tar(response.content)
    # Each version published stays cached; three are plenty (about 4 MB each).
    while len(_bundle_cache) >= 3:
        _bundle_cache.pop(next(iter(_bundle_cache)))
    _bundle_cache[url] = bundle
    return bundle


async def _current_version(base: str) -> str:
    """The commit id the channel's pointer names, read at most every
    `BUNDLE_POINTER_TTL`. A pointer that cannot be read keeps the last one
    read, so a moment of S3 trouble never takes the cloud computers down."""
    now = datetime.now(UTC)
    cached = _pointer_cache.get(base)
    if cached is not None and now - cached[1] < BUNDLE_POINTER_TTL:
        return cached[0]
    try:
        async with _bundle_http_factory() as client:
            response = await client.get(f"{base}/{LATEST_VERSION_FILE}")
        if response.status_code != 200:
            raise BoxHostError(
                f"The host bundle pointer at {base} answered {response.status_code}."
            )
        version = response.text.strip()
        if not _VERSION_PATTERN.match(version):
            raise BoxHostError(
                f"The host bundle pointer at {base} names {version[:40]!r}, "
                "not a commit id."
            )
    except (BoxHostError, httpx.HTTPError) as error:
        if cached is None:
            raise BoxHostError(str(error) or type(error).__name__) from error
        log.warning("sand.box.bundle.pointer_unread", base=base, error=str(error))
        _pointer_cache[base] = (cached[0], now)
        return cached[0]
    if cached is None or cached[0] != version:
        log.info("sand.box.bundle.version", base=base, version=version)
    _pointer_cache[base] = (version, now)
    return version


async def load_host_bundle(url: str) -> HostBundle | None:
    """The host bundle the cloud computers mount. `url` is either one tar
    file (read once per process) or a folder in Grok Bot's layout, whose
    pointer is followed: a new version published there reaches the server
    within `BUNDLE_POINTER_TTL`, with no restart, and each box moves to it
    when it is next idle (`box_service.ensure`)."""
    if not url:
        return None
    if not is_bundle_channel(url):
        return await _fetch_bundle(url)
    base = url.rstrip("/")
    version = await _current_version(base)
    return await _fetch_bundle(f"{base}/{HOST_BUNDLE_PREFIX}-{version}.tgz")


@dataclass(frozen=True)
class BoxHostEntry:
    """One box server in `CLAIDOR_BOX_HOSTS`."""

    name: str
    docker_host: str
    address: str = ""
    max_running: int | None = None
    accepting: bool = True


def box_host_entries() -> list[BoxHostEntry]:
    """The configured servers: `CLAIDOR_BOX_HOSTS`, or the one server of
    `CLAIDOR_BOX_DOCKER_HOST` named "docker" (the name the boxes made
    before 29 September carry)."""
    raw = settings.BOX_HOSTS.strip()
    if not raw:
        return [
            BoxHostEntry(
                name="docker",
                docker_host=settings.BOX_DOCKER_HOST,
                address=settings.BOX_HOST_ADDRESS,
            )
        ]
    try:
        items = json.loads(raw)
    except ValueError as error:
        raise BoxHostUnavailable(f"CLAIDOR_BOX_HOSTS is not JSON: {error}")
    if not isinstance(items, list) or not items:
        raise BoxHostUnavailable("CLAIDOR_BOX_HOSTS must be a non-empty JSON list.")
    entries: list[BoxHostEntry] = []
    for item in items:
        if not isinstance(item, dict):
            raise BoxHostUnavailable("Each CLAIDOR_BOX_HOSTS entry must be an object.")
        name = str(item.get("name") or "").strip()
        docker_host = str(item.get("docker_host") or "").strip()
        if not name or not docker_host:
            raise BoxHostUnavailable(
                "Each CLAIDOR_BOX_HOSTS entry needs a name and a docker_host."
            )
        max_running = item.get("max_running")
        entries.append(
            BoxHostEntry(
                name=name,
                docker_host=docker_host,
                address=str(item.get("address") or "").strip(),
                max_running=int(max_running) if max_running is not None else None,
                accepting=item.get("accepting", True) is not False,
            )
        )
    names = [entry.name for entry in entries]
    if len(set(names)) != len(names):
        raise BoxHostUnavailable("CLAIDOR_BOX_HOSTS names must be unique.")
    return entries


async def resolve_box_hosts() -> list[BoxHost]:
    """Every configured server, or `BoxHostUnavailable` with the sentence the
    app shows. Built once per process for a given configuration (settings
    change only with a restart), so each server keeps one connection pool."""
    global _fleet_cache
    if _host_override is not None:
        return _host_override
    provider = settings.BOX_HOST_PROVIDER.strip().lower()
    if provider == "e2b":
        return [E2BBoxHost()]
    if provider != "docker":
        raise BoxHostUnavailable(BOX_HOST_UNAVAILABLE_SENTENCE)
    bundle = await load_host_bundle(settings.BOX_HOST_BUNDLE_URL)
    entries = box_host_entries()
    key = json.dumps(
        [dataclasses.asdict(entry) for entry in entries]
        + [bundle.key if bundle is not None else ""]
    )
    if _fleet_cache is not None and _fleet_cache[0] == key:
        return _fleet_cache[1]
    fleet: list[BoxHost] = [
        DockerBoxHost(
            docker_client_from_settings(entry.docker_host),
            host_address=docker_host_address_from_settings(
                entry.docker_host, entry.address
            ),
            bundle=bundle,
            name=entry.name,
            max_running=entry.max_running,
            accepting=entry.accepting,
        )
        for entry in entries
    ]
    _fleet_cache = (key, fleet)
    return fleet


async def find_box_host(name: str) -> BoxHost | None:
    """The server a box was made on, by the name stored with it; None when
    that server is no longer configured."""
    for host in await resolve_box_hosts():
        if host.name == name:
            return host
    return None


def box_image_reference() -> str:
    digest = settings.BOX_IMAGE_DIGEST.strip().lower().removeprefix("sha256:")
    if len(digest) == 64 and all(c in "0123456789abcdef" for c in digest):
        return f"{settings.BOX_IMAGE.split('@', 1)[0]}@sha256:{digest}"
    return settings.BOX_IMAGE
