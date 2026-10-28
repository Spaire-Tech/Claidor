"""A request that reaches E2B while the person's computer is woken or
replaced (21 October 2026: Sage's computer frozen at 18:09:36, after an hour
awake on E2B's free plan, then woken and replaced by 18:10:00). E2B answers
502 "The sandbox was not found" for the old sandbox; while an ensure holds
the person's lock, the proxy waits for it and sends the request once more,
to the new sandbox or the woken one. With nothing under way, the answer goes
to the app at once, as before, and the app's EnsureSandBox wakes the box;
an answer to the box's own request (a command's output from the Mac) wakes
it and goes again.
"""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any, cast

import httpx
import pytest
from sqlalchemy import text
from starlette.requests import Request
from starlette.responses import StreamingResponse

from simeon.models import SandBox
from simeon.postgres import AsyncSession
from simeon.sand import box_proxy
from simeon.sand.box_service import BoxEnsureInProgress, broker

GONE = b'{"sandboxId":"old","message":"The sandbox was not found","code":502}'
USER = uuid.UUID(int=5)
BOX = uuid.UUID(int=7)
PROMPT = b'{"agentId":"sage","text":"hi"}'


def _box(sandbox: str, kind: str = "e2b") -> SandBox:
    return SandBox(
        id=BOX,
        user_id=USER,
        provider="e2b-1",
        provider_box_id=sandbox,
        host_address="e2b.app",
        ports={},
        gateway_token="g",
        network_token="n",
        host_meta={"kind": kind, "traffic_token": f"traffic-{sandbox}"},
    )


def _request(
    method: str = "POST", body: bytes = PROMPT, headers: dict[str, str] | None = None
) -> Request:
    sent = False

    async def receive() -> dict[str, Any]:
        nonlocal sent
        chunk = b"" if sent else body
        sent = True
        return {"type": "http.request", "body": chunk, "more_body": False}

    fields = {"x-anyrun-network-token": "n", **(headers or {})}
    if method == "POST" and headers is None:
        fields["content-length"] = str(len(body))
    return Request(
        {
            "type": "http",
            "method": method,
            "path": f"/sand-box/{BOX}/p/1340/api/sendPrompt",
            "query_string": b"",
            "headers": [(k.encode(), v.encode()) for k, v in fields.items()],
        },
        receive,
    )


class _Db:
    commits = 0

    async def commit(self) -> None:
        _Db.commits += 1


@asynccontextmanager
async def _sessions() -> AsyncIterator[Any]:
    yield _Db()


class _Chunks(httpx.AsyncByteStream):
    def __init__(self, body: bytes) -> None:
        self.body = body

    async def __aiter__(self) -> AsyncIterator[bytes]:
        yield self.body


@pytest.fixture
def world(monkeypatch: pytest.MonkeyPatch) -> Any:
    """The row the proxy reads, the person's ensure lock (`ensuring`, one
    answer per check, then free), the sandboxes that answer (`live`), each
    request E2B saw (`seen`: sandbox, body, traffic token), and what each
    wake does (`wakes`: its word, and the sandbox it brings back, if any;
    `woke`: the wakes asked for)."""
    state = SimpleNamespace(
        row=_box("old"),
        ensuring=[],
        live={"new"},
        seen=[],
        on_check=None,
        wakes=[],
        woke=0,
    )
    _Db.commits = 0

    async def lookup(db: Any, box_id: uuid.UUID, token: str) -> SandBox | None:
        return state.row if box_id == BOX and token == "n" else None

    async def ensuring(db: Any, user_id: uuid.UUID) -> bool:
        assert user_id == USER
        held = state.ensuring.pop(0) if state.ensuring else False
        if state.on_check is not None:
            state.on_check()
        return held

    def e2b(request: httpx.Request) -> httpx.Response:
        sandbox = request.url.host.split("-", 1)[1].split(".")[0]
        state.seen.append(
            (sandbox, request.content, request.headers.get("e2b-traffic-access-token"))
        )
        if sandbox in state.live:
            # Streamed, as a box's answer is (a body given whole is read at once).
            return httpx.Response(
                200, stream=_Chunks(b'{"sandbox":"%s"}' % sandbox.encode())
            )
        return httpx.Response(502, content=GONE)

    async def wake(db: Any, user_id: uuid.UUID) -> str:
        assert user_id == USER
        state.woke += 1
        outcome, sandbox = state.wakes.pop(0) if state.wakes else ("awake", None)
        if outcome == "ensuring":
            state.ensuring = [True]
        if sandbox is not None:
            state.live = {sandbox}
        return str(outcome)

    box_proxy.set_lookup_for_tests(lookup)
    monkeypatch.setattr(box_proxy, "_ensuring", ensuring)
    monkeypatch.setattr(box_proxy, "_wake", wake)
    monkeypatch.setattr(box_proxy, "REPLACED_POLL_SECONDS", 0)
    box_proxy.set_client_factory_for_tests(
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(e2b))
    )
    yield state
    box_proxy.set_lookup_for_tests(None)
    box_proxy.set_client_factory_for_tests(None)


