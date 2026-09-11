"""The four connector routes, and the proxy the whole design rests on.

`docs/maties/connectors.md`, section 4. They hang off the desktop app's
router, so they come out under the address the app already talks to:

```
GET    /desktop/api/connectors
         -> { "entitled": true, "connections": [ { slug, accountId, connectedAt } ] }

POST   /desktop/api/connectors/{slug}/link
         -> { "url": "…", "expiresAt": "…" }

DELETE /desktop/api/connectors/{accountId}
         -> 204

ANY    /desktop/api/connectors/mcp/{slug}
         -> the MCP conversation, proxied
```

Every one of them answers 402 when the person is not entitled and 503
when Claidor has no connection service configured at all. The gate is
here rather than in the app because an app can be patched and a server
cannot (section 5).

**Why any of this is a proxy.** The provider's developer token is
project-wide: whoever holds it can name any external user id in a header
and reach that person's accounts. So the desktop app holds only its own
Claidor session token, and this module adds the developer credential and
pins the external user id to the person that session belongs to. The
single most important line in the file is in `mcp`, where the target's
headers are applied *after* anything copied from the request, and the
request's query string is dropped: a client that could set
`x-pd-external-user-id` — as a header or, since the provider reads both,
as a query parameter — could read every customer we have.
"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator
from typing import Any

import httpx
import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from polar.desktop.auth import get_desktop_session
from polar.models import DesktopSession, User
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.redis import Redis, get_redis
from polar.routing import APIRouter

from .provider import (
    ConnectorNotFound,
    ConnectorProvider,
    ConnectorsNotConfigured,
    ConnectorUpstreamError,
)
from .service import connectors

log = structlog.get_logger()

router = APIRouter(prefix="/api/connectors", tags=["desktop", APITag.private])

#: An app slug and an account id both end up in a header or a URL we
#: build, so both are checked against a shape before they are used at
#: all. A carriage return in a slug is header injection; a slash in an
#: account id is a different endpoint.
SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
ACCOUNT_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

#: The only request headers the MCP proxy carries upstream. An allowlist
#: rather than a blocklist: a header we have not thought about must not
#: reach the provider, and `authorization`, `cookie` and anything
#: `x-pd-*` are exactly what must never be forwarded.
MCP_FORWARDED_REQUEST_HEADERS = frozenset(
    {
        "accept",
        "content-type",
        "mcp-session-id",
        "mcp-protocol-version",
        "last-event-id",
    }
)
#: What comes back. The session id is how a streamable-HTTP client keeps
#: one conversation, so losing it would break every call after the first.
MCP_FORWARDED_RESPONSE_HEADERS = frozenset({"mcp-session-id"})

#: A tool call can be a slow third-party API; the connect is not.
MCP_TIMEOUT = httpx.Timeout(600.0, connect=30.0)


# --- refusals ---------------------------------------------------------------


def _not_configured() -> JSONResponse:
    return JSONResponse(
        {"detail": "Connections are not configured on this Claidor."}, status_code=503
    )


def _not_entitled(extra: dict[str, Any] | None = None) -> JSONResponse:
    return JSONResponse(
        {
            "entitled": False,
            "detail": "Connections are part of a paid plan.",
            **(extra or {}),
        },
        status_code=402,
    )


def _bad_request(detail: str) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=400)


def _upstream(error: ConnectorUpstreamError) -> JSONResponse:
    """Their trouble, told plainly and without their status.

    A 401 from the provider means *our* credential is wrong, not the
    person's, so handing their status straight through would make the
    app sign the person out over a mistake they cannot fix.
    """
    log.warning("connectors.upstream", status=error.status, message=str(error))
    return JSONResponse({"detail": str(error)}, status_code=502)


async def _gate(session: AsyncSession, user: User) -> JSONResponse | None:
    """503, 402, or nothing in the way."""
    if not connectors.configured:
        return _not_configured()
    if not await connectors.entitled(session, user):
        return _not_entitled()
    return None


# --- the four routes --------------------------------------------------------


@router.get("", name="desktop:connectors_list", response_model=None)
async def list_connections(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """What this person has connected, and whether they may connect more.

    The body carries `entitled` in both cases, so an app that only reads
    the body still draws the right shelf; the status is what a patched
    one cannot argue with.
    """
    user = desktop_session.user
    if not connectors.configured:
        return _not_configured()
    if not await connectors.entitled(session, user):
        return _not_entitled({"connections": []})
    provider = connectors.provider(redis)
    try:
        found = await connectors.connections(redis, provider, user)
    except ConnectorsNotConfigured:
        return _not_configured()
    except ConnectorUpstreamError as error:
        return _upstream(error)
    return JSONResponse(
        {
            "entitled": True,
            "connections": [
                {
                    "slug": connection.slug,
                    "accountId": connection.account_id,
                    "connectedAt": (
                        connection.connected_at.isoformat()
                        if connection.connected_at is not None
                        else None
                    ),
                }
                for connection in found
            ],
        }
    )


# Declared before `/{slug}/link` on purpose: routes match in the order
# they are added, so with the link route first a POST to `…/mcp/link`
# would be read as « a link for the service called mcp ». Two fixed
# segments beat one, but only if they are offered first.
@router.api_route(
    "/mcp/{slug}",
    methods=["GET", "POST", "DELETE"],
    name="desktop:connectors_mcp",
    response_model=None,
)
async def mcp(
    slug: str,
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> Response:
    """The engine's MCP conversation for one service, forwarded.

    Read the module docstring before touching the header handling. The
    person this conversation is about is `desktop_session.user` and
    nothing in the request can say otherwise: what the client sent is
    filtered to an allowlist that contains no identity at all, the
    provider's headers are applied last, and the client's query string
    is not carried at all — the provider accepts its `x-pd-*` headers as
    query parameters too, so forwarding a query string would hand back
    the override the header allowlist just took away.
    """
    user = desktop_session.user
    refusal = await _gate(session, user)
    if refusal is not None:
        return refusal
    if not SLUG_PATTERN.match(slug):
        return _bad_request("That is not a service Claidor can connect.")

    provider: ConnectorProvider = connectors.provider(redis)
    try:
        target = await provider.mcp_target(user, slug)
    except ConnectorsNotConfigured:
        return _not_configured()
    except ConnectorUpstreamError as error:
        return _upstream(error)

    headers = {
        name: value
        for name, value in request.headers.items()
        if name.lower() in MCP_FORWARDED_REQUEST_HEADERS
    }
    # Last, and therefore final.
    headers.update(target.headers)

    body = await request.body()
    client = httpx.AsyncClient(timeout=MCP_TIMEOUT)
    upstream_request = client.build_request(
        request.method, target.url, headers=headers, content=body
    )
    try:
        upstream = await client.send(upstream_request, stream=True)
    except httpx.HTTPError as error:
        await client.aclose()
        log.warning("connectors.mcp.unreachable", error=str(error))
        return JSONResponse(
            {"detail": "The connection service could not be reached."}, status_code=502
        )

    async def relay() -> AsyncIterator[bytes]:
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        relay(),
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "application/json"),
        headers={
            name: value
            for name, value in upstream.headers.items()
            if name.lower() in MCP_FORWARDED_RESPONSE_HEADERS
        },
    )


@router.post("/{slug}/link", name="desktop:connectors_link", response_model=None)
async def link(
    slug: str,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    """An address to open a window on, good for a few hours and one use.

    Nothing is written down here: the person's identity at the provider
    is created by this call and by no other, which is what makes them
    cost money only once somebody actually clicks Connect (section 7).
    """
    user = desktop_session.user
    refusal = await _gate(session, user)
    if refusal is not None:
        return refusal
    if not SLUG_PATTERN.match(slug):
        return _bad_request("That is not a service Claidor can connect.")
    provider = connectors.provider(redis)
    try:
        connector_link = await provider.link(user, slug)
    except ConnectorsNotConfigured:
        return _not_configured()
    except ConnectorUpstreamError as error:
        return _upstream(error)
    # The window is about to create a connection we cannot see happen,
    # so what we last heard about this person is already out of date.
    await connectors.invalidate(redis, user)
    return JSONResponse(
        {"url": connector_link.url, "expiresAt": connector_link.expires_at.isoformat()}
    )


@router.delete(
    "/{account_id}", name="desktop:connectors_disconnect", response_model=None
)
async def disconnect(
    account_id: str,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> Response:
    """One connection, removed, from the same card that made it.

    Whether the account is this person's is decided by the provider
    against their own list, not by the id looking plausible.
    """
    user = desktop_session.user
    refusal = await _gate(session, user)
    if refusal is not None:
        return refusal
    if not ACCOUNT_ID_PATTERN.match(account_id):
        return _bad_request("That is not a connection Claidor can remove.")
    provider = connectors.provider(redis)
    try:
        await provider.disconnect(user, account_id)
    except ConnectorsNotConfigured:
        return _not_configured()
    except ConnectorNotFound:
        return JSONResponse({"detail": "This connection does not exist."}, 404)
    except ConnectorUpstreamError as error:
        return _upstream(error)
    await connectors.invalidate(redis, user)
    return Response(status_code=204)


__all__ = [
    "ACCOUNT_ID_PATTERN",
    "MCP_FORWARDED_REQUEST_HEADERS",
    "MCP_FORWARDED_RESPONSE_HEADERS",
    "SLUG_PATTERN",
    "router",
]
