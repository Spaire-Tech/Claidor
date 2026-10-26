"""Claude through Amazon Bedrock (`simeon.desktop.bedrock`): with
`DESKTOP_CLAUDE_VIA=bedrock` and an AWS key, a Claude call goes to Bedrock's
runtime Anthropic route, signed, with the model named by its inference
profile and the thinking-binding beta left out; a call Bedrock refuses over
its thinking blocks goes to Bedrock again without them (27 October 2026:
until then the Anthropic key paid for those); when Bedrock does not answer
with a 200 otherwise, the same call goes to the Anthropic key, as it was
sent; each call Bedrock serves is logged; with the setting left alone
nothing changes."""

import json

import httpx
import pytest
import respx
from pytest_mock import MockerFixture
from structlog.testing import capture_logs

from simeon.config import settings
from simeon.desktop.bedrock import (
    bedrock_body,
    bedrock_messages_url,
    refuses_thinking,
    without_thinking,
)
from simeon.desktop.pricing import ModelPolicy
from simeon.models import DesktopUsage, User
from simeon.postgres import AsyncSession
from tests.desktop.test_endpoints import STREAM, _signed_in

ANTHROPIC = f"{settings.DESKTOP_ANTHROPIC_BASE_URL}/v1/messages"
BEDROCK = "https://bedrock-runtime.us-west-2.amazonaws.com/anthropic/v1/messages"
REQUEST = {
    "model": "claude-sonnet-5-5",
    "max_tokens": 64,
    "stream": True,
    "messages": [{"role": "user", "content": "hi"}],
}


def _bedrock(mocker: MockerFixture, *, anthropic_key: str = "sk-anthropic") -> None:
    mocker.patch.object(settings, "ANTHROPIC_API_KEY", anthropic_key)
    mocker.patch.object(settings, "DESKTOP_CLAUDE_VIA", "bedrock")
    mocker.patch.object(settings, "DESKTOP_BEDROCK_REGION", "us-west-2")
    mocker.patch.object(settings, "DESKTOP_BEDROCK_ROUTE", "global")
    mocker.patch.object(settings, "DESKTOP_BEDROCK_ACCESS_KEY_ID", "AKIDEXAMPLE")
    mocker.patch.object(
        settings, "DESKTOP_BEDROCK_SECRET_ACCESS_KEY", "wJalrXUtnFEMI/EXAMPLEKEY"
    )


def _sse() -> httpx.Response:
    return httpx.Response(
        200, headers={"content-type": "text/event-stream"}, content=STREAM
    )


# A conversation whose instructions changed since its first answer: its
# thinking blocks are bound to the earlier form, and Bedrock, which takes no
# binding beta, refuses them.
THINKING = {"type": "thinking", "thinking": "", "signature": "sig-1"}
CONVERSATION = {
    **REQUEST,
    "messages": [
        {"role": "user", "content": "hi"},
        {
            "role": "assistant",
            "content": [
                THINKING,
                {"type": "text", "text": "Looking."},
                {"type": "tool_use", "id": "t1", "name": "read", "input": {}},
            ],
        },
        {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": "t1", "content": "ok"}],
        },
    ],
}
BOUND_ELSEWHERE = {
    "type": "error",
    "error": {
        "type": "invalid_request_error",
        "message": "messages.1.content.0: Invalid `signature` in `thinking` block. "
        "The block is bound to a different conversation.",
    },
}


def _sent(call: respx.models.Call) -> dict[str, object]:
    return json.loads(call.request.content)


def _events(logs: list[dict[str, object]], name: str) -> list[dict[str, object]]:
    return [one for one in logs if one["event"] == name]


def test_thinking_blocks_come_out_and_everything_else_stays() -> None:
    stripped = without_thinking(CONVERSATION)
    assert stripped is not None
    assert stripped["messages"][1]["content"] == [
        {"type": "text", "text": "Looking."},
        {"type": "tool_use", "id": "t1", "name": "read", "input": {}},
    ]
    assert stripped["messages"][0] == CONVERSATION["messages"][0]
    assert stripped["messages"][2] == CONVERSATION["messages"][2]
    assert stripped["model"] == CONVERSATION["model"]
    # A turn that was only thinking goes; its neighbours are joined by the API.
    only = {
        **REQUEST,
        "messages": [
            {"role": "user", "content": "hi"},
            {
                "role": "assistant",
                "content": [{"type": "redacted_thinking", "data": "x"}],
            },
            {"role": "user", "content": "again"},
        ],
    }
    assert without_thinking(only) == {
        **REQUEST,
        "messages": [
            {"role": "user", "content": "hi"},
            {"role": "user", "content": "again"},
        ],
    }
    # Nothing to take out: nothing to send again.
    assert without_thinking(REQUEST) is None
    assert CONVERSATION["messages"][1]["content"][0] == THINKING, "left as sent"


