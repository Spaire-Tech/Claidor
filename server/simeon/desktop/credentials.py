"""The person's Credentials Store (28 October 2026; the founder, 29 October:
"name it Credentials Store"): the logins and the contact info the agents
sign in and sign up with, and (9 November 2026) the cards they pay with. Kept here, not on the agents' computer, so the apps
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

Cards (9 November 2026, the founder: "actual cards there that the agent can
use to make payments", the security code kept: "otherwise its useless"): the
number, expiry, security code, name on the card, the billing address (a
contact entry's id), a nickname and hints. Only the apps add or change one.
The list gives the brand, the last four digits and the expiry, never the
number or the code; one entry read whole gives them, to the apps' editor and
to the computer, which types them into a checkout the person approved (the
agent itself never sees them). Each entry is sealed for its person (`simeon.kit.sealed`, purpose
`credentials:<user id>`): a copy of the database alone opens none, and one
person's entry can't be read as another's. Nothing here logs a value.
Delete Account removes them (`account_repository.py`).
"""

from __future__ import annotations

import json
import re
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

KINDS = ("login", "contact", "card")
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
    "card": (
        "name",
        "cardholder",
        "number",
        "expiry",
        "securityCode",
        "billingId",
        "hints",
    ),
}
#: The fields only one entry read whole gives (`with_secrets`): the list says
#: whether they are there (a password, a code) or what shows of them (a
#: card's brand and last four digits).
SECRETS = ("password", "number", "securityCode")
#: The longest each field may be; any other field, `FIELD_MAX`.
LIMITS = {
    "name": 200,
    "website": 2048,
    "username": 512,
    "password": 1024,
    "hints": 2000,
    "cardholder": 200,
    "number": 19,
    "expiry": 5,
    "securityCode": 4,
    "billingId": 36,
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


def card_brand(number: str) -> str:
    """The card's network from its first digits: `visa`, `mastercard`,
    `amex`, `discover`, `jcb`, `diners`, `unionpay`, or empty."""
    if not number.isdigit():
        return ""
    two, four = int(number[:2] or 0), int(number[:4] or 0)
    if number.startswith("4"):
        return "visa"
    if 51 <= two <= 55 or 2221 <= four <= 2720:
        return "mastercard"
    if two in (34, 37):
        return "amex"
    if number.startswith(("6011", "65")) or 644 <= int(number[:3] or 0) <= 649:
        return "discover"
    if 3528 <= four <= 3589:
        return "jcb"
    if two in (36, 38) or 300 <= int(number[:3] or 0) <= 305:
        return "diners"
    if number.startswith("62"):
        return "unionpay"
    return ""


def card_number_ok(number: str) -> bool:
    """12 to 19 digits that pass the Luhn check every card number does."""
    if not number.isdigit() or not 12 <= len(number) <= 19:
        return False
    total = 0
    for index, digit in enumerate(reversed(number)):
        value = int(digit)
        if index % 2 == 1:
            value = value * 2 - 9 if value > 4 else value * 2
        total += value
    return total % 10 == 0


_EXPIRY = re.compile(r"^(\d{1,2})\s*/?\s*(\d{2}|\d{4})$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def card_expiry(raw: str) -> str:
    """ "MM/YY" from "8/28", "08/2028" or "0828"; empty when it isn't one."""
    text = raw.strip()
    if re.fullmatch(r"\d{4}", text):
        text = f"{text[:2]}/{text[2:]}"
    match = _EXPIRY.match(text)
    if match is None:
        return ""
    month, year = int(match.group(1)), match.group(2)[-2:]
    return f"{month:02d}/{year}" if 1 <= month <= 12 else ""


class EntryBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kind: Literal["login", "contact", "card"] | None = None
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
    cardholder: str | None = None
    number: str | None = None
    expiry: str | None = None
    securityCode: str | None = None
    billingId: str | None = None
    #: The agent that saved it, when the computer saves it.
    savedBy: str | None = None


def _value(field: str, raw: str | None) -> str:
    """A field as kept: trimmed, but a password exactly as written; a card's
    number without its spaces and dashes, its expiry as "MM/YY" (left as
    written when it isn't one, to be refused)."""
    text = raw or ""
    if field == "password":
        return text
    if field == "number":
        return re.sub(r"[\s-]", "", text)
    if field == "expiry":
        return card_expiry(text) or text.strip()
    if field == "billingId":
        return text.strip().lower()
    return text.strip()


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
    if kind == "card":
        if not card_number_ok(values.get("number", "")):
            return "credentials.card_number"
        if not card_expiry(values.get("expiry", "")):
            return "credentials.card_expiry"
        code = values.get("securityCode", "")
        if code and not (code.isdigit() and 3 <= len(code) <= 4):
            return "credentials.card_code"
        billing = values.get("billingId", "")
        if billing and not _UUID.match(billing):
            return "credentials.card_billing"
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
        if field in SECRETS:
            secret = values.get(field, "")
            if field == "password":
                entry["hasPassword"] = bool(secret)
            elif field == "number":
                entry["brand"] = card_brand(secret)
                entry["last4"] = secret[-4:]
            else:
                entry["hasSecurityCode"] = bool(secret)
            if with_password:
                entry[field] = secret
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
    for field in ("name", "site", "fullName", "email", "brand"):
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
    if kind == "card" and desktop_session.is_box_credential:
        # Only the person adds a card, in the apps.
        return _fail(403, "credentials.card_by_person")
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
