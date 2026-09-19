"""The person's computer, brokered.

The box is a persistent Linux machine — "my computer" to the person —
where files, installed tools and browser logins survive across turns and
across days. It runs on E2B, locked by the founder on 18 September:
*"i did mean e2b. lets lock e2b."*

**The desktop app never talks to E2B, and this module is why.** The
founder, 16 September: *"my users should never put a key. everything
happens under the hood. not a setting."* So the E2B key is Claidor's,
and it must not ship inside an Electron app: anyone with the app would
have it, and one extracted key bills every box we run. The app holds an
opaque handle; **no route here returns a key, and none returns an E2B
sandbox id either.** `boxId` is this server's own row id, so E2B's
identifiers never leave the server and one account's box is not even
nameable by another.

The road the app takes is the local token proxy
(`desktop/src/main/libs/openclawTokenProxy.ts`), which injects the
account's access token and refreshes it. It prefixes `/api/proxy`, which
is why these routes are served at `/api/proxy/box/…`. That proxy strips
the `upgrade` header, so there is no WebSocket: `/exec` is one chunked
POST answering in NDJSON. All of this is the Box agent's finding, in
`docs/product/agent-computer-plan.md` §6.

**What makes this different from everything else on this server: a box
costs money while nobody is using it.** A model call is free until
somebody sends a message; a box bills for existing. Three consequences
run through the code below:

1. Awake time is settled in **slices**, on every call that touches a
   box, not once when it stops. A box awake for a week must not arrive
   as one surprise, and a server that restarts must not lose the week.
2. A box is **paused, not killed**, when it goes idle — pausing keeps
   the filesystem and the logins and stops the compute bill.
3. Every call pushes the TTL out, because *"the person should not lose
   their session because the agent was thinking"* — and an abandoned
   box must still stop on its own, or it bills forever.

**Why the `e2b` SDK and not raw httpx.** The rest of this server calls
providers with `httpx` directly, and that was the first instinct here
too. It is wrong for this one: E2B's control plane is ordinary REST, but
running a command and reading a file go to **envd inside the sandbox**
over Connect-RPC with protobuf framing. Hand-rolling that would be
inventing a protocol this session cannot test against — there is no E2B
key here — which is exactly the kind of guess that has cost this
repository days. The SDK is the documented path and it is used for the
data plane; the lifecycle calls go through it too, rather than half and
half.

**Nothing in this module has ever run against E2B.** No key exists in
this environment. Every test replaces the SDK. See the working note.
"""

from __future__ import annotations

import asyncio
import base64
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import structlog

from polar.config import settings
from polar.kit.utils import utc_now
from polar.models import DesktopBox, DesktopBoxState, User
from polar.postgres import AsyncSession

from .pricing import BOX_MAX_SECONDS_PER_SETTLEMENT, Usage, box_model
from .repository import DesktopBoxRepository

log = structlog.get_logger()

#: Written whenever E2B refuses, with E2B's own sentence in it.
#:
#: The same lesson as `desktop.proxy.upstream_refused`, which on
#: 13 September ended two hours of guessing about a model failure. A box
#: that will not start is the same shape of problem: the status alone
#: says nothing and the sentence beside it usually says everything.
UPSTREAM_REFUSED = "desktop.box.upstream_refused"

#: The scope the product actually uses: one box for all of a person's
#: agents. `docs/product/agent-computer-plan.md` — *they share one
#: computer and have separate desktops*.
DEFAULT_SCOPE_KEY = "shared"

#: How long one `/exec` command may run. Past this E2B stops it, and the
#: stream ends with a real exit frame rather than hanging.
EXEC_TIMEOUT_SECONDS = 3600.0

#: How long one `/shell` script may run. Shorter, because the remote
#: filesystem bridge builds every file operation out of this and a file
#: operation that takes minutes is a fault, not a long job.
SHELL_TIMEOUT_SECONDS = 120.0


