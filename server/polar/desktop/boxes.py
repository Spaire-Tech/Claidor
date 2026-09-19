"""The person's computer, brokered.

The box is one persistent Linux machine per person — "my computer" to
them — where files, installed tools and browser logins survive across
turns and across days. It runs on E2B, locked by the founder on
18 September: *"i did mean e2b. lets lock e2b."*

**The desktop app never talks to E2B, and this module is why.** The
founder, 16 September: *"my users should never put a key. everything
happens under the hood. not a setting."* So the E2B key is Claidor's.
And a key that ships inside an Electron app is a published key: anyone
with the app has it, and one extracted key bills every box we run. The
app therefore holds an opaque handle and a stream address, never a key
and never a sandbox id — because a sandbox id plus the key is the whole
of the authority over somebody's computer.

That is the same shape this server already has twice: the metered model
proxy, and Composio's key in `polar/desktop/composio.py`. This is a
third instance of a pattern, not a new one.

**What is different, and it is the thing to understand here: a box costs
money while nobody is using it.** Every other line in this module's
neighbourhood bills for work somebody asked for. A box bills for
existing. Three consequences run through everything below:

1. Awake time is settled in **slices**, on every call that touches the
   box, rather than once when it stops. A box awake for a week cannot
   arrive as one surprise at the end, and a server that restarts cannot
   lose the week.
2. A box is **paused, not killed**, when it is idle. Pausing stops the
   compute bill and keeps the filesystem and the logins; killing loses
   the person's computer.
3. The TTL is short and pushed out on every touch, so a box that is
   forgotten stops costing rather than running until someone notices.

**E2B is the truth and Claidor's row is a belief.** They disagree
routinely — a sandbox is reaped, a pause times out, a deploy lands
mid-call. Every function here that learns the real state writes it down
rather than arguing with it, and `_reconcile` is that rule in one place.

The API is E2B's own REST, called with `httpx` and no SDK, for the same
reason the model proxy calls Anthropic and OpenAI directly: one less
dependency between us and a wire we have to understand anyway. The
operations used are `POST /v2/sandboxes`, `GET /sandboxes/{id}`,
`POST /v2/sandboxes/{id}/connect`, `POST /sandboxes/{id}/pause`,
`POST /sandboxes/{id}/snapshots` and `DELETE /sandboxes/{id}`, all
authenticated with an `X-API-Key` header — read from E2B's published
OpenAPI document (`github.com/e2b-dev/infra`, `spec/openapi.yml`),
not from memory.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

import httpx
import structlog

from polar.config import settings
from polar.kit.utils import utc_now
from polar.models import DesktopBox, DesktopBoxState, User
from polar.postgres import AsyncSession

from .pricing import (
    BOX_MAX_SECONDS_PER_SETTLEMENT,
    Usage,
    box_model,
)
from .repository import DesktopBoxRepository

log = structlog.get_logger()

#: Written whenever E2B refuses, with E2B's own sentence in it.
#:
#: The same lesson as `desktop.proxy.upstream_refused`, which on
#: 13 September ended two hours of guessing about a model failure. A box
#: that will not start is the same shape of problem: the status alone
#: says nothing, and the sentence beside it usually says everything.
UPSTREAM_REFUSED = "desktop.box.upstream_refused"

_REFUSAL_LOG_LIMIT = 2_000

#: E2B answers 404 for a sandbox it no longer has. That is not an error
#: to retry — it is the answer, and it means the person's box is gone.
_GONE_STATUSES = frozenset({404, 410})


class BoxNotConfigured(Exception):
    """Claidor holds no E2B key.

    Raised rather than returned so that no caller can forget it, and
    turned into « the computer is not switched on here » at the route.
    It is never a fault of the person's request.
    """


class BoxUpstreamError(Exception):
    """E2B refused, or could not be reached. Carries E2B's own words."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass(frozen=True)