def test_a_refusal_over_thinking_is_told_from_the_rest() -> None:
    assert refuses_thinking(400, json.dumps(BOUND_ELSEWHERE).encode())
    assert not refuses_thinking(400, b'{"message": "max_tokens: too large"}')
    assert not refuses_thinking(403, b'{"message": "no thinking access"}')
    assert not refuses_thinking(None, b"thinking")


def test_the_body_is_the_same_with_the_model_named_by_its_profile(
    mocker: MockerFixture,
) -> None:
    mocker.patch.object(settings, "DESKTOP_BEDROCK_ROUTE", "global")
    thinking = {
        "type": "adaptive",
        "block_binding": {"prefix_mismatch_behavior": "drop_block"},
    }
    body = json.loads(
        bedrock_body(
            {**REQUEST, "output_config": {"effort": "high"}, "thinking": thinking}
        )
    )
    assert body["model"] == "global.anthropic.claude-sonnet-5-5"
    assert body["output_config"] == {"effort": "high"}
    assert body["thinking"] == {"type": "adaptive"}
    assert body["messages"] == REQUEST["messages"]
    assert (
        json.loads(bedrock_body(body))["model"] == "global.anthropic.claude-sonnet-5-5"
    )
    mocker.patch.object(settings, "DESKTOP_BEDROCK_ROUTE", "us")
    assert (
        json.loads(bedrock_body(REQUEST))["model"] == "us.anthropic.claude-sonnet-5-5"
    )


def test_the_address_follows_the_region(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "DESKTOP_BEDROCK_REGION", "us-east-1")
    assert (
        bedrock_messages_url()
        == "https://bedrock-runtime.us-east-1.amazonaws.com/anthropic/v1/messages"
    )


