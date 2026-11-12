"""Simeon's cloud computer on Azure Container Apps Sandboxes (12 November 2026).

Each box is an Azure sandbox: a small virtual machine made from a disk image
built from box2's image (`box/azure/`), frozen whole when it sleeps ("Memory"
mode: memory, open tabs and running programs kept) and back in a second or
two when it wakes. It is the same design as E2B (`box_e2b.py`), on
Microsoft's service, paid from the founder's Azure credits
(docs/ops/box-host/azure-plan.md).

The server speaks Azure's data-plane REST API itself (`API_VERSION`) over
httpx, with Microsoft's client-credentials sign-in, so there is no beta SDK
and no new library. The public Python SDK still speaks an older version of
the API and cannot make a sandbox with auto-suspend off; the reference this
follows, compiled from the specification, the SDKs and the open issues, is
in the plan.

The `BoxHost` calls map onto Azure's as follows:

- `create`: `POST …/sandboxes` from the disk image, 2 cores, 4 GiB and
  40 GiB (Azure's size "L", our size on E2B), auto-suspend off (the
  sleeper decides when a box sleeps), each port locked to the server's own
  identity (below). The image's first process (`simeon-vm-init`) waits;
  the server writes the person's settings, the machine id, fresh
  randomness and the engine, binds a folder of the disk over /tmp, then
  writes `READY_FILE`, and the box starts as on E2B (`start-simeon-vm`).
  The settings are on the disk, so a box restarted fresh starts again.
- `stop`: `POST …/stop`, a snapshot of the whole VM. `start`: `POST
  …/resume`, then the state is read until it is `Running`, and the guest's
  clock is set. A box that does not wake within `RESUME_DEADLINE_S` (an
  open Azure bug, #1869, leaves some resumes hanging for hours) is removed
  and the person gets a new one from their backup at the app's next try
  (`sand.box.azure.resume_failed`).
- `run_state`, `inspect`: `GET` the sandbox. `remove`: `DELETE`.

The ports: Azure has no traffic token like E2B's. Each port asks for a
Microsoft sign-in and admits only the server's own identity
(`SIMEON_AZURE_SERVER_OBJECT_ID`): the API's proxy and checks send
`Authorization: Bearer <token>` (`dial_headers`), and Azure's proxy removes
it before the request reaches the box, so the gateway's own password goes in
`x-simeon-box-authorization` (`box_service.with_dial`).
"""

from __future__ import annotations

import asyncio
import re
import secrets
import time
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from urllib.parse import quote

import httpx
import structlog

from simeon.config import settings

from . import box_store
from .box_e2b import (
    ENGINE_NEXT_SUFFIX,
    ENGINE_UPDATE_SCRIPT,
    ENGINE_UPDATE_TIMEOUT_S,
    EXEC_DAEMON_MAIN,
    HOST_DIR,
    HOST_MAIN,
    TMP_ON_DISK,
    engine_update_script,
    env_file,
    machine_id_of,
)
from .box_hosts import (
    BOX_PORTS,
    HOST_COMPANIONS,
    BoxBlocked,
    BoxHostError,
    BoxHostUnavailable,
    BoxRunState,
    BoxSpec,
    HostBundle,
    ProvisionedBox,
)

log = structlog.get_logger()

KIND = "azure"
#: The data plane's version (the specification's, which the .NET SDK and
#: the `aca` command line also speak).
API_VERSION = "2026-09-01-preview"
#: The data plane's sign-in audience; the second is the one the older SDKs
#: ask for, tried once if Microsoft refuses the first.
DATA_SCOPES = (
    "https://management.azuredevcompute.io/.default",
    "https://dynamicsessions.io/.default",
)
#: The audience of the token a locked port wants.
PORT_SCOPE = "https://auth.adcproxy.io/.default"
LOGIN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"

#: The box's name (`simeon-box-<hex>`), as a label, so a box can be found.
NAME_LABEL = "simeon_box"
#: The disk image a box was made from (its name: `image_reference` without
#: the kind), and the engine's fingerprint in two halves.
DISK_IMAGE_LABEL = "disk_image"
HOST_SHA_LABELS = ("host_sha256_a", "host_sha256_b")
#: Azure's labels follow Kubernetes' rule: at most 63 characters, letters,
#: digits, "-", "_" and ".", a letter or digit at each end. The first boxes
#: made on Azure (12 November 2026) were all refused, 400 InvalidRequest:
#: their labels carried the image as "azure:<name>" (a colon) and the
#: engine's 64-character fingerprint whole.
LABEL_MAX = 63
_LABEL_VALUE = re.compile(r"^(?:[A-Za-z0-9](?:[A-Za-z0-9._-]{0,61}[A-Za-z0-9])?)?$")
#: Azure's size "L": what a computer has on E2B today.
RESOURCES = {"cpu": "2000m", "memory": "4096Mi", "disk": "40Gi"}

