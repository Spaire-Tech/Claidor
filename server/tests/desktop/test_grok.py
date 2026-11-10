"""Grok on the person's own SuperGrok or X Premium plan
(`simeon/desktop/grok.py`, `model_accounts.py`, `own_models.py`), end to
end over HTTP with xAI stood in by respx: the code and the wait, the plan's
gate, the account kept sealed, the refresh, disconnect, the agents' calls on
the plan with Grok Build's headers and body, out of credits and the next
account, the usage from xAI's billing, the search and the pictures, and that
no token reaches the log. Nothing here reaches xAI."""

import base64
import json
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
import respx
from pytest_mock import MockerFixture
from sqlalchemy import select
from structlog.testing import capture_logs

from simeon.config import settings
from simeon.desktop import grok, own_models
from simeon.desktop import model_accounts as accounts
from simeon.desktop.pricing import ModelPolicy
from simeon.desktop.service import desktop
from simeon.kit.sealed import unseal
from simeon.kit.utils import utc_now
from simeon.models import DesktopModelAccount, DesktopUsage, User
from simeon.postgres import AsyncSession

AUTH = "https://auth.x.test"
PROXY = "https://cli-chat-proxy.grok.test/v1"
API = "https://api.x.test/v1"
DEVICE_URL = f"{AUTH}/oauth2/device/code"
TOKEN_URL = f"{AUTH}/oauth2/token"
REVOKE_URL = f"{AUTH}/oauth2/revoke"
SETTINGS_URL = f"{PROXY}/settings"
BILLING_URL = f"{PROXY}/billing"
RESPONSES = f"{PROXY}/responses"
CLIENT_ID = "grok-client-test"
GROK = "own:grok:grok-4.6"


@pytest.fixture(autouse=True)
def xai_stand_in(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "GROK_AUTH_BASE_URL", AUTH)
    mocker.patch.object(settings, "GROK_PROXY_BASE_URL", PROXY)
    mocker.patch.object(settings, "GROK_API_BASE_URL", API)
    mocker.patch.object(settings, "GROK_CLIENT_ID", CLIENT_ID)
    mocker.patch.object(settings, "OPENAI_API_KEY", "sk-simeon-openai")
    mocker.patch.object(settings, "ANTHROPIC_API_KEY", "sk-simeon-anthropic")
    mocker.patch.object(settings, "DESKTOP_MODELS", ModelPolicy.claude_haiku)


async def _headers(
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


def _access(
    marker: str = "a",
    *,
    tier: int = 1,
    lasts: timedelta = timedelta(hours=6),
    sub: str = "user-one",
) -> str:
    return _jwt(
        {"sub": sub, "tier": tier, "exp": int((utc_now() + lasts).timestamp())},
        marker,
    )


def _id_token(sub: str = "user-one", email: str = "ada@example.com") -> str:
    return _jwt({"sub": sub, "email": email})


def _tokens(
    access: str, refresh: str | None = "grok_rt_one", *, sub: str = "user-one"
) -> httpx.Response:
    body: dict[str, Any] = {
        "access_token": access,
        "id_token": _id_token(sub),
        "expires_in": 21600,
        "token_type": "Bearer",
    }
    if refresh is not None:
        body["refresh_token"] = refresh
    return httpx.Response(200, json=body)


def _device(**extra: Any) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "device_code": "grok_device_secret",
            "user_code": "WXYZ-1234",
            "verification_uri": "https://accounts.x.ai/oauth2/device",
            "verification_uri_complete": "https://accounts.x.ai/oauth2/device?user_code=WXYZ-1234",
            "expires_in": 600,
            "interval": 5,
            **extra,
        },
    )


def _pending(code: str = "authorization_pending") -> httpx.Response:
    return httpx.Response(400, json={"error": code})


