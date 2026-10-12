"""Sign in with Apple from the iPhone app's own sheet (12 October 2026).

The iPhone shows Apple's sheet (Face ID, the person's Apple ID) instead of
a web page. The sheet hands the app an identity token Apple signed for the
app's bundle id, an authorization code, and, the first time only, the
person's name. The app sends them to `POST /auth/apple`
(`simeon.desktop.app_sign_in`), which:

1. checks the token with Apple's keys, for `SIMEON_APPLE_BUNDLE_ID` and
   Apple's issuer, and that it carries the hash of the nonce the app made
   for this one sign-in (so a token from somewhere else cannot be replayed);
2. trades the code with Apple for the person's Apple tokens, kept on their
   Apple sign-in so deleting the account can revoke them, as Apple asks;
3. signs the person in as the web's Sign in with Apple does (the same
   account for the same Apple ID, whichever way they came in).

The web's Sign in with Apple (`service.py`) speaks for the Services ID
(`SIMEON_APPLE_CLIENT_ID`); this speaks for the app itself. The same key
(`SIMEON_APPLE_KEY_ID`, `_KEY_VALUE`) signs both, as Apple's key belongs to
the app's primary App ID.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
import structlog

from simeon.config import settings
from simeon.exceptions import PolarError
from simeon.kit.utils import utc_now
from simeon.models import OAuthAccount

from .service import AppleUserProfile, jwks_client

log = structlog.get_logger()

APPLE = "https://appleid.apple.com"


class NativeAppleError(PolarError):
    def __init__(self) -> None:
        super().__init__("Sign in with Apple couldn't be checked. Try again.", 400)


def nonce_hash(raw: str) -> str:
    """What the app puts in Apple's request, and Apple puts in the token:
    the SHA-256 of the nonce, in hex. The app sends the nonce itself."""
    return hashlib.sha256(raw.encode()).hexdigest()


def _truthy(value: Any) -> bool:
    # Apple writes `email_verified` as a boolean or as the string "true".
    return value is True or (isinstance(value, str) and value.lower() == "true")


def _decode(identity_token: str, nonce: str) -> AppleUserProfile:
    try:
        key = jwks_client.get_signing_key_from_jwt(identity_token)
        claims = jwt.decode(
            identity_token,
            key=key,
            algorithms=["RS256"],
            audience=settings.APPLE_BUNDLE_ID,
            issuer=APPLE,
        )
    except jwt.PyJWTError as error:
        log.warning("integrations.apple.native.unverified", reason=str(error))
        raise NativeAppleError() from error
    if not nonce or not hmac.compare_digest(
        str(claims.get("nonce") or ""), nonce_hash(nonce)
    ):
        log.warning("integrations.apple.native.nonce")
        raise NativeAppleError()
    email = claims.get("email")
    if not isinstance(email, str) or "@" not in email:
        log.warning("integrations.apple.native.no_email", sub=claims.get("sub"))
        raise NativeAppleError()
    return {
        "id": str(claims["sub"]),
        "email": email,
        "email_verified": _truthy(claims.get("email_verified")),
    }


async def decode_identity_token(identity_token: str, nonce: str) -> AppleUserProfile:
    """The person Apple vouches for. Apple's keys are fetched over the
    network, so the check runs in a thread."""
    return await asyncio.to_thread(_decode, identity_token, nonce)


def client_secret(client_id: str) -> str:
    """Apple's client secret: a short-lived JWT signed with our key."""
    issued = int(utc_now().timestamp())
    return jwt.encode(
        {
            "iss": settings.APPLE_TEAM_ID,
            "aud": APPLE,
            "sub": client_id,
            "iat": issued,
            "exp": issued + 600,
        },
        settings.APPLE_KEY_VALUE,
        algorithm="ES256",
        headers={"kid": settings.APPLE_KEY_ID},
    )


def can_call_apple() -> bool:
    return all(
        (settings.APPLE_TEAM_ID, settings.APPLE_KEY_ID, settings.APPLE_KEY_VALUE)
    )


@dataclass
class AppleTokens:
    access_token: str
    refresh_token: str | None
    expires_at: int | None


async def exchange_code(code: str) -> AppleTokens | None:
    """The person's Apple tokens for the app's code, or None (no key on
    the server, or Apple refused): signing in goes on without them, as the
    identity token alone says who it is."""
    if not code or not can_call_apple():
        return None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{APPLE}/auth/token",
                data={
                    "client_id": settings.APPLE_BUNDLE_ID,
                    "client_secret": client_secret(settings.APPLE_BUNDLE_ID),
                    "code": code,
                    "grant_type": "authorization_code",
                },
            )
    except httpx.HTTPError as error:
        log.warning("integrations.apple.native.code_failed", error=str(error))
        return None
    if response.status_code != 200:
        log.warning(
            "integrations.apple.native.code_refused",
            status=response.status_code,
            body=response.text[:200],
        )
        return None
    data = response.json()
    expires_in = data.get("expires_in")
    return AppleTokens(
        access_token=str(data.get("access_token") or ""),
        refresh_token=data.get("refresh_token") or None,
        expires_at=int(utc_now().timestamp()) + int(expires_in)
        if isinstance(expires_in, int)
        else None,
    )


async def revoke(account: OAuthAccount) -> bool:
    """Apple's revocation of one Apple sign-in, for Delete Account. The
    token came either from the app (the bundle id) or from the web (the
    Services ID); Apple refuses the wrong one, so both are tried. True
    once Apple accepts, or when there is nothing to revoke."""
    token = account.refresh_token or account.access_token
    if not token:
        return True
    if not can_call_apple():
        return False
    hint = "refresh_token" if account.refresh_token else "access_token"
    clients = [c for c in (settings.APPLE_BUNDLE_ID, settings.APPLE_CLIENT_ID) if c]
    async with httpx.AsyncClient(timeout=10.0) as client:
        for client_id in clients:
            try:
                response = await client.post(
                    f"{APPLE}/auth/revoke",
                    data={
                        "client_id": client_id,
                        "client_secret": client_secret(client_id),
                        "token": token,
                        "token_type_hint": hint,
                    },
                )
            except httpx.HTTPError:
                continue
            if response.status_code == 200:
                return True
    return False


__all__ = [
    "AppleTokens",
    "NativeAppleError",
    "can_call_apple",
    "client_secret",
    "decode_identity_token",
    "exchange_code",
    "nonce_hash",
    "revoke",
]
