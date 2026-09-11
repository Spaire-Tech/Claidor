"""Who the desktop app's caller is.

One bearer token, resolved one way. It lives here rather than beside the
routes because the connector routes (`polar.connectors.endpoints`) hang
off the same `/desktop` router and must authenticate a person exactly as
these do — the whole of `docs/maties/connectors.md` section 4 rests on
the server knowing, without argument, whose session a request carries.
A second way to answer that question would be a second way to get it
wrong.
"""

from fastapi import Depends, Request

from polar.models import DesktopSession
from polar.postgres import AsyncSession, get_db_session

from .service import DesktopUnauthenticated, desktop


def bearer_token(request: Request) -> str | None:
    """The app sends its access token as a bearer; the vendored client
    also has paths that send it as `x-api-key`, so both are read."""
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    api_key = request.headers.get("x-api-key", "").strip()
    return api_key or None


async def get_desktop_session(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> DesktopSession:
    token = bearer_token(request)
    if token is None:
        raise DesktopUnauthenticated()
    found = await desktop.authenticate(session, token)
    if found is None:
        raise DesktopUnauthenticated("This desktop session has expired.")
    return found


__all__ = ["bearer_token", "get_desktop_session"]