@pytest.mark.asyncio
class TestClaudeThroughBedrock:
    async def test_a_claude_call_goes_to_bedrock_signed_and_is_metered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _bedrock(mocker)
        access, _ = await _signed_in(client, session, user)
        with capture_logs() as logs, respx.mock(assert_all_called=False) as mock:
            bedrock = mock.post(BEDROCK).mock(return_value=_sse())
            anthropic = mock.post(ANTHROPIC)
            async with client.stream(
                "POST",
                "/desktop/api/proxy/v1/messages",
                headers={
                    "Authorization": f"Bearer {access}",
                    "anthropic-beta": "thinking-binding-controls-2026-08-01",
                },
                json=REQUEST,
            ) as response:
                assert response.status_code == 200
                received = b"".join([chunk async for chunk in response.aiter_bytes()])
        assert received == STREAM
        assert not anthropic.called
        sent = bedrock.calls[0].request
        assert json.loads(sent.content)["model"] == "global.anthropic.claude-sonnet-5-5"
        assert sent.headers["authorization"].startswith("AWS4-HMAC-SHA256 ")
        assert "/us-west-2/bedrock/aws4_request" in sent.headers["authorization"]
        assert "x-api-key" not in sent.headers, "no Anthropic key goes to AWS"
        assert "anthropic-beta" not in sent.headers, "Bedrock names no binding beta"
        assert sent.headers["anthropic-version"]
        rows = (await session.execute(DesktopUsage.__table__.select())).all()
        assert [(row.model, row.input_tokens, row.upstream_status) for row in rows] == [
            ("claude-sonnet-5-5", 120, 200)
        ]
        served = _events(logs, "desktop.proxy.bedrock_served")
        assert [(one["model"], one["via"]) for one in served] == [
            ("claude-sonnet-5-5", "bedrock")
        ]

    @pytest.mark.parametrize("anthropic_key", ["sk-anthropic", ""])
    async def test_refused_over_thinking_it_goes_to_bedrock_again_without_them(
        self,
        anthropic_key: str,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _bedrock(mocker, anthropic_key=anthropic_key)
        access, _ = await _signed_in(client, session, user)
        with capture_logs() as logs, respx.mock(assert_all_called=False) as mock:
            bedrock = mock.post(BEDROCK).mock(
                side_effect=[httpx.Response(400, json=BOUND_ELSEWHERE), _sse()]
            )
            anthropic = mock.post(ANTHROPIC).mock(return_value=_sse())
            async with client.stream(
                "POST",
                "/desktop/api/proxy/v1/messages",
                headers={
                    "Authorization": f"Bearer {access}",
                    "anthropic-beta": "thinking-binding-controls-2026-08-01",
                },
                json=CONVERSATION,
            ) as response:
                assert response.status_code == 200
                received = b"".join([chunk async for chunk in response.aiter_bytes()])
        assert received == STREAM
        assert not anthropic.called, "Anthropic credits pay for nothing"
        assert len(bedrock.calls) == 2
        first, again = (_sent(call) for call in bedrock.calls)
        assert first["messages"][1]["content"][0] == THINKING
        assert again["messages"][1]["content"] == [
            {"type": "text", "text": "Looking."},
            {"type": "tool_use", "id": "t1", "name": "read", "input": {}},
        ]
        assert again["model"] == "global.anthropic.claude-sonnet-5-5"
        assert (
            bedrock.calls[1]
            .request.headers["authorization"]
            .startswith("AWS4-HMAC-SHA256 ")
        )
        assert _events(logs, "desktop.proxy.bedrock_fallback") == []
        assert len(_events(logs, "desktop.proxy.bedrock_without_thinking")) == 1
        assert [
            one["via"] for one in _events(logs, "desktop.proxy.bedrock_served")
        ] == ["bedrock_without_thinking"]
        rows = (await session.execute(DesktopUsage.__table__.select())).all()
        assert [row.upstream_status for row in rows] == [200], "one call, one row"

    async def test_a_non_streaming_call_is_asked_again_too(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _bedrock(mocker)
        access, _ = await _signed_in(client, session, user)
        answer = {
            "id": "msg_1",
            "type": "message",
            "content": [{"type": "text", "text": "hello"}],
            "usage": {"input_tokens": 10, "output_tokens": 3},
        }
        with respx.mock(assert_all_called=False) as mock:
            bedrock = mock.post(BEDROCK).mock(
                side_effect=[
                    httpx.Response(400, json=BOUND_ELSEWHERE),
                    httpx.Response(200, json=answer),
                ]
            )
            anthropic = mock.post(ANTHROPIC)
            response = await client.post(
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json={**CONVERSATION, "stream": False},
            )
        assert response.status_code == 200, response.text
        assert response.json() == answer
        assert len(bedrock.calls) == 2
        assert not anthropic.called

    async def test_refused_again_without_them_it_goes_to_the_anthropic_key_as_sent(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _bedrock(mocker)
        access, _ = await _signed_in(client, session, user)
        with capture_logs() as logs, respx.mock(assert_all_called=True) as mock:
            bedrock = mock.post(BEDROCK).mock(
                side_effect=[
                    httpx.Response(400, json=BOUND_ELSEWHERE),
                    httpx.Response(503, json={"message": "Service unavailable"}),
                ]
            )
            anthropic = mock.post(ANTHROPIC).mock(return_value=_sse())
            async with client.stream(
                "POST",
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json=CONVERSATION,
            ) as response:
                assert response.status_code == 200
                await response.aread()
        assert len(bedrock.calls) == 2
        assert _sent(anthropic.calls[0])["messages"][1]["content"][0] == THINKING
        assert [
            one["status"] for one in _events(logs, "desktop.proxy.bedrock_fallback")
        ] == [503]
        assert _events(logs, "desktop.proxy.bedrock_served") == []

    async def test_a_call_with_no_thinking_refused_goes_on_as_before(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _bedrock(mocker)
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            bedrock = mock.post(BEDROCK).mock(
                return_value=httpx.Response(400, json=BOUND_ELSEWHERE)
            )
            mock.post(ANTHROPIC).mock(return_value=_sse())
            async with client.stream(
                "POST",
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json=REQUEST,
            ) as response:
                assert response.status_code == 200
                await response.aread()
        assert len(bedrock.calls) == 1, "nothing to take out, nothing sent again"

    @pytest.mark.parametrize("status", [403, 404, 400, 429, 500])
    async def test_bedrock_refusing_sends_the_call_to_the_anthropic_key(
        self,
        status: int,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _bedrock(mocker)
        access, _ = await _signed_in(client, session, user)
        with capture_logs() as logs, respx.mock(assert_all_called=True) as mock:
            mock.post(BEDROCK).mock(
                return_value=httpx.Response(
                    status, json={"message": "You don't have access to the model."}
                )
            )
            anthropic = mock.post(ANTHROPIC).mock(return_value=_sse())
            async with client.stream(
                "POST",
                "/desktop/api/proxy/v1/messages",
                headers={
                    "Authorization": f"Bearer {access}",
                    "anthropic-beta": "thinking-binding-controls-2026-08-01",
                },
                json=REQUEST,
            ) as response:
                assert response.status_code == 200
                received = b"".join([chunk async for chunk in response.aiter_bytes()])
        assert received == STREAM
        sent = anthropic.calls[0].request
        assert sent.headers["x-api-key"] == "sk-anthropic"
        assert json.loads(sent.content)["model"] == "claude-sonnet-5-5"
        assert sent.headers["anthropic-beta"] == "thinking-binding-controls-2026-08-01"
        fallbacks = [
            one for one in logs if one["event"] == "desktop.proxy.bedrock_fallback"
        ]
        assert [(one["model"], one["status"]) for one in fallbacks] == [
            ("claude-sonnet-5-5", status)
        ]
        assert "access to the model" in fallbacks[0]["preview"]
        rows = (await session.execute(DesktopUsage.__table__.select())).all()
        assert [row.upstream_status for row in rows] == [200], "one call, one row"

    async def test_a_non_streaming_call_falls_back_too(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _bedrock(mocker)
        access, _ = await _signed_in(client, session, user)
        answer = {
            "id": "msg_1",
            "type": "message",
            "content": [{"type": "text", "text": "hello"}],
            "usage": {"input_tokens": 10, "output_tokens": 3},
        }
        with respx.mock(assert_all_called=True) as mock:
            mock.post(BEDROCK).mock(side_effect=httpx.ConnectError("unreachable"))
            mock.post(ANTHROPIC).mock(return_value=httpx.Response(200, json=answer))
            response = await client.post(
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json={**REQUEST, "stream": False},
            )
        assert response.status_code == 200, response.text
        assert response.json() == answer

    async def test_without_an_anthropic_key_bedrock_s_refusal_comes_back(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _bedrock(mocker, anthropic_key="")
        access, _ = await _signed_in(client, session, user)
        refusal = {"message": "You don't have access to the model."}
        with respx.mock(assert_all_called=False) as mock:
            mock.post(BEDROCK).mock(return_value=httpx.Response(403, json=refusal))
            anthropic = mock.post(ANTHROPIC)
            response = await client.post(
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json=REQUEST,
            )
        assert response.status_code == 403
        assert response.json() == refusal
        assert not anthropic.called

    async def test_bedrock_alone_offers_claude(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _bedrock(mocker, anthropic_key="")
        mocker.patch.object(settings, "OPENAI_API_KEY", "")
        mocker.patch.object(settings, "DESKTOP_MODELS_BY_EMAIL", {})
        mocker.patch.object(settings, "DESKTOP_MODELS", ModelPolicy.claude)
        access, _ = await _signed_in(client, session, user)
        offered = (
            await client.get(
                "/desktop/api/models/available",
                headers={"Authorization": f"Bearer {access}"},
            )
        ).json()
        assert {one["modelId"] for one in offered["data"]} >= {
            "claude-sonnet-5-5",
            "claude-haiku-5-5",
        }

    async def test_left_alone_the_setting_changes_nothing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-anthropic")
        # An AWS key on its own does not move Claude: the switch does.
        mocker.patch.object(settings, "DESKTOP_BEDROCK_ACCESS_KEY_ID", "AKIDEXAMPLE")
        mocker.patch.object(settings, "DESKTOP_BEDROCK_SECRET_ACCESS_KEY", "secret")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            bedrock = mock.post(BEDROCK)
            anthropic = mock.post(ANTHROPIC).mock(return_value=_sse())
            async with client.stream(
                "POST",
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json=REQUEST,
            ) as response:
                assert response.status_code == 200
                await response.aread()
        assert anthropic.called
        assert not bedrock.called
