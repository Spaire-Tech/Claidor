"""Link, Stripe's agent wallet: the sign-in through Simeon Labs' own client.

Until 17 October 2026 the box signed in to Link with Link's device code,
under Link's public client: the person approved "Simeon on your cloud
computer" with Link's generic look and "Link hasn't verified Simeon…".
Stripe approved Simeon Labs' Link Agent Wallet OAuth client that day, so
the sign-in is a hosted agent's (docs.stripe.com/agentic-commerce/link-cli/oauth):
the authorization code flow with PKCE, the client's secret and the tokens
kept here, and the approval screen naming Simeon with its logo.

- `POST /desktop/api/link/start` — the sign-in link (desktop or box): a
  start link of ours (`apps.start_url`) that leads to Link's own page,
  `https://login.link.com/auth`, asking for payments and the person's name
  and e-mail (`SCOPES`) and, as `authorization_details`, the four source
  actions of financial insights (`SOURCE_ACTIONS`; the company's Stripe
  account is registered for Financial Connections, 14 October 2026).
- `GET /desktop/apps/link/callback` — where Link sends the person back,
  the redirect URI registered with Stripe. The state is taken once, the
  code exchanged at `https://login.link.com/auth/token` with the PKCE
  verifier, the tokens sealed into the person's row
  (`DesktopLinkWallet`), and the person sent to the page every sign-in
  ends on (`/desktop/apps/connected`, which takes the iPhone and the Mac
  back to the app).
- `GET /desktop/api/link/status` — whether the server can sign in to Link
  and whether the person is connected. No token.
- `POST /desktop/api/link/token` — the box only: a live access token for
  the next Link command, refreshed when less than `REFRESH_AHEAD` is left
  (or when asked, `{"refresh": true}`, after Link refused one). The box
  hands it to Stripe's CLI as `LINK_ACCESS_TOKEN` with `LINK_NO_REFRESH`
  set, so the refresh token never leaves the server. A refresh Link
  refuses as `invalid_grant` (the person ended the connection in Link)
  forgets the connection.
- `DELETE /desktop/api/link` — disconnect: the refresh token revoked at
  `https://login.link.com/auth/revoke`, which ends the grant, and the row
  deleted. Account deletion does the same.

Link answers the token calls only with the Stripe account's publishable
key as the bearer, and the client's id and secret in the form. Nothing
here logs a token, a code, the verifier or the secret.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx
import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse, RedirectResponse

from simeon.config import settings
from simeon.kit.sealed import seal, unseal
from simeon.kit.utils import utc_now
from simeon.models import DesktopLinkWallet, DesktopSession
from simeon.postgres import AsyncSession, get_db_session
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter

from .apps import start_url
from .auth import get_desktop_or_box_session
from .link_repository import LinkWalletRepository

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

AUTH_BASE_URL = "https://login.link.com"
AUTHORIZE_URL = f"{AUTH_BASE_URL}/auth"
TOKEN_URL = f"{AUTH_BASE_URL}/auth/token"
REVOKE_URL = f"{AUTH_BASE_URL}/auth/revoke"
#: The redirect URI registered with Stripe, under the API's own address.
CALLBACK_PATH = "/desktop/apps/link/callback"
#: Payments (spend requests and their one-time cards) and the person's name
#: and e-mail: what Link's own CLI asks for (`DEFAULT_SCOPES`, 0.27.1).
SCOPES = ("payment_methods.agentic", "userinfo:read")
#: Financial insights, asked all at once so the person never signs in again
#: for them: Link's own transactions, the connected accounts' transactions,
#: balances and details (`LINK_SOURCE_ACTIONS` in the box, the same four).
SOURCE_ACTIONS = (
    "read_link_transactions",
    "read_external_transactions",
    "read_balances",
    "read_source_details",
)
#: How long a started sign-in waits for the person. Link's code must be
#: exchanged within 10 minutes of the approval; signing in to Link and
#: choosing the accounts to share comes before that.
STATE_TTL_S = 15 * 60
#: An access token with less than this left is refreshed before it is
#: handed out: the box keeps one until two minutes before its end, and a
#: command that waits on Link (an approval, up to two minutes) must not
#: outlive it.
REFRESH_AHEAD = timedelta(minutes=5)
#: A refresh asked for within this of the last one is answered with the
#: token that refresh made: two computers told "expired" at once refresh once.
REFRESH_SETTLE = timedelta(seconds=60)
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
_SEALED = "link-wallet"
_STATE_PREFIX = "desktop:link-oauth:"


class LinkTokenError(Exception):
    """Link refused a token call: its HTTP status and OAuth error code."""

    def __init__(self, status: int, code: str | None) -> None:
        super().__init__(f"Link answered {status} {code or ''}".strip())
        self.status = status
        self.code = code

    @property
    def grant_gone(self) -> bool:
        """The grant is over (revoked in Link, or the refresh token spent):
        connecting again is the only way back. Not a refused client, which
        is ours to fix and must not cost the person their connection."""
        return self.code == "invalid_grant"


class LinkUnavailable(Exception):
    """Link could not refresh an access token that has run out."""


@dataclass(frozen=True)
class LinkTokens:
    access_token: str
    refresh_token: str | None
    expires_in: int
    scope: str | None
    authorization_details: list[dict[str, Any]] | None


@dataclass(frozen=True)
class AccessGrant:
    access_token: str
    expires_at: datetime
    scope: str


def publishable_key() -> str:
    return settings.LINK_PUBLISHABLE_KEY or settings.STRIPE_PUBLISHABLE_KEY


def configured() -> bool:
    return bool(
        settings.LINK_CLIENT_ID and settings.LINK_CLIENT_SECRET and publishable_key()
    )


def redirect_uri() -> str:
    return f"{settings.BASE_URL.rstrip('/')}{CALLBACK_PATH}"


def code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def authorize_url(state: str, verifier: str) -> str:
    """Link's sign-in page for this person, every value URL-encoded."""
    params = {
        "key": publishable_key(),
        "client_id": settings.LINK_CLIENT_ID,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "state": state,
        "code_challenge": code_challenge(verifier),
        "code_challenge_method": "S256",
        "authorization_details": json.dumps(
            [{"type": "source", "actions": list(SOURCE_ACTIONS)}],
            separators=(",", ":"),
        ),
    }
    query = "&".join(
        f"{name}={quote(value, safe='')}" for name, value in params.items()
    )
    return f"{AUTHORIZE_URL}?{query}"


