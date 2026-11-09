"""The agents' calls on the person's own ChatGPT account
(`simeon/desktop/own_models.py`), end to end over HTTP with ChatGPT and
OpenAI stood in by respx: the choice, the roles the engine is given, the
request ChatGPT receives, the answer streamed back and metered at no
credits, the limit and the next account, Simeon's model when none answers,
and that no token reaches the log. Nothing here reaches OpenAI."""

import json
from datetime import timedelta
from typing import Any

import httpx
import pytest
import respx
from pytest_mock import MockerFixture
from sqlalchemy import select
from structlog.testing import capture_logs

from simeon.config import settings
from simeon.desktop import allowance as allowance_module
from simeon.desktop import model_accounts as accounts
from simeon.desktop import own_models
from simeon.desktop.pricing import ModelPolicy
from simeon.desktop.service import desktop
from simeon.kit.utils import utc_now
from simeon.models import DesktopModelAccount, DesktopUsage, User
from simeon.postgres import AsyncSession
from tests.desktop.test_model_accounts import _access, _id_token

CODEX = "https://chatgpt.test/backend-api/codex"
RESPONSES = f"{CODEX}/responses"
AUTH = "https://auth.openai.test"
SOL = "own:chatgpt:gpt-6.1-sol"


@pytest.fixture(autouse=True)
def stand_ins(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "CHATGPT_CODEX_BASE_URL", CODEX)
    mocker.patch.object(settings, "CHATGPT_AUTH_BASE_URL", AUTH)
    mocker.patch.object(settings, "CHATGPT_CLIENT_ID", "app_simeon_test")
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


async def _account(
    session: AsyncSession,
    user: User,
    *,
    key: str = "acct_one",
    access: str | None = None,
    refresh: str = "rt_one",
    plan: str = "plus",
    choose: str | None = SOL,
) -> DesktopModelAccount:
    """A ChatGPT account connected, and (`choose`) its model chosen."""
    account = await accounts.keep_sign_in(
        session,
        user.id,
        accounts.ChatGptTokens(
            id_token=_id_token(key, f"{key}@example.com", plan),
            access_token=access or _access(key),
            refresh_token=refresh,
        ),
    )
    if choose is not None:
        user.meta = {**(user.meta or {}), own_models.CHOICE_KEY: choose}
        session.add(user)
    await session.commit()
    return account


async def _choose(
    client: httpx.AsyncClient, headers: dict[str, str], model: str | None = SOL
) -> httpx.Response:
    return await client.put(
        "/desktop/api/models/own", headers=headers, json={"model": model}
    )


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


