"""The desktop app's sign-in and proxy, end to end over HTTP
(`polar/desktop/endpoints.py`)."""

import io
import json
import re
import zipfile
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from polar.config import settings
from polar.desktop import proxy_common as proxy_common_module
from polar.desktop.proxy_common import UPSTREAM_REFUSED
from polar.desktop.service import (
    Usage,
    UsageTally,
    credits_for,
    desktop,
    model_by_id,
)
from polar.desktop.skill_store import (
    NOT_OFFERED,
    SKILLS_ROOT,
    skill_md_with_version,
)
from polar.desktop.skill_store import catalog as skill_store_catalog
from polar.kit.crypto import generate_token_hash_pair
from polar.kit.utils import utc_now
from polar.models import (
    DesktopSession,
    DesktopUsage,
    PersonalAccessToken,
    User,
)
from polar.personal_access_token.service import TOKEN_PREFIX as PAT_TOKEN_PREFIX
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture

CALLBACK = "http://127.0.0.1:51234/auth/callback?return_to=http%3A%2F%2F127.0.0.1%3A8000%2Fdesktop%2Flogin"


async def _signed_in(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> tuple[str, str]:
    """An access and refresh token for the user, through the code."""
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    body = response.json()
    assert body["code"] == 0, body
    return body["data"]["accessToken"], body["data"]["refreshToken"]


@pytest.mark.asyncio
class TestLogin:
    async def test_anonymous_is_sent_to_the_web_login_and_asked_back(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.get(
            "/desktop/login",
            params={"redirect_uri": CALLBACK, "state": "abc", "source": "electron"},
            follow_redirects=False,
        )
        assert response.status_code == 303
        location = urlparse(response.headers["location"])
        assert location.path == "/login"
        return_to = parse_qs(location.query)["return_to"][0]
        assert return_to.startswith(settings.generate_external_url("/desktop/login?"))
        assert "state=abc" in return_to
        assert "redirect_uri=" in return_to

    @pytest.mark.auth
    async def test_a_signed_in_person_gets_a_code_at_the_app_s_callback(
        self, client: httpx.AsyncClient, user: User, session: AsyncSession
    ) -> None:
        response = await client.get(
            "/desktop/login",
            params={"redirect_uri": CALLBACK, "state": "abc"},
            follow_redirects=False,
        )
        assert response.status_code == 303
        location = urlparse(response.headers["location"])
        assert location.scheme == "http"
        assert location.netloc == "127.0.0.1:51234"
        assert location.path == "/auth/callback"
        query = parse_qs(location.query)
        assert query["state"] == ["abc"]
        assert "return_to" in query
        code = query["code"][0]
        assert code.startswith("claidor_dc_")

        exchanged = await client.post(
            "/desktop/api/auth/exchange", json={"authCode": code}
        )
        body = exchanged.json()
        assert body["code"] == 0
        assert body["data"]["user"]["email"] == user.email
        assert body["data"]["user"]["accountMode"] == "personal"
        assert body["data"]["quota"]["creditsLimit"] == settings.DESKTOP_MONTHLY_CREDITS

    @pytest.mark.auth
    async def test_without_a_redirect_the_code_goes_to_the_deep_link(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.get("/desktop/login", follow_redirects=False)
        assert response.status_code == 303
        assert response.headers["location"].startswith("caisra://auth/callback?code=")

    @pytest.mark.auth
    async def test_a_foreign_callback_gets_nothing(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.get(
            "/desktop/login",
            params={"redirect_uri": "https://evil.example/auth/callback"},
            follow_redirects=False,
        )
        assert response.status_code == 400


@pytest.mark.asyncio
class TestExchange:
    async def test_a_code_is_single_use_and_short_lived(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        code = await desktop.create_auth_code(session, user)
        await session.commit()
        first = await client.post("/desktop/api/auth/exchange", json={"authCode": code})
        assert first.json()["code"] == 0
        second = await client.post(
            "/desktop/api/auth/exchange", json={"authCode": code}
        )
        assert second.status_code == 200
        assert second.json()["code"] == 40101

        bad = await client.post(
            "/desktop/api/auth/exchange", json={"authCode": "claidor_dc_nonsense"}
        )
        assert bad.json()["code"] == 40101


@pytest.mark.asyncio
class TestSession:
    async def test_the_bearer_opens_profile_quota_and_models(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-anthropic")
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}

        profile = await client.get("/desktop/api/user/profile", headers=headers)
        assert profile.json()["data"]["email"] == user.email

        quota = await client.get("/desktop/api/user/quota", headers=headers)
        data = quota.json()["data"]
        assert data["creditsUsed"] == 0
        assert data["creditsRemaining"] == settings.DESKTOP_MONTHLY_CREDITS
        assert data["subscriptionStatus"] == "free"

        summary = await client.get("/desktop/api/user/profile-summary", headers=headers)
        assert summary.json()["data"]["creditItems"][0]["type"] == "free"

        models = await client.get("/desktop/api/models/available", headers=headers)
        rows = models.json()["data"]
        assert {row["modelId"] for row in rows} == {
            "claude-sonnet-5",
            "claude-opus-5",
            "claude-haiku-4-5-20251001",
        }
        assert all(row["apiFormat"] == "anthropic" for row in rows)

    async def test_no_bearer_is_401(self, client: httpx.AsyncClient) -> None:
        response = await client.get("/desktop/api/user/profile")
        assert response.status_code == 401
        response = await client.get(
            "/desktop/api/user/profile", headers={"Authorization": "Bearer nope"}
        )
        assert response.status_code == 401

    async def test_the_pricing_catalogue_is_public(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-anthropic")
        response = await client.get("/desktop/api/models/pricing-catalog")
        body = response.json()
        assert body["code"] == 0
        assert len(body["data"]["textModels"]) == 3
        assert body["data"]["imageModels"] == []

    async def test_banners_are_empty_and_well_formed(
        self, client: httpx.AsyncClient
    ) -> None:
        assert (await client.get("/desktop/api/client-banners/active-list")).json() == {
            "code": 0,
            "data": [],
        }
        assert (await client.get("/desktop/api/client-banners/active")).json()[
            "data"
        ] is None
        snapshot = (await client.get("/desktop/api/client-banners/snapshot")).json()[
            "data"
        ]
        assert snapshot["banners"] == []

    async def test_the_kit_store_is_empty_and_updates_say_nothing_newer(
        self, client: httpx.AsyncClient
    ) -> None:
        for path in ("/desktop/api/updates/check", "/desktop/api/updates/check-manual"):
            assert (await client.get(path)).json() == {
                "code": 0,
                "data": {"value": None},
            }
        kits = (await client.get("/desktop/api/kit-store")).json()
        assert kits["data"]["value"] == {"kits": []}

    async def test_the_mcp_catalogue_is_served_and_usage_events_are_swallowed(
        self, client: httpx.AsyncClient
    ) -> None:
        body = (await client.get("/desktop/api/mcp-marketplace")).json()
        assert body["code"] == 0
        value = body["data"]["value"]
        assert [c["id"] for c in value["categories"]][:2] == ["all", "search"]
        assert {s["id"] for s in value["servers"]} >= {"github", "slack", "notion"}
        assert all("description_en" in s for s in value["servers"])
        pinged = await client.get(
            "/desktop/api/analytics/events", params={"action": "maties_app_started"}
        )
        assert pinged.status_code == 204

    async def test_every_account_is_personal(self, client: httpx.AsyncClient) -> None:
        response = await client.get("/desktop/api/enterprise/context")
        assert response.status_code == 404
        assert response.json()["code"] == 41602

    async def test_there_are_no_activities(self, client: httpx.AsyncClient) -> None:
        slot = (await client.get("/desktop/api/client-activities/slot")).json()
        assert slot["code"] == 0
        assert slot["data"]["slotState"] == "empty"
        assert "activity" not in slot["data"]
        context = await client.get("/desktop/api/client-activities/daily/context")
        assert context.status_code == 404
        assert context.json()["code"] == 404
        action = await client.post(
            "/desktop/api/client-activities/daily/actions/claim", json={}
        )
        assert action.status_code == 404

    async def test_refresh_rotates_and_the_old_refresh_token_dies(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, refresh = await _signed_in(client, session, user)
        rotated = await client.post(
            "/desktop/api/auth/refresh", json={"refreshToken": refresh}
        )
        body = rotated.json()
        assert body["code"] == 0
        assert body["data"]["accessToken"] != access
        assert body["data"]["refreshToken"] != refresh

        again = await client.post(
            "/desktop/api/auth/refresh", json={"refreshToken": refresh}
        )
        assert again.status_code == 401
        assert again.json()["code"] == 40102

        old = await client.get(
            "/desktop/api/user/profile", headers={"Authorization": f"Bearer {access}"}
        )
        assert old.status_code == 401
        new = await client.get(
            "/desktop/api/user/profile",
            headers={"Authorization": f"Bearer {body['data']['accessToken']}"},
        )
        assert new.status_code == 200

    async def test_an_expired_access_token_is_401(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        mocker.patch.object(settings, "DESKTOP_ACCESS_TOKEN_TTL", timedelta(seconds=-1))
        stale, _ = await _signed_in(client, session, user)
        assert (
            await client.get(
                "/desktop/api/user/profile",
                headers={"Authorization": f"Bearer {stale}"},
            )
        ).status_code == 401
        assert (
            await client.get(
                "/desktop/api/user/profile",
                headers={"Authorization": f"Bearer {access}"},
            )
        ).status_code == 200

    async def test_logout_revokes(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, refresh = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        assert (await client.post("/desktop/api/auth/logout", headers=headers)).json()[
            "code"
        ] == 0
        assert (
            await client.get("/desktop/api/user/profile", headers=headers)
        ).status_code == 401
        assert (
            await client.post(
                "/desktop/api/auth/refresh", json={"refreshToken": refresh}
            )
        ).status_code == 401


STREAM = b"".join(
    [
        b'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":120,"output_tokens":1,"cache_creation_input_tokens":40,"cache_read_input_tokens":1000}}}\n\n',
        b'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
        b'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":57}}\n\n',
        b'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]
)


@pytest.mark.asyncio
class TestProxy:
    async def test_a_non_streaming_call_is_forwarded_and_metered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-test")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                f"{settings.DESKTOP_ANTHROPIC_BASE_URL}/v1/messages"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "id": "msg_1",
                        "content": [{"type": "text", "text": "Hello"}],
                        "usage": {"input_tokens": 100, "output_tokens": 20},
                    },
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json={"model": "claude-sonnet-5", "max_tokens": 64, "messages": []},
            )
        assert response.status_code == 200
        assert response.json()["content"][0]["text"] == "Hello"
        sent = route.calls[0].request
        assert sent.headers["x-api-key"] == "sk-test"
        assert sent.headers["anthropic-version"] == "2023-06-01"
        assert "authorization" not in sent.headers

        quota = await client.get(
            "/desktop/api/user/quota", headers={"Authorization": f"Bearer {access}"}
        )
        model = model_by_id("claude-sonnet-5")
        assert model is not None
        expected = credits_for(model, Usage(input_tokens=100, output_tokens=20))
        assert expected == 200
        assert quota.json()["data"]["creditsUsed"] == expected

    async def test_a_streaming_call_relays_the_events_and_meters_at_the_end(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-test")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{settings.DESKTOP_ANTHROPIC_BASE_URL}/v1/messages").mock(
                return_value=httpx.Response(
                    200,
                    headers={"content-type": "text/event-stream"},
                    content=STREAM,
                )
            )
            async with client.stream(
                "POST",
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json={
                    "model": "claude-opus-5",
                    "max_tokens": 64,
                    "stream": True,
                    "messages": [],
                },
            ) as response:
                assert response.status_code == 200
                assert response.headers["content-type"].startswith("text/event-stream")
                received = b"".join([chunk async for chunk in response.aiter_bytes()])
        assert received == STREAM

        rows = (await session.execute(DesktopUsage.__table__.select())).all()
        assert len(rows) == 1
        row = rows[0]
        assert (row.input_tokens, row.output_tokens) == (120, 57)
        assert (row.cache_creation_tokens, row.cache_read_tokens) == (40, 1000)
        model = model_by_id("claude-opus-5")
        assert model is not None
        assert row.credits == credits_for(
            model,
            Usage(
                input_tokens=120,
                output_tokens=57,
                cache_creation_tokens=40,
                cache_read_tokens=1000,
            ),
        )
        assert row.stream is True

    async def test_an_upstream_error_comes_back_as_it_came_and_costs_nothing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-test")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{settings.DESKTOP_ANTHROPIC_BASE_URL}/v1/messages").mock(
                return_value=httpx.Response(
                    529,
                    json={
                        "error": {"type": "overloaded_error", "message": "Overloaded"}
                    },
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json={"model": "claude-sonnet-5", "stream": True, "messages": []},
            )
        assert response.status_code == 529
        assert response.json()["error"]["type"] == "overloaded_error"
        quota = await client.get(
            "/desktop/api/user/quota", headers={"Authorization": f"Bearer {access}"}
        )
        assert quota.json()["data"]["creditsUsed"] == 0

    async def test_an_exhausted_allowance_is_refused_in_the_app_s_words(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-test")
        access, _ = await _signed_in(client, session, user)
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="claude-sonnet-5",
                credits=settings.DESKTOP_MONTHLY_CREDITS,
                upstream_status=200,
            )
        )
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(f"{settings.DESKTOP_ANTHROPIC_BASE_URL}/v1/messages")
            response = await client.post(
                "/desktop/api/proxy/v1/messages",
                headers={"Authorization": f"Bearer {access}"},
                json={"model": "claude-sonnet-5", "messages": []},
            )
            assert not route.called
        assert response.status_code == 402
        assert "40200" in json.dumps(response.json())

    async def test_an_unknown_model_or_path_is_refused_before_anthropic(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        response = await client.post(
            "/desktop/api/proxy/v1/messages",
            headers=headers,
            json={"model": "gpt-4o", "messages": []},
        )
        assert response.status_code == 400
        response = await client.post(
            "/desktop/api/proxy/v1/chat/completions", headers=headers, json={}
        )
        assert response.status_code == 400
        response = await client.post(
            "/desktop/api/proxy/v1/embeddings", headers=headers, json={}
        )
        assert response.status_code == 404


#: A plain OpenAI answer, for tests that care about what was sent rather
#: than what came back.
OPENAI_ANSWER = {
    "id": "chatcmpl-1",
    "choices": [{"message": {"content": "Hello"}}],
    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
}

OPENAI_STREAM = b"".join(
    [
        b'data: {"id":"c1","choices":[{"delta":{"content":"Hel"}}],"usage":null}\n\n',
        b'data: {"id":"c1","choices":[{"delta":{"content":"lo"}}],"usage":null}\n\n',
        b'data: {"id":"c1","choices":[],"usage":{"prompt_tokens":1120,'
        b'"completion_tokens":57,"total_tokens":1177,'
        b'"prompt_tokens_details":{"cached_tokens":1000}}}\n\n',
        b"data: [DONE]\n\n",
    ]
)


@pytest.mark.asyncio
class TestTwoProviders:
    """The second model (`docs/maties/models-and-search.md`, section 2):
    the model says who serves it, the proxy takes the address, the key
    and the price list from that, and each side talks its own language."""

    async def test_only_the_providers_with_a_key_are_offered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}

        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-anthropic")
        mocker.patch.object(settings, "OPENAI_API_KEY", "")
        offered = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()
        providers = {one["provider"] for one in offered["data"]}
        assert providers == {"anthropic"}
        catalog = (await client.get("/desktop/api/models/pricing-catalog")).json()
        assert {one["provider"] for one in catalog["data"]["textModels"]} == {
            "anthropic"
        }

        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        offered = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()
        by_id = {one["modelId"]: one for one in offered["data"]}
        assert {one["provider"] for one in offered["data"]} == {"anthropic", "openai"}
        # The wire format follows the provider, with no converter between.
        assert by_id["claude-sonnet-5"]["apiFormat"] == "anthropic"
        assert by_id["gpt-5.6-terra"]["apiFormat"] == "openai"

    async def test_a_gpt_call_goes_to_openai_in_openai_s_language(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-anthropic")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "id": "chatcmpl-1",
                        "choices": [{"message": {"content": "Hello"}}],
                        "usage": {
                            "prompt_tokens": 1100,
                            "completion_tokens": 100,
                            "total_tokens": 1200,
                            "prompt_tokens_details": {"cached_tokens": 1000},
                        },
                    },
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers={"Authorization": f"Bearer {access}"},
                json={"model": "gpt-5.6-terra", "messages": []},
            )
        assert response.status_code == 200
        sent = route.calls[0].request
        assert sent.headers["authorization"] == "Bearer sk-openai"
        assert "x-api-key" not in sent.headers

        rows = (await session.execute(DesktopUsage.__table__.select())).all()
        assert len(rows) == 1
        row = rows[0]
        assert row.provider == "openai"
        # The cached part of the prompt is taken out of the input count
        # rather than charged twice.
        assert (row.input_tokens, row.cache_read_tokens) == (100, 1000)
        assert row.output_tokens == 100
        model = model_by_id("gpt-5.6-terra")
        assert model is not None
        assert row.credits == credits_for(
            model,
            Usage(input_tokens=100, output_tokens=100, cache_read_tokens=1000),
        )

    async def test_a_gpt_stream_is_made_to_report_its_usage_and_is_metered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions"
            ).mock(
                return_value=httpx.Response(
                    200,
                    headers={"content-type": "text/event-stream"},
                    content=OPENAI_STREAM,
                )
            )
            async with client.stream(
                "POST",
                "/desktop/api/proxy/v1/chat/completions",
                headers={"Authorization": f"Bearer {access}"},
                json={"model": "gpt-6-astra", "stream": True, "messages": []},
            ) as response:
                assert response.status_code == 200
                received = b"".join([chunk async for chunk in response.aiter_bytes()])
        assert received == OPENAI_STREAM

        # Without this the stream reports nothing and the call is free —
        # metering that has quietly stopped working.
        sent = json.loads(route.calls[0].request.content)
        assert sent["stream_options"] == {"include_usage": True}

        rows = (await session.execute(DesktopUsage.__table__.select())).all()
        assert len(rows) == 1
        row = rows[0]
        assert row.provider == "openai"
        assert (row.input_tokens, row.cache_read_tokens) == (120, 1000)
        assert row.output_tokens == 57
        assert row.stream is True
        assert row.credits > 0

    async def test_a_model_sent_down_the_other_provider_s_path_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-anthropic")
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        with respx.mock(assert_all_called=False):
            claude_on_openai = await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers=headers,
                json={"model": "claude-sonnet-5", "messages": []},
            )
            gpt_on_anthropic = await client.post(
                "/desktop/api/proxy/v1/messages",
                headers=headers,
                json={"model": "gpt-5.6-terra", "messages": []},
            )
        assert claude_on_openai.status_code == 400
        assert gpt_on_anthropic.status_code == 400
        assert "anthropic" in claude_on_openai.json()["error"]["message"]
        assert "openai" in gpt_on_anthropic.json()["error"]["message"]

    async def test_an_unconfigured_key_is_a_missing_model_not_a_failed_call(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-anthropic")
        mocker.patch.object(settings, "OPENAI_API_KEY", "")
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}

        offered = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()
        assert not [one for one in offered["data"] if one["provider"] == "openai"]

        # And if something asks anyway, it is answered plainly and no
        # call is made.
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions")
            response = await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers=headers,
                json={"model": "gpt-5.6-terra", "messages": []},
            )
            assert not route.called
        assert response.status_code == 503
        rows = (await session.execute(DesktopUsage.__table__.select())).all()
        assert rows == []

    @pytest.mark.parametrize(
        "model_id", ["gpt-6-astra", "gpt-5.6-terra", "gpt-5.6-luna"]
    )
    async def test_every_gpt_model_is_sent_none_when_it_holds_tools(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
        model_id: str,
    ) -> None:
        """OpenAI, 13 September, on Astra and then word for word again on
        Terra: « Function tools with reasoning_effort are not supported
        for <model> in /v1/chat/completions … or set reasoning_effort to
        'none'. » The agent always carries tools, so without this the
        model cannot answer at all. Scoping it to Astra alone left Terra
        broken for an hour, which is why this is parametrised."""
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions"
            ).mock(return_value=httpx.Response(200, json=OPENAI_ANSWER))
            await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers={"Authorization": f"Bearer {access}"},
                json={
                    "model": model_id,
                    "messages": [],
                    "tools": [{"type": "function", "function": {"name": "browse"}}],
                    "reasoning_effort": "high",
                },
            )
        assert json.loads(route.calls[0].request.content)["reasoning_effort"] == "none"

    async def test_reasoning_is_left_alone_when_there_are_no_tools(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """The refusal is about the combination. Without tools there is
        nothing to conflict with, and turning reasoning off there would
        lose the model's strength for no reason at all."""
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions"
            ).mock(return_value=httpx.Response(200, json=OPENAI_ANSWER))
            await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers=headers,
                json={
                    "model": "gpt-6-astra",
                    "messages": [],
                    "reasoning_effort": "high",
                },
            )
            # An empty list is not holding tools either.
            await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers=headers,
                json={
                    "model": "gpt-6-astra",
                    "messages": [],
                    "tools": [],
                    "reasoning_effort": "high",
                },
            )
        for call in route.calls:
            assert json.loads(call.request.content)["reasoning_effort"] == "high"

    async def test_a_refusal_is_written_down_with_the_reason_it_gave(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """The reason must survive on our side. It does not survive on the
        app's: the body is handed back, the engine reduces it to a failure
        kind, and the person is shown « 400 terminated »."""
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        warn = mocker.patch.object(proxy_common_module.log, "warning")
        access, _ = await _signed_in(client, session, user)
        refusal = {"error": {"message": "Unsupported value: 'temperature'."}}
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions").mock(
                return_value=httpx.Response(400, json=refusal)
            )
            response = await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers={"Authorization": f"Bearer {access}"},
                json={"model": "gpt-6-astra", "messages": []},
            )
        # Still handed back untouched — the app's behaviour does not change.
        assert response.status_code == 400
        assert response.json() == refusal

        logged = [c for c in warn.call_args_list if c.args[0] == UPSTREAM_REFUSED]
        assert len(logged) == 1
        fields = logged[0].kwargs
        assert fields["provider"] == "openai"
        assert fields["model"] == "gpt-6-astra"
        assert fields["status"] == 400
        assert "temperature" in fields["body"]

    async def test_a_refusal_on_a_stream_is_written_down_too(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """The streaming path reads and returns the error separately from
        the non-streaming one, so it needs its own proof."""
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        warn = mocker.patch.object(proxy_common_module.log, "warning")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions").mock(
                return_value=httpx.Response(
                    400, json={"error": {"message": "tools[0].function is invalid."}}
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers={"Authorization": f"Bearer {access}"},
                json={"model": "gpt-6-astra", "stream": True, "messages": []},
            )
        assert response.status_code == 400

        logged = [c for c in warn.call_args_list if c.args[0] == UPSTREAM_REFUSED]
        assert len(logged) == 1
        assert "tools[0].function" in logged[0].kwargs["body"]


class TestUsageTally:
    def test_it_reads_usage_across_chunk_boundaries(self) -> None:
        tally = UsageTally()
        for i in range(0, len(STREAM), 7):
            tally.feed(STREAM[i : i + 7])
        usage = tally.finish()
        assert usage == Usage(
            input_tokens=120,
            output_tokens=57,
            cache_creation_tokens=40,
            cache_read_tokens=1000,
        )

    def test_credits_weigh_output_and_discount_cached_reads(self) -> None:
        sonnet = model_by_id("claude-sonnet-5")
        haiku = model_by_id("claude-haiku-4-5-20251001")
        assert sonnet is not None
        assert haiku is not None
        usage = Usage(input_tokens=1000, output_tokens=100, cache_read_tokens=10_000)
        assert credits_for(sonnet, usage) == 2500
        assert credits_for(haiku, usage) == 500


@pytest.mark.asyncio
class TestServiceEdges:
    async def test_a_revoked_or_expired_refresh_is_refused(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        _, _, refresh = await desktop._issue_session(session, user)
        mocker.patch.object(
            settings, "DESKTOP_REFRESH_TOKEN_TTL", timedelta(seconds=-1)
        )
        _, _, stale = await desktop._issue_session(session, user)
        with pytest.raises(Exception, match="expired"):
            await desktop.refresh(session, stale)
        rotated, _, _ = await desktop.refresh(session, refresh)
        assert isinstance(rotated, DesktopSession)
        assert rotated.refresh_expires_at < utc_now()  # the mocked TTL, on purpose


@pytest.mark.asyncio
class TestMiddleware:
    async def test_a_desktop_bearer_is_nobody_to_the_api_s_own_auth(
        self, session: AsyncSession
    ) -> None:
        """The API's auth middleware rejects unknown bearer tokens with a
        401 before any endpoint runs. A desktop access token must pass
        through as Anonymous so the desktop endpoints can check it."""
        from starlette.requests import Request

        from polar.auth.middlewares import get_auth_subject
        from polar.auth.models import Anonymous

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/desktop/api/user/quota",
            "headers": [(b"authorization", b"Bearer claidor_da_notevenreal")],
            "query_string": b"",
        }
        subject = await get_auth_subject(Request(scope), session)
        assert isinstance(subject.subject, Anonymous)


#: What the vendored catalogue must hold, name by name. Held here rather
#: than read from catalog.json so that a skill silently dropped from the
#: vendored directory fails a test.
VENDORED_SKILLS = {
    "academy-guide",
    "algorithmic-art",
    "brand-guidelines",
    "canvas-design",
    "claude-api",
    "discernment-nudge",
    "frontend-design",
    "internal-comms",
    "mcp-builder",
    "skill-creator",
    "slack-gif-creator",
    "theme-factory",
    "web-artifacts-builder",
    "webapp-testing",
}

#: The four the app bundles under Anthropic's own terms, and the one
#: upstream skill with no licence at all.
EXCLUDED_SKILLS = {"docx", "pdf", "pptx", "xlsx", "doc-coauthoring"}


def _frontmatter(raw: str) -> dict[str, Any]:
    """The YAML block a SKILL.md opens with, parsed the way the app parses
    it (js-yaml on the text between the fences)."""
    # In the lock through other dependencies and used by tests only, so its
    # stubs are not; mypy is told so here rather than by adding a dependency.
    import yaml  # type: ignore[import-untyped]

    match = re.match(r"^﻿?---\n(.*?)\n---\n", raw, re.S)
    assert match is not None, raw[:80]
    parsed = yaml.safe_load(match.group(1))
    assert isinstance(parsed, dict)
    return parsed


@pytest.mark.asyncio
class TestSkillStore:
    """The marketplace and its archives (`polar/desktop/skill_store.py`)."""

    async def test_the_store_lists_the_vendored_skills_and_none_of_the_excluded(
        self, client: httpx.AsyncClient
    ) -> None:
        body = (await client.get("/desktop/api/skill-store")).json()
        assert body["code"] == 0
        value = body["data"]["value"]
        assert value["localSkill"] == []
        names = {item["id"] for item in value["marketplace"]}
        assert names == VENDORED_SKILLS
        assert names.isdisjoint(EXCLUDED_SKILLS)
        assert set(NOT_OFFERED) == EXCLUDED_SKILLS

        tag_ids = {tag["id"] for tag in value["marketTags"]}
        assert all({"id", "en", "zh"} <= set(tag) for tag in value["marketTags"])
        for item in value["marketplace"]:
            # The shape of `MarketplaceSkill` in desktop/src/renderer/types/skill.ts.
            assert item["name"] == item["id"]
            assert isinstance(item["description"], str)
            assert item["description"]
            assert item["tags"]
            assert set(item["tags"]) <= tag_ids
            assert item["url"] == settings.generate_external_url(
                f"/desktop/api/skill-store/{item['id']}.zip"
            )
            assert item["url"].endswith(".zip")  # `isRemoteZipUrl` keys on this
            assert item["source"]["from"] == "GitHub"
            assert item["source"]["url"].endswith(f"/skills/{item['id']}")
            assert item["source"]["author"] == "Anthropic"

    async def test_bundled_skills_carry_no_version_and_the_rest_carry_the_snapshot(
        self, client: httpx.AsyncClient
    ) -> None:
        # The app repairs a bundled skill from its own copy at every start
        # (`syncBundledSkillsToUserData`), so the store must not offer an
        # update against the bundle: an empty version reads as « installed ».
        body = (await client.get("/desktop/api/skill-store")).json()
        by_id = {item["id"]: item for item in body["data"]["value"]["marketplace"]}
        bundled = {"canvas-design", "frontend-design", "skill-creator"}
        for name in bundled:
            assert by_id[name]["version"] == ""
        for name in VENDORED_SKILLS - bundled:
            assert by_id[name]["version"] == skill_store_catalog().version
        assert skill_store_catalog().version == "2026.9.10"

    async def test_the_archive_is_a_zip_of_the_skill_under_its_own_name(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.get("/desktop/api/skill-store/mcp-builder.zip")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        archive = zipfile.ZipFile(io.BytesIO(response.content))
        names = archive.namelist()
        # One top-level directory, named after the skill: that is what
        # `downloadZipUrl` unwraps and `normalizeFolderName` installs as.
        assert {n.split("/", 1)[0] for n in names} == {"mcp-builder"}
        assert "mcp-builder/SKILL.md" in names
        assert "mcp-builder/LICENSE.txt" in names
        assert b"Apache License" in archive.read("mcp-builder/LICENSE.txt")

        served = _frontmatter(archive.read("mcp-builder/SKILL.md").decode("utf-8"))
        at_rest = _frontmatter(
            (SKILLS_ROOT / "mcp-builder" / "SKILL.md").read_text(encoding="utf-8")
        )
        # The one change on the way out: a version the app can compare.
        assert served["version"] == skill_store_catalog().version
        assert "version" not in at_rest
        assert {k: v for k, v in served.items() if k != "version"} == at_rest

    async def test_an_unknown_skill_is_404(self, client: httpx.AsyncClient) -> None:
        for name in ("nope", "docx", "doc-coauthoring", "..", "%2e%2e%2fcatalog"):
            response = await client.get(f"/desktop/api/skill-store/{name}.zip")
            assert response.status_code == 404, name


class TestSkillStoreFiles:
    """The vendored directory itself: licences, and the catalogue held
    against the frontmatter it was built from."""

    def test_every_vendored_skill_is_apache_and_the_catalogue_matches_its_frontmatter(
        self,
    ) -> None:
        listing = skill_store_catalog()
        assert {s.name for s in listing.skills} == VENDORED_SKILLS
        assert {p.name for p in SKILLS_ROOT.iterdir() if p.is_dir()} == VENDORED_SKILLS
        for skill in listing.skills:
            licence = (skill.directory / "LICENSE.txt").read_text(encoding="utf-8")
            assert "Apache License" in licence, skill.name
            assert "Version 2.0" in licence, skill.name
            assert "agreement with Anthropic" not in licence, skill.name
            frontmatter = _frontmatter(
                (skill.directory / "SKILL.md").read_text(encoding="utf-8")
            )
            assert frontmatter["name"] == skill.name
            assert frontmatter["description"].strip() == skill.description
            # `skill_md_with_version` adds a top-level `version`; it must
            # not be clobbering one, and `metadata.version` is the other
            # place the app looks.
            assert "version" not in frontmatter, skill.name
            assert "metadata" not in frontmatter, skill.name
        assert (SKILLS_ROOT / "NOTICE").exists()
        assert (SKILLS_ROOT / "THIRD_PARTY_NOTICES.md").exists()

    def test_a_skill_md_without_a_frontmatter_is_left_alone(self) -> None:
        assert (
            skill_md_with_version("# Just a heading\n", "1.0") == "# Just a heading\n"
        )
        assert skill_md_with_version("---\nname: x\n---\nbody\n", "2026.9.10") == (
            '---\nversion: "2026.9.10"\nname: x\n---\nbody\n'
        )


@pytest.mark.asyncio
class TestComposio:
    """Apps through Composio: the app's calls forwarded with Claidor's key
    and the account's own Composio user id (`polar/desktop/composio.py`)."""

    async def test_the_session_carries_the_key_and_the_account_not_the_apps_word(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "COMPOSIO_API_KEY", "ck_claidor")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                f"{settings.COMPOSIO_BASE_URL}/api/v3.1/tool_router/session"
            ).mock(return_value=httpx.Response(200, json={"session_id": "sess_1"}))
            response = await client.post(
                "/desktop/api/proxy/composio/api/v3.1/tool_router/session",
                headers={"Authorization": f"Bearer {access}"},
                json={"user_id": "default"},
            )
        assert response.status_code == 200
        assert response.json() == {"session_id": "sess_1"}
        sent = route.calls[0].request
        assert sent.headers["x-api-key"] == "ck_claidor"
        assert "authorization" not in sent.headers
        assert json.loads(sent.content) == {"user_id": f"claidor-{user.id}"}

    async def test_the_other_five_calls_pass_through_as_composio_answered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "COMPOSIO_API_KEY", "ck_claidor")
        access, _ = await _signed_in(client, session, user)
        base = f"{settings.COMPOSIO_BASE_URL}/api/v3.1"
        with respx.mock(assert_all_called=True) as mock:
            mock.get(f"{base}/tool_router/session/sess_1/toolkits").mock(
                return_value=httpx.Response(200, json={"items": []})
            )
            link = mock.post(f"{base}/tool_router/session/sess_1/link").mock(
                return_value=httpx.Response(
                    200, json={"redirect_url": "https://connect.composio.dev/x"}
                )
            )
            mock.delete(f"{base}/connected_accounts/ca_1").mock(
                return_value=httpx.Response(429, json={"error": "slow down"})
            )
            headers = {"Authorization": f"Bearer {access}"}
            toolkits = await client.get(
                "/desktop/api/proxy/composio/api/v3.1/tool_router/session/sess_1/toolkits",
                headers=headers,
            )
            linked = await client.post(
                "/desktop/api/proxy/composio/api/v3.1/tool_router/session/sess_1/link",
                headers=headers,
                json={"toolkit": "gmail"},
            )
            refused = await client.delete(
                "/desktop/api/proxy/composio/api/v3.1/connected_accounts/ca_1",
                headers=headers,
            )
        assert toolkits.status_code == 200
        assert toolkits.json() == {"items": []}
        assert linked.json()["redirect_url"] == "https://connect.composio.dev/x"
        assert json.loads(link.calls[0].request.content) == {"toolkit": "gmail"}
        # A refusal comes back as Composio gave it, status and sentence.
        assert refused.status_code == 429
        assert refused.json() == {"error": "slow down"}

    async def test_anything_else_is_not_forwarded(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        # The key must not become a general door onto Composio's API.
        mocker.patch.object(settings, "COMPOSIO_API_KEY", "ck_claidor")
        access, _ = await _signed_in(client, session, user)
        headers = {"Authorization": f"Bearer {access}"}
        with respx.mock(assert_all_called=False) as mock:
            anything = mock.route().mock(return_value=httpx.Response(200, json={}))
            for method, path in [
                ("GET", "api/v3/toolkits"),
                ("DELETE", "api/v3.1/tool_router/session/sess_1"),
                ("POST", "api/v3.1/tool_router/session/sess_1/workbench"),
                ("GET", "api/v3.1/tool_router/session/../../v3/api_keys"),
            ]:
                response = await client.request(
                    method, f"/desktop/api/proxy/composio/{path}", headers=headers
                )
                assert response.status_code == 404, path
            assert not anything.called

    async def test_without_a_key_the_route_says_so_and_calls_nothing(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "COMPOSIO_API_KEY", "")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            anything = mock.route().mock(return_value=httpx.Response(200, json={}))
            response = await client.post(
                "/desktop/api/proxy/composio/api/v3.1/tool_router/session",
                headers={"Authorization": f"Bearer {access}"},
                json={},
            )
            assert not anything.called
        assert response.status_code == 503
        assert response.json()["error"]["type"] == "not_configured"

    async def test_signed_out_is_refused_before_anything_is_forwarded(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(settings, "COMPOSIO_API_KEY", "ck_claidor")
        with respx.mock(assert_all_called=False) as mock:
            anything = mock.route().mock(return_value=httpx.Response(200, json={}))
            response = await client.post(
                "/desktop/api/proxy/composio/api/v3.1/tool_router/session", json={}
            )
            assert not anything.called
        assert response.status_code == 401


async def _model_proxy_token(
    save_fixture: SaveFixture, user: User, *, scopes: str = "model_proxy"
) -> str:
    """A personal access token for the user, saved and handed back in
    plaintext.

    Built here rather than through `personal_access_token.create` because
    that service refuses any caller not holding a reserved scope — it will
    only mint from a live browser session, which is the right rule and not
    the thing under test. What is under test is what the proxy does when
    such a token arrives.
    """
    token, token_hash = generate_token_hash_pair(
        secret=settings.SECRET, prefix=PAT_TOKEN_PREFIX
    )
    await save_fixture(
        PersonalAccessToken(
            token=token_hash,
            scope=scopes,
            expires_at=utc_now() + timedelta(days=365),
            comment="Rakazo",
            user_id=user.id,
        )
    )
    return token


@pytest.mark.asyncio
class TestTheProxyFromAServerWeDidNotWrite:
    """Rakazo, and anything else that speaks plain OpenAI.

    Such a client is handed a base URL, a model id and one static key, and
    then never asked anything again — there is no refresh loop for it to
    run. A desktop access token lives an hour
    (`settings.DESKTOP_ACCESS_TOKEN_TTL`), so it is the wrong credential
    for this and the failure would arrive an hour in, mid-conversation. A
    personal access token carrying `model_proxy` is the right one.
    """

    async def test_a_personal_access_token_reaches_the_proxy_and_meters(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        token = await _model_proxy_token(save_fixture, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(
                f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "id": "c1",
                        "choices": [{"message": {"content": "Hello"}}],
                        "usage": {"prompt_tokens": 100, "completion_tokens": 20},
                    },
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers={"Authorization": f"Bearer {token}"},
                json={"model": "gpt-5.6-luna", "messages": []},
            )
        assert response.status_code == 200
        # Claidor's key went up, never the caller's token.
        assert route.calls[0].request.headers["authorization"] == "Bearer sk-openai"

        usage = (
            await session.execute(
                DesktopUsage.__table__.select().where(DesktopUsage.user_id == user.id)
            )
        ).all()
        assert len(usage) == 1
        row = usage[0]
        assert row.model == "gpt-5.6-luna"
        assert row.credits > 0
        # No session, and that is not a gap: the column has always been
        # nullable. What a token cannot answer is which client sent the
        # request, and it is not asked to.
        assert row.session_id is None

    async def test_the_allowance_is_the_same_allowance(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
    ) -> None:
        # The point of the proxy is that a person has one monthly allowance
        # however they reach it. A second door that did not meter would be
        # a hole, not a feature.
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        token = await _model_proxy_token(save_fixture, user)
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="gpt-5.6-luna",
                credits=settings.DESKTOP_MONTHLY_CREDITS,
                upstream_status=200,
            )
        )
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions")
            response = await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers={"Authorization": f"Bearer {token}"},
                json={"model": "gpt-5.6-luna", "messages": []},
            )
            assert not route.called
        assert response.status_code == 402

    async def test_a_token_without_the_scope_does_not_reach_the_proxy(
        self,
        client: httpx.AsyncClient,
        user: User,
        save_fixture: SaveFixture,
    ) -> None:
        token = await _model_proxy_token(save_fixture, user, scopes="user:read")
        response = await client.post(
            "/desktop/api/proxy/v1/chat/completions",
            headers={"Authorization": f"Bearer {token}"},
            json={"model": "gpt-5.6-luna", "messages": []},
        )
        assert response.status_code == 401

    async def test_the_scope_opens_the_proxy_and_nothing_else(
        self,
        client: httpx.AsyncClient,
        user: User,
        save_fixture: SaveFixture,
    ) -> None:
        # The grant is deliberately narrow. Every other route on this
        # router asks for a desktop session, and a token is not one, so a
        # leaked `model_proxy` token spends an allowance and reads nothing.
        token = await _model_proxy_token(save_fixture, user)
        headers = {"Authorization": f"Bearer {token}"}
        for path in (
            "/desktop/api/user/profile",
            "/desktop/api/user/quota",
            "/desktop/api/memory",
        ):
            response = await client.get(path, headers=headers)
            assert response.status_code == 401, path

    async def test_a_desktop_session_still_reaches_the_proxy(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        # The app's own credential is unchanged. This is the test that
        # would have caught widening the door and closing the old one.
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        access, _ = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/chat/completions").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "id": "c1",
                        "choices": [{"message": {"content": "Hi"}}],
                        "usage": {"prompt_tokens": 10, "completion_tokens": 2},
                    },
                )
            )
            response = await client.post(
                "/desktop/api/proxy/v1/chat/completions",
                headers={"Authorization": f"Bearer {access}"},
                json={"model": "gpt-5.6-luna", "messages": []},
            )
        assert response.status_code == 200

    async def test_claude_is_refused_on_the_completions_wire_and_says_why(
        self,
        client: httpx.AsyncClient,
        user: User,
        save_fixture: SaveFixture,
    ) -> None:
        # The limit worth knowing about before somebody hits it: nothing in
        # the proxy translates a Chat Completions request into an Anthropic
        # one, and an OpenAI-compatible client speaks no other wire. So
        # Claude is not reachable from such a client, and the refusal names
        # the reason rather than failing vaguely.
        token = await _model_proxy_token(save_fixture, user)
        response = await client.post(
            "/desktop/api/proxy/v1/chat/completions",
            headers={"Authorization": f"Bearer {token}"},
            json={"model": "claude-sonnet-5", "messages": []},
        )
        assert response.status_code == 400
        assert "anthropic" in response.json()["error"]["message"]


