"""The agent's other three calls — web search, pictures, dictation — end
to end over HTTP (`simeon/desktop/capabilities.py`), and the speech
route's address, which these were copied from."""

import base64
import json
from collections.abc import Sequence
from typing import Any

import httpx
import pytest
import respx
from pytest_mock import MockerFixture
from sqlalchemy import Row

from simeon.config import settings
from simeon.desktop import proxy_common as proxy_common_module
from simeon.desktop.capabilities import WEB_SEARCH_MODEL, web_search_answer
from simeon.desktop.pricing import (
    IMAGE_EDIT_MODEL,
    IMAGE_MODEL,
    LEGACY_IMAGE_MODEL,
    SPEECH_MODEL,
    TRANSCRIPTION_MODEL,
    WEB_SEARCH_CALL_MODEL,
    Usage,
    credits_for,
    image_usage,
    transcription_seconds,
)
from simeon.desktop.proxy_common import UPSTREAM_REFUSED
from simeon.desktop.service import desktop
from simeon.models import DesktopUsage, User
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture

OPENAI = settings.DESKTOP_OPENAI_BASE_URL


async def _signed_in(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


async def _rows(session: AsyncSession) -> Sequence[Row[Any]]:
    return (await session.execute(DesktopUsage.__table__.select())).all()


CLAUDE_ANSWER: dict[str, Any] = {
    "id": "msg_1",
    "type": "message",
    "role": "assistant",
    "content": [
        {
            "type": "server_tool_use",
            "id": "srvtoolu_1",
            "name": "web_search",
            "input": {"query": "tide tables brest"},
        },
        {
            "type": "web_search_tool_result",
            "tool_use_id": "srvtoolu_1",
            "content": [
                {
                    "type": "web_search_result",
                    "url": "https://tides.example/brest",
                    "title": "Brest tides",
                    "encrypted_content": "x",
                },
                {
                    "type": "web_search_result",
                    "url": "https://example.org/cited",
                    "title": "Cited page",
                    "encrypted_content": "y",
                },
            ],
        },
        {
            "type": "text",
            "text": "Brest has two high tides a day.",
            "citations": [
                {
                    "type": "web_search_result_location",
                    "url": "https://example.org/cited",
                    "title": "Cited page",
                    "cited_text": " Two high tides a day at Brest. ",
                    "encrypted_index": "z",
                }
            ],
        },
        {"type": "text", "text": " The next is at 14:02."},
    ],
    "stop_reason": "end_turn",
    "usage": {
        "input_tokens": 100,
        "cache_read_input_tokens": 20,
        "output_tokens": 30,
        "server_tool_use": {"web_search_requests": 1},
    },
}

ANTHROPIC = f"{settings.DESKTOP_ANTHROPIC_BASE_URL}/v1/messages"


class TestReadingASearchAnswer:
    def test_the_answer_its_pages_and_the_count_of_searches(self) -> None:
        result = web_search_answer(CLAUDE_ANSWER)
        assert result["answer"] == (
            "Brest has two high tides a day. The next is at 14:02."
        )
        assert result["searches"] == 1
        # The cited page comes first, carrying the sentence it quotes; a
        # page the search returned but the answer did not cite follows with
        # its title and no text.
        assert result["documents"] == [
            {
                "url": "https://example.org/cited",
                "title": "Cited page",
                "text": "Two high tides a day at Brest.",
            },
            {"url": "https://tides.example/brest", "title": "Brest tides", "text": ""},
        ]
        assert "error" not in result

    def test_without_a_count_the_searches_asked_are_counted(self) -> None:
        answer = {**CLAUDE_ANSWER, "usage": {"input_tokens": 1}}
        assert web_search_answer(answer)["searches"] == 1

    def test_a_failed_search_says_why(self) -> None:
        failed = {
            "content": [
                {"type": "server_tool_use", "name": "web_search", "input": {}},
                {
                    "type": "web_search_tool_result",
                    "content": {
                        "type": "web_search_tool_result_error",
                        "error_code": "too_many_requests",
                    },
                },
            ]
        }
        result = web_search_answer(failed)
        assert result["error"] == "too_many_requests"
        assert result["documents"] == []

    def test_garbage_is_an_empty_answer_not_an_error(self) -> None:
        assert web_search_answer(None) == {"answer": "", "documents": [], "searches": 0}
        assert web_search_answer({"content": "nope"})["documents"] == []


@pytest.mark.asyncio
class TestWebSearch:
    async def test_a_search_is_made_on_claude_read_and_metered_twice(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant")
        mocker.patch.object(settings, "OPENAI_API_KEY", "")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(ANTHROPIC).mock(
                return_value=httpx.Response(200, json=CLAUDE_ANSWER)
            )
            response = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "tide tables brest", "explanation": "the person asked"},
            )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["answer"].startswith("Brest has two")
        assert [one["url"] for one in body["documents"]] == [
            "https://example.org/cited",
            "https://tides.example/brest",
        ]

        request = route.calls[0].request
        sent = json.loads(request.content)
        assert request.headers["x-api-key"] == "sk-ant"
        assert request.headers["anthropic-version"]
        assert "authorization" not in request.headers
        assert sent["model"] == WEB_SEARCH_MODEL.model_id == "claude-haiku-5-5"
        assert sent["messages"] == [{"role": "user", "content": "tide tables brest"}]
        assert sent["tools"] == [
            {"type": "web_search_20250305", "name": "web_search", "max_uses": 3}
        ]
        assert "stream" not in sent

        rows = {row.model: row for row in await _rows(session)}
        assert set(rows) == {WEB_SEARCH_MODEL.model_id, WEB_SEARCH_CALL_MODEL.model_id}
        tokens = rows[WEB_SEARCH_MODEL.model_id]
        assert (
            tokens.input_tokens,
            tokens.cache_read_tokens,
            tokens.output_tokens,
        ) == (
            100,
            20,
            30,
        )
        assert tokens.credits == credits_for(
            WEB_SEARCH_MODEL,
            Usage(input_tokens=100, output_tokens=30, cache_read_tokens=20),
        )
        calls = rows[WEB_SEARCH_CALL_MODEL.model_id]
        assert WEB_SEARCH_CALL_MODEL.model_id == "claude-web-search"
        assert calls.input_tokens == 1
        assert calls.credits == credits_for(
            WEB_SEARCH_CALL_MODEL, Usage(input_tokens=1)
        )
        assert calls.credits > 0

    async def test_a_cheap_model_that_refuses_is_asked_again_on_sonnet(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant")
        headers = await _signed_in(client, session, user)
        refusal = {
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "message": "web_search is not supported",
            },
        }
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(ANTHROPIC).mock(
                side_effect=[
                    httpx.Response(400, json=refusal),
                    httpx.Response(200, json=CLAUDE_ANSWER),
                ]
            )
            response = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "tide tables brest"},
            )
        assert response.status_code == 200, response.text
        second = json.loads(route.calls[1].request.content)
        assert second["model"] == "claude-sonnet-5-5"
        assert second["tools"][0]["type"] == "web_search_20260209"
        rows = sorted((row.model, row.upstream_status) for row in await _rows(session))
        assert rows == [
            ("claude-haiku-5-5", 400),
            ("claude-sonnet-5-5", 200),
            ("claude-web-search", 200),
        ]

    async def test_a_search_that_found_nothing_because_it_failed_is_a_502(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant")
        headers = await _signed_in(client, session, user)
        failed = {
            "content": [
                {"type": "server_tool_use", "name": "web_search", "input": {}},
                {
                    "type": "web_search_tool_result",
                    "content": {
                        "type": "web_search_tool_result_error",
                        "error_code": "unavailable",
                    },
                },
            ],
            "usage": {"input_tokens": 10, "output_tokens": 0},
        }
        with respx.mock(assert_all_called=True) as mock:
            mock.post(ANTHROPIC).mock(return_value=httpx.Response(200, json=failed))
            response = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "anything"},
            )
        assert response.status_code == 502
        assert "unavailable" in response.json()["error"]["message"]

    async def test_nothing_to_search_for_is_refused_before_claude(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(ANTHROPIC)
            for body in ({}, {"query": "   "}, {"query": "x" * 1001}):
                response = await client.post(
                    "/desktop/api/proxy/v1/web/search", headers=headers, json=body
                )
                assert response.status_code == 400
                assert response.json()["error"]["type"] == "invalid_request_error"
            assert not route.called
        assert await _rows(session) == []

    async def test_a_refusal_is_handed_back_written_down_and_costs_nothing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant")
        warn = mocker.patch.object(proxy_common_module.log, "warning")
        headers = await _signed_in(client, session, user)
        refusal = {
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "message": "web_search is not available.",
            },
        }
        with respx.mock(assert_all_called=True) as mock:
            mock.post(ANTHROPIC).mock(return_value=httpx.Response(400, json=refusal))
            response = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "anything"},
            )
        assert response.status_code == 400
        assert response.json() == refusal
        logged = [c for c in warn.call_args_list if c.args[0] == UPSTREAM_REFUSED]
        assert [one.kwargs["model"] for one in logged] == [
            "claude-haiku-5-5",
            "claude-sonnet-5-5",
        ]
        assert "web_search" in logged[0].kwargs["body"]
        rows = await _rows(session)
        assert [(row.upstream_status, row.credits) for row in rows] == [
            (400, 0),
            (400, 0),
        ]

    async def test_without_a_key_or_with_no_credits_left_nothing_is_called(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(ANTHROPIC)
            mocker.patch.object(settings, "ANTHROPIC_API_KEY", "")
            response = await client.post(
                "/desktop/api/proxy/v1/web/search", headers=headers, json={"query": "a"}
            )
            assert response.status_code == 503
            # Bedrock alone serves Claude but no web search: the Anthropic key it is.
            mocker.patch.object(settings, "DESKTOP_CLAUDE_VIA", "bedrock")
            mocker.patch.object(settings, "DESKTOP_BEDROCK_ACCESS_KEY_ID", "AKIA")
            mocker.patch.object(settings, "DESKTOP_BEDROCK_SECRET_ACCESS_KEY", "secret")
            response = await client.post(
                "/desktop/api/proxy/v1/web/search", headers=headers, json={"query": "a"}
            )
            assert response.status_code == 503

            mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-ant")
            await save_fixture(
                DesktopUsage(
                    user_id=user.id,
                    model="gpt-5.6-terra",
                    credits=settings.DESKTOP_MONTHLY_CREDITS,
                    upstream_status=200,
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/web/search", headers=headers, json={"query": "a"}
            )
            assert response.status_code == 402
            assert not route.called

    async def test_signed_out_is_refused(self, client: httpx.AsyncClient) -> None:
        response = await client.post(
            "/desktop/api/proxy/v1/web/search", json={"query": "a"}
        )
        assert response.status_code == 401


IMAGE_ANSWER: dict[str, Any] = {
    "created": 1_700_000_000,
    "data": [{"b64_json": base64.b64encode(b"\x89PNG not really").decode()}],
    "usage": {
        "input_tokens": 50,
        "input_tokens_details": {"text_tokens": 30, "image_tokens": 20},
        "output_tokens": 1000,
    },
}


class TestPricingAPicture:
    def test_reference_image_tokens_are_weighed_at_their_own_price(self) -> None:
        usage = image_usage(IMAGE_ANSWER["usage"])
        # 30 text tokens plus 20 image tokens at 8/5 a text token's price.
        assert usage == Usage(input_tokens=62, output_tokens=1000)
        assert credits_for(IMAGE_MODEL, usage) > credits_for(
            IMAGE_MODEL, Usage(input_tokens=50, output_tokens=1000)
        )
        # gpt-image-1 charged twice a text token's price for them.
        assert image_usage(IMAGE_ANSWER["usage"], LEGACY_IMAGE_MODEL) == Usage(
            input_tokens=70, output_tokens=1000
        )

    def test_the_new_model_costs_less_than_the_one_before(self) -> None:
        # $30 a million picture tokens against gpt-image-1's $40.
        picture = Usage(input_tokens=50, output_tokens=1000)
        assert credits_for(IMAGE_MODEL, picture) < credits_for(
            LEGACY_IMAGE_MODEL, picture
        )
        assert credits_for(IMAGE_EDIT_MODEL, picture) == credits_for(
            IMAGE_MODEL, picture
        )

    def test_an_undetailed_or_missing_usage_still_counts_what_it_can(self) -> None:
        assert image_usage({"input_tokens": 12, "output_tokens": 3}) == Usage(
            input_tokens=12, output_tokens=3
        )
        assert image_usage(None) == Usage()


@pytest.mark.asyncio
class TestImages:
    async def test_a_description_becomes_a_picture_and_is_metered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{OPENAI}/v1/images/generations").mock(
                return_value=httpx.Response(200, json=IMAGE_ANSWER)
            )
            response = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={"prompt": "a lighthouse at dusk", "size": "1536x1024"},
            )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["data"] == [
            {"b64_json": IMAGE_ANSWER["data"][0]["b64_json"], "mime_type": "image/png"}
        ]
        sent = json.loads(route.calls[0].request.content)
        assert sent == {
            "model": "gpt-image-2.5-flare",
            "prompt": "a lighthouse at dusk",
            "n": 1,
            "size": "1536x1024",
            # "auto" was asked (by saying nothing): the new model's dearer
            # levels are never chosen for us.
            "quality": "medium",
        }
        rows = await _rows(session)
        assert len(rows) == 1
        assert rows[0].model == "gpt-image-2.5-flare"
        assert (rows[0].input_tokens, rows[0].output_tokens) == (62, 1000)
        assert rows[0].credits == credits_for(
            IMAGE_MODEL, Usage(input_tokens=62, output_tokens=1000)
        )

    async def test_a_reference_image_sends_the_call_to_edits_as_multipart(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        reference = base64.b64encode(b"\xff\xd8 jpeg bytes").decode()
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{OPENAI}/v1/images/edits").mock(
                return_value=httpx.Response(200, json=IMAGE_ANSWER)
            )
            response = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={
                    "prompt": "the same house in winter",
                    "reference_images": [
                        {"data": reference, "mime_type": "image/jpeg"}
                    ],
                },
            )
        assert response.status_code == 200, response.text
        sent = route.calls[0].request
        assert sent.headers["content-type"].startswith("multipart/form-data")
        assert b'name="image[]"' in sent.content
        assert b"\xff\xd8 jpeg bytes" in sent.content
        assert b'name="model"\r\n\r\ngpt-image-2.5-sunburst' in sent.content
        rows = await _rows(session)
        assert [row.model for row in rows] == ["gpt-image-2.5-sunburst"]

    async def test_a_quality_asked_for_is_kept(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{OPENAI}/v1/images/generations").mock(
                return_value=httpx.Response(200, json=IMAGE_ANSWER)
            )
            response = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={"prompt": "a face", "size": "1024x1024", "quality": "low"},
            )
        assert response.status_code == 200, response.text
        assert json.loads(route.calls[0].request.content)["quality"] == "low"

    @pytest.mark.parametrize(
        ("status", "error"),
        [
            (404, {"message": "The model does not exist.", "code": "model_not_found"}),
            (403, {"message": "Your organization must be verified to use this model."}),
            (400, {"message": "Invalid model.", "param": "model"}),
        ],
    )
    async def test_a_model_this_account_is_not_served_falls_back_to_the_one_before(
        self,
        status: int,
        error: dict[str, Any],
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{OPENAI}/v1/images/generations").mock(
                side_effect=[
                    httpx.Response(status, json={"error": error}),
                    httpx.Response(200, json=IMAGE_ANSWER),
                ]
            )
            response = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={"prompt": "a lighthouse at dusk"},
            )
        assert response.status_code == 200, response.text
        models = [json.loads(call.request.content)["model"] for call in route.calls]
        assert models == ["gpt-image-2.5-flare", "gpt-image-1"]
        rows = await _rows(session)
        assert [(row.model, row.input_tokens) for row in rows] == [("gpt-image-1", 70)]
        assert rows[0].credits == credits_for(
            LEGACY_IMAGE_MODEL, Usage(input_tokens=70, output_tokens=1000)
        )

    async def test_bad_arguments_are_refused_before_openai(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            generations = mock.post(f"{OPENAI}/v1/images/generations")
            edits = mock.post(f"{OPENAI}/v1/images/edits")
            for body in (
                {},
                {"prompt": "x", "size": "4000x4000"},
                {"prompt": "x", "quality": "ultra"},
                {
                    "prompt": "x",
                    "reference_images": [
                        {"data": "not base64!", "mime_type": "image/png"}
                    ],
                },
                {
                    "prompt": "x",
                    "reference_images": [{"data": "AA==", "mime_type": "image/gif"}],
                },
            ):
                response = await client.post(
                    "/desktop/api/proxy/v1/images/generations",
                    headers=headers,
                    json=body,
                )
                assert response.status_code == 400, body
            assert not generations.called
            assert not edits.called

    async def test_a_refusal_is_handed_back_and_costs_nothing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        refusal = {
            "error": {"message": "Your request was rejected by the safety system."}
        }
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{OPENAI}/v1/images/generations").mock(
                return_value=httpx.Response(400, json=refusal)
            )
            response = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={"prompt": "something"},
            )
        assert response.status_code == 400
        assert response.json() == refusal
        # A refused description is not a refused model: no second try.
        assert route.call_count == 1
        rows = await _rows(session)
        assert [(row.upstream_status, row.credits) for row in rows] == [(400, 0)]