def _allowed(allowed: bool = True) -> httpx.Response:
    return httpx.Response(
        200,
        json={"allow_access": allowed, "subscription_tier_display": "SuperGrok"},
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


async def _usage(session: AsyncSession, user: User) -> list[DesktopUsage]:
    session.expunge_all()
    result = await session.execute(
        select(DesktopUsage).where(DesktopUsage.user_id == user.id)
    )
    return list(result.scalars().all())


async def _asked_long_ago(redis: Any, connect_id: str) -> None:
    """The sheet's next question comes after xAI's interval."""
    key = f"desktop:model-connect:{connect_id}"
    kept = json.loads(await redis.get(key))
    kept["asked_at"] = kept["asked_at"] - 60
    await redis.set(key, json.dumps(kept), keepttl=True)


async def _account(
    session: AsyncSession,
    user: User,
    *,
    sub: str = "user-one",
    access: str | None = None,
    tier: int = 1,
    choose: str | None = GROK,
) -> DesktopModelAccount:
    """A Grok account connected, and (`choose`) its model chosen."""
    account = await accounts.keep_sign_in(
        session,
        user.id,
        accounts.SignInTokens(
            id_token=_id_token(sub, f"{sub}@example.com"),
            access_token=access or _access(sub, tier=tier, sub=sub),
            refresh_token=f"rt_{sub}",
        ),
        accounts.PROVIDER_GROK,
    )
    if choose is not None:
        user.meta = {**(user.meta or {}), own_models.CHOICE_KEY: choose}
        session.add(user)
    await session.commit()
    return account


def _sse(*events: dict[str, Any]) -> bytes:
    return b"".join(f"data: {json.dumps(one)}\n\n".encode() for one in events)


def _completed(text: str = "Hi", tokens: int = 40) -> bytes:
    response = {
        "id": "resp_1",
        "object": "response",
        "status": "completed",
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": text}],
            }
        ],
        "usage": {
            "input_tokens": tokens,
            "output_tokens": 5,
            "input_tokens_details": {"cached_tokens": 0},
        },
    }
    return _sse(
        {"type": "response.output_text.delta", "delta": text},
        {"type": "response.completed", "response": response},
    )


def _stream(body: bytes = b"") -> httpx.Response:
    return httpx.Response(
        200,
        content=body or _completed(),
        headers={"content-type": "text/event-stream"},
    )


def _billing(
    percent: float = 42.5, kind: str = "USAGE_PERIOD_TYPE_WEEKLY"
) -> httpx.Response:
    end = (utc_now() + timedelta(days=3)).replace(microsecond=0)
    return httpx.Response(
        200,
        json={
            "config": {
                "creditUsagePercent": percent,
                "currentPeriod": {
                    "type": kind,
                    "start": (end - timedelta(days=7)).isoformat(),
                    "end": end.isoformat().replace("+00:00", "Z"),
                },
            }
        },
    )


def _engine_request(model: str = GROK, *, stream: bool = True) -> dict[str, Any]:
    """What the engine's AI SDK writes for a reasoning model."""
    return {
        "model": model,
        "input": [
            {"role": "developer", "content": "You are Nora."},
            {"role": "user", "content": [{"type": "input_text", "text": "Hello"}]},
            {
                "type": "reasoning",
                "id": "rs_1",
                "status": "completed",
                "summary": [],
                "encrypted_content": "enc",
            },
        ],
        "max_output_tokens": 32000,
        "temperature": 0.2,
        "reasoning": {"effort": "medium"},
        "tools": [{"type": "function", "name": "Search", "parameters": {}}],
        "tool_choice": "auto",
        "prompt_cache_key": "agent-nora",
        "metadata": {"x": "y"},
        "stream": stream,
    }


