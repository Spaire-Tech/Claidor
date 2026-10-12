"""The iPhone's own Sign in with Apple sheet (`POST /auth/apple`,
`simeon.integrations.apple.native`, 12 October 2026): Apple's identity
token for the app's bundle id and this sign-in's nonce signs the person in
with no browser in between; anything else is refused. Apple's keys are a
test key here; Apple's token and revoke endpoints are mocked."""

from __future__ import annotations

import secrets
import time
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
import respx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from pytest_mock import MockerFixture
from sqlalchemy import select

from simeon.config import settings
from simeon.desktop import account_deletion
from simeon.desktop.account_repository import AccountDeletionRepository
from simeon.integrations.apple import native
from simeon.integrations.apple.service import jwks_client as apple_jwks
from simeon.models import OAuthAccount, User
from simeon.models.user import OAuthPlatform
from simeon.postgres import AsyncSession
from tests.desktop.test_allowance import billing_on
from tests.desktop.test_app_sign_in import _login_metadata

APPLE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _identity_token(
    nonce: str,
    *,
    sub: str = "001234.apple-user",
    email: str = "apple.person@example.com",
    audience: str | None = None,
    key: Any = APPLE_KEY,
) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "iss": "https://appleid.apple.com",
            "aud": audience or settings.APPLE_BUNDLE_ID,
            "sub": sub,
            "email": email,
            "email_verified": "true",
            "nonce": native.nonce_hash(nonce),
            "nonce_supported": True,
            "iat": now,
            "exp": now + 600,
        },
        key,
        algorithm="RS256",
        headers={"kid": "test"},
    )


@pytest.fixture(autouse=True)
def _apple_keys(mocker: MockerFixture) -> None:
    mocker.patch.object(
        apple_jwks,
        "get_signing_key_from_jwt",
        return_value=APPLE_KEY.public_key(),
    )


def _server_key(mocker: MockerFixture) -> None:
    """The Sign in with Apple key on the server, so it can talk to Apple."""
    pem = (
        ec.generate_private_key(ec.SECP256R1())
        .private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        .decode()
    )
    mocker.patch.object(settings, "APPLE_TEAM_ID", "496QXRMJXG")
    mocker.patch.object(settings, "APPLE_KEY_ID", "KEYID12345")
    mocker.patch.object(settings, "APPLE_KEY_VALUE", pem)
    mocker.patch.object(settings, "APPLE_CLIENT_ID", "com.simeonlabs.simeon.signin")


async def _apple_accounts(session: AsyncSession, sub: str) -> list[OAuthAccount]:
    result = await session.execute(
        select(OAuthAccount).where(
            OAuthAccount.platform == OAuthPlatform.apple,
            OAuthAccount.account_id == sub,
        )
    )
    return list(result.scalars().all())