def _engine_request(model: str = SOL, *, stream: bool = True) -> dict[str, Any]:
    """What the engine's AI SDK writes for a reasoning model."""
    return {
        "model": model,
        "input": [
            {"role": "developer", "content": "You are Nora."},
            {"role": "system", "content": "Late note."},
            {"role": "user", "content": [{"type": "input_text", "text": "Hello"}]},
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


async def _usage(session: AsyncSession, user: User) -> list[DesktopUsage]:
    session.expunge_all()
    result = await session.execute(
        select(DesktopUsage).where(DesktopUsage.user_id == user.id)
    )
    return list(result.scalars().all())


@pytest.mark.asyncio
class TestTheRequest:
    async def test_the_body_is_what_chatgpt_takes(self) -> None:
        body = own_models.codex_body(
            {**_engine_request(), "instructions": "Brief."}, "gpt-6.1-sol"
        )
        assert list(body)[:2] == ["model", "stream"]
        assert body["model"] == "gpt-6.1-sol"
        assert body["stream"] is True
        assert body["store"] is False
        for gone in ("max_output_tokens", "temperature", "metadata"):
            assert gone not in body
        assert body["reasoning"] == {"effort": "medium"}
        assert body["prompt_cache_key"] == "agent-nora"
        assert [item["role"] for item in body["input"]] == [
            "developer",
            "developer",
            "developer",
            "user",
        ]
        assert body["input"][0]["content"][0]["text"] == "Brief."

    async def test_an_effort_chatgpt_lacks_is_sent_as_low(self) -> None:
        for effort in ("none", "minimal"):
            body = own_models.codex_body(
                {**_engine_request(), "reasoning": {"effort": effort}}, "gpt-6-luna"
            )
            assert body["reasoning"] == {"effort": "low"}
        kept = own_models.codex_body(_engine_request(), "gpt-6-luna")
        assert kept["reasoning"] == {"effort": "medium"}

    async def test_a_limit_says_until_when(self) -> None:
        now = utc_now()
        at = int((now + timedelta(hours=3)).timestamp())
        until = own_models.limit_end(
            {"error": {"type": "usage_limit_reached", "resets_at": at}}, now
        )
        assert until is not None
        assert int(until.timestamp()) == at
        assert (
            own_models.limit_end(
                {"error": {"code": "subscription_sharing_usage_limit_exceeded"}}, now
            )
            == now + own_models.LIMIT_WITHOUT_END
        )
        assert (
            own_models.limit_end(
                {"error": {"type": "rate_limit_exceeded", "resets_at": at}}, now
            )
            is None
        )
        assert own_models.limit_end("nonsense", now) is None


@pytest.mark.asyncio
class TestTheChoice:
    async def test_without_an_account_nothing_can_be_chosen(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        listed = await client.get("/desktop/api/models/own", headers=headers)
        assert listed.json() == {"model": None, "models": []}
        refused = await _choose(client, headers)
        assert refused.status_code == 400
        assert refused.json()["error"]["code"] == "not_offered"

    async def test_the_choice_puts_the_accounts_models_first_for_the_engine(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        before = await client.get("/desktop/api/models/available", headers=headers)
        assert not any(
            row["modelId"].startswith("own:") for row in before.json()["data"]
        )
        # Nothing chosen, Simeon's own roles exactly: Haiku answers and does
        # the machinery, Sonnet drives the desktop, GPT-6 Sol stands by.
        simeon_roles: dict[str, str] = {}
        for row in before.json()["data"]:
            simeon_roles.setdefault(row["role"], row["modelId"])
        assert simeon_roles == {
            "primary": "claude-haiku-5-5",
            "computer": "claude-sonnet-5-5",
            "fallback": "gpt-6-sol",
            "cheap": "claude-haiku-5-5",
        }
        await _account(session, user, choose=None)
        chosen = await _choose(client, headers)
        assert chosen.status_code == 200, chosen.text
        assert chosen.json()["model"] == SOL
        assert SOL in [one["modelId"] for one in chosen.json()["models"]]

        rows = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()["data"]
        first: dict[str, str] = {}
        for row in rows:
            first.setdefault(row["role"], row["modelId"])
        assert first["primary"] == SOL
        assert first["cheap"] == "own:chatgpt:gpt-6-luna"
        assert first["computer"] == SOL
        assert first["fallback"] == "gpt-6-sol"
        own_row = rows[0]
        assert own_row["transportApi"] == "openai-responses"
        assert own_row["costMultiplier"] == 0

        back = await _choose(client, headers, None)
        assert back.json()["model"] is None
        rows = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()["data"]
        assert not any(row["modelId"].startswith("own:") for row in rows)

    async def test_a_signed_out_account_gives_the_agents_back_to_simeon(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        account = await _account(session, user)
        await _choose(client, headers)
        account.status = accounts.STATUS_SIGNED_OUT
        session.add(account)
        await session.commit()
        rows = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()["data"]
        assert not any(row["modelId"].startswith("own:") for row in rows)
        listed = await client.get("/desktop/api/models/own", headers=headers)
        assert listed.json() == {"model": None, "models": []}


@pytest.mark.asyncio
class TestTheRelay:
    async def test_a_call_goes_to_chatgpt_on_the_account_at_no_credits(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        access = _access("relay")
        await _account(session, user, access=access)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(RESPONSES).mock(return_value=_stream())
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers={**headers, "x-simeon-call-reason": "chat"},
                json=_engine_request(),
            )
        assert answer.status_code == 200, answer.text
        assert answer.content == _completed()
        sent = route.calls[0].request
        assert sent.headers["authorization"] == f"Bearer {access}"
        assert sent.headers["chatgpt-account-id"] == "acct_one"
        assert sent.headers["originator"] == "codex_cli_rs"
        body = json.loads(sent.content)
        assert body["model"] == "gpt-6.1-sol"
        assert body["store"] is False
        assert "max_output_tokens" not in body
        [row] = await _usage(session, user)
        assert row.model == SOL
        assert row.provider == "chatgpt"
        assert row.credits == 0
        assert row.input_tokens == 40
        assert row.reason == "chat"

    async def test_a_call_without_a_stream_gets_the_last_response(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(RESPONSES).mock(return_value=_stream(_completed("Yo")))
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(stream=False),
            )
        assert json.loads(route.calls[0].request.content)["stream"] is True
        assert answer.status_code == 200
        assert answer.json()["output"][0]["content"][0]["text"] == "Yo"
        [row] = await _usage(session, user)
        assert row.credits == 0
        assert row.stream is False

    async def test_a_limit_moves_to_the_next_account_and_is_remembered(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        first = await _account(session, user, key="acct_one")
        await _account(session, user, key="acct_two")
        resets = int((utc_now() + timedelta(hours=2)).timestamp())
        limited = httpx.Response(
            429,
            json={
                "error": {
                    "type": "usage_limit_reached",
                    "plan_type": "plus",
                    "resets_at": resets,
                }
            },
        )
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(RESPONSES).mock(side_effect=[limited, _stream()])
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        assert answer.status_code == 200
        assert [call.request.headers["chatgpt-account-id"] for call in route.calls] == [
            "acct_one",
            "acct_two",
        ]
        session.expunge_all()
        refreshed = await session.get(DesktopModelAccount, first.id)
        assert refreshed is not None
        assert refreshed.limited_until is not None
        assert int(refreshed.limited_until.timestamp()) == resets
        listed = await client.get("/desktop/api/models/accounts", headers=headers)
        assert [a["status"] for a in listed.json()["accounts"]] == [
            "limited",
            "available",
        ]

        # The limited account is skipped until then.
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(RESPONSES).mock(return_value=_stream())
            await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        assert [call.request.headers["chatgpt-account-id"] for call in route.calls] == [
            "acct_two"
        ]

    async def test_no_account_answering_goes_to_simeons_model(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(RESPONSES).mock(
                return_value=httpx.Response(503, json={"error": {"message": "busy"}})
            )
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
            with capture_logs() as logs:
                answer = await client.post(
                    "/desktop/api/proxy/v1/responses",
                    headers=headers,
                    json=_engine_request(stream=False),
                )
        assert answer.status_code == 200, answer.text
        sent = json.loads(simeon.calls[0].request.content)
        # Under the Claude policies GPT-6 Sol is Simeon's model on this wire,
        # and the engine's own request goes to it as it was written.
        assert sent["model"] == "gpt-6-sol"
        assert sent["max_output_tokens"] == 32000
        assert simeon.calls[0].request.headers["authorization"] == (
            "Bearer sk-simeon-openai"
        )
        events = [one["event"] for one in logs]
        assert "desktop.models.relay_refused" in events
        assert "desktop.models.on_simeon" in events
        [row] = await _usage(session, user)
        assert row.model == "gpt-6-sol"
        assert row.credits > 0

    async def test_an_access_token_chatgpt_refuses_is_refreshed_once(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user, refresh="rt_old")
        renewed = _access("renewed")
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{AUTH}/oauth/token").mock(
                return_value=httpx.Response(
                    200, json={"access_token": renewed, "refresh_token": "rt_new"}
                )
            )
            route = mock.post(RESPONSES).mock(
                side_effect=[httpx.Response(401), _stream()]
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        assert answer.status_code == 200
        assert route.calls[1].request.headers["authorization"] == f"Bearer {renewed}"

    async def test_an_unknown_own_model_or_another_wire_is_refused(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        unknown = await client.post(
            "/desktop/api/proxy/v1/responses",
            headers=headers,
            json=_engine_request("own:chatgpt:gpt-0"),
        )
        assert unknown.status_code == 400
        other = await client.post(
            "/desktop/api/proxy/v1/messages",
            headers=headers,
            json={"model": SOL, "max_tokens": 1, "messages": []},
        )
        assert other.status_code == 400

    async def test_a_limit_reached_mid_stream_skips_the_account_after(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        account = await _account(session, user)
        failed = _sse(
            {
                "type": "response.failed",
                "response": {
                    "status": "failed",
                    "error": {"code": "subscription_sharing_usage_limit_exceeded"},
                    "usage": {"input_tokens": 10, "output_tokens": 0},
                },
            }
        )
        with respx.mock(assert_all_called=True) as mock:
            mock.post(RESPONSES).mock(return_value=_stream(failed))
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        assert answer.status_code == 200
        session.expunge_all()
        refreshed = await session.get(DesktopModelAccount, account.id)
        assert refreshed is not None
        assert refreshed.limited_until is not None
        assert refreshed.limited_until > utc_now()


@pytest.mark.asyncio
class TestNothingSecretIsLogged:
    async def test_the_accounts_token_stays_out_of_the_log(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        access = _access("secret_relay")
        await _account(session, user, access=access, refresh="rt_secret_relay")
        with capture_logs() as logs:
            with respx.mock(assert_all_called=True) as mock:
                mock.post(RESPONSES).mock(
                    side_effect=[
                        httpx.Response(500, text="boom"),
                    ]
                )
                mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/responses").mock(
                    return_value=httpx.Response(200, json={"output": []})
                )
                await client.post(
                    "/desktop/api/proxy/v1/responses",
                    headers=headers,
                    json=_engine_request(stream=False),
                )
        text = json.dumps(logs, default=str)
        assert access not in text
        assert "rt_secret_relay" not in text


@pytest.mark.asyncio
class TestNothingMingles:
    async def test_no_plan_no_calls_on_the_account_either(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        mocker.patch.object(
            desktop, "allowance", return_value=allowance_module._none(utc_now())
        )
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(RESPONSES).mock(return_value=_stream())
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        assert not route.called
        assert answer.status_code != 200
        assert "40200" in answer.text
        assert await _usage(session, user) == []

    async def test_back_on_simeons_models_the_account_is_never_called(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user, choose=None)
        with respx.mock(assert_all_called=False) as mock:
            chatgpt = mock.post(RESPONSES).mock(return_value=_stream())
            simeon = mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/responses").mock(
                return_value=httpx.Response(
                    200,
                    json={"output": [], "usage": {"input_tokens": 100}},
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(stream=False),
            )
        assert answer.status_code == 200
        assert not chatgpt.called
        assert json.loads(simeon.calls[0].request.content)["model"] == "gpt-6-sol"
        [row] = await _usage(session, user)
        assert row.model == "gpt-6-sol"
        assert row.provider == "openai"
        assert row.credits > 0

    async def test_a_request_chatgpt_refuses_is_not_paid_for_by_simeon(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=False) as mock:
            mock.post(RESPONSES).mock(
                return_value=httpx.Response(
                    400, json={"error": {"message": "Unsupported parameter: tools"}}
                )
            )
            simeon = mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/responses")
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
        assert answer.status_code == 400
        assert answer.json() == {"error": {"message": "Unsupported parameter: tools"}}
        assert not simeon.called
        assert await _usage(session, user) == []

    async def test_a_plan_without_the_cheap_model_does_its_machinery_on_the_chosen(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user, plan="promax", choose=None)
        listed = await client.get("/desktop/api/models/own", headers=headers)
        offered = [one["modelId"] for one in listed.json()["models"]]
        assert SOL in offered
        assert "own:chatgpt:gpt-6-luna" not in offered
        assert "own:chatgpt:gpt-6-sol" not in offered
        refused = await _choose(client, headers, "own:chatgpt:gpt-6-sol")
        assert refused.status_code == 400
        await _choose(client, headers)
        rows = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()["data"]
        first: dict[str, str] = {}
        for row in rows:
            first.setdefault(row["role"], row["modelId"])
        assert first["primary"] == SOL
        assert first["cheap"] == SOL

    async def test_an_answer_without_a_stream_is_built_from_the_items(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        item = {
            "type": "message",
            "role": "assistant",
            "content": [{"type": "output_text", "text": "From the items"}],
        }
        streamed = _sse(
            {"type": "response.output_item.done", "item": item},
            {
                "type": "response.completed",
                "response": {
                    "id": "resp_2",
                    "status": "completed",
                    "output": [],
                    "usage": {"input_tokens": 3, "output_tokens": 2},
                },
            },
        )
        with respx.mock(assert_all_called=True) as mock:
            mock.post(RESPONSES).mock(return_value=_stream(streamed))
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(stream=False),
            )
        assert answer.json()["output"] == [item]


def _searched(text: str = "Paris is the capital of France.") -> bytes:
    response = {
        "id": "resp_search",
        "status": "completed",
        "output": [
            {
                "type": "web_search_call",
                "status": "completed",
                "action": {
                    "type": "search",
                    "query": "capital of France",
                    "sources": [
                        {"type": "url", "url": "https://example.org/france"},
                        {"type": "url", "url": "https://example.org/paris"},
                    ],
                },
            },
            {
                "type": "message",
                "role": "assistant",
                "content": [
                    {
                        "type": "output_text",
                        "text": text,
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
            },
        ],
        "usage": {"input_tokens": 900, "output_tokens": 30},
    }
    return _sse({"type": "response.completed", "response": response})


ANTHROPIC = "https://api.anthropic.test"


@pytest.mark.asyncio
class TestSearchAndPicturesOnTheAccount:
    async def test_a_search_runs_on_the_account_as_codex_runs_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "DESKTOP_ANTHROPIC_BASE_URL", ANTHROPIC)
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(RESPONSES).mock(return_value=_stream(_searched()))
            claude = mock.post(f"{ANTHROPIC}/v1/messages")
            answer = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": " capital of France "},
            )
        assert answer.status_code == 200, answer.text
        assert not claude.called
        sent = json.loads(route.calls[0].request.content)
        assert sent["model"] == "gpt-6-luna"
        assert sent["stream"] is True
        assert sent["store"] is False
        assert sent["tools"] == [{"type": "web_search", "external_web_access": True}]
        assert sent["input"][1] == {"role": "user", "content": "capital of France"}
        assert answer.json() == {
            "answer": "Paris is the capital of France.",
            "documents": [
                {"url": "https://example.org/paris", "title": "Paris", "text": "Paris"},
                {"url": "https://example.org/france", "title": "", "text": ""},
            ],
            "searches": 1,
        }
        [row] = await _usage(session, user)
        assert row.model == "own:chatgpt:gpt-6-luna"
        assert row.provider == "chatgpt"
        assert row.credits == 0
        assert row.reason == "search"

    async def test_nothing_chosen_searches_on_simeons_as_before(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "DESKTOP_ANTHROPIC_BASE_URL", ANTHROPIC)
        headers = await _headers(client, session, user)
        await _account(session, user, choose=None)
        with respx.mock(assert_all_called=False) as mock:
            chatgpt = mock.post(RESPONSES)
            claude = mock.post(f"{ANTHROPIC}/v1/messages").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "content": [{"type": "text", "text": "From Claude."}],
                        "usage": {"input_tokens": 100, "output_tokens": 10},
                    },
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "anything"},
            )
        assert answer.json()["answer"] == "From Claude."
        assert claude.called
        assert not chatgpt.called
        rows = await _usage(session, user)
        assert {row.provider for row in rows} == {"anthropic"}
        assert sum(row.credits for row in rows) > 0

    async def test_a_search_chatgpt_cant_run_now_runs_on_simeons(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "DESKTOP_ANTHROPIC_BASE_URL", ANTHROPIC)
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(RESPONSES).mock(return_value=httpx.Response(503))
            mock.post(f"{ANTHROPIC}/v1/messages").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "content": [{"type": "text", "text": "From Claude."}],
                        "usage": {"input_tokens": 100, "output_tokens": 10},
                    },
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "anything"},
            )
        assert answer.json()["answer"] == "From Claude."

    async def test_a_search_chatgpt_refuses_is_handed_back(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "DESKTOP_ANTHROPIC_BASE_URL", ANTHROPIC)
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=False) as mock:
            mock.post(RESPONSES).mock(
                return_value=httpx.Response(
                    400, json={"error": {"message": "web_search is not allowed"}}
                )
            )
            claude = mock.post(f"{ANTHROPIC}/v1/messages")
            answer = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "anything"},
            )
        assert answer.status_code == 400
        assert not claude.called
        assert await _usage(session, user) == []

    async def test_a_picture_is_drawn_on_the_account(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=False) as mock:
            route = mock.post(f"{CODEX}/images/generations").mock(
                return_value=httpx.Response(
                    200, json={"created": 1, "data": [{"b64_json": "aGk="}]}
                )
            )
            simeon = mock.post(
                f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/images/generations"
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={"prompt": " a red stool ", "size": "1024x1024"},
            )
        assert answer.status_code == 200, answer.text
        assert not simeon.called
        sent = route.calls[0].request
        assert sent.headers["chatgpt-account-id"] == "acct_one"
        assert json.loads(sent.content) == {
            "prompt": "a red stool",
            "model": "gpt-image-2",
            "quality": "auto",
            "size": "1024x1024",
        }
        assert answer.json() == {
            "data": [{"b64_json": "aGk=", "mime_type": "image/png"}],
            "usage": None,
        }
        [row] = await _usage(session, user)
        assert row.model == "own:chatgpt:gpt-image-2"
        assert row.provider == "chatgpt"
        assert row.credits == 0

    async def test_a_picture_from_pictures_is_an_edit_with_the_pictures_inline(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{CODEX}/images/edits").mock(
                return_value=httpx.Response(200, json={"data": [{"b64_json": "aGk="}]})
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={
                    "prompt": "the same stool in blue",
                    "reference_images": [
                        {"data": "aGVsbG8=", "mime_type": "image/png"}
                    ],
                },
            )
        assert answer.status_code == 200
        sent = json.loads(route.calls[0].request.content)
        assert sent["images"] == [{"image_url": "data:image/png;base64,aGVsbG8="}]

    async def test_nothing_chosen_draws_on_simeons_as_before(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user, choose=None)
        with respx.mock(assert_all_called=False) as mock:
            chatgpt = mock.post(f"{CODEX}/images/generations")
            simeon = mock.post(
                f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/images/generations"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "data": [{"b64_json": "aGk="}],
                        "usage": {"input_tokens": 10, "output_tokens": 1000},
                    },
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={"prompt": "a red stool"},
            )
        assert answer.status_code == 200
        assert simeon.calls[0].request.headers["authorization"] == (
            "Bearer sk-simeon-openai"
        )
        assert not chatgpt.called
        [row] = await _usage(session, user)
        assert row.provider == "openai"
        assert row.credits > 0

    async def test_no_plan_no_search_or_picture_on_the_account(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        headers = await _headers(client, session, user)
        await _account(session, user)
        mocker.patch.object(
            desktop, "allowance", return_value=allowance_module._none(utc_now())
        )
        with respx.mock(assert_all_called=False) as mock:
            chatgpt = mock.post(RESPONSES)
            images = mock.post(f"{CODEX}/images/generations")
            searched = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "anything"},
            )
            drawn = await client.post(
                "/desktop/api/proxy/v1/images/generations",
                headers=headers,
                json={"prompt": "a red stool"},
            )
        assert not chatgpt.called
        assert not images.called
        assert "40200" in searched.text
        assert "40200" in drawn.text


