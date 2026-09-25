"""The box broker's logic (25 September 2026): find or create the
person's cloud box, answer where it is, recreate it, watch a recreate,
and mint the local-exec daemon's credential.

What is reused, not built: the box credential (`DesktopService.
issue_box_credential`, the `claidor_db_` child row the box trades at
`POST /sand-box/inference-credential`), the token helpers
(`polar.kit.crypto`), and the `docker run` of the Mac's local path
(`BoxSpec.environment` in `box_hosts.py`). The URL shapes come from the
app: the gateway client concatenates `${baseUrl}/api/…`
(`gateway-client.ts:261`), the VNC page is built by
`buildSandBoxNoVncUrl` (`packages/constants/sand-box.ts`), and the egress
tunnel is derived from the gateway URL (`egress-tunnel/box-connection.ts`).
"""

from __future__ import annotations

import asyncio
import secrets
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx
import structlog

from polar.config import settings
from polar.desktop.repository import DesktopSessionRepository
from polar.desktop.service import DesktopUnauthenticated, desktop
from polar.desktop.tokens import ACCESS_TOKEN_PREFIX, BOX_CREDENTIAL_PREFIX
from polar.kit.crypto import generate_token_hash_pair, get_token_hash
from polar.kit.utils import generate_uuid, utc_now
from polar.models import DesktopSession, SandBox
from polar.postgres import AsyncSession

from .box_hosts import (
    EGRESS_TUNNEL_PORT,
    FORK_NOVNC_PORT,
    GATEWAY_PORT,
    PRIMARY_NOVNC_PORT,
    BoxHost,
    BoxHostError,
    BoxSpec,
    ProvisionedBox,
    box_image_reference,
    resolve_box_host,
)
from .box_repository import SandBoxRepository

log = structlog.get_logger()

#: `aiserver.v1.SandBoxRunState`
RUN_STATE_UNSPECIFIED = 0
RUN_STATE_ABSENT = 1
RUN_STATE_HIBERNATED = 2
RUN_STATE_RUNNING = 3

#: `aiserver.v1.SandBoxMigrationPhase`
PHASE_BACKING_UP = 1
PHASE_CREATING = 2
PHASE_MOVING = 3
PHASE_CLEANING_UP = 4
PHASE_WIPING = 5
PHASE_DONE = 6
PHASE_FAILED = 7

#: noVNC wakes the screen with these (`sand-box.ts`, `buildSandBoxNoVncUrl`).
NOVNC_WAKE = "resume_lower_s=900&resume_upper_s=18000"

LOCAL_EXEC_USER_AGENT_PREFIX = "simeon-local-exec/"

#: The reason the in-box lifecycle reads when a box that is not one of
#: ours (the Docker box on the Mac) asks to be recreated from here.
LOCAL_BOX_REASON = (
    "This computer runs in Docker on the user's Mac; it is updated from "
    "Simeon on the Mac (Settings → Updates), not from here."
)


