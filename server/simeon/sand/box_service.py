"""The box broker's logic (25 September 2026): find or create the
person's cloud box, answer where it is, recreate it, watch a recreate,
and mint the local-exec daemon's credential.

What is reused, not built: the box credential (`DesktopService.
issue_box_credential`, the `simeon_db_` child row the box trades at
`POST /sand-box/inference-credential`), the token helpers
(`simeon.kit.crypto`), and the `docker run` of the Mac's local path
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
from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx
import structlog
from sqlalchemy import text

from simeon.config import settings
from simeon.desktop.repository import DesktopSessionRepository
from simeon.desktop.service import DesktopUnauthenticated, desktop
from simeon.desktop.tokens import (
    ACCESS_TOKEN_PREFIX,
    BOX_CREDENTIAL_PREFIX,
    BOX_CREDENTIAL_PREFIXES,
)
from simeon.kit.crypto import generate_token_hash_pair, get_token_hash
from simeon.kit.utils import generate_uuid, utc_now
from simeon.models import DesktopSession, SandBox
from simeon.postgres import AsyncReadSession, AsyncSession
from simeon.redis import Redis
from simeon.user.repository import UserRepository

from . import box_store
from .box_e2b import KIND as E2B_KIND
from .box_e2b import TRAFFIC_HEADER as E2B_TRAFFIC_HEADER
from .box_hosts import (
    EGRESS_TUNNEL_PORT,
    EVERYONE,
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

#: `simeon.v1.SandBoxRunState`
RUN_STATE_UNSPECIFIED = 0
RUN_STATE_ABSENT = 1
RUN_STATE_HIBERNATED = 2
RUN_STATE_RUNNING = 3

#: `simeon.v1.SandBoxMigrationPhase`
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


#: Where a new box's credential is written and committed before the box
#: starts (`_mint_credential`): the request's sessionmaker, or the
#: worker's for the sleeper's update (`box_tasks.py`).
type SessionOpener = Callable[[], AbstractAsyncContextManager[AsyncSession]]


@dataclass(frozen=True)
class OutOfDate:
    """What a box runs that is no longer current: the host program (a newer
    engine was published), the image, or a box made before backups."""

    host: bool = False
    image: bool = False
    store: bool = False

    def __bool__(self) -> bool:
        return self.host or self.image or self.store


class BoxEnsureInProgress(Exception):
    """Another request is already creating, starting or checking this
    person's box (4 October 2026). `EnsureSandBox` answers it the way it
    answers a box still starting: unavailable, retry in five seconds."""


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

#: `(url, gateway token)`, and `headers=` the dial needs beyond the
#: token (an E2B box's traffic token, `dial_headers`); given only when there
#: are some, so a check written for Docker boxes takes two arguments.
HealthCheck = Callable[..., Awaitable[bool]]


def _with(token: str, headers: Mapping[str, str] | None) -> dict[str, str]:
    return {**(headers or {}), "authorization": f"Bearer {token}"}


async def gateway_health(
    url: str, token: str, *, headers: Mapping[str, str] | None = None
) -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{url}/health", headers=_with(token, headers))
        return response.status_code == 200
    except httpx.HTTPError:
        return False


async def gateway_token_rejected(
    url: str, token: str, *, headers: Mapping[str, str] | None = None
) -> bool:
    """True only when the box's gateway answers `/health` with 401: it
    runs with another token than the row's, so the container answering is
    not the one the row describes (Render, 4 October 2026). A host still
    starting refuses the connection instead, and that is waiting, not a
    mismatch; the gateway checks nothing but the token on this route
    (`gateway-server.ts`)."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{url}/health", headers=_with(token, headers))
        return response.status_code == 401
    except httpx.HTTPError:
        return False


async def _never_rejected(url: str, token: str, **_: Any) -> bool:
    return False


_health_check: HealthCheck = gateway_health
_token_check: HealthCheck = gateway_token_rejected

#: How long the box gets to finish its backup before its container is
#: replaced: the upstream app's own (`FLUSH_TIMEOUT_MS`,
#: `dev-box-recreate-plane.ts`).
FLUSH_TIMEOUT_S = 30.0


async def gateway_flush_box_store(
    url: str, token: str, *, headers: Mapping[str, str] | None = None
) -> bool:
    """The box's backup brought up to date now (`snapshotBoxStoreNow`,
    the upstream app's step before it replaces a container): True when the
    box says every file is in the backup."""
    try:
        async with httpx.AsyncClient(timeout=FLUSH_TIMEOUT_S) as client:
            response = await client.post(
                f"{url}/api/snapshotBoxStoreNow",
                headers=_with(token, headers),
                json={"includeIdleOnly": True},
            )
        if response.status_code != 200:
            return False
        body = response.json()
    except (httpx.HTTPError, ValueError):
        return False
    return isinstance(body, dict) and body.get("ok") is True


_flush_box_store: HealthCheck = gateway_flush_box_store


def set_flush_for_tests(flush: HealthCheck | None) -> None:
    global _flush_box_store
    _flush_box_store = flush or gateway_flush_box_store