class TestPricingDictation:
    def test_seconds_are_rounded_up_and_never_zero(self) -> None:
        assert transcription_seconds({"usage": {"type": "duration", "seconds": 4}}) == 4
        assert (
            transcription_seconds({"usage": {"type": "duration", "seconds": 4.2}}) == 5
        )
        assert transcription_seconds({"text": "hi"}) == 1
        assert transcription_seconds(None) == 1
        assert credits_for(TRANSCRIPTION_MODEL, Usage(input_tokens=1)) > 0


@pytest.mark.asyncio
class TestTranscriptions:
    async def test_audio_goes_up_as_multipart_and_comes_back_as_text(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{OPENAI}/v1/audio/transcriptions").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "text": "hello there",
                        "usage": {"type": "duration", "seconds": 3},
                    },
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/audio/transcriptions",
                headers=headers,
                files={"file": ("dictation.webm", b"webm bytes", "audio/webm")},
                data={"language": "en-US"},
            )
        assert response.status_code == 200, response.text
        assert response.json() == {"text": "hello there", "seconds": 3}
        sent = route.calls[0].request
        assert sent.headers["authorization"] == "Bearer sk-openai"
        assert sent.headers["content-type"].startswith("multipart/form-data")
        assert b"webm bytes" in sent.content
        assert TRANSCRIPTION_MODEL.model_id.encode() in sent.content
        # A language, when one is sent (the app sends none since 24 September
        # 2026), reaches OpenAI as the two letters it takes.
        assert b'name="language"\r\n\r\nen\r\n' in sent.content
        rows = await _rows(session)
        assert len(rows) == 1
        assert rows[0].model == TRANSCRIPTION_MODEL.model_id
        assert rows[0].input_tokens == 3
        assert rows[0].credits == credits_for(
            TRANSCRIPTION_MODEL, Usage(input_tokens=3)
        )

    async def test_empty_audio_is_refused_before_openai(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(f"{OPENAI}/v1/audio/transcriptions")
            response = await client.post(
                "/desktop/api/proxy/v1/audio/transcriptions",
                headers=headers,
                files={"file": ("empty.webm", b"", "audio/webm")},
            )
            assert response.status_code == 400
            assert not route.called

    async def test_a_refusal_is_handed_back_and_costs_nothing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        refusal = {"error": {"message": "Unrecognized file format."}}
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{OPENAI}/v1/audio/transcriptions").mock(
                return_value=httpx.Response(400, json=refusal)
            )
            response = await client.post(
                "/desktop/api/proxy/v1/audio/transcriptions",
                headers=headers,
                files={"file": ("x.bin", b"???", "application/octet-stream")},
            )
        assert response.status_code == 400
        assert response.json() == refusal
        rows = await _rows(session)
        assert [(row.upstream_status, row.credits) for row in rows] == [(400, 0)]


@pytest.mark.asyncio
class TestSpeechAddress:
    async def test_speech_is_asked_for_at_v1_where_openai_answers(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """Until 19 September the route posted to `/audio/speech` with no
        `/v1`, which OpenAI does not serve. Measured against the wire the
        other routes use (`upstream_path="/v1/responses"`), not recalled."""
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{OPENAI}/v1/audio/speech").mock(
                return_value=httpx.Response(
                    200, content=b"mp3", headers={"content-type": "audio/mpeg"}
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/audio/speech",
                headers=headers,
                json={"input": "Good evening."},
            )
        assert response.status_code == 200
        assert response.content == b"mp3"
        rows = await _rows(session)
        assert [row.model for row in rows] == [SPEECH_MODEL.model_id]
