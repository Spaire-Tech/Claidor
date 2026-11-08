"""A person's own ChatGPT account, connected with OpenAI's device code
(`simeon/desktop/model_accounts.py`), end to end over HTTP with OpenAI
mocked: the code, the wait, the token exchange, the sealed tokens, the
same account signed in again, the name, the refresh and its end, disconnect,
account deletion, and that no token or code reaches the log. Nothing here
reaches OpenAI."""

import base64
import json
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs
from uuid import UUID

import httpx
import pytest
import respx
from pytest_mock import MockerFixture
from sqlalchemy import select
from structlog.testing import capture_logs

from simeon.config import settings
from simeon.desktop import account_deletion
from simeon.desktop import model_accounts as accounts
from simeon.desktop.service import desktop
from simeon.kit.sealed import seal, unseal
from simeon.kit.utils import utc_now
from simeon.models import DesktopModelAccount, User
from simeon.postgres import AsyncSession

AUTH = "https://auth.openai.test"
USERCODE_URL = f"{AUTH}/api/accounts/deviceauth/usercode"
DEVICE_TOKEN_URL = f"{AUTH}/api/accounts/deviceauth/token"
TOKEN_URL = f"{AUTH}/oauth/token"
REVOKE_URL = f"{AUTH}/oauth/revoke"
CLIENT_ID = "app_simeon_test"


@pytest.fixture(autouse=True)
def openai_stand_in(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "CHATGPT_AUTH_BASE_URL", AUTH)
    mocker.patch.object(settings, "CHATGPT_CLIENT_ID", CLIENT_ID)


async def _signed_in(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


def _jwt(claims: dict[str, Any], marker: str = "") -> str:
    def part(value: dict[str, Any]) -> str:
        raw = json.dumps(value).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")

    return f"{part({'alg': 'none'})}.{part(claims)}.sig{marker}"


def _access(marker: str, *, lasts: timedelta = timedelta(days=10)) -> str:
    return _jwt(
        {
            "exp": int((utc_now() + lasts).timestamp()),
            accounts._AUTH_CLAIM: {"chatgpt_account_id": "acct_one"},
        },
        marker,
    )


def _id_token(
    account: str = "acct_one", email: str = "ada@example.com", plan: str = "plus"
) -> str:
    return _jwt(
        {
            "email": email,
            accounts._AUTH_CLAIM: {
                "chatgpt_account_id": account,
                "chatgpt_plan_type": plan,
            },
        }
    )


def _tokens(
    access: str,
    refresh: str | None = "rt_one",
    *,
    id_token: str | None = None,
) -> httpx.Response:
    body: dict[str, Any] = {"access_token": access}
    if id_token is not None:
        body["id_token"] = id_token
    if refresh is not None:
        body["refresh_token"] = refresh
    return httpx.Response(200, json=body)


def _usercode() -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "device_auth_id": "dev_auth_one",
            "user_code": "ABCD-1234",
            "interval": "3",
        },
    )


def _approved() -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "authorization_code": "ac_secret_code",
            "code_challenge": "challenge",
            "code_verifier": "verifier_secret",
        },
    )


def _form(request: httpx.Request) -> dict[str, str]:
    return {
        key: values[0] for key, values in parse_qs(request.content.decode()).items()
    }


async def _rows(session: AsyncSession, user: User) -> list[DesktopModelAccount]:
    session.expunge_all()
    result = await session.execute(
        select(DesktopModelAccount)
        .where(DesktopModelAccount.user_id == user.id)
        .order_by(DesktopModelAccount.created_at)
    )
    return list(result.scalars().all())