# --- the started sign-in ------------------------------------------------------


def _state_key(state: str) -> str:
    return _STATE_PREFIX + hashlib.sha256(state.encode()).hexdigest()


async def _remember(redis: Redis, user_id: UUID, verifier: str) -> str:
    state = secrets.token_urlsafe(32)
    await redis.set(
        _state_key(state),
        json.dumps({"user": str(user_id), "verifier": verifier}),
        ex=STATE_TTL_S,
    )
    return state


async def _take(redis: Redis, state: str | None) -> tuple[UUID, str] | None:
    """The person and the PKCE verifier a state was made for, once."""
    if not state:
        return None
    raw = await redis.getdel(_state_key(state))
    if raw is None:
        return None
    try:
        value = json.loads(raw)
        return UUID(str(value["user"])), str(value["verifier"])
    except (ValueError, KeyError, TypeError):
        return None


# --- Link's token endpoint ----------------------------------------------------


def _client_form(form: dict[str, str]) -> dict[str, str]:
    return {
        **form,
        "client_id": settings.LINK_CLIENT_ID,
        "client_secret": settings.LINK_CLIENT_SECRET,
    }


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {publishable_key()}"}


def _payload(response: httpx.Response) -> dict[str, Any]:
    try:
        value = response.json()
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


async def _token_call(form: dict[str, str]) -> LinkTokens:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(
            TOKEN_URL, headers=_headers(), data=_client_form(form)
        )
    payload = _payload(response)
    if not response.is_success:
        error = payload.get("error")
        raise LinkTokenError(
            response.status_code, error if isinstance(error, str) else None
        )
    access = payload.get("access_token")
    if not isinstance(access, str) or not access:
        raise LinkTokenError(response.status_code, "no_access_token")
    refresh = payload.get("refresh_token")
    details = payload.get("authorization_details")
    scope = payload.get("scope")
    try:
        expires_in = int(payload.get("expires_in") or 3600)
    except (TypeError, ValueError):
        expires_in = 3600
    return LinkTokens(
        access_token=access,
        refresh_token=refresh if isinstance(refresh, str) and refresh else None,
        expires_in=max(expires_in, 60),
        scope=scope if isinstance(scope, str) else None,
        authorization_details=details if isinstance(details, list) else None,
    )