class BoxNotConfigured(Exception):
    """Claidor holds no E2B key. Never a fault of the person's request."""


class BoxNotFound(Exception):
    """No such box for *this account*.

    The same answer whether the box belongs to nobody or to somebody
    else, which is what keeps one account's box invisible to another.
    """


class BoxUpstreamError(Exception):
    """E2B refused, or could not be reached. Carries E2B's own words."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass(frozen=True)
class BoxState:
    """`BoxState` as `brokerClient.ts` declares it, and nothing more.

    The omissions are the point: no key, no E2B sandbox id. `boxId` is
    this server's row id.
    """

    box_id: str
    running: bool
    template: str | None
    created_at_ms: int | None
    last_used_at_ms: int | None
    workspace_dir: str | None
    agent_workspace_dir: str | None

    def payload(self) -> dict[str, Any]:
        body: dict[str, Any] = {"boxId": self.box_id, "running": self.running}
        if self.template:
            body["template"] = self.template
        if self.created_at_ms is not None:
            body["createdAtMs"] = self.created_at_ms
        if self.last_used_at_ms is not None:
            body["lastUsedAtMs"] = self.last_used_at_ms
        # Absolute or absent. The plugin ignores a non-absolute answer
        # rather than guessing at it, so sending a relative one would be
        # the same as sending nothing while looking like an answer.
        if self.workspace_dir and self.workspace_dir.startswith("/"):
            body["workspaceDir"] = self.workspace_dir
        if self.agent_workspace_dir and self.agent_workspace_dir.startswith("/"):
            body["agentWorkspaceDir"] = self.agent_workspace_dir
        return body


def configured() -> bool:
    return bool(settings.E2B_API_KEY)


def _ms(moment: datetime | None) -> int | None:
    return int(moment.timestamp() * 1000) if moment is not None else None


def _translate(error: Exception, operation: str) -> Exception:
    """Turn an SDK exception into one of ours, keeping E2B's sentence.

    Imported inside the function because `e2b` pulls in a protobuf stack
    and this module is imported at boot by the router; a provider SDK
    must not be able to stop the server starting.
    """
    from e2b.exceptions import NotFoundException, SandboxException

    if isinstance(error, NotFoundException):
        return BoxNotFound()
    message = str(error).strip() or "The computer service refused the request."
    log.warning(UPSTREAM_REFUSED, operation=operation, body=message[:2000])
    if isinstance(error, SandboxException):
        return BoxUpstreamError(message[:500])
    return BoxUpstreamError(message[:500])


class BoxService:
    """Everything Claidor does to a person's computer."""

    # --- E2B ----------------------------------------------------------

    def _api_params(self) -> dict[str, Any]:
        if not configured():
            raise BoxNotConfigured()
        return {"api_key": settings.E2B_API_KEY, "domain": settings.E2B_DOMAIN}

    async def _connect(self, box: DesktopBox) -> Any:
        """A live handle on this box's sandbox, resumed if it was paused.

        `connect` is E2B's « make it usable », which is what every caller
        below actually wants: it resumes a paused sandbox and is a no-op
        on a running one, so no caller has to know which it was.
        """
        from e2b import AsyncSandbox

        if not box.sandbox_id:
            raise BoxNotFound()
        try:
            sandbox = await AsyncSandbox.connect(box.sandbox_id, **self._api_params())
            # Keep it alive while it is in use. The plugin cannot do this
            # — it does not know the TTL — and without it a person loses
            # their session because the agent spent a minute thinking.
            await sandbox.set_timeout(settings.E2B_SANDBOX_TTL_SECONDS)
            return sandbox
        except BoxNotConfigured:
            raise
        except Exception as error:
            raise _translate(error, f"connect {box.sandbox_id}") from error

    # --- the money ----------------------------------------------------

    async def _settle(
        self,
        session: AsyncSession,
        box: DesktopBox,
        *,
        now: datetime | None = None,
        stopping: bool = False,
    ) -> int:
        """Charge for the awake time since the last settlement.

        Called on **every** route that touches a box. That is the whole
        design: a box bills while it exists, so the bill is taken in
        slices that survive a restart. Settling only at pause loses
        everything if the process dies, and presents a week as one
        number if it does not.
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
            # Clock went backwards, or two calls landed in one second.
            # Move the mark up and charge nothing.
            box.billed_through = moment
            if stopping:
                box.running_since = None
                box.billed_through = None
            return 0

        if seconds > BOX_MAX_SECONDS_PER_SETTLEMENT:
            # `pricing.py` caps what is charged; this says so out loud,
            # because a gap this long means a clock or a deploy went
            # wrong and nobody would otherwise know it was truncated.
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
            model=box_model(settings.E2B_SANDBOX_VCPU, settings.E2B_SANDBOX_MEMORY_GIB),
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

    async def _for_id(
        self, session: AsyncSession, user: User, box_id: str
    ) -> DesktopBox:
        """This account's box with that handle, or `BoxNotFound`.

        Scoped by `user_id` in the query itself rather than fetched and
        then checked, so there is no version of this that forgets.
        """
        from uuid import UUID

        try:
            wanted = UUID(box_id)
        except (ValueError, AttributeError, TypeError):
            raise BoxNotFound() from None
        repository = DesktopBoxRepository.from_session(session)
        box = await repository.get_for_user(user.id, wanted)
        if box is None:
            raise BoxNotFound()
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

        `snapshot_id` is kept deliberately: a sandbox being reaped is
        exactly when a person needs their files back, and the snapshot is
        the only thing that can give them back.
        """
        box.state = DesktopBoxState.gone.value
        box.sandbox_id = None
        box.running_since = None
        box.billed_through = None
        box.last_seen_at = utc_now()

    # --- the routes ---------------------------------------------------

    async def ensure(
        self,
        session: AsyncSession,
        user: User,
        *,
        scope_key: str | None = None,
        template: str | None = None,
    ) -> BoxState:
        """`POST /box/sandboxes` — **ensure, not create.**

        The same account and the same `scopeKey` must get the box that is
        already there rather than a second one, because each accidental
        extra box is a second bill. The uniqueness that guarantees it is
        on the table, not in this function.
        """
        scope = (scope_key or DEFAULT_SCOPE_KEY).strip() or DEFAULT_SCOPE_KEY
        repository = DesktopBoxRepository.from_session(session)
        box = await repository.get_by_scope(user.id, scope)
        if box is None:
            box = DesktopBox(
                user_id=user.id,
                scope_key=scope,
                template_id=(template or settings.E2B_TEMPLATE_ID),
                state=DesktopBoxState.absent.value,
            )
            session.add(box)
            await session.flush()

        if box.has_sandbox:
            try:
                await self._connect(box)
            except BoxNotFound:
                # E2B lost it. Build a new one rather than handing back an
                # error the person can do nothing with.
                await self._settle(session, box, stopping=True)
                self._mark_gone(box)
            else:
                await self._settle(session, box)
                self._mark_running(box)
                return self._state(box)

        await self._create(box, template=template)
        return self._state(box)

    async def describe(
        self, session: AsyncSession, user: User, box_id: str
    ) -> BoxState:
        """`GET /box/sandboxes/{boxId}`.

        Asks E2B what is true rather than reporting Claidor's memory, and
        settles what it finds — so simply looking keeps the meter honest.
        """
        box = await self._for_id(session, user, box_id)
        if not box.has_sandbox:
            return self._state(box)
        try:
            # The handle is discarded on purpose: `connect` is called for
            # its effects, not its value. It resumes a paused sandbox and
            # extends the TTL, so by the time it returns the box is
            # running whatever it was doing a moment ago, and the row can
            # be written from that fact alone.
            await self._connect(box)
        except BoxNotFound:
            await self._settle(session, box, stopping=True)
            self._mark_gone(box)
            return self._state(box)
        await self._settle(session, box)
        self._mark_running(box)
        return self._state(box)

    async def remove(self, session: AsyncSession, user: User, box_id: str) -> None:
        """`DELETE /box/sandboxes/{boxId}` — and it must really kill it.

        E2B bills by the second, so a « delete » that only forgets the
        row would leave a machine running that nobody can now reach to
        stop. The row is dropped only after E2B has been told.
        """
        box = await self._for_id(session, user, box_id)
        await self._kill(session, box)
        repository = DesktopBoxRepository.from_session(session)
        # Soft, so the row keeps its history and its usage stays
        # traceable, and so `get_by_scope` stops finding it — the next
        # `ensure` for this scope starts a fresh box rather than trying
        # to resume a sandbox that has been killed.
        await repository.soft_delete(box, flush=True)

    async def update(self, session: AsyncSession, user: User, box_id: str) -> BoxState:
        """`POST /box/sandboxes/{boxId}/update`.

        A fresh machine that keeps the person's files and logins: take a
        snapshot, kill the old sandbox, start a new one from the
        snapshot. For a box that is wedged rather than one that is wrong.

        **One honest gap, and it is the caller's to state.**
        `brokerClient.ts` documents Update as *"installed software does
        NOT survive"*. It does survive here: an E2B snapshot is the whole
        filesystem, so anything installed into it comes back with it.
        Every primitive that would drop the software would drop the files
        too. What is built is the useful half — a fresh machine with the
        person's data — and the difference is written down rather than
        papered over, because somebody will read that comment and expect
        the other behaviour.
        """
        box = await self._for_id(session, user, box_id)
        if box.has_sandbox:
            await self._snapshot(box)
            await self._kill(session, box)
        await self._create(box, template=box.snapshot_id or None)
        return self._state(box)

    async def reset(self, session: AsyncSession, user: User, box_id: str) -> BoxState:
        """`POST /box/sandboxes/{boxId}/reset`.

        Back to the snapshot Claidor already holds — the last resort,
        because anything since that snapshot is gone. With no snapshot it
        builds a clean machine from the template, which loses the
        person's files entirely. The server cannot ask, so the app must
        have asked before calling this.
        """
        box = await self._for_id(session, user, box_id)
        if box.has_sandbox:
            await self._kill(session, box)
        await self._create(box, template=box.snapshot_id or settings.E2B_TEMPLATE_ID)
        return self._state(box)

    async def machines(self, session: AsyncSession, user: User) -> list[dict[str, Any]]:
        """`GET /box/machines` — the registry.

        The spec's registry is "this box plus the person's registered
        machines". **There are no registered machines**, and that is a
        decision rather than a gap: `CLAUDE.md` — *Maties runs on the
        machine, so there is no "which computer", only this computer.*
        So this lists the boxes and nothing else, and the `kind` field is
        already there for the day that changes.
        """
        repository = DesktopBoxRepository.from_session(session)
        rows = await repository.list_for_user(user.id)
        return [
            {
                "id": str(row.id),
                "kind": "box",
                "label": "The computer",
                "state": (
                    "running"
                    if row.state == DesktopBoxState.running.value
                    else "stopped"
                    if row.state == DesktopBoxState.paused.value
                    else "unknown"
                ),
                **({"template": row.template_id} if row.template_id else {}),
                **({"createdAtMs": _ms(row.created_at)} if row.created_at else {}),
            }
            for row in rows
        ]

    # --- work in the box ----------------------------------------------

    async def shell(
        self,
        session: AsyncSession,
        user: User,
        box_id: str,
        *,
        script: str,
        args: list[str],
        stdin: bytes | None,
    ) -> dict[str, Any]:
        """`POST /box/sandboxes/{boxId}/shell` — run to completion.

        The primitive the remote filesystem bridge builds every file
        operation out of, so it has to be cheap and it has to report a
        non-zero exit rather than raising: the client decides whether a
        failure matters (`brokerClient.runShell`, `allowFailure`).
        """
        from e2b import CommandExitException

        box = await self._for_id(session, user, box_id)
        sandbox = await self._connect(box)
        await self._settle(session, box)
        self._mark_running(box)

        command = " ".join([script, *(_quote(one) for one in args)]).strip()
        try:
            result = await sandbox.commands.run(
                command,
                timeout=SHELL_TIMEOUT_SECONDS,
                cwd=settings.E2B_WORKSPACE_DIR or None,
            )
            stdout, stderr, code = result.stdout, result.stderr, result.exit_code
        except CommandExitException as exited:
            # A non-zero exit is an answer, not a failure. The SDK raises
            # it; the contract returns it.
            stdout = getattr(exited, "stdout", "") or ""
            stderr = getattr(exited, "stderr", "") or ""
            code = getattr(exited, "exit_code", 1) or 1
        except Exception as error:
            raise _translate(error, f"shell {box.id}") from error

        if stdin is not None:
            # Declared in the contract and not yet honoured. Said out
            # loud rather than silently dropped: a script that expected
            # input and got none fails in a way nobody can explain.
            log.warning("desktop.box.shell_stdin_ignored", user_id=str(user.id))

        return {
            "stdoutBase64": base64.b64encode(_as_bytes(stdout)).decode(),
            "stderrBase64": base64.b64encode(_as_bytes(stderr)).decode(),
            "exitCode": int(code or 0),
        }

    async def put_file(
        self,
        session: AsyncSession,
        user: User,
        box_id: str,
        *,
        path: str,
        content: bytes,
    ) -> None:
        """`PUT /box/sandboxes/{boxId}/file` — import.

        The only way a file from the person's machine gets into the box:
        a deliberate copy, never ambient. That is the difference file
        custody makes, and it is why the engine's own remote backend —
        which uploads the whole workspace — is not what this is.
        """
        box = await self._for_id(session, user, box_id)
        sandbox = await self._connect(box)
        await self._settle(session, box)
        self._mark_running(box)
        try:
            await sandbox.files.write(path, content)
        except Exception as error:
            raise _translate(error, f"put_file {path}") from error

    async def get_file(
        self, session: AsyncSession, user: User, box_id: str, *, path: str
    ) -> bytes:
        """`GET /box/sandboxes/{boxId}/file?path=` — export."""
        box = await self._for_id(session, user, box_id)
        sandbox = await self._connect(box)
        await self._settle(session, box)
        self._mark_running(box)
        try:
            content = await sandbox.files.read(path, format="bytes")
        except Exception as error:
            raise _translate(error, f"get_file {path}") from error
        return _as_bytes(content)

    async def prepare_exec(self, session: AsyncSession, user: User, box_id: str) -> Any:
        """Everything `/exec` needs from the database, **before** the
        response starts streaming.

        This exists because of a bug that tests cannot see. A streaming
        handler returns its `StreamingResponse` immediately, and
        `polar.postgres.get_db_session` commits the request's session
        when the handler returns — *before* the body has been streamed.
        Anything written from inside the generator therefore lands in a
        fresh transaction that nothing ever commits, and is **silently
        lost**: the box would run, the person would be charged nothing,
        and no error would appear anywhere.

        It passes under test because the test client shares one session
        and keeps it open, which is exactly what makes this class of bug
        worth a named method rather than a comment. The model proxy
        solves the same problem the other way, with a session of its own
        (`_proxy`'s `record`); here there is nothing to write once the
        command is running, so doing the writes first is simpler and has
        no second session to get wrong.

        Returns the live sandbox handle for the generator to use.
        """
        box = await self._for_id(session, user, box_id)
        sandbox = await self._connect(box)
        await self._settle(session, box)
        self._mark_running(box)
        return sandbox

    async def exec_frames(
        self,
        sandbox: Any,
        *,
        command: str,
        workdir: str | None,
        env: dict[str, str],
        pty: bool,
    ) -> AsyncIterator[bytes]:
        """`POST /box/sandboxes/{boxId}/exec` — NDJSON, one object a line.

        **Touches no database.** See `prepare_exec` for why that is a
        rule here and not a preference.

        Four requirements, each because the bridge depends on it
        (`agent-computer-plan.md` §9), and each implemented here:

        1. **Flush every frame as it happens.** Frames go onto a queue
           from the SDK's callbacks and are yielded the moment they
           arrive. Buffering until the command ends turns a three-minute
           build into three minutes of silence, and the agent cannot tell
           that from a hang.
        2. **Always send an `exit` frame.** A stream that ends without
           one is treated as a failure, on purpose — saying a command
           succeeded when the box never said how it finished is a lie the
           agent then acts on. So an exit frame follows every path out of
           here, including the one where the command never started.
        3. **Kill the command when the client goes away.** The generator
           being closed is how an aborted tool call reaches the box.
           Without the kill, an abandoned command runs on, billing.
        4. **`pty: true` is refused, not faked.** The bridge refuses it
           before connecting, so this should never be reached; if it is,
           it says no rather than pretending.
        """
        from e2b import CommandExitException

        if pty:
            yield _frame(
                {
                    "t": "error",
                    "message": (
                        "An interactive terminal is not available in the box: "
                        "the account proxy cannot carry a two-way connection."
                    ),
                }
            )
            yield _frame({"t": "exit", "code": 1})
            return

        queue: asyncio.Queue[bytes | None] = asyncio.Queue()

        def on_stdout(chunk: str) -> None:
            queue.put_nowait(_frame({"t": "stdout", "d": _b64(chunk)}))

        def on_stderr(chunk: str) -> None:
            queue.put_nowait(_frame({"t": "stderr", "d": _b64(chunk)}))

        handle: Any = None
        exit_code: int | None = None
        failure: str | None = None
        try:
            handle = await sandbox.commands.run(
                command,
                background=True,
                cwd=workdir or settings.E2B_WORKSPACE_DIR or None,
                envs=env or None,
                timeout=EXEC_TIMEOUT_SECONDS,
                on_stdout=on_stdout,
                on_stderr=on_stderr,
            )
        except Exception as error:
            # Could not be run at all — the one case the contract gives
            # an `error` frame for.
            failure = str(error).strip() or "The command could not be started."
            log.warning(UPSTREAM_REFUSED, operation="exec", body=failure[:2000])

        if handle is None:
            yield _frame({"t": "error", "message": (failure or "unknown")[:500]})
            # Requirement 2 holds even here: the bridge is told how it
            # ended rather than left to infer it from a closed socket.
            yield _frame({"t": "exit", "code": 1})
            return

        async def wait_for_exit() -> None:
            nonlocal exit_code, failure
            try:
                result = await handle.wait()
                exit_code = int(getattr(result, "exit_code", 0) or 0)
            except CommandExitException as exited:
                exit_code = int(getattr(exited, "exit_code", 1) or 1)
            except Exception as error:  # the command died in a way E2B could not report
                failure = str(error).strip() or "The command ended unexpectedly."
                exit_code = 1
            finally:
                await queue.put(None)

        waiter = asyncio.create_task(wait_for_exit())
        finished = False
        try:
            while True:
                item = await queue.get()
                if item is None:
                    finished = True
                    break
                yield item
            if failure:
                yield _frame({"t": "error", "message": failure[:500]})
            yield _frame(
                {"t": "exit", "code": exit_code if exit_code is not None else 1}
            )
        finally:
            if not finished:
                # The client went away mid-command. Kill it in the box:
                # this is how an aborted tool call reaches E2B, and
                # without it the command runs on and bills.
                try:
                    await handle.kill()
                except Exception:
                    log.exception("desktop.box.exec_kill_failed")
            if not waiter.done():
                waiter.cancel()

    # --- the pieces ---------------------------------------------------

    async def _create(self, box: DesktopBox, *, template: str | None) -> None:
        from e2b import AsyncSandbox

        wanted = (template or box.template_id or settings.E2B_TEMPLATE_ID).strip()
        try:
            sandbox = await AsyncSandbox.create(
                template=wanted,
                timeout=settings.E2B_SANDBOX_TTL_SECONDS,
                # Whose box this is, readable from E2B's own console. Not
                # a security boundary — the key is — but it is what makes
                # a stray sandbox traceable to an account.
                metadata={
                    "claidor_user": str(box.user_id),
                    "claidor_scope": box.scope_key,
                },
                **self._api_params(),
            )
        except BoxNotConfigured:
            raise
        except Exception as error:
            raise _translate(error, f"create {wanted}") from error

        box.sandbox_id = str(sandbox.sandbox_id)
        box.template_id = wanted
        box.running_since = None
        box.billed_through = None
        self._mark_running(box)

    async def _snapshot(self, box: DesktopBox) -> str | None:
        """Persist the box's state so it outlives the sandbox."""
        try:
            sandbox = await self._connect(box)
            made = await sandbox.create_snapshot()
        except Exception:
            # A recovery that cannot snapshot is still worth doing — the
            # machine is broken either way — so this falls back to the
            # snapshot already stored rather than refusing.
            log.warning("desktop.box.snapshot_failed", user_id=str(box.user_id))
            return box.snapshot_id
        for attribute in ("snapshot_id", "id", "template_id"):
            value = getattr(made, attribute, None)
            if isinstance(value, str) and value.strip():
                box.snapshot_id = value.strip()
                return box.snapshot_id
        if isinstance(made, str) and made.strip():
            box.snapshot_id = made.strip()
        return box.snapshot_id

    async def _kill(self, session: AsyncSession, box: DesktopBox) -> None:
        """Settle what it owes, then really stop it."""
        await self._settle(session, box, stopping=True)
        if box.sandbox_id:
            from e2b import AsyncSandbox

            try:
                await AsyncSandbox.kill(box.sandbox_id, **self._api_params())
            except BoxNotConfigured:
                raise
            except Exception as error:
                # Already gone is the outcome we wanted. Anything else is
                # a machine that may still be billing, so it is logged
                # loudly rather than swallowed.
                log.warning(
                    "desktop.box.kill_failed",
                    user_id=str(box.user_id),
                    error=str(error)[:500],
                )
        box.sandbox_id = None
        box.state = DesktopBoxState.absent.value
        box.last_seen_at = utc_now()

    def _state(self, box: DesktopBox) -> BoxState:
        return BoxState(
            box_id=str(box.id),
            running=box.is_running,
            template=box.template_id or None,
            created_at_ms=_ms(box.created_at),
            last_used_at_ms=_ms(box.last_seen_at),
            workspace_dir=settings.E2B_WORKSPACE_DIR or None,
            agent_workspace_dir=settings.E2B_AGENT_WORKSPACE_DIR or None,
        )


def _frame(body: dict[str, Any]) -> bytes:
    """One NDJSON frame. `separators` because a frame is a line and a
    line should not carry spaces nobody reads."""
    return (json.dumps(body, separators=(",", ":")) + "\n").encode()


def _b64(chunk: str | bytes) -> str:
    return base64.b64encode(_as_bytes(chunk)).decode()


def _as_bytes(value: Any) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, bytearray | memoryview):
        return bytes(value)
    if value is None:
        return b""
    return str(value).encode()


def _quote(argument: str) -> str:
    """One shell argument, safely.

    `shlex.quote`, by another name, because the arguments come from the
    agent and go into a shell in somebody's computer.
    """
    from shlex import quote

    return quote(argument)


box_service = BoxService()

__all__ = [
    "DEFAULT_SCOPE_KEY",
    "UPSTREAM_REFUSED",
    "BoxNotConfigured",
    "BoxNotFound",
    "BoxService",
    "BoxState",
    "BoxUpstreamError",
    "box_service",
    "configured",
]
