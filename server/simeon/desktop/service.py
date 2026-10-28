"""The desktop app's account service.

Everything the desktop app, Maties (`desktop/`), asks of its server in
account mode, on Simeon's side: auth codes, sessions with rotating
refresh tokens, the model catalogue the app may call, the monthly
credit allowance, and the metering of every call made through the
proxy. The wire shapes are the app's own, read from its source;
nothing here is invented beyond what that code reads.
"""

from __future__ import annotations

import base64
import hashlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from simeon.config import settings
from simeon.desktop.tokens import (
    ACCESS_TOKEN_PREFIX,
    AUTH_CODE_PREFIX,
    BOX_CREDENTIAL_PREFIX,
    BOX_CREDENTIAL_PREFIXES,
    REFRESH_TOKEN_PREFIX,
    strip_access_token_prefix,
)
from simeon.exceptions import PolarError
from simeon.kit import jwt
from simeon.kit.crypto import generate_token_hash_pair, get_token_hash
from simeon.kit.utils import utc_now
from simeon.models import (
    DesktopAuthCode,
    DesktopMemoryFile,
    DesktopSession,
    DesktopUsage,
    User,
)
from simeon.plans import credits as extra_credits
from simeon.postgres import AsyncSession
from simeon.user.repository import UserRepository

from .allowance import (
    Allowance,
    billing_required,
    month_bounds,
    resolve_allowance,
    upgrade_url,
    week_bounds,
)
from .bedrock import bedrock_configured
from .memory_merge import is_accepted_memory_name, merge_memory_file
from .pricing import (
    MODELS,
    PROVIDER_TOKEN_WEIGHTS,
    DesktopModel,
    DesktopProvider,
    ModelPolicy,
    ModelRole,
    OpenAIUsageTally,
    SpokenApi,
    SSEUsageTally,
    TokenWeights,
    Usage,
    UsageTally,
    credits_for,
    model_by_id,
    models_under,
    second_role_rows,
    served_model,
    tally_for,
    usage_from_answer,
)
from .repository import (
    DesktopAuthCodeRepository,
    DesktopMemoryFileRepository,
    DesktopSessionRepository,
    DesktopUsageRepository,
)
from .words import say

#: The app treats these numeric codes, inside a message or a payload,
#: as « credits exhausted » (desktop/src/common/coworkErrorClassify.ts).
QUOTA_EXHAUSTED_CODE = 40200
#: The hourly brake, distinct so the app's log says which limit it was.
HOURLY_BUDGET_CODE = 40201
#: A bad auth code, a bad refresh token, a missing bearer.
AUTH_CODE_INVALID = 40101
REFRESH_INVALID = 40102
UNAUTHENTICATED = 40100
#: A memory sync Simeon will not carry out: a name it does not keep, or
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
#: own sign-in path (`simeon.desktop.app_sign_in`). See
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
# `simeon.desktop.pricing`, which imports nothing but the standard
# library so the price table can be read and tested on its own. What
# needs settings — which key, which address, and therefore which models
# are offered at all — stays here.


def provider_api_key(provider: DesktopProvider) -> str:
    """Simeon's key for one provider, or "" where none is configured."""
    if provider is DesktopProvider.openai:
        return settings.OPENAI_API_KEY
    if provider is DesktopProvider.gemini:
        return settings.GEMINI_API_KEY
    if provider is DesktopProvider.elevenlabs:
        return settings.ELEVENLABS_API_KEY
    return settings.ANTHROPIC_API_KEY


def provider_base_url(provider: DesktopProvider) -> str:
    if provider is DesktopProvider.openai:
        return settings.DESKTOP_OPENAI_BASE_URL
    if provider is DesktopProvider.gemini:
        return settings.DESKTOP_GEMINI_BASE_URL
    if provider is DesktopProvider.elevenlabs:
        return settings.ELEVENLABS_BASE_URL.rstrip("/")
    return settings.DESKTOP_ANTHROPIC_BASE_URL


def provider_configured(provider: DesktopProvider) -> bool:
    """A key to call the provider with. Claude counts as configured on
    Bedrock alone (`simeon.desktop.bedrock`), with no Anthropic key."""
    if provider is DesktopProvider.anthropic and bedrock_configured():
        return True
    return bool(provider_api_key(provider))


