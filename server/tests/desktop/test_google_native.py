"""The iPhone's own Google sign-in (`POST /auth/google`,
`simeon.integrations.google.native`, 12 October 2026): the code and the
verifier from Google's page sign the person in with no page of ours in
between, onto the same account the web's Google sign-in finds. Google's
token and userinfo endpoints are answered by `respx`."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.integrations.google import native
from simeon.models import OAuthAccount, User
from simeon.models.user import OAuthPlatform
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture

IOS_CLIENT = "123456-abcdef.apps.googleusercontent.com"
REDIRECT = "com.googleusercontent.apps.123456-abcdef:/oauthredirect"
USERINFO = "https://openidconnect.googleapis.com/v1/userinfo"


@pytest.fixture
def ios_client(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "GOOGLE_IOS_CLIENT_ID", IOS_CLIENT)


def _google(
    mock: respx.MockRouter,
    *,
    sub: str = "google-sub-1",
    email: str = "google.person@example.com",
    email_verified: bool = True,
    token_status: int = 200,
) -> respx.Route:
    """Google's token endpoint (checking what the server sends) and its
    userinfo, for one person."""

    def token(request: httpx.Request) -> httpx.Response:
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
        assert form["client_id"] == IOS_CLIENT
        assert form["redirect_uri"] == REDIRECT
        assert form["grant_type"] == "authorization_code"
        assert form["code"] == "the-code"
        assert form["code_verifier"] == "the-verifier"
        assert "client_secret" not in form
        if token_status != 200:
            return httpx.Response(token_status, json={"error": "invalid_grant"})
        return httpx.Response(
            200,
            json={
                "access_token": "ya29.google",
                "expires_in": 3599,
                "id_token": "eyJ.id.token",
                "scope": "openid email profile",
                "token_type": "Bearer",
            },
        )

    route = mock.post(native.TOKEN_URL).mock(side_effect=token)
    mock.get(USERINFO).mock(
        return_value=httpx.Response(
            200,
            json={
                "sub": sub,
                "email": email,
                "email_verified": email_verified,
                "name": "Google Person",
                "given_name": "Google",
                "picture": None,
            },
        )
    )
    return route


async def _sign_in(client: httpx.AsyncClient, **body: Any) -> httpx.Response:
    return await client.post(
        "/auth/google",
        json=body or {"code": "the-code", "codeVerifier": "the-verifier"},
    )


@pytest.mark.asyncio
class TestConfig:
    async def test_the_app_is_told_how_to_open_google(
        self, client: httpx.AsyncClient, ios_client: None
    ) -> None:
        response = await client.get("/auth/google/config")
        assert response.status_code == 200
        google = response.json()["google"]
        assert google["clientId"] == IOS_CLIENT
        assert google["redirectUri"] == REDIRECT
        assert google["authorizeUrl"] == "https://accounts.google.com/o/oauth2/v2/auth"
        assert google["scope"] == "openid email profile"

    async def test_without_the_ios_client_the_app_uses_the_web_page(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.get("/auth/google/config")
        assert response.json() == {"google": None}


@pytest.mark.asyncio
class TestSignIn:
    async def test_a_new_person_gets_an_account_and_the_pair(
        self, client: httpx.AsyncClient, session: AsyncSession, ios_client: None
    ) -> None:
        with respx.mock(assert_all_called=True) as mock:
            _google(mock)
            response = await _sign_in(client)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["accessToken"]
        assert body["refreshToken"]
        assert response.headers["cache-control"].startswith("no-store")

        # The bearer opens the app's own routes.
        profile = await client.get(
            "/desktop/api/user/profile",
            headers={"Authorization": f"Bearer {body['accessToken']}"},
        )
        assert profile.status_code == 200, profile.text

    async def test_the_web_s_google_account_is_the_same_account(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        ios_client: None,
    ) -> None:
        await save_fixture(
            OAuthAccount(
                platform=OAuthPlatform.google,
                account_id="google-sub-web",
                account_email=user.email,
                access_token="old",
                user=user,
            )
        )
        with respx.mock(assert_all_called=True) as mock:
            _google(mock, sub="google-sub-web", email=user.email)
            response = await _sign_in(client)
        assert response.status_code == 200, response.text
        profile = await client.get(
            "/desktop/api/user/profile",
            headers={"Authorization": f"Bearer {response.json()['accessToken']}"},
        )
        assert json.dumps(profile.json()).count(user.email) >= 1

    async def test_an_unverified_google_email_of_another_account_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        ios_client: None,
    ) -> None:
        with respx.mock(assert_all_called=True) as mock:
            _google(mock, sub="someone-else", email=user.email, email_verified=False)
            response = await _sign_in(client)
        assert response.status_code == 403
        assert response.json()["error"] == "google_account"

    async def test_a_code_google_refuses_is_refused(
        self, client: httpx.AsyncClient, ios_client: None
    ) -> None:
        with respx.mock(assert_all_called=False) as mock:
            _google(mock, token_status=400)
            response = await _sign_in(client)
        assert response.status_code == 400
        assert response.json()["error"] == "google_unverified"

    async def test_without_a_verifier_nothing_is_asked_of_google(
        self, client: httpx.AsyncClient, ios_client: None
    ) -> None:
        with respx.mock(assert_all_called=False) as mock:
            route = _google(mock)
            response = await _sign_in(client, code="the-code")
            assert not route.called
        assert response.status_code == 400

    async def test_without_the_ios_client_it_is_refused(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await _sign_in(client)
        assert response.status_code == 400
        assert "isn't set up" in response.json()["message"]