@pytest.mark.asyncio
class TestAppleSheet:
    async def test_a_new_person_is_signed_in_with_no_browser(
        self, client: httpx.AsyncClient, session: AsyncSession
    ) -> None:
        nonce = secrets.token_urlsafe(32)
        response = await client.post(
            "/auth/apple",
            json={
                "identityToken": _identity_token(nonce),
                "nonce": nonce,
                "givenName": "Ada",
                "familyName": "Lovelace",
            },
            headers={"x-simeon-client-version": "ios-0.1.0+1"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["accessToken"]
        assert body["refreshToken"]
        assert response.headers["cache-control"] == "no-store"

        # The pair opens the app's routes, as `/auth/poll`'s does.
        profile = await client.get(
            "/desktop/api/user/profile",
            headers={"Authorization": f"Bearer {body['accessToken']}"},
        )
        assert profile.status_code == 200
        person = profile.json()["data"]
        assert person["email"] == "apple.person@example.com"
        # The name Apple gives once, kept for "What should I call you?".
        assert person["suggestedName"] == "Ada"

        (account,) = await _apple_accounts(session, "001234.apple-user")
        assert account.account_email == "apple.person@example.com"

    async def test_the_same_apple_id_is_the_same_account(
        self, client: httpx.AsyncClient, session: AsyncSession
    ) -> None:
        for _ in range(2):
            nonce = secrets.token_urlsafe(32)
            response = await client.post(
                "/auth/apple",
                json={"identityToken": _identity_token(nonce), "nonce": nonce},
            )
            assert response.status_code == 200, response.text
        assert len(await _apple_accounts(session, "001234.apple-user")) == 1
        users = await session.execute(
            select(User).where(User.email == "apple.person@example.com")
        )
        assert len(users.unique().scalars().all()) == 1

    async def test_an_existing_account_with_that_email_is_the_one_signed_in(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        nonce = secrets.token_urlsafe(32)
        response = await client.post(
            "/auth/apple",
            json={
                "identityToken": _identity_token(
                    nonce, sub="009.existing", email=user.email
                ),
                "nonce": nonce,
            },
        )
        assert response.status_code == 200, response.text
        (account,) = await _apple_accounts(session, "009.existing")
        assert account.user_id == user.id

    async def test_another_sign_in_s_nonce_is_refused(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.post(
            "/auth/apple",
            json={
                "identityToken": _identity_token("the-real-one"),
                "nonce": "a-different-one",
            },
        )
        assert response.status_code == 400
        assert response.json()["error"] == "apple_unverified"

    async def test_a_token_for_another_app_is_refused(
        self, client: httpx.AsyncClient
    ) -> None:
        nonce = secrets.token_urlsafe(32)
        response = await client.post(
            "/auth/apple",
            json={
                "identityToken": _identity_token(nonce, audience="com.example.other"),
                "nonce": nonce,
            },
        )
        assert response.status_code == 400

    async def test_a_token_not_signed_by_apple_is_refused(
        self, client: httpx.AsyncClient
    ) -> None:
        nonce = secrets.token_urlsafe(32)
        forger = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        response = await client.post(
            "/auth/apple",
            json={"identityToken": _identity_token(nonce, key=forger), "nonce": nonce},
        )
        assert response.status_code == 400

    async def test_nothing_posted_is_a_400_not_a_crash(
        self, client: httpx.AsyncClient
    ) -> None:
        assert (await client.post("/auth/apple", json={})).status_code == 400
        assert (
            await client.post("/auth/apple", content=b"not json")
        ).status_code == 400

    async def test_the_code_is_traded_and_kept_for_revoking(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        mocker: MockerFixture,
    ) -> None:
        _server_key(mocker)
        nonce = secrets.token_urlsafe(32)
        with respx.mock(assert_all_called=True) as apple:
            route = apple.post("https://appleid.apple.com/auth/token").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "access_token": "apple-access",
                        "refresh_token": "apple-refresh",
                        "expires_in": 3600,
                        "token_type": "Bearer",
                    },
                )
            )
            response = await client.post(
                "/auth/apple",
                json={
                    "identityToken": _identity_token(nonce),
                    "nonce": nonce,
                    "authorizationCode": "c0de",
                },
            )
        assert response.status_code == 200, response.text
        sent = parse_qs(route.calls[0].request.content.decode())
        assert sent["client_id"] == [settings.APPLE_BUNDLE_ID]
        assert sent["code"] == ["c0de"]
        assert sent["grant_type"] == ["authorization_code"]
        (account,) = await _apple_accounts(session, "001234.apple-user")
        assert account.refresh_token == "apple-refresh"
        assert account.access_token == "apple-access"


@pytest.mark.asyncio
class TestRevoking:
    async def test_the_refresh_token_is_revoked_at_apple(
        self, mocker: MockerFixture
    ) -> None:
        _server_key(mocker)
        account = OAuthAccount(
            platform=OAuthPlatform.apple,
            account_id="x",
            account_email="a@b.co",
            access_token="acc",
            refresh_token="ref",
        )
        with respx.mock(assert_all_called=True) as apple:
            route = apple.post("https://appleid.apple.com/auth/revoke").mock(
                return_value=httpx.Response(200)
            )
            assert await native.revoke(account)
        sent = parse_qs(route.calls[0].request.content.decode())
        assert sent["token"] == ["ref"]
        assert sent["token_type_hint"] == ["refresh_token"]
        assert sent["client_id"] == [settings.APPLE_BUNDLE_ID]

    async def test_a_web_sign_in_s_token_is_revoked_with_the_services_id(
        self, mocker: MockerFixture
    ) -> None:
        _server_key(mocker)
        account = OAuthAccount(
            platform=OAuthPlatform.apple,
            account_id="x",
            account_email="a@b.co",
            access_token="acc",
        )
        with respx.mock() as apple:
            route = apple.post("https://appleid.apple.com/auth/revoke").mock(
                side_effect=[
                    httpx.Response(400, json={"error": "invalid_client"}),
                    httpx.Response(200),
                ]
            )
            assert await native.revoke(account)
        clients = [
            parse_qs(call.request.content.decode())["client_id"][0]
            for call in route.calls
        ]
        assert clients == [settings.APPLE_BUNDLE_ID, "com.simeonlabs.simeon.signin"]

    async def test_deleting_the_account_says_when_apple_could_not_be_reached(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        session.add(
            OAuthAccount(
                platform=OAuthPlatform.apple,
                account_id="gone",
                account_email=user.email,
                access_token="acc",
                user_id=user.id,
            )
        )
        await session.flush()
        mocker.patch.object(native, "revoke", return_value=False)
        report = account_deletion.DeletionReport()
        await account_deletion._revoke_apple(
            AccountDeletionRepository(session), user, report
        )
        assert report.incomplete == ["Sign in with Apple"]


@pytest.mark.asyncio
class TestTheIPhoneNeverDetoursToBilling:
    @pytest.mark.auth
    async def test_the_iphone_s_sign_in_asks_without_the_billing_page(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        """Apple does not let the iPhone app send people to buy on the
        web, so its sign-in (`redirectTarget=simeon-ios`) goes straight
        to the confirmation; the app shows its own plans afterwards."""
        billing_on(mocker)
        _, challenge, uuid = _login_metadata()
        response = await client.get(
            "/loginDeepControl",
            params={
                "challenge": challenge,
                "uuid": uuid,
                "redirectTarget": "simeon-ios",
            },
            follow_redirects=False,
        )
        assert response.status_code == 200
        assert "/billing" not in response.headers.get("location", "")
        assert "Continue as" in response.text
        # The Mac's sign-in still takes the detour.
        mac = await client.get(
            "/loginDeepControl",
            params={"challenge": challenge, "uuid": uuid, "redirectTarget": "simeon"},
            follow_redirects=False,
        )
        assert mac.status_code == 303
        assert urlparse(mac.headers["location"]).path == "/billing"
