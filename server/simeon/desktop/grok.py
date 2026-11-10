"""Grok on the person's own SuperGrok or X Premium plan (10 November 2026).

The founder: "now we need to bring meta and grok - both should be the same
as chat gpt", then "No api key. Sign in." and "lets do grok". The person
signs in with xAI's device code, as Grok Build signs in (xai-org/grok-build,
Apache-2.0, `crates/codegen/xai-grok-login`), under Grok Build's public
client id, the one Hermes and OpenCode sign in with too, each with
its own `referrer` (`settings.GROK_REFERRER`, Simeon's). When xAI gives
Simeon a client id of its own, only `settings.GROK_CLIENT_ID` changes. The
steps, read from Grok Build's code:

- `POST {auth}/oauth2/device/code`, a form `{client_id, scope, referrer}`:
  the code for the person (`user_code`), the page to enter it on
  (`verification_uri`, with the code already in it as
  `verification_uri_complete`), the sign-in's `device_code` and how often
  to ask. A 404 means xAI has device sign-in off.
- `POST {auth}/oauth2/token`, a form with the device-code grant: OAuth's
  `authorization_pending` until the person approves (`slow_down`: five
  seconds more between questions), then the ID, access and refresh tokens.
  `access_denied` and `expired_token` end it.
- Who: the ID token's `sub` and `email`; the plan, the access token's
  `tier` (0 Free, 1 SuperGrok, 2 X Basic, 3 X Premium, 4 X Premium+, 5
  SuperGrok Heavy, 6 SuperGrok Lite, 7 SuperGrok Plus).
- Whether the plan may use Grok here: `GET {proxy}/settings`'s
  `allow_access`, the gate Grok Build's own paywall reads. A plan it bars
  is refused at once (`not_allowed`), never kept to fail at the first turn.
- Refresh: `POST {auth}/oauth2/token`, `grant_type=refresh_token` (with the
  team the person chose, for a team's sign-in). xAI rotates the refresh
  token; `invalid_grant` and `invalid_client` mean the sign-in is over.
- Revoke: `POST {auth}/oauth2/revoke` (OAuth's own, RFC 7009). Grok Build
  only forgets its tokens; Simeon ends the sign-in at xAI as well.
- The agents' calls: `POST {proxy}/responses` with Grok Build's headers
  (`headers`), the Responses wire both of its models use.
- How much of the plan is used: `GET {proxy}/billing?format=credits`, the
  share of the week's (or month's) credits used and when the period ends
  (`usage`). Out of credits: 402, or 403 or 429 saying so (`out_of_credits`).

Nothing here logs a token or a code. Read from the code only: none of it
has met xAI's real servers in a test.
"""

from __future__ import annotations

import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

import httpx
import structlog

from simeon.config import settings

from .model_sign_in import (
    ProviderError,
    SignInTokens,
    claims,
    error_code,
    tokens_of,
)

log = structlog.get_logger()

PROVIDER = "grok"
#: What Simeon asks xAI for: who the person is, a refresh token, the model
#: calls (`grok-cli:access`, which the proxy reads) and pictures on xAI's
#: API (`api:access`). Grok Build also asks for its conversations and
#: workspaces, which Simeon has no use for.
SCOPES = "openid profile email offline_access grok-cli:access api:access"
#: The access token's `tier`, as Grok Build names it (`jwt_tier_claim`).
TIERS = {
    0: "free",
    1: "supergrok",
    2: "x_basic",
    3: "x_premium",
    4: "x_premium_plus",
    5: "supergrok_heavy",
    6: "supergrok_lite",
    7: "supergrok_plus",
}
#: Where xAI may send the person to approve: its own sites, over https.
_APPROVAL_HOSTS = ("x.ai", "grok.com")
#: How long a started sign-in waits, when xAI doesn't say (Grok Build's).
DEFAULT_EXPIRES_IN = 600
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)
#: A billing question never holds an answer up for long.
_BILLING_TIMEOUT = httpx.Timeout(6.0, connect=4.0)