async def _connect(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    *,
    access: str | None = None,
    refresh: str = "rt_one",
    id_token: str | None = None,
) -> dict[str, Any]:
    """One whole sign-in: the code, then the person's approval."""
    with respx.mock(assert_all_called=True) as mock:
        mock.post(USERCODE_URL).mock(return_value=_usercode())
        mock.post(DEVICE_TOKEN_URL).mock(return_value=_approved())
        mock.post(TOKEN_URL).mock(
            return_value=_tokens(
                access or _access("a"), refresh, id_token=id_token or _id_token()
            )
        )
        started = await client.post(
            "/desktop/api/models/accounts/chatgpt/start", headers=headers
        )
        polled = await client.post(
            "/desktop/api/models/accounts/chatgpt/poll",
            headers=headers,
            json={"connectId": started.json()["connectId"]},
        )
    assert polled.json()["status"] == "connected", polled.text
    return polled.json()["account"]


def _id(account: dict[str, Any]) -> UUID:
    return UUID(account["id"])


async def _expiring(session: AsyncSession, user: User, *, left: timedelta) -> None:
    rows = await _rows(session, user)
    rows[0].expires_at = utc_now() + left
    session.add(rows[0])
    await session.commit()


@pytest.mark.asyncio
class TestTheClaims:
    async def test_the_id_token_names_the_account_its_email_and_plan(self) -> None:
        tokens = accounts.ChatGptTokens(
            id_token=_id_token("acct_x", "x@example.com", "pro"),
            access_token="opaque",
            refresh_token="rt",
        )
        assert accounts.identity(tokens) == ("acct_x", "x@example.com", "pro")

    async def test_the_email_under_the_profile_claim_counts_too(self) -> None:
        token = _jwt(
            {
                accounts._PROFILE_CLAIM: {"email": "p@example.com"},
                accounts._AUTH_CLAIM: {"chatgpt_account_id": "acct_p"},
            }
        )
        tokens = accounts.ChatGptTokens(None, token, "rt")
        assert accounts.identity(tokens) == ("acct_p", "p@example.com", None)

    async def test_nonsense_is_no_claims(self) -> None:
        assert accounts.claims("not-a-jwt") == {}
        assert accounts.claims("a.!!!.c") == {}
        assert accounts.claims(None) == {}
        assert accounts.expiry("opaque") is None


