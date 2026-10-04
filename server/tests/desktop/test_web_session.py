"""Simeon on the web (4 October 2026): the window at app.simeonlabs.com
trades the web cookie for the Mac app's token pair at
`POST /auth/web-session`, on a session row marked `web`.
"""

import httpx
import pytest

from simeon.config import settings
from simeon.desktop.repository import DesktopSessionRepository
from simeon.desktop.service import unwrap_access_token
from simeon.kit.crypto import get_token_hash
from simeon.models import User
from simeon.postgres import AsyncSession

WEB = {"Origin": settings.FRONTEND_BASE_URL}


@pytest.mark.asyncio
class TestWebSession:
    async def test_anonymous_gets_401(self, client: httpx.AsyncClient) -> None:
        response = await client.post("/auth/web-session", headers=WEB)
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"

    @pytest.mark.auth
    async def test_a_signed_in_person_gets_the_mac_s_pair_on_a_web_row(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        response = await client.post("/auth/web-session", headers=WEB)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        # The shape `/auth/poll` gives the Mac, so one client reads both.
        assert isinstance(body["accessToken"], str)
        assert body["refreshToken"].startswith("simeon_dr_")
        assert isinstance(body["expiresAt"], str)

        inner = unwrap_access_token(body["accessToken"])
        assert inner is not None
        found = await DesktopSessionRepository.from_session(
            session
        ).get_by_access_token_hash(get_token_hash(inner, secret=settings.SECRET))
        assert found is not None
        assert found.user_id == user.id
        assert found.client_kind == "web"
        assert found.is_web

        # The bearer opens the desktop routes like the Mac's does.
        profile = await client.get(
            "/desktop/api/user/profile",
            headers={"Authorization": f"Bearer {body['accessToken']}"},
        )
        assert profile.status_code == 200
        assert profile.json()["data"]["email"] == user.email

    @pytest.mark.auth
    async def test_the_kind_survives_a_refresh(
        self, client: httpx.AsyncClient, session: AsyncSession
    ) -> None:
        issued = (await client.post("/auth/web-session", headers=WEB)).json()
        refreshed = await client.post(
            "/oauth/token",
            json={
                "grant_type": "refresh_token",
                "refresh_token": issued["refreshToken"],
            },
        )
        assert refreshed.status_code == 200
        inner = unwrap_access_token(refreshed.json()["access_token"])
        assert inner is not None
        found = await DesktopSessionRepository.from_session(
            session
        ).get_by_access_token_hash(get_token_hash(inner, secret=settings.SECRET))
        assert found is not None
        assert found.client_kind == "web"

    @pytest.mark.auth
    async def test_a_page_somewhere_else_gets_403(
        self, client: httpx.AsyncClient
    ) -> None:
        for headers in ({"Origin": "https://evil.example"}, {}):
            response = await client.post("/auth/web-session", headers=headers)
            assert response.status_code == 403, headers

    async def test_a_connected_app_s_sign_in_comes_back_to_the_web_app(
        self, client: httpx.AsyncClient
    ) -> None:
        """The box registers `/desktop/mcp-oauth/callback` with the vendor;
        the vendor lands here and the page on the web app hands the box the
        code. Only the sign-in's own parameters travel."""
        response = await client.get(
            "/desktop/mcp-oauth/callback?state=s1&code=c1&foo=bar",
        )
        assert response.status_code == 302
        assert response.headers["cache-control"] == "no-store"
        assert (
            response.headers["location"]
            == f"{settings.FRONTEND_BASE_URL}/app/connected.html?state=s1&code=c1"
        )
        refused = await client.get(
            "/desktop/mcp-oauth/callback?error=access_denied&error_description=No"
        )
        assert refused.headers["location"].endswith(
            "/app/connected.html?error=access_denied&error_description=No"
        )

    @pytest.mark.auth
    async def test_a_web_session_has_no_mac_to_hand_a_daemon_credential_to(
        self, client: httpx.AsyncClient
    ) -> None:
        issued = (await client.post("/auth/web-session", headers=WEB)).json()
        response = await client.post(
            "/sand-box/local-exec-daemon-credential",
            headers={"Authorization": f"Bearer {issued['accessToken']}"},
            json={},
        )
        assert response.status_code == 403
