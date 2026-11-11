"""People's own AI accounts, connected for their agents (8 November 2026).

The founder: "allow people to bring their own subscriptions and charge only
for the computer", then "use codex sign in. everybody does. even reason"
(docs/your-own-models.md). ChatGPT first. The person signs in with OpenAI's
device code, under Codex's client id until OpenAI approves Simeon for Sign
in with ChatGPT; then only `settings.CHATGPT_CLIENT_ID` changes. The steps,
read from Codex's own code (openai/codex, `codex-rs/login`):

- `POST {auth}/api/accounts/deviceauth/usercode` `{client_id}`: a code for
  the person (`user_code`), the sign-in's `device_auth_id`, how often to ask
  (`interval`).
- The person enters the code at `{auth}/codex/device` and approves.
- `POST {auth}/api/accounts/deviceauth/token` `{device_auth_id, user_code}`
  answers 403 or 404 until then, then `{authorization_code, code_verifier}`.
- `POST {auth}/oauth/token`, a form: the authorization code with
  `redirect_uri={auth}/deviceauth/callback` and the verifier, for ID, access
  and refresh tokens. The ID token names the ChatGPT account and its plan.
- Refresh: `POST {auth}/oauth/token`, JSON, `grant_type=refresh_token`.
  OpenAI rotates the refresh token. `refresh_token_expired`, `_reused` and
  `_invalidated` mean the sign-in is over: the person connects again.
- Revoke: `POST {auth}/oauth/revoke`, JSON, `{token, token_type_hint,
  client_id}`.

The apps' routes:

- `POST /desktop/api/models/accounts/chatgpt/start`: a code for the person
  and the page to enter it on (Reason's sheet: "Copy this code", "Enter it
  on … and approve").
- `POST /desktop/api/models/accounts/chatgpt/poll` `{connectId}`: asked
  every few seconds while the sheet says "Waiting for you to approve…";
  `waiting`, `connected` with the account, or `expired`.
- `GET /desktop/api/models/accounts`: the person's accounts and their state.
- `PATCH /desktop/api/models/accounts/{id}` `{label}`: renamed.
- `DELETE /desktop/api/models/accounts/{id}`: revoked at the provider, then
  forgotten here. Account deletion does the same for every one.
- `POST /desktop/api/models/accounts/claude/usage` `{windows}` (9 November
  2026): how much of the Claude plan is used, as Claude Code on the
  computer last said (`keep_usage`); ChatGPT's comes with each answer
  through the relay (`chatgpt_usage`). Each account's JSON carries it.
- `POST /desktop/api/models/accounts/claude` `{label, plan}` (9 November
  2026): Claude, signed in to in Claude Code on the person's computer
  (docs/your-own-models.md, section 6). The app says so once the computer
  reports the sign-in done; the row keeps only the e-mail and plan Claude
  Code named. Anthropic doesn't let Simeon keep a Claude sign-in, so there
  is no token here (`access_token` is empty) and nothing to revoke: the
  computer signs Claude Code out itself.

- `POST /desktop/api/models/accounts/grok/start` and `…/grok/poll` (10
  November 2026, the founder: "lets do grok"): Grok on the person's
  SuperGrok or X Premium plan, signed in to with xAI's device code in the
  same sheet (`grok.py`). A plan xAI doesn't let use Grok here is refused
  at once (`failed`, `not_allowed`).
- `POST /desktop/api/models/accounts/keys/{provider}` `{key, fields}` (10
  November 2026, the founder: "Below subscription something called api
  keys"): the person's own API key for one of `key_providers.PROVIDERS`,
  tried at the provider first (`key_providers.check_key`), then kept
  sealed with the details the provider needs (Azure's endpoint,
  Cloudflare's account) and the models it reaches. A key the provider
  refuses is never kept (`key_refused`). The list route names the
  providers (`keyProviders`) for the apps' API keys section.

The tokens and keys never leave the server. Nothing here logs a token, a
key, a code or a verifier.
"""

from __future__ import annotations

import hashlib
import json
import math
import secrets
from collections.abc import Mapping
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from typing import Any, Literal
from uuid import UUID

import httpx
import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from simeon.config import settings
from simeon.kit.sealed import seal, unseal
from simeon.kit.utils import utc_now
from simeon.models import DesktopModelAccount, DesktopSession
from simeon.postgres import AsyncSession, get_db_session
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter

from . import grok, key_providers
from .auth import get_desktop_or_box_session, get_desktop_session
from .model_account_repository import ModelAccountRepository
from .model_sign_in import (
    ProviderError,
    RefreshUnavailable,
    SignInTokens,
    claims,
    error_code,
    expiry,
    tokens_of,
)

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

