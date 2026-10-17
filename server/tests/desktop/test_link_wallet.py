"""Link's sign-in through Simeon Labs' own client (`simeon/desktop/link_wallet.py`),
end to end over HTTP with Link mocked: the sign-in link, Link's callback,
the sealed tokens, the box's access token and its refresh, disconnect, and
that no token or secret reaches the log."""

import base64
import hashlib
import json
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx
from pytest_mock import MockerFixture
from sqlalchemy import select
from structlog.testing import capture_logs

from simeon.config import settings
from simeon.desktop import account_deletion
from simeon.desktop import link_wallet as link
from simeon.desktop.service import desktop
from simeon.kit.sealed import seal, unseal
from simeon.kit.utils import utc_now
from simeon.models import DesktopLinkWallet, User
from simeon.postgres import AsyncSession
from simeon.redis import Redis

CLIENT_ID = "lwlc_simeon_test"
CLIENT_SECRET = "lwlsecret_do_not_log"
PUBLISHABLE_KEY = "pk_test_simeon"


@pytest.fixture(autouse=True)
def link_client(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "LINK_CLIENT_ID", CLIENT_ID)
    mocker.patch.object(settings, "LINK_CLIENT_SECRET", CLIENT_SECRET)
    mocker.patch.object(settings, "LINK_PUBLISHABLE_KEY", PUBLISHABLE_KEY)