def set_health_check_for_tests(
    check: HealthCheck | None, token_rejected: HealthCheck | None = None
) -> None:
    """A fake health check has no gateway to ask, so with one the token is
    never rejected unless the test says when (`token_rejected`)."""
    global _health_check, _token_check
    _health_check = check or gateway_health
    if token_rejected is not None:
        _token_check = token_rejected
    else:
        _token_check = _never_rejected if check is not None else gateway_token_rejected


# --- sleep: what the box says about itself ------------------------------------------
#
# The upstream app's contract, read from the host and the generated protos
# (28 September 2026). The host answers `GET /health` with `isBusy`,
# `busyOnlyAwaitingApproval` and `lastBusyAtMs` (`gateway-server.ts`,
# `SandHost.getHealth`): busy while a turn, a background shell, a carried
# wake or a mid-drain revival runs, and `lastBusyAtMs` moves only while
# busy on something other than an approval card. the upstream's server read the
# same pair (`AdminSandBoxHostStatusResponse.is_busy`, `last_busy_at_ms`),
# kept `last_active_at_ms` per pod (`TeamMemberSandBoxPod`), hibernated a
# pod with `AdminHibernateSandBox(force)`, which answers `started`/`reason`,
# and reported `SAND_BOX_RUN_STATE_HIBERNATED`, which the window draws as
# "sleeping" and "Waking your computer…". How long the upstream app waited before
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


HealthReport = Callable[..., Awaitable[BoxHealth]]


async def gateway_health_report(
    url: str, token: str, *, headers: Mapping[str, str] | None = None
) -> BoxHealth:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{url}/health", headers=_with(token, headers))
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


# A box the sleeper sent to be updated is not sent again for this long:
# the update runs once, or, if it found the box busy or failed, is tried
# again after it.
UPDATE_RETRY_SECONDS = 600

# An out-of-date box is replaced by the sleeper only once nobody has used
# it for this long, or for its server's idle time if that is shorter (22
# October 2026). Before, it was replaced the minute a turn ended with no app
# attached, and a phone in a pocket is not attached: someone who looked
# away for two minutes came back to a computer being swapped, and what they
# sent meanwhile reached a sandbox that no longer existed.
UPDATE_QUIET = timedelta(minutes=10)


def update_key(box_id: UUID) -> str:
    return f"sand:box:update:{box_id}"


# --- reaching a box ------------------------------------------------------------


def dial_headers(box: SandBox) -> dict[str, str]:
    """What the API sends to a box besides its own request: an E2B box's
    traffic token, without which E2B's proxy refuses the request (public
    traffic to the box is off, `box_e2b.py`). Empty for Docker."""
    token = (box.host_meta or {}).get("traffic_token")
    return {E2B_TRAFFIC_HEADER: token} if token else {}


def _dial(box: SandBox) -> dict[str, Any]:
    """`dial_headers` as the gateway checks take it: only when there are
    some, so a check written for Docker boxes keeps its two arguments."""
    headers = dial_headers(box)
    return {"headers": headers} if headers else {}


# --- the image -------------------------------------------------------------------


async def image_for(db: AsyncSession, user_id: UUID) -> str:
    """The image a person's box runs: `SIMEON_BOX_IMAGE_TRIAL` for the
    accounts in `SIMEON_BOX_IMAGE_TRIAL_USERS` (an e-mail address or a user
    id each), the pinned image (`box_image_reference`) for everyone else."""
    trial = settings.BOX_IMAGE_TRIAL.strip()
    listed = {
        entry.strip().lower()
        for entry in settings.BOX_IMAGE_TRIAL_USERS.split(",")
        if entry.strip()
    }
    if trial and listed:
        if str(user_id).lower() in listed:
            return trial
        if any("@" in entry for entry in listed):
            user = await UserRepository.from_session(db).get_by_id(user_id)
            if user is not None and user.email.lower() in listed:
                return trial
    return box_image_reference()


# --- moving between servers ---------------------------------------------------

#: After a move that failed, how long a box stays where it is before the
#: next try, so a server that cannot make computers (an E2B template not
#: built) is not asked again at every EnsureSandBox. Per API process.
MOVE_HOLD_S = 30 * 60.0
_move_held: dict[UUID, float] = {}


# --- the running clock --------------------------------------------------------
#
# The meter (`plans.report_usage`) sends each box's running seconds from
# `usage_metered_at` (or, before its first send, `last_ensured_at`) to now
# while it runs, or to `hibernated_at` once it sleeps. Until 16 October 2026
# nothing moved that mark when a box woke, so the next send counted the
# whole sleep as running time. A box that starts running again has its mark
# moved past the sleep, keeping the seconds it ran before the sleep that
# were not sent yet; a box that was found stopped records when.


def mark_running(box: SandBox, now: datetime | None = None) -> None:
    """The box runs from `now` (a wake, a start, a new container)."""
    now = now or utc_now()
    if box.state != "running":
        since = box.usage_metered_at or box.last_ensured_at
        if since is not None:
            stopped = box.hibernated_at
            unsent = (
                stopped - since
                if stopped is not None and stopped > since
                else timedelta(0)
            )
            box.usage_metered_at = now - unsent
    box.state = "running"


