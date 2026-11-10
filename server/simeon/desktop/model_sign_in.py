"""What every provider's sign-in shares (10 November 2026, when Grok joined
ChatGPT): the tokens a sign-in ends with, a provider's refusal and whether it
ends the sign-in, and a token's claims. ChatGPT's steps are in
`model_accounts.py`, Grok's in `grok.py`.

Nothing here logs a token or a code.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from simeon.kit.utils import utc_now


@dataclass(frozen=True)
class SignInTokens:
    """A provider's answer to a sign-in or a refresh."""

    id_token: str | None
    access_token: str
    refresh_token: str | None
    #: Seconds the access token lasts, where the provider says it (OAuth's
    #: `expires_in`); its own `exp` claim is read first.
    expires_in: int | None = None


class ProviderError(Exception):
    """A provider refused a sign-in call: its HTTP status and error code."""

    #: The provider's codes for a sign-in that is over: the person connects again.
    gone_codes: frozenset[str] = frozenset({"invalid_grant"})
    provider_name = "The provider"

    def __init__(self, status: int, code: str | None) -> None:
        super().__init__(f"{self.provider_name} answered {status} {code or ''}".strip())
        self.status = status
        self.code = code

    @property
    def sign_in_gone(self) -> bool:
        return self.code in self.gone_codes


class RefreshUnavailable(Exception):
    """The provider could not refresh an access token that has run out."""


def error_code(response: httpx.Response) -> str | None:
    """A provider's error code, from `{"error": {"code": …}}` (OpenAI's) or
    OAuth's `{"error": "…"}`."""
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
    """A JWT's claims, unverified: the token comes straight from the
    provider over TLS, and only says whose it is and when it ends."""
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


def expiry(access_token: str, expires_in: int | None = None) -> datetime | None:
    """When the access token ends: its `exp` claim, else `expires_in` from now."""
    exp = claims(access_token).get("exp")
    if isinstance(exp, int | float):
        return datetime.fromtimestamp(exp, tz=UTC)
    if expires_in is not None and expires_in > 0:
        return utc_now() + timedelta(seconds=expires_in)
    return None


def tokens_of(body: Any, error: type[ProviderError]) -> SignInTokens:
    """The tokens of a provider's answer; `error` when it holds none."""
    if not isinstance(body, dict) or not isinstance(body.get("access_token"), str):
        raise error(200, "no_access_token")
    refresh = body.get("refresh_token")
    id_token = body.get("id_token")
    lasts = body.get("expires_in")
    return SignInTokens(
        id_token=id_token if isinstance(id_token, str) else None,
        access_token=body["access_token"],
        refresh_token=refresh if isinstance(refresh, str) and refresh else None,
        expires_in=int(lasts)
        if isinstance(lasts, int | float) and not isinstance(lasts, bool)
        else None,
    )