class BoxView:
    """What the app is allowed to know about the box.

    Deliberately small, and the omissions are the point: **no sandbox id
    and no key.** The app gets a state it can draw, a handle it can quote
    back, and the addresses it needs to show a screen. Everything that
    would let it reach E2B directly stays on this side.
    """

    handle: str
    state: str
    running_since: datetime | None
    #: Where the box's screen can be watched, when it is running. E2B
    #: serves sandbox traffic on a per-sandbox hostname; that hostname is
    #: derived from the sandbox id, so it is already a capability of a
    #: kind and is only handed out while the box is up.
    stream_url: str | None
    awake_seconds: int

    def payload(self) -> dict[str, Any]:
        return {
            "handle": self.handle,
            "state": self.state,
            "runningSince": (
                self.running_since.isoformat() if self.running_since else None
            ),
            "streamUrl": self.stream_url,
            "awakeSeconds": self.awake_seconds,
        }


def configured() -> bool:
    return bool(settings.E2B_API_KEY)


def _headers() -> dict[str, str]:
    return {
        "X-API-Key": settings.E2B_API_KEY,
        "content-type": "application/json",
    }


def _timeout() -> httpx.Timeout:
    # Creating a sandbox is the slow one: E2B has to schedule and boot a
    # microVM. Resuming is about a second. Neither should be allowed to
    # hold a request open for minutes.
    return httpx.Timeout(60.0, connect=15.0)


def _log_refusal(operation: str, status: int, body: bytes | None) -> None:
    text = (body or b"").decode(errors="replace").strip()
    log.warning(
        UPSTREAM_REFUSED,
        operation=operation,
        status=status,
        body=text[:_REFUSAL_LOG_LIMIT] or "(empty)",
        truncated=len(text) > _REFUSAL_LOG_LIMIT,
    )


def _refusal_message(body: bytes | None) -> str:
    """E2B's own sentence, so a failure says what is wrong."""
    import json

    try:
        parsed = json.loads(body or b"")
    except ValueError:
        parsed = None
    if isinstance(parsed, dict):
        for key in ("message", "error", "detail"):
            value = parsed.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:500]
    return (body or b"").decode(errors="replace").strip()[:500] or (
        "The computer service refused the request."
    )