def mark_stopped(box: SandBox, state: str, now: datetime | None = None) -> None:
    """The box was found not running ("hibernated" or "absent") outside
    the broker's own sleep: it is counted as running until now, the
    moment it was seen, as the meter did while the row said running."""
    if box.state == "running" and box.hibernated_at is None:
        box.hibernated_at = now or utc_now()
    box.state = state


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
        """Where the API itself reaches a port, for the proxy and the health
        check: the box host's published port (Docker), or E2B's
        `https://<port>-<sandbox>.<domain>`, which wants the box's traffic
        token as well (`dial_headers`)."""
        if (box.host_meta or {}).get("kind") == E2B_KIND:
            return f"https://{inner_port}-{box.provider_box_id}.{box.host_address}"
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
        self,
        db: AsyncSession,
        parent: DesktopSession,
        committed: SessionOpener | None = None,
    ) -> tuple[UUID, str]:
        """A new credential for the box about to start, and its row's id.

        Written and committed on a session of its own where the app gives
        one (`committed`), before the container starts (15 October 2026).
        Written on the request's session, it was saved only when the
        request ended, and `ensure` ends only after the box answers, up to
        `BOX_READY_TIMEOUT` later. The box's first act is to copy its
        backup in with that credential (`box-copy-in.ts`), so every copy
        was refused (401, "Sand inference-credential renewal failed"),
        three times, until the box gave up and started without its backup:
        its Chrome sign-ins lost and its backups paused. The test client
        gives no sessionmaker and keeps the request's session."""
        try:
            if committed is None:
                row, credential = await desktop.issue_box_credential(db, parent)
                return row.id, credential
            async with committed() as fresh:
                own = await fresh.get(DesktopSession, parent.id)
                if own is None:
                    raise DesktopUnauthenticated("This desktop session has expired.")
                row, credential = await desktop.issue_box_credential(fresh, own)
                await fresh.commit()
                return row.id, credential
        except DesktopUnauthenticated as error:
            raise BoxBrokerRefused("unauthenticated", error.message)

    async def _revive_credential(
        self,
        db: AsyncSession,
        parent: DesktopSession,
        box: SandBox,
        *,
        committed: SessionOpener | None = None,
    ) -> bool:
        """The box's own credential made good again for the app signing in
        (`DesktopService.revive_box_credential`), instead of a new box to
        carry a new one (20 October 2026). Committed on a session of its
        own where the app gives one, as `_mint_credential` writes a new
        one: the box asks with it the moment it wakes, before `ensure`
        ends. Whether it is good now."""
        if box.credential_session_id is None:
            return False
        if committed is None:
            revived = await desktop.revive_box_credential(
                db, box.credential_session_id, parent
            )
        else:
            async with committed() as fresh:
                own = await fresh.get(DesktopSession, parent.id)
                revived = own is not None and await desktop.revive_box_credential(
                    fresh, box.credential_session_id, own
                )
                if revived:
                    await fresh.commit()
        if revived:
            log.info(
                "sand.box.credential_revived",
                box=str(box.id),
                user=str(parent.user_id),
            )
        return revived

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
        # E2B gives a box's traffic token only when it is made: a later read
        # of the same box (`inspect`) keeps the one stored.
        same = box.provider_box_id == provisioned.provider_box_id
        box.provider_box_id = provisioned.provider_box_id
        box.host_address = provisioned.host_address
        box.ports = {str(k): v for k, v in provisioned.ports.items()}
        box.image = provisioned.image
        box.image_digest = provisioned.image_digest
        box.host_meta = (
            {**(box.host_meta or {}), **provisioned.host_meta}
            if same
            else dict(provisioned.host_meta)
        )

    async def _create(
        self,
        db: AsyncSession,
        host: BoxHost,
        parent: DesktopSession,
        box: SandBox,
        *,
        restore: str | None = None,
        committed: SessionOpener | None = None,
    ) -> None:
        """A new container for the row. With backups on (`box_store.py`)
        it backs itself up, and copies the last backup in before its host
        starts: `restore="always"` after the old container's backup was
        brought up to date (its Chrome and app sign-ins live outside the
        two volumes) or to recover the computer from it; `"never"` after a
        reset; by default only onto an empty data volume, and only when
        there is a backup (or S3 could not say)."""
        extra_env: dict[str, str] = {}
        labels: dict[str, str] = {}
        if box_store.enabled():
            if restore == "never":
                restore = None
            elif restore != "always":
                has = await asyncio.to_thread(box_store.has_backup, parent.user_id)
                restore = None if has is False else "fresh"
            extra_env = box_store.box_env(parent.user_id, restore=restore)
            labels = {box_store.LABEL: box_store.LABEL_VALUE}
        credential_id, credential = await self._mint_credential(db, parent, committed)
        box.credential_session_id = credential_id
        box.gateway_token = box.gateway_token or secrets.token_hex(32)
        box.network_token = box.network_token or secrets.token_hex(32)
        workspace, data = self.volumes(box.id)
        image = await self._image_on(db, host, parent.user_id)
        if image not in (box_image_reference(), getattr(host, "image_reference", None)):
            log.info("sand.box.image_trial", box=str(box.id), image=image)
        spec = BoxSpec(
            name=f"simeon-box-{box.id.hex}",
            gateway_token=box.gateway_token,
            renewal_credential=credential,
            backend_url=settings.BASE_URL,
            image=image,
            workspace_volume=workspace,
            data_volume=data,
            memory_mb=max(settings.BOX_MEMORY_LIMIT_MB, 0),
            cpus=max(settings.BOX_CPU_LIMIT, 0.0),
            extra_env=extra_env,
            labels=labels,
        )
        provisioned = await host.create(spec)
        if box_store.enabled():
            log.info(
                "sand.box.store",
                box=str(box.id),
                restore=restore or "none",
            )
        box.provider = host.name
        mark_running(box)
        self._apply(box, provisioned)

    @staticmethod
    async def _image_on(db: AsyncSession, host: BoxHost, user_id: UUID) -> str:
        """What a box on this server should run: the server's own (an E2B
        template, `image_reference`), else the person's image (`image_for`)."""
        own = getattr(host, "image_reference", None)
        return own if isinstance(own, str) and own else await image_for(db, user_id)

    @staticmethod
    async def _listed_on(
        db: AsyncSession | AsyncReadSession, user_id: UUID, hosts: list[BoxHost]
    ) -> list[BoxHost]:
        """The servers that name this person in their `users`
        (`SIMEON_BOX_HOSTS`), or everyone (`EVERYONE`): theirs."""
        listing = [host for host in hosts if getattr(host, "users", ())]
        if not listing:
            return []
        names = {str(user_id).lower(), EVERYONE}
        if any("@" in user for host in listing for user in getattr(host, "users")):
            user = await UserRepository.from_session(db).get_by_id(user_id)
            if user is not None:
                names.add(user.email.lower())
        return [host for host in listing if names & set(getattr(host, "users", ()))]

    async def _move_if_listed(
        self,
        db: AsyncSession,
        repository: SandBoxRepository,
        parent: DesktopSession,
        box: SandBox,
        host: BoxHost,
        *,
        committed: SessionOpener | None,
    ) -> BoxHost | None:
        """A person listed on another server (`users`) whose box is still on
        this one gets a new box there, through the backup, when the box is
        idle: its backup is brought up to date (a sleeping one was when it
        went to sleep), the old box is stopped, not removed, so its files stay
        where they were, and the new box copies the backup in. The server it
        moved to, or None when it stays (not listed elsewhere, busy, or no
        backup to carry its files)."""
        held = _move_held.get(box.id)
        if held is not None and time.monotonic() < held:
            return None
        hosts = await resolve_box_hosts()
        listed = await self._listed_on(db, parent.user_id, hosts)
        if not listed or any(h.name == host.name for h in listed):
            return None
        targets = [h for h in listed if h.accepting]
        if not targets:
            return None
        # Room is looked for before anything is stopped: a full server
        # leaves the computer working where it is, and the next start tries
        # again (17 October 2026, E2B for everyone, 20 at once at most).
        target: BoxHost | None = None
        for candidate in targets:
            if await self._has_room(repository, candidate, box):
                target = candidate
                break
        if target is None:
            log.info(
                "sand.box.move_deferred",
                box=str(box.id),
                to=",".join(h.name for h in targets),
                reason="full",
            )
            return None
        if not box_store.enabled():
            log.warning(
                "sand.box.move_skipped",
                box=str(box.id),
                to=target.name,
                reason="no backups",
            )
            return None
        state = await host.run_state(box.provider_box_id)
        if state == "running":
            if (await self.health_of(box)).is_busy:
                log.info("sand.box.move_deferred", box=str(box.id), reason="busy")
                return None
            if not await self.flush_box_store(
                box, await host.inspect(box.provider_box_id)
            ):
                log.warning("sand.box.move_deferred", box=str(box.id), reason="backup")
                return None
            await host.stop(box.provider_box_id)
        elif state == "stopped":
            if await asyncio.to_thread(box_store.has_backup, parent.user_id) is False:
                log.warning(
                    "sand.box.move_skipped", box=str(box.id), reason="no backup"
                )
                return None
        old = (host.name, box.provider_box_id)
        try:
            await self._create(
                db, target, parent, box, restore="always", committed=committed
            )
        except BoxHostError as error:
            # The new computer did not come up (16 October 2026: a template
            # not built yet). Asking for its credential replaced the old
            # computer's, so the old one is made again where it was, with a
            # fresh credential and its files (the caller's next step, as for
            # any dead credential), and no move is tried again for a while.
            log.warning(
                "sand.box.move_failed",
                box=str(box.id),
                to=target.name,
                error=str(error),
            )
            box.credential_session_id = None
            _move_held[box.id] = time.monotonic() + MOVE_HOLD_S
            return None
        log.info(
            "sand.box.moved",
            box=str(box.id),
            user=str(parent.user_id),
            frm=old[0],
            old_box=old[1],
            to=target.name,
            new_box=box.provider_box_id,
        )
        return target

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

    async def _out_of_date(
        self, db: AsyncSession, host: BoxHost, box: SandBox
    ) -> tuple[ProvisionedBox | None, OutOfDate]:
        """The box as its server reports it, and what it runs that is no
        longer current. The Mac's rules (local-docker-host-connector.ts): a
        container whose host program is not the current bundle
        (`localDockerContainerNeedsReplace`), or that runs another image
        than the one configured (the Mac refuses it), is replaced on the
        same volumes. A box made before 29 September mounts no host at all;
        one on a later image than the pinned one runs the image's own host
        from /opt/sand and never reads the mounted one. One made before
        backups were switched on (`box_store.py`) is replaced the same way."""
        current = await host.inspect(box.provider_box_id)
        stale_image = stale_store = False
        if current is not None:
            stale_image = current.image != await self._image_on(db, host, box.user_id)
            stale_store = (
                box_store.enabled() and current.box_store != box_store.LABEL_VALUE
            )
        expected_host = getattr(host, "expected_host_sha256", None)
        stale_host = expected_host is not None and (
            current is None or current.host_sha256 != expected_host
        )
        return current, OutOfDate(host=stale_host, image=stale_image, store=stale_store)

    async def _token_rejected(self, box: SandBox) -> bool:
        url = self.internal_url(box, GATEWAY_PORT)
        if url is None:
            return False
        return await _token_check(url, box.gateway_token, **_dial(box))

    async def wait_ready(self, box: SandBox) -> bool:
        url = self.internal_url(box, GATEWAY_PORT)
        if url is None:
            return False
        deadline = utc_now() + settings.BOX_READY_TIMEOUT
        while True:
            if await _health_check(url, box.gateway_token, **_dial(box)):
                return True
            if utc_now() >= deadline:
                return False
            await asyncio.sleep(self.ready_poll)

    async def ensure(
        self,
        db: AsyncSession,
        caller: DesktopSession,
        *,
        committed: SessionOpener | None = None,
    ) -> SandBox:
        """`EnsureSandBox`: the person's box, created, started or reused,
        with its URLs stamped. Raises `BoxBrokerRefused` (a Connect code
        and a sentence) and `BoxHostError`. `committed` writes a new box's
        credential before the box starts (`_mint_credential`)."""
        parent = await self._parent_of(db, caller)
        # One ensure per person at a time (Render, 4 October 2026). The page,
        # the Mac app and its helper all ask within seconds of each other,
        # and two of them creating a container at once left the row naming
        # one container and the server running another. The lock lives with
        # this transaction; a second caller is told to come back in a moment.
        await self._take_ensure_lock(db, parent.user_id)
        repository = SandBoxRepository.from_session(db)
        box = await repository.get_by_user(parent.user_id)
        # A box stays on the server it was made on: its volumes live there.
        host = await find_box_host(box.provider) if box is not None else None
        if host is None:
            # Raises the app's one sentence when no server is configured.
            await resolve_box_hosts()
        created = False
        if box is not None and host is not None:
            moved_to = await self._move_if_listed(
                db, repository, parent, box, host, committed=committed
            )
            if moved_to is not None:
                host = moved_to
                created = True
        if created:
            assert box is not None
            assert host is not None
        elif box is not None and host is not None:
            state = await host.run_state(box.provider_box_id)
            credential_live = await self._credential_is_live(db, box)
            if state is not None and not credential_live:
                credential_live = await self._revive_credential(
                    db, parent, box, committed=committed
                )
            current: ProvisionedBox | None = None
            stale = OutOfDate()
            if state is not None and credential_live:
                current, stale = await self._out_of_date(db, host, box)
            stale_host, stale_image, stale_store = stale.host, stale.image, stale.store
            if (
                (stale_host or stale_image or stale_store)
                and state == "stopped"
                and credential_live
                and getattr(host, "keeps_files", True) is False
            ):
                # Its files live on its own disk (E2B), not on volumes that
                # outlive it: it is woken so its backup can be brought up to
                # date before it is replaced, below.
                await self.check_capacity(repository, host, box)
                await host.start(box.provider_box_id)
                state = "running"
            if (stale_host or stale_image or stale_store) and state == "running":
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
                        stale_store=stale_store,
                    )
                    stale_host = stale_image = stale_store = False
            if (
                state is None
                or not credential_live
                or stale_host
                or stale_image
                or stale_store
            ):
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
                    stale_store=stale_store,
                )
                if state != "running":
                    await self.check_capacity(repository, host, box)
                flushed = state == "running" and await self.flush_box_store(
                    box, current
                )
                if flushed and credential_live and (await self.health_of(box)).is_busy:
                    # Only out of date, and a message came while its backup
                    # was made: the backup does not have it, and its turn
                    # would die with the old container. Opening the app
                    # starts this replacement (Sage's computer, 21 October
                    # 2026: asked for at 18:31:33, the old sandbox gone at
                    # 18:31:41), so the first thing typed can land in it. It
                    # keeps its program until it is idle again.
                    log.info("sand.box.update_deferred", box=str(box.id), reason="busy")
                    mark_running(box)
                elif (
                    not flushed
                    and state == "running"
                    and credential_live
                    and getattr(host, "keeps_files", True) is False
                ):
                    # Only out of date, and its files live on its own disk
                    # (E2B): it stays as it is until its backup can be
                    # brought up to date, rather than lose what is not in it.
                    log.warning(
                        "sand.box.update_deferred", box=str(box.id), reason="backup"
                    )
                    mark_running(box)
                else:
                    if state is not None:
                        await host.remove(box.provider_box_id, volumes=[])
                    await self._create(
                        db,
                        host,
                        parent,
                        box,
                        restore="always" if flushed else None,
                        committed=committed,
                    )
                    created = True
            elif state == "stopped":
                await self.check_capacity(repository, host, box)
                await host.start(box.provider_box_id)
                inspected = await host.inspect(box.provider_box_id)
                if inspected is not None:
                    self._apply(box, inspected)
                mark_running(box)
            else:
                inspected = await host.inspect(box.provider_box_id)
                if inspected is not None:
                    self._apply(box, inspected)
                mark_running(box)
                if await self._token_rejected(box):
                    # The container answers, with another token than the
                    # row's: it is not the one this row describes (Render,
                    # 4 October 2026: a recreate and an ensure creating at
                    # once left the row naming one container and the server
                    # running another, and from then on every health check
                    # and every request of the Mac's helper got 401, for
                    # good). Replaced on the same volumes, with fresh tokens.
                    log.warning(
                        "sand.box.ensure.token_rejected",
                        box=str(box.id),
                        url=self.internal_url(box, GATEWAY_PORT),
                    )
                    await host.remove(box.provider_box_id, volumes=[])
                    box.gateway_token = ""
                    box.network_token = ""
                    await self._create(db, host, parent, box, committed=committed)
                    created = True
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
                await self._create(db, host, parent, box, committed=committed)
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
        # The wait comes before the row is written (Render, 4 October 2026).
        # Written first, the row stayed locked by this transaction for the
        # whole wait, up to ninety seconds; every other EnsureSandBox for the
        # same person then blocked on that lock until the database's
        # statement timeout killed it, and the window could not connect.
        ready = await self.wait_ready(box)
        if not ready:
            log.warning(
                "sand.box.ensure.not_ready",
                box=str(box.id),
                url=self.internal_url(box, GATEWAY_PORT),
                waited_s=settings.BOX_READY_TIMEOUT.total_seconds(),
            )
        box.last_ensured_at = utc_now()
        box.last_active_at = box.last_ensured_at
        box.hibernated_at = None
        await repository.update(box, flush=True)
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

    @staticmethod
    async def _take_ensure_lock(db: AsyncSession, user_id: UUID) -> None:
        """A transaction-scoped advisory lock on the person: released with
        the request's commit or rollback, never left behind."""
        taken = await db.scalar(
            text("SELECT pg_try_advisory_xact_lock(hashtext(:key))"),
            {"key": f"sand-box-ensure:{user_id}"},
        )
        if not taken:
            raise BoxEnsureInProgress()

    @staticmethod
    async def ensure_in_progress(db: AsyncSession, user_id: UUID) -> bool:
        """Whether an ensure holds the person's lock right now (an update or
        a recreate replacing their box), read from `pg_locks` without taking
        it, so an EnsureSandBox at the same moment is never refused for it.
        A one-key advisory lock shows its key's high 32 bits as `classid`
        and its low 32 bits as `objid`, with `objsubid` 1."""
        held = await db.scalar(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_locks"
                " WHERE locktype = 'advisory' AND granted AND objsubid = 1"
                " AND database = (SELECT oid FROM pg_database"
                " WHERE datname = current_database())"
                " AND classid = ((hashtext(:key)::bigint >> 32) & 4294967295)::oid"
                " AND objid = (hashtext(:key)::bigint & 4294967295)::oid)"
            ),
            {"key": f"sand-box-ensure:{user_id}"},
        )
        return bool(held)

    async def recreate(
        self,
        db: AsyncSession,
        caller: DesktopSession,
        *,
        redis: Redis,
        preserve_data: bool,
        force: bool,
        committed: SessionOpener | None = None,
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
        # The same one-at-a-time lock as `ensure`: a recreate that removed
        # and created while an ensure was creating too is how the row came
        # to name one container while another ran (Render, 4 October 2026).
        await self._take_ensure_lock(db, parent.user_id)
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
            # With backups on, the upstream app's three
            # (`dev-box-recreate-plane.ts`): an update brings the backup up to
            # date, then swaps the container on the same files; a recovery
            # (force) does the same as far as the box answers, wipes the
            # agents' data and boots from the backup; a reset wipes the data
            # and the backup together. Without backups, as before.
            backups = box_store.enabled()
            recover = backups and force and not preserve_data
            flushed = False
            if state == "running" and backups and (preserve_data or recover):
                await migrations.record(
                    redis, box.id, operation_id, PHASE_BACKING_UP, "Saving a backup"
                )
                flushed = await self.flush_box_store(
                    box, await host.inspect(box.provider_box_id)
                )
            if state is not None:
                if not preserve_data:
                    await migrations.record(
                        redis, box.id, operation_id, PHASE_WIPING, "Removing the files"
                    )
                await host.remove(
                    box.provider_box_id,
                    volumes=[]
                    if preserve_data
                    else [data]
                    if recover
                    else [workspace, data],
                )
            if backups and not preserve_data and not recover:
                try:
                    await asyncio.to_thread(box_store.clear_box_store, parent.user_id)
                except Exception as error:
                    # The new box starts empty either way ("never"), and its
                    # first backup replaces the old manifest.
                    log.warning(
                        "sand.box.store.clear_failed", box=str(box.id), error=str(error)
                    )
            # A new credential, so the new container never carries one a
            # previous container exposed.
            box.gateway_token = ""
            box.network_token = ""
            restore: str | None = None
            if recover or flushed:
                restore = "always"
            elif backups and not preserve_data:
                restore = "never"
            await self._create(
                db, host, parent, box, restore=restore, committed=committed
            )
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
        which the host inside it now asks about (ComputerService is in the
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
        if state == "running":
            mark_running(box)
        else:
            mark_stopped(box, "hibernated" if state == "stopped" else "absent")
        await repository.update(box, flush=True)
        if state == "running":
            # Out of date (19 October 2026): a newer engine was published
            # while it ran. Answered false always until then, the apps took
            # the computer as current and never offered "Update Simeon's
            # Computer" ("/" and Search on the iPhone, the Mac's sidebar).
            _, stale = await self._out_of_date(db, host, box)
            return RUN_STATE_RUNNING, bool(stale)
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

    @staticmethod
    async def _has_room(
        repository: SandBoxRepository, host: BoxHost, box: SandBox
    ) -> bool:
        limit = host.max_running
        if limit <= 0:
            return True
        return await repository.count_awake(host.name, excluding=box.id) < limit

    @staticmethod
    async def _roomiest(
        repository: SandBoxRepository, box: SandBox, hosts: list[BoxHost]
    ) -> BoxHost | None:
        """Of the accepting servers with room, the one with the largest share
        of its limit free (a server with no limit counts as all free)."""
        best: BoxHost | None = None
        best_free = -1.0
        for host in hosts:
            if not host.accepting:
                continue
            limit = host.max_running
            awake = await repository.count_awake(host.name, excluding=box.id)
            if limit > 0 and awake >= limit:
                continue
            free = 1.0 if limit <= 0 else (limit - awake) / limit
            if free > best_free:
                best, best_free = host, free
        return best

    async def place(self, repository: SandBoxRepository, box: SandBox) -> BoxHost:
        """The server a new box is made on (`_roomiest`). A person named on
        servers' `users` (or everyone, `EVERYONE`) is placed there; when
        none of those is accepting with room, on the servers that name
        nobody (`sand.box.placed_fallback`), and the box moves over at a
        later start (`_move_if_listed`). Everyone else goes on the servers
        that name nobody. None with room: the upstream app's blocked hold,
        the same one a full single server gave."""
        hosts = await resolve_box_hosts()
        listed = await self._listed_on(repository.session, box.user_id, hosts)
        unlisted = [h for h in hosts if not getattr(h, "users", ())]
        best = await self._roomiest(repository, box, listed or unlisted)
        if best is None and listed and unlisted:
            best = await self._roomiest(repository, box, unlisted)
            if best is not None:
                log.warning(
                    "sand.box.placed_fallback",
                    box=str(box.id),
                    user=str(box.user_id),
                    wanted=",".join(h.name for h in listed),
                    reason=("full" if any(h.accepting for h in listed) else "closed"),
                    server=best.name,
                )
        if best is None:
            log.warning(
                "sand.box.capacity.refused", box=str(box.id), user=str(box.user_id)
            )
            raise self._blocked()
        log.info("sand.box.placed", box=str(box.id), server=best.name)
        return best

    async def flush_box_store(
        self, box: SandBox, container: ProvisionedBox | None
    ) -> bool:
        """The running box's backup brought up to date, when it keeps one
        (`box_store.LABEL` on its container): True once it says so."""
        if container is None or container.box_store != box_store.LABEL_VALUE:
            return False
        url = self.internal_url(box, GATEWAY_PORT)
        if url is None:
            return False
        flushed = await _flush_box_store(url, box.gateway_token, **_dial(box))
        log.info("sand.box.store.flush", box=str(box.id), flushed=flushed)
        return flushed

    async def health_of(self, box: SandBox) -> BoxHealth:
        url = self.internal_url(box, GATEWAY_PORT)
        if url is None:
            return BoxHealth(reachable=False)
        return await _health_report(url, box.gateway_token, **_dial(box))

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

    async def hibernate_idle(
        self,
        db: AsyncSession,
        redis: Redis,
        *,
        update: Callable[[UUID], None] | None = None,
    ) -> list[UUID]:
        """The sleeper, every minute (`box_tasks.py`): each box the broker
        left running on this host is asked how it is; one that holds work
        stays awake and has its `last_active_at` moved; one that has been
        idle for `SIMEON_BOX_IDLE_HIBERNATE_AFTER`, and that no app is
        attached to through the proxy, is put to sleep. One that is idle,
        unattached and out of date is handed to `update` (the person's id)
        instead, at most once every `UPDATE_RETRY_SECONDS`."""
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
                mark_stopped(box, "hibernated" if state == "stopped" else "absent")
                await repository.update(box, flush=True)
                continue
            keep_alive = getattr(host, "keep_alive", None)
            if keep_alive is not None:
                # E2B pauses a box whose timeout passes; while it is awake,
                # the timeout is pushed out here, so the broker, not E2B,
                # decides when it sleeps (`box_e2b.py`).
                try:
                    await keep_alive(box.provider_box_id)
                except BoxHostError as error:
                    log.warning(
                        "sand.box.keep_alive_failed", box=str(box.id), error=str(error)
                    )
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
                # An app open on the box is the box in use, so its idle time
                # starts when the app goes (16 October 2026). The upstream
                # app's Mac asked for the box every 30 s while it was open
                # (`LOCAL_EXEC_DAEMON_REFRESH_INTERVAL_MS`, each an
                # EnsureSandBox, which stamps `last_active_at` here); until
                # then a box idle for 30 minutes with the app open slept
                # within a few minutes of the app closing (Render, 15
                # October 2026: asleep at 22:17:11, wanted at 22:18:47).
                box.last_active_at = now
                await repository.update(box, flush=True)
                continue
            idle_since = box.last_active_at or box.last_ensured_at or box.created_at
            # A server's own idle time (`idle_minutes` in SIMEON_BOX_HOSTS):
            # shorter where waking takes a second (E2B).
            idle_after = getattr(host, "idle_after", None) or after
            if (
                update is not None
                and health.reachable
                and not health.is_busy
                and now - idle_since >= min(UPDATE_QUIET, idle_after)
            ):
                # Updated once it is idle (19 October 2026). Until then a box
                # was updated only when an app connected to it idle:
                # published at 23:59:45 on 18 October, Rhea's box woke 12 s
                # later on the old engine (the server reads the published
                # version every 10 minutes) and kept it for hours. Nobody is
                # on its screen now (not attached) and nothing has run on it
                # for `UPDATE_QUIET`, so the swap interrupts no one.
                _, stale = await self._out_of_date(db, host, box)
                if stale:
                    try:
                        first = await redis.set(
                            update_key(box.id), "1", ex=UPDATE_RETRY_SECONDS, nx=True
                        )
                    except Exception:
                        first = False
                    if first:
                        log.info(
                            "sand.box.update_idle",
                            box=str(box.id),
                            stale_host=stale.host,
                            stale_image=stale.image,
                            stale_store=stale.store,
                        )
                        update(box.user_id)
                        continue
                    # Sent already: one the update could not replace still
                    # sleeps by the usual rule, rather than stay awake.
            if now - idle_since < idle_after:
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
            mark_stopped(box, "absent")
            await repository.update(box, flush=True)
            return "no-box"
        if state == "running":
            if box.state != "running":
                mark_running(box)
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
        mark_running(box)
        box.last_active_at = utc_now()
        box.hibernated_at = None
        await repository.update(box, flush=True)
        log.info("sand.box.woken", box=str(box.id), user=str(user_id))
        return "woken"

    async def update_idle(
        self, db: AsyncSession, user_id: UUID, *, committed: SessionOpener | None
    ) -> str:
        """The sleeper's update (`sand.box.update_idle`): the person's box,
        out of date, is replaced the way EnsureSandBox replaces it when an
        app connects to it idle (its backup brought up to date, a new
        container on the same files), on behalf of the desktop it belongs
        to. EnsureSandBox checks again, so a box busy by now keeps its
        program (`sand.box.update_deferred`). Answers what it did, for the
        log: `ensured` (`sand.box.ensure.recreate` says whether it was
        replaced), `no-box`, `signed-out`."""
        box = await SandBoxRepository.from_session(db).get_by_user(user_id)
        if box is None or box.credential_session_id is None:
            return "no-box"
        sessions = DesktopSessionRepository.from_session(db)
        credential = await sessions.get_one_or_none(
            sessions.get_base_statement().where(
                DesktopSession.id == box.credential_session_id
            )
        )
        parent = (
            await sessions.get_parent_of(credential) if credential is not None else None
        )
        if parent is None or parent.is_revoked:
            return "signed-out"
        await self.ensure(db, parent, committed=committed)
        return "ensured"

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
