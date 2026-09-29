"""The box broker's logic (25 September 2026): find or create the
person's cloud box, answer where it is, recreate it, watch a recreate,
and mint the local-exec daemon's credential.

What is reused, not built: the box credential (`DesktopService.
issue_box_credential`, the `simeon_db_` child row the box trades at
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
import json
import secrets
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx
import structlog

from polar.config import settings
from polar.desktop.repository import DesktopSessionRepository
from polar.desktop.service import DesktopUnauthenticated, desktop
from polar.desktop.tokens import (
    ACCESS_TOKEN_PREFIX,
    BOX_CREDENTIAL_PREFIX,
    BOX_CREDENTIAL_PREFIXES,
)
from polar.kit.crypto import generate_token_hash_pair, get_token_hash
from polar.kit.utils import generate_uuid, utc_now
from polar.models import DesktopSession, SandBox
from polar.postgres import AsyncSession
from polar.redis import Redis

from .box_hosts import (
    EGRESS_TUNNEL_PORT,
    FORK_NOVNC_PORT,
    GATEWAY_PORT,
    PRIMARY_NOVNC_PORT,
    BoxBlocked,
    BoxHost,
    BoxHostError,
    BoxSpec,
    ProvisionedBox,
    box_image_reference,
    find_box_host,
    resolve_box_hosts,
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


#: A box's migration events: a Redis list, so the worker that records a
#: recreate and the one serving the app's stream need not be the same
#: (several API workers, 29 September 2026). Kept an hour after the last event.
MIGRATION_TTL_S = 3600


def _migration_key(box_id: UUID) -> str:
    return f"sand:box:migration:{box_id}"


class MigrationLog:
    def __init__(self) -> None:
        #: How long a stream waits for another event before ending.
        self.idle = 25.0
        #: How often a waiting stream looks for one.
        self.poll = 0.5

    async def record(
        self,
        redis: Redis,
        box_id: UUID,
        operation_id: str,
        phase: int,
        detail: str = "",
    ) -> None:
        key = _migration_key(box_id)
        await redis.rpush(
            key,
            json.dumps(
                {
                    "phase": phase,
                    "detail": detail,
                    "atMs": str(int(utc_now().timestamp() * 1000)),
                    "operationId": operation_id,
                }
            ),
        )
        await redis.expire(key, MIGRATION_TTL_S)

    async def watch(
        self,
        redis: Redis,
        box_id: UUID,
        from_offset_key: str,
        include_finished: bool,
    ) -> AsyncIterator[dict[str, Any]]:
        """Each event after `from_offset_key` (its 1-based place in the
        list), then each new one, until none comes for `idle` seconds."""
        key = _migration_key(box_id)
        after = int(from_offset_key) if from_offset_key.isdigit() else 0
        quiet_since = time.monotonic()
        while True:
            raw = await redis.lrange(key, after, -1)
            if raw:
                quiet_since = time.monotonic()
            for item in raw:
                after += 1
                event = {**json.loads(item), "offsetKey": str(after)}
                if not include_finished and event["phase"] in (
                    PHASE_DONE,
                    PHASE_FAILED,
                ):
                    continue
                yield event
            waited = time.monotonic() - quiet_since
            if waited >= self.idle:
                return
            await asyncio.sleep(min(self.poll, self.idle - waited))


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


# --- sleep: what the box says about itself ------------------------------------------
#
# The upstream app's contract, read from the host and the generated protos
# (28 September 2026). The host answers `GET /health` with `isBusy`,
# `busyOnlyAwaitingApproval` and `lastBusyAtMs` (`gateway-server.ts`,
# `SandHost.getHealth`): busy while a turn, a background shell, a carried
# wake or a mid-drain revival runs, and `lastBusyAtMs` moves only while
# busy on something other than an approval card. Cursor's server read the
# same pair (`AdminSandBoxHostStatusResponse.is_busy`, `last_busy_at_ms`),
# kept `last_active_at_ms` per pod (`TeamMemberSandBoxPod`), hibernated a
# pod with `AdminHibernateSandBox(force)`, which answers `started`/`reason`,
# and reported `SAND_BOX_RUN_STATE_HIBERNATED`, which the window draws as
# "sleeping" and "Waking your computer…". How long Cursor waited before
# hibernating is not in the client; `SIMEON_BOX_IDLE_HIBERNATE_AFTER` is ours.


@dataclass(frozen=True)
class BoxHealth:
    reachable: bool
    is_busy: bool = False
    busy_only_awaiting_approval: bool = False
    last_busy_at_ms: int | None = None

    @property
    def holds_awake(self) -> bool:
        """Busy on real work. A box that only waits on the person's
        approval card may sleep: its `lastBusyAtMs` stopped moving."""
        return self.is_busy and not self.busy_only_awaiting_approval


HealthReport = Callable[[str, str], Awaitable[BoxHealth]]


async def gateway_health_report(url: str, token: str) -> BoxHealth:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{url}/health", headers={"authorization": f"Bearer {token}"}
            )
        if response.status_code != 200:
            return BoxHealth(reachable=False)
        body = response.json()
    except (httpx.HTTPError, ValueError):
        return BoxHealth(reachable=False)
    if not isinstance(body, dict):
        return BoxHealth(reachable=False)
    last_busy = body.get("lastBusyAtMs")
    return BoxHealth(
        reachable=True,
        is_busy=body.get("isBusy") is True,
        busy_only_awaiting_approval=body.get("busyOnlyAwaitingApproval") is True,
        last_busy_at_ms=int(last_busy)
        if isinstance(last_busy, int | float) and last_busy > 0
        else None,
    )


_health_report: HealthReport = gateway_health_report


def set_health_report_for_tests(report: HealthReport | None) -> None:
    global _health_report
    _health_report = report or gateway_health_report


# The app holds the gateway's `/events` stream open and reconnects it for
# as long as Simeon is open (`gateway-client.ts`, the reconnect loop), and
# every reconnect is an EnsureSandBox that would wake the box again. So a
# box the app is attached to through the API's proxy counts as active: the
# proxy keeps this key alive while a request or stream is open.
ATTACHED_TTL_SECONDS = 180
ATTACHED_REFRESH_SECONDS = 60.0


def attached_key(box_id: UUID) -> str:
    return f"sand:box:attached:{box_id}"


async def mark_attached(redis: Redis, box_id: UUID) -> None:
    try:
        await redis.set(attached_key(box_id), "1", ex=ATTACHED_TTL_SECONDS)
    except Exception:
        return


async def is_attached(redis: Redis, box_id: UUID) -> bool:
    try:
        return bool(await redis.exists(attached_key(box_id)))
    except Exception:
        # Unknown is treated as attached: a box is never put to sleep on
        # a Redis failure.
        return True


#: `SandBoxBlockedInfo` for a full host. The window shows title and
#: detail (each 1–400 characters) and holds for `retry-after`.
CAPACITY_BLOCK_REASON = "capacity"
CAPACITY_BLOCK_TITLE = "Simeon's cloud computers are all in use"
CAPACITY_BLOCK_DETAIL = (
    "Every cloud computer is busy right now. Simeon tries again in a minute."
)
CAPACITY_RETRY_AFTER_S = 60


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
        """What the app is told. With `SIMEON_BOX_PUBLIC_URL_TEMPLATE` the
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
        # page the app's webview loads is the one the upstream app's renderer loads.
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
            memory_mb=max(settings.BOX_MEMORY_LIMIT_MB, 0),
            cpus=max(settings.BOX_CPU_LIMIT, 0.0),
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
        repository = SandBoxRepository.from_session(db)
        box = await repository.get_by_user(parent.user_id)
        # A box stays on the server it was made on: its volumes live there.
        host = await find_box_host(box.provider) if box is not None else None
        if host is None:
            # Raises the app's one sentence when no server is configured.
            await resolve_box_hosts()
        created = False
        if box is not None and host is not None:
            state = await host.run_state(box.provider_box_id)
            credential_live = await self._credential_is_live(db, box)
            # The Mac's rules (local-docker-host-connector.ts): a container
            # whose host program is not the current bundle
            # (`localDockerContainerNeedsReplace`), or that runs another
            # image than the one configured (the Mac refuses it), is
            # replaced on the same volumes. A box made before 29 September
            # mounts no host at all; one on a later image than the pinned
            # one runs the image's own host from /opt/sand and never reads
            # the mounted one.
            expected_host = getattr(host, "expected_host_sha256", None)
            stale_host = False
            stale_image = False
            if state is not None and credential_live:
                current = await host.inspect(box.provider_box_id)
                if current is not None:
                    stale_image = current.image != box_image_reference()
                if expected_host is not None:
                    stale_host = current is None or current.host_sha256 != expected_host
            if (stale_host or stale_image) and state == "running":
                # The upstream app's supervisor swaps the host only when the box is
                # idle (the upgrade command waits while it is busy): a box
                # working, or waiting on the person's approval, keeps its
                # program until the app connects to it idle.
                if (await self.health_of(box)).is_busy:
                    log.info(
                        "sand.box.update_deferred",
                        box=str(box.id),
                        stale_host=stale_host,
                        stale_image=stale_image,
                    )
                    stale_host = stale_image = False
            if state is None or not credential_live or stale_host or stale_image:
                # Absent on the host, its credential died with a sign-out, or
                # the wrong host program or image: a fresh container on the
                # same volumes, a fresh credential.
                log.info(
                    "sand.box.ensure.recreate",
                    box=str(box.id),
                    state=state,
                    credential_live=credential_live,
                    stale_host=stale_host,
                    stale_image=stale_image,
                )
                if state != "running":
                    await self.check_capacity(repository, host, box)
                if state is not None:
                    await host.remove(box.provider_box_id, volumes=[])
                await self._create(db, host, parent, box)
                created = True
            elif state == "stopped":
                await self.check_capacity(repository, host, box)
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
                # A row from a server that is no longer configured: leave
                # its container to that server; the person gets a new box.
                log.warning(
                    "sand.box.server_gone", box=str(box.id), provider=box.provider
                )
                await repository.soft_delete(box)
            box = SandBox(
                id=generate_uuid(),
                user_id=parent.user_id,
                provider="",
                provider_box_id="",
                host_address="",
                gateway_token="",
                network_token="",
            )
            host = await self.place(repository, box)
            box.provider = host.name
            try:
                await self._create(db, host, parent, box)
            except BoxHostError:
                # A brand-new box that did not come up leaves nothing
                # behind: the host removed its container, and its two
                # volumes, made at create, go too. A box that already
                # existed never reaches this line, so no data is lost.
                workspace, data = self.volumes(box.id)
                try:
                    await host.remove(
                        f"simeon-box-{box.id.hex}", volumes=[workspace, data]
                    )
                except BoxHostError as error:
                    log.warning(
                        "sand.box.cleanup_failed", box=str(box.id), error=str(error)
                    )
                raise
            created = True
        self.stamp_urls(box)
        box.last_ensured_at = utc_now()
        box.last_active_at = box.last_ensured_at
        box.hibernated_at = None
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
        redis: Redis,
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
            host = await find_box_host(box.provider) if box is not None else None
        except BoxHostError as error:
            return RecreateOutcome(started=False, reason=str(error))
        if box is None or host is None:
            return RecreateOutcome(
                started=False,
                reason="There is no cloud computer to recreate yet; connect once first.",
            )
        operation_id = uuid4().hex
        workspace, data = self.volumes(box.id)
        await migrations.record(
            redis,
            box.id,
            operation_id,
            PHASE_CREATING,
            "Replacing the computer"
            + (" (keeping its files)" if preserve_data else " (wiping its files)"),
        )
        try:
            state = await host.run_state(box.provider_box_id)
            if state != "running":
                await self.check_capacity(repository, host, box)
            if state is not None:
                if not preserve_data:
                    await migrations.record(
                        redis, box.id, operation_id, PHASE_WIPING, "Removing the files"
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
            box.last_active_at = box.last_ensured_at
            box.hibernated_at = None
            await repository.update(box, flush=True)
        except BoxHostError as error:
            await migrations.record(
                redis, box.id, operation_id, PHASE_FAILED, str(error)
            )
            log.warning("sand.box.recreate.failed", box=str(box.id), error=str(error))
            return RecreateOutcome(started=False, reason=str(error))
        await migrations.record(
            redis, box.id, operation_id, PHASE_DONE, "The computer is back"
        )
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
            host = await find_box_host(box.provider)
        except BoxHostError:
            return RUN_STATE_ABSENT, False
        if host is None:
            return RUN_STATE_ABSENT, False
        try:
            state = await host.run_state(box.provider_box_id)
        except BoxHostError as error:
            log.warning("sand.box.run_state.unknown", box=str(box.id), error=str(error))
            return RUN_STATE_ABSENT, False
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

    # --- capacity, sleep and wake ------------------------------------------------

    async def check_capacity(
        self, repository: SandBoxRepository, host: BoxHost, box: SandBox
    ) -> None:
        """Before a box is started on its server: refuse with the upstream app's
        blocked hold when the server's limit of others are awake on it. The
        app holds for `retry-after` and asks again
        (`BrokeredHostConnector.connect`); the sleeper frees room."""
        limit = host.max_running
        if limit <= 0:
            return
        awake = await repository.count_awake(host.name, excluding=box.id)
        if awake < limit:
            return
        log.warning(
            "sand.box.capacity.refused",
            box=str(box.id),
            user=str(box.user_id),
            server=host.name,
            awake=awake,
            limit=limit,
        )
        raise self._blocked()

    @staticmethod
    def _blocked() -> BoxBlocked:
        return BoxBlocked(
            CAPACITY_BLOCK_REASON,
            title=CAPACITY_BLOCK_TITLE,
            detail=CAPACITY_BLOCK_DETAIL,
            retry_after_s=CAPACITY_RETRY_AFTER_S,
        )

    async def place(self, repository: SandBoxRepository, box: SandBox) -> BoxHost:
        """The server a new box is made on: of the accepting servers with
        room, the one with the largest share of its limit free (a server
        with no limit counts as all free). None with room: the upstream app's
        blocked hold, the same one a full single server gave."""
        best: BoxHost | None = None
        best_free = -1.0
        for host in await resolve_box_hosts():
            if not host.accepting:
                continue
            limit = host.max_running
            awake = await repository.count_awake(host.name, excluding=box.id)
            if limit > 0 and awake >= limit:
                continue
            free = 1.0 if limit <= 0 else (limit - awake) / limit
            if free > best_free:
                best, best_free = host, free
        if best is None:
            log.warning(
                "sand.box.capacity.refused", box=str(box.id), user=str(box.user_id)
            )
            raise self._blocked()
        log.info("sand.box.placed", box=str(box.id), server=best.name)
        return best

    async def health_of(self, box: SandBox) -> BoxHealth:
        url = self.internal_url(box, GATEWAY_PORT)
        if url is None:
            return BoxHealth(reachable=False)
        return await _health_report(url, box.gateway_token)

    async def hibernate(
        self,
        db: AsyncSession,
        host: BoxHost,
        box: SandBox,
        *,
        force: bool,
        health: BoxHealth | None = None,
    ) -> RecreateOutcome:
        """`AdminHibernateSandBox`'s rule: a busy box is left running
        (`reason` "busy") unless `force`. The container is stopped, never
        removed: its volumes, its credential and its tokens are kept, so
        EnsureSandBox or a wake starts the same box again."""
        if not force:
            health = health or await self.health_of(box)
            if health.holds_awake:
                return RecreateOutcome(started=False, reason="busy")
        await host.stop(box.provider_box_id)
        box.state = "hibernated"
        box.hibernated_at = utc_now()
        await SandBoxRepository.from_session(db).update(box, flush=True)
        log.info("sand.box.hibernated", box=str(box.id), user=str(box.user_id))
        return RecreateOutcome(started=True)

    async def hibernate_idle(self, db: AsyncSession, redis: Redis) -> list[UUID]:
        """The sleeper, every minute (`box_tasks.py`): each box the broker
        left running on this host is asked how it is; one that holds work
        stays awake and has its `last_active_at` moved; one that has been
        idle for `SIMEON_BOX_IDLE_HIBERNATE_AFTER`, and that no app is
        attached to through the proxy, is put to sleep."""
        after = settings.BOX_IDLE_HIBERNATE_AFTER
        if after.total_seconds() <= 0:
            return []
        try:
            hosts = await resolve_box_hosts()
        except BoxHostError:
            return []
        repository = SandBoxRepository.from_session(db)
        now = utc_now()
        slept: list[UUID] = []
        for host, box in [
            (host, box)
            for host in hosts
            for box in await repository.list_awake(host.name)
        ]:
            try:
                state = await host.run_state(box.provider_box_id)
            except BoxHostError as error:
                log.warning("sand.box.sleep.unknown", box=str(box.id), error=str(error))
                continue
            if state != "running":
                # Stopped or removed outside the broker: record it.
                box.state = "hibernated" if state == "stopped" else "absent"
                await repository.update(box, flush=True)
                continue
            health = await self.health_of(box)
            if health.holds_awake:
                box.last_active_at = now
                await repository.update(box, flush=True)
                continue
            if health.last_busy_at_ms is not None:
                last_busy = datetime.fromtimestamp(health.last_busy_at_ms / 1000, UTC)
                if box.last_active_at is None or last_busy > box.last_active_at:
                    box.last_active_at = min(last_busy, now)
                    await repository.update(box, flush=True)
            if await is_attached(redis, box.id):
                continue
            idle_since = box.last_active_at or box.last_ensured_at or box.created_at
            if now - idle_since < after:
                continue
            try:
                outcome = await self.hibernate(
                    db, host, box, force=False, health=health
                )
            except BoxHostError as error:
                log.warning("sand.box.sleep.failed", box=str(box.id), error=str(error))
                continue
            if outcome.started:
                slept.append(box.id)
        return slept

    async def wake(self, db: AsyncSession, user_id: UUID) -> str:
        """Start a sleeping box so it drains what the server queued for it
        (a routine's fire, a listener event, a shared room's turn): the
        notify bus reaches only a box that runs. Answers what it did, for
        the log: `awake`, `woken`, `deferred` (the host is full; the box
        drains at its next start), `no-box`."""
        repository = SandBoxRepository.from_session(db)
        box = await repository.get_by_user(user_id)
        if box is None:
            return "no-box"
        try:
            host = await find_box_host(box.provider)
        except BoxHostError:
            return "no-box"
        if host is None:
            return "no-box"
        state = await host.run_state(box.provider_box_id)
        if state is None:
            box.state = "absent"
            await repository.update(box, flush=True)
            return "no-box"
        if state == "running":
            if box.state != "running":
                box.state = "running"
                await repository.update(box, flush=True)
            return "awake"
        try:
            await self.check_capacity(repository, host, box)
        except BoxBlocked:
            return "deferred"
        await host.start(box.provider_box_id)
        inspected = await host.inspect(box.provider_box_id)
        if inspected is not None:
            self._apply(box, inspected)
            self.stamp_urls(box)
        box.state = "running"
        box.last_active_at = utc_now()
        box.hibernated_at = None
        await repository.update(box, flush=True)
        log.info("sand.box.woken", box=str(box.id), user=str(user_id))
        return "woken"

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
    # credential: a child `desktop_sessions` row with the `simeon_db_`
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
            or not token.startswith(BOX_CREDENTIAL_PREFIXES)
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
    "BoxHealth",
    "MigrationLog",
    "RecreateOutcome",
    "broker",
    "mark_attached",
    "migrations",
    "set_health_check_for_tests",
    "set_health_report_for_tests",
]