class BoxBrokerRefused(Exception):
    """A refusal with a Connect code; `box_broker.py` answers it."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class RecreateOutcome:
    started: bool
    reason: str = ""
    operation_id: str = ""


# --- migration events, per box, in memory --------------------------------------
#
# A recreate is short (remove a container, create one) and answered in
# the RPC, so the stream the app watches replays what the recreate
# recorded and then waits for more. One API process keeps them; a
# restart forgets them, and the app's relay treats a stream that ends
# without a terminal phase as "started-untrackable", which it already
# handles.


class MigrationLog:
    def __init__(self) -> None:
        self.events: dict[UUID, list[dict[str, Any]]] = {}
        self.changed: dict[UUID, asyncio.Event] = {}
        #: How long a stream waits for another event before ending.
        self.idle = 25.0

    def record(
        self, box_id: UUID, operation_id: str, phase: int, detail: str = ""
    ) -> None:
        events = self.events.setdefault(box_id, [])
        events.append(
            {
                "phase": phase,
                "detail": detail,
                "atMs": str(int(utc_now().timestamp() * 1000)),
                "offsetKey": str(len(events) + 1),
                "operationId": operation_id,
            }
        )
        event = self.changed.setdefault(box_id, asyncio.Event())
        event.set()
        event.clear()

    async def watch(
        self, box_id: UUID, from_offset_key: str, include_finished: bool
    ) -> AsyncIterator[dict[str, Any]]:
        after = int(from_offset_key) if from_offset_key.isdigit() else 0
        while True:
            events = self.events.get(box_id, [])
            pending = [e for e in events if int(e["offsetKey"]) > after]
            for event in pending:
                after = int(event["offsetKey"])
                if not include_finished and event["phase"] in (
                    PHASE_DONE,
                    PHASE_FAILED,
                ):
                    continue
                yield event
            waiter = self.changed.setdefault(box_id, asyncio.Event())
            try:
                await asyncio.wait_for(waiter.wait(), timeout=self.idle)
            except TimeoutError:
                return


migrations = MigrationLog()


# --- readiness ------------------------------------------------------------------

HealthCheck = Callable[[str, str], Awaitable[bool]]


async def gateway_health(url: str, token: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(
                f"{url}/health", headers={"authorization": f"Bearer {token}"}
            )
        return response.status_code == 200
    except httpx.HTTPError:
        return False


_health_check: HealthCheck = gateway_health


def set_health_check_for_tests(check: HealthCheck | None) -> None:
    global _health_check
    _health_check = check or gateway_health


# --- the service ------------------------------------------------------------------


class BoxBrokerService:
    def __init__(self, ready_poll: float = 1.0) -> None:
        self.ready_poll = ready_poll

    # urls

    @staticmethod
    def box_label(box: SandBox) -> str:
        return f"box-{box.id.hex}"

    @staticmethod
    def internal_url(box: SandBox, inner_port: int) -> str | None:
        """Where the API itself reaches a port (the box host's published
        port), for the proxy and the health check."""
        host_port = box.host_port(inner_port)
        if host_port is None:
            return None
        return f"http://{box.host_address}:{host_port}"

    @classmethod
    def public_base(cls, box: SandBox, inner_port: int) -> str:
        """What the app is told. With `CLAIDOR_BOX_PUBLIC_URL_TEMPLATE` the
        per-port hostname a TLS proxy on the box VM serves (first label
        `<box>-<port>`, which is the `-<digits>` shape the tunnel
        derivation swaps for `-8790`); without it the API's own proxy,
        `/sand-box/{id}/p/{port}`, whose path the app's derivation
        (`box-connection.ts`, 25 September 2026) swaps the same way."""
        template = settings.BOX_PUBLIC_URL_TEMPLATE.strip()
        if template:
            return template.format(box=cls.box_label(box), port=inner_port).rstrip("/")
        return f"{settings.BASE_URL.rstrip('/')}/sand-box/{box.id}/p/{inner_port}"

    @classmethod
    def novnc_url(cls, proxy_base: str, network_token: str) -> str:
        # `buildSandBoxNoVncUrl` in `packages/constants/sand-box.ts`, so the
        # page the app's webview loads is the one Grok Bot's renderer loads.
        websockify = f"websockify?network_token={network_token}&{NOVNC_WAKE}"
        return (
            f"{proxy_base}/vnc.html?network_token={network_token}&{NOVNC_WAKE}"
            f"&path={quote(websockify, safe='')}"
        )

    @classmethod
    def stamp_urls(cls, box: SandBox) -> None:
        box.gateway_url = cls.public_base(box, GATEWAY_PORT)
        box.vnc_url = cls.novnc_url(
            cls.public_base(box, PRIMARY_NOVNC_PORT), box.network_token
        )
        box.fork_vnc_base_url = cls.public_base(box, FORK_NOVNC_PORT)

    # the box

    @staticmethod
    def volumes(box_id: UUID) -> tuple[str, str]:
        return f"simeon-box-{box_id.hex}-workspace", f"simeon-box-{box_id.hex}-data"

    async def _mint_credential(
        self, db: AsyncSession, parent: DesktopSession
    ) -> tuple[DesktopSession, str]:
        try:
            return await desktop.issue_box_credential(db, parent)
        except DesktopUnauthenticated as error:
            raise BoxBrokerRefused("unauthenticated", error.message)

    async def _parent_of(
        self, db: AsyncSession, caller: DesktopSession
    ) -> DesktopSession:
        """The signed-in desktop behind a caller: itself, or the parent of
        a box credential (the host in the box calls RecreateSandBox with
        its own credential)."""
        if not caller.is_box_credential:
            return caller
        parent = await DesktopSessionRepository.from_session(db).get_parent_of(caller)
        if parent is None or parent.is_revoked:
            raise BoxBrokerRefused(
                "unauthenticated", "The desktop this box belongs to has signed out."
            )
        return parent

    def _apply(self, box: SandBox, provisioned: ProvisionedBox) -> None:
        box.provider_box_id = provisioned.provider_box_id
        box.host_address = provisioned.host_address
        box.ports = {str(k): v for k, v in provisioned.ports.items()}
        box.image = provisioned.image
        box.image_digest = provisioned.image_digest

    async def _create(
        self, db: AsyncSession, host: BoxHost, parent: DesktopSession, box: SandBox
    ) -> None:
        credential_row, credential = await self._mint_credential(db, parent)
        box.credential_session_id = credential_row.id
        box.gateway_token = box.gateway_token or secrets.token_hex(32)
        box.network_token = box.network_token or secrets.token_hex(32)
        workspace, data = self.volumes(box.id)
        spec = BoxSpec(
            name=f"simeon-box-{box.id.hex}",
            gateway_token=box.gateway_token,
            renewal_credential=credential,
            backend_url=settings.BASE_URL,
            image=box_image_reference(),
            workspace_volume=workspace,
            data_volume=data,
        )
        provisioned = await host.create(spec)
        box.provider = host.name
        box.state = "running"
        self._apply(box, provisioned)

    async def _credential_is_live(self, db: AsyncSession, box: SandBox) -> bool:
        if box.credential_session_id is None:
            return False
        statement = (
            DesktopSessionRepository.from_session(db)
            .get_base_statement()
            .where(DesktopSession.id == box.credential_session_id)
        )
        row = await DesktopSessionRepository.from_session(db).get_one_or_none(statement)
        return (
            row is not None
            and not row.is_revoked
            and row.refresh_expires_at > utc_now()
        )

    async def wait_ready(self, box: SandBox) -> bool:
        url = self.internal_url(box, GATEWAY_PORT)
        if url is None:
            return False
        deadline = utc_now() + settings.BOX_READY_TIMEOUT
        while True:
            if await _health_check(url, box.gateway_token):
                return True
            if utc_now() >= deadline:
                return False
            await asyncio.sleep(self.ready_poll)

    async def ensure(self, db: AsyncSession, caller: DesktopSession) -> SandBox:
        """`EnsureSandBox`: the person's box, created, started or reused,
        with its URLs stamped. Raises `BoxBrokerRefused` (a Connect code
        and a sentence) and `BoxHostError`."""
        parent = await self._parent_of(db, caller)
        host = await resolve_box_host()
        repository = SandBoxRepository.from_session(db)
        box = await repository.get_by_user(parent.user_id)
        created = False
        if box is not None and box.provider == host.name:
            state = await host.run_state(box.provider_box_id)
            credential_live = await self._credential_is_live(db, box)
            if state is None or not credential_live:
                # Absent on the host, or its credential died with a sign-out:
                # a fresh container on the same volumes, a fresh credential.
                log.info(
                    "sand.box.ensure.recreate",
                    box=str(box.id),
                    state=state,
                    credential_live=credential_live,
                )
                if state is not None:
                    await host.remove(box.provider_box_id, volumes=[])
                await self._create(db, host, parent, box)
                created = True
            elif state == "stopped":
                await host.start(box.provider_box_id)
                inspected = await host.inspect(box.provider_box_id)
                if inspected is not None:
                    self._apply(box, inspected)
                box.state = "running"
            else:
                inspected = await host.inspect(box.provider_box_id)
                if inspected is not None:
                    self._apply(box, inspected)
                box.state = "running"
        else:
            if box is not None:
                # A row from another provider: leave its container to that
                # host; the person gets a box on the configured one.
                await repository.soft_delete(box)
            box = SandBox(
                id=generate_uuid(),
                user_id=parent.user_id,
                provider=host.name,
                provider_box_id="",
                host_address="",
                gateway_token="",
                network_token="",
            )
            await self._create(db, host, parent, box)
            created = True
        self.stamp_urls(box)
        box.last_ensured_at = utc_now()
        await repository.update(box, flush=True)
        ready = await self.wait_ready(box)
        log.info(
            "sand.box.ensure",
            box=str(box.id),
            user=str(parent.user_id),
            provider=host.name,
            created=created,
            ready=ready,
            gateway_url=box.gateway_url,
        )
        return box

    async def recreate(
        self,
        db: AsyncSession,
        caller: DesktopSession,
        *,
        preserve_data: bool,
        force: bool,
    ) -> RecreateOutcome:
        """`RecreateSandBox` and `ForceRecreateSandBox`: the container is
        replaced now, on the same volumes (`preserve_data`) or on fresh
        ones; the phases are recorded for `WatchSandBoxMigration`."""
        repository = SandBoxRepository.from_session(db)
        if caller.is_box_credential:
            box = await repository.get_by_credential_session(caller.id)
            if box is None:
                return RecreateOutcome(started=False, reason=LOCAL_BOX_REASON)
        else:
            box = await repository.get_by_user(caller.user_id)
        parent = await self._parent_of(db, caller)
        try:
            host = await resolve_box_host()
        except BoxHostError as error:
            return RecreateOutcome(started=False, reason=str(error))
        if box is None or box.provider != host.name:
            return RecreateOutcome(
                started=False,
                reason="There is no cloud computer to recreate yet; connect once first.",
            )
        operation_id = uuid4().hex
        workspace, data = self.volumes(box.id)
        migrations.record(
            box.id,
            operation_id,
            PHASE_CREATING,
            "Replacing the computer"
            + (" (keeping its files)" if preserve_data else " (wiping its files)"),
        )
        try:
            state = await host.run_state(box.provider_box_id)
            if state is not None:
                if not preserve_data:
                    migrations.record(
                        box.id, operation_id, PHASE_WIPING, "Removing the files"
                    )
                await host.remove(
                    box.provider_box_id,
                    volumes=[] if preserve_data else [workspace, data],
                )
            # A new credential, so the new container never carries one a
            # previous container exposed.
            box.gateway_token = ""
            box.network_token = ""
            await self._create(db, host, parent, box)
            self.stamp_urls(box)
            box.last_ensured_at = utc_now()
            await repository.update(box, flush=True)
        except BoxHostError as error:
            migrations.record(box.id, operation_id, PHASE_FAILED, str(error))
            log.warning("sand.box.recreate.failed", box=str(box.id), error=str(error))
            return RecreateOutcome(started=False, reason=str(error))
        migrations.record(box.id, operation_id, PHASE_DONE, "The computer is back")
        log.info(
            "sand.box.recreate",
            box=str(box.id),
            preserve_data=preserve_data,
            force=force,
            operation=operation_id,
        )
        return RecreateOutcome(started=True, operation_id=operation_id)

    async def run_state(
        self, db: AsyncSession, caller: DesktopSession
    ) -> tuple[int, bool]:
        """`GetSandBoxRunState`: `(state, image_update_available)`. A box
        credential that is not one of ours is the Docker box on the Mac,
        which the host inside it now asks about (GrokBotService is in the
        served set): it is running, by definition, and updated from the Mac."""
        repository = SandBoxRepository.from_session(db)
        if caller.is_box_credential:
            box = await repository.get_by_credential_session(caller.id)
            if box is None:
                return RUN_STATE_RUNNING, False
        else:
            box = await repository.get_by_user(caller.user_id)
            if box is None:
                return RUN_STATE_ABSENT, False
        try:
            host = await resolve_box_host()
        except BoxHostError:
            return RUN_STATE_ABSENT, False
        if box.provider != host.name:
            return RUN_STATE_ABSENT, False
        state = await host.run_state(box.provider_box_id)
        box.state = (
            "running"
            if state == "running"
            else "hibernated"
            if state == "stopped"
            else "absent"
        )
        await repository.update(box, flush=True)
        if state == "running":
            return RUN_STATE_RUNNING, False
        if state == "stopped":
            return RUN_STATE_HIBERNATED, False
        return RUN_STATE_ABSENT, False

    async def box_of_watcher(
        self, db: AsyncSession, caller: DesktopSession
    ) -> SandBox | None:
        repository = SandBoxRepository.from_session(db)
        if caller.is_box_credential:
            return await repository.get_by_credential_session(caller.id)
        return await repository.get_by_user(caller.user_id)

    # the proxy's lookup

    async def box_for_network_token(
        self, db: AsyncSession, box_id: UUID, token: str
    ) -> SandBox | None:
        box = await SandBoxRepository.from_session(db).get_by_id(box_id)
        if (
            box is None
            or not token
            or not secrets.compare_digest(box.network_token, token)
        ):
            return None
        return box

    # --- the local-exec daemon's credential ----------------------------------------
    #
    # The Mac's local-exec daemon (`host/local-exec/local-exec-daemon.ts`)
    # holds a credential the app hands it (`issueLocalExecDaemonCredential`,
    # `POST /sand-box/local-exec-daemon-credential`) and, when its gateway
    # connection goes stale, trades it for the box's current connection
    # (`resolveLocalExecConnectionFromBackend`, `POST /sand-box/local-exec-connection`,
    # `{baseUrl, token, networkToken}`). Same machinery as the box's
    # credential: a child `desktop_sessions` row with the `claidor_db_`
    # prefix, told apart by its user agent, revoked with its parent on
    # sign-out and by the next box credential mint (one mint revokes every
    # child; the daemon asks again on its next tick).

    async def issue_local_exec_credential(
        self, db: AsyncSession, parent: DesktopSession
    ) -> tuple[DesktopSession, str]:
        if parent.is_job_token or parent.is_box_credential:
            raise BoxBrokerRefused(
                "permission_denied",
                "Only a signed-in desktop can ask for a local-exec credential.",
            )
        now = utc_now()
        repository = DesktopSessionRepository.from_session(db)
        for previous in await repository.list_box_credentials_of(parent.id):
            if previous.is_revoked or not previous.user_agent.startswith(
                LOCAL_EXEC_USER_AGENT_PREFIX
            ):
                continue
            previous.revoked_at = now
            db.add(previous)
        access, access_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=ACCESS_TOKEN_PREFIX
        )
        credential, credential_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=BOX_CREDENTIAL_PREFIX
        )
        row = DesktopSession(
            access_token_hash=access_hash,
            access_expires_at=now + settings.DESKTOP_ACCESS_TOKEN_TTL,
            refresh_token_hash=credential_hash,
            refresh_expires_at=now + settings.BOX_LOCAL_EXEC_CREDENTIAL_TTL,
            user_agent=f"{LOCAL_EXEC_USER_AGENT_PREFIX}{parent.id}"[:2000],
            client_version=parent.client_version,
            user_id=parent.user_id,
            box_of_session_id=parent.id,
        )
        row.user = parent.user
        db.add(row)
        await db.flush()
        return row, credential

    async def trade_local_exec_credential(
        self, db: AsyncSession, credential: str
    ) -> SandBox | None:
        """The box connection for a live local-exec credential; None when
        the person has no running cloud box. Raises `BoxBrokerRefused`
        (`unauthenticated`) for a credential that is not live."""
        token = credential.strip()
        if (
            not token
            or not token.isascii()
            or not token.startswith(BOX_CREDENTIAL_PREFIX)
        ):
            raise BoxBrokerRefused(
                "unauthenticated", "The local-exec credential is invalid."
            )
        repository = DesktopSessionRepository.from_session(db)
        found = await repository.get_by_refresh_token_hash(
            get_token_hash(token, secret=settings.SECRET)
        )
        now = utc_now()
        if (
            found is None
            or not found.is_box_credential
            or not found.user_agent.startswith(LOCAL_EXEC_USER_AGENT_PREFIX)
            or found.is_revoked
            or found.refresh_expires_at < now
        ):
            raise BoxBrokerRefused(
                "unauthenticated",
                "The local-exec credential is invalid or has expired.",
            )
        parent = await repository.get_parent_of(found)
        if parent is None or parent.is_revoked:
            raise BoxBrokerRefused(
                "unauthenticated",
                "The desktop this credential belongs to has signed out.",
            )
        box = await SandBoxRepository.from_session(db).get_by_user(found.user_id)
        if box is None or box.state != "running" or not box.gateway_url:
            return None
        return box


broker = BoxBrokerService()

__all__ = [
    "EGRESS_TUNNEL_PORT",
    "BoxBrokerRefused",
    "BoxBrokerService",
    "MigrationLog",
    "RecreateOutcome",
    "broker",
    "migrations",
    "set_health_check_for_tests",
]
