"""The brain's side of the API (5 November 2026,
`docs/agents-on-the-server/README.md`, step 1c).

The brain is the agents' engine off the computer, on a Render service of its
own; the computer is used only for its hands. A person's agents run there
when their e-mail address is in `BRAIN_USERS` and the brain is configured
(`BRAIN_URL`, `BRAIN_TOKEN`); for everyone else nothing here is reached and
every computer runs as before.

The brain proves itself with `BRAIN_TOKEN` in `x-simeon-brain-token` and names
the person it speaks for in `x-simeon-brain-user` (their user id) or, at its
start, in the body (their e-mail address). This module answers:

- `POST /sand-box/brain/bootstrap`: what the brain needs to start the
  person's engine. That is their computer's gateway token (the apps send it,
  the brain's engine checks it), a credential of the brain's own
  (`issue_brain_credential`), the API's address, and the two backup sources:
  the computer's, to bring the agents in from once, and the brain's own, to
  back them up to.
- `GET /sand-box/brain/hands/state`: the computer's state from the server's
  record (`running`, `hibernated`, `absent`), never waking it, for the
  Computer tab (`readBoxRunStateThroughRoute` in the engine).
- `/sand-box/brain/hands/{path}`, every other call: the door to the
  computer's hands (`SIMEON_HANDS_URL` on the brain). It wakes the computer
  when it sleeps and sends the call on, streamed both ways, to the
  computer's window router on 1339, which passes a call without a window
  header to the main hands program and one with `x-sand-display` to that
  agent's window. The API adds the computer's own token
  (`x-simeon-box-token`, the router's check in the `hands` role) and E2B's
  traffic token; the brain's own headers stop here. Only an E2B computer
  has the door: Docker publishes only the apps' ports.

Every refusal is logged with the reason and never with a token.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from collections.abc import AsyncIterator, Mapping
from typing import Any
from uuid import UUID

import httpx
import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse
from starlette.background import BackgroundTask
from starlette.requests import ClientDisconnect

from simeon.config import settings
from simeon.desktop.repository import DesktopSessionRepository
from simeon.desktop.service import DesktopUnauthenticated, desktop
from simeon.models import SandBox, User
from simeon.openapi import APITag
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter
from simeon.user.repository import UserRepository

from . import box_proxy, box_store
from .box_e2b import KIND as E2B_KIND
from .box_e2b import TRAFFIC_HEADER as E2B_TRAFFIC_HEADER
from .box_hosts import BoxHostError
from .box_repository import SandBoxRepository
from .box_service import broker, dial_headers
from .brain_users import (
    brain_on,
    brain_source_id,
    email_on_brain,
    user_on_brain,
)

log = structlog.get_logger()

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)

BRAIN_TOKEN_HEADER = "x-simeon-brain-token"
BRAIN_USER_HEADER = "x-simeon-brain-user"
NO_STORE = {"cache-control": "no-store"}

#: The computer's window router (`box/bin/simeon-window-router.mjs`).
HANDS_PORT = 1339
#: The computer's own token, which its router checks in the `hands` role.
BOX_TOKEN_HEADER = "x-simeon-box-token"
#: Never sent on to the computer: the brain's own headers, and anything the
#: API alone sets.
NOT_FOR_THE_HANDS = frozenset(
    {
        BRAIN_TOKEN_HEADER,
        BRAIN_USER_HEADER,
        BOX_TOKEN_HEADER,
        E2B_TRAFFIC_HEADER,
        box_proxy.NETWORK_TOKEN_HEADER,
    }
)
#: How long a call waits for the computer while it is being updated or
#: replaced, or while E2B still says it is gone after a wake: under the
#: minute the engine gives a call.
WAKE_WAIT_SECONDS = box_proxy.REPLACED_WAIT_SECONDS
WAKE_POLL_SECONDS = box_proxy.REPLACED_POLL_SECONDS
#: A full E2B account: the brain tries again after this.
FULL_RETRY_AFTER_S = 60

#: The computer's states as the apps read them (`CloudComputer.swift`).
APP_STATES = frozenset({"running", "hibernated", "absent"})


def brain_token_ok(request: Request) -> bool:
    offered = request.headers.get(BRAIN_TOKEN_HEADER, "")
    return (
        brain_on()
        and bool(offered)
        and secrets.compare_digest(
            offered.encode(), settings.BRAIN_TOKEN.strip().encode()
        )
    )


def refused(
    reason: str,
    status: int,
    message: str,
    *,
    headers: Mapping[str, str] | None = None,
    **fields: Any,
) -> JSONResponse:
    """A refusal in a shape the engine's Connect client reads: its
    `message` becomes the error the agent sees."""
    log.warning("sand.brain.refused", reason=reason, status=status, **fields)
    return JSONResponse(
        {"error": reason, "message": message},
        status_code=status,
        headers={**NO_STORE, **(headers or {})},
    )


async def person_for_brain(
    request: Request, session: AsyncSession
) -> tuple[User, SandBox | None] | JSONResponse:
    """The person a brain's call names in `x-simeon-brain-user`, with their
    computer's row: a 401 for a wrong token, a 403 for someone not on the
    brain."""
    if not brain_token_ok(request):
        return refused("brain_token", 401, "The brain's token was refused.")
    raw = request.headers.get(BRAIN_USER_HEADER, "").strip()
    try:
        user_id = UUID(raw)
    except ValueError:
        return refused("brain_user", 400, "Name the person by their user id.")
    user = await UserRepository.from_session(session).get_by_id(user_id)
    if not user_on_brain(user):
        return refused(
            "not_on_brain",
            403,
            "This person's agents do not run on the brain.",
            user=raw,
        )
    assert user is not None
    box = await SandBoxRepository.from_session(session).get_by_user(user.id)
    return user, box


@router.post("/sand-box/brain/bootstrap")
async def bootstrap(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> JSONResponse:
    if not brain_token_ok(request):
        return refused("brain_token", 401, "The brain's token was refused.")
    try:
        body = await request.json()
    except Exception:
        body = None
    email = body.get("email") if isinstance(body, dict) else None
    if not isinstance(email, str) or not email_on_brain(email):
        return refused(
            "not_on_brain", 403, "This person's agents do not run on the brain."
        )
    user = await UserRepository.from_session(session).get_by_email(email.strip())
    if user is None:
        return refused("no_user", 404, "No one signs in with that address.")
    box = await SandBoxRepository.from_session(session).get_by_user(user.id)
    if box is None or not box.gateway_token or box.credential_session_id is None:
        return refused(
            "no_computer",
            409,
            "This person has no computer yet: open Simeon on a device first.",
            user=str(user.id),
        )
    repository = DesktopSessionRepository.from_session(session)
    box_credential = await repository.get_by_id(box.credential_session_id)
    parent = (
        await repository.get_parent_of(box_credential)
        if box_credential is not None
        else None
    )
    if parent is None or parent.is_revoked:
        return refused(
            "signed_out",
            409,
            "The device this computer belongs to has signed out: sign in on a device first.",
            user=str(user.id),
        )
    try:
        _, credential = await desktop.issue_brain_credential(session, parent)
    except DesktopUnauthenticated as error:
        return refused("signed_out", 409, error.message, user=str(user.id))
    log.info(
        "sand.brain.bootstrap",
        user=str(user.id),
        box=str(box.id),
        computer_state=box.state,
    )
    return JSONResponse(
        {
            "userId": str(user.id),
            "gatewayToken": box.gateway_token,
            "credential": credential,
            "backendUrl": settings.BASE_URL,
            "computerStoreSource": box_store.box_source_id(user.id),
            "brainStoreSource": brain_source_id(user.id),
        },
        headers=NO_STORE,
    )


@router.get("/sand-box/brain/hands/state")
async def computer_state(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> JSONResponse:
    found = await person_for_brain(request, session)
    if isinstance(found, JSONResponse):
        return found
    _, box = found
    state = box.state if box is not None and box.state in APP_STATES else "absent"
    return JSONResponse({"state": state}, headers=NO_STORE)


# --- the door to the computer's hands ----------------------------------------------


def hands_target(box: SandBox) -> tuple[str, dict[str, str]] | None:
    """The computer's window router as the API dials it, with the headers
    it adds: E2B's traffic token and the computer's own token. None for a
    computer whose router the API cannot reach (Docker publishes only the
    apps' ports, `BOX_PORTS`)."""
    if (box.host_meta or {}).get("kind") != E2B_KIND or not box.gateway_token:
        return None
    base = broker.internal_url(box, HANDS_PORT)
    if base is None:
        return None
    return base, {**dial_headers(box), BOX_TOKEN_HEADER: box.gateway_token}


def hands_headers(headers: Any) -> dict[str, str]:
    """What of the brain's call goes on: the engine's own headers (its
    bearer for the hands, `x-sand-display` for an agent's window), never the
    brain's token or a token the API alone sets."""
    return {
        name: value
        for name, value in box_proxy.forwardable(headers).items()
        if name.lower() not in NOT_FOR_THE_HANDS
    }


async def awake_computer(
    sessions: box_proxy.LookupSessions, user_id: UUID, *, why: str
) -> SandBox | JSONResponse:
    """The person's computer woken under their ensure lock
    (`broker.wake_locked`, in a session of its own, committed here so the
    lock is released before the call goes on), and its row read again. An
    update or a replacement holding the lock is waited for, up to
    `WAKE_WAIT_SECONDS`."""
    deadline = time.monotonic() + WAKE_WAIT_SECONDS
    started = time.monotonic()
    while True:
        try:
            async with sessions() as db:
                outcome = await broker.wake_locked(db, user_id)
                await db.commit()
        except BoxHostError as error:
            log.warning(
                "sand.brain.hands.wake_failed", user=str(user_id), error=str(error)
            )
            return refused(
                "wake_failed",
                502,
                "The computer could not be woken. Try again in a minute.",
                user=str(user_id),
            )
        if outcome != "ensuring" or time.monotonic() >= deadline:
            break
        await asyncio.sleep(WAKE_POLL_SECONDS)
    log.info(
        "sand.brain.hands.woke",
        user=str(user_id),
        why=why,
        outcome=outcome,
        ms=round((time.monotonic() - started) * 1000),
    )
    if outcome == "deferred":
        return refused(
            "computer_full",
            503,
            "Simeon's cloud computers are all in use. Try again in a minute.",
            headers={"retry-after": str(FULL_RETRY_AFTER_S)},
            user=str(user_id),
        )
    if outcome == "ensuring":
        return refused(
            "computer_updating",
            503,
            "The computer is being updated. Try again in a minute.",
            headers={"retry-after": str(int(WAKE_WAIT_SECONDS))},
            user=str(user_id),
        )
    if outcome not in ("woken", "awake"):
        return refused(
            "no_computer",
            409,
            "This person has no computer to wake: open Simeon on a device first.",
            user=str(user_id),
            outcome=outcome,
        )
    async with sessions() as db:
        box = await SandBoxRepository.from_session(db).get_by_user(user_id)
    if box is None:
        return refused("no_computer", 409, "This person has no computer.")
    return box


async def _hands_http(
    request: Request, path: str, sessions: box_proxy.LookupSessions
) -> Any:
    # A session of its own for the lookup, closed before the answer streams
    # (`box_proxy.lookup_sessions`): a long command must not hold a
    # database connection.
    async with sessions() as db:
        found = await person_for_brain(request, db)
    if isinstance(found, JSONResponse):
        return found
    user, box = found
    if box is None or not box.gateway_token:
        return refused(
            "no_computer",
            409,
            "This person has no computer yet: open Simeon on a device first.",
            user=str(user.id),
        )
    if hands_target(box) is None:
        return refused(
            "no_door",
            409,
            "This computer's hands cannot be reached from the server: only a "
            "cloud computer on E2B has the door.",
            user=str(user.id),
        )
    if box.state != "running":
        woken = await awake_computer(sessions, user.id, why=box.state)
        if isinstance(woken, JSONResponse):
            return woken
        box = woken
    target = hands_target(box)
    if target is None:
        return refused("no_door", 409, "This computer has no door.", user=str(user.id))
    try:
        kept = await box_proxy.kept_body(request)
    except ClientDisconnect:
        return Response(status_code=499)
    redis = getattr(request.state, "redis", None)
    query = request.url.query
    headers = hands_headers(request.headers)
    client = box_proxy.upstream_client()
    started = time.monotonic()

    async def send(base: str, dial: dict[str, str]) -> httpx.Response | Response:
        upstream = client.build_request(
            request.method,
            f"{base}/{path}" + (f"?{query}" if query else ""),
            headers={**headers, **dial},
            content=request.stream() if kept is None else kept,
        )
        try:
            return await client.send(upstream, stream=True)
        except ClientDisconnect:
            return Response(status_code=499)
        except httpx.HTTPError as error:
            log.warning(
                "sand.brain.hands.unreachable",
                user=str(user.id),
                path=path[:120],
                error=type(error).__name__,
            )
            return refused(
                "computer_unreachable",
                502,
                "The computer did not answer. Try again in a minute.",
                user=str(user.id),
            )

    async def reach(
        box: SandBox, target: tuple[str, dict[str, str]]
    ) -> tuple[SandBox, httpx.Response] | Response:
        """The hands' answer, its head read; or what the brain is told."""
        response = await send(*target)
        if isinstance(response, Response):
            return response
        if response.status_code < 400:
            return box, response
        content = await response.aread()
        await response.aclose()
        # The row said running and E2B has lost the sandbox (paused under
        # the call, or frozen): woken and sent again until it takes it. The
        # call never reached the computer, so it cannot arrive twice.
        deadline = time.monotonic() + WAKE_WAIT_SECONDS
        while kept is not None and box_proxy.sandbox_gone(
            box, response.status_code, content
        ):
            woken = await awake_computer(sessions, box.user_id, why="gone")
            if isinstance(woken, JSONResponse):
                return woken
            box = woken
            again = hands_target(box)
            if again is None:
                return refused(
                    "no_door", 409, "This computer has no door.", user=str(user.id)
                )
            response = await send(*again)
            if isinstance(response, Response):
                return response
            if response.status_code < 400:
                return box, response
            content = await response.aread()
            await response.aclose()
            if time.monotonic() >= deadline or await request.is_disconnected():
                break
            if box_proxy.sandbox_gone(box, response.status_code, content):
                await asyncio.sleep(WAKE_POLL_SECONDS)
        # The hands' own refusal (a Connect error is a short JSON sentence;
        # the router's is "box token refused"), read whole so the log names it.
        log.warning(
            "sand.brain.hands.upstream_error",
            user=str(user.id),
            box=str(box.id),
            path=path[:120],
            status=response.status_code,
            body=content[:300].decode("utf-8", "replace"),
        )
        return Response(
            content=content,
            status_code=response.status_code,
            headers=box_proxy.forwardable(response.headers),
        )

    # A call on the hands is the computer in use: the sleeper leaves it
    # (`box_service.is_attached`) while the call is open, a long command
    # waiting for its answer included, and for a few minutes after.
    waiting = asyncio.create_task(box_proxy.keep_attached(redis, box.id))
    try:
        reached = await reach(box, target)
    finally:
        waiting.cancel()
    if isinstance(reached, Response):
        await client.aclose()
        return reached
    box, answer = reached
    box_id = box.id

    async def body() -> AsyncIterator[bytes]:
        attached = asyncio.create_task(box_proxy.keep_attached(redis, box_id))
        try:
            async for chunk in answer.aiter_raw():
                yield chunk
        except httpx.HTTPError as error:
            log.info(
                "sand.brain.hands.stream_ended",
                user=str(user.id),
                path=path[:120],
                error=type(error).__name__,
            )
        finally:
            attached.cancel()
            await answer.aclose()
            log.info(
                "sand.brain.hands.call",
                user=str(user.id),
                path=path[:120],
                status=answer.status_code,
                ms=round((time.monotonic() - started) * 1000),
            )

    return StreamingResponse(
        body(),
        status_code=answer.status_code,
        headers=box_proxy.forwardable(answer.headers),
        background=BackgroundTask(client.aclose),
    )


@router.api_route(
    "/sand-box/brain/hands/{path:path}",
    methods=box_proxy.METHODS,
    name="sand:brain_hands",
)
async def hands(
    request: Request,
    path: str,
    sessions: box_proxy.LookupSessions = Depends(box_proxy.lookup_sessions),
) -> Any:
    return await _hands_http(request, path, sessions)


__all__ = [
    "BRAIN_TOKEN_HEADER",
    "BRAIN_USER_HEADER",
    "brain_on",
    "brain_source_id",
    "email_on_brain",
    "router",
    "user_on_brain",
]
