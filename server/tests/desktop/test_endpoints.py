"""The desktop app's sign-in and proxy, end to end over HTTP
(`polar/desktop/endpoints.py`)."""

import json
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from polar.config import settings
from polar.desktop.service import Usage, UsageTally, credits_for, desktop, model_by_id
from polar.kit.utils import utc_now
from polar.models import DesktopSession, DesktopUsage, User
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
        assert response.headers["location"].startswith(
            "lobsterai://auth/callback?code="
        )

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
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
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
        self, client: httpx.AsyncClient
    ) -> None:
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
        assert response.status_code == 404


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
