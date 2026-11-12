"""`EncodedBodyMiddleware`: an app's body sent in base64 past Render's edge
firewall is read by every route as written (12 November 2026)."""

import base64
import json

import httpx
import pytest
from fastapi import FastAPI, Request
from pydantic import BaseModel

from simeon import middlewares
from simeon.middlewares import EncodedBodyMiddleware
from simeon.sand.box_proxy import forwardable, kept_body

#: What the edge refused from the founder's Mac (a 403 "Blocked" page), in
#: part: shell commands and a line of Python inside one.
REFUSED = (
    "umask 077; az ad sp create-for-rbac --name simeon-server > ~/s.json\n"
    "APP=$(python3 -c \"import json;print(json.load(open('$HOME/s.json'))['appId'])\")\n"
    "curl -fsSL https://aka.ms/aca-cli-install | sh"
)


class Prompt(BaseModel):
    agentId: str
    prompt: str


def app() -> FastAPI:
    built = FastAPI()

    @built.post("/typed")
    async def typed(body: Prompt) -> dict[str, str]:
        return {"agentId": body.agentId, "prompt": body.prompt}

    @built.post("/raw")
    async def raw(request: Request) -> dict[str, object]:
        body = await request.body()
        return {
            "body": body.decode(),
            "contentType": request.headers.get("content-type"),
            "contentLength": request.headers.get("content-length"),
            "marker": request.headers.get("x-simeon-body"),
            "typeHeader": request.headers.get("x-simeon-content-type"),
        }

    @built.post("/proxied")
    async def proxied(request: Request) -> dict[str, object]:
        # What the computer's proxy reads and passes on (`box_proxy`): the
        # body kept for a resend, and the headers it forwards.
        kept = await kept_body(request)
        return {
            "kept": None if kept is None else kept.decode(),
            "forwarded": sorted(k.lower() for k in forwardable(request.headers)),
        }

    built.add_middleware(EncodedBodyMiddleware)
    return built


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app()), base_url="http://test"
    )


def encoded(payload: bytes) -> bytes:
    return base64.b64encode(payload)


ENCODED_HEADERS = {
    "x-simeon-body": "base64",
    "x-simeon-content-type": "application/json",
    "content-type": "text/plain",
}


@pytest.mark.asyncio
async def test_a_typed_route_reads_the_message_as_written() -> None:
    message = json.dumps({"agentId": "a1", "prompt": REFUSED}).encode()
    async with client() as http:
        answer = await http.post(
            "/typed", content=encoded(message), headers=ENCODED_HEADERS
        )
    assert answer.status_code == 200
    assert answer.json() == {"agentId": "a1", "prompt": REFUSED}


@pytest.mark.asyncio
async def test_the_route_sees_the_body_type_and_length_and_none_of_the_markers() -> (
    None
):
    message = json.dumps({"prompt": "café ✓"}, ensure_ascii=False).encode()
    async with client() as http:
        answer = await http.post(
            "/raw", content=encoded(message), headers=ENCODED_HEADERS
        )
    seen = answer.json()
    assert seen["body"] == message.decode()
    assert seen["contentType"] == "application/json"
    assert seen["contentLength"] == str(len(message))
    assert seen["marker"] is None
    assert seen["typeHeader"] is None


@pytest.mark.asyncio
async def test_the_type_defaults_to_json_and_another_is_kept() -> None:
    async with client() as http:
        plain = await http.post(
            "/raw", content=encoded(b"{}"), headers={"x-simeon-body": "base64"}
        )
        form = await http.post(
            "/raw",
            content=encoded(b"a=1"),
            headers={
                "x-simeon-body": "base64",
                "x-simeon-content-type": "application/x-www-form-urlencoded",
            },
        )
    assert plain.json()["contentType"] == "application/json"
    assert form.json()["contentType"] == "application/x-www-form-urlencoded"
    assert form.json()["body"] == "a=1"


@pytest.mark.asyncio
async def test_a_request_without_the_header_passes_as_it_is() -> None:
    async with client() as http:
        answer = await http.post(
            "/raw", content=b'{"x": 1}', headers={"content-type": "application/json"}
        )
    assert answer.json()["body"] == '{"x": 1}'
    assert answer.json()["contentType"] == "application/json"


@pytest.mark.asyncio
async def test_a_body_that_is_not_base64_or_an_unknown_encoding_is_refused() -> None:
    async with client() as http:
        broken = await http.post("/raw", content=b"abc", headers=ENCODED_HEADERS)
        unknown = await http.post(
            "/raw", content=b"{}", headers={"x-simeon-body": "gzip"}
        )
    assert broken.status_code == 400
    assert "base64" in broken.json()["error"]["message"]
    assert unknown.status_code == 400


@pytest.mark.asyncio
async def test_an_oversized_encoded_body_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(middlewares, "ENCODED_BODY_LIMIT", 8)
    async with client() as http:
        answer = await http.post(
            "/raw",
            content=encoded(b'{"prompt": "long enough"}'),
            headers=ENCODED_HEADERS,
        )
    assert answer.status_code == 413


@pytest.mark.asyncio
async def test_the_computer_s_proxy_passes_on_the_message_as_written() -> None:
    message = json.dumps({"prompt": REFUSED}).encode()
    async with client() as http:
        answer = await http.post(
            "/proxied",
            content=encoded(message),
            headers={**ENCODED_HEADERS, "authorization": "Bearer gw"},
        )
    seen = answer.json()
    assert seen["kept"] == message.decode()
    assert "x-simeon-body" not in seen["forwarded"]
    assert "x-simeon-content-type" not in seen["forwarded"]
    assert "authorization" in seen["forwarded"]
    assert "content-type" in seen["forwarded"]
