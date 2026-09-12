"""The desktop app's account service.

Everything the desktop app, Maties (`desktop/`), asks of its server in
account mode, on Claidor's side: auth codes, sessions with rotating
refresh tokens, the model catalogue the app may call, the monthly
credit allowance, and the metering of every call made through the
proxy. The wire shapes are the app's own, read from its source
(`desktop/src/main/main.ts`, `desktop/src/main/authQuota.ts`,
`desktop/src/main/libs/openclawTokenProxy.ts`); nothing here is
invented beyond what that code reads.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from polar.config import settings
from polar.desktop.tokens import (
    ACCESS_TOKEN_PREFIX,
    AUTH_CODE_PREFIX,
    REFRESH_TOKEN_PREFIX,
)
from polar.exceptions import PolarError
from polar.kit.crypto import generate_token_hash_pair, get_token_hash
from polar.kit.utils import utc_now
from polar.models import (
    DesktopAuthCode,
    DesktopMemoryFile,
    DesktopSession,
    DesktopUsage,
    User,
)
from polar.postgres import AsyncSession

from .memory_merge import is_accepted_memory_name, merge_memory_file
from .pricing import (
    MODELS,
    PROVIDER_TOKEN_WEIGHTS,
    DesktopModel,
    DesktopProvider,
    OpenAIUsageTally,
    SSEUsageTally,
    TokenWeights,
    Usage,
    UsageTally,
    credits_for,
    model_by_id,
    tally_for,
    usage_from_answer,
)
from .repository import (
    DesktopAuthCodeRepository,
    DesktopMemoryFileRepository,
    DesktopSessionRepository,
    DesktopUsageRepository,
)
from .speech import (
    SPEECH_MODEL_LABEL,
    SPEECH_PROVIDER_LABEL,
    credits_for_characters,
)

#: The app treats these numeric codes, inside a message or a payload,
#: as « credits exhausted » (desktop/src/common/coworkErrorClassify.ts).
QUOTA_EXHAUSTED_CODE = 40200
#: A bad auth code, a bad refresh token, a missing bearer.
AUTH_CODE_INVALID = 40101
REFRESH_INVALID = 40102
UNAUTHENTICATED = 40100
#: A memory sync Claidor will not carry out: a name it does not keep, or
#: more text than it accepts.
MEMORY_REFUSED = 40001

#: The memory is the assistant's own notes, a few pages of text. These
#: caps are far above anything honest and well below anything that would
#: hurt: one file, one request, and how many files a person may hold.
MEMORY_FILE_MAX_BYTES = 1024 * 1024
MEMORY_REQUEST_MAX_BYTES = 8 * 1024 * 1024
MEMORY_FILE_LIMIT = 2000


class DesktopError(PolarError): ...


class DesktopUnauthenticated(DesktopError):
    def __init__(self, message: str = "Sign in to the desktop app first.") -> None:
        super().__init__(message, status_code=401)


class DesktopMemoryRefused(DesktopError):
    """A memory sync that is not carried out at all: nothing is written
    when one file in it is refused."""

    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=400)


# --- the models the app may call ---------------------------------------------

# The catalogue and the whole of the metering live in
# `polar.desktop.pricing`, which imports nothing but the standard
# library so the price table can be read and tested on its own. What
# needs settings — which key, which address, and therefore which models
# are offered at all — stays here.


def provider_api_key(provider: DesktopProvider) -> str:
    """Claidor's key for one provider, or "" where none is configured."""
    if provider is DesktopProvider.openai:
        return settings.OPENAI_API_KEY
    return settings.ANTHROPIC_API_KEY


def provider_base_url(provider: DesktopProvider) -> str:
    if provider is DesktopProvider.openai:
        return settings.DESKTOP_OPENAI_BASE_URL
    return settings.DESKTOP_ANTHROPIC_BASE_URL


def provider_configured(provider: DesktopProvider) -> bool:
    return bool(provider_api_key(provider))


def offered_models() -> tuple[DesktopModel, ...]:
    """The models the app is told about. A provider with no key is not
    offered at all: a missing key must read as « not available here »
    when the menu is drawn, never as an error at the moment somebody
    sends a message."""
    return tuple(one for one in MODELS if provider_configured(one.provider))


# --- credits --------------------------------------------------------------------


