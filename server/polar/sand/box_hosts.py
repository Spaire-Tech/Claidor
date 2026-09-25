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

import io
import ssl
import tarfile
from dataclasses import dataclass, field
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
            "SAND_TREE_SITTER_NODE_DEPS": "/home/box/deps",
            "NODE_PATH": "/home/box/deps",
            "SAND_GATEWAY_BIND_HOST": "0.0.0.0",
            "SAND_HOST_PORT": str(GATEWAY_PORT),
            "SAND_GATEWAY_TOKEN": self.gateway_token,
            "SAND_BACKEND_URL": self.backend_url,
            "SAND_INFERENCE_RENEWAL_CREDENTIAL": self.renewal_credential,
            "SAND_INFERENCE_PROVIDER": "claidor",
            "CAISRA_CLAUDE_CODE": "0",
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


class BoxHost(Protocol):
    name: str

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


def docker_client_from_settings() -> httpx.AsyncClient:
    if not settings.BOX_DOCKER_HOST:
        raise BoxHostUnavailable(
            "CLAIDOR_BOX_HOST_PROVIDER=docker needs CLAIDOR_BOX_DOCKER_HOST."
        )
    base_url, uds = _docker_base_url(settings.BOX_DOCKER_HOST)
    verify: ssl.SSLContext | bool = True
    if settings.BOX_DOCKER_TLS_CERT:
        context = ssl.create_default_context(cafile=settings.BOX_DOCKER_TLS_CA or None)
        context.load_cert_chain(
            settings.BOX_DOCKER_TLS_CERT, settings.BOX_DOCKER_TLS_KEY or None
        )
        verify = context
    transport = httpx.AsyncHTTPTransport(uds=uds, verify=verify)
    return httpx.AsyncClient(
        base_url=base_url, transport=transport, timeout=httpx.Timeout(30.0, read=600.0)
    )


def docker_host_address_from_settings() -> str:
    if settings.BOX_HOST_ADDRESS:
        return settings.BOX_HOST_ADDRESS
    parts = urlsplit(settings.BOX_DOCKER_HOST)
    if parts.hostname:
        return parts.hostname
    raise BoxHostUnavailable(
        "CLAIDOR_BOX_HOST_ADDRESS is needed when the Docker daemon is a unix socket: "
        "it is the address the API reaches the box's published ports on."
    )


class DockerBoxHost:
    """The Docker Engine HTTP API, the way the CLI would call it."""

    name = "docker"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        host_address: str,
        bundle: HostBundle | None,
        platform: str = "linux/amd64",
    ) -> None:
        self.client = client
        self.host_address = host_address
        self.bundle = bundle
        self.platform = platform

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

    async def create(self, spec: BoxSpec) -> ProvisionedBox:
        exposed: dict[str, dict[str, Any]] = {f"{port}/tcp": {} for port in BOX_PORTS}
        body: dict[str, Any] = {
            "Image": spec.image,
            "Env": spec.environment(),
            "Labels": {
                OWNER_LABEL: "1",
                f"{OWNER_LABEL}.schema-version": SCHEMA_VERSION,
                f"{OWNER_LABEL}.inference-credential": "1",
                "com.simeonlabs.box": "1",
            },
            "ExposedPorts": exposed,
            "HostConfig": {
                "RestartPolicy": {"Name": "unless-stopped"},
                "Binds": [
                    f"{spec.workspace_volume}:/workspace",
                    f"{spec.data_volume}:/home/box/sand-data",
                ],
                "PortBindings": {
                    key: [{"HostIp": "0.0.0.0", "HostPort": ""}] for key in exposed
                },
            },
        }
        params = {"name": spec.name, "platform": self.platform}
        response = await self.client.post(
            "/containers/create", params=params, json=body
        )
        if response.status_code == 404:
            await self._pull(spec.image)
            response = await self.client.post(
                "/containers/create", params=params, json=body
            )
        if response.status_code == 409:
            # A container of that name is left from a row that was lost:
            # take it away and create again, the way the Mac replaces one
            # whose host bundle changed.
            await self.client.delete(
                f"/containers/{quote(spec.name)}", params={"force": "true"}
            )
            response = await self.client.post(
                "/containers/create", params=params, json=body
            )
        if response.status_code != 201:
            raise BoxHostError(
                f"Docker could not create the box: {response.status_code} {response.text[:300]}"
            )
        container_id = str(response.json().get("Id", ""))
        if self.bundle is not None:
            await self._upload_bundle(container_id)
        started = await self.client.post(f"/containers/{container_id}/start")
        if started.status_code not in (204, 304):
            raise BoxHostError(
                f"Docker could not start the box: {started.status_code} {started.text[:300]}"
            )
        inspected = await self.inspect(container_id)
        if inspected is None:
            raise BoxHostError("Docker lost the box right after starting it.")
        log.info(
            "sand.box.docker.created", container=container_id, ports=inspected.ports
        )
        return inspected

    async def _upload_bundle(self, container_id: str) -> None:
        assert self.bundle is not None
        for path, name, data in (
            ("/home/box/sand-host", "host-main.cjs", self.bundle.host_main),
            ("/home/box/box-exec-daemon", "main.cjs", self.bundle.box_exec_daemon),
        ):
            response = await self.client.put(
                f"/containers/{container_id}/archive",
                params={"path": path},
                content=HostBundle.single_file_tar(name, data),
                headers={"content-type": "application/x-tar"},
            )
            if response.status_code != 200:
                raise BoxHostError(
                    f"Docker refused the host bundle at {path}: {response.status_code} {response.text[:200]}"
                )

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
        return ProvisionedBox(
            provider_box_id=str(value.get("Id") or provider_box_id),
            host_address=self.host_address,
            ports=ports,
            image=str(config.get("Image") or ""),
            image_digest=image_id.removeprefix("sha256:") or None,
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
_host_override: BoxHost | None = None


def set_box_host_for_tests(host: BoxHost | None) -> None:
    global _host_override
    _host_override = host


async def load_host_bundle(url: str) -> HostBundle | None:
    if not url:
        return None
    cached = _bundle_cache.get(url)
    if cached is not None:
        return cached
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        response = await client.get(url)
    if response.status_code != 200:
        raise BoxHostError(
            f"The host bundle at CLAIDOR_BOX_HOST_BUNDLE_URL answered {response.status_code}."
        )
    bundle = HostBundle.from_tar(response.content)
    _bundle_cache[url] = bundle
    return bundle


async def resolve_box_host() -> BoxHost:
    """The configured host, or `BoxHostUnavailable` with the sentence the
    app shows. Read on every call so a setting change on Render takes
    effect at the next EnsureSandBox."""
    if _host_override is not None:
        return _host_override
    provider = settings.BOX_HOST_PROVIDER.strip().lower()
    if provider == "docker":
        return DockerBoxHost(
            docker_client_from_settings(),
            host_address=docker_host_address_from_settings(),
            bundle=await load_host_bundle(settings.BOX_HOST_BUNDLE_URL),
        )
    if provider == "e2b":
        return E2BBoxHost()
    raise BoxHostUnavailable(BOX_HOST_UNAVAILABLE_SENTENCE)


def box_image_reference() -> str:
    digest = settings.BOX_IMAGE_DIGEST.strip().lower().removeprefix("sha256:")
    if len(digest) == 64 and all(c in "0123456789abcdef" for c in digest):
        return f"{settings.BOX_IMAGE.split('@', 1)[0]}@sha256:{digest}"
    return settings.BOX_IMAGE