class GrokError(ProviderError):
    """xAI refused a sign-in call."""

    #: Grok Build's `refresh.rs`: the sign-in is over.
    gone_codes = frozenset({"invalid_grant", "invalid_client"})
    provider_name = "xAI"


@dataclass(frozen=True)
class DeviceStart:
    device_code: str
    user_code: str
    verification_url: str
    interval: int
    expires_in: int


@dataclass(frozen=True)
class Waiting:
    """The person hasn't approved yet; `slower` when xAI asked to be asked
    less often."""

    slower: bool = False


def _auth_base() -> str:
    return settings.GROK_AUTH_BASE_URL.rstrip("/")


def proxy_base() -> str:
    return settings.GROK_PROXY_BASE_URL.rstrip("/")


def api_base() -> str:
    return settings.GROK_API_BASE_URL.rstrip("/")


def _approval_url(body: dict[str, Any]) -> str | None:
    """The page the person approves on: the one with the code already in it
    when xAI gives it, else the plain one; only ever one of xAI's own."""
    for key in ("verification_uri_complete", "verification_uri"):
        value = body.get(key)
        if not isinstance(value, str):
            continue
        parts = urlsplit(value)
        host = (parts.hostname or "").lower()
        if parts.scheme == "https" and any(
            host == one or host.endswith(f".{one}") for one in _APPROVAL_HOSTS
        ):
            return value
    return None


async def _form(path: str, form: dict[str, str]) -> httpx.Response:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        return await client.post(
            f"{_auth_base()}{path}",
            data=form,
            headers={
                "x-grok-client-version": settings.GROK_CLIENT_VERSION,
                "x-grok-client-surface": "ui",
            },
        )


async def request_device_code() -> DeviceStart:
    response = await _form(
        "/oauth2/device/code",
        {
            "client_id": settings.GROK_CLIENT_ID,
            "scope": SCOPES,
            "referrer": settings.GROK_REFERRER,
        },
    )
    if response.status_code == 404:
        raise GrokError(404, "device_code_off")
    if not response.is_success:
        raise GrokError(response.status_code, error_code(response))
    try:
        body = response.json()
    except ValueError as error:
        raise GrokError(response.status_code, "no_code") from error
    if not isinstance(body, dict):
        raise GrokError(response.status_code, "no_code")
    device_code = body.get("device_code")
    user_code = body.get("user_code")
    url = _approval_url(body)
    if not isinstance(device_code, str) or not isinstance(user_code, str) or not url:
        raise GrokError(response.status_code, "no_code")
    if not user_code.isprintable() or len(user_code) > 32:
        # Grok Build guards against an issuer's control characters too.
        raise GrokError(response.status_code, "no_code")
    return DeviceStart(
        device_code=device_code,
        user_code=user_code,
        verification_url=url,
        interval=_seconds(body.get("interval"), 5, low=1, high=60),
        expires_in=_seconds(
            body.get("expires_in"), DEFAULT_EXPIRES_IN, low=60, high=3600
        ),
    )


def _seconds(value: Any, default: int, *, low: int, high: int) -> int:
    try:
        number = int(str(value).strip()) if value is not None else default
    except ValueError:
        number = default
    return max(low, min(high, number))


async def poll_device_code(device_code: str) -> SignInTokens | Waiting:
    """The sign-in's tokens once the person approved; `Waiting` until then."""
    response = await _form(
        "/oauth2/token",
        {
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
            "client_id": settings.GROK_CLIENT_ID,
        },
    )
    if response.is_success:
        return tokens_of(response.json(), GrokError)
    code = error_code(response)
    if code == "authorization_pending":
        return Waiting()
    if code == "slow_down":
        return Waiting(slower=True)
    raise GrokError(response.status_code, code)


