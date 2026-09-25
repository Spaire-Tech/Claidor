"""The network path to a cloud box, served by the API (25 September 2026).

Cursor's pod proxy stood between the app and the box: per-port hostnames
(`<pod>-1340.…`, `<pod>-6080.…`, `<pod>-8790.…`), TLS, and a check of
`x-anyrun-network-token` on every request. This module is that proxy when
no TLS proxy of the founder's serves per-port hostnames
(`CLAIDOR_BOX_PUBLIC_URL_TEMPLATE` empty):

    https://api.simeonlabs.com/sand-box/{box_id}/p/{port}/{path}

for HTTP (the gateway's `/api/*`, its `/events` SSE stream, `/health`,
`/avatars`, and noVNC's `vnc.html` with its `app/`, `core/`, `vendor/`
assets) and for WebSocket (noVNC's `websockify` on 6080/6081, the egress
tunnel on 8790). The token is read where the app already sends it: the
`x-anyrun-network-token` header (the gateway client's descriptor headers;
the VNC webview's `beforeSendHeaders` in `vnc-trust.ts`) or the
`network_token` query parameter (the noVNC page and websockify URLs from
`buildSandBoxNoVncUrl`). The wake parameters `resume_lower_s` and
`resume_upper_s` pass through untouched, as every other parameter does.

`websockets` (a dependency of uvicorn, in the lockfile) dials the box;
`httpx` streams HTTP. Only the four box ports are proxied.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any
from uuid import UUID

import httpx
import structlog
from fastapi import Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed
from websockets.typing import Subprotocol

from polar.models import SandBox
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .box_hosts import BOX_PORTS
from .box_service import broker

log = structlog.get_logger()

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)

NETWORK_TOKEN_HEADER = "x-anyrun-network-token"
NETWORK_TOKEN_QUERY = "network_token"

#: Hop-by-hop headers, never forwarded either way.
HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "host",
        "content-length",
    }
)

BoxLookup = Callable[[AsyncSession, UUID, str], Awaitable[SandBox | None]]
_lookup: BoxLookup = broker.box_for_network_token


def _default_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(15.0, read=None, write=None, pool=None)
    )


_client_factory: Callable[[], httpx.AsyncClient] = _default_client


def set_lookup_for_tests(lookup: BoxLookup | None) -> None:
    global _lookup
    _lookup = lookup or broker.box_for_network_token


def set_client_factory_for_tests(
    factory: Callable[[], httpx.AsyncClient] | None,
) -> None:
    global _client_factory
    _client_factory = factory or _default_client


def read_network_token(headers: Any, query: Any) -> str:
    header = headers.get(NETWORK_TOKEN_HEADER, "")
    if header:
        return str(header).strip()
    return str(query.get(NETWORK_TOKEN_QUERY, "") or "").strip()


def upstream_target(box: SandBox, port: int) -> tuple[str, int] | None:
    if port not in BOX_PORTS:
        return None
    host_port = box.host_port(port)
    if host_port is None:
        return None
    return box.host_address, host_port


def forwardable(headers: Any) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in HOP_BY_HOP}


async def _resolve(
    db: AsyncSession, box_id: UUID, port: int, token: str
) -> tuple[SandBox, str, int] | JSONResponse:
    box = await _lookup(db, box_id, token)
    if box is None:
        return JSONResponse({"error": "network token refused"}, status_code=401)
    target = upstream_target(box, port)
    if target is None:
        return JSONResponse({"error": f"port {port} is not proxied"}, status_code=404)
    return box, target[0], target[1]


# --- HTTP ------------------------------------------------------------------------


async def _proxy_http(
    request: Request, box_id: UUID, port: int, path: str, db: AsyncSession
) -> Any:
    resolved = await _resolve(
        db, box_id, port, read_network_token(request.headers, request.query_params)
    )
    if isinstance(resolved, JSONResponse):
        return resolved
    _, host, host_port = resolved
    query = request.url.query
    url = f"http://{host}:{host_port}/{path}" + (f"?{query}" if query else "")
    client = _client_factory()
    upstream = client.build_request(
        request.method,
        url,
        headers=forwardable(request.headers),
        content=request.stream(),
    )
    try:
        response = await client.send(upstream, stream=True)
    except httpx.HTTPError as error:
        await client.aclose()
        log.warning(
            "sand.box.proxy.unreachable", box=str(box_id), port=port, error=str(error)
        )
        return JSONResponse(
            {"error": f"the box did not answer on port {port}: {error}"},
            status_code=502,
        )

    async def body() -> AsyncIterator[bytes]:
        try:
            async for chunk in response.aiter_raw():
                yield chunk
        finally:
            await response.aclose()

    return StreamingResponse(
        body(),
        status_code=response.status_code,
        headers=forwardable(response.headers),
        background=BackgroundTask(client.aclose),
    )


METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]


@router.api_route(
    "/sand-box/{box_id}/p/{port}", methods=METHODS, name="sand:box_proxy_root"
)
async def proxy_root(
    request: Request,
    box_id: UUID,
    port: int,
    db: AsyncSession = Depends(get_db_session),
) -> Any:
    return await _proxy_http(request, box_id, port, "", db)


@router.api_route(
    "/sand-box/{box_id}/p/{port}/{path:path}", methods=METHODS, name="sand:box_proxy"
)
async def proxy(
    request: Request,
    box_id: UUID,
    port: int,
    path: str,
    db: AsyncSession = Depends(get_db_session),
) -> Any:
    return await _proxy_http(request, box_id, port, path, db)


# --- WebSocket ---------------------------------------------------------------------


async def pump(client: WebSocket, upstream: ClientConnection) -> None:
    """Bytes and text both ways until either side closes."""

    async def to_upstream() -> None:
        while True:
            message = await client.receive()
            if message.get("type") == "websocket.disconnect":
                return
            data = message.get("bytes")
            if data is not None:
                await upstream.send(data)
                continue
            text = message.get("text")
            if text is not None:
                await upstream.send(text)

    async def to_client() -> None:
        async for message in upstream:
            if isinstance(message, bytes | bytearray | memoryview):
                await client.send_bytes(bytes(message))
            else:
                await client.send_text(message)

    tasks = [asyncio.create_task(to_upstream()), asyncio.create_task(to_client())]
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            error = task.exception()
            if error is not None and not isinstance(
                error, ConnectionClosed | WebSocketDisconnect
            ):
                raise error
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()


async def _proxy_ws(
    websocket: WebSocket, box_id: UUID, port: int, path: str, db: AsyncSession
) -> None:
    resolved = await _resolve(
        db, box_id, port, read_network_token(websocket.headers, websocket.query_params)
    )
    if isinstance(resolved, JSONResponse):
        await websocket.close(
            code=1008,
            reason="network token refused"
            if resolved.status_code == 401
            else "port not proxied",
        )
        return
    _, host, host_port = resolved
    query = websocket.url.query
    url = f"ws://{host}:{host_port}/{path}" + (f"?{query}" if query else "")
    requested: list[Subprotocol] = [
        Subprotocol(p.strip())
        for p in websocket.headers.get("sec-websocket-protocol", "").split(",")
        if p.strip()
    ]
    headers = {
        k: v
        for k, v in websocket.headers.items()
        if k.lower() in ("authorization", NETWORK_TOKEN_HEADER)
    }
    try:
        upstream = await connect(
            url,
            subprotocols=requested or None,
            additional_headers=headers,
            max_size=None,
            open_timeout=15,
        )
    except Exception as error:
        log.warning(
            "sand.box.proxy.ws_unreachable",
            box=str(box_id),
            port=port,
            error=str(error),
        )
        await websocket.close(
            code=1011, reason=f"the box did not answer on port {port}"
        )
        return
    await websocket.accept(subprotocol=upstream.subprotocol)
    try:
        await pump(websocket, upstream)
    except Exception as error:
        log.warning(
            "sand.box.proxy.ws_failed", box=str(box_id), port=port, error=str(error)
        )
    finally:
        await upstream.close()
        try:
            await websocket.close()
        except Exception:
            pass


@router.websocket("/sand-box/{box_id}/p/{port}")
async def proxy_ws_root(
    websocket: WebSocket,
    box_id: UUID,
    port: int,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    await _proxy_ws(websocket, box_id, port, "", db)


@router.websocket("/sand-box/{box_id}/p/{port}/{path:path}")
async def proxy_ws(
    websocket: WebSocket,
    box_id: UUID,
    port: int,
    path: str,
    db: AsyncSession = Depends(get_db_session),
) -> None:
    await _proxy_ws(websocket, box_id, port, path, db)


__all__ = ["router", "set_client_factory_for_tests", "set_lookup_for_tests"]