async def revoke(refresh_token: str) -> bool:
    """Ends the grant at Link (its access tokens with it). False, logged,
    when Link could not be reached or refused."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.post(
                REVOKE_URL,
                headers=_headers(),
                data=_client_form(
                    {"token": refresh_token, "token_type_hint": "refresh_token"}
                ),
            )
    except httpx.HTTPError as error:
        log.warning("desktop.link.revoke_failed", reason=type(error).__name__)
        return False
    if not response.is_success:
        log.warning(
            "desktop.link.revoke_failed",
            status=response.status_code,
            error=_payload(response).get("error"),
        )
        return False
    return True


def _keep(wallet: DesktopLinkWallet, tokens: LinkTokens) -> None:
    """Writes Link's answer into the row, sealed. A refresh that names no
    new refresh token or scope keeps the ones before."""
    wallet.access_token = seal(tokens.access_token, purpose=_SEALED)
    if tokens.refresh_token is not None:
        wallet.refresh_token = seal(tokens.refresh_token, purpose=_SEALED)
    wallet.expires_at = utc_now() + timedelta(seconds=tokens.expires_in)
    if tokens.scope is not None:
        wallet.scope = tokens.scope
    if tokens.authorization_details is not None:
        wallet.authorization_details = tokens.authorization_details


# --- what the routes and the account's deletion use ---------------------------


async def connect(session: AsyncSession, user_id: UUID, tokens: LinkTokens) -> None:
    """Keeps a finished sign-in's tokens, in place of any before."""
    if tokens.refresh_token is None:
        raise LinkTokenError(200, "no_refresh_token")
    repository = LinkWalletRepository.from_session(session)
    wallet = await repository.for_user(user_id, lock=True)
    if wallet is None:
        wallet = DesktopLinkWallet(user_id=user_id, scope="")
        _keep(wallet, tokens)
        await repository.create(wallet, flush=True)
        return
    _keep(wallet, tokens)
    await session.flush()


async def access_for(
    session: AsyncSession, user_id: UUID, *, force_refresh: bool = False
) -> AccessGrant | None:
    """A live access token for the person, or None when they have no Link
    connection (or Link has ended it)."""
    repository = LinkWalletRepository.from_session(session)
    wallet = await repository.for_user(user_id, lock=True)
    if wallet is None:
        return None
    access = unseal(wallet.access_token, purpose=_SEALED)
    refresh = unseal(wallet.refresh_token, purpose=_SEALED)
    if access is None or refresh is None:
        # Sealed under another SECRET: unreadable for good.
        log.warning("desktop.link.unreadable", user_id=str(user_id))
        await repository.delete_for_user(user_id)
        return None
    now = utc_now()
    current = AccessGrant(access, wallet.expires_at, wallet.scope)
    just_refreshed = (
        wallet.modified_at is not None and now - wallet.modified_at < REFRESH_SETTLE
    )
    if wallet.expires_at - now > REFRESH_AHEAD and not (
        force_refresh and not just_refreshed
    ):
        return current
    if not configured():
        log.warning("desktop.link.refresh_failed", reason="not_configured")
        if wallet.expires_at > now:
            return current
        raise LinkUnavailable()
    try:
        tokens = await _token_call(
            {"grant_type": "refresh_token", "refresh_token": refresh}
        )
    except LinkTokenError as error:
        if error.grant_gone:
            log.info(
                "desktop.link.grant_gone", user_id=str(user_id), status=error.status
            )
            await repository.delete_for_user(user_id)
            return None
        log.warning(
            "desktop.link.refresh_failed",
            user_id=str(user_id),
            status=error.status,
            error=error.code,
        )
        if wallet.expires_at > now:
            return current
        raise LinkUnavailable() from error
    except httpx.HTTPError as error:
        log.warning(
            "desktop.link.refresh_failed",
            user_id=str(user_id),
            reason=type(error).__name__,
        )
        if wallet.expires_at > now:
            return current
        raise LinkUnavailable() from error
    _keep(wallet, tokens)
    wallet.set_modified_at()
    # Link has already spent the refresh token it was sent: the new one is
    # written now, before anything else in this request can fail.
    await session.flush()
    log.info("desktop.link.refreshed", user_id=str(user_id))
    return AccessGrant(tokens.access_token, wallet.expires_at, wallet.scope)