@pytest.mark.asyncio
class TestTheModelsListOnTheProxy:
    """`GET /desktop/api/proxy/v1/models`.

    Before this route existed the GET fell through to the catch-all and
    answered 404, so an OpenAI-compatible client had no way to discover a
    model id and the person had to know one by heart.
    """

    async def test_it_lists_the_models_that_wire_will_accept(
        self,
        client: httpx.AsyncClient,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-anthropic")
        token = await _model_proxy_token(save_fixture, user)
        response = await client.get(
            "/desktop/api/proxy/v1/models",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        body = response.json()
        # OpenAI's shape, not the desktop app's envelope: a client reads
        # `data` as the list itself.
        assert body["object"] == "list"
        ids = [row["id"] for row in body["data"]]
        assert "gpt-5.6-luna" in ids
        assert "claude-sonnet-5" not in ids

    async def test_a_desktop_session_may_read_it_too(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "OPENAI_API_KEY", "sk-openai")
        access, _ = await _signed_in(client, session, user)
        response = await client.get(
            "/desktop/api/proxy/v1/models",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200

    async def test_it_is_not_public(self, client: httpx.AsyncClient) -> None:
        # Which models a person may name is their business. This also keeps
        # the route consistent with `/api/models/available`, which has
        # always been authenticated.
        response = await client.get("/desktop/api/proxy/v1/models")
        assert response.status_code == 401