PROVIDER_CHATGPT = "chatgpt"
#: Grok, on the person's SuperGrok or X Premium plan (`grok.py`).
PROVIDER_GROK = grok.PROVIDER
#: The providers signed in to with a code, whose tokens are kept here.
SIGNED_IN_BY_CODE = frozenset({PROVIDER_CHATGPT, PROVIDER_GROK})
#: Claude through Claude Code on the person's computer: a row with no token.
PROVIDER_CLAUDE = "claude"
#: The one Claude row a person has: Claude Code on their one computer.
CLAUDE_ACCOUNT_KEY = "claude-code"
KIND_SUBSCRIPTION = "subscription"
#: The person's own API key (`key_providers.py`).
KIND_API_KEY = "api_key"
STATUS_AVAILABLE = "available"
STATUS_SIGNED_OUT = "signed_out"
#: How long a started sign-in waits for the person: Codex's own 15 minutes.
CONNECT_TTL_S = 15 * 60
#: xAI's `slow_down`: this much longer between two questions (RFC 8628).
SLOW_DOWN_S = 5
#: An access token with less than this left is refreshed before a call.
REFRESH_AHEAD = timedelta(minutes=5)
#: OpenAI's codes for a sign-in that is over (Codex's
#: `classify_refresh_token_failure`), and OAuth's own.
GONE_CODES = frozenset(
    {
        "refresh_token_expired",
        "refresh_token_reused",
        "refresh_token_invalidated",
        "invalid_grant",
    }
)
_AUTH_CLAIM = "https://api.openai.com/auth"
_PROFILE_CLAIM = "https://api.openai.com/profile"
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
_SEALED = "model-account"
_CONNECT_PREFIX = "desktop:model-connect:"


class ChatGptError(ProviderError):
    """OpenAI refused a sign-in call: its HTTP status and error code."""

    gone_codes = GONE_CODES
    provider_name = "OpenAI"


@dataclass(frozen=True)
class AccessGrant:
    """What a model call on the account needs: the bearer, and the account
    it speaks for (Codex's `chatgpt-account-id` header)."""

    access_token: str
    account_key: str
    expires_at: datetime | None
    #: An API key's details (Azure's endpoint, Cloudflare's account).
    fields: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class DeviceCode:
    """A sign-in by code waiting for the person: OpenAI's `device_auth_id`,
    or xAI's `device_code`, kept on the server only."""

    device_auth_id: str
    user_code: str
    interval: int
    provider: str = PROVIDER_CHATGPT
    #: Where the person enters the code (xAI names its own page).
    verification_url: str | None = None
    expires_in: int = CONNECT_TTL_S


# --- OpenAI's sign-in ---------------------------------------------------------


def _auth_base() -> str:
    return settings.CHATGPT_AUTH_BASE_URL.rstrip("/")


def verification_url() -> str:
    """Where the person enters the code (Codex's `{issuer}/codex/device`)."""
    return f"{_auth_base()}/codex/device"


def identity(tokens: SignInTokens) -> tuple[str | None, str, str | None]:
    """The ChatGPT account the sign-in is for, its e-mail and its plan, read
    from the ID token (and the access token, which carries the same claims)."""
    id_claims = claims(tokens.id_token)
    access_claims = claims(tokens.access_token)
    auth = id_claims.get(_AUTH_CLAIM) or access_claims.get(_AUTH_CLAIM) or {}
    profile = id_claims.get(_PROFILE_CLAIM) or access_claims.get(_PROFILE_CLAIM) or {}
    if not isinstance(auth, dict):
        auth = {}
    if not isinstance(profile, dict):
        profile = {}
    account = auth.get("chatgpt_account_id")
    email = id_claims.get("email") or profile.get("email") or ""
    plan = auth.get("chatgpt_plan_type")
    return (
        str(account) if account else None,
        str(email),
        str(plan) if plan else None,
    )


async def _post(
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    form: dict[str, str] | None = None,
) -> httpx.Response:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        return await client.post(f"{_auth_base()}{path}", json=json_body, data=form)


async def request_device_code() -> DeviceCode:
    response = await _post(
        "/api/accounts/deviceauth/usercode",
        json_body={"client_id": settings.CHATGPT_CLIENT_ID},
    )
    if not response.is_success:
        raise ChatGptError(response.status_code, error_code(response))
    body = response.json()
    code = body.get("user_code") or body.get("usercode")
    device_auth_id = body.get("device_auth_id")
    if not isinstance(code, str) or not isinstance(device_auth_id, str):
        raise ChatGptError(response.status_code, "no_code")
    try:
        interval = max(1, int(str(body.get("interval", 5)).strip()))
    except ValueError:
        interval = 5
    return DeviceCode(
        device_auth_id, code, interval, verification_url=verification_url()
    )


async def poll_device_code(device: DeviceCode) -> SignInTokens | None:
    """The sign-in's tokens once the person approved, or None while they
    haven't yet."""
    response = await _post(
        "/api/accounts/deviceauth/token",
        json_body={
            "device_auth_id": device.device_auth_id,
            "user_code": device.user_code,
        },
    )
    if response.status_code in (403, 404):
        return None
    if not response.is_success:
        raise ChatGptError(response.status_code, error_code(response))
    body = response.json()
    code = body.get("authorization_code")
    verifier = body.get("code_verifier")
    if not isinstance(code, str) or not isinstance(verifier, str):
        raise ChatGptError(response.status_code, "no_authorization_code")
    return await _exchange(code, verifier)


async def _exchange(code: str, verifier: str) -> SignInTokens:
    response = await _post(
        "/oauth/token",
        form={
            "grant_type": "authorization_code",
            "client_id": settings.CHATGPT_CLIENT_ID,
            "code": code,
            "redirect_uri": f"{_auth_base()}/deviceauth/callback",
            "code_verifier": verifier,
        },
    )
    if not response.is_success:
        raise ChatGptError(response.status_code, error_code(response))
    return tokens_of(response.json(), ChatGptError)


