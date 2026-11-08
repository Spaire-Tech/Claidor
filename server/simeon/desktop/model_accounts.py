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

The tokens never leave the server. Nothing here logs a token, a code or a
verifier.
"""

from __future__ import annotations

import base64
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import httpx
import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from simeon.config import settings
from simeon.kit.sealed import seal, unseal
from simeon.kit.utils import utc_now
from simeon.models import DesktopModelAccount, DesktopSession
from simeon.postgres import AsyncSession, get_db_session
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter

from .auth import get_desktop_session
from .model_account_repository import ModelAccountRepository

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

PROVIDER_CHATGPT = "chatgpt"
KIND_SUBSCRIPTION = "subscription"
STATUS_AVAILABLE = "available"
STATUS_SIGNED_OUT = "signed_out"
#: How long a started sign-in waits for the person: Codex's own 15 minutes.
CONNECT_TTL_S = 15 * 60
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


class ChatGptError(Exception):
    """OpenAI refused a sign-in call: its HTTP status and error code."""

    def __init__(self, status: int, code: str | None) -> None:
        super().__init__(f"OpenAI answered {status} {code or ''}".strip())
        self.status = status
        self.code = code

    @property
    def sign_in_gone(self) -> bool:
        return self.code in GONE_CODES


class ChatGptUnavailable(Exception):
    """OpenAI could not refresh an access token that has run out."""


@dataclass(frozen=True)
class ChatGptTokens:
    id_token: str | None
    access_token: str
    refresh_token: str | None


@dataclass(frozen=True)
class AccessGrant:
    """What a model call on the account needs: the bearer, and the account
    it speaks for (Codex's `chatgpt-account-id` header)."""

    access_token: str
    account_key: str
    expires_at: datetime | None


@dataclass(frozen=True)
class DeviceCode:
    device_auth_id: str
    user_code: str
    interval: int


# --- OpenAI's sign-in ---------------------------------------------------------


def _auth_base() -> str:
    return settings.CHATGPT_AUTH_BASE_URL.rstrip("/")


def verification_url() -> str:
    """Where the person enters the code (Codex's `{issuer}/codex/device`)."""
    return f"{_auth_base()}/codex/device"


def _error_code(response: httpx.Response) -> str | None:
    """OpenAI's error code, from `{"error": {"code": …}}` or OAuth's
    `{"error": "…"}`."""
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    error = body.get("error")
    if isinstance(error, dict):
        code = error.get("code") or error.get("type")
        return str(code) if code else None
    if isinstance(error, str) and error:
        return error
    code = body.get("code")
    return str(code) if isinstance(code, str) and code else None


def claims(token: str | None) -> dict[str, Any]:
    """A JWT's claims, unverified: the token comes straight from OpenAI over
    TLS, and only says whose it is and when it ends."""
    if not token:
        return {}
    parts = token.split(".")
    if len(parts) < 2:
        return {}
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        decoded = json.loads(base64.urlsafe_b64decode(payload.encode()))
    except (ValueError, json.JSONDecodeError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


def expiry(access_token: str) -> datetime | None:
    exp = claims(access_token).get("exp")
    if isinstance(exp, int | float):
        return datetime.fromtimestamp(exp, tz=UTC)
    return None


def identity(tokens: ChatGptTokens) -> tuple[str | None, str, str | None]:
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
        raise ChatGptError(response.status_code, _error_code(response))
    body = response.json()
    code = body.get("user_code") or body.get("usercode")
    device_auth_id = body.get("device_auth_id")
    if not isinstance(code, str) or not isinstance(device_auth_id, str):
        raise ChatGptError(response.status_code, "no_code")
    try:
        interval = max(1, int(str(body.get("interval", 5)).strip()))
    except ValueError:
        interval = 5
    return DeviceCode(device_auth_id, code, interval)


async def poll_device_code(device: DeviceCode) -> ChatGptTokens | None:
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
        raise ChatGptError(response.status_code, _error_code(response))
    body = response.json()
    code = body.get("authorization_code")
    verifier = body.get("code_verifier")
    if not isinstance(code, str) or not isinstance(verifier, str):
        raise ChatGptError(response.status_code, "no_authorization_code")
    return await _exchange(code, verifier)


async def _exchange(code: str, verifier: str) -> ChatGptTokens:
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
        raise ChatGptError(response.status_code, _error_code(response))
    return _tokens_of(response.json())


def _tokens_of(body: Any) -> ChatGptTokens:
    if not isinstance(body, dict) or not isinstance(body.get("access_token"), str):
        raise ChatGptError(200, "no_access_token")
    refresh = body.get("refresh_token")
    id_token = body.get("id_token")
    return ChatGptTokens(
        id_token=id_token if isinstance(id_token, str) else None,
        access_token=body["access_token"],
        refresh_token=refresh if isinstance(refresh, str) and refresh else None,
    )


async def _refresh(refresh_token: str) -> ChatGptTokens:
    response = await _post(
        "/oauth/token",
        json_body={
            "grant_type": "refresh_token",
            "client_id": settings.CHATGPT_CLIENT_ID,
            "refresh_token": refresh_token,
        },
    )
    if not response.is_success:
        raise ChatGptError(response.status_code, _error_code(response))
    return _tokens_of(response.json())


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


def _keep(account: DesktopModelAccount, tokens: ChatGptTokens) -> None:
    """Writes OpenAI's answer into the row, sealed. A refresh that names no
    new refresh token keeps the one before."""
    account.access_token = seal(tokens.access_token, purpose=_SEALED)
    if tokens.refresh_token is not None:
        account.refresh_token = seal(tokens.refresh_token, purpose=_SEALED)
    account.expires_at = expiry(tokens.access_token)
    account.status = STATUS_AVAILABLE


async def keep_sign_in(
    session: AsyncSession, user_id: UUID, tokens: ChatGptTokens
) -> DesktopModelAccount:
    """A finished ChatGPT sign-in, kept: the same ChatGPT account signed in
    again replaces its row (its name stays as the person left it)."""
    account_key, email, plan = identity(tokens)
    if account_key is None:
        raise ChatGptError(200, "no_account")
    if tokens.refresh_token is None:
        raise ChatGptError(200, "no_refresh_token")
    repository = ModelAccountRepository.from_session(session)
    account = await repository.by_key(user_id, PROVIDER_CHATGPT, account_key)
    if account is None:
        account = DesktopModelAccount(
            user_id=user_id,
            provider=PROVIDER_CHATGPT,
            kind=KIND_SUBSCRIPTION,
            account_key=account_key,
            label=email or "ChatGPT",
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
        account.label = email or "ChatGPT"
    await session.flush()
    return account


async def access_for(
    session: AsyncSession,
    user_id: UUID,
    account_id: UUID,
    *,
    force_refresh: bool = False,
) -> AccessGrant | None:
    """A live access token for one of the person's accounts, or None when the
    account is gone or signed out (the person connects again)."""
    repository = ModelAccountRepository.from_session(session)
    account = await repository.one_for_user(user_id, account_id, lock=True)
    if account is None or account.status == STATUS_SIGNED_OUT:
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
        tokens = await _refresh(refresh)
    except ChatGptError as error:
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
            status=error.status,
            error=error.code,
        )
        if account.expires_at is not None and account.expires_at > now:
            return current
        raise ChatGptUnavailable() from error
    except httpx.HTTPError as error:
        log.warning(
            "desktop.models.refresh_failed",
            user_id=str(user_id),
            reason=type(error).__name__,
        )
        if account.expires_at is not None and account.expires_at > now:
            return current
        raise ChatGptUnavailable() from error
    _keep(account, tokens)
    account.set_modified_at()
    # OpenAI has already spent the refresh token it was sent: the new one is
    # written now, before anything else in this request can fail.
    await session.flush()
    log.info("desktop.models.refreshed", user_id=str(user_id))
    return AccessGrant(tokens.access_token, account.account_key, account.expires_at)


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
    }


# --- the sign-in in progress, kept a quarter of an hour -------------------------


async def _remember(redis: Redis, user_id: UUID, device: DeviceCode) -> str:
    connect_id = secrets.token_urlsafe(24)
    await redis.set(
        f"{_CONNECT_PREFIX}{connect_id}",
        json.dumps(
            {
                "user_id": str(user_id),
                "device_auth_id": device.device_auth_id,
                "user_code": device.user_code,
                "interval": device.interval,
            }
        ),
        ex=CONNECT_TTL_S,
    )
    return connect_id


async def _recall(redis: Redis, user_id: UUID, connect_id: str) -> DeviceCode | None:
    raw = await redis.get(f"{_CONNECT_PREFIX}{connect_id}")
    if raw is None:
        return None
    try:
        kept = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if kept.get("user_id") != str(user_id):
        return None
    return DeviceCode(kept["device_auth_id"], kept["user_code"], int(kept["interval"]))


# --- routes -------------------------------------------------------------------


class _PollBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    connectId: str


class _RenameBody(BaseModel):
    label: str


def _provider_unavailable(code: str = "provider_unavailable") -> JSONResponse:
    return JSONResponse({"error": code}, status_code=502)


@router.get("/api/models/accounts", name="desktop:model_accounts_list")
async def model_accounts_list(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    accounts = await ModelAccountRepository.from_session(session).for_user(
        desktop_session.user_id
    )
    return JSONResponse({"accounts": [account_json(a) for a in accounts]})


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
    return JSONResponse(
        {
            "connectId": connect_id,
            "userCode": device.user_code,
            "verificationUrl": verification_url(),
            "interval": device.interval,
            "expiresIn": CONNECT_TTL_S,
        }
    )


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
    device = await _recall(redis, user_id, body.connectId)
    if device is None:
        return JSONResponse({"status": "expired"})
    try:
        tokens = await poll_device_code(device)
        if tokens is None:
            return JSONResponse({"status": "waiting"})
        account = await keep_sign_in(session, user_id, tokens)
    except ChatGptError as error:
        log.warning("desktop.models.poll_failed", status=error.status, error=error.code)
        await redis.delete(f"{_CONNECT_PREFIX}{body.connectId}")
        return JSONResponse({"status": "failed", "error": error.code}, status_code=502)
    except httpx.HTTPError as error:
        log.warning("desktop.models.poll_failed", reason=type(error).__name__)
        return JSONResponse({"status": "waiting"})
    await redis.delete(f"{_CONNECT_PREFIX}{body.connectId}")
    log.info(
        "desktop.models.connected",
        user_id=str(user_id),
        provider=account.provider,
        plan=account.plan,
    )
    return JSONResponse({"status": "connected", "account": account_json(account)})


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
        return JSONResponse({"error": "not_found"}, status_code=404)
    label = body.label.strip()[:200]
    if not label:
        return JSONResponse({"error": "empty_label"}, status_code=400)
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
        return JSONResponse({"error": "not_found"}, status_code=404)
    return JSONResponse(result)