class BoxService:
    """Everything Claidor does to a person's computer."""

    # --- talking to E2B -----------------------------------------------

    async def _call(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        allow_gone: bool = False,
    ) -> tuple[int, Any]:
        """One E2B call. Returns the status and the decoded body.

        `allow_gone` lets a caller treat "E2B has never heard of this
        sandbox" as an answer rather than a failure, which is what it is
        for every operation on a box that has been reaped.
        """
        if not configured():
            raise BoxNotConfigured()

        import json as _json

        url = f"{settings.E2B_BASE_URL.rstrip('/')}{path}"
        async with httpx.AsyncClient(timeout=_timeout()) as client:
            try:
                response = await client.request(
                    method, url, headers=_headers(), json=json_body
                )
            except httpx.HTTPError as error:
                log.warning(
                    "desktop.box.upstream_unreachable", path=path, error=str(error)
                )
                raise BoxUpstreamError(
                    "The computer service could not be reached."
                ) from error

        if response.status_code in _GONE_STATUSES and allow_gone:
            return response.status_code, None
        if response.status_code >= 400:
            _log_refusal(f"{method} {path}", response.status_code, response.content)
            raise BoxUpstreamError(
                _refusal_message(response.content), response.status_code
            )
        if not response.content:
            return response.status_code, None
        try:
            return response.status_code, _json.loads(response.content)
        except ValueError:
            return response.status_code, None

    # --- the money ----------------------------------------------------

    async def _settle(
        self,
        session: AsyncSession,
        box: DesktopBox,
        *,
        now: datetime | None = None,
        stopping: bool = False,
    ) -> int:
        """Charge for the awake time that has passed since the last time
        this ran, and move the mark forward.

        Called on **every** route that touches a box, not only when one
        stops. That is the whole design: a box bills while it exists, so
        the bill has to be taken in slices that survive a restart. The
        alternative — settle once at pause — loses everything if the
        process dies, and presents a week as one number if it does not.

        Returns the seconds charged, which is zero for a box that was not
        running. Writes nothing when there is nothing to charge, because
        an empty row is noise in a table people read.
        """
        moment = now or utc_now()
        anchor = box.billed_through or box.running_since
        if not box.is_running or anchor is None:
            if stopping:
                box.running_since = None
                box.billed_through = None
            return 0

        seconds = int((moment - anchor).total_seconds())
        if seconds <= 0:
            # Clock went backwards, or two calls landed in the same
            # second. Move the mark up so the next slice is measured from
            # here, and charge nothing.
            box.billed_through = moment
            if stopping:
                box.running_since = None
                box.billed_through = None
            return 0

        if seconds > BOX_MAX_SECONDS_PER_SETTLEMENT:
            # The guard in `pricing.py` caps what is charged; this says
            # so out loud, because a gap this long means something went
            # wrong with a clock or a deploy and nobody would otherwise
            # know it had been quietly truncated.
            log.warning(
                "desktop.box.settlement_capped",
                user_id=str(box.user_id),
                seconds=seconds,
                capped_to=BOX_MAX_SECONDS_PER_SETTLEMENT,
            )

        from .service import desktop

        charged = min(seconds, BOX_MAX_SECONDS_PER_SETTLEMENT)
        await desktop.record_usage(
            session,
            user_id=box.user_id,
            session_id=None,
            model=box_model(
                settings.E2B_SANDBOX_VCPU, settings.E2B_SANDBOX_MEMORY_GIB
            ),
            usage=Usage(input_tokens=charged),
            stream=False,
            upstream_status=200,
        )
        box.billed_through = moment
        if stopping:
            box.running_since = None
            box.billed_through = None
        return charged

    # --- the row ------------------------------------------------------

    async def _row(self, session: AsyncSession, user: User) -> DesktopBox:
        """This person's box row, made if it is their first time."""
        repository = DesktopBoxRepository.from_session(session)
        box = await repository.get_by_user(user.id)
        if box is not None:
            return box
        box = DesktopBox(
            user_id=user.id,
            template_id=settings.E2B_TEMPLATE_ID,
            state=DesktopBoxState.absent.value,
        )
        session.add(box)
        await session.flush()
        return box

    def _mark_running(self, box: DesktopBox, *, now: datetime | None = None) -> None:
        moment = now or utc_now()
        box.state = DesktopBoxState.running.value
        box.last_seen_at = moment
        if box.running_since is None:
            box.running_since = moment
        if box.billed_through is None:
            box.billed_through = moment

    def _mark_gone(self, box: DesktopBox) -> None:
        """E2B no longer has this sandbox.

        The row keeps `snapshot_id`, deliberately: a sandbox being reaped
        is exactly when a person needs their files back, and the snapshot
        is the only thing that can do it.
        """
        box.state = DesktopBoxState.gone.value
        box.sandbox_id = None
        box.running_since = None
        box.billed_through = None
        box.last_seen_at = utc_now()

    async def _reconcile(
        self, session: AsyncSession, box: DesktopBox
    ) -> dict[str, Any] | None:
        """Ask E2B what is actually true, and believe it.

        Returns E2B's sandbox detail, or None when there is no sandbox.
        This is the one place the "E2B wins" rule is implemented, so a
        caller never has to remember it.
        """
        if not box.has_sandbox:
            return None
        status, detail = await self._call(
            "GET", f"/sandboxes/{box.sandbox_id}", allow_gone=True
        )
        if status in _GONE_STATUSES or not isinstance(detail, dict):
            await self._settle(session, box, stopping=True)
            self._mark_gone(box)
            return None

        real = detail.get("state")
        box.last_seen_at = utc_now()
        if real == "running":
            self._mark_running(box)
        elif real == "paused":
            # It stopped without us asking — a TTL expiry, most likely.
            # Charge what it was awake for, then record the truth.
            await self._settle(session, box, stopping=True)
            box.state = DesktopBoxState.paused.value
        return detail

    # --- what the app asks for ----------------------------------------

    async def view(self, session: AsyncSession, user: User) -> BoxView:
        """The box's state, reconciled against E2B and settled."""
        box = await self._row(session, user)
        await self._reconcile(session, box)
        if box.is_running:
            await self._settle(session, box)
        return self._view(box)

    async def ensure(self, session: AsyncSession, user: User) -> BoxView:
        """Give this person a running computer, whatever state it is in.

        One verb for four situations — no box, a paused box, a running
        box, and a box E2B has lost — because the app should not have to
        know which it is in. This is the call the agent's turn makes
        before it does anything on the computer.
        """
        box = await self._row(session, user)
        await self._reconcile(session, box)

        if box.is_running:
            # Already up. Push the TTL out so it does not expire mid-turn,
            # and take the slice that has accrued.
            await self._settle(session, box)
            await self._touch(box)
            return self._view(box)

        if box.has_sandbox:
            await self._resume(session, box)
            return self._view(box)

        await self._create(session, box, template_id=box.template_id or None)
        return self._view(box)

    async def pause(self, session: AsyncSession, user: User) -> BoxView:
        """Stop the bill without losing the computer.

        Pause and never kill. E2B keeps the filesystem and the memory, so
        the person's logins and open work survive; a kill would take them.
        """
        box = await self._row(session, user)
        await self._reconcile(session, box)
        if not box.is_running:
            return self._view(box)

        await self._call(
            "POST", f"/sandboxes/{box.sandbox_id}/pause", json_body={"memory": True}
        )
        await self._settle(session, box, stopping=True)
        box.state = DesktopBoxState.paused.value
        box.last_seen_at = utc_now()
        return self._view(box)

    async def update(self, session: AsyncSession, user: User) -> BoxView:
        """Recovery that keeps the person's files and logins.

        Snapshot what is there, throw the sandbox away, and build a new
        one from the snapshot. That fixes a box that is wedged — a broken
        process, a full disk, a machine E2B is unhappy with — without
        costing the person the thing that makes it *their* computer.

        **One honest gap.** The spec this comes from
        (`docs/product/agent-computer-plan.md`) describes Update as
        keeping files and logins *and losing installed software*. These
        primitives cannot express that: a snapshot is the whole
        filesystem, so software installed into it comes back too. What is
        built here is the useful half — a fresh machine with the person's
        data — and the difference is written down rather than papered
        over, because somebody will one day read the spec and expect the
        other behaviour.
        """
        box = await self._row(session, user)
        await self._reconcile(session, box)
        if not box.has_sandbox:
            # Nothing to recover from but the snapshot we hold, if any.
            await self._create(session, box, template_id=box.snapshot_id or None)
            return self._view(box)

        snapshot_id = await self._snapshot(box)
        await self._discard(session, box)
        await self._create(session, box, template_id=snapshot_id)
        return self._view(box)

    async def reset(self, session: AsyncSession, user: User) -> BoxView:
        """Go back to the last snapshot Claidor holds.

        Where `update` takes a snapshot *now* and rebuilds from it, this
        rebuilds from the one already stored — the state before whatever
        has gone wrong since. With no stored snapshot it builds a clean
        machine from the template, which loses the person's files; that
        is a real loss and the route says so before doing it.
        """
        box = await self._row(session, user)
        await self._reconcile(session, box)
        if box.has_sandbox:
            await self._discard(session, box)
        await self._create(
            session, box, template_id=box.snapshot_id or settings.E2B_TEMPLATE_ID
        )
        return self._view(box)

    # --- the pieces ---------------------------------------------------

    async def _create(
        self, session: AsyncSession, box: DesktopBox, *, template_id: str | None
    ) -> None:
        template = template_id or settings.E2B_TEMPLATE_ID
        _, created = await self._call(
            "POST",
            "/v2/sandboxes",
            json_body={
                "templateID": template,
                "timeout": settings.E2B_SANDBOX_TTL_SECONDS,
                # Pause rather than die when the timer runs out, so a
                # forgotten box stops costing money and still keeps the
                # person's files. This is the single setting that decides
                # whether an idle box is cheap or lost.
                "autoPause": True,
                "autoPauseMemory": True,
                # Whose box this is, readable from E2B's own console. Not
                # a security boundary — the key is — but it is what makes
                # a stray sandbox traceable to an account.
                "metadata": {"claidor_user": str(box.user_id)},
            },
        )
        if not isinstance(created, dict) or not created.get("sandboxID"):
            raise BoxUpstreamError("The computer service returned no machine.")

        box.sandbox_id = str(created["sandboxID"])
        box.template_id = template
        box.running_since = None
        box.billed_through = None
        self._mark_running(box)

    async def _resume(self, session: AsyncSession, box: DesktopBox) -> None:
        """Wake a paused box.

        `connect` rather than `resume`: E2B deprecated the latter, and
        `connect` answers 200 when the box was already up and 201 when it
        had to be woken, which is exactly the question this has to
        tolerate being wrong about.
        """
        status, detail = await self._call(
            "POST",
            f"/v2/sandboxes/{box.sandbox_id}/connect",
            json_body={"timeout": settings.E2B_SANDBOX_TTL_SECONDS},
            allow_gone=True,
        )
        if status in _GONE_STATUSES:
            # E2B lost it between the reconcile and now. Build a new one
            # from the snapshot if we have one, rather than handing back
            # an error the person can do nothing with.
            self._mark_gone(box)
            await self._create(session, box, template_id=box.snapshot_id or None)
            return
        if isinstance(detail, dict) and detail.get("sandboxID"):
            box.sandbox_id = str(detail["sandboxID"])
        box.running_since = None
        box.billed_through = None
        self._mark_running(box)

    async def _touch(self, box: DesktopBox) -> None:
        """Push the expiry out, so a box does not vanish mid-turn.

        `connect` extends the TTL and is a no-op on a running box, which
        is why it is used here rather than `/timeout`: one call that is
        correct whether or not the box went to sleep a second ago.
        """
        await self._call(
            "POST",
            f"/v2/sandboxes/{box.sandbox_id}/connect",
            json_body={"timeout": settings.E2B_SANDBOX_TTL_SECONDS},
            allow_gone=True,
        )

    async def _snapshot(self, box: DesktopBox) -> str | None:
        """Persist the box's current state so it outlives the sandbox."""
        try:
            _, made = await self._call(
                "POST", f"/sandboxes/{box.sandbox_id}/snapshots", json_body={}
            )
        except BoxUpstreamError:
            # A recovery that cannot snapshot is still worth doing — the
            # machine is broken either way. Logged by `_call`; the caller
            # falls back to the snapshot already stored.
            return box.snapshot_id
        if isinstance(made, dict):
            for key in ("snapshotID", "templateID", "id"):
                value = made.get(key)
                if isinstance(value, str) and value.strip():
                    box.snapshot_id = value.strip()
                    return box.snapshot_id
        return box.snapshot_id

    async def _discard(self, session: AsyncSession, box: DesktopBox) -> None:
        """Kill the sandbox, having settled what it owes."""
        await self._settle(session, box, stopping=True)
        await self._call("DELETE", f"/sandboxes/{box.sandbox_id}", allow_gone=True)
        box.sandbox_id = None
        box.state = DesktopBoxState.absent.value
        box.last_seen_at = utc_now()

    # --- what the app sees --------------------------------------------

    def _view(self, box: DesktopBox) -> BoxView:
        awake = 0
        if box.is_running and box.running_since is not None:
            awake = max(0, int((utc_now() - box.running_since).total_seconds()))
        return BoxView(
            handle=str(box.id),
            state=box.state,
            running_since=box.running_since,
            stream_url=self._stream_url(box),
            awake_seconds=awake,
        )

    def _stream_url(self, box: DesktopBox) -> str | None:
        """Where the box's screen lives, while it is up.

        None whenever the box is not running, so the app cannot show a
        dead frame and call it a computer.
        """
        if not box.is_running or not box.sandbox_id:
            return None
        return f"https://{box.sandbox_id}.e2b.app"


box_service = BoxService()

__all__ = [
    "UPSTREAM_REFUSED",
    "BoxNotConfigured",
    "BoxService",
    "BoxUpstreamError",
    "BoxView",
    "box_service",
    "configured",
]