@pytest.mark.asyncio
class TestTheSignIn:
    async def test_the_code_the_wait_the_plan_then_the_account_sealed(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User, redis: Any
    ) -> None:
        headers = await _headers(client, session, user)
        access = _access("connect", tier=5)
        with respx.mock(assert_all_called=True) as mock:
            device = mock.post(DEVICE_URL).mock(return_value=_device())
            token = mock.post(TOKEN_URL).mock(
                side_effect=[_pending(), _tokens(access, "grok_rt_connect")]
            )
            gate = mock.get(SETTINGS_URL).mock(return_value=_allowed())
            started = await client.post(
                "/desktop/api/models/accounts/grok/start", headers=headers
            )
            assert started.status_code == 200, started.text
            body = started.json()
            assert body["userCode"] == "WXYZ-1234"
            # The page with the code already in it, so the person only checks it.
            assert (
                body["verificationUrl"]
                == "https://accounts.x.ai/oauth2/device?user_code=WXYZ-1234"
            )
            assert body["interval"] == 5
            assert body["expiresIn"] == 600
            assert "grok_device_secret" not in started.text
            assert _form(device.calls[0].request) == {
                "client_id": CLIENT_ID,
                "scope": grok.SCOPES,
                "referrer": "simeon",
            }
            poll = {"connectId": body["connectId"]}
            waiting = await client.post(
                "/desktop/api/models/accounts/grok/poll", headers=headers, json=poll
            )
            assert waiting.json() == {"status": "waiting", "interval": 5}
            # Asked again too soon: xAI isn't asked.
            again = await client.post(
                "/desktop/api/models/accounts/grok/poll", headers=headers, json=poll
            )
            assert again.json()["status"] == "waiting"
            assert len(token.calls) == 1
            await _asked_long_ago(redis, body["connectId"])
            connected = await client.post(
                "/desktop/api/models/accounts/grok/poll", headers=headers, json=poll
            )
        assert _form(token.calls[0].request) == {
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": "grok_device_secret",
            "client_id": CLIENT_ID,
        }
        sent = gate.calls[0].request.headers
        assert sent["authorization"] == f"Bearer {access}"
        assert sent["x-xai-token-auth"] == "xai-grok-cli"
        assert sent["x-grok-client-identifier"] == "simeon"
        assert connected.json()["status"] == "connected", connected.text
        shown = connected.json()["account"]
        assert shown["provider"] == "grok"
        assert shown["plan"] == "supergrok_heavy"
        assert shown["label"] == "ada@example.com"
        assert access not in connected.text
        [row] = await _rows(session, user)
        assert row.account_key == "user-one"
        assert unseal(row.access_token, purpose="model-account") == access
        assert row.refresh_token is not None
        assert unseal(row.refresh_token, purpose="model-account") == "grok_rt_connect"
        assert row.expires_at is not None

    async def test_xai_asking_to_slow_down_is_heard(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User, redis: Any
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(DEVICE_URL).mock(return_value=_device())
            mock.post(TOKEN_URL).mock(return_value=_pending("slow_down"))
            started = await client.post(
                "/desktop/api/models/accounts/grok/start", headers=headers
            )
            waiting = await client.post(
                "/desktop/api/models/accounts/grok/poll",
                headers=headers,
                json={"connectId": started.json()["connectId"]},
            )
        assert waiting.json() == {"status": "waiting", "interval": 10}

    async def test_a_plan_xai_bars_is_refused_and_its_sign_in_ended(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(DEVICE_URL).mock(return_value=_device())
            mock.post(TOKEN_URL).mock(return_value=_tokens(_access(tier=0)))
            mock.get(SETTINGS_URL).mock(return_value=_allowed(False))
            revoke = mock.post(REVOKE_URL).mock(return_value=httpx.Response(200))
            started = await client.post(
                "/desktop/api/models/accounts/grok/start", headers=headers
            )
            failed = await client.post(
                "/desktop/api/models/accounts/grok/poll",
                headers=headers,
                json={"connectId": started.json()["connectId"]},
            )
        assert failed.json() == {"status": "failed", "reason": "not_allowed"}
        assert _form(revoke.calls[0].request)["token"] == "grok_rt_one"
        assert await _rows(session, user) == []

    async def test_the_person_declining_on_xais_page_ends_it(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(DEVICE_URL).mock(return_value=_device())
            mock.post(TOKEN_URL).mock(return_value=_pending("access_denied"))
            started = await client.post(
                "/desktop/api/models/accounts/grok/start", headers=headers
            )
            poll = {"connectId": started.json()["connectId"]}
            failed = await client.post(
                "/desktop/api/models/accounts/grok/poll", headers=headers, json=poll
            )
            spent = await client.post(
                "/desktop/api/models/accounts/grok/poll", headers=headers, json=poll
            )
        assert failed.json() == {"status": "failed", "reason": "access_denied"}
        assert spent.json() == {"status": "expired"}

    async def test_device_sign_in_off_and_xai_away_are_said(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(DEVICE_URL).mock(
                side_effect=[httpx.Response(404), httpx.ConnectError("down")]
            )
            off = await client.post(
                "/desktop/api/models/accounts/grok/start", headers=headers
            )
            away = await client.post(
                "/desktop/api/models/accounts/grok/start", headers=headers
            )
        assert off.status_code == 502
        assert off.json()["error"] == {
            "code": "device_code_off",
            "message": "Grok didn't allow signing in with a code.",
        }
        assert away.json()["error"]["code"] == "provider_unavailable"
        assert away.json()["error"]["message"] == (
            "Couldn't reach Grok. Try again in a moment."
        )

    async def test_a_page_not_xais_own_is_never_handed_to_the_app(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(DEVICE_URL).mock(
                return_value=_device(
                    verification_uri="https://evil.example/device",
                    verification_uri_complete="http://accounts.x.ai/device",
                )
            )
            refused = await client.post(
                "/desktop/api/models/accounts/grok/start", headers=headers
            )
        assert refused.status_code == 502
        assert refused.json()["error"]["code"] == "provider_unavailable"

    async def test_a_chatgpt_sign_in_cant_be_finished_as_grok(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(DEVICE_URL).mock(return_value=_device())
            started = await client.post(
                "/desktop/api/models/accounts/grok/start", headers=headers
            )
        crossed = await client.post(
            "/desktop/api/models/accounts/chatgpt/poll",
            headers=headers,
            json={"connectId": started.json()["connectId"]},
        )
        assert crossed.json() == {"status": "expired"}

    async def test_the_tier_names_the_plan_and_a_team_is_its_own_account(self) -> None:
        tokens = accounts.SignInTokens(_id_token(), _access(tier=3), "rt")
        assert grok.identity(tokens) == ("user-one", "ada@example.com", "x_premium")
        team = _jwt(
            {
                "sub": "user-one",
                "tier": 1,
                "principal_type": "Team",
                "principal_id": "t-9",
            }
        )
        assert grok.identity(accounts.SignInTokens(None, team, "rt"))[0] == "team:t-9"


@pytest.mark.asyncio
class TestTheAccount:
    async def test_the_refresh_is_xais_with_the_old_token_rotated(
        self, session: AsyncSession, user: User
    ) -> None:
        account = await _account(
            session, user, access=_access("old", lasts=timedelta(minutes=1))
        )
        renewed = _access("new")
        with respx.mock(assert_all_called=True) as mock:
            token = mock.post(TOKEN_URL).mock(
                return_value=_tokens(renewed, "rt_rotated")
            )
            grant = await accounts.access_for(session, user.id, account.id)
        assert grant is not None
        assert grant.access_token == renewed
        assert _form(token.calls[0].request) == {
            "grant_type": "refresh_token",
            "refresh_token": "rt_user-one",
            "client_id": CLIENT_ID,
        }
        [row] = await _rows(session, user)
        assert unseal(row.refresh_token or "", purpose="model-account") == "rt_rotated"

    async def test_a_sign_in_xai_ended_shows_signed_out(
        self, session: AsyncSession, user: User
    ) -> None:
        account = await _account(
            session, user, access=_access("old", lasts=timedelta(minutes=1))
        )
        with respx.mock(assert_all_called=True) as mock:
            mock.post(TOKEN_URL).mock(
                return_value=httpx.Response(400, json={"error": "invalid_grant"})
            )
            grant = await accounts.access_for(session, user.id, account.id)
        assert grant is None
        [row] = await _rows(session, user)
        assert row.status == accounts.STATUS_SIGNED_OUT

    async def test_disconnect_ends_the_sign_in_at_xai(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        account = await _account(session, user)
        with respx.mock(assert_all_called=True) as mock:
            revoke = mock.post(REVOKE_URL).mock(return_value=httpx.Response(200))
            gone = await client.delete(
                f"/desktop/api/models/accounts/{account.id}", headers=headers
            )
        assert gone.json() == {"disconnected": True, "revoked": True}
        assert _form(revoke.calls[0].request) == {
            "token": "rt_user-one",
            "token_type_hint": "refresh_token",
            "client_id": CLIENT_ID,
        }
        assert await _rows(session, user) == []


@pytest.mark.asyncio
class TestTheChoice:
    async def test_grok_models_are_offered_with_their_own_efforts(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user, choose=None)
        offered = await client.get("/desktop/api/models/own", headers=headers)
        assert [one["modelId"] for one in offered.json()["models"]] == [
            "own:grok:grok-4.6",
            "own:grok:grok-4.5",
        ]
        chosen = await client.put(
            "/desktop/api/models/own", headers=headers, json={"model": GROK}
        )
        assert chosen.json()["effort"] == "high"
        assert chosen.json()["efforts"] == ["low", "medium", "high", "xhigh"]
        extra = await client.put(
            "/desktop/api/models/own", headers=headers, json={"effort": "xhigh"}
        )
        assert extra.json()["effort"] == "xhigh"
        # Grok 4.5 stops at High: the choice follows the model.
        older = await client.put(
            "/desktop/api/models/own",
            headers=headers,
            json={"model": "own:grok:grok-4.5"},
        )
        assert older.json()["efforts"] == ["low", "medium", "high"]
        assert older.json()["effort"] == "high"
        refused = await client.put(
            "/desktop/api/models/own", headers=headers, json={"effort": "xhigh"}
        )
        assert refused.status_code == 400

    async def test_the_engine_is_told_grok_for_every_role(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        listed = await client.get("/desktop/api/models/available", headers=headers)
        rows = listed.json()["data"]
        mine = [row for row in rows if row["modelId"].startswith("own:")]
        assert [(row["modelId"], row["role"]) for row in mine] == [
            (GROK, "primary"),
            (GROK, "cheap"),
            (GROK, "computer"),
        ]
        assert mine[0]["costMultiplier"] == 0.0


@pytest.mark.asyncio
class TestTheRequest:
    async def test_the_body_is_what_grok_build_sends(self) -> None:
        own = own_models.own_model(GROK)
        assert own is not None
        body = own_models.grok_body(
            {**_engine_request(), "instructions": "Brief."}, own
        )
        assert body["model"] == "grok-4.6"
        assert body["stream"] is True
        assert body["store"] is False
        assert "metadata" not in body
        assert body["max_output_tokens"] == 32000
        assert body["prompt_cache_key"] == "agent-nora"
        assert body["input"][0] == {"role": "system", "content": "Brief."}
        assert body["input"][1] == {"role": "system", "content": "You are Nora."}
        assert "status" not in body["input"][3]
        assert body["input"][3]["encrypted_content"] == "enc"

    async def test_efforts_fit_the_model(self) -> None:
        newest = own_models.own_model(GROK)
        older = own_models.own_model("own:grok:grok-4.5")
        assert newest is not None
        assert older is not None
        machinery = own_models.grok_body(
            {**_engine_request(), "reasoning": {"effort": "none"}}, newest, "xhigh"
        )
        assert machinery["reasoning"] == {"effort": "low"}
        chosen = own_models.grok_body(_engine_request(), newest, "xhigh")
        assert chosen["reasoning"] == {"effort": "xhigh"}
        most = own_models.grok_body(
            {**_engine_request(), "reasoning": {"effort": "max"}}, older
        )
        assert most["reasoning"] == {"effort": "high"}

    async def test_out_of_credits_is_read_as_grok_build_reads_it(self) -> None:
        assert grok.out_of_credits(402, b"")
        assert grok.out_of_credits(
            429,
            b'{"code":429,"error":"You ran out of credits. [WKE=personal-team-blocked:spending-limit]"}',
        )
        assert grok.out_of_credits(403, "You have run out of credits")
        assert not grok.out_of_credits(403, b'{"error":"forbidden"}')
        assert not grok.out_of_credits(429, b'{"error":"slow down"}')

    async def test_billing_reads_as_a_window(self) -> None:
        found = grok.credits_of(_billing(12.345, "USAGE_PERIOD_TYPE_MONTHLY").json())
        assert found is not None
        assert found.window is not None
        assert found.window["kind"] == "monthly"
        assert found.window["usedPercent"] == 12.3
        assert found.period_end is not None
        assert found.window["resetsAt"] == int(found.period_end.timestamp() * 1000)
        assert grok.credits_of({"config": {}}) is None
        assert grok.credits_of("nonsense") is None


@pytest.mark.asyncio
class TestTheRelay:
    async def test_a_call_goes_to_grok_on_the_plan_at_no_credits(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        access = _access("relay")
        account = await _account(session, user, access=access)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(RESPONSES).mock(return_value=_stream())
            billing = mock.get(BILLING_URL).mock(return_value=_billing())
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers={**headers, "x-simeon-call-reason": "chat"},
                json=_engine_request(),
            )
        assert answer.status_code == 200, answer.text
        assert answer.content == _completed()
        sent = route.calls[0].request
        assert sent.headers["authorization"] == f"Bearer {access}"
        assert sent.headers["x-xai-token-auth"] == "xai-grok-cli"
        assert sent.headers["x-grok-model-override"] == "grok-4.6"
        assert sent.headers["x-grok-conv-id"] == "agent-nora"
        assert sent.headers["x-grok-client-version"] == settings.GROK_CLIENT_VERSION
        body = json.loads(sent.content)
        assert body["model"] == "grok-4.6"
        assert body["reasoning"] == {"effort": "high"}
        assert billing.calls[0].request.url.params["format"] == "credits"
        assert billing.calls[0].request.headers["x-userid"] == "user-one"
        [row] = await _usage(session, user)
        assert row.model == GROK
        assert row.provider == "grok"
        assert row.credits == 0
        session.expunge_all()
        kept = await session.get(DesktopModelAccount, account.id)
        assert kept is not None
        assert kept.usage is not None
        assert kept.usage["windows"][0]["kind"] == "weekly"
        assert kept.usage["windows"][0]["usedPercent"] == 42.5

        # Billing is asked at most every few minutes.
        with respx.mock(assert_all_called=False) as mock:
            mock.post(RESPONSES).mock(return_value=_stream())
            billing = mock.get(BILLING_URL).mock(return_value=_billing())
            await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        assert not billing.called

    async def test_out_of_credits_moves_on_and_waits_for_the_period(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        first = await _account(session, user, sub="user-one")
        await _account(session, user, sub="user-two")
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(RESPONSES).mock(
                side_effect=[
                    httpx.Response(402, json={"error": "You ran out of credits."}),
                    _stream(),
                ]
            )
            mock.get(BILLING_URL).mock(return_value=_billing(100))
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        assert answer.status_code == 200
        assert len(route.calls) == 2
        session.expunge_all()
        limited = await session.get(DesktopModelAccount, first.id)
        assert limited is not None
        assert limited.limited_until is not None
        assert limited.limited_until > utc_now() + timedelta(days=2)

    async def test_the_only_account_out_of_credits_goes_to_simeons(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(RESPONSES).mock(
                return_value=httpx.Response(
                    403, json={"error": "You have run out of credits"}
                )
            )
            mock.get(BILLING_URL).mock(return_value=httpx.Response(500))
            simeon = mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/responses").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "id": "resp_s",
                        "output": [],
                        "usage": {"input_tokens": 1000, "output_tokens": 10},
                    },
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(stream=False),
            )
        assert answer.status_code == 200, answer.text
        assert simeon.called
        [row] = await _usage(session, user)
        assert row.credits > 0
        # Billing didn't say until when: an hour.
        [kept] = await _rows(session, user)
        assert kept.limited_until is not None
        assert kept.limited_until < utc_now() + timedelta(hours=1, minutes=1)

    async def test_a_request_grok_refuses_is_handed_back(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=False) as mock:
            mock.post(RESPONSES).mock(
                return_value=httpx.Response(
                    400, json={"error": "Unsupported parameter: tools"}
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        assert answer.status_code == 400
        assert answer.json() == {"error": "Unsupported parameter: tools"}
        assert await _usage(session, user) == []


@pytest.mark.asyncio
class TestSearchAndPictures:
    async def test_a_search_runs_on_grok_with_its_own_search(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user, choose="own:grok:grok-4.5")
        searched = {
            "id": "resp_search",
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "Paris is the capital.",
                            "annotations": [
                                {
                                    "type": "url_citation",
                                    "url": "https://example.org/paris",
                                    "title": "Paris",
                                    "start_index": 0,
                                    "end_index": 5,
                                }
                            ],
                        }
                    ],
                }
            ],
            "usage": {"input_tokens": 900, "output_tokens": 30},
        }
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(RESPONSES).mock(
                return_value=httpx.Response(200, json=searched)
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "capital of France"},
            )
        assert answer.status_code == 200, answer.text
        sent = json.loads(route.calls[0].request.content)
        # Grok 4.5 has no search of its own: Grok 4.6 searches.
        assert sent["model"] == "grok-4.6"
        assert sent["tools"] == [{"type": "web_search"}]
        assert "stream" not in sent
        assert answer.json()["documents"] == [
            {"url": "https://example.org/paris", "title": "Paris", "text": "Paris"}
        ]
        [row] = await _usage(session, user)
        assert row.provider == "grok"
        assert row.credits == 0

    async def test_a_picture_is_drawn_by_grok_imagine(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        access = _access("pictures")
        await _account(session, user, access=access)
        jpeg = base64.b64encode(b"\xff\xd8\xff\xe0jpeg").decode()
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{API}/images/generations").mock(
                return_value=httpx.Response(200, json={"data": [{"b64_json": jpeg}]})
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={"prompt": "a red stool", "size": "1536x1024"},
            )
        assert answer.status_code == 200, answer.text
        sent = route.calls[0].request
        assert sent.headers["authorization"] == f"Bearer {access}"
        assert json.loads(sent.content) == {
            "model": "grok-imagine-image-quality",
            "prompt": "a red stool",
            "n": 1,
            "resolution": "1k",
            "response_format": "b64_json",
            "aspect_ratio": "3:2",
        }
        assert answer.json()["data"] == [{"b64_json": jpeg, "mime_type": "image/jpeg"}]

    async def test_one_picture_given_is_an_edit_of_it(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{API}/images/edits").mock(
                return_value=httpx.Response(200, json={"data": [{"b64_json": "aGk="}]})
            )
            await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={
                    "prompt": "the same stool in blue",
                    "reference_images": [
                        {"data": "aGVsbG8=", "mime_type": "image/png"}
                    ],
                },
            )
        sent = json.loads(route.calls[0].request.content)
        assert sent["image"] == {"url": "data:image/png;base64,aGVsbG8="}
        assert "aspect_ratio" not in sent

    async def test_a_plan_without_pictures_draws_on_simeons(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user, tier=2)
        with respx.mock(assert_all_called=False) as mock:
            grok_pictures = mock.post(f"{API}/images/generations")
            simeon = mock.post(
                f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/images/generations"
            ).mock(
                return_value=httpx.Response(
                    200, json={"data": [{"b64_json": "aGk="}], "usage": {}}
                )
            )
            await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={"prompt": "a red stool"},
            )
        assert not grok_pictures.called
        assert simeon.called


@pytest.mark.asyncio
class TestNothingSecretIsLogged:
    async def test_no_token_or_code_reaches_the_log(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User, redis: Any
    ) -> None:
        headers = await _headers(client, session, user)
        access = _access("logged")
        with capture_logs() as logs, respx.mock(assert_all_called=False) as mock:
            mock.post(DEVICE_URL).mock(return_value=_device())
            mock.post(TOKEN_URL).mock(return_value=_tokens(access, "grok_rt_logged"))
            mock.get(SETTINGS_URL).mock(return_value=_allowed())
            mock.post(RESPONSES).mock(return_value=_stream())
            mock.get(BILLING_URL).mock(return_value=_billing())
            started = await client.post(
                "/desktop/api/models/accounts/grok/start", headers=headers
            )
            await client.post(
                "/desktop/api/models/accounts/grok/poll",
                headers=headers,
                json={"connectId": started.json()["connectId"]},
            )
            await client.put(
                "/desktop/api/models/own", headers=headers, json={"model": GROK}
            )
            await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        written = json.dumps(logs, default=str)
        for secret in (access, "grok_rt_logged", "grok_device_secret", "WXYZ-1234"):
            assert secret not in written