@pytest.mark.asyncio
class TestConnect:
    async def test_the_code_the_wait_then_the_account_sealed(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        access = _access("connect")
        with respx.mock(assert_all_called=True) as mock:
            usercode = mock.post(USERCODE_URL).mock(return_value=_usercode())
            device = mock.post(DEVICE_TOKEN_URL).mock(
                side_effect=[httpx.Response(403), httpx.Response(404), _approved()]
            )
            token = mock.post(TOKEN_URL).mock(
                return_value=_tokens(access, "rt_connect", id_token=_id_token())
            )
            started = await client.post(
                "/desktop/api/models/accounts/chatgpt/start", headers=headers
            )
            assert started.status_code == 200, started.text
            body = started.json()
            assert body["userCode"] == "ABCD-1234"
            assert body["verificationUrl"] == f"{AUTH}/codex/device"
            assert body["interval"] == 3
            assert body["expiresIn"] == 15 * 60
            assert json.loads(usercode.calls[0].request.content) == {
                "client_id": CLIENT_ID
            }
            poll = {"connectId": body["connectId"]}
            for _ in range(2):
                waiting = await client.post(
                    "/desktop/api/models/accounts/chatgpt/poll",
                    headers=headers,
                    json=poll,
                )
                assert waiting.json() == {"status": "waiting"}
            connected = await client.post(
                "/desktop/api/models/accounts/chatgpt/poll", headers=headers, json=poll
            )
        assert json.loads(device.calls[0].request.content) == {
            "device_auth_id": "dev_auth_one",
            "user_code": "ABCD-1234",
        }
        assert _form(token.calls[0].request) == {
            "grant_type": "authorization_code",
            "client_id": CLIENT_ID,
            "code": "ac_secret_code",
            "redirect_uri": f"{AUTH}/deviceauth/callback",
            "code_verifier": "verifier_secret",
        }
        assert connected.json()["status"] == "connected"
        shown = connected.json()["account"]
        assert shown["provider"] == "chatgpt"
        assert shown["kind"] == "subscription"
        assert shown["label"] == "ada@example.com"
        assert shown["plan"] == "plus"
        assert shown["status"] == "available"
        assert access not in connected.text
        assert "rt_connect" not in connected.text

        [row] = await _rows(session, user)
        assert row.account_key == "acct_one"
        assert access not in row.access_token
        assert unseal(row.access_token, purpose="model-account") == access
        assert row.refresh_token is not None
        assert "rt_connect" not in row.refresh_token
        assert unseal(row.refresh_token, purpose="model-account") == "rt_connect"
        assert row.expires_at == accounts.expiry(access)

        # The sign-in is spent: asking again says so.
        again = await client.post(
            "/desktop/api/models/accounts/chatgpt/poll", headers=headers, json=poll
        )
        assert again.json() == {"status": "expired"}

    async def test_a_code_from_someone_else_or_made_up_is_expired(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        headers = await _signed_in(client, session, user)
        other = await _signed_in(client, session, user_second)
        with respx.mock(assert_all_called=False) as mock:
            mock.post(USERCODE_URL).mock(return_value=_usercode())
            device = mock.post(DEVICE_TOKEN_URL).mock(return_value=_approved())
            started = await client.post(
                "/desktop/api/models/accounts/chatgpt/start", headers=headers
            )
            stolen = await client.post(
                "/desktop/api/models/accounts/chatgpt/poll",
                headers=other,
                json={"connectId": started.json()["connectId"]},
            )
            made_up = await client.post(
                "/desktop/api/models/accounts/chatgpt/poll",
                headers=headers,
                json={"connectId": "nothing-like-it"},
            )
        assert stolen.json() == {"status": "expired"}
        assert made_up.json() == {"status": "expired"}
        assert not device.called

    async def test_device_code_off_or_openai_down_says_which(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(USERCODE_URL).mock(
                side_effect=[
                    httpx.Response(404),
                    httpx.Response(500),
                    httpx.ConnectError("down"),
                ]
            )
            answers = [
                await client.post(
                    "/desktop/api/models/accounts/chatgpt/start", headers=headers
                )
                for _ in range(3)
            ]
        assert [a.status_code for a in answers] == [502, 502, 502]
        assert [a.json()["error"] for a in answers] == [
            "device_code_off",
            "provider_unavailable",
            "provider_unavailable",
        ]

    async def test_a_refused_exchange_fails_and_forgets_the_sign_in(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(USERCODE_URL).mock(return_value=_usercode())
            mock.post(DEVICE_TOKEN_URL).mock(return_value=_approved())
            mock.post(TOKEN_URL).mock(
                return_value=httpx.Response(400, json={"error": "invalid_grant"})
            )
            started = await client.post(
                "/desktop/api/models/accounts/chatgpt/start", headers=headers
            )
            poll = {"connectId": started.json()["connectId"]}
            failed = await client.post(
                "/desktop/api/models/accounts/chatgpt/poll", headers=headers, json=poll
            )
        assert failed.status_code == 502
        assert failed.json() == {"status": "failed", "error": "invalid_grant"}
        again = await client.post(
            "/desktop/api/models/accounts/chatgpt/poll", headers=headers, json=poll
        )
        assert again.json() == {"status": "expired"}
        assert await _rows(session, user) == []

    async def test_openai_unreachable_while_waiting_keeps_waiting(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(USERCODE_URL).mock(return_value=_usercode())
            mock.post(DEVICE_TOKEN_URL).mock(side_effect=httpx.ConnectError("down"))
            started = await client.post(
                "/desktop/api/models/accounts/chatgpt/start", headers=headers
            )
            polled = await client.post(
                "/desktop/api/models/accounts/chatgpt/poll",
                headers=headers,
                json={"connectId": started.json()["connectId"]},
            )
        assert polled.json() == {"status": "waiting"}

    async def test_the_same_account_again_replaces_it_and_keeps_its_name(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        first = await _connect(client, headers, access=_access("one"), refresh="rt_a")
        renamed = await client.patch(
            f"/desktop/api/models/accounts/{first['id']}",
            headers=headers,
            json={"label": "  Work  "},
        )
        assert renamed.json()["account"]["label"] == "Work"
        second = await _connect(
            client,
            headers,
            access=_access("two"),
            refresh="rt_b",
            id_token=_id_token(plan="pro"),
        )
        assert second["id"] == first["id"]
        assert second["label"] == "Work"
        assert second["plan"] == "pro"
        [row] = await _rows(session, user)
        assert row.refresh_token is not None
        assert unseal(row.refresh_token, purpose="model-account") == "rt_b"

        # Another ChatGPT account is a second row, after the first.
        third = await _connect(
            client, headers, id_token=_id_token("acct_two", "bob@example.com")
        )
        listed = await client.get("/desktop/api/models/accounts", headers=headers)
        assert [a["id"] for a in listed.json()["accounts"]] == [
            first["id"],
            third["id"],
        ]
        assert "rt_" not in listed.text
        assert "sig" not in listed.text

    async def test_a_sign_in_without_an_account_or_refresh_token_is_refused(
        self, session: AsyncSession, user: User
    ) -> None:
        with pytest.raises(accounts.ChatGptError) as no_account:
            await accounts.keep_sign_in(
                session,
                user.id,
                accounts.ChatGptTokens(_jwt({"email": "x@example.com"}), "at", "rt"),
            )
        assert no_account.value.code == "no_account"
        with pytest.raises(accounts.ChatGptError) as no_refresh:
            await accounts.keep_sign_in(
                session, user.id, accounts.ChatGptTokens(_id_token(), "at", None)
            )
        assert no_refresh.value.code == "no_refresh_token"


@pytest.mark.asyncio
class TestRename:
    async def test_an_empty_name_or_someone_elses_account_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        headers = await _signed_in(client, session, user)
        other = await _signed_in(client, session, user_second)
        account = await _connect(client, headers)
        empty = await client.patch(
            f"/desktop/api/models/accounts/{account['id']}",
            headers=headers,
            json={"label": "   "},
        )
        assert empty.status_code == 400
        theirs = await client.patch(
            f"/desktop/api/models/accounts/{account['id']}",
            headers=other,
            json={"label": "Mine now"},
        )
        assert theirs.status_code == 404
        gone = await client.delete(
            f"/desktop/api/models/accounts/{account['id']}", headers=other
        )
        assert gone.status_code == 404
        [row] = await _rows(session, user)
        assert row.label == "ada@example.com"


@pytest.mark.asyncio
class TestAccess:
    async def test_a_fresh_token_is_used_as_it_is(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        access = _access("fresh")
        account = await _connect(client, headers, access=access)
        with respx.mock(assert_all_called=False) as mock:
            token = mock.post(TOKEN_URL).mock(return_value=_tokens("never"))
            grant = await accounts.access_for(session, user.id, _id(account))
        assert not token.called
        assert grant is not None
        assert grant.access_token == access
        assert grant.account_key == "acct_one"

    async def test_a_token_near_its_end_is_refreshed_and_the_new_refresh_kept(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        account = await _connect(client, headers, refresh="rt_old")
        await _expiring(session, user, left=timedelta(minutes=1))
        renewed = _access("renewed")
        with respx.mock(assert_all_called=True) as mock:
            token = mock.post(TOKEN_URL).mock(return_value=_tokens(renewed, "rt_new"))
            grant = await accounts.access_for(session, user.id, _id(account))
        assert json.loads(token.calls[0].request.content) == {
            "grant_type": "refresh_token",
            "client_id": CLIENT_ID,
            "refresh_token": "rt_old",
        }
        assert grant is not None
        assert grant.access_token == renewed
        await session.commit()
        [row] = await _rows(session, user)
        assert unseal(row.access_token, purpose="model-account") == renewed
        assert row.refresh_token is not None
        assert unseal(row.refresh_token, purpose="model-account") == "rt_new"
        assert row.expires_at == accounts.expiry(renewed)

    async def test_a_refresh_without_a_new_refresh_token_keeps_the_old(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        account = await _connect(client, headers, refresh="rt_keep")
        with respx.mock(assert_all_called=True) as mock:
            mock.post(TOKEN_URL).mock(return_value=_tokens(_access("b"), None))
            await accounts.access_for(
                session, user.id, _id(account), force_refresh=True
            )
        await session.commit()
        [row] = await _rows(session, user)
        assert row.refresh_token is not None
        assert unseal(row.refresh_token, purpose="model-account") == "rt_keep"

    @pytest.mark.parametrize(
        "error",
        [
            {"error": {"code": "refresh_token_reused"}},
            {"error": {"code": "refresh_token_expired"}},
            {"error": "invalid_grant"},
        ],
    )
    async def test_a_sign_in_openai_ended_is_signed_out(
        self,
        error: dict[str, Any],
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
    ) -> None:
        headers = await _signed_in(client, session, user)
        account = await _connect(client, headers)
        await _expiring(session, user, left=timedelta(seconds=30))
        with respx.mock(assert_all_called=True) as mock:
            mock.post(TOKEN_URL).mock(return_value=httpx.Response(401, json=error))
            grant = await accounts.access_for(session, user.id, _id(account))
        assert grant is None
        await session.commit()
        listed = await client.get("/desktop/api/models/accounts", headers=headers)
        assert listed.json()["accounts"][0]["status"] == "signed_out"
        # Signed out stays signed out: no more calls to OpenAI.
        with respx.mock(assert_all_called=False) as mock:
            token = mock.post(TOKEN_URL).mock(return_value=_tokens("x"))
            assert await accounts.access_for(session, user.id, _id(account)) is None
        assert not token.called

    async def test_signing_in_again_after_signed_out_makes_it_available(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        account = await _connect(client, headers)
        [row] = await _rows(session, user)
        row.status = accounts.STATUS_SIGNED_OUT
        session.add(row)
        await session.commit()
        again = await _connect(client, headers)
        assert again["id"] == account["id"]
        assert again["status"] == "available"

    async def test_openai_down_uses_a_token_still_valid_or_says_unavailable(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        access = _access("still")
        account = await _connect(client, headers, access=access)
        await _expiring(session, user, left=timedelta(minutes=2))
        with respx.mock(assert_all_called=True) as mock:
            mock.post(TOKEN_URL).mock(side_effect=httpx.ConnectError("down"))
            grant = await accounts.access_for(session, user.id, _id(account))
        assert grant is not None
        assert grant.access_token == access
        await session.commit()
        await _expiring(session, user, left=-timedelta(minutes=1))
        with respx.mock(assert_all_called=True) as mock:
            mock.post(TOKEN_URL).mock(return_value=httpx.Response(500))
            with pytest.raises(accounts.ChatGptUnavailable):
                await accounts.access_for(session, user.id, _id(account))
        [row] = await _rows(session, user)
        assert row.status == accounts.STATUS_AVAILABLE

    async def test_tokens_sealed_under_another_secret_are_signed_out(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        account = await _connect(client, headers)
        [row] = await _rows(session, user)
        row.access_token = seal("x", purpose="something-else")
        session.add(row)
        await session.commit()
        assert await accounts.access_for(session, user.id, _id(account)) is None
        await session.commit()
        [row] = await _rows(session, user)
        assert row.status == accounts.STATUS_SIGNED_OUT

    async def test_a_limited_account_says_until_when(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        await _connect(client, headers)
        [row] = await _rows(session, user)
        until = utc_now() + timedelta(hours=2)
        row.limited_until = until
        session.add(row)
        await session.commit()
        listed = await client.get("/desktop/api/models/accounts", headers=headers)
        shown = listed.json()["accounts"][0]
        assert shown["status"] == "limited"
        assert shown["limitedUntil"] == int(until.timestamp() * 1000)


@pytest.mark.asyncio
class TestDisconnect:
    async def test_disconnect_signs_out_at_openai_and_forgets(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        account = await _connect(client, headers, refresh="rt_bye")
        with respx.mock(assert_all_called=True) as mock:
            revoke = mock.post(REVOKE_URL).mock(return_value=httpx.Response(200))
            response = await client.delete(
                f"/desktop/api/models/accounts/{account['id']}", headers=headers
            )
        assert response.json() == {"disconnected": True, "revoked": True}
        assert json.loads(revoke.calls[0].request.content) == {
            "token": "rt_bye",
            "token_type_hint": "refresh_token",
            "client_id": CLIENT_ID,
        }
        assert await _rows(session, user) == []
        listed = await client.get("/desktop/api/models/accounts", headers=headers)
        assert listed.json() == {"accounts": []}

    async def test_openai_down_still_forgets(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        account = await _connect(client, headers)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(REVOKE_URL).mock(side_effect=httpx.ConnectError("down"))
            response = await client.delete(
                f"/desktop/api/models/accounts/{account['id']}", headers=headers
            )
        assert response.json() == {"disconnected": True, "revoked": False}
        assert await _rows(session, user) == []

    async def test_deleting_the_person_signs_out_every_account(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        await _connect(client, headers)
        await _connect(client, headers, id_token=_id_token("acct_two", "b@example.com"))
        report = account_deletion.DeletionReport()
        with respx.mock(assert_all_called=True) as mock:
            revoke = mock.post(REVOKE_URL).mock(
                side_effect=[httpx.Response(200), httpx.Response(500)]
            )
            await account_deletion._disconnect_model_accounts(session, user, report)
        assert revoke.call_count == 2
        assert report.incomplete == ["AI accounts (1 not revoked at the provider)"]
        assert await _rows(session, user) == []


@pytest.mark.asyncio
class TestNothingSecretIsLogged:
    async def test_tokens_codes_and_verifiers_stay_out_of_the_log(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _signed_in(client, session, user)
        access_a = _access("secret_a")
        access_b = _access("secret_b")
        with capture_logs() as logs:
            with respx.mock(assert_all_called=True) as mock:
                mock.post(USERCODE_URL).mock(return_value=_usercode())
                mock.post(DEVICE_TOKEN_URL).mock(
                    side_effect=[httpx.Response(403), _approved()]
                )
                mock.post(TOKEN_URL).mock(
                    side_effect=[
                        _tokens(access_a, "rt_secret_a", id_token=_id_token()),
                        _tokens(access_b, "rt_secret_b"),
                    ]
                )
                mock.post(REVOKE_URL).mock(return_value=httpx.Response(200))
                started = await client.post(
                    "/desktop/api/models/accounts/chatgpt/start", headers=headers
                )
                connect_id = started.json()["connectId"]
                for _ in range(2):
                    polled = await client.post(
                        "/desktop/api/models/accounts/chatgpt/poll",
                        headers=headers,
                        json={"connectId": connect_id},
                    )
                account = polled.json()["account"]
                await accounts.access_for(
                    session, user.id, _id(account), force_refresh=True
                )
                await session.commit()
                await client.delete(
                    f"/desktop/api/models/accounts/{account['id']}", headers=headers
                )
        events = {one["event"] for one in logs}
        assert {
            "desktop.models.sign_in_started",
            "desktop.models.connected",
            "desktop.models.refreshed",
            "desktop.models.disconnected",
        } <= events
        text = json.dumps(logs, default=str)
        for secret in (
            access_a,
            access_b,
            "rt_secret_a",
            "rt_secret_b",
            "ac_secret_code",
            "verifier_secret",
            "ABCD-1234",
            "dev_auth_one",
            connect_id,
        ):
            assert secret not in text