async def _refresh(refresh_token: str) -> SignInTokens:
    response = await _post(
        "/oauth/token",
        json_body={
            "grant_type": "refresh_token",
            "client_id": settings.CHATGPT_CLIENT_ID,
            "refresh_token": refresh_token,
        },
    )
    if not response.is_success:
        raise ChatGptError(response.status_code, error_code(response))
    return tokens_of(response.json(), ChatGptError)


async def revoke(refresh_token: str) -> bool:
    """Ends the sign-in at OpenAI. False when OpenAI could not be reached or
    refused; the caller forgets the tokens either way."""
    try:
        response = await _post(
            "/oauth/revoke",
            json_body={
                "token": refresh_token,
                "token_type_hint": "refresh_token",
                "client_id": settings.CHATGPT_CLIENT_ID,
            },
        )
    except httpx.HTTPError as error:
        log.warning("desktop.models.revoke_failed", reason=type(error).__name__)
        return False
    if not response.is_success:
        log.warning("desktop.models.revoke_failed", status=response.status_code)
        return False
    return True


# --- the person's accounts ----------------------------------------------------


def _keep(account: DesktopModelAccount, tokens: SignInTokens) -> None:
    """Writes the provider's answer into the row, sealed. A refresh that
    names no new refresh token keeps the one before."""
    account.access_token = seal(tokens.access_token, purpose=_SEALED)
    if tokens.refresh_token is not None:
        account.refresh_token = seal(tokens.refresh_token, purpose=_SEALED)
    account.expires_at = expiry(tokens.access_token, tokens.expires_in)
    account.status = STATUS_AVAILABLE


_NAMES = {PROVIDER_CHATGPT: "ChatGPT", PROVIDER_GROK: "Grok"}


def provider_name(provider: str) -> str:
    """The provider as the person knows it: ChatGPT, Grok, DeepSeek…"""
    if provider in _NAMES:
        return _NAMES[provider]
    if provider == PROVIDER_CLAUDE:
        return "Claude"
    one = key_providers.provider(provider)
    return one.name if one is not None else provider


def _identity(
    provider: str, tokens: SignInTokens
) -> tuple[str | None, str, str | None]:
    return grok.identity(tokens) if provider == PROVIDER_GROK else identity(tokens)


async def keep_sign_in(
    session: AsyncSession,
    user_id: UUID,
    tokens: SignInTokens,
    provider: str = PROVIDER_CHATGPT,
) -> DesktopModelAccount:
    """A finished sign-in by code (ChatGPT's or Grok's), kept: the same
    account signed in again replaces its row (its name stays as the person
    left it)."""
    error = grok.GrokError if provider == PROVIDER_GROK else ChatGptError
    account_key, email, plan = _identity(provider, tokens)
    if account_key is None:
        raise error(200, "no_account")
    if tokens.refresh_token is None:
        raise error(200, "no_refresh_token")
    repository = ModelAccountRepository.from_session(session)
    account = await repository.by_key(user_id, provider, account_key)
    if account is None:
        account = DesktopModelAccount(
            user_id=user_id,
            provider=provider,
            kind=KIND_SUBSCRIPTION,
            account_key=account_key,
            label=email or _NAMES[provider],
            plan=plan,
            limited_until=None,
        )
        _keep(account, tokens)
        await repository.create(account, flush=True)
        return account
    _keep(account, tokens)
    account.plan = plan or account.plan
    account.limited_until = None
    if not account.label:
        account.label = email or _NAMES[provider]
    await session.flush()
    return account


async def keep_claude(
    session: AsyncSession, user_id: UUID, label: str | None, plan: str | None
) -> DesktopModelAccount:
    """Claude, signed in to in Claude Code on the person's computer: one row,
    no token. Signing in again keeps the name the person gave it."""
    shown = (label or "").strip()[:200] or "Claude"
    named_plan = (plan or "").strip().lower()[:40] or None
    repository = ModelAccountRepository.from_session(session)
    account = await repository.by_key(user_id, PROVIDER_CLAUDE, CLAUDE_ACCOUNT_KEY)
    if account is None:
        account = DesktopModelAccount(
            user_id=user_id,
            provider=PROVIDER_CLAUDE,
            kind=KIND_SUBSCRIPTION,
            account_key=CLAUDE_ACCOUNT_KEY,
            label=shown,
            plan=named_plan,
            access_token="",
            refresh_token=None,
            expires_at=None,
            status=STATUS_AVAILABLE,
            limited_until=None,
        )
        await repository.create(account, flush=True)
        return account
    account.status = STATUS_AVAILABLE
    account.plan = named_plan or account.plan
    account.limited_until = None
    if not account.label:
        account.label = shown
    await session.flush()
    return account


def _key_account_key(key: str, fields: Mapping[str, str]) -> str:
    """A key's own name among the person's accounts, never the key: the same
    key connected again replaces its row."""
    digest = hashlib.sha256(
        json.dumps([key, dict(sorted(fields.items()))]).encode()
    ).hexdigest()
    return f"key:{digest[:40]}"


