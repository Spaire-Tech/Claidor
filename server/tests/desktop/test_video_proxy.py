"""Watching a video: the Gemini door on the model proxy
(`polar/desktop/endpoints.py`, `proxy_gemini_generate`; the parsing in
`polar/desktop/video.py`), end to end over HTTP against a fake Google,
and the video model in the two model lists."""

import json
from collections.abc import Sequence
from typing import Any

import httpx
import pytest
import respx
from pytest_mock import MockerFixture
from sqlalchemy import Row

from polar.config import settings
from polar.desktop.pricing import (
    GeminiUsageTally,
    Usage,
    credits_for,
    model_by_id,
    video_models,
)
from polar.desktop.service import desktop, offered_models
from polar.desktop.video import count_video_parts, parse_gemini_call
from polar.models import DesktopUsage, User
from polar.postgres import AsyncSession

GEMINI = settings.DESKTOP_GEMINI_BASE_URL
FLASH = "gemini-2.5-flash"
FLASH_MODEL = model_by_id(FLASH)
assert FLASH_MODEL is not None

#: A request the way the box's executor writes it
#: (`gemini-direct-generate.ts`): the video inline with its frame rate.
VIDEO_REQUEST: dict[str, Any] = {
    "systemInstruction": {
        "parts": [{"text": "You are Simeon running as the watchVideo subagent."}]
    },
    "contents": [
        {
            "role": "user",
            "parts": [
                {"text": "What happens in this clip?"},
                {
                    "inlineData": {"mimeType": "video/mp4", "data": "AAAAGGZ0eXBtcDQy"},
                    "videoMetadata": {"fps": 4},
                },
            ],
        }
    ],
}

ANSWER: dict[str, Any] = {
    "candidates": [
        {
            "content": {
                "role": "model",
                "parts": [{"text": "A cat knocks a glass off a table."}],
            },
            "finishReason": "STOP",
        }
    ],
    "usageMetadata": {
        "promptTokenCount": 1000,
        "cachedContentTokenCount": 100,
        "candidatesTokenCount": 20,
        "thoughtsTokenCount": 5,
        "totalTokenCount": 1025,
    },
    "responseId": "resp-video-1",
}


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


class TestParsingTheCall:
    def test_the_path_segment_names_the_model_and_the_method(self) -> None:
        call = parse_gemini_call("gemini-2.5-flash:streamGenerateContent")
        assert call is not None
        assert (call.model_id, call.method, call.stream) == (
            FLASH,
            "streamGenerateContent",
            True,
        )
        assert (
            call.upstream_path
            == "/v1beta/models/gemini-2.5-flash:streamGenerateContent"
        )
        single = parse_gemini_call("gemini-2.5-pro:generateContent")
        assert single is not None
        assert single.stream is False

    def test_anything_else_is_not_a_gemini_call(self) -> None:
        for segment in (
            "gemini-2.5-flash",
            ":generateContent",
            "x:countTokens",
            "x:embedContent",
        ):
            assert parse_gemini_call(segment) is None

    def test_the_video_parts_are_counted_in_either_spelling(self) -> None:
        parts = count_video_parts(VIDEO_REQUEST)
        assert (parts.inline, parts.file_uri, parts.fps) == (1, 0, (4.0,))
        assert parts.inline_bytes == len("AAAAGGZ0eXBtcDQy") * 3 // 4
        snake = {
            "contents": [
                {
                    "parts": [
                        {
                            "file_data": {
                                "mime_type": "video/webm",
                                "file_uri": "https://x/y",
                            },
                            "video_metadata": {"fps": 0.5},
                        },
                        {"inline_data": {"mime_type": "image/png", "data": "AAAA"}},
                    ]
                }
            ]
        }
        parts = count_video_parts(snake)
        assert (parts.inline, parts.file_uri, parts.fps) == (0, 1, (0.5,))
        assert count_video_parts(None) == count_video_parts({"contents": "nope"})