async def disconnect(session: AsyncSession, user_id: UUID) -> dict[str, bool]:
    """Ends the person's Link connection: revoked at Link, then forgotten
    here. The row goes even when Link can't be reached (the person asked
    for it to go); the log says so."""
    repository = LinkWalletRepository.from_session(session)
    wallet = await repository.for_user(user_id, lock=True)
    if wallet is None:
        return {"disconnected": False, "revoked": False}
    refresh = unseal(wallet.refresh_token, purpose=_SEALED)
    revoked = False
    if refresh is not None and configured():
        revoked = await revoke(refresh)
    await repository.delete_for_user(user_id)
    log.info("desktop.link.disconnected", user_id=str(user_id), revoked=revoked)
    return {"disconnected": True, "revoked": revoked}


# --- routes -------------------------------------------------------------------


def _not_configured() -> JSONResponse:
    return JSONResponse(
        {"error": "Link can't be connected here yet.", "configured": False},
        status_code=503,
    )


def _connected_page(*, failed: bool) -> RedirectResponse:
    path = "/desktop/apps/connected" + ("?status=failed" if failed else "")
    return RedirectResponse(
        f"{settings.BASE_URL.rstrip('/')}{path}",
        status_code=302,
        headers={"cache-control": "no-store"},
    )


@router.get("/api/link/status", name="desktop:link_status")
async def link_status(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    wallet = await LinkWalletRepository.from_session(session).for_user(
        desktop_session.user_id
    )
    return JSONResponse(
        {
            "configured": configured(),
            "connected": wallet is not None,
            "scope": wallet.scope if wallet is not None else None,
        }
    )


@router.post("/api/link/start", name="desktop:link_start")
async def link_start(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    if not configured():
        return _not_configured()
    verifier = secrets.token_urlsafe(64)
    state = await _remember(redis, desktop_session.user_id, verifier)
    log.info("desktop.link.sign_in_started", user_id=str(desktop_session.user_id))
    return JSONResponse(
        {"configured": True, "url": start_url(authorize_url(state, verifier))}
    )


@router.get("/apps/link/callback", name="desktop:link_callback")
async def link_callback(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> RedirectResponse:
    taken = await _take(redis, request.query_params.get("state"))
    if taken is None:
        log.info("desktop.link.callback_refused", reason="state")
        return _connected_page(failed=True)
    user_id, verifier = taken
    error = request.query_params.get("error")
    code = request.query_params.get("code")
    if error or not code:
        log.info(
            "desktop.link.sign_in_declined",
            user_id=str(user_id),
            error=error or "no_code",
            description=request.query_params.get("error_description"),
        )
        return _connected_page(failed=True)
    if not configured():
        log.warning("desktop.link.callback_refused", reason="not_configured")
        return _connected_page(failed=True)
    try:
        tokens = await _token_call(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri(),
                "code_verifier": verifier,
            }
        )
        await connect(session, user_id, tokens)
    except LinkTokenError as failure:
        log.warning(
            "desktop.link.exchange_failed",
            user_id=str(user_id),
            status=failure.status,
            error=failure.code,
        )
        return _connected_page(failed=True)
    except httpx.HTTPError as failure:
        log.warning(
            "desktop.link.exchange_failed",
            user_id=str(user_id),
            reason=type(failure).__name__,
        )
        return _connected_page(failed=True)
    log.info("desktop.link.connected", user_id=str(user_id), scope=tokens.scope)
    return _connected_page(failed=False)


@router.post("/api/link/token", name="desktop:link_token")
async def link_token(
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    if not desktop_session.is_box_credential:
        return JSONResponse(
            {"error": "Only your cloud computer uses Link's token."}, status_code=403
        )
    try:
        body = json.loads(await request.body() or b"{}")
    except ValueError:
        body = {}
    force = isinstance(body, dict) and body.get("refresh") is True
    try:
        grant = await access_for(session, desktop_session.user_id, force_refresh=force)
    except LinkUnavailable:
        return JSONResponse({"error": "Link could not be reached."}, status_code=502)
    headers = {"cache-control": "no-store"}
    if grant is None:
        return JSONResponse({"connected": False}, headers=headers)
    return JSONResponse(
        {
            "connected": True,
            "accessToken": grant.access_token,
            "expiresAtMs": int(grant.expires_at.timestamp() * 1000),
            "scope": grant.scope,
        },
        headers=headers,
    )


@router.delete("/api/link", name="desktop:link_disconnect")
async def link_disconnect(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    return JSONResponse(await disconnect(session, desktop_session.user_id))


__all__ = ["access_for", "configured", "disconnect", "router"]
