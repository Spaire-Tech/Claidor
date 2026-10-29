"""The person's Secure Credentials Store (28 October 2026, the founder: "Let's
call it Secure Credentials Store"): the logins and the contact info the agents
sign in and sign up with. Kept here, not on the agents' computer, so the apps
change them while the computer sleeps and the agents use them while the Mac
is closed.

- `GET /desktop/api/credentials` — every entry, a login's password left out
  (`hasPassword`): the apps' list, and the agents' (the computer's own
  credential).
- `GET /desktop/api/credentials/{id}` — one entry with its password: the
  apps' editor (after Face ID or Touch ID), and the computer, to type it into
  a sign-in or hand it to the agent that asked.
- `POST /desktop/api/credentials` — a new entry: from the apps, or from the
  computer when an agent made a password at a sign-up or was given one in
  the chat (`savedBy`, the agent's name, kept only from the computer).
- `PATCH /desktop/api/credentials/{id}` — the apps; and the computer, only
  for a login an agent saved (a sign-up's password the site refused, made
  again). What the person saved, an agent never changes.
- `DELETE /desktop/api/credentials/{id}` — the apps only.

Cards are not kept: Link holds them, and an agent pays with a one-time card.
Each entry is sealed for its person (`simeon.kit.sealed`, purpose
`credentials:<user id>`): a copy of the database alone opens none, and one
person's entry can't be read as another's. Nothing here logs a value.
Delete Account removes them (`account_repository.py`).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal
from urllib.parse import urlsplit
from uuid import UUID

import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from simeon.kit.sealed import seal, unseal
from simeon.models import DesktopCredential, DesktopSession
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .auth import get_desktop_or_box_session, get_desktop_session
from .credential_repository import DesktopCredentialRepository
from .words import say

log = structlog.get_logger()

# Mounted under the desktop router (`/desktop`).
router = APIRouter(include_in_schema=False)

KINDS = ("login", "contact")
#: What each kind holds, in the order the apps show it.
FIELDS: dict[str, tuple[str, ...]] = {
    "login": ("name", "website", "username", "password", "hints"),
    "contact": (
        "name",
        "fullName",
        "email",
        "phone",
        "addressLine1",
        "addressLine2",
        "city",
        "region",
        "postalCode",
        "country",
        "hints",
    ),
}
#: The longest each field may be; any other field, `FIELD_MAX`.
LIMITS = {
    "name": 200,
    "website": 2048,
    "username": 512,
    "password": 1024,
    "hints": 2000,
}
FIELD_MAX = 300
SAVED_BY_MAX = 100
#: Entries a person may keep.
ENTRIES_MAX = 2000


def _purpose(user_id: UUID) -> str:
    return f"credentials:{user_id}"


def site_of(value: str) -> str:
    """ "acme.com" from an address or a domain, without "www."; empty when it
    names no site (the engine's `siteOf`)."""
    text = value.strip()
    if not text or any(character.isspace() for character in text):
        return ""
    try:
        host = urlsplit(text if "://" in text else f"https://{text}").hostname or ""
    except ValueError:
        return ""
    host = host.lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    return host if "." in host else ""


def _ms(moment: datetime | None) -> int | None:
    return None if moment is None else int(moment.timestamp() * 1000)


def _ok(data: Any) -> JSONResponse:
    return JSONResponse(
        {"code": 0, "data": data}, headers={"cache-control": "no-store"}
    )


def _fail(code: int, key: str) -> JSONResponse:
    """The app's error shape (`_fail` in `endpoints.py`), at 200 so the apps
    and the engine both read its sentence."""
    return JSONResponse({"code": code, "message": say(key)})


class EntryBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kind: Literal["login", "contact"] | None = None
    name: str | None = None
    website: str | None = None
    username: str | None = None
    password: str | None = None
    hints: str | None = None
    fullName: str | None = None
    email: str | None = None
    phone: str | None = None
    addressLine1: str | None = None
    addressLine2: str | None = None
    city: str | None = None
    region: str | None = None
    postalCode: str | None = None
    country: str | None = None
    #: The agent that saved it, when the computer saves it.
    savedBy: str | None = None


def _value(field: str, raw: str | None) -> str:
    """A field as kept: trimmed, but a password exactly as written."""
    text = raw or ""
    return text if field == "password" else text.strip()


def _problem(kind: str, values: dict[str, str]) -> str | None:
    """The sentence's key when the entry can't be kept, else None."""
    for field in FIELDS[kind]:
        if len(values.get(field, "")) > LIMITS.get(
            field, FIELD_MAX
        ) or "\x00" in values.get(field, ""):
            return "credentials.too_long"
    if kind == "login":
        if values.get("website") and not site_of(values["website"]):
            return "credentials.website"
        if not values.get("website") and not values.get("name"):
            return "credentials.login_needs_site"
        if not values.get("username") and not values.get("password"):
            return "credentials.login_needs_sign_in"
        return None
    if not any(
        values.get(field)
        for field in FIELDS["contact"]
        if field not in ("name", "hints")
    ):
        return "credentials.contact_empty"
    return None


def _open(row: DesktopCredential) -> dict[str, str] | None:
    """What the entry holds, or None when it can't be opened (sealed under
    another `SECRET`)."""
    opened = unseal(row.sealed, purpose=_purpose(row.user_id))
    if opened is None:
        return None
    try:
        values = json.loads(opened)
    except ValueError:
        return None
    if not isinstance(values, dict):
        return None
    return {key: value for key, value in values.items() if isinstance(value, str)}


def _seal(row_user: UUID, values: dict[str, str]) -> str:
    return seal(json.dumps(values, sort_keys=True), purpose=_purpose(row_user))


def _entry(
    row: DesktopCredential, values: dict[str, str], *, with_password: bool
) -> dict[str, Any]:
    entry: dict[str, Any] = {"id": str(row.id), "kind": row.kind}
    for field in FIELDS[row.kind]:
        if field == "password":
            entry["hasPassword"] = bool(values.get("password"))
            if with_password:
                entry["password"] = values.get("password", "")
            continue
        entry[field] = values.get(field, "")
    if row.kind == "login":
        entry["site"] = site_of(values.get("website", ""))
    if values.get("savedBy"):
        entry["savedBy"] = values["savedBy"]
    entry["createdAt"] = _ms(row.created_at)
    entry["updatedAt"] = _ms(row.modified_at or row.created_at)
    return entry


def _title(entry: dict[str, Any]) -> str:
    for field in ("name", "site", "fullName", "email"):
        if entry.get(field):
            return str(entry[field])
    return ""


def _who(desktop_session: DesktopSession) -> str:
    return "computer" if desktop_session.is_box_credential else "app"


@router.get("/api/credentials", name="desktop:credentials_list")
async def credentials_list(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    rows = await DesktopCredentialRepository.from_session(session).list_by_user(
        desktop_session.user_id
    )
    entries: list[dict[str, Any]] = []
    unreadable = 0
    for row in rows:
        values = _open(row)
        if values is None or row.kind not in KINDS:
            unreadable += 1
            continue
        entries.append(_entry(row, values, with_password=False))
    if unreadable:
        # Kept, not deleted: they open again if the key comes back.
        log.warning(
            "desktop.credentials.unreadable",
            user_id=str(desktop_session.user_id),
            count=unreadable,
        )
    entries.sort(
        key=lambda entry: (KINDS.index(entry["kind"]), _title(entry).casefold())
    )
    return _ok({"entries": entries})


@router.get("/api/credentials/{entry_id}", name="desktop:credentials_get")
async def credentials_get(
    entry_id: UUID,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    row = await DesktopCredentialRepository.from_session(session).for_user(
        desktop_session.user_id, entry_id
    )
    values = None if row is None else _open(row)
    if row is None or values is None or row.kind not in KINDS:
        return _fail(404, "credentials.not_found")
    log.info(
        "desktop.credentials.read",
        user_id=str(desktop_session.user_id),
        kind=row.kind,
        by=_who(desktop_session),
    )
    return _ok({"entry": _entry(row, values, with_password=True)})


@router.post("/api/credentials", name="desktop:credentials_create")
async def credentials_create(
    body: EntryBody,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    if body.kind is None:
        return _fail(422, "credentials.kind")
    kind = body.kind
    values = {field: _value(field, getattr(body, field)) for field in FIELDS[kind]}
    problem = _problem(kind, values)
    if problem is not None:
        return _fail(422, problem)
    if desktop_session.is_box_credential and body.savedBy and body.savedBy.strip():
        values["savedBy"] = body.savedBy.strip()[:SAVED_BY_MAX]
    repository = DesktopCredentialRepository.from_session(session)
    if await repository.count_for_user(desktop_session.user_id) >= ENTRIES_MAX:
        return _fail(409, "credentials.full")
    kept = {key: value for key, value in values.items() if value}
    row = await repository.create(
        DesktopCredential(
            user_id=desktop_session.user_id,
            kind=kind,
            sealed=_seal(desktop_session.user_id, kept),
        ),
        flush=True,
    )
    log.info(
        "desktop.credentials.saved",
        user_id=str(desktop_session.user_id),
        kind=kind,
        by=_who(desktop_session),
    )
    return _ok({"entry": _entry(row, kept, with_password=False)})


@router.patch("/api/credentials/{entry_id}", name="desktop:credentials_update")
async def credentials_update(
    entry_id: UUID,
    body: EntryBody,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    row = await DesktopCredentialRepository.from_session(session).for_user(
        desktop_session.user_id, entry_id
    )
    values = None if row is None else _open(row)
    if row is None or values is None or row.kind not in KINDS:
        return _fail(404, "credentials.not_found")
    if desktop_session.is_box_credential and not values.get("savedBy"):
        # The person's own entry: the computer may not change it.
        return _fail(404, "credentials.not_found")
    # Only the fields sent change; a field sent empty is cleared.
    for field in FIELDS[row.kind]:
        if field in body.model_fields_set:
            values[field] = _value(field, getattr(body, field))
    problem = _problem(row.kind, values)
    if problem is not None:
        return _fail(422, problem)
    kept = {key: value for key, value in values.items() if value}
    row.sealed = _seal(desktop_session.user_id, kept)
    row.set_modified_at()
    await session.flush()
    log.info(
        "desktop.credentials.changed",
        user_id=str(desktop_session.user_id),
        kind=row.kind,
        by=_who(desktop_session),
    )
    return _ok({"entry": _entry(row, kept, with_password=False)})


@router.delete("/api/credentials/{entry_id}", name="desktop:credentials_delete")
async def credentials_delete(
    entry_id: UUID,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    removed = await DesktopCredentialRepository.from_session(session).remove(
        desktop_session.user_id, entry_id
    )
    if not removed:
        return _fail(404, "credentials.not_found")
    log.info("desktop.credentials.deleted", user_id=str(desktop_session.user_id))
    return _ok({"deleted": True})


__all__ = ["FIELDS", "router", "site_of"]