#: The image's first process (`box/azure/simeon-vm-init`), named at create
#: as well, since a disk image can come without its image's entrypoint.
VM_INIT = "/usr/local/bin/simeon-vm-init"
#: Where the server writes what `simeon-vm-init` waits for: on the disk,
#: not in /run, so a box restarted fresh finds it again.
STATE_DIR = "/var/lib/simeon"
ENV_FILE = f"{STATE_DIR}/box.env"
SEED_FILE = f"{STATE_DIR}/seed"
#: Written last: everything the box needs is in place.
READY_FILE = f"{STATE_DIR}/ready"

#: How long a wake may take before the box is taken as lost (#1869).
RESUME_DEADLINE_S = 120.0
#: How long after a resume, with the box still asleep, it is asked again.
RESUME_ASK_AGAIN_S = 10.0
#: How long a freeze, or a new box, may take to settle.
SETTLE_DEADLINE_S = 180.0
POLL_S = 1.0
#: One call to the data plane; a resume that never answers gives up here
#: and is tried again until `RESUME_DEADLINE_S`.
CALL_TIMEOUT_S = 30.0
#: A command run on the box (`executeShellCommand` answers when it ends).
EXEC_TIMEOUT_S = 60.0

#: States in which a box is, or is about to be, awake.
AWAKE_STATES = {"running", "creating", "resuming"}
#: States in which the box is gone or going.
GONE_STATES = {"deleting", "failed"}

#: Unix modes, sent as decimal numbers (Azure reads `mode` as decimal, #1820).
MODE_FILE = 0o644
MODE_PRIVATE = 0o600
MODE_SCRIPT = 0o755


# --- Microsoft's sign-in ---------------------------------------------------------


@dataclass
class _Token:
    value: str
    expires_at: float