def _principal(access_token: str | None) -> dict[str, str]:
    """The team the person chose on xAI's consent page, which a team's
    refresh names again (Grok Build's `peek_access_token_principal`)."""
    found = claims(access_token)
    kind = found.get("principal_type") or found.get("principalType")
    ident = found.get("principal_id") or found.get("principalId")
    if isinstance(kind, str) and kind and isinstance(ident, str) and ident:
        return {"principal_type": kind, "principal_id": ident}
    return {}


async def refresh(refresh_token: str, access_token: str | None) -> SignInTokens:
    response = await _form(
        "/oauth2/token",
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": settings.GROK_CLIENT_ID,
            **_principal(access_token),
        },
    )
    if not response.is_success:
        raise GrokError(response.status_code, error_code(response))
    return tokens_of(response.json(), GrokError)


async def revoke(refresh_token: str) -> bool:
    """Ends the sign-in at xAI. False when xAI could not be reached or
    refused; the caller forgets the tokens either way."""
    try:
        response = await _form(
            "/oauth2/revoke",
            {
                "token": refresh_token,
                "token_type_hint": "refresh_token",
                "client_id": settings.GROK_CLIENT_ID,
            },
        )
    except httpx.HTTPError as error:
        log.warning(
            "desktop.models.revoke_failed",
            provider=PROVIDER,
            reason=type(error).__name__,
        )
        return False
    if not response.is_success:
        log.warning(
            "desktop.models.revoke_failed",
            provider=PROVIDER,
            status=response.status_code,
        )
        return False
    return True


def identity(tokens: SignInTokens) -> tuple[str | None, str, str | None]:
    """The xAI account the sign-in is for, its e-mail and its plan."""
    id_claims = claims(tokens.id_token)
    access_claims = claims(tokens.access_token)
    subject = id_claims.get("sub") or access_claims.get("sub")
    email = id_claims.get("email") or access_claims.get("email") or ""
    tier = access_claims.get("tier")
    plan = (
        TIERS.get(tier, str(tier))
        if isinstance(tier, int) and not isinstance(tier, bool)
        else None
    )
    team = _principal(tokens.access_token)
    if team.get("principal_type", "").lower() == "team":
        # A team's sign-in is the team's: kept apart from the person's own.
        subject = f"team:{team['principal_id']}"
    return (str(subject) if subject else None, str(email), plan)


# --- the proxy Grok Build calls ---------------------------------------------------


def headers(
    access_token: str,
    *,
    model: str | None = None,
    accept: str = "text/event-stream",
    conversation: str | None = None,
) -> dict[str, str]:
    """The headers of Grok Build's calls to its proxy (`xai-grok-shell`,
    `agent/config.rs` and `xai-grok-sampler/src/client.rs`), Simeon named as
    the client (`x-grok-client-identifier`, which Grok Build lets a client
    set)."""
    sent = {
        "authorization": f"Bearer {access_token}",
        "x-xai-token-auth": settings.GROK_TOKEN_AUTH,
        "x-authenticateresponse": "authenticate-response",
        "x-grok-client-mode": "headless",
        "x-grok-client-version": settings.GROK_CLIENT_VERSION,
        "x-grok-client-identifier": settings.GROK_CLIENT_IDENTIFIER,
        "x-grok-req-id": str(uuid.uuid4()),
        "user-agent": f"{settings.GROK_CLIENT_IDENTIFIER}/1.0",
        "content-type": "application/json",
        "accept": accept,
    }
    if model:
        # The proxy routes on it (Grok Build's README).
        sent["x-grok-model-override"] = model
    if conversation:
        sent["x-grok-conv-id"] = conversation[:200]
    return sent