async def _proxied(request: Request, path: str = "api/sendPrompt") -> tuple[int, bytes]:
    response = await box_proxy._proxy_http(request, BOX, 1340, path, _sessions)
    if isinstance(response, StreamingResponse):
        chunks = [chunk async for chunk in response.body_iterator]
        assert all(isinstance(chunk, bytes) for chunk in chunks)
        return response.status_code, b"".join(cast(list[bytes], chunks))
    return response.status_code, bytes(response.body)


@pytest.mark.asyncio
class TestReplaced:
    async def test_a_message_sent_during_a_replacement_reaches_the_new_sandbox(
        self, world: Any
    ) -> None:
        checks = 0

        def written_on_the_second_check() -> None:
            nonlocal checks
            checks += 1
            if checks == 2:
                world.row = _box("new")

        world.ensuring = [True, True, True]
        world.on_check = written_on_the_second_check
        status, body = await _proxied(_request())
        assert (status, body) == (200, b'{"sandbox":"new"}')
        assert world.seen == [
            ("old", PROMPT, "traffic-old"),
            ("new", PROMPT, "traffic-new"),
        ]

    async def test_a_sandbox_woken_in_place_is_asked_once_more(
        self, world: Any
    ) -> None:
        world.live = set()

        def woken() -> None:
            world.live = {"old"}

        world.ensuring = [True]
        world.on_check = woken
        status, body = await _proxied(_request())
        assert (status, body) == (200, b'{"sandbox":"old"}')
        assert [seen[0] for seen in world.seen] == ["old", "old"]

    async def test_a_frozen_sandbox_with_nothing_under_way_answers_at_once(
        self, world: Any
    ) -> None:
        # The app's EnsureSandBox wakes it, as before; no wait first.
        status, body = await _proxied(_request())
        assert (status, body) == (502, GONE)
        assert len(world.seen) == 1
        assert world.woke == 0

    async def test_the_wait_ends_and_the_answer_goes_to_the_app(
        self, world: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(box_proxy, "REPLACED_WAIT_SECONDS", 0)
        world.ensuring = [True] * 5
        status, body = await _proxied(_request())
        assert (status, body) == (502, GONE)
        assert len(world.seen) == 1

    async def test_the_event_stream_waits_as_well(self, world: Any) -> None:
        world.ensuring = [True, True]
        world.on_check = lambda: setattr(world, "row", _box("new"))
        status, body = await _proxied(_request("GET", b""))
        assert (status, body) == (200, b'{"sandbox":"new"}')
        assert [seen[:2] for seen in world.seen] == [("old", b""), ("new", b"")]

    async def test_an_upload_without_a_size_streams_and_is_not_sent_again(
        self, world: Any
    ) -> None:
        world.ensuring = [True, True]
        world.on_check = lambda: setattr(world, "row", _box("new"))
        request = _request(headers={"transfer-encoding": "chunked"})
        status, body = await _proxied(request)
        assert (status, body) == (502, GONE)
        assert len(world.seen) == 1


ANSWER = b'{"providerId":"p","frames":[{"requestId":"r","kind":"exit"}]}'


@pytest.mark.asyncio
class TestAnswerWakes:
    """An answer to the box's own request (Nora's Stripe check, 27 October
    2026: the Mac's answer refused three times while the box slept)."""

    async def test_an_answer_to_a_sleeping_box_wakes_it_and_arrives(
        self, world: Any
    ) -> None:
        world.live = set()
        world.wakes = [("woken", "old")]
        status, body = await _proxied(_request(body=ANSWER), "local-exec/responses")
        assert (status, body) == (200, b'{"sandbox":"old"}')
        assert world.seen == [
            ("old", ANSWER, "traffic-old"),
            ("old", ANSWER, "traffic-old"),
        ]
        assert world.woke == 1
        # The wake is kept, and the person's lock let go, before it goes.
        assert _Db.commits == 1

    async def test_an_answer_goes_again_while_e2b_is_still_freezing_the_box(
        self, world: Any
    ) -> None:
        # E2B's API says running while its proxy has lost the box; the wake
        # that finds it frozen starts it.
        world.live = set()
        world.wakes = [("awake", None), ("awake", None), ("woken", "old")]
        status, body = await _proxied(_request(body=ANSWER), "local-exec/responses")
        assert (status, body) == (200, b'{"sandbox":"old"}')
        assert world.woke == 3
        assert len(world.seen) == 4

    async def test_an_ensure_under_way_is_waited_for(self, world: Any) -> None:
        world.live = set()
        world.wakes = [("ensuring", "old")]
        status, body = await _proxied(_request(body=ANSWER), "local-exec/responses")
        assert (status, body) == (200, b'{"sandbox":"old"}')
        assert world.woke == 1

    async def test_a_lost_box_is_not_woken(self, world: Any) -> None:
        world.live = set()
        world.wakes = [("no-box", None)]
        status, body = await _proxied(_request(body=ANSWER), "local-exec/responses")
        assert (status, body) == (502, GONE)
        assert len(world.seen) == 1

    async def test_the_tries_end_and_the_answer_goes_to_the_app(
        self, world: Any, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(box_proxy, "REPLACED_WAIT_SECONDS", 0)
        world.live = set()
        status, body = await _proxied(_request(body=ANSWER), "local-exec/responses")
        assert (status, body) == (502, GONE)
        assert world.woke == 1
        assert len(world.seen) == 2


def test_only_an_answer_to_the_box_wakes_it() -> None:
    assert box_proxy.answers_the_box("POST", "local-exec/responses")
    assert box_proxy.answers_the_box("POST", "/webauthn/responses")
    assert not box_proxy.answers_the_box("GET", "local-exec/requests")
    assert not box_proxy.answers_the_box("GET", "local-exec/responses")
    assert not box_proxy.answers_the_box("POST", "api/sendPrompt")


@pytest.mark.asyncio
async def test_a_wake_never_races_an_ensure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def held(db: Any, user_id: uuid.UUID) -> None:
        raise BoxEnsureInProgress()

    async def wake(db: Any, user_id: uuid.UUID) -> str:
        return "woken"

    monkeypatch.setattr(broker, "wake", wake)
    monkeypatch.setattr(broker, "_take_ensure_lock", held)
    assert await broker.wake_locked(cast(AsyncSession, None), USER) == "ensuring"

    async def free(db: Any, user_id: uuid.UUID) -> None:
        return None

    monkeypatch.setattr(broker, "_take_ensure_lock", free)
    assert await broker.wake_locked(cast(AsyncSession, None), USER) == "woken"


def test_only_e2b_saying_the_sandbox_is_gone_counts() -> None:
    e2b = _box("old")
    assert box_proxy.sandbox_gone(e2b, 502, GONE)
    assert box_proxy.sandbox_gone(e2b, 502, b"<h1>Sandbox not found</h1>")
    assert not box_proxy.sandbox_gone(e2b, 502, b'{"error":"bad gateway"}')
    assert not box_proxy.sandbox_gone(e2b, 404, GONE)
    assert not box_proxy.sandbox_gone(_box("c", kind="docker"), 502, GONE)


@pytest.mark.asyncio
async def test_only_a_small_body_is_kept() -> None:
    assert await box_proxy.kept_body(_request("GET", b"")) == b""
    assert await box_proxy.kept_body(_request()) == PROMPT
    chunked = _request(headers={"transfer-encoding": "chunked"})
    assert await box_proxy.kept_body(chunked) is None
    large = _request(headers={"content-length": str(box_proxy.REPLAY_LIMIT_BYTES + 1)})
    assert await box_proxy.kept_body(large) is None


@pytest.mark.asyncio
async def test_the_ensure_lock_is_read_without_being_taken(
    session: AsyncSession,
) -> None:
    # Keys whose hash is negative and positive both: a one-key lock shows
    # the key's high half as `classid`, all ones for a negative hash.
    signs: dict[bool, uuid.UUID] = {}
    while len(signs) < 2:
        candidate = uuid.uuid4()
        hashed = await session.scalar(
            text("SELECT hashtext(:key)"),
            {"key": f"sand-box-ensure:{candidate}"},
        )
        signs.setdefault(hashed < 0, candidate)
    for person in signs.values():
        assert await broker.ensure_in_progress(session, person) is False
        await broker._take_ensure_lock(session, person)
        assert await broker.ensure_in_progress(session, person) is True
    assert await broker.ensure_in_progress(session, uuid.uuid4()) is False