class AzureCredential:
    """The server's own identity (a service principal), signing in to
    Microsoft with client credentials. Tokens are kept until five minutes
    before they end, one per audience."""

    def __init__(
        self,
        *,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.tenant_id = tenant_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.transport = transport
        self._tokens: dict[str, _Token] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    @property
    def configured(self) -> bool:
        return bool(self.tenant_id and self.client_id and self.client_secret)

    async def token(self, scope: str) -> str:
        cached = self._tokens.get(scope)
        if cached is not None and cached.expires_at - 300 > time.time():
            return cached.value
        lock = self._locks.setdefault(scope, asyncio.Lock())
        async with lock:
            cached = self._tokens.get(scope)
            if cached is not None and cached.expires_at - 300 > time.time():
                return cached.value
            fresh = await self._request(scope)
            self._tokens[scope] = fresh
            return fresh.value

    async def _request(self, scope: str) -> _Token:
        if not self.configured:
            raise BoxHostUnavailable(
                "Simeon's cloud computer on Azure needs the server's identity; "
                "set SIMEON_AZURE_TENANT_ID, SIMEON_AZURE_CLIENT_ID and "
                "SIMEON_AZURE_CLIENT_SECRET on Render."
            )
        try:
            async with httpx.AsyncClient(
                transport=self.transport, timeout=CALL_TIMEOUT_S
            ) as client:
                response = await client.post(
                    LOGIN_URL.format(tenant=quote(self.tenant_id, safe="")),
                    data={
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "grant_type": "client_credentials",
                        "scope": scope,
                    },
                )
        except httpx.HTTPError as error:
            raise BoxHostError(
                f"Simeon's cloud computer on Azure could not sign in: {error}"
            ) from error
        if response.status_code != 200:
            # Microsoft's own words (`error`, `error_description`), never
            # the secret.
            try:
                body = response.json()
            except ValueError:
                body = {}
            code = str(body.get("error") or response.status_code)
            log.warning(
                "sand.box.azure.sign_in_refused",
                status=response.status_code,
                code=code,
                scope=scope,
            )
            raise BoxHostUnavailable(
                f"Microsoft refused Simeon's sign-in ({code}); check "
                "SIMEON_AZURE_TENANT_ID, SIMEON_AZURE_CLIENT_ID and "
                "SIMEON_AZURE_CLIENT_SECRET on Render."
            )
        body = response.json()
        return _Token(
            value=str(body["access_token"]),
            expires_at=time.time() + float(body.get("expires_in") or 3599),
        )


_credential: AzureCredential | None = None
_credential_key: tuple[str, str, str] | None = None


def credential() -> AzureCredential:
    """The one credential the process signs in with, from the settings."""
    global _credential, _credential_key
    key = (
        settings.AZURE_TENANT_ID,
        settings.AZURE_CLIENT_ID,
        settings.AZURE_CLIENT_SECRET,
    )
    if _credential is None or _credential_key != key:
        _credential = AzureCredential(
            tenant_id=key[0], client_id=key[1], client_secret=key[2]
        )
        _credential_key = key
    return _credential


def set_credential_for_tests(value: AzureCredential | None) -> None:
    global _credential, _credential_key
    _credential = value
    _credential_key = (
        None
        if value is None
        else (
            settings.AZURE_TENANT_ID,
            settings.AZURE_CLIENT_ID,
            settings.AZURE_CLIENT_SECRET,
        )
    )


async def port_headers() -> dict[str, str]:
    """What a request to an Azure box's port goes with: the server's token
    for Azure's port sign-in (`box_service.dial_headers`)."""
    return {"authorization": f"Bearer {await credential().token(PORT_SCOPE)}"}


# --- errors ----------------------------------------------------------------------


def _said(response: httpx.Response) -> tuple[str, str]:
    """An error's code and sentence, in either shape Azure answers with:
    the specification's `{"error": {"code", "message"}}`, or what the
    service sends today, `{"title", "detail", "errorCode"}`."""
    try:
        body = response.json()
    except ValueError:
        return str(response.status_code), response.text[:300]
    if not isinstance(body, dict):
        return str(response.status_code), str(body)[:300]
    error = body.get("error")
    inner: dict[str, Any] = error if isinstance(error, dict) else {}
    code = inner.get("code") or body.get("title") or body.get("code")
    message = inner.get("message") or body.get("detail") or body.get("message")
    return str(code or response.status_code), str(message or "")[:300]


def _capacity_hold() -> BoxBlocked:
    from .box_service import (
        CAPACITY_BLOCK_DETAIL,
        CAPACITY_BLOCK_REASON,
        CAPACITY_BLOCK_TITLE,
        CAPACITY_RETRY_AFTER_S,
    )

    return BoxBlocked(
        CAPACITY_BLOCK_REASON,
        title=CAPACITY_BLOCK_TITLE,
        detail=CAPACITY_BLOCK_DETAIL,
        retry_after_s=CAPACITY_RETRY_AFTER_S,
    )


def _host_error(action: str, response: httpx.Response) -> BoxHostError:
    code, message = _said(response)
    words = f"{code} {message}".lower()
    if response.status_code == 429 or "quota" in words or "cores" in words:
        # Azure's own limits (cores awake at once, calls a minute): the
        # app's "computers all in use" hold, never an error.
        log.warning(
            "sand.box.azure.full",
            action=action,
            status=response.status_code,
            code=code,
        )
        return _capacity_hold()
    if response.status_code == 401:
        return BoxHostUnavailable(
            "Azure refused Simeon's sign-in; check SIMEON_AZURE_CLIENT_ID and "
            "SIMEON_AZURE_CLIENT_SECRET on Render."
        )
    if response.status_code == 403:
        return BoxHostUnavailable(
            "Azure refused Simeon's identity: it needs the role \"Container "
            'Apps SandboxGroup Data Owner" on the sandbox group (a new role '
            "takes a minute or two to apply)."
        )
    detail = f"{code}: {message}" if message else code
    return BoxHostError(
        f"Simeon's cloud computer on Azure could not {action}: "
        f"{response.status_code} {detail}"
    )


class _NoAnswer(BoxHostError):
    """Azure did not answer a call at all (a timeout or a lost connection),
    which a wake waits out (`AzureBoxHost.start`)."""


def label_value(value: str) -> str:
    """A value as Azure takes it in a label (`LABEL_MAX`): what it may not
    hold made "-", cut to 63 characters, a letter or digit at each end."""
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "-", value)[:LABEL_MAX]
    return cleaned.strip("._-")


def is_label_value(value: str) -> bool:
    """Whether Azure takes `value` as a label's value."""
    return bool(_LABEL_VALUE.match(value))


def split_sha(sha: str) -> dict[str, str]:
    """The engine's fingerprint (64 characters) as two labels of 32."""
    half = len(sha) // 2
    return {HOST_SHA_LABELS[0]: sha[:half], HOST_SHA_LABELS[1]: sha[half:]}


def joined_sha(labels: Mapping[str, Any]) -> str | None:
    """The fingerprint from its two labels, when both are there."""
    first, second = (labels.get(key) for key in HOST_SHA_LABELS)
    return f"{first}{second}" if first and second else None