async def keep_key(
    session: AsyncSession,
    user_id: UUID,
    provider: str,
    key: str,
    fields: Mapping[str, str],
    models: list[dict[str, Any]],
) -> DesktopModelAccount:
    """An API key the provider took, kept sealed with its details and the
    models it reaches. Its name shows only its last four characters."""
    account_key = _key_account_key(key, fields)
    sealed = seal(json.dumps({"key": key, "fields": dict(fields)}), purpose=_SEALED)
    repository = ModelAccountRepository.from_session(session)
    account = await repository.by_key(user_id, provider, account_key)
    if account is None:
        account = DesktopModelAccount(
            user_id=user_id,
            provider=provider,
            kind=KIND_API_KEY,
            account_key=account_key,
            label=f"…{key[-4:]}",
            plan=None,
            access_token=sealed,
            refresh_token=None,
            expires_at=None,
            status=STATUS_AVAILABLE,
            limited_until=None,
            models=models,
        )
        await repository.create(account, flush=True)
        return account
    account.access_token = sealed
    account.models = models
    account.status = STATUS_AVAILABLE
    account.limited_until = None
    await session.flush()
    return account


async def key_refused(session: AsyncSession, user_id: UUID, account_id: UUID) -> None:
    """The provider no longer takes the key (revoked, run out): shown
    signed out, so the person connects a new one."""
    account = await ModelAccountRepository.from_session(session).one_for_user(
        user_id, account_id
    )
    if account is None or account.kind != KIND_API_KEY:
        return
    account.status = STATUS_SIGNED_OUT
    await session.flush()
    log.info(
        "desktop.models.key_refused", user_id=str(user_id), provider=account.provider
    )


def _key_grant(account: DesktopModelAccount) -> AccessGrant | None:
    opened = unseal(account.access_token, purpose=_SEALED)
    try:
        kept = json.loads(opened) if opened is not None else None
    except ValueError:
        kept = None
    if not isinstance(kept, dict) or not isinstance(kept.get("key"), str):
        return None
    given = kept.get("fields")
    fields: dict[str, Any] = given if isinstance(given, dict) else {}
    return AccessGrant(
        kept["key"],
        account.account_key,
        None,
        {str(k): str(v) for k, v in fields.items()},
    )


async def access_for(
    session: AsyncSession,
    user_id: UUID,
    account_id: UUID,
    *,
    force_refresh: bool = False,
) -> AccessGrant | None:
    """A live access token for one of the person's accounts, or None when the
    account is gone or signed out (the person connects again). For an API
    key, the key and its details."""
    repository = ModelAccountRepository.from_session(session)
    account = await repository.one_for_user(user_id, account_id, lock=True)
    if (
        account is not None
        and account.kind == KIND_API_KEY
        and account.status != STATUS_SIGNED_OUT
    ):
        grant = _key_grant(account)
        if grant is None:
            # Sealed under another SECRET: unreadable for good.
            log.warning("desktop.models.unreadable", user_id=str(user_id))
            account.status = STATUS_SIGNED_OUT
            await session.flush()
        return grant
    if (
        account is None
        or account.status == STATUS_SIGNED_OUT
        or account.provider not in SIGNED_IN_BY_CODE
    ):
        # Claude's row holds no token: Claude Code on the computer makes its calls.
        return None
    access = unseal(account.access_token, purpose=_SEALED)
    refresh = (
        unseal(account.refresh_token, purpose=_SEALED)
        if account.refresh_token
        else None
    )
    if access is None or (account.refresh_token and refresh is None):
        # Sealed under another SECRET: unreadable for good.
        log.warning("desktop.models.unreadable", user_id=str(user_id))
        account.status = STATUS_SIGNED_OUT
        await session.flush()
        return None
    now = utc_now()
    current = AccessGrant(access, account.account_key, account.expires_at)
    fresh = account.expires_at is None or account.expires_at - now > REFRESH_AHEAD
    if (fresh and not force_refresh) or refresh is None:
        return current
    try:
        tokens = (
            await grok.refresh(refresh, access)
            if account.provider == PROVIDER_GROK
            else await _refresh(refresh)
        )
    except ProviderError as error:
        if error.sign_in_gone:
            log.info(
                "desktop.models.signed_out",
                user_id=str(user_id),
                provider=account.provider,
                status=error.status,
            )
            account.status = STATUS_SIGNED_OUT
            await session.flush()
            return None
        log.warning(
            "desktop.models.refresh_failed",
            user_id=str(user_id),
            provider=account.provider,
            status=error.status,
            error=error.code,
        )
        if account.expires_at is not None and account.expires_at > now:
            return current
        raise RefreshUnavailable() from error
    except httpx.HTTPError as error:
        log.warning(
            "desktop.models.refresh_failed",
            user_id=str(user_id),
            provider=account.provider,
            reason=type(error).__name__,
        )
        if account.expires_at is not None and account.expires_at > now:
            return current
        raise RefreshUnavailable() from error
    _keep(account, tokens)
    account.set_modified_at()
    # The provider has already spent the refresh token it was sent: the new
    # one is written now, before anything else in this request can fail.
    await session.flush()
    log.info(
        "desktop.models.refreshed", user_id=str(user_id), provider=account.provider
    )
    return AccessGrant(tokens.access_token, account.account_key, account.expires_at)


async def mark_limited(
    session: AsyncSession, user_id: UUID, account_id: UUID, until: datetime
) -> None:
    """The account's plan limit reached: its calls go elsewhere until
    `until` (`own_models.relay`)."""
    account = await ModelAccountRepository.from_session(session).one_for_user(
        user_id, account_id
    )
    if account is None:
        return
    account.limited_until = until
    await session.flush()