CLAUDE_OPUS = "own:claude:opus"


async def _claude(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    *,
    label: str | None = "ada@example.com",
    plan: str | None = "max",
) -> httpx.Response:
    """The app saying the computer signed in to Claude Code."""
    return await client.post(
        "/desktop/api/models/accounts/claude",
        headers=headers,
        json={"label": label, "plan": plan},
    )


@pytest.mark.asyncio
class TestClaudeThroughClaudeCode:
    """Claude through Claude Code on the person's computer (9 November 2026,
    docs/your-own-models.md, section 6): a row with no token, its models
    offered, the engine told on a wire of its own, and this server never
    calling Claude on the person's plan."""

    async def test_claude_is_a_row_with_no_token_and_its_name_kept(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        made = await _claude(client, headers)
        assert made.status_code == 200, made.text
        account = made.json()["account"]
        assert account["provider"] == "claude"
        assert account["kind"] == "subscription"
        assert account["label"] == "ada@example.com"
        assert account["plan"] == "max"
        assert account["status"] == "available"
        [row] = (
            await session.execute(
                select(DesktopModelAccount).where(
                    DesktopModelAccount.user_id == user.id
                )
            )
        ).scalars()
        assert row.access_token == ""
        assert row.refresh_token is None
        renamed = await client.patch(
            f"/desktop/api/models/accounts/{account['id']}",
            headers=headers,
            json={"label": "Work Claude"},
        )
        assert renamed.status_code == 200
        again = await _claude(client, headers, plan="pro")
        assert again.json()["account"]["id"] == account["id"], "one Claude row"
        assert again.json()["account"]["label"] == "Work Claude", "its name kept"
        assert again.json()["account"]["plan"] == "pro"
        assert await accounts.access_for(session, user.id, row.id) is None

    async def test_choosing_claude_tells_the_engine_on_the_claude_code_wire(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _claude(client, headers)
        listed = await client.get("/desktop/api/models/own", headers=headers)
        assert [one["modelId"] for one in listed.json()["models"]] == [
            CLAUDE_OPUS,
            "own:claude:sonnet",
        ]
        chosen = await _choose(client, headers, CLAUDE_OPUS)
        assert chosen.status_code == 200, chosen.text
        assert chosen.json()["model"] == CLAUDE_OPUS
        rows = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()["data"]
        first = rows[0]
        assert first["modelId"] == CLAUDE_OPUS
        assert first["role"] == "primary"
        assert first["transportApi"] == "claude-code"
        assert first["claudeCodeModel"] == "opus"
        assert first["costMultiplier"] == 0
        # An engine that doesn't know the wire takes the next primary row,
        # Simeon's; the machinery and the desktop stay on Simeon's.
        roles: dict[str, str] = {}
        for row in rows:
            if row.get("transportApi") != "claude-code":
                roles.setdefault(row["role"], row["modelId"])
        assert roles["primary"] == "claude-haiku-5-5"
        assert roles["cheap"] == "claude-haiku-5-5"
        assert roles["computer"] == "claude-sonnet-5-5"

    async def test_a_call_naming_claude_is_answered_by_simeons_never_on_the_plan(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _claude(client, headers)
        await _choose(client, headers, CLAUDE_OPUS)
        with respx.mock(assert_all_called=True) as mock:
            simeon = mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/responses").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "id": "resp_s",
                        "output": [],
                        "usage": {"input_tokens": 100, "output_tokens": 10},
                    },
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json={**_engine_request(stream=False), "model": CLAUDE_OPUS},
            )
        assert answer.status_code == 200, answer.text
        assert json.loads(simeon.calls[0].request.content)["model"] == "gpt-6-sol"

    async def test_search_stays_on_simeons_for_a_person_on_claude(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(settings, "DESKTOP_ANTHROPIC_BASE_URL", ANTHROPIC)
        headers = await _headers(client, session, user)
        await _claude(client, headers)
        await _choose(client, headers, CLAUDE_OPUS)
        with respx.mock(assert_all_called=False) as mock:
            chatgpt = mock.post(RESPONSES)
            claude = mock.post(f"{ANTHROPIC}/v1/messages").mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "content": [{"type": "text", "text": "From Claude."}],
                        "usage": {"input_tokens": 100, "output_tokens": 10},
                    },
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/web/search",
                headers=headers,
                json={"query": "anything"},
            )
        assert answer.json()["answer"] == "From Claude."
        assert claude.called
        assert not chatgpt.called

    async def test_disconnecting_claude_forgets_it_and_goes_back_to_simeons(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        account = (await _claude(client, headers)).json()["account"]
        await _choose(client, headers, CLAUDE_OPUS)
        with respx.mock(assert_all_called=False) as mock:
            revoke = mock.post(f"{AUTH}/oauth/revoke")
            gone = await client.delete(
                f"/desktop/api/models/accounts/{account['id']}", headers=headers
            )
        assert gone.status_code == 200
        assert not revoke.called, "nothing to revoke: Claude Code signs out itself"
        listed = await client.get("/desktop/api/models/own", headers=headers)
        assert listed.json() == {"model": None, "models": []}
        rows = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()["data"]
        assert not any(row["modelId"].startswith("own:") for row in rows)