def _state_of(sandbox: Mapping[str, Any]) -> str:
    return str(sandbox.get("state") or "").strip().lower()


# --- the host --------------------------------------------------------------------


class AzureBoxHost:
    """Boxes as Azure sandboxes. `transport` is httpx's, replaced by a
    stand-in Azure in tests."""

    #: The box's files live on the VM's own disk: replacing a box needs its
    #: backup brought up to date first, even when it sleeps (as on E2B).
    keeps_files = False

    def __init__(
        self,
        *,
        name: str = "azure",
        disk_image: str = "",
        bundle: HostBundle | None,
        max_running: int | None = None,
        accepting: bool = True,
        users: tuple[str, ...] = (),
        idle_after: timedelta | None = None,
        subscription_id: str | None = None,
        resource_group: str | None = None,
        sandbox_group: str | None = None,
        region: str | None = None,
        tenant_id: str | None = None,
        server_object_id: str | None = None,
        signer: AzureCredential | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        pause: Any = asyncio.sleep,
        clock: Any = time.monotonic,
    ) -> None:
        self.name = name
        self.disk_image = disk_image or settings.AZURE_DISK_IMAGE
        self.bundle = bundle
        # No limit of our own unless the entry names one (the founder, 12
        # November 2026: "i dont wanna put ceilings"): Azure's own limits
        # show as the capacity hold (`_host_error`).
        self.max_running = 0 if max_running is None else max_running
        self.accepting = accepting
        self.users = users
        self.idle_after = idle_after
        self.subscription_id = subscription_id or settings.AZURE_SUBSCRIPTION_ID
        self.resource_group = resource_group or settings.AZURE_RESOURCE_GROUP
        self.sandbox_group = sandbox_group or settings.AZURE_SANDBOX_GROUP
        self.region = (region or settings.AZURE_REGION).strip().lower()
        self.tenant_id = tenant_id or settings.AZURE_TENANT_ID
        self.server_object_id = server_object_id or settings.AZURE_SERVER_OBJECT_ID
        self._signer = signer
        self.transport = transport
        self._pause = pause
        self._clock = clock
        self._scope = DATA_SCOPES[0]
        self._disk_image_id: str | None = None

    # --- what the broker compares ------------------------------------------------

    @property
    def image_reference(self) -> str:
        """What a box here runs, compared with what `inspect` reads back, so
        a new disk image replaces boxes as a new image does on Docker."""
        return f"{KIND}:{self.disk_image}"

    @property
    def expected_host_sha256(self) -> str | None:
        return self.bundle.folder_sha256 if self.bundle is not None else None

    @property
    def proxy_domain(self) -> str:
        """Where each port answers: `https://<id>--<port>.<this>`."""
        return f"{self.region}.adcproxy.io"

    # --- the data plane ------------------------------------------------------------

    def _signer_now(self) -> AzureCredential:
        return self._signer or credential()

    def _group_url(self, path: str = "") -> str:
        if not (self.subscription_id and self.region):
            raise BoxHostUnavailable(
                "Simeon's cloud computer on Azure needs its sandbox group; set "
                "SIMEON_AZURE_SUBSCRIPTION_ID (and SIMEON_AZURE_REGION) on Render."
            )
        return (
            f"https://management.{self.region}.azuredevcompute.io"
            f"/subscriptions/{self.subscription_id}"
            f"/resourceGroups/{self.resource_group}"
            f"/sandboxGroups/{self.sandbox_group}{path}"
        )

    async def _call(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        content: bytes | None = None,
        params: Mapping[str, str] | None = None,
        timeout: float = CALL_TIMEOUT_S,
        action: str,
    ) -> httpx.Response:
        """One call to the sandbox group's data plane, signed; a 401 asks
        once more with the older audience (`DATA_SCOPES`)."""
        query = {"api-version": API_VERSION, **(params or {})}
        headers = {"accept": "application/json"}
        if content is not None:
            headers["content-type"] = "application/octet-stream"
        for attempt in range(2):
            token = await self._signer_now().token(self._scope)
            try:
                async with httpx.AsyncClient(
                    transport=self.transport, timeout=timeout
                ) as client:
                    response = await client.request(
                        method,
                        self._group_url(path),
                        params=query,
                        json=json,
                        content=content,
                        headers={**headers, "authorization": f"Bearer {token}"},
                    )
            except httpx.HTTPError as error:
                raise _NoAnswer(
                    f"Simeon's cloud computer on Azure could not {action}: "
                    f"{type(error).__name__}"
                ) from error
            if (
                response.status_code == 401
                and attempt == 0
                and self._scope == DATA_SCOPES[0]
            ):
                self._scope = DATA_SCOPES[1]
                log.info("sand.box.azure.older_audience", action=action)
                continue
            return response
        return response

    async def _get(self, sandbox_id: str) -> dict[str, Any] | None:
        response = await self._call(
            "GET",
            f"/sandboxes/{quote(sandbox_id, safe='')}",
            action="read the computer",
        )
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise _host_error("read the computer", response)
        body = response.json()
        return body if isinstance(body, dict) else {}

    async def _exec(
        self, sandbox_id: str, command: str, *, timeout: float = EXEC_TIMEOUT_S
    ) -> tuple[int, str]:
        """A command run as root on the box, answered when it ends: its exit
        code and what it printed."""
        response = await self._call(
            "POST",
            f"/sandboxes/{quote(sandbox_id, safe='')}/executeShellCommand",
            json={"command": command, "shell": "/bin/bash", "user": "root"},
            timeout=timeout + 15,
            action="run a command on the computer",
        )
        if response.status_code != 200:
            raise _host_error("run a command on the computer", response)
        body = response.json()
        return int(body.get("exitCode") or 0), str(body.get("stdout") or "")

    async def _write(
        self, sandbox_id: str, path: str, data: bytes | str, *, mode: int = MODE_FILE
    ) -> None:
        raw = data.encode() if isinstance(data, str) else data
        response = await self._call(
            "POST",
            f"/sandboxes/{quote(sandbox_id, safe='')}/files",
            params={"path": path, "createDirs": "true", "mode": str(mode)},
            content=raw,
            timeout=120,
            action="write a file on the computer",
        )
        if response.status_code not in (200, 201):
            raise _host_error("write a file on the computer", response)

    async def _resolve_disk_image(self) -> str:
        """The disk image's id: `SIMEON_AZURE_DISK_IMAGE` is its id or its
        name (`box/azure/build.sh` prints both)."""
        if self._disk_image_id:
            return self._disk_image_id
        wanted = self.disk_image
        response = await self._call(
            "GET",
            f"/diskimages/{quote(wanted, safe='')}",
            action="find the computer's disk image",
        )
        if response.status_code == 200:
            self._disk_image_id = str(response.json().get("id") or wanted)
            return self._disk_image_id
        if response.status_code not in (400, 404):
            # 400 or 404: not an id; looked for by name below.
            raise _host_error("find the computer's disk image", response)
        params: dict[str, str] = {}
        while True:
            listed = await self._call(
                "GET",
                "/diskimages",
                params=params,
                action="find the computer's disk image",
            )
            if listed.status_code != 200:
                raise _host_error("find the computer's disk image", listed)
            body = listed.json()
            for image in body.get("value") or []:
                if image.get("name") == wanted and image.get("id"):
                    self._disk_image_id = str(image["id"])
                    return self._disk_image_id
            next_link = body.get("nextLink")
            token = httpx.URL(next_link).params.get("skipToken") if next_link else None
            if not token:
                break
            params = {"skipToken": token}
        raise BoxHostUnavailable(
            f"Azure has no disk image {wanted!r} for Simeon's cloud computer; "
            "build it with box/azure/build.sh and set SIMEON_AZURE_DISK_IMAGE."
        )

    def _ports(self) -> list[dict[str, Any]]:
        """Each port the API reaches, asking for a Microsoft sign-in and
        admitting only the server's own identity. `Manual`: a request never
        wakes a sleeping box; the broker decides when it wakes."""
        if not (self.tenant_id and self.server_object_id):
            raise BoxHostUnavailable(
                "Simeon's cloud computer on Azure locks its ports to the "
                "server's identity; set SIMEON_AZURE_TENANT_ID and "
                "SIMEON_AZURE_SERVER_OBJECT_ID on Render."
            )
        return [
            {
                "name": f"p{port}",
                "port": port,
                "protocol": "Http",
                "activationMode": "Manual",
                "auth": {
                    "anonymous": False,
                    "entraId": {
                        "enabled": True,
                        "tenantIds": [self.tenant_id],
                        "objectIds": [self.server_object_id],
                    },
                },
            }
            for port in BOX_PORTS
        ]

    def _provisioned(self, sandbox: Mapping[str, Any]) -> ProvisionedBox:
        labels = dict(sandbox.get("labels") or {})
        meta = {"kind": KIND, "region": str(sandbox.get("region") or self.region)}
        for entry in sandbox.get("ports") or []:
            if isinstance(entry, dict) and entry.get("port") and entry.get("url"):
                meta[f"url_{entry['port']}"] = str(entry["url"]).rstrip("/")
        # The image it was made from, as `image_reference` names it: the
        # current one when its label is the current disk image's.
        made_from = labels.get(DISK_IMAGE_LABEL)
        image = (
            self.image_reference
            if not made_from or made_from == label_value(self.disk_image)
            else f"{KIND}:{made_from}"
        )
        return ProvisionedBox(
            str(sandbox.get("id")),
            self.proxy_domain,
            {port: port for port in BOX_PORTS},
            image,
            None,
            joined_sha(labels),
            box_store=labels.get("box_store") or None,
            host_meta=meta,
        )

    async def _settle(
        self, sandbox_id: str, *, until: set[str], deadline_s: float
    ) -> dict[str, Any] | None:
        """The box read until its state is one of `until`, or None when the
        deadline passes (or it is gone)."""
        deadline = self._clock() + deadline_s
        while True:
            sandbox = await self._get(sandbox_id)
            if sandbox is None:
                return None
            if _state_of(sandbox) in until:
                return sandbox
            if _state_of(sandbox) in GONE_STATES:
                return None
            if self._clock() >= deadline:
                return None
            await self._pause(POLL_S)

    # --- BoxHost ---------------------------------------------------------------------

    async def create(self, spec: BoxSpec) -> ProvisionedBox:
        if self.bundle is None:
            raise BoxHostUnavailable(
                "Simeon's cloud computer on Azure needs the host bundle; set "
                "SIMEON_BOX_HOST_BUNDLE_URL."
            )
        labels = {
            NAME_LABEL: label_value(spec.name),
            DISK_IMAGE_LABEL: label_value(self.disk_image),
            **split_sha(self.bundle.folder_sha256),
        }
        store = spec.labels.get(box_store.LABEL)
        if store:
            labels["box_store"] = label_value(store)
        body = {
            "sourcesRef": {
                "diskImage": {"id": await self._resolve_disk_image(), "isPublic": False}
            },
            "resources": RESOURCES,
            "labels": labels,
            "entrypoint": [VM_INIT],
            # The broker decides when a box sleeps (`hibernate_idle`), as on
            # E2B. Memory: a freeze keeps the tabs and programs as they were.
            "lifecycle": {
                "autoSuspendPolicy": {"enabled": False, "mode": "Memory"},
                "autoDeletePolicy": {"enabled": False},
            },
            "ports": self._ports(),
        }
        response = await self._call(
            "POST", "/sandboxes", json=body, action="start a new computer"
        )
        if response.status_code not in (200, 201):
            raise _host_error("start a new computer", response)
        sandbox_id = str(response.json().get("id") or "")
        if not sandbox_id:
            raise BoxHostError(
                "Simeon's cloud computer on Azure could not start a new computer: "
                "no id in Azure's answer"
            )
        try:
            running = await self._settle(
                sandbox_id, until={"running"}, deadline_s=SETTLE_DEADLINE_S
            )
            if running is None:
                raise BoxHostError("Simeon's cloud computer on Azure did not start.")
            facts = await self._boot(sandbox_id, spec)
        except BoxHostError:
            # Nothing half-made is left behind, as on Docker and E2B.
            await self._delete_quietly(sandbox_id)
            raise
        log.info(
            "sand.box.azure.created",
            sandbox=sandbox_id,
            name=spec.name,
            disk_image=self.disk_image,
            **facts,
        )
        return self._provisioned(running)

    async def _engine_files(self, sandbox_id: str) -> tuple[str, dict[str, bytes]]:
        """The engine's files this computer gets, by where they go, and,
        for the log, where the host's workers come from (`box_e2b.py`)."""
        assert self.bundle is not None
        _, found = await self._exec(
            sandbox_id,
            f"mkdir -p {HOST_DIR} /home/box/box-exec-daemon /run/simeon {STATE_DIR} && "
            f"if [ -f {HOST_DIR}/{HOST_COMPANIONS[0]} ]; then echo image; "
            "else echo bundle; fi",
        )
        workers = "image" if "image" in found else "bundle"
        companions = self.bundle.companions if workers == "bundle" else {}
        if workers == "bundle" and self.bundle.missing_companions:
            log.warning(
                "sand.box.azure.bundle_incomplete",
                missing=self.bundle.missing_companions,
            )
            raise BoxHostUnavailable(
                "This Azure disk image has no host workers and the published "
                f"engine lacks {', '.join(self.bundle.missing_companions)}. "
                "Build the disk image from box2's image (box/azure/build.sh), "
                "or publish the engine again."
            )
        files = {HOST_MAIN: self.bundle.host_main}
        for companion, data in sorted(companions.items()):
            files[f"{HOST_DIR}/{companion}"] = data
        files[EXEC_DAEMON_MAIN] = self.bundle.box_exec_daemon
        return workers, files

    async def _boot(self, sandbox_id: str, spec: BoxSpec) -> dict[str, str]:
        """The person's settings and the engine written in, /tmp moved to
        the disk, the clock set, then `READY_FILE`: `simeon-vm-init` starts
        the stack. Answers, for the log, where the workers come from and
        where /tmp is."""
        workers, engine = await self._engine_files(sandbox_id)
        await self._write(
            sandbox_id, ENV_FILE, env_file(spec.environment()), mode=MODE_PRIVATE
        )
        await self._write(
            sandbox_id, SEED_FILE, secrets.token_bytes(64), mode=MODE_PRIVATE
        )
        await self._write(
            sandbox_id, "/etc/machine-id", machine_id_of(spec.name) + "\n"
        )
        for path, data in engine.items():
            await self._write(sandbox_id, path, data)
        _, moved = await self._exec(sandbox_id, TMP_ON_DISK)
        tmp = moved.strip().removeprefix("tmp=") or "unknown"
        if tmp == "kept":
            log.warning("sand.box.azure.tmp_in_memory", sandbox=sandbox_id)
        await self._exec(sandbox_id, f"date -u -s @{int(time.time())} >/dev/null 2>&1")
        await self._write(sandbox_id, READY_FILE, f"{int(time.time())}\n")
        return {"workers": workers, "tmp": tmp}

    async def inspect(self, provider_box_id: str) -> ProvisionedBox | None:
        sandbox = await self._get(provider_box_id)
        return None if sandbox is None else self._provisioned(sandbox)

    async def run_state(self, provider_box_id: str) -> BoxRunState | None:
        sandbox = await self._get(provider_box_id)
        if sandbox is None:
            return None
        state = _state_of(sandbox)
        if state in GONE_STATES:
            return None
        return "running" if state in AWAKE_STATES else "stopped"

    async def start(self, provider_box_id: str) -> None:
        """Wake the box and set its clock. One that does not wake within
        `RESUME_DEADLINE_S` is removed, so the app's next try makes a new
        one from the backup (`sand.box.azure.resume_failed`)."""
        started = self._clock()
        deadline = started + RESUME_DEADLINE_S
        sandbox = await self._get(provider_box_id)
        if sandbox is None:
            raise BoxHostError(
                "Simeon's cloud computer on Azure is gone; a new one is made."
            )
        if _state_of(sandbox) != "running":
            details = sandbox.get("stateDetails") or {}
            if str(details.get("stoppedReason") or "").lower() == "disabled":
                await self._post(provider_box_id, "enable", "wake the computer")
            asked_at: float | None = None
            asked_in = ""
            while _state_of(sandbox) != "running":
                state = _state_of(sandbox)
                if state not in ("resuming", "creating") and (
                    asked_at is None
                    or state != asked_in
                    or self._clock() - asked_at >= RESUME_ASK_AGAIN_S
                ):
                    # Asked once, and again when its state moves on (a
                    # freeze still ending when the wake came) or it still
                    # sleeps 10 seconds on: a 409 (another operation holds
                    # it), a 5xx or no answer at all (the resume that
                    # hangs, #1869) is waited out, not an error.
                    asked_at, asked_in = self._clock(), state
                    try:
                        response = await self._call(
                            "POST",
                            f"/sandboxes/{quote(provider_box_id, safe='')}/resume",
                            timeout=CALL_TIMEOUT_S,
                            action="wake the computer",
                        )
                    except _NoAnswer as error:
                        log.info(
                            "sand.box.azure.resume_unanswered",
                            sandbox=provider_box_id,
                            error=str(error),
                        )
                    else:
                        if response.status_code not in (200, 409) and not (
                            response.status_code >= 500
                        ):
                            raise _host_error("wake the computer", response)
                if self._clock() >= deadline:
                    break
                await self._pause(POLL_S)
                fresh = await self._get(provider_box_id)
                if fresh is None:
                    break
                sandbox = fresh
            if _state_of(sandbox) != "running":
                waited = round(self._clock() - started, 1)
                log.warning(
                    "sand.box.azure.resume_failed",
                    sandbox=provider_box_id,
                    waited_s=waited,
                    state=_state_of(sandbox),
                )
                await self._delete_quietly(provider_box_id)
                raise BoxHostError(
                    "Simeon's cloud computer on Azure did not wake in time; "
                    "a new one is made from its backup."
                )
        try:
            await self._exec(
                provider_box_id,
                f"date -u -s @{int(time.time())} >/dev/null 2>&1",
                timeout=10,
            )
        except BoxHostError as error:
            log.warning(
                "sand.box.azure.clock_not_set",
                sandbox=provider_box_id,
                error=str(error),
            )

    async def _post(self, sandbox_id: str, verb: str, action: str) -> None:
        response = await self._call(
            "POST", f"/sandboxes/{quote(sandbox_id, safe='')}/{verb}", action=action
        )
        if response.status_code != 200:
            raise _host_error(action, response)

    async def update_in_place(self, provider_box_id: str) -> dict[str, str]:
        """The published engine on this running computer, its disk kept, as
        on E2B (`ENGINE_UPDATE_SCRIPT`). Raises `BoxHostError` when the
        engine did not come back new; the caller then replaces the box."""
        if self.bundle is None:
            raise BoxHostUnavailable(
                "Simeon's cloud computer on Azure needs the host bundle; set "
                "SIMEON_BOX_HOST_BUNDLE_URL."
            )
        workers, engine = await self._engine_files(provider_box_id)
        for path, data in engine.items():
            await self._write(provider_box_id, f"{path}{ENGINE_NEXT_SUFFIX}", data)
        await self._write(
            provider_box_id,
            ENGINE_UPDATE_SCRIPT,
            engine_update_script(list(engine)),
            mode=MODE_SCRIPT,
        )
        _, done = await self._exec(
            provider_box_id,
            f"bash {ENGINE_UPDATE_SCRIPT}",
            timeout=ENGINE_UPDATE_TIMEOUT_S,
        )
        lines = done.strip().splitlines()
        outcome = lines[-1].removeprefix("engine=") if lines else "no answer"
        if outcome != "restarted":
            raise BoxHostError(
                "Simeon's cloud computer on Azure could not update its engine "
                f"in place: {outcome}"
            )
        return {"workers": workers}

    async def stop(self, provider_box_id: str) -> None:
        response = await self._call(
            "POST",
            f"/sandboxes/{quote(provider_box_id, safe='')}/stop",
            action="put the computer to sleep",
        )
        if response.status_code == 404:
            return
        if response.status_code not in (200, 409):
            raise _host_error("put the computer to sleep", response)
        settled = await self._settle(
            provider_box_id,
            until={"stopped", "idle", "suspended", "stopfailed"},
            deadline_s=SETTLE_DEADLINE_S,
        )
        if settled is not None and _state_of(settled) == "stopfailed":
            raise BoxHostError(
                "Simeon's cloud computer on Azure could not be put to sleep."
            )

    async def remove(self, provider_box_id: str, *, volumes: list[str]) -> None:
        """Delete the sandbox. A box name (`simeon-box-<hex>`, the cleanup
        of a box that did not come up) is looked up by its label. There are
        no volumes to remove."""
        ids = [provider_box_id]
        if provider_box_id.startswith("simeon-box-"):
            ids = await self._ids_named(provider_box_id)
        for sandbox_id in ids:
            await self._delete(sandbox_id)

    # --- helpers --------------------------------------------------------------------

    async def _ids_named(self, name: str) -> list[str]:
        ids: list[str] = []
        params = {"labels": f"{NAME_LABEL}={label_value(name)}"}
        while True:
            response = await self._call(
                "GET", "/sandboxes", params=params, action="find the computer"
            )
            if response.status_code != 200:
                raise _host_error("find the computer", response)
            body = response.json()
            ids.extend(
                str(item["id"]) for item in body.get("value") or [] if item.get("id")
            )
            next_link = body.get("nextLink")
            token = httpx.URL(next_link).params.get("skipToken") if next_link else None
            if not token:
                return ids
            params = {"labels": f"{NAME_LABEL}={label_value(name)}", "skipToken": token}

    async def _delete(self, sandbox_id: str) -> None:
        response = await self._call(
            "DELETE",
            f"/sandboxes/{quote(sandbox_id, safe='')}",
            action="remove the computer",
        )
        if response.status_code not in (200, 202, 204, 404):
            raise _host_error("remove the computer", response)

    async def _delete_quietly(self, sandbox_id: str) -> None:
        try:
            await self._delete(sandbox_id)
        except BoxHostError as error:
            log.warning(
                "sand.box.azure.cleanup_failed", sandbox=sandbox_id, error=str(error)
            )


__all__ = [
    "KIND",
    "AzureBoxHost",
    "AzureCredential",
    "credential",
    "port_headers",
    "set_credential_for_tests",
]