async def disconnect(
    session: AsyncSession, user_id: UUID, account_id: UUID
) -> dict[str, bool]:
    """Ends one account's sign-in at the provider, then forgets it here. The
    row goes even when the provider can't be reached; the log says so."""
    repository = ModelAccountRepository.from_session(session)
    account = await repository.one_for_user(user_id, account_id, lock=True)
    if account is None:
        return {"disconnected": False, "revoked": False}
    revoked = False
    refresh = (
        unseal(account.refresh_token, purpose=_SEALED)
        if account.refresh_token
        else None
    )
    if refresh is not None and account.provider == PROVIDER_CHATGPT:
        revoked = await revoke(refresh)
    elif refresh is not None and account.provider == PROVIDER_GROK:
        revoked = await grok.revoke(refresh)
    await repository.delete_one(user_id, account_id)
    log.info(
        "desktop.models.disconnected",
        user_id=str(user_id),
        provider=account.provider,
        revoked=revoked,
    )
    return {"disconnected": True, "revoked": revoked}


async def disconnect_all(session: AsyncSession, user_id: UUID) -> dict[str, int]:
    """Every account of the person's ended and forgotten (account deletion)."""
    accounts = await ModelAccountRepository.from_session(session).for_user(user_id)
    report = {"disconnected": 0, "not_revoked": 0}
    for account in list(accounts):
        result = await disconnect(session, user_id, account.id)
        if result["disconnected"]:
            report["disconnected"] += 1
            if not result["revoked"]:
                report["not_revoked"] += 1
    return report


def _ms(value: datetime | None) -> int | None:
    return int(value.timestamp() * 1000) if value is not None else None


# --- how much of the plan is used (9 November 2026) -----------------------------
#
# The founder: "we need the usage for both claude and chat gpt ... it should
# look like usage and billing". Each provider says it per window: ChatGPT
# with every answer, Claude in Claude Code's stream. Kept as last said, never
# guessed.

#: The windows a plan's usage is told in: the 5-hour one and the week's.
USAGE_FIVE_HOUR = "five_hour"
USAGE_WEEKLY = "weekly"


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def usage_window(
    kind: str, used_percent: float, resets_at_ms: int | None, minutes: int | None
) -> dict[str, Any]:
    """One window as the apps show it: how much is used (0 to 100, past 100
    when a provider lets usage run past its cap) and when it resets."""
    return {
        "kind": kind,
        "usedPercent": round(min(max(used_percent, 0.0), 1000.0), 1),
        "resetsAt": resets_at_ms,
        "minutes": minutes,
    }


def chatgpt_usage(headers: Mapping[str, str], now: datetime) -> dict[str, Any] | None:
    """ChatGPT's own word on the plan's usage, from an answer's headers, as
    Codex reads it (openai/codex, `codex-rs/codex-api/src/rate_limits.rs`):
    `x-codex-primary-used-percent`, `-window-minutes` and `-reset-at`
    (seconds since 1970; `-reset-after-seconds` in older answers), and the
    same for `secondary`. Primary is the 5-hour window, secondary the
    week's; a window longer than a day is the week's. None when the answer
    said nothing of it."""
    windows: list[dict[str, Any]] = []
    for name, fallback in (("primary", USAGE_FIVE_HOUR), ("secondary", USAGE_WEEKLY)):
        used = _number(headers.get(f"x-codex-{name}-used-percent"))
        if used is None:
            continue
        minutes = _number(headers.get(f"x-codex-{name}-window-minutes"))
        whole_minutes = int(minutes) if minutes is not None and minutes > 0 else None
        kind = (
            fallback
            if whole_minutes is None
            else USAGE_FIVE_HOUR
            if whole_minutes <= 24 * 60
            else USAGE_WEEKLY
        )
        reset_at = _number(headers.get(f"x-codex-{name}-reset-at"))
        if reset_at is None:
            after = _number(headers.get(f"x-codex-{name}-reset-after-seconds"))
            if after is not None and after >= 0:
                reset_at = now.timestamp() + after
        resets_at_ms = (
            int(reset_at * 1000) if reset_at is not None and reset_at > 0 else None
        )
        windows.append(usage_window(kind, used, resets_at_ms, whole_minutes))
    if not windows:
        return None
    return {"windows": windows, "at": _ms(now)}


async def keep_usage(
    session: AsyncSession, user_id: UUID, account_id: UUID, usage: dict[str, Any]
) -> None:
    """The account's usage as its provider last said it."""
    account = await ModelAccountRepository.from_session(session).one_for_user(
        user_id, account_id
    )
    if account is None:
        return
    account.usage = usage
    await session.flush()


def account_json(account: DesktopModelAccount) -> dict[str, Any]:
    """An account as the apps show it: never a token."""
    now = utc_now()
    limited = account.limited_until is not None and account.limited_until > now
    status = (
        STATUS_SIGNED_OUT
        if account.status == STATUS_SIGNED_OUT
        else "limited"
        if limited
        else STATUS_AVAILABLE
    )
    return {
        "id": str(account.id),
        "provider": account.provider,
        "kind": account.kind,
        "label": account.label,
        "plan": account.plan,
        "status": status,
        "limitedUntil": _ms(account.limited_until) if limited else None,
        "createdAt": _ms(account.created_at),
        "usage": account.usage,
        # The models an API key reaches; none for a sign-in.
        "models": account.models if account.kind == KIND_API_KEY else None,
    }


# --- the sign-in in progress, kept a quarter of an hour -------------------------


def _kept(user_id: UUID, device: DeviceCode, asked_at: float | None) -> str:
    return json.dumps(
        {
            "user_id": str(user_id),
            "provider": device.provider,
            "device_auth_id": device.device_auth_id,
            "user_code": device.user_code,
            "interval": device.interval,
            "verification_url": device.verification_url,
            "asked_at": asked_at,
        }
    )