def model_policy(user: User | None = None) -> ModelPolicy:
    """Which family answers this person: their own line in
    `DESKTOP_MODELS_BY_EMAIL` when there is one, `DESKTOP_MODELS`
    otherwise. Without a person (a public route), the setting alone."""
    if user is not None and settings.DESKTOP_MODELS_BY_EMAIL:
        email = (user.email or "").strip().lower()
        for listed, policy in settings.DESKTOP_MODELS_BY_EMAIL.items():
            if listed.strip().lower() == email:
                return policy
    return settings.DESKTOP_MODELS


def offered_models(user: User | None = None) -> tuple[DesktopModel, ...]:
    """The models the app is told about: the ones carrying a role under
    this person's policy (`model_policy`), whose provider Simeon holds a
    key for.

    Two filters, for two different reasons. A provider with no key is not
    offered at all, because a missing key must read as « not available
    here » when the menu is drawn and never as an error at the moment
    somebody sends a message. A model with no role is priced but not part
    of the current policy — Opus 5, Haiku 4.5 and Astra — and stays in
    `MODELS` only so a usage row naming one is metered correctly.

    Note what this means for the fallback: if the other family's key is
    not configured, the app finds no fallback to write. That is the honest
    outcome — a fallback that cannot answer is worse than none — and it is
    visible here rather than at the moment the primary goes down. Likewise
    a Claude policy with no Anthropic key offers GPT-6 Sol alone (its
    fallback), and the engine answers on it."""
    return tuple(
        one
        for one in models_under(model_policy(user))
        if one.role is not None
        and one.role is not ModelRole.retired
        and provider_configured(one.provider)
    )


def available_rows(user: User | None = None) -> list[dict[str, Any]]:
    """`/api/models/available`: the offered models (`offered_models`),
    then each one again with the second role its policy gives it
    (`POLICY_SECOND_ROLES`). The engine and the cloud runner take the first
    row of each role, so under `claude-haiku` Haiku is both the model that
    answers and the one that does the machinery; the window's menu shows
    only `primary` rows and never sees the second."""
    offered = offered_models(user)
    return [
        one.available()
        for one in (*offered, *second_role_rows(offered, model_policy(user)))
    ]


# --- credits --------------------------------------------------------------------
#
# The window and the limit are the person's allowance, resolved from their
# plan in `allowance.py`; `month_bounds` and `week_bounds` live there and are
# re-exported here for the callers that import them from the service.


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
    """One file as Simeon holds it once the sync is done. `changed`
    means the client must write this back: either it differs from what
    the client sent, or the client did not send it at all."""

    name: str
    content: str
    version: int
    changed: bool


@dataclass(frozen=True)
class MemorySync:
    """The whole truth about a person's memory after a sync: every file
    Simeon holds, and the names that are gone — pruned, or removed on
    another machine and not yet heard of here."""

    files: list[MemoryFileState]
    deleted: list[str]


# --- the envelope an access token travels in ----------------------------------

# The app that signs in through `simeon.desktop.app_sign_in` reads three
# things straight off its own access token — `sub`, `email` and `exp`
# (`desktop/source/shared/node/cursor-token.ts`, `parseJwtPayload`). An
# opaque token has none of them, and the consequence is not cosmetic:
# `isTokenExpiringSoon` returns true for any token it cannot read an
# `exp` from, so every single call would refresh first, and a refresh
# sent to the wrong host signs the person out. Hence an envelope.
#
# It is an envelope and not a credential. The credential inside it is
# the same opaque `simeon_da_` token as ever, hashed into
# `desktop_sessions.access_token_hash`, and `authenticate` still answers
# by that hash and nothing else. There is one way to check a desktop
# token, which is the whole point of `simeon.desktop.auth`'s first
# paragraph; this only changes what the app can read on the way in.
#
# The prefix is kept on the outside deliberately. `is_desktop_access_token`
# is a prefix test with no imports, and `simeon.auth.middlewares` refuses
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
    envelope = strip_access_token_prefix(token)
    if envelope is None:
        return None
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


PREFERRED_NAME_MAX = 60


def preferred_name(user: User) -> str | None:
    """What the person asked their agents to call them, or None."""
    value = str((user.meta or {}).get("preferred_name") or "").strip()
    return value or None


