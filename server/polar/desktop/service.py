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

import base64
import hashlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from polar.config import settings
from polar.desktop.tokens import (
    ACCESS_TOKEN_PREFIX,
    AUTH_CODE_PREFIX,
    BOX_CREDENTIAL_PREFIX,
    REFRESH_TOKEN_PREFIX,
)
from polar.exceptions import PolarError
from polar.kit import jwt
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
    ModelRole,
    OpenAIUsageTally,
    SpokenApi,
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

#: The app treats these numeric codes, inside a message or a payload,
#: as « credits exhausted » (desktop/src/common/coworkErrorClassify.ts).
QUOTA_EXHAUSTED_CODE = 40200
#: The hourly brake, distinct so the app's log says which limit it was.
HOURLY_BUDGET_CODE = 40201
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
#: How long a deleted name is remembered, so a machine that was away
#: hears about the deletion. Past this the tombstone is dropped and a
#: copy that turns up later is a new file.
MEMORY_TOMBSTONE_DAYS = 90

#: The JWT type of the envelope an access token travels in on the app's
#: own sign-in path (`polar.desktop.app_sign_in`). See
#: `envelope_access_token` for what the envelope is and is not.
ACCESS_TOKEN_JWT_TYPE = "desktop_access"

#: Everything hashed into `desktop_auth_codes.code_hash` by the app's
#: own sign-in is namespaced, so a row of that flow can never be found
#: by the `/desktop` flow's lookup or the other way round.
DEEP_CONTROL_NAMESPACE = "deepcontrol"

