"""The iPhone's own Google sign-in (12 October 2026).

The founder found the web sign-in's confirmation page ("Continue as …")
after Google's account picker a duplicate. The iPhone now signs in with
Google itself, as it does with Apple: it opens Google's own page in
`ASWebAuthenticationSession` with its own OAuth client (type iOS, no
secret) and a PKCE challenge, Google sends the code back to the app on the
client's reversed id, and the app posts the code and its verifier to
`POST /auth/google`. The server trades them with Google for an access
token, reads the person from Google's userinfo, and finds or makes the
account exactly as the web's Google sign-in does (`google.service`), so
the same Google account is the same Simeon account on the iPhone, the Mac
and the web.

The code is useless without the verifier, which never leaves the app that
asked for it, so nobody else's link can hand over the account: what the
web page's confirmation step guards against cannot happen here.

Set up: an OAuth client of type iOS in the Google Cloud project of the web
client, with the iPhone app's bundle id; its id as `GOOGLE_IOS_CLIENT_ID`.
"""

from __future__ import annotations

import httpx
import structlog
from httpx_oauth.oauth2 import OAuth2Token

from simeon.config import settings

log = structlog.get_logger()

TOKEN_URL = "https://oauth2.googleapis.com/token"
AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
#: What the app asks Google for: who the person is, nothing else.
SCOPES = "openid email profile"
_SUFFIX = ".apps.googleusercontent.com"


class NativeGoogleError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def client_id() -> str:
    return settings.GOOGLE_IOS_CLIENT_ID.strip()


def redirect_uri() -> str | None:
    """Google's redirect for an iOS client: the client id reversed, as a
    URL scheme, `com.googleusercontent.apps.<number-hash>:/oauthredirect`."""
    client = client_id()
    if not client.endswith(_SUFFIX):
        return None
    return f"com.googleusercontent.apps.{client.removesuffix(_SUFFIX)}:/oauthredirect"


def config() -> dict[str, str] | None:
    """What the app needs to open Google's page, or None when the iOS
    client is not set up (the app then uses the web sign-in)."""
    redirect = redirect_uri()
    if redirect is None:
        return None
    return {
        "clientId": client_id(),
        "redirectUri": redirect,
        "authorizeUrl": AUTHORIZE_URL,
        "scope": SCOPES,
    }


async def exchange_code(code: str, code_verifier: str) -> OAuth2Token:
    """Google's tokens for the app's code and verifier."""
    redirect = redirect_uri()
    if redirect is None:
        raise NativeGoogleError("Google sign-in isn't set up for the iPhone yet.")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                TOKEN_URL,
                data={
                    "code": code,
                    "client_id": client_id(),
                    "code_verifier": code_verifier,
                    "redirect_uri": redirect,
                    "grant_type": "authorization_code",
                },
            )
    except httpx.HTTPError as error:
        log.warning("google_native.unreachable", error=str(error))
        raise NativeGoogleError("Google couldn't be reached. Try again.") from error
    if response.status_code != 200:
        log.warning(
            "google_native.exchange_refused",
            status=response.status_code,
            body=response.text[:300],
        )
        raise NativeGoogleError("Google sign-in didn't finish. Try again.")
    data = response.json()
    if not isinstance(data, dict) or not data.get("access_token"):
        raise NativeGoogleError("Google sign-in didn't finish. Try again.")
    # `expires_in` becomes `expires_at`, which the account keeps.
    token = OAuth2Token(dict(data))
    token.setdefault("expires_at", None)
    return token


__all__ = [
    "NativeGoogleError",
    "client_id",
    "config",
    "exchange_code",
    "redirect_uri",
]
