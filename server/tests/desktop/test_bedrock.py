"""Claude through Amazon Bedrock (`simeon.desktop.bedrock`): with
`DESKTOP_CLAUDE_VIA=bedrock` and an AWS key, a Claude call goes to
bedrock-mantle, signed, with the model renamed; when Bedrock does not
answer with a 200 the same call goes to the Anthropic key; with the
setting left alone nothing changes."""

import json

import httpx
import pytest
import respx
from pytest_mock import MockerFixture
from structlog.testing import capture_logs

from simeon.config import settings
from simeon.desktop.bedrock import bedrock_body, bedrock_messages_url
from simeon.desktop.pricing import ModelPolicy
from simeon.models import DesktopUsage, User
from simeon.postgres import AsyncSession
from tests.desktop.test_endpoints import STREAM, _signed_in

ANTHROPIC = f"{settings.DESKTOP_ANTHROPIC_BASE_URL}/v1/messages"
BEDROCK = "https://bedrock-mantle.us-west-2.api.aws/anthropic/v1/messages"
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
    mocker.patch.object(settings, "DESKTOP_BEDROCK_ACCESS_KEY_ID", "AKIDEXAMPLE")
    mocker.patch.object(
        settings, "DESKTOP_BEDROCK_SECRET_ACCESS_KEY", "wJalrXUtnFEMI/EXAMPLEKEY"
    )


def _sse() -> httpx.Response:
    return httpx.Response(
        200, headers={"content-type": "text/event-stream"}, content=STREAM
    )


def test_the_body_is_the_same_with_the_model_renamed() -> None:
    body = json.loads(bedrock_body({**REQUEST, "output_config": {"effort": "high"}}))
    assert body["model"] == "anthropic.claude-sonnet-5-5"
    assert body["output_config"] == {"effort": "high"}
    assert body["messages"] == REQUEST["messages"]
    assert json.loads(bedrock_body(body))["model"] == "anthropic.claude-sonnet-5-5"


def test_the_address_follows_the_region(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "DESKTOP_BEDROCK_REGION", "us-east-1")
    assert (
        bedrock_messages_url()
        == "https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages"
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
        with respx.mock(assert_all_called=False) as mock:
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
        assert json.loads(sent.content)["model"] == "anthropic.claude-sonnet-5-5"
        assert sent.headers["authorization"].startswith("AWS4-HMAC-SHA256 ")
        assert "/us-west-2/bedrock-mantle/aws4_request" in sent.headers["authorization"]
        assert "x-api-key" not in sent.headers, "no Anthropic key goes to AWS"
        assert sent.headers["anthropic-beta"] == "thinking-binding-controls-2026-08-01"
        assert sent.headers["anthropic-version"]
        rows = (await session.execute(DesktopUsage.__table__.select())).all()
        assert [(row.model, row.input_tokens, row.upstream_status) for row in rows] == [
            ("claude-sonnet-5-5", 120, 200)
        ]

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
                headers={"Authorization": f"Bearer {access}"},
                json=REQUEST,
            ) as response:
                assert response.status_code == 200
                received = b"".join([chunk async for chunk in response.aiter_bytes()])
        assert received == STREAM
        sent = anthropic.calls[0].request
        assert sent.headers["x-api-key"] == "sk-anthropic"
        assert json.loads(sent.content)["model"] == "claude-sonnet-5-5"
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
