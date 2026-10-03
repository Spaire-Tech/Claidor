"""Two ordinary events the box proxy logged as unhandled exceptions, dozens a
minute on Render (3 October 2026): the app hanging up on one of its polls
before the request was forwarded (ClientDisconnect), and the box closing a
long poll mid-answer while it restarts on a new host bundle
(RemoteProtocolError). Neither is an error of the server's."""

import uuid
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from starlette.requests import ClientDisconnect, Request
from starlette.responses import StreamingResponse

from simeon.sand import box_proxy


def _request(*, hung_up: bool = True) -> Request:
    async def receive() -> dict[str, Any]:
        if hung_up:
            return {"type": "http.disconnect"}
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/sand-box/x/p/1340/health",
            "query_string": b"",
            "headers": [],
        },
        receive,
    )


@pytest.fixture
def resolved(monkeypatch: pytest.MonkeyPatch) -> Any:
    box = SimpleNamespace(id=uuid.uuid4())

    async def resolve(*_: Any) -> Any:
        return box, "box1.example", 41340

    monkeypatch.setattr(box_proxy, "_resolve", resolve)
    yield box
    box_proxy.set_client_factory_for_tests(None)


@pytest.mark.asyncio
async def test_the_app_hanging_up_is_answered_quietly(resolved: Any) -> None:
    def hang_up(_: httpx.Request) -> httpx.Response:
        raise ClientDisconnect()

    box_proxy.set_client_factory_for_tests(
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(hang_up))
    )
    response = await box_proxy._proxy_http(
        _request(),
        resolved.id,
        1340,
        "health",
        None,  # type: ignore[arg-type]
    )
    assert response.status_code == 499


@pytest.mark.asyncio
async def test_a_stream_the_box_drops_just_ends(resolved: Any) -> None:
    class Dropping(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            yield b"data: one\n\n"
            raise httpx.RemoteProtocolError("peer closed connection")

    def answer(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, stream=Dropping())

    box_proxy.set_client_factory_for_tests(
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(answer))
    )
    response = await box_proxy._proxy_http(
        _request(hung_up=False),
        resolved.id,
        1340,
        "events",
        None,  # type: ignore[arg-type]
    )
    assert isinstance(response, StreamingResponse)
    chunks = [chunk async for chunk in response.body_iterator]
    assert chunks == [b"data: one\n\n"]