def set_preferred_name(user: User, raw: str) -> str:
    """Keep `raw`, whitespace collapsed, as the name the agents call the
    person by. Raises ValueError when it is empty or too long."""
    value = " ".join(raw.split())
    if not value or len(value) > PREFERRED_NAME_MAX:
        raise ValueError(say("profile.name_length"))
    meta = dict(user.meta or {})
    meta["preferred_name"] = value
    user.meta = meta
    return value


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

    async def issue_web_session(
        self,
        session: AsyncSession,
        user: User,
        *,
        user_agent: str = "",
    ) -> tuple[DesktopSession, str, str]:
        """The session behind the window served at app.simeonlabs.com
        (4 October 2026). The person is already signed in there with the
        web cookie; the window speaks the desktop protocol (a bearer on
        `/desktop/*` and the box broker), so the cookie is traded for the
        same pair the Mac holds, on a row marked `web`. It refreshes at
        `/oauth/token` like the Mac's and dies on sign-out like the Mac's.
        """
        return await self._issue_session(
            session, user, user_agent=user_agent, client_kind="web"
        )

    async def issue_app_session(
        self,
        session: AsyncSession,
        user: User,
        *,
        user_agent: str = "",
        client_version: str | None = None,
    ) -> tuple[DesktopSession, str, str]:
        """The pair for an app that proved who the person is without the
        browser's confirmation: the iPhone's own Sign in with Apple sheet
        (`POST /auth/apple`, 12 October 2026). The same pair `/auth/poll`
        hands out."""
        return await self._issue_session(
            session, user, user_agent=user_agent, client_version=client_version
        )

    async def _issue_session(
        self,
        session: AsyncSession,
        user: User,
        *,
        user_agent: str = "",
        client_version: str | None = None,
        client_kind: str = "desktop",
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
            client_kind=client_kind,
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

        A session minted for a cloud job (`simeon.maty`) is refused here
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
            client_kind=found.client_kind,
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
        # walked away from must not keep calling the model as them. Not
        # while they are still signed in on another app (20 October 2026):
        # the box is the person's one computer, and signing out of the
        # iPhone cut it off from the Mac too, then rebuilt it at the next
        # sign-in. The credential moves to that app, as a refresh moves it.
        # The local-exec daemon's runs on the Mac that signed out: it goes.
        heir = await repository.get_heir_of(desktop_session, now)
        for child in await repository.list_box_credentials_of(desktop_session.id):
            if child.is_revoked:
                continue
            if heir is not None and not child.user_agent.startswith(
                "simeon-local-exec/"
            ):
                child.box_of_session_id = heir.id
            else:
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
            # The local-exec daemon's credential is a child row too
            # (`simeon.sand.box_service`, user agent "simeon-local-exec/…")
            # and is not replaced by a box's.
            if previous.is_revoked or previous.user_agent.startswith(
                "simeon-local-exec/"
            ):
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

    async def revive_box_credential(
        self, session: AsyncSession, credential_id: UUID, parent: DesktopSession
    ) -> bool:
        """The credential already in the person's box, made good again for
        the app signing in now (`BoxBrokerService.ensure`, 20 October
        2026). A sign-out revoked it, and until now the next sign-in
        rebuilt the whole computer to hand it a new one: almost a minute
        behind "Setting up Simeon's computer". The box still holds this
        one and keeps asking with it (`credential-renewer.ts`), so making
        it good again is all a sign-in needs. Only the person's own box
        credential, never a job token's or the local-exec daemon's; it
        belongs to `parent` from now on, as a new one would, and lasts as
        a new one does. Whether it is good now."""
        if parent.is_job_token or parent.is_box_credential or parent.is_revoked:
            return False
        repository = DesktopSessionRepository.from_session(session)
        found = await repository.get_by_id(credential_id)
        if (
            found is None
            or not found.is_box_credential
            or found.user_id != parent.user_id
            or found.user_agent.startswith("simeon-local-exec/")
            or not found.user.can_authenticate
        ):
            return False
        now = utc_now()
        # One live credential per desktop, as `issue_box_credential` keeps it.
        for previous in await repository.list_box_credentials_of(parent.id):
            if (
                previous.id == found.id
                or previous.is_revoked
                or previous.user_agent.startswith("simeon-local-exec/")
            ):
                continue
            previous.revoked_at = now
            session.add(previous)
        found.revoked_at = None
        found.box_of_session_id = parent.id
        found.refresh_expires_at = max(
            found.refresh_expires_at, now + settings.DESKTOP_REFRESH_TOKEN_TTL
        )
        session.add(found)
        await session.flush()
        return True

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
            or not token.startswith(BOX_CREDENTIAL_PREFIXES)
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
    # (`simeon.desktop.app_sign_in`). The shape is the app's, read from
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
        meta = user.meta or {}
        name = str(meta.get("name") or "").strip()
        preferred = preferred_name(user)
        suggested = str(meta.get("given_name") or "").strip()
        return {
            "id": str(user.id),
            "nickname": nickname,
            # The name Google gave at sign-in, when there is one.
            **({"name": name} if name else {}),
            # What the person asked their agents to call them (the app asks
            # once, after onboarding); the agents, calls and recaps use it.
            **({"preferredName": preferred} if preferred else {}),
            # What the app offers in that question: Google's first name. Never
            # the e-mail's local part, which is not a name.
            **({"suggestedName": suggested} if suggested else {}),
            "email": user.email,
            "avatarUrl": user.avatar_url,
            "phone": None,
            "accountMode": "personal",
            # The language the apps last told (`POST user/profile`); absent is English.
            **({"language": user.language} if user.language else {}),
        }

    # credits

    async def allowance(
        self, session: AsyncSession, user: User, *, now: datetime | None = None
    ) -> Allowance:
        """What this person may spend now, and over which window
        (`simeon.desktop.allowance`)."""
        return await resolve_allowance(session, user, now=now)

    async def credits_used(
        self,
        session: AsyncSession,
        user_id: UUID,
        *,
        now: datetime | None = None,
        period: tuple[datetime, datetime] | None = None,
    ) -> int:
        """Credits the plan's own window spent in `period`, leaving out
        what extra credits paid for. Without one: the free month when no
        billing is configured, else the Monday week. A caller holding an
        `Allowance` passes its own window: the person's week, or the trial."""
        if period is None:
            period = week_bounds(now) if billing_required() else month_bounds(now)
        start, end = period
        return await DesktopUsageRepository.from_session(session).credits_between(
            user_id, start, end, without_extra=True
        )

    async def credits_used_last_hour(
        self, session: AsyncSession, user_id: UUID, *, now: datetime | None = None
    ) -> int:
        end = now or utc_now()
        return await DesktopUsageRepository.from_session(session).credits_between(
            user_id, end - timedelta(hours=1), end
        )

    async def hourly_exhausted(
        self,
        session: AsyncSession,
        user: User,
        *,
        now: datetime | None = None,
        allowance: Allowance | None = None,
    ) -> bool:
        """True when the last sliding hour already holds the plan's hourly
        budget (`Allowance.hourly_credits`). A runaway loop is stopped
        within the hour it starts, whatever the week still allows."""
        if allowance is None:
            allowance = await self.allowance(session, user, now=now)
        used = await self.credits_used_last_hour(session, user.id, now=now)
        return used >= allowance.hourly_credits

    async def quota(
        self, session: AsyncSession, user: User, *, now: datetime | None = None
    ) -> dict[str, Any]:
        """The `quota` object the app normalises (`authQuota.ts`): a
        limit, what is used, what remains, a plan name and a status.

        The first eight keys are what every shipped app reads
        (`SimeonQuotaRow` in `desktop/source/electron-main/account/account-profile.ts`);
        they keep their names and meaning. The keys after `periodEnd` are
        what the app's usage summary can show once it reads them: the
        trial's end and whether it can still be cancelled, the on-demand
        spend (none yet), where the person goes to change plan, and who
        bills it.
        An app that does not know a key ignores it."""
        allowance = await self.allowance(session, user, now=now)
        limit = allowance.credits_limit
        used = await self.credits_used(
            session,
            user.id,
            now=now,
            period=(allowance.period_start, allowance.period_end),
        )
        extra = await extra_credits.balance(session, user.id, now=now)
        return {
            "planName": allowance.plan_name,
            "subscriptionStatus": allowance.status,
            "creditsLimit": limit,
            "creditsUsed": used,
            "creditsRemaining": max(0, limit - used),
            "hasPaidCredits": allowance.paid,
            "mediaGenerationEntitled": False,
            "shareEntitled": False,
            "deploymentEntitled": False,
            "periodStart": allowance.period_start.isoformat(),
            "periodEnd": allowance.period_end.isoformat(),
            "tier": allowance.tier,
            "trialEndsAt": (
                allowance.trial_end.isoformat()
                if allowance.trial_end is not None
                else None
            ),
            "trialCancelable": allowance.trial_cancelable,
            "onDemand": None,
            "upgradeUrl": upgrade_url(allowance),
            # Who bills the plan (12 October 2026): `apple` for one bought in
            # the iPhone app (changed and cancelled with Apple), `stripe` for
            # the web's, None without a plan.
            "billedBy": {"app_store": "apple", "stripe": "stripe"}.get(
                allowance.provider or ""
            ),
            # No plan because the first charge after the trial failed (14
            # October 2026): the app asks for the card to be updated, with
            # whoever bills it (`billedBy`), instead of offering a plan.
            "paymentFailed": allowance.payment_failed,
            # Extra credits bought on the web (27 October 2026), used once
            # the week's are spent, on a paid plan only (`hasPaidCredits`).
            "extraCredits": extra,
        }

    async def profile_summary(
        self, session: AsyncSession, user: User
    ) -> dict[str, Any]:
        allowance = await self.allowance(session, user)
        quota = await self.quota(session, user)
        payload = self.user_payload(user)
        return {
            "id": payload["id"],
            "nickname": payload["nickname"],
            "avatarUrl": payload["avatarUrl"],
            "totalCreditsRemaining": quota["creditsRemaining"],
            "creditItems": [
                {
                    "type": "free" if allowance.free else "plan",
                    "label": allowance.label,
                    "labelEn": allowance.label,
                    "creditsRemaining": quota["creditsRemaining"],
                    "expiresAt": quota["periodEnd"],
                }
            ],
        }

    async def exhausted(
        self,
        session: AsyncSession,
        user: User,
        *,
        allowance: Allowance | None = None,
    ) -> bool:
        """True when the window's credits are spent, and, on a paid plan,
        the extra credits too. With no plan the limit is 0, so this is true
        before the first call."""
        if allowance is None:
            allowance = await self.allowance(session, user)
        used = await self.credits_used(
            session, user.id, period=(allowance.period_start, allowance.period_end)
        )
        if used < allowance.credits_limit:
            return False
        return not (
            allowance.paid and await extra_credits.balance(session, user.id) > 0
        )

    # the shared memory

    # the shared memory

    async def list_memory_files(
        self, session: AsyncSession, user: User
    ) -> Sequence[DesktopMemoryFile]:
        """Everything Simeon holds for one person, in name order."""
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

        - a name Simeon does not keep refuses the whole sync, and
          nothing is written (`simeon.desktop.memory_merge`);
        - a name Simeon has no row for is stored as sent, at version 1;
        - a name whose stored version is the one the client started from
          is stored as sent, at version + 1;
        - anything else means both sides wrote since: the two copies are
          merged by that file's rule and the merge is stored at version
          + 1. For the profile, which is one document with one owner,
          « merged » means Simeon's copy wins, because it is the one
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

        The answer carries **every** live file Simeon holds afterwards,
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
                    f"{name!r} is not a memory file Simeon keeps."
                )
        for file in files:
            if not is_accepted_memory_name(file.name):
                raise DesktopMemoryRefused(
                    f"{file.name!r} is not a memory file Simeon keeps."
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
        reason: str | None = None,
    ) -> DesktopUsage:
        credits = credits_for(model, usage) if upstream_status == 200 else 0
        extra = await self._draw_extra_credits(session, user_id, credits)
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
            credits=credits,
            extra_credits=extra,
            stream=stream,
            upstream_status=upstream_status,
            reason=reason,
        )
        session.add(row)
        await session.flush()
        return row

    async def _draw_extra_credits(
        self, session: AsyncSession, user_id: UUID, credits: int
    ) -> int:
        """The part of a call's `credits` past the week's allowance, taken
        from the person's extra credits (`simeon.plans.credits`); 0 without
        packs, off a paid plan, or while the week still covers it."""
        if credits <= 0:
            return 0
        now = utc_now()
        if await extra_credits.balance(session, user_id, now=now) <= 0:
            return 0
        user = await UserRepository.from_session(session).get_by_id(user_id)
        if user is None:
            return 0
        allowance = await self.allowance(session, user, now=now)
        if not allowance.paid:
            return 0
        used = await self.credits_used(
            session, user_id, period=(allowance.period_start, allowance.period_end)
        )
        past = min(credits, used + credits - allowance.credits_limit)
        if past <= 0:
            return 0
        return await extra_credits.draw(session, user_id, past, now=now)


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
    "available_rows",
    "challenge_for",
    "credits_for",
    "desktop",
    "envelope_access_token",
    "is_deep_control_param",
    "model_by_id",
    "model_policy",
    "month_bounds",
    "offered_models",
    "provider_api_key",
    "provider_base_url",
    "provider_configured",
    "served_model",
    "tally_for",
    "unwrap_access_token",
    "usage_from_answer",
]
