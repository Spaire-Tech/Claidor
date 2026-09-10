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

import json
from dataclasses import dataclass, field
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
from polar.models import DesktopAuthCode, DesktopSession, DesktopUsage, User
from polar.postgres import AsyncSession

from .repository import (
    DesktopAuthCodeRepository,
    DesktopSessionRepository,
    DesktopUsageRepository,
)

#: The app treats these numeric codes, inside a message or a payload,
#: as « credits exhausted » (desktop/src/common/coworkErrorClassify.ts).
QUOTA_EXHAUSTED_CODE = 40200
#: A bad auth code, a bad refresh token, a missing bearer.
AUTH_CODE_INVALID = 40101
REFRESH_INVALID = 40102
UNAUTHENTICATED = 40100


class DesktopError(PolarError): ...


class DesktopUnauthenticated(DesktopError):
    def __init__(self, message: str = "Sign in to the desktop app first.") -> None:
        super().__init__(message, status_code=401)


# --- the models the app may call ---------------------------------------------


@dataclass(frozen=True)
class DesktopModel:
    model_id: str
    model_name: str
    description: str
    #: Cost weight relative to the middle model, used for credits and
    #: shown by the app. A weight, not a price list.
    cost_multiplier: float
    context_window: int = 200_000
    max_tokens: int = 16_384

    def available(self) -> dict[str, Any]:
        """The row of `/api/models/available`, as `AvailableServerModel`
        in the app reads it."""
        return {
            "modelId": self.model_id,
            "modelName": self.model_name,
            "provider": "anthropic",
            "apiFormat": "anthropic",
            "description": self.description,
            "costMultiplier": self.cost_multiplier,
            "accessible": True,
            "supportsImage": True,
            "supportsVideo": False,
            "supportsThinking": False,
            "supportsToolCalling": True,
            "agenticReady": True,
            "contextWindow": self.context_window,
            "maxTokens": self.max_tokens,
            "explicitContextCache": False,
        }

    def pricing(self) -> dict[str, Any]:
        return {
            "modelId": self.model_id,
            "modelName": self.model_name,
            "provider": "anthropic",
            "costMultiplier": self.cost_multiplier,
            "description": self.description,
        }


MODELS: tuple[DesktopModel, ...] = (
    DesktopModel(
        "claude-sonnet-5",
        "Claude Sonnet 5",
        "The everyday model: fast, capable, the default.",
        1.0,
    ),
    DesktopModel(
        "claude-opus-5",
        "Claude Opus 5",
        "The most capable model, for the hardest work.",
        5.0,
    ),
    DesktopModel(
        "claude-haiku-4-5-20251001",
        "Claude Haiku 4.5",
        "The quickest and cheapest model, for simple steps.",
        0.2,
    ),
)


def model_by_id(model_id: str) -> DesktopModel | None:
    wanted = model_id.strip()
    return next((one for one in MODELS if one.model_id == wanted), None)


# --- credits --------------------------------------------------------------------


@dataclass
class Usage:
    """What Anthropic reported for one call."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_tokens: int = 0
    cache_read_tokens: int = 0

    @classmethod
    def from_payload(cls, usage: Any) -> Usage:
        if not isinstance(usage, dict):
            return cls()

        def number(key: str) -> int:
            value = usage.get(key)
            return int(value) if isinstance(value, int | float) else 0

        return cls(
            input_tokens=number("input_tokens"),
            output_tokens=number("output_tokens"),
            cache_creation_tokens=number("cache_creation_input_tokens"),
            cache_read_tokens=number("cache_read_input_tokens"),
        )


def credits_for(model: DesktopModel, usage: Usage) -> int:
    """One credit is one input token on the middle model. Output tokens
    weigh five, cached reads a tenth, cache writes a quarter more — the
    proportions of Anthropic's price list, scaled by the model's weight."""
    weighted = (
        usage.input_tokens
        + usage.output_tokens * 5
        + usage.cache_creation_tokens * 1.25
        + usage.cache_read_tokens * 0.1
    )
    return int(round(weighted * model.cost_multiplier))


@dataclass
class UsageTally:
    """Reads Anthropic's server-sent events as they stream past and keeps
    the usage they report: `message_start` carries the input side,
    `message_delta` the cumulative output side."""

    usage: Usage = field(default_factory=Usage)
    _buffer: bytes = b""

    def feed(self, chunk: bytes) -> None:
        self._buffer += chunk
        while b"\n" in self._buffer:
            line, _, self._buffer = self._buffer.partition(b"\n")
            self._line(line.strip())

    def finish(self) -> Usage:
        if self._buffer.strip():
            self._line(self._buffer.strip())
            self._buffer = b""
        return self.usage

    def _line(self, line: bytes) -> None:
        if not line.startswith(b"data:"):
            return
        try:
            event = json.loads(line[5:].strip() or b"null")
        except ValueError:
            return
        if not isinstance(event, dict):
            return
        kind = event.get("type")
        if kind == "message_start":
            message = event.get("message")
            if isinstance(message, dict):
                started = Usage.from_payload(message.get("usage"))
                self.usage.input_tokens = started.input_tokens
                self.usage.cache_creation_tokens = started.cache_creation_tokens
                self.usage.cache_read_tokens = started.cache_read_tokens
                self.usage.output_tokens = max(
                    self.usage.output_tokens, started.output_tokens
                )
        elif kind == "message_delta":
            delta = Usage.from_payload(event.get("usage"))
            self.usage.output_tokens = max(
                self.usage.output_tokens, delta.output_tokens
            )
            if delta.input_tokens:
                self.usage.input_tokens = delta.input_tokens
            if delta.cache_creation_tokens:
                self.usage.cache_creation_tokens = delta.cache_creation_tokens
            if delta.cache_read_tokens:
                self.usage.cache_read_tokens = delta.cache_read_tokens


def month_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The calendar month, in UTC, the allowance is counted over."""
    moment = now or utc_now()
    start = moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


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
        `DesktopUnauthenticated`, which the app reads as « sign in again »."""
        token = refresh_token.strip()
        if not token or not token.isascii():
            raise DesktopUnauthenticated("The refresh token is invalid.")
        found = await DesktopSessionRepository.from_session(
            session
        ).get_by_refresh_token_hash(get_token_hash(token, secret=settings.SECRET))
        if (
            found is None
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


desktop = DesktopService()

__all__ = [
    "ACCESS_TOKEN_PREFIX",
    "AUTH_CODE_INVALID",
    "MODELS",
    "QUOTA_EXHAUSTED_CODE",
    "REFRESH_INVALID",
    "UNAUTHENTICATED",
    "DesktopError",
    "DesktopModel",
    "DesktopService",
    "DesktopUnauthenticated",
    "Usage",
    "UsageTally",
    "credits_for",
    "desktop",
    "model_by_id",
    "month_bounds",
]
