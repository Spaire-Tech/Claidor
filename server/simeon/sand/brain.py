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

Every refusal is logged with the reason and never with a token.
"""

from __future__ import annotations

import secrets
import uuid
from typing import Any
from uuid import UUID

import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from simeon.config import settings
from simeon.desktop.repository import DesktopSessionRepository
from simeon.desktop.service import DesktopUnauthenticated, desktop
from simeon.models import SandBox, User
from simeon.openapi import APITag
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter
from simeon.user.repository import UserRepository

from . import box_store
from .box_repository import SandBoxRepository

log = structlog.get_logger()

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)

BRAIN_TOKEN_HEADER = "x-simeon-brain-token"
BRAIN_USER_HEADER = "x-simeon-brain-user"
NO_STORE = {"cache-control": "no-store"}

#: The computer's states as the apps read them (`CloudComputer.swift`).
APP_STATES = frozenset({"running", "hibernated", "absent"})


def brain_on() -> bool:
    """Whether the brain is configured at all."""
    return bool(settings.BRAIN_URL.strip() and settings.BRAIN_TOKEN.strip())


def brain_emails() -> frozenset[str]:
    return frozenset(
        address.strip().lower()
        for address in settings.BRAIN_USERS.split(",")
        if address.strip()
    )


def email_on_brain(email: str | None) -> bool:
    """Whether this person's agents run on the brain."""
    if not email or not brain_on():
        return False
    return email.strip().lower() in brain_emails()


def user_on_brain(user: User | None) -> bool:
    return user is not None and email_on_brain(user.email)


def brain_source_id(user_id: UUID | str) -> str:
    """The source the brain backs the person's agents up under
    (`SAND_BOX_STORE_ID` on the brain): its own, beside the computer's
    (`box_store.box_source_id`), so the two never share a store."""
    return str(uuid.uuid5(box_store.NAMESPACE, f"brain:{user_id}"))


def brain_token_ok(request: Request) -> bool:
    offered = request.headers.get(BRAIN_TOKEN_HEADER, "")
    return (
        brain_on()
        and bool(offered)
        and secrets.compare_digest(
            offered.encode(), settings.BRAIN_TOKEN.strip().encode()
        )
    )


def refused(reason: str, status: int, message: str, **fields: Any) -> JSONResponse:
    log.warning("sand.brain.refused", reason=reason, status=status, **fields)
    return JSONResponse(
        {"error": reason, "message": message}, status_code=status, headers=NO_STORE
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


__all__ = [
    "BRAIN_TOKEN_HEADER",
    "BRAIN_USER_HEADER",
    "brain_on",
    "brain_source_id",
    "email_on_brain",
    "router",
    "user_on_brain",
]