async def _signed_in(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


async def _box(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    headers = await _signed_in(client, session, user)
    minted = await client.post("/desktop/api/box/renewal-credential", headers=headers)
    traded = await client.post(
        "/sand-box/inference-credential",
        json={"credential": minted.json()["data"]["credential"]},
    )
    return {"Authorization": f"Bearer {traded.json()['accessToken']}"}


def _form(request: httpx.Request) -> dict[str, str]:
    return {
        key: values[0] for key, values in parse_qs(request.content.decode()).items()
    }


def _tokens(
    access: str = "liwltoken_one",
    refresh: str | None = "liwlrefresh_one",
    expires_in: int = 3600,
) -> httpx.Response:
    body: dict[str, object] = {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": expires_in,
        "scope": "payment_methods.agentic userinfo:read",
        "authorization_details": [
            {"type": "source", "actions": list(link.SOURCE_ACTIONS)}
        ],
    }
    if refresh is not None:
        body["refresh_token"] = refresh
    return httpx.Response(200, json=body)


async def _wallet(session: AsyncSession, user: User) -> DesktopLinkWallet | None:
    session.expunge_all()
    result = await session.execute(
        select(DesktopLinkWallet).where(DesktopLinkWallet.user_id == user.id)
    )
    return result.scalar_one_or_none()


async def _connected(
    session: AsyncSession,
    user: User,
    *,
    access: str = "liwltoken_one",
    refresh: str = "liwlrefresh_one",
    expires_in: timedelta = timedelta(hours=1),
) -> None:
    await link.connect(
        session,
        user.id,
        link.LinkTokens(
            access_token=access,
            refresh_token=refresh,
            expires_in=3600,
            scope="payment_methods.agentic userinfo:read",
            authorization_details=None,
        ),
    )
    wallet = await _wallet(session, user)
    assert wallet is not None
    wallet.expires_at = utc_now() + expires_in
    # Not just refreshed: an asked refresh goes to Link.
    wallet.modified_at = utc_now() - timedelta(hours=1)
    await session.commit()


def _authorize_url(start: str) -> str:
    """The Link page a start link of ours leads to."""
    target = parse_qs(urlparse(start).query)["t"][0]
    return base64.urlsafe_b64decode(target + "=" * (-len(target) % 4)).decode()


async def _start(
    client: httpx.AsyncClient, headers: dict[str, str]
) -> tuple[str, dict[str, str]]:
    response = await client.post("/desktop/api/link/start", headers=headers)
    assert response.status_code == 200, response.text
    url = _authorize_url(response.json()["url"])
    return url, {
        key: values[0] for key, values in parse_qs(urlparse(url).query).items()
    }


@pytest.mark.asyncio
class TestSealed:
    async def test_a_value_opens_only_for_its_purpose_and_secret(
        self, mocker: MockerFixture
    ) -> None:
        sealed = seal("liwltoken_x", purpose="link-wallet")
        assert "liwltoken_x" not in sealed
        assert unseal(sealed, purpose="link-wallet") == "liwltoken_x"
        assert unseal(sealed, purpose="something-else") is None
        assert unseal(sealed[:-4] + "AAAA", purpose="link-wallet") is None
        mocker.patch.object(settings, "SECRET", "another-secret")
        assert unseal(sealed, purpose="link-wallet") is None


@pytest.mark.asyncio
class TestSignIn:
    async def test_without_the_client_nothing_starts(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "LINK_CLIENT_SECRET", "")
        headers = await _signed_in(client, session, user)
        status = await client.get("/desktop/api/link/status", headers=headers)
        assert status.json() == {"configured": False, "connected": False, "scope": None}
        started = await client.post("/desktop/api/link/start", headers=headers)
        assert started.status_code == 503
        assert started.json()["configured"] is False

    async def test_the_publishable_key_is_the_stripe_accounts_unless_named(
        self, mocker: MockerFixture
    ) -> None:
        mocker.patch.object(settings, "LINK_PUBLISHABLE_KEY", "")
        mocker.patch.object(settings, "STRIPE_PUBLISHABLE_KEY", "pk_live_account")
        assert link.publishable_key() == "pk_live_account"
        assert link.configured()
        mocker.patch.object(settings, "STRIPE_PUBLISHABLE_KEY", "")
        assert not link.configured()

    async def test_the_link_leads_through_ours_to_links_page(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
    ) -> None:
        headers = await _signed_in(client, session, user)
        response = await client.post("/desktop/api/link/start", headers=headers)
        start = response.json()["url"]
        assert start.startswith(f"{settings.BASE_URL}/desktop/apps/start?")
        url = _authorize_url(start)
        parsed = urlparse(url)
        assert (parsed.scheme, parsed.netloc, parsed.path) == (
            "https",
            "login.link.com",
            "/auth",
        )
        # Every value URL-encoded: the scopes' space is %20, the address's slashes too.
        assert "scope=payment_methods.agentic%20userinfo%3Aread" in parsed.query
        assert "redirect_uri=http%3A%2F%2F" in parsed.query
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        assert params["key"] == PUBLISHABLE_KEY
        assert params["client_id"] == CLIENT_ID
        assert params["redirect_uri"] == (
            f"{settings.BASE_URL}/desktop/apps/link/callback"
        )
        assert params["response_type"] == "code"
        assert params["scope"] == "payment_methods.agentic userinfo:read"
        assert params["code_challenge_method"] == "S256"
        assert json.loads(params["authorization_details"]) == [
            {
                "type": "source",
                "actions": [
                    "read_link_transactions",
                    "read_external_transactions",
                    "read_balances",
                    "read_source_details",
                ],
            }
        ]
        assert CLIENT_SECRET not in url
        # The state names the person and the verifier, whose S256 is the challenge.
        stored = await redis.get(
            "desktop:link-oauth:" + hashlib.sha256(params["state"].encode()).hexdigest()
        )
        assert stored is not None
        remembered = json.loads(stored)
        assert remembered["user"] == str(user.id)
        assert 43 <= len(remembered["verifier"]) <= 128
        assert link.code_challenge(remembered["verifier"]) == params["code_challenge"]

    async def test_the_box_may_start_it_too(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        box = await _box(client, session, user)
        response = await client.post("/desktop/api/link/start", headers=box)
        assert response.status_code == 200, response.text

    async def test_the_callback_exchanges_the_code_and_seals_the_tokens(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
    ) -> None:
        headers = await _signed_in(client, session, user)
        _, params = await _start(client, headers)
        stored = await redis.get(
            "desktop:link-oauth:" + hashlib.sha256(params["state"].encode()).hexdigest()
        )
        assert stored is not None
        verifier = json.loads(stored)["verifier"]
        with respx.mock(assert_all_called=True) as mock:
            exchange = mock.post(link.TOKEN_URL).mock(return_value=_tokens())
            response = await client.get(
                "/desktop/apps/link/callback",
                params={"code": "lac_code", "state": params["state"]},
            )
        assert response.status_code == 302
        assert response.headers["location"] == (
            f"{settings.BASE_URL}/desktop/apps/connected"
        )
        sent = exchange.calls.last.request
        assert sent.headers["authorization"] == f"Bearer {PUBLISHABLE_KEY}"
        assert _form(sent) == {
            "grant_type": "authorization_code",
            "code": "lac_code",
            "redirect_uri": f"{settings.BASE_URL}/desktop/apps/link/callback",
            "code_verifier": verifier,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        }
        wallet = await _wallet(session, user)
        assert wallet is not None
        assert "liwltoken_one" not in wallet.access_token
        assert "liwlrefresh_one" not in wallet.refresh_token
        assert unseal(wallet.access_token, purpose="link-wallet") == "liwltoken_one"
        assert unseal(wallet.refresh_token, purpose="link-wallet") == "liwlrefresh_one"
        assert wallet.scope == "payment_methods.agentic userinfo:read"
        assert wallet.authorization_details == [
            {"type": "source", "actions": list(link.SOURCE_ACTIONS)}
        ]
        status = await client.get("/desktop/api/link/status", headers=headers)
        assert status.json()["connected"] is True
        # A state is good once.
        again = await client.get(
            "/desktop/apps/link/callback",
            params={"code": "lac_code", "state": params["state"]},
        )
        assert again.headers["location"].endswith(
            "/desktop/apps/connected?status=failed"
        )

    async def test_the_app_that_opened_it_is_sent_back_to(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        started = await client.post("/desktop/api/link/start", headers=headers)
        opened = await client.get(started.json()["url"] + "&back=simeon-ios")
        assert opened.status_code == 302
        assert opened.headers["location"].startswith("https://login.link.com/auth?")
        state = parse_qs(urlparse(opened.headers["location"]).query)["state"][0]
        # Every step at the API's own address, where the start link left its cookie.
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.TOKEN_URL).mock(return_value=_tokens())
            back = await client.get(
                f"{settings.BASE_URL}/desktop/apps/link/callback",
                params={"code": "c", "state": state},
            )
        done = await client.get(back.headers["location"])
        assert done.status_code == 302
        assert done.headers["location"] == "simeon-ios://connected"

    async def test_a_refusal_or_a_stranger_connects_nothing(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        _, params = await _start(client, headers)
        with respx.mock(assert_all_called=False) as mock:
            exchange = mock.post(link.TOKEN_URL).mock(return_value=_tokens())
            declined = await client.get(
                "/desktop/apps/link/callback",
                params={"error": "access_denied", "state": params["state"]},
            )
            stranger = await client.get(
                "/desktop/apps/link/callback",
                params={"code": "c", "state": "not-ours"},
            )
        assert not exchange.called
        for response in (declined, stranger):
            assert response.headers["location"].endswith("?status=failed")
        assert await _wallet(session, user) is None

    async def test_a_code_link_refuses_connects_nothing(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        _, params = await _start(client, headers)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.TOKEN_URL).mock(
                return_value=httpx.Response(400, json={"error": "invalid_grant"})
            )
            with capture_logs() as logs:
                response = await client.get(
                    "/desktop/apps/link/callback",
                    params={"code": "c", "state": params["state"]},
                )
        assert response.headers["location"].endswith("?status=failed")
        assert await _wallet(session, user) is None
        failed = [one for one in logs if one["event"] == "desktop.link.exchange_failed"]
        assert failed
        assert failed[0]["error"] == "invalid_grant"

    async def test_signing_in_again_replaces_the_tokens(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user, access="old_access", refresh="old_refresh")
        headers = await _signed_in(client, session, user)
        _, params = await _start(client, headers)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.TOKEN_URL).mock(
                return_value=_tokens("new_access", "new_refresh")
            )
            await client.get(
                "/desktop/apps/link/callback",
                params={"code": "c", "state": params["state"]},
            )
        wallet = await _wallet(session, user)
        assert wallet is not None
        assert unseal(wallet.refresh_token, purpose="link-wallet") == "new_refresh"


@pytest.mark.asyncio
class TestTheBoxsToken:
    async def test_the_box_gets_a_live_token_and_the_apps_do_not(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user)
        box = await _box(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            refresh = mock.post(link.TOKEN_URL).mock(return_value=_tokens())
            response = await client.post("/desktop/api/link/token", headers=box)
        assert not refresh.called
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert body["connected"] is True
        assert body["accessToken"] == "liwltoken_one"
        assert (
            body["expiresAtMs"] > (utc_now() + timedelta(minutes=55)).timestamp() * 1000
        )
        assert set(body) == {"connected", "accessToken", "expiresAtMs", "scope"}
        headers = await _signed_in(client, session, user)
        refused = await client.post("/desktop/api/link/token", headers=headers)
        assert refused.status_code == 403

    async def test_not_connected_says_so(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        box = await _box(client, session, user)
        response = await client.post("/desktop/api/link/token", headers=box)
        assert response.json() == {"connected": False}

    async def test_a_token_near_its_end_is_refreshed_and_the_new_refresh_kept(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user, expires_in=timedelta(minutes=2))
        box = await _box(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            refreshed = mock.post(link.TOKEN_URL).mock(
                return_value=_tokens("liwltoken_two", "liwlrefresh_two")
            )
            response = await client.post("/desktop/api/link/token", headers=box)
        assert response.json()["accessToken"] == "liwltoken_two"
        sent = refreshed.calls.last.request
        assert sent.headers["authorization"] == f"Bearer {PUBLISHABLE_KEY}"
        assert _form(sent) == {
            "grant_type": "refresh_token",
            "refresh_token": "liwlrefresh_one",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        }
        wallet = await _wallet(session, user)
        assert wallet is not None
        assert unseal(wallet.refresh_token, purpose="link-wallet") == "liwlrefresh_two"
        assert wallet.expires_at > utc_now() + timedelta(minutes=55)
        # The next ask is answered from the row.
        with respx.mock(assert_all_called=False) as mock:
            again = mock.post(link.TOKEN_URL).mock(return_value=_tokens())
            response = await client.post("/desktop/api/link/token", headers=box)
        assert not again.called
        assert response.json()["accessToken"] == "liwltoken_two"

    async def test_a_refresh_without_a_new_refresh_token_keeps_the_old(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user, expires_in=timedelta(minutes=1))
        box = await _box(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.TOKEN_URL).mock(
                return_value=_tokens("liwltoken_two", refresh=None)
            )
            await client.post("/desktop/api/link/token", headers=box)
        wallet = await _wallet(session, user)
        assert wallet is not None
        assert unseal(wallet.refresh_token, purpose="link-wallet") == "liwlrefresh_one"

    async def test_an_asked_refresh_happens_once_for_two_computers(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user)
        box = await _box(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            refreshed = mock.post(link.TOKEN_URL).mock(
                return_value=_tokens("liwltoken_two", "liwlrefresh_two")
            )
            first = await client.post(
                "/desktop/api/link/token", headers=box, json={"refresh": True}
            )
            second = await client.post(
                "/desktop/api/link/token", headers=box, json={"refresh": True}
            )
        assert refreshed.call_count == 1
        assert first.json()["accessToken"] == second.json()["accessToken"]
        assert second.json()["accessToken"] == "liwltoken_two"

    async def test_a_grant_link_ended_is_forgotten(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user, expires_in=timedelta(minutes=1))
        box = await _box(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.TOKEN_URL).mock(
                return_value=httpx.Response(400, json={"error": "invalid_grant"})
            )
            response = await client.post("/desktop/api/link/token", headers=box)
        assert response.json() == {"connected": False}
        assert await _wallet(session, user) is None

    @pytest.mark.parametrize(
        "answer",
        [
            httpx.Response(500, json={"error": "server_error"}),
            # Our client refused is ours to fix: the person keeps the connection.
            httpx.Response(401, json={"error": "invalid_client"}),
        ],
    )
    async def test_a_failed_refresh_keeps_the_connection(
        self,
        answer: httpx.Response,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        await _connected(session, user, expires_in=timedelta(minutes=2))
        box = await _box(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.TOKEN_URL).mock(return_value=answer)
            live = await client.post("/desktop/api/link/token", headers=box)
        # Two minutes left: the token it has is still handed out.
        assert live.json()["accessToken"] == "liwltoken_one"
        wallet = await _wallet(session, user)
        assert wallet is not None
        wallet.expires_at = utc_now() - timedelta(minutes=1)
        await session.commit()
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.TOKEN_URL).mock(return_value=answer)
            gone = await client.post("/desktop/api/link/token", headers=box)
        assert gone.status_code == 502
        assert await _wallet(session, user) is not None

    async def test_link_unreachable_with_an_expired_token_is_a_502(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user, expires_in=-timedelta(minutes=1))
        box = await _box(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.TOKEN_URL).mock(side_effect=httpx.ConnectTimeout("slow"))
            response = await client.post("/desktop/api/link/token", headers=box)
        assert response.status_code == 502

    async def test_tokens_sealed_under_another_secret_are_forgotten(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _connected(session, user)
        mocker.patch.object(settings, "SECRET", "a-new-secret")
        # Asked of the service: the box's own credential hangs on SECRET too.
        assert await link.access_for(session, user.id) is None
        assert await _wallet(session, user) is None


@pytest.mark.asyncio
class TestDisconnect:
    async def test_disconnect_revokes_at_link_and_forgets(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user)
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            revoked = mock.post(link.REVOKE_URL).mock(return_value=httpx.Response(200))
            response = await client.delete("/desktop/api/link", headers=headers)
        assert response.json() == {"disconnected": True, "revoked": True}
        sent = revoked.calls.last.request
        assert sent.headers["authorization"] == f"Bearer {PUBLISHABLE_KEY}"
        assert _form(sent) == {
            "token": "liwlrefresh_one",
            "token_type_hint": "refresh_token",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        }
        assert await _wallet(session, user) is None
        status = await client.get("/desktop/api/link/status", headers=headers)
        assert status.json()["connected"] is False

    async def test_the_box_may_disconnect_and_link_down_still_forgets(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user)
        box = await _box(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.REVOKE_URL).mock(side_effect=httpx.ConnectError("down"))
            response = await client.delete("/desktop/api/link", headers=box)
        assert response.json() == {"disconnected": True, "revoked": False}
        assert await _wallet(session, user) is None

    async def test_nothing_to_disconnect(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=False) as mock:
            revoked = mock.post(link.REVOKE_URL).mock(return_value=httpx.Response(200))
            response = await client.delete("/desktop/api/link", headers=headers)
        assert not revoked.called
        assert response.json() == {"disconnected": False, "revoked": False}

    async def test_deleting_the_account_revokes_link(
        self, session: AsyncSession, user: User
    ) -> None:
        await _connected(session, user)
        report = account_deletion.DeletionReport()
        with respx.mock(assert_all_called=True) as mock:
            mock.post(link.REVOKE_URL).mock(return_value=httpx.Response(200))
            await account_deletion._disconnect_link(session, user, report)
        assert report.incomplete == []
        assert await _wallet(session, user) is None


@pytest.mark.asyncio
class TestNothingSecretIsLogged:
    async def test_tokens_codes_and_the_secret_stay_out_of_the_log(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Redis,
    ) -> None:
        headers = await _signed_in(client, session, user)
        box = await _box(client, session, user)
        with capture_logs() as logs:
            _, params = await _start(client, headers)
            with respx.mock(assert_all_called=True) as mock:
                mock.post(link.TOKEN_URL).mock(
                    side_effect=[
                        _tokens("liwltoken_secret_a", "liwlrefresh_secret_a"),
                        _tokens("liwltoken_secret_b", "liwlrefresh_secret_b"),
                    ]
                )
                mock.post(link.REVOKE_URL).mock(return_value=httpx.Response(200))
                await client.get(
                    "/desktop/apps/link/callback",
                    params={"code": "lac_secret_code", "state": params["state"]},
                )
                await client.post(
                    "/desktop/api/link/token", headers=box, json={"refresh": True}
                )
                await client.delete("/desktop/api/link", headers=headers)
        events = {one["event"] for one in logs}
        assert {
            "desktop.link.sign_in_started",
            "desktop.link.connected",
            "desktop.link.refreshed",
            "desktop.link.disconnected",
        } <= events
        text = json.dumps(logs, default=str)
        for secret in (
            "liwltoken_secret_a",
            "liwlrefresh_secret_a",
            "liwltoken_secret_b",
            "liwlrefresh_secret_b",
            "lac_secret_code",
            CLIENT_SECRET,
            params["state"],
        ):
            assert secret not in text