async def access_allowed(access_token: str) -> bool | None:
    """Whether xAI lets this plan use Grok here (`/settings`' `allow_access`);
    None when xAI didn't say (the sign-in is kept: its first call will tell)."""
    try:
        async with httpx.AsyncClient(timeout=_BILLING_TIMEOUT) as client:
            response = await client.get(
                f"{proxy_base()}/settings",
                headers=headers(access_token, accept="application/json"),
            )
    except httpx.HTTPError as error:
        log.warning("desktop.models.grok_settings_failed", reason=type(error).__name__)
        return None
    if response.status_code in (401, 402, 403):
        return False
    if not response.is_success:
        log.warning("desktop.models.grok_settings_failed", status=response.status_code)
        return None
    try:
        body = response.json()
    except ValueError:
        return None
    allowed = body.get("allow_access") if isinstance(body, dict) else None
    return allowed if isinstance(allowed, bool) else None


def out_of_credits(status: int | None, body: bytes | str | None) -> bool:
    """The plan's credits used up (Grok Build's `billing.rs`): 402 always; a
    403 or 429 when xAI says so in its words."""
    if status == 402:
        return True
    if status not in (403, 429) or not body:
        return False
    text = (body.decode(errors="replace") if isinstance(body, bytes) else body).lower()
    return "out of credits" in text or "spending-limit" in text


def failed_out_of_credits(response: Mapping[str, Any] | None) -> bool:
    """A streamed answer that ended because the credits ran out."""
    if not isinstance(response, Mapping):
        return False
    error = response.get("error")
    if not isinstance(error, Mapping):
        return False
    words = " ".join(str(error.get(key) or "") for key in ("code", "message"))
    return out_of_credits(429, words)


@dataclass(frozen=True)
class Credits:
    """The plan's credits, as `/billing` says: the usage window the apps
    show and when the period ends."""

    window: dict[str, Any] | None
    period_end: datetime | None


def _when(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def credits_of(body: Any) -> Credits | None:
    """`/billing?format=credits` read: the share of the period's credits
    used and the period, weekly or monthly (`USAGE_PERIOD_TYPE_WEEKLY`…)."""
    config = body.get("config") if isinstance(body, dict) else None
    if not isinstance(config, dict):
        return None
    period = config.get("currentPeriod")
    period = period if isinstance(period, dict) else {}
    end = _when(period.get("end")) or _when(config.get("billingPeriodEnd"))
    kind_name = str(period.get("type") or "").upper()
    kind = "monthly" if "MONTH" in kind_name else "weekly"
    used = config.get("creditUsagePercent")
    if not isinstance(used, int | float) or isinstance(used, bool):
        limit = (config.get("monthlyLimit") or {}).get("val")
        spent = (config.get("used") or {}).get("val")
        used = (
            100.0 * spent / limit
            if isinstance(limit, int | float)
            and isinstance(spent, int | float)
            and limit > 0
            else None
        )
        if used is not None and not period.get("type"):
            kind = "monthly"
    window = (
        {
            "kind": kind,
            "usedPercent": round(min(max(float(used), 0.0), 1000.0), 1),
            "resetsAt": int(end.timestamp() * 1000) if end is not None else None,
            "minutes": None,
        }
        if used is not None
        else None
    )
    if window is None and end is None:
        return None
    return Credits(window=window, period_end=end)


async def credits(access_token: str, account_key: str) -> Credits | None:
    """The plan's credits, or None when xAI didn't say."""
    sent = headers(access_token, accept="application/json")
    if not account_key.startswith("team:"):
        sent["x-userid"] = account_key
    try:
        async with httpx.AsyncClient(timeout=_BILLING_TIMEOUT) as client:
            response = await client.get(
                f"{proxy_base()}/billing", params={"format": "credits"}, headers=sent
            )
    except httpx.HTTPError as error:
        log.warning("desktop.models.grok_billing_failed", reason=type(error).__name__)
        return None
    if not response.is_success:
        log.warning("desktop.models.grok_billing_failed", status=response.status_code)
        return None
    try:
        return credits_of(response.json())
    except ValueError:
        return None
