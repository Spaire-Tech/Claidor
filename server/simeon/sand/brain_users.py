"""Who is on the brain (5 November 2026, `docs/agents-on-the-server/README.md`,
step 1c): the people whose agents run on the brain, the agents' engine off
the computer. Apart from `brain.py` so the apps' proxy (`box_proxy`), the
broker's RPCs and the wake job can ask without importing the brain's routes.

A person is on the brain when the brain is configured (`SIMEON_BRAIN_URL`,
`SIMEON_BRAIN_TOKEN`) and their e-mail address is in `SIMEON_BRAIN_USERS`.
For everyone else these all answer no and nothing changes.

One brain serves one person today: `SIMEON_BRAIN_URL` is that person's
engine. The brain's gateway checks each app's bearer (the person's own
gateway token), so an app of someone else listed by mistake is refused
there, never served another person's agents.
"""

from __future__ import annotations

import time
import uuid
from uuid import UUID

from simeon.config import settings
from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.user.repository import UserRepository

from . import box_store


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


def brain_base_url() -> str:
    """The brain's engine as the API dials it (its gateway: `/api/*`,
    `/events`, `/health`, `/avatars`)."""
    return settings.BRAIN_URL.strip().rstrip("/")


def brain_source_id(user_id: UUID | str) -> str:
    """The source the brain backs the person's agents up under
    (`SAND_BOX_STORE_ID` on the brain): its own, beside the computer's
    (`box_store.box_source_id`), so the two never share a store."""
    return str(uuid.uuid5(box_store.NAMESPACE, f"brain:{user_id}"))


# --- asked on every proxied call -------------------------------------------------
#
# The apps' proxy asks for each call to the engine's port whether the person
# is on the brain: their address, read once a minute per person and per list,
# not at every call (the event stream, the polls, one tail per open chat).

ON_BRAIN_TTL_SECONDS = 60.0
ON_BRAIN_CACHE_LIMIT = 10_000
_on_brain: dict[tuple[UUID, str], tuple[float, bool]] = {}


async def user_id_on_brain(db: AsyncSession, user_id: UUID) -> bool:
    """`user_on_brain` for a user id, remembered for `ON_BRAIN_TTL_SECONDS`.
    No database read at all while nobody is on the brain."""
    if not brain_on() or not brain_emails():
        return False
    key = (user_id, settings.BRAIN_USERS)
    now = time.monotonic()
    known = _on_brain.get(key)
    if known is not None and known[0] > now:
        return known[1]
    user = await UserRepository.from_session(db).get_by_id(user_id)
    answer = user_on_brain(user)
    if len(_on_brain) >= ON_BRAIN_CACHE_LIMIT:
        _on_brain.clear()
    _on_brain[key] = (now + ON_BRAIN_TTL_SECONDS, answer)
    return answer


def forget_for_tests() -> None:
    _on_brain.clear()


__all__ = [
    "brain_base_url",
    "brain_emails",
    "brain_on",
    "brain_source_id",
    "email_on_brain",
    "forget_for_tests",
    "user_id_on_brain",
    "user_on_brain",
]