class TestReadingGeminiUsage:
    def test_the_answer_is_read_like_the_other_providers(self) -> None:
        usage = Usage.from_gemini_payload(ANSWER["usageMetadata"])
        # The cached part comes out of the prompt count, and thinking is
        # billed as output.
        assert usage == Usage(input_tokens=900, output_tokens=25, cache_read_tokens=100)
        assert Usage.from_gemini_payload(None) == Usage()

    def test_a_stream_keeps_the_last_cumulative_usage(self) -> None:
        tally = GeminiUsageTally()
        first = {
            "candidates": [{"content": {"parts": [{"text": "A "}]}}],
            "usageMetadata": {"promptTokenCount": 1000, "candidatesTokenCount": 1},
        }
        last = {
            "candidates": [{"content": {"parts": [{"text": "cat."}]}}],
            "usageMetadata": {
                "promptTokenCount": 1000,
                "candidatesTokenCount": 3,
                "thoughtsTokenCount": 2,
            },
        }
        tally.feed(f"data: {json.dumps(first)}\r\n\r\n".encode())
        tally.feed(f"data: {json.dumps(last)}\r\n\r\n".encode())
        assert tally.finish() == Usage(input_tokens=1000, output_tokens=5)

    def test_the_video_model_is_priced_on_its_own_list(self) -> None:
        usage = Usage(input_tokens=900, output_tokens=25, cache_read_tokens=100)
        credits = credits_for(FLASH_MODEL, usage)
        assert credits > 0
        assert FLASH_MODEL.provider.value == "gemini"
        assert FLASH_MODEL.supports_video is True
        assert FLASH_MODEL.available()["supportsVideo"] is True
        assert FLASH_MODEL.available()["transportApi"] == "gemini-generate-content"


@pytest.mark.asyncio
class TestTheModelLists:
    async def test_no_gemini_key_means_no_video_model_anywhere(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "GEMINI_API_KEY", "")
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        catalog = (await client.get("/desktop/api/models/pricing-catalog")).json()[
            "data"
        ]
        assert catalog["videoModels"] == []
        rows = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()["data"]
        assert all(row["supportsVideo"] is False for row in rows)
        assert video_models(offered_models()) == ()

    async def test_a_gemini_key_offers_flash_as_the_video_model(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "GEMINI_API_KEY", "AIza-test")
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        catalog = (await client.get("/desktop/api/models/pricing-catalog")).json()[
            "data"
        ]
        assert [one["modelId"] for one in catalog["videoModels"]] == [FLASH]
        assert catalog["videoModels"][0]["provider"] == "gemini"
        rows = {
            row["modelId"]: row
            for row in (
                await client.get("/desktop/api/models/available", headers=headers)
            ).json()["data"]
        }
        assert rows[FLASH]["supportsVideo"] is True
        assert rows[FLASH]["role"] == "video"
        # Pro is priced, not offered: no role.
        assert "gemini-2.5-pro" not in rows
        # The OpenAI-compatible menu does not name it: that wire cannot reach it.
        openai_menu = (
            await client.get("/desktop/api/proxy/v1/models", headers=headers)
        ).json()
        assert FLASH not in {one["id"] for one in openai_menu["data"]}


