"""A connected app's sign-in finished by the app that opened it (15 October
2026).

The founder: "why it needs the web account? When all this came from the
app". A vendor's sign-in comes back to `/desktop/mcp-oauth/callback`,
which until now always sent it on to the web app's `/app/connected.html`;
that page finished it on the computer of whichever account the browser was
signed in to, not the app's, and failed when they differed. Now the iPhone
or Mac app names the sign-in before it opens the sheet
(`POST /desktop/api/mcp-oauth/return`, the `state` from the vendor's link
and the app's own URL scheme), and the callback sends that one back to the
app (`simeon-ios://mcp-oauth?state=…&code=…`). The sheet closes on it and
the app hands the code to its own computer (`completeMcpOAuth`). A sign-in
no app named still goes to the web page, as the web app needs.

The code is single-use and bound to the PKCE verifier only the computer
holds, so handing it to the app's scheme gives a bystander nothing.
"""

from __future__ import annotations

import hashlib
from typing import Literal

import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from simeon.models import DesktopSession
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter

from .auth import get_desktop_session

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

#: As long as the computer keeps the sign-in (15 minutes), and a little more.
RETURN_TTL_SECONDS = 20 * 60

#: The apps' own URL schemes (`SimeonConfig.urlScheme`, `.macURLScheme`).
AppScheme = Literal["simeon", "simeon-ios"]

#: Where the sign-in lands in the app: `<scheme>://mcp-oauth?…`.
APP_RETURN_HOST = "mcp-oauth"


def _key(state: str) -> str:
    return f"desktop:mcp-oauth-return:{hashlib.sha256(state.encode()).hexdigest()}"


class ReturnBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    state: str = Field(min_length=8, max_length=512)
    back: AppScheme


@router.post("/api/mcp-oauth/return", name="desktop:mcp_oauth_return")
async def remember_return(
    body: ReturnBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """The app is about to open this sign-in: send its answer back here."""
    await redis.set(_key(body.state), body.back, ex=RETURN_TTL_SECONDS)
    log.info(
        "desktop.mcp_oauth.return_registered",
        user_id=str(desktop_session.user_id),
        back=body.back,
    )
    return JSONResponse({"code": 0, "data": {"ok": True}})


async def app_return_for(redis: Redis, state: str) -> str | None:
    """The app scheme a sign-in goes back to, once; None for one no app
    named (the web app's)."""
    if not state:
        return None
    key = _key(state)
    scheme = await redis.get(key)
    if scheme is None:
        return None
    await redis.delete(key)
    value = scheme.decode() if isinstance(scheme, bytes) else str(scheme)
    return value if value in ("simeon", "simeon-ios") else None