async def _remember(redis: Redis, user_id: UUID, device: DeviceCode) -> str:
    connect_id = secrets.token_urlsafe(24)
    await redis.set(
        f"{_CONNECT_PREFIX}{connect_id}",
        _kept(user_id, device, None),
        ex=min(CONNECT_TTL_S, device.expires_in),
    )
    return connect_id


async def _recall(
    redis: Redis, user_id: UUID, connect_id: str, provider: str = PROVIDER_CHATGPT
) -> tuple[DeviceCode, float | None] | None:
    """The sign-in in progress and when its provider was last asked; None
    when it ran out, is another person's or another provider's."""
    raw = await redis.get(f"{_CONNECT_PREFIX}{connect_id}")
    if raw is None:
        return None
    try:
        kept = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if kept.get("user_id") != str(user_id):
        return None
    if kept.get("provider", PROVIDER_CHATGPT) != provider:
        return None
    asked_at = kept.get("asked_at")
    device = DeviceCode(
        kept["device_auth_id"],
        kept["user_code"],
        int(kept["interval"]),
        provider=provider,
        verification_url=kept.get("verification_url"),
    )
    return device, asked_at if isinstance(asked_at, int | float) else None


async def _asked(
    redis: Redis, user_id: UUID, connect_id: str, device: DeviceCode, at: float
) -> None:
    """When the provider was asked (and how often it now wants to be),
    kept until the sign-in runs out as before."""
    await redis.set(
        f"{_CONNECT_PREFIX}{connect_id}",
        _kept(user_id, device, at),
        keepttl=True,
    )


# --- routes -------------------------------------------------------------------


class _PollBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    connectId: str


class _RenameBody(BaseModel):
    label: str


class _ClaudeBody(BaseModel):
    label: str | None = None
    plan: str | None = None


class _UsageWindowBody(BaseModel):
    kind: Literal["five_hour", "weekly"]
    used_percent: float = Field(alias="usedPercent", ge=0, le=1000)
    resets_at: int | None = Field(default=None, alias="resetsAt", ge=0)
    minutes: int | None = Field(default=None, ge=1)


class _ClaudeUsageBody(BaseModel):
    windows: list[_UsageWindowBody] = Field(max_length=4)


#: What each refusal of these routes says, in English: the apps show their
#: own words for the code (`AIModels.startProblem`), these where they have
#: none.
_REFUSALS = {
    "device_code_off": "{provider} didn't allow signing in with a code.",
    "provider_unavailable": "Couldn't reach {provider}. Try again in a moment.",
    "not_found": "That account isn't connected.",
    "empty_label": "Give the account a name.",
    "not_offered": "That model isn't one of your accounts' models.",
    "unknown_provider": "That provider can't be connected yet.",
    "invalid_key": "That doesn't look like a {provider} key.",
    "invalid_fields": "Check the details {provider} needs.",
    "key_refused": "{provider} didn't accept this key.",
}


def refusal(code: str, status: int, provider: str = PROVIDER_CHATGPT) -> JSONResponse:
    """A refusal in the shape the apps read (`{"error": {"code", "message"}}`,
    as the model proxy's): the code for the apps' own words, the message
    where they have none."""
    message = _REFUSALS.get(code, code).replace("{provider}", provider_name(provider))
    return JSONResponse(
        {"error": {"code": code, "message": message}}, status_code=status
    )


def _provider_unavailable(
    code: str = "provider_unavailable", provider: str = PROVIDER_CHATGPT
) -> JSONResponse:
    return refusal(code, 502, provider)