def month_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The calendar month, in UTC, the allowance is counted over."""
    moment = now or utc_now()
    start = moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


# --- the shared memory ----------------------------------------------------------


@dataclass(frozen=True)
class IncomingMemoryFile:
    """One file as a client sent it, with the version it started from.
    `base_version` 0 means « I have never seen this file from you »."""

    name: str
    content: str
    base_version: int = 0


@dataclass(frozen=True)
class MemoryFileState:
    """One file as Claidor holds it once the sync is done. `changed`
    means the client must write this back: either it differs from what
    the client sent, or the client did not send it at all."""

    name: str
    content: str
    version: int
    changed: bool


@dataclass(frozen=True)
class MemorySync:
    """The whole truth about a person's memory after a sync: every file
    Claidor holds, and the names it pruned."""

    files: list[MemoryFileState]
    deleted: list[str]


# --- the service ---------------------------------------------------------------


class DesktopService:
    # auth codes

    async def create_auth_code(self, session: AsyncSession, user: User) -> str:
        code, code_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=AUTH_CODE_PREFIX
        )
        session.add(
            DesktopAuthCode(
                code_hash=code_hash,
                user_id=user.id,
                expires_at=utc_now() + settings.DESKTOP_AUTH_CODE_TTL,
            )
        )
        await session.flush()
        return code

    async def exchange_auth_code(
        self,
        session: AsyncSession,
        code: str,
        *,
        user_agent: str = "",
        client_version: str | None = None,
    ) -> tuple[DesktopSession, str, str]:
        """The code for a session. One use, five minutes; anything else
        raises `DesktopUnauthenticated`."""
        auth_code = await DesktopAuthCodeRepository.from_session(
            session
        ).get_by_code_hash(get_token_hash(code.strip(), secret=settings.SECRET))
        if (
            auth_code is None
            or auth_code.used_at is not None
            or auth_code.expires_at < utc_now()
            or not auth_code.user.can_authenticate
        ):
            raise DesktopUnauthenticated("This sign-in code is invalid or has expired.")
        auth_code.used_at = utc_now()
        session.add(auth_code)
        return await self._issue_session(
            session,
            auth_code.user,
            user_agent=user_agent,
            client_version=client_version,
        )

    # sessions

    async def _issue_session(
        self,
        session: AsyncSession,
        user: User,
        *,
        user_agent: str = "",
        client_version: str | None = None,
    ) -> tuple[DesktopSession, str, str]:
        access, access_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=ACCESS_TOKEN_PREFIX
        )
        refresh, refresh_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=REFRESH_TOKEN_PREFIX
        )
        now = utc_now()
        desktop_session = DesktopSession(
            access_token_hash=access_hash,
            access_expires_at=now + settings.DESKTOP_ACCESS_TOKEN_TTL,
            refresh_token_hash=refresh_hash,
            refresh_expires_at=now + settings.DESKTOP_REFRESH_TOKEN_TTL,
            user_agent=user_agent[:2000],
            client_version=(client_version or None) and client_version[:64],
            user_id=user.id,
        )
        desktop_session.user = user
        session.add(desktop_session)
        await session.flush()
        return desktop_session, access, refresh

    async def authenticate(
        self, session: AsyncSession, access_token: str
    ) -> DesktopSession | None:
        """The live session behind a bearer token, or None."""
        token = access_token.strip()
        if not token or not token.isascii():
            return None
        found = await DesktopSessionRepository.from_session(
            session
        ).get_by_access_token_hash(get_token_hash(token, secret=settings.SECRET))
        if (
            found is None
            or found.is_revoked
            or found.access_expires_at < utc_now()
            or not found.user.can_authenticate
        ):
            return None
        return found

    async def refresh(
        self, session: AsyncSession, refresh_token: str
    ) -> tuple[DesktopSession, str, str]:
        """A new pair of tokens for a live refresh token; the old refresh
        token dies with the exchange. Anything else raises
        `DesktopUnauthenticated`, which the app reads as « sign in again ».

        A session minted for a cloud job (`polar.maty`) is refused here
        whatever its state. Its refresh token is generated and thrown
        away, so this should be unreachable; it is written down anyway,
        because the one thing a job's credential must never do is become
        a lasting one, and « unreachable » is not a guarantee.
        """
        token = refresh_token.strip()
        if not token or not token.isascii():
            raise DesktopUnauthenticated("The refresh token is invalid.")
        found = await DesktopSessionRepository.from_session(
            session
        ).get_by_refresh_token_hash(get_token_hash(token, secret=settings.SECRET))
        if (
            found is None
            or found.is_job_token
            or found.is_revoked
            or found.refresh_expires_at < utc_now()
            or not found.user.can_authenticate
        ):
            raise DesktopUnauthenticated("The refresh token is invalid or has expired.")
        found.revoked_at = utc_now()
        session.add(found)
        return await self._issue_session(
            session,
            found.user,
            user_agent=found.user_agent,
            client_version=found.client_version,
        )

    async def revoke(
        self, session: AsyncSession, desktop_session: DesktopSession
    ) -> None:
        desktop_session.revoked_at = utc_now()
        session.add(desktop_session)
        await session.flush()

    # what the app shows about the person

    def user_payload(self, user: User) -> dict[str, Any]:
        """The `user` object the app stores and shows: it reads `id`,
        `nickname`, `avatarUrl` and `phone`; `accountMode` keeps it out
        of its enterprise paths."""
        local = user.email.split("@", 1)[0]
        nickname = (
            " ".join(
                part[:1].upper() + part[1:]
                for part in local.replace(".", " ").replace("_", " ").split()
            )
            or user.email
        )
        return {
            "id": str(user.id),
            "nickname": nickname,
            "email": user.email,
            "avatarUrl": user.avatar_url,
            "phone": None,
            "accountMode": "personal",
        }

    # credits

    async def credits_used(
        self, session: AsyncSession, user_id: UUID, *, now: datetime | None = None
    ) -> int:
        start, end = month_bounds(now)
        return await DesktopUsageRepository.from_session(session).credits_between(
            user_id, start, end
        )

    async def quota(
        self, session: AsyncSession, user: User, *, now: datetime | None = None
    ) -> dict[str, Any]:
        """The `quota` object the app normalises (`authQuota.ts`): a
        limit, what is used, what remains, a plan name and a status."""
        start, end = month_bounds(now)
        limit = settings.DESKTOP_MONTHLY_CREDITS
        used = await self.credits_used(session, user.id, now=now)
        return {
            "planName": "Free",
            "subscriptionStatus": "free",
            "creditsLimit": limit,
            "creditsUsed": used,
            "creditsRemaining": max(0, limit - used),
            "hasPaidCredits": False,
            "mediaGenerationEntitled": False,
            "shareEntitled": False,
            "deploymentEntitled": False,
            "periodStart": start.isoformat(),
            "periodEnd": end.isoformat(),
        }

    async def profile_summary(
        self, session: AsyncSession, user: User
    ) -> dict[str, Any]:
        quota = await self.quota(session, user)
        payload = self.user_payload(user)
        return {
            "id": payload["id"],
            "nickname": payload["nickname"],
            "avatarUrl": payload["avatarUrl"],
            "totalCreditsRemaining": quota["creditsRemaining"],
            "creditItems": [
                {
                    "type": "free",
                    "label": "Monthly credits",
                    "labelEn": "Monthly credits",
                    "creditsRemaining": quota["creditsRemaining"],
                    "expiresAt": quota["periodEnd"],
                }
            ],
        }

    async def exhausted(self, session: AsyncSession, user: User) -> bool:
        used = await self.credits_used(session, user.id)
        return used >= settings.DESKTOP_MONTHLY_CREDITS

    # the shared memory

    async def list_memory_files(
        self, session: AsyncSession, user: User
    ) -> Sequence[DesktopMemoryFile]:
        """Everything Claidor holds for one person, in name order."""
        return await DesktopMemoryFileRepository.from_session(session).list_by_user(
            user.id
        )

    async def sync_memory_files(
        self, session: AsyncSession, user: User, incoming: Iterable[IncomingMemoryFile]
    ) -> MemorySync:
        """One round of the shared memory, for one person.

        For each file the client sends:

        - a name Claidor does not keep refuses the whole sync, and
          nothing is written (`polar.desktop.memory_merge`);
        - a name Claidor has no row for is stored as sent, at version 1;
        - a name whose stored version is the one the client started from
          is stored as sent, at version + 1;
        - anything else means both sides wrote since: the two copies are
          merged by that file's rule and the merge is stored at version
          + 1. For the profile, which is one document with one owner,
          « merged » means Claidor's copy wins, because it is the one
          that moved on.

        A write that changes nothing leaves the version alone, so an
        idle app syncing every few minutes does not count upwards for
        ever.

        The answer carries **every** file Claidor holds afterwards, so a
        fresh computer receives the whole memory by sending nothing.

        Sizes: a single file over 1 MB or a request over 8 MB is refused
        whole. A person may hold 2000 files; past that the oldest daily
        notes are pruned, the newest kept, and their names come back
        under `deleted` so the client can drop them too. The durable
        facts and the profile are never pruned.
        """
        sent = list(incoming)
        self._check_memory_sizes(sent)

        repository = DesktopMemoryFileRepository.from_session(session)
        for file in sent:
            stored = await repository.get_by_name(user.id, file.name)
            if stored is None:
                await repository.upsert(
                    user.id, file.name, content=file.content, version=1
                )
                continue
            if file.base_version == stored.version:
                content = file.content
            else:
                content = merge_memory_file(
                    file.name, stored.content, file.content, ours_is_newer=True
                )
            if content != stored.content:
                await repository.upsert(
                    user.id, file.name, content=content, version=stored.version + 1
                )

        deleted = await self._prune_memory_files(session, user)
        by_name = {file.name: file.content for file in sent}
        return MemorySync(
            files=[
                MemoryFileState(
                    name=stored.name,
                    content=stored.content,
                    version=stored.version,
                    changed=by_name.get(stored.name) != stored.content,
                )
                for stored in await repository.list_by_user(user.id)
            ],
            deleted=deleted,
        )

    def _check_memory_sizes(self, files: list[IncomingMemoryFile]) -> None:
        """Every name and every size, before a single row is written."""
        total = 0
        for file in files:
            if not is_accepted_memory_name(file.name):
                raise DesktopMemoryRefused(
                    f"{file.name!r} is not a memory file Claidor keeps."
                )
            size = len(file.content.encode("utf-8"))
            if size > MEMORY_FILE_MAX_BYTES:
                raise DesktopMemoryRefused(
                    f"{file.name!r} is larger than {MEMORY_FILE_MAX_BYTES // 1024} KB."
                )
            total += size
        if total > MEMORY_REQUEST_MAX_BYTES:
            raise DesktopMemoryRefused(
                f"This sync carries more than "
                f"{MEMORY_REQUEST_MAX_BYTES // (1024 * 1024)} MB of memory."
            )

    async def _prune_memory_files(self, session: AsyncSession, user: User) -> list[str]:
        """The oldest daily notes above the cap, dropped. Their names
        sort by date, so the oldest are the first."""
        repository = DesktopMemoryFileRepository.from_session(session)
        held = await repository.list_by_user(user.id)
        over = len(held) - MEMORY_FILE_LIMIT
        if over <= 0:
            return []
        notes = sorted(
            (one for one in held if one.name.startswith("memory/")),
            key=lambda one: one.name,
        )
        deleted: list[str] = []
        for note in notes[:over]:
            deleted.append(note.name)
            await session.delete(note)
        await session.flush()
        return deleted

    async def record_usage(
        self,
        session: AsyncSession,
        *,
        user_id: UUID,
        session_id: UUID | None,
        model: DesktopModel,
        usage: Usage,
        stream: bool,
        upstream_status: int,
    ) -> DesktopUsage:
        row = DesktopUsage(
            user_id=user_id,
            session_id=session_id,
            model=model.model_id,
            # The price list the credits below were read off. Without it
            # a stored credit figure cannot be traced back to the list
            # that produced it, and two providers' figures stop being
            # comparable the first time either list moves.
            provider=model.provider.value,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_creation_tokens=usage.cache_creation_tokens,
            cache_read_tokens=usage.cache_read_tokens,
            credits=credits_for(model, usage) if upstream_status == 200 else 0,
            stream=stream,
            upstream_status=upstream_status,
        )
        session.add(row)
        await session.flush()
        return row

    async def record_speech_usage(
        self,
        session: AsyncSession,
        *,
        user_id: UUID,
        session_id: UUID | None,
        characters: int,
        upstream_status: int,
    ) -> DesktopUsage:
        """One spoken passage, against the same monthly allowance.

        Speech burns no tokens, so all four token counts stay zero and
        the cost is carried by the credits column alone. Writing a
        character count into a column named `input_tokens` would make the
        two figures un-addable and the monthly total a lie, which is the
        one thing the allowance may not be.

        A failed call costs nothing, the same rule the model proxy keeps.
        """
        row = DesktopUsage(
            user_id=user_id,
            session_id=session_id,
            model=SPEECH_MODEL_LABEL,
            provider=SPEECH_PROVIDER_LABEL,
            credits=(
                credits_for_characters(characters) if upstream_status == 200 else 0
            ),
            stream=False,
            upstream_status=upstream_status,
        )
        session.add(row)
        await session.flush()
        return row


def speech_configured() -> bool:
    """Whether a voice can be served at all. Read before the app is told
    it has one, so a missing key is an absent feature rather than a
    failure at the moment somebody asks to be read to."""
    return bool(settings.ELEVENLABS_API_KEY)


desktop = DesktopService()

__all__ = [
    "ACCESS_TOKEN_PREFIX",
    "AUTH_CODE_INVALID",
    "MEMORY_FILE_LIMIT",
    "MEMORY_FILE_MAX_BYTES",
    "MEMORY_REFUSED",
    "MEMORY_REQUEST_MAX_BYTES",
    "MODELS",
    "PROVIDER_TOKEN_WEIGHTS",
    "QUOTA_EXHAUSTED_CODE",
    "REFRESH_INVALID",
    "UNAUTHENTICATED",
    "DesktopError",
    "DesktopMemoryRefused",
    "DesktopModel",
    "DesktopProvider",
    "DesktopService",
    "DesktopUnauthenticated",
    "IncomingMemoryFile",
    "MemoryFileState",
    "MemorySync",
    "OpenAIUsageTally",
    "SSEUsageTally",
    "TokenWeights",
    "Usage",
    "UsageTally",
    "credits_for",
    "desktop",
    "model_by_id",
    "month_bounds",
    "offered_models",
    "provider_api_key",
    "provider_base_url",
    "provider_configured",
    "tally_for",
    "usage_from_answer",
]