@pytest.mark.asyncio
class TestTheGeminiDoor:
    async def test_one_answer_is_forwarded_with_the_key_and_metered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "GEMINI_API_KEY", "AIza-test")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{GEMINI}/v1beta/models/{FLASH}:generateContent").mock(
                return_value=httpx.Response(200, json=ANSWER)
            )
            response = await client.post(
                f"/desktop/api/proxy/v1beta/models/{FLASH}:generateContent",
                headers=headers,
                json=VIDEO_REQUEST,
            )
        assert response.status_code == 200, response.text
        assert response.json() == ANSWER

        sent = route.calls[0].request
        assert sent.headers["x-goog-api-key"] == "AIza-test"
        assert "authorization" not in sent.headers
        # The body goes through untouched: the video, its mime type and
        # its frame rate reach Google as the box wrote them.
        assert json.loads(sent.content) == VIDEO_REQUEST

        rows = await _rows(session)
        assert len(rows) == 1
        row = rows[0]
        assert (row.model, row.provider) == (FLASH, "gemini")
        assert (row.input_tokens, row.cache_read_tokens, row.output_tokens) == (
            900,
            100,
            25,
        )
        assert row.credits == credits_for(
            FLASH_MODEL,
            Usage(input_tokens=900, output_tokens=25, cache_read_tokens=100),
        )
        assert row.stream is False
        assert row.upstream_status == 200

    async def test_a_stream_is_relayed_with_its_query_and_metered_off_the_last_chunk(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "GEMINI_API_KEY", "AIza-test")
        headers = await _signed_in(client, session, user)
        chunks = [
            {
                "candidates": [
                    {"content": {"role": "model", "parts": [{"text": "A cat "}]}}
                ],
                "usageMetadata": {"promptTokenCount": 1000, "candidatesTokenCount": 2},
            },
            {
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [{"text": "knocks a glass off."}],
                        },
                        "finishReason": "STOP",
                    }
                ],
                "usageMetadata": {
                    "promptTokenCount": 1000,
                    "cachedContentTokenCount": 100,
                    "candidatesTokenCount": 20,
                    "thoughtsTokenCount": 5,
                },
            },
        ]
        body = "".join(f"data: {json.dumps(chunk)}\r\n\r\n" for chunk in chunks)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                f"{GEMINI}/v1beta/models/{FLASH}:streamGenerateContent",
                params={"alt": "sse"},
            ).mock(
                return_value=httpx.Response(
                    200,
                    content=body.encode(),
                    headers={"content-type": "text/event-stream"},
                )
            )
            response = await client.post(
                f"/desktop/api/proxy/v1beta/models/{FLASH}:streamGenerateContent?alt=sse",
                headers=headers,
                json=VIDEO_REQUEST,
            )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.text == body
        assert route.calls[0].request.url.params["alt"] == "sse"

        rows = await _rows(session)
        assert len(rows) == 1
        row = rows[0]
        assert row.stream is True
        assert (row.input_tokens, row.cache_read_tokens, row.output_tokens) == (
            900,
            100,
            25,
        )

    async def test_no_key_is_503_before_google_and_costs_nothing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "GEMINI_API_KEY", "")
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(f"{GEMINI}/v1beta/models/{FLASH}:streamGenerateContent")
            response = await client.post(
                f"/desktop/api/proxy/v1beta/models/{FLASH}:streamGenerateContent?alt=sse",
                headers=headers,
                json=VIDEO_REQUEST,
            )
            assert not route.called
        assert response.status_code == 503
        assert (
            response.json()["error"]["message"]
            == "The model service is not configured."
        )
        assert await _rows(session) == []

    async def test_a_model_not_served_by_gemini_is_refused_on_this_wire(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "GEMINI_API_KEY", "AIza-test")
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        headers = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/proxy/v1beta/models/gpt-5.6-luna:generateContent",
            headers=headers,
            json=VIDEO_REQUEST,
        )
        assert response.status_code == 400
        assert "gemini-generate-content" in response.json()["error"]["message"]
        response = await client.post(
            "/desktop/api/proxy/v1beta/models/gemini-9:generateContent",
            headers=headers,
            json=VIDEO_REQUEST,
        )
        assert response.status_code == 400
        response = await client.post(
            f"/desktop/api/proxy/v1beta/models/{FLASH}:countTokens",
            headers=headers,
            json=VIDEO_REQUEST,
        )
        assert response.status_code == 404
        assert await _rows(session) == []

    async def test_the_hourly_brake_holds_on_this_door_too(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "GEMINI_API_KEY", "AIza-test")
        headers = await _signed_in(client, session, user)
        # One earlier call that spent the hour's budget.
        await desktop.record_usage(
            session,
            user_id=user.id,
            session_id=None,
            model=FLASH_MODEL,
            usage=Usage(input_tokens=settings.DESKTOP_HOURLY_CREDITS * 20),
            stream=False,
            upstream_status=200,
        )
        await session.commit()
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(f"{GEMINI}/v1beta/models/{FLASH}:generateContent")
            response = await client.post(
                f"/desktop/api/proxy/v1beta/models/{FLASH}:generateContent",
                headers=headers,
                json=VIDEO_REQUEST,
            )
            assert not route.called
        assert response.status_code == 402
        assert response.json()["error"]["type"] == "quota_exhausted"

    async def test_a_refusal_from_google_is_handed_back_and_written_down(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "GEMINI_API_KEY", "AIza-test")
        from polar.desktop import proxy_common as proxy_common_module

        warn = mocker.patch.object(proxy_common_module.log, "warning")
        headers = await _signed_in(client, session, user)
        refusal = {
            "error": {
                "code": 400,
                "message": "Unable to process input video.",
                "status": "INVALID_ARGUMENT",
            }
        }
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{GEMINI}/v1beta/models/{FLASH}:generateContent").mock(
                return_value=httpx.Response(400, json=refusal)
            )
            response = await client.post(
                f"/desktop/api/proxy/v1beta/models/{FLASH}:generateContent",
                headers=headers,
                json=VIDEO_REQUEST,
            )
        assert response.status_code == 400
        assert response.json() == refusal
        assert warn.call_args.kwargs["provider"] == "gemini"
        assert "Unable to process input video" in warn.call_args.kwargs["body"]
        rows = await _rows(session)
        assert len(rows) == 1
        assert rows[0].credits == 0
        assert rows[0].upstream_status == 400