@router.get("/api/models/accounts", name="desktop:model_accounts_list")
async def model_accounts_list(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    accounts = await ModelAccountRepository.from_session(session).for_user(
        desktop_session.user_id
    )
    return JSONResponse(
        {
            "accounts": [account_json(a) for a in accounts],
            # The apps' API keys section, in the founder's order.
            "keyProviders": key_providers.catalogue_json(),
        }
    )


class _KeyBody(BaseModel):
    key: str = Field(max_length=2000)
    fields: dict[str, str] = Field(default_factory=dict, max_length=8)


def _looks_like_a_key(key: str) -> bool:
    return (
        8 <= len(key) <= 1000
        and key.isprintable()
        and not any(one.isspace() for one in key)
    )


@router.post("/api/models/accounts/keys/{provider}", name="desktop:model_accounts_key")
async def model_accounts_key(
    provider: str,
    body: _KeyBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The person's own API key: tried at the provider, then kept sealed with
    the models it reaches. Refused, it is never kept."""
    one = key_providers.provider(provider)
    if one is None or not one.available:
        return refusal("unknown_provider", 404)
    key = body.key.strip()
    if not _looks_like_a_key(key):
        return refusal("invalid_key", 400, provider)
    fields = one.field_values(body.fields)
    if fields is None:
        return refusal("invalid_fields", 400, provider)
    user_id = desktop_session.user_id
    try:
        checked = await key_providers.check_key(one, key, fields)
    except key_providers.KeyRefused as error:
        log.info(
            "desktop.models.key_not_taken",
            user_id=str(user_id),
            provider=provider,
            status=error.args[0] if error.args else None,
        )
        return refusal("key_refused", 400, provider)
    except key_providers.ProviderUnreachable as error:
        log.warning(
            "desktop.models.key_check_failed",
            user_id=str(user_id),
            provider=provider,
            reason=str(error),
        )
        return refusal("provider_unavailable", 502, provider)
    account = await keep_key(session, user_id, provider, key, fields, checked.models)
    log.info(
        "desktop.models.connected",
        user_id=str(user_id),
        provider=provider,
        kind=KIND_API_KEY,
        models=len(checked.models),
    )
    return JSONResponse({"status": "connected", "account": account_json(account)})


def _started(connect_id: str, device: DeviceCode) -> JSONResponse:
    return JSONResponse(
        {
            "connectId": connect_id,
            "userCode": device.user_code,
            "verificationUrl": device.verification_url or verification_url(),
            "interval": device.interval,
            "expiresIn": min(CONNECT_TTL_S, device.expires_in),
        }
    )


@router.post(
    "/api/models/accounts/chatgpt/start", name="desktop:model_accounts_chatgpt_start"
)
async def model_accounts_chatgpt_start(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    try:
        device = await request_device_code()
    except ChatGptError as error:
        log.warning(
            "desktop.models.start_failed", status=error.status, error=error.code
        )
        # Codex's own reading of a 404: device-code sign-in is off for this
        # client or account.
        return _provider_unavailable(
            "device_code_off" if error.status == 404 else "provider_unavailable"
        )
    except httpx.HTTPError as error:
        log.warning("desktop.models.start_failed", reason=type(error).__name__)
        return _provider_unavailable()
    connect_id = await _remember(redis, desktop_session.user_id, device)
    log.info("desktop.models.sign_in_started", user_id=str(desktop_session.user_id))
    return _started(connect_id, device)


async def _connected(
    redis: Redis, connect_id: str, user_id: UUID, account: DesktopModelAccount
) -> JSONResponse:
    await redis.delete(f"{_CONNECT_PREFIX}{connect_id}")
    log.info(
        "desktop.models.connected",
        user_id=str(user_id),
        provider=account.provider,
        plan=account.plan,
    )
    return JSONResponse({"status": "connected", "account": account_json(account)})


async def _failed(
    redis: Redis, connect_id: str, error: ProviderError, provider: str
) -> JSONResponse:
    log.warning(
        "desktop.models.poll_failed",
        provider=provider,
        status=error.status,
        error=error.code,
    )
    await redis.delete(f"{_CONNECT_PREFIX}{connect_id}")
    # The poll answered: the sign-in failed (the app says so and offers to
    # start again).
    return JSONResponse({"status": "failed", "reason": error.code})


@router.post(
    "/api/models/accounts/chatgpt/poll", name="desktop:model_accounts_chatgpt_poll"
)
async def model_accounts_chatgpt_poll(
    body: _PollBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    user_id = desktop_session.user_id
    recalled = await _recall(redis, user_id, body.connectId)
    if recalled is None:
        return JSONResponse({"status": "expired"})
    device, _ = recalled
    try:
        tokens = await poll_device_code(device)
        if tokens is None:
            return JSONResponse({"status": "waiting"})
        account = await keep_sign_in(session, user_id, tokens)
    except ChatGptError as error:
        return await _failed(redis, body.connectId, error, PROVIDER_CHATGPT)
    except httpx.HTTPError as error:
        log.warning("desktop.models.poll_failed", reason=type(error).__name__)
        return JSONResponse({"status": "waiting"})
    return await _connected(redis, body.connectId, user_id, account)


@router.post(
    "/api/models/accounts/grok/start", name="desktop:model_accounts_grok_start"
)
async def model_accounts_grok_start(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """A code for the person to approve on xAI's page, in the same sheet as
    ChatGPT's."""
    try:
        started = await grok.request_device_code()
    except grok.GrokError as error:
        log.warning(
            "desktop.models.start_failed",
            provider=PROVIDER_GROK,
            status=error.status,
            error=error.code,
        )
        return _provider_unavailable(
            "device_code_off" if error.status == 404 else "provider_unavailable",
            PROVIDER_GROK,
        )
    except httpx.HTTPError as error:
        log.warning(
            "desktop.models.start_failed",
            provider=PROVIDER_GROK,
            reason=type(error).__name__,
        )
        return _provider_unavailable(provider=PROVIDER_GROK)
    device = DeviceCode(
        started.device_code,
        started.user_code,
        started.interval,
        provider=PROVIDER_GROK,
        verification_url=started.verification_url,
        expires_in=started.expires_in,
    )
    connect_id = await _remember(redis, desktop_session.user_id, device)
    log.info(
        "desktop.models.sign_in_started",
        user_id=str(desktop_session.user_id),
        provider=PROVIDER_GROK,
    )
    return _started(connect_id, device)


@router.post("/api/models/accounts/grok/poll", name="desktop:model_accounts_grok_poll")
async def model_accounts_grok_poll(
    body: _PollBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """`waiting` until the person approves on xAI's page; then the plan is
    asked whether it may use Grok here, and kept only if so."""
    user_id = desktop_session.user_id
    recalled = await _recall(redis, user_id, body.connectId, PROVIDER_GROK)
    if recalled is None:
        return JSONResponse({"status": "expired"})
    device, asked_at = recalled
    now = utc_now().timestamp()
    if asked_at is not None and now - asked_at < device.interval:
        # Asked sooner than xAI wants (RFC 8628): xAI isn't asked again yet.
        return JSONResponse({"status": "waiting", "interval": device.interval})
    try:
        answer = await grok.poll_device_code(device.device_auth_id)
        if isinstance(answer, grok.Waiting):
            if answer.slower:
                device = replace(device, interval=device.interval + SLOW_DOWN_S)
            await _asked(redis, user_id, body.connectId, device, now)
            return JSONResponse({"status": "waiting", "interval": device.interval})
        if await grok.access_allowed(answer.access_token) is False:
            # A plan xAI doesn't let use Grok here (Free, or one its gate
            # bars): said now, and the sign-in ended at xAI, not kept.
            if answer.refresh_token:
                await grok.revoke(answer.refresh_token)
            raise grok.GrokError(403, "not_allowed")
        account = await keep_sign_in(session, user_id, answer, PROVIDER_GROK)
    except grok.GrokError as error:
        return await _failed(redis, body.connectId, error, PROVIDER_GROK)
    except httpx.HTTPError as error:
        log.warning(
            "desktop.models.poll_failed",
            provider=PROVIDER_GROK,
            reason=type(error).__name__,
        )
        return JSONResponse({"status": "waiting", "interval": device.interval})
    return await _connected(redis, body.connectId, user_id, account)


@router.post("/api/models/accounts/claude", name="desktop:model_accounts_claude")
async def model_accounts_claude(
    body: _ClaudeBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The person's computer signed in to Claude Code: the app says so with
    the e-mail and plan Claude Code named."""
    account = await keep_claude(session, desktop_session.user_id, body.label, body.plan)
    log.info(
        "desktop.models.connected",
        user_id=str(desktop_session.user_id),
        provider=account.provider,
        plan=account.plan,
    )
    return JSONResponse({"account": account_json(account)})


async def claude_signed_out(
    session: AsyncSession, user_id: UUID
) -> DesktopModelAccount | None:
    """Claude Code on the person's computer is no longer signed in: their
    Claude account shows so (red, with Connect Again) and is offered to the
    agents no more, until the person connects it again (`keep_claude`). The
    model they chose is kept for then."""
    repository = ModelAccountRepository.from_session(session)
    account = await repository.by_key(user_id, PROVIDER_CLAUDE, CLAUDE_ACCOUNT_KEY)
    if account is None or account.status == STATUS_SIGNED_OUT:
        return account
    account.status = STATUS_SIGNED_OUT
    await session.flush()
    return account


@router.post(
    "/api/models/accounts/claude/signed-out",
    name="desktop:model_accounts_claude_signed_out",
)
async def model_accounts_claude_signed_out(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The engine found Claude Code signed out on the computer (9 November
    2026: the app went on showing Claude as usable, and the agents tried it
    at every turn, while each turn fell back to Simeon's models).

    The engine says it with the computer's own credential, so the route
    takes it (11 November 2026: it took the app's sign-in only, every
    report was refused with a 401, and AI Models went on showing Claude
    connected while the chat said it wasn't)."""
    account = await claude_signed_out(session, desktop_session.user_id)
    if account is not None:
        log.info(
            "desktop.models.signed_out",
            user_id=str(desktop_session.user_id),
            provider=PROVIDER_CLAUDE,
            by="computer" if desktop_session.is_box_credential else "app",
        )
    return JSONResponse(
        {"account": account_json(account) if account is not None else None}
    )


@router.post(
    "/api/models/accounts/claude/usage",
    name="desktop:model_accounts_claude_usage",
)
async def model_accounts_claude_usage(
    body: _ClaudeUsageBody,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """How much of the Claude plan is used, as Claude Code on the computer
    last said it (its stream's `rate_limit_event`: the 5-hour and weekly
    windows); kept on the person's Claude account. Told by the engine with
    the computer's own credential (until 11 November 2026 refused, so no
    usage ever showed)."""
    repository = ModelAccountRepository.from_session(session)
    account = await repository.by_key(
        desktop_session.user_id, PROVIDER_CLAUDE, CLAUDE_ACCOUNT_KEY
    )
    if account is None or not body.windows:
        return JSONResponse({"account": None})
    account.usage = {
        "windows": [
            usage_window(one.kind, one.used_percent, one.resets_at, one.minutes)
            for one in body.windows
        ],
        "at": _ms(utc_now()),
    }
    await session.flush()
    log.info(
        "desktop.models.usage",
        user_id=str(desktop_session.user_id),
        provider=PROVIDER_CLAUDE,
        windows=",".join(
            f"{one.kind}={round(one.used_percent)}" for one in body.windows
        ),
    )
    return JSONResponse({"account": account_json(account)})


@router.patch("/api/models/accounts/{account_id}", name="desktop:model_accounts_rename")
async def model_accounts_rename(
    account_id: UUID,
    body: _RenameBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    repository = ModelAccountRepository.from_session(session)
    account = await repository.one_for_user(desktop_session.user_id, account_id)
    if account is None:
        return refusal("not_found", 404)
    label = body.label.strip()[:200]
    if not label:
        return refusal("empty_label", 400)
    account.label = label
    await session.flush()
    return JSONResponse({"account": account_json(account)})


@router.delete(
    "/api/models/accounts/{account_id}", name="desktop:model_accounts_disconnect"
)
async def model_accounts_disconnect(
    account_id: UUID,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    result = await disconnect(session, desktop_session.user_id, account_id)
    if not result["disconnected"]:
        return refusal("not_found", 404)
    return JSONResponse(result)