#: The app's `uuid` is a v4 UUID and its `verifier` is 32 random bytes
#: base64url-encoded, so both are far inside this. It exists so a long
#: query string is refused before it reaches a hash.
DEEP_CONTROL_PARAM_MAX_LENGTH = 256


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
    """The models the app is told about: the ones carrying a role, whose
    provider Claidor holds a key for.

    Two filters, for two different reasons. A provider with no key is not
    offered at all, because a missing key must read as « not available
    here » when the menu is drawn and never as an error at the moment
    somebody sends a message. A model with no role is priced but not part
    of the current policy — Opus, Haiku and Astra — and stays in `MODELS`
    only so a saved config still naming one is metered correctly.

    Note what this means for the fallback: if no Anthropic key is
    configured, Claude is not offered, and the app will find no fallback
    to write. That is the honest outcome — a fallback that cannot answer
    is worse than none — and it is visible here rather than at the moment
    OpenAI goes down."""
    return tuple(
        one
        for one in MODELS
        if one.role is not None and provider_configured(one.provider)
    )


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
    Claidor holds, and the names that are gone — pruned, or removed on
    another machine and not yet heard of here."""

    files: list[MemoryFileState]
    deleted: list[str]


# --- the envelope an access token travels in ----------------------------------

# The app that signs in through `polar.desktop.app_sign_in` reads three
# things straight off its own access token — `sub`, `email` and `exp`
# (`desktop/source/shared/node/cursor-token.ts`, `parseJwtPayload`). An
# opaque token has none of them, and the consequence is not cosmetic:
# `isTokenExpiringSoon` returns true for any token it cannot read an
# `exp` from, so every single call would refresh first, and a refresh
# sent to the wrong host signs the person out. Hence an envelope.
#
# It is an envelope and not a credential. The credential inside it is
# the same opaque `claidor_da_` token as ever, hashed into
# `desktop_sessions.access_token_hash`, and `authenticate` still answers
# by that hash and nothing else. There is one way to check a desktop
# token, which is the whole point of `polar.desktop.auth`'s first
# paragraph; this only changes what the app can read on the way in.
#
# The prefix is kept on the outside deliberately. `is_desktop_access_token`
# is a prefix test with no imports, and `polar.auth.middlewares` refuses
# every bearer it does not recognise, so an enveloped token that did not
# carry the prefix would be turned away before any desktop route saw it.
# Keeping it there also leaves `parseJwtPayload` working, because that
# function reads the second dot-separated segment and never the first.


def envelope_access_token(desktop_session: DesktopSession, access_token: str) -> str:
    """The bearer the app stores: the opaque token, wrapped."""
    user = desktop_session.user
    return ACCESS_TOKEN_PREFIX + jwt.encode(
        data={
            "sub": str(user.id),
            "email": user.email,
            "jti": str(desktop_session.id),
            "cat": access_token,
        },
        secret=settings.SECRET,
        expires_at=desktop_session.access_expires_at,
        type=ACCESS_TOKEN_JWT_TYPE,  # type: ignore[arg-type]
    )


def unwrap_access_token(token: str) -> str | None:
    """The opaque token inside an envelope, or None when the bearer is
    not one — which is the ordinary case for `/desktop`, whose tokens
    are opaque and stay opaque."""
    if not token.startswith(ACCESS_TOKEN_PREFIX):
        return None
    envelope = token[len(ACCESS_TOKEN_PREFIX) :]
    if envelope.count(".") != 2:
        return None
    try:
        payload = jwt.decode(
            token=envelope,
            secret=settings.SECRET,
            type=ACCESS_TOKEN_JWT_TYPE,  # type: ignore[arg-type]
        )
    except Exception:
        # A forged signature, an expired envelope, a type that is not
        # ours: all of them mean « this is not a token of ours », and
        # the caller answers 401 exactly as it would for any other
        # unknown bearer.
        return None
    inner = payload.get("cat")
    return inner if isinstance(inner, str) and inner else None


def challenge_for(verifier: str) -> str:
    """The app's own challenge derivation, byte for byte:
    `base64url(sha256(verifier))`, unpadded
    (`desktop/source/packages/cursor-config/auth/login.ts`)."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def is_deep_control_param(value: str) -> bool:
    """A `uuid` or a `verifier` this server will hash. Printable ASCII,
    non-empty, bounded."""
    return (
        0 < len(value) <= DEEP_CONTROL_PARAM_MAX_LENGTH
        and value.isascii()
        and value.isprintable()
    )


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
        """The live session behind a bearer token, or None.

        The bearer is either the opaque token itself — what `/desktop`
        hands out — or that same token inside an envelope, which is what
        the app's own sign-in hands out. Either way the answer comes
        from one place: the hash in `desktop_sessions`.
        """
        token = access_token.strip()
        if not token or not token.isascii():
            return None
        token = unwrap_access_token(token) or token
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
            or found.is_box_credential
            or found.is_revoked
            or found.refresh_expires_at < utc_now()
            or not found.user.can_authenticate
        ):
            raise DesktopUnauthenticated("The refresh token is invalid or has expired.")
        # The old refresh token dies with the exchange. The old access token
        # does not, not at once: the person's box holds a copy of it
        # (`local-docker-host-connector.ts` writes the Mac's token into the
        # box and rewrites it every five minutes), and until 25 September
        # 2026 the exchange revoked the row outright, so every model call
        # from the box answered 401 until that rewrite. It now stays good
        # for `DESKTOP_REFRESH_GRACE` at most; sign-out sweeps it (`revoke`).
        now = utc_now()
        found.refresh_expires_at = now - timedelta(seconds=1)
        found.access_expires_at = min(
            found.access_expires_at, now + settings.DESKTOP_REFRESH_GRACE
        )
        session.add(found)
        issued = await self._issue_session(
            session,
            found.user,
            user_agent=found.user_agent,
            client_version=found.client_version,
        )
        # The box credential follows the desktop it belongs to: the app
        # refreshes every hour, and a box that died with each refresh would
        # be no box at all.
        repository = DesktopSessionRepository.from_session(session)
        for child in await repository.list_box_credentials_of(found.id):
            if child.is_revoked:
                continue
            child.box_of_session_id = issued[0].id
            session.add(child)
        return issued

    async def revoke(
        self, session: AsyncSession, desktop_session: DesktopSession
    ) -> None:
        now = utc_now()
        desktop_session.revoked_at = now
        session.add(desktop_session)
        repository = DesktopSessionRepository.from_session(session)
        # Sign-out takes the box's credential with it: a box the person
        # walked away from must not keep calling the model as them.
        for child in await repository.list_box_credentials_of(desktop_session.id):
            if child.is_revoked:
                continue
            child.revoked_at = now
            session.add(child)
        # And the access token a recent refresh replaced, still inside its
        # grace (`refresh`): a sign-out is the end of every token the person
        # holds, not only the newest.
        for graced in await repository.list_in_grace_of_user(
            desktop_session.user_id, now
        ):
            graced.revoked_at = now
            session.add(graced)

    # --- the box's own credential --------------------------------------------

    async def issue_box_credential(
        self, session: AsyncSession, parent: DesktopSession
    ) -> tuple[DesktopSession, str]:
        """A credential the person's box renews its access token with,
        for as long as the desktop that asked stays signed in.

        Why (25 September 2026): the box keeps running after Simeon quits
        so routines fire while the Mac is awake, and with the app gone
        nothing rewrites the one-hour access token the Mac used to place
        in the box every five minutes. So the Mac hands the box this
        credential once, and the box trades it for a fresh access token
        at `POST /sand-box/inference-credential` whenever it needs one.
        It is a `DesktopSession` row like a job token, narrowed the same
        way: its refresh column holds the credential and `refresh`
        refuses it, so it can never become a lasting session; it is
        revoked with its parent on sign-out; and the parent's own refresh
        re-parents it instead of orphaning it. One live credential per
        desktop: asking again revokes the last one.
        """
        if parent.is_job_token or parent.is_box_credential:
            raise DesktopUnauthenticated(
                "Only a signed-in desktop can ask for a box credential."
            )
        now = utc_now()
        repository = DesktopSessionRepository.from_session(session)
        for previous in await repository.list_box_credentials_of(parent.id):
            if previous.is_revoked:
                continue
            previous.revoked_at = now
            session.add(previous)
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
            refresh_expires_at=now + settings.DESKTOP_REFRESH_TOKEN_TTL,
            user_agent=f"simeon-box/{parent.id}"[:2000],
            client_version=parent.client_version,
            user_id=parent.user_id,
            box_of_session_id=parent.id,
        )
        row.user = parent.user
        session.add(row)
        await session.flush()
        return row, credential

    async def renew_box_access(
        self, session: AsyncSession, credential: str
    ) -> tuple[DesktopSession, str]:
        """A fresh access token for a live box credential. The credential
        itself is not rotated: the box holds it for its whole life and
        nothing else does, and a renewal that could fail half-way is the
        one thing an unattended box cannot recover from."""
        token = credential.strip()
        if (
            not token
            or not token.isascii()
            or not token.startswith(BOX_CREDENTIAL_PREFIX)
        ):
            raise DesktopUnauthenticated("The box credential is invalid.")
        repository = DesktopSessionRepository.from_session(session)
        found = await repository.get_by_refresh_token_hash(
            get_token_hash(token, secret=settings.SECRET)
        )
        now = utc_now()
        if (
            found is None
            or not found.is_box_credential
            or found.is_revoked
            or found.refresh_expires_at < now
            or not found.user.can_authenticate
        ):
            raise DesktopUnauthenticated(
                "The box credential is invalid or has expired."
            )
        parent = await repository.get_parent_of(found)
        if parent is None or parent.is_revoked:
            raise DesktopUnauthenticated(
                "The desktop this box belongs to has signed out."
            )
        access, access_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=ACCESS_TOKEN_PREFIX
        )
        found.access_token_hash = access_hash
        found.access_expires_at = now + settings.DESKTOP_ACCESS_TOKEN_TTL
        session.add(found)
        await session.flush()
        return found, access

    # the app's own sign-in

    # The app asks for three things and this server answers all three
    # (`polar.desktop.app_sign_in`). The shape is the app's, read from
    # `desktop/source/packages/cursor-config/auth/login.ts` and
    # `desktop/source/electron-main/account/cursor-auth.ts`; nothing
    # here is invented beyond what that code reads.
    #
    # There is no new table. A pending sign-in is a `DesktopAuthCode`
    # row whose `code_hash` is the keyed hash of the pair the app
    # already carries — its `uuid` and the `challenge` it derived from
    # its verifier. The app proves it is the same app by sending the
    # verifier, from which this server recomputes the challenge; a row
    # is found only when the pair matches, and `used_at` makes it
    # single-use exactly as a code is.

    async def begin_deep_control(
        self, session: AsyncSession, user: User, *, uuid: str, challenge: str
    ) -> bool:
        """Record that this person confirmed this sign-in. True when a
        row was written, False when one was already there — a person
        who confirms twice has not done anything wrong."""
        repository = DesktopAuthCodeRepository.from_session(session)
        code_hash = get_token_hash(
            f"{DEEP_CONTROL_NAMESPACE}:{uuid}:{challenge}", secret=settings.SECRET
        )
        if await repository.get_by_code_hash(code_hash) is not None:
            return False
        session.add(
            DesktopAuthCode(
                code_hash=code_hash,
                user_id=user.id,
                expires_at=utc_now() + settings.DESKTOP_AUTH_CODE_TTL,
            )
        )
        await session.flush()
        return True

    async def complete_deep_control(
        self,
        session: AsyncSession,
        *,
        uuid: str,
        verifier: str,
        user_agent: str = "",
        client_version: str | None = None,
    ) -> tuple[DesktopSession, str, str] | None:
        """The session behind a confirmed sign-in, or None.

        None is the whole vocabulary of failure here on purpose: the app
        reads « not yet » and « never » from the same 404, and telling
        the two apart would tell a stranger polling with a guessed uuid
        whether somebody is mid-sign-in.
        """
        if not is_deep_control_param(uuid) or not is_deep_control_param(verifier):
            return None
        code_hash = get_token_hash(
            f"{DEEP_CONTROL_NAMESPACE}:{uuid}:{challenge_for(verifier)}",
            secret=settings.SECRET,
        )
        pending = await DesktopAuthCodeRepository.from_session(
            session
        ).get_by_code_hash(code_hash)
        if (
            pending is None
            or pending.used_at is not None
            or pending.expires_at < utc_now()
            or not pending.user.can_authenticate
        ):
            return None
        pending.used_at = utc_now()
        session.add(pending)
        return await self._issue_session(
            session,
            pending.user,
            user_agent=user_agent,
            client_version=client_version,
        )

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

    async def credits_used_last_hour(
        self, session: AsyncSession, user_id: UUID, *, now: datetime | None = None
    ) -> int:
        end = now or utc_now()
        return await DesktopUsageRepository.from_session(session).credits_between(
            user_id, end - timedelta(hours=1), end
        )

    async def hourly_exhausted(
        self, session: AsyncSession, user: User, *, now: datetime | None = None
    ) -> bool:
        """True when the last sliding hour already holds the hourly
        budget. A runaway loop is stopped within the hour it starts,
        whatever the month still allows."""
        used = await self.credits_used_last_hour(session, user.id, now=now)
        return used >= settings.DESKTOP_HOURLY_CREDITS

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
        self,
        session: AsyncSession,
        user: User,
        incoming: Iterable[IncomingMemoryFile],
        deleted: Iterable[str] = (),
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
        - a name another machine deleted (a tombstone) is written again
          only by a client that saw the deletion — its `base_version` is
          the tombstone's — and then it is a new file at version + 1. A
          client that is behind keeps nothing: the name comes back under
          `deleted` and it removes its copy.

        For each name the client says it deleted (`deleted`, 25
        September 2026): the row becomes a tombstone at version + 1,
        its text dropped, unless it is one already or was never there.

        A write that changes nothing leaves the version alone, so an
        idle app syncing every few minutes does not count upwards for
        ever.

        The answer carries **every** live file Claidor holds afterwards,
        so a fresh computer receives the whole memory by sending nothing,
        and under `deleted` every name that is gone: pruned now, or a
        tombstone younger than `MEMORY_TOMBSTONE_DAYS`.

        Sizes: a single file over 1 MB or a request over 8 MB is refused
        whole. A person may hold 2000 files; past that the oldest daily
        notes are pruned, the newest kept, and their names come back
        under `deleted` so the client can drop them too. The durable
        facts and the profile are never pruned.
        """
        sent = list(incoming)
        removed = list(deleted)
        self._check_memory_sizes(sent, removed)

        repository = DesktopMemoryFileRepository.from_session(session)
        for file in sent:
            stored = await repository.get_by_name(user.id, file.name)
            if stored is None:
                await repository.upsert(
                    user.id, file.name, content=file.content, version=1
                )
                continue
            if stored.deleted_at is not None:
                # A tombstone. Only a client that has seen it may write
                # the name again; one that is behind is told to delete.
                if file.base_version >= stored.version:
                    await repository.upsert(
                        user.id,
                        file.name,
                        content=file.content,
                        version=stored.version + 1,
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

        for name in removed:
            stored = await repository.get_by_name(user.id, name)
            if stored is None or stored.deleted_at is not None:
                continue
            await repository.tombstone(stored, version=stored.version + 1)

        pruned = await self._prune_memory_files(session, user)
        tombstones = await self._sweep_memory_tombstones(session, user)
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
            deleted=sorted({*pruned, *tombstones}),
        )

    def _check_memory_sizes(
        self, files: list[IncomingMemoryFile], deleted: Sequence[str] = ()
    ) -> None:
        """Every name and every size, before a single row is written."""
        total = 0
        for name in deleted:
            if not is_accepted_memory_name(name):
                raise DesktopMemoryRefused(
                    f"{name!r} is not a memory file Claidor keeps."
                )
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

    async def _sweep_memory_tombstones(
        self, session: AsyncSession, user: User
    ) -> list[str]:
        """The names still to be told about, and the old tombstones
        dropped for good."""
        repository = DesktopMemoryFileRepository.from_session(session)
        keep_after = utc_now() - timedelta(days=MEMORY_TOMBSTONE_DAYS)
        names: list[str] = []
        swept = False
        for row in await repository.list_by_user(user.id, include_deleted=True):
            if row.deleted_at is None:
                continue
            if row.deleted_at < keep_after:
                await session.delete(row)
                swept = True
            else:
                names.append(row.name)
        if swept:
            await session.flush()
        return names

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


desktop = DesktopService()

__all__ = [
    "ACCESS_TOKEN_JWT_TYPE",
    "ACCESS_TOKEN_PREFIX",
    "AUTH_CODE_INVALID",
    "DEEP_CONTROL_NAMESPACE",
    "DEEP_CONTROL_PARAM_MAX_LENGTH",
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
    "ModelRole",
    "OpenAIUsageTally",
    "SSEUsageTally",
    "SpokenApi",
    "TokenWeights",
    "Usage",
    "UsageTally",
    "challenge_for",
    "credits_for",
    "desktop",
    "envelope_access_token",
    "is_deep_control_param",
    "model_by_id",
    "month_bounds",
    "offered_models",
    "provider_api_key",
    "provider_base_url",
    "provider_configured",
    "tally_for",
    "unwrap_access_token",
    "usage_from_answer",
]
