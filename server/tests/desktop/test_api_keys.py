"""The person's own API keys (`key_providers.py`, `model_accounts.py`,
`own_models.py`), end to end over HTTP with every provider stood in by
respx: the list of providers, a key tried before it is kept and kept
sealed, the details a provider needs checked before anything is sent, the
models it reaches offered and chosen, and the agents' calls on the key on
each wire (Chat Completions, Claude's Messages, Responses), with what a
provider wants back kept for its next call, the plain request for a model
that refuses the rest, the refusals and the fallback to Simeon's, and no
key in the log. Nothing here reaches a provider."""

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
from simeon.desktop import key_providers, own_models
from simeon.desktop import model_accounts as accounts
from simeon.desktop.pricing import ModelPolicy
from simeon.desktop.service import desktop
from simeon.kit.sealed import unseal
from simeon.kit.utils import utc_now
from simeon.models import DesktopModelAccount, DesktopUsage, User
from simeon.postgres import AsyncSession

KEY = "sk-deepseek-test-1234abcd"
DEEPSEEK = "https://api.deepseek.com"
ANTHROPIC = "https://api.anthropic.com"
OPENAI = "https://api.openai.com/v1"


@pytest.fixture(autouse=True)
def simeons_own(mocker: MockerFixture) -> None:
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


def _listed(*ids: str) -> httpx.Response:
    return httpx.Response(
        200, json={"object": "list", "data": [{"id": one} for one in ids]}
    )


async def _connect(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    provider: str = "deepseek",
    key: str = KEY,
    fields: dict[str, str] | None = None,
) -> httpx.Response:
    return await client.post(
        f"/desktop/api/models/accounts/keys/{provider}",
        headers=headers,
        json={"key": key, "fields": fields or {}},
    )


async def _keyed(
    session: AsyncSession,
    user: User,
    provider: str = "deepseek",
    *,
    key: str = KEY,
    fields: dict[str, str] | None = None,
    choose: str | None = "own:deepseek:deepseek-v4-pro",
) -> DesktopModelAccount:
    """A key connected (as the route keeps it) and, with `choose`, chosen."""
    one = key_providers.provider(provider)
    assert one is not None
    account = await accounts.keep_key(
        session,
        user.id,
        provider,
        key,
        fields or {},
        key_providers.offered(one, None) or key_providers.deployments(fields or {}),
    )
    if choose is not None:
        user.meta = {**(user.meta or {}), own_models.CHOICE_KEY: choose}
        session.add(user)
    await session.commit()
    return account


def _chat_sse(*chunks: dict[str, Any]) -> bytes:
    lines = [f"data: {json.dumps(one)}\n\n" for one in chunks]
    return ("".join(lines) + "data: [DONE]\n\n").encode()


def _chunk(delta: dict[str, Any], finish: str | None = None) -> dict[str, Any]:
    return {
        "id": "chatcmpl-1",
        "model": "deepseek-v4-pro",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
    }


def _chat_answer(*, call: bool = False) -> httpx.Response:
    chunks = [_chunk({"reasoning_content": "Weather first."})]
    if call:
        chunks.append(
            _chunk(
                {
                    "tool_calls": [
                        {
                            "index": 0,
                            "id": "call_w",
                            "function": {
                                "name": "Weather",
                                "arguments": '{"city":"Paris"}',
                            },
                        }
                    ]
                },
                "tool_calls",
            )
        )
    else:
        chunks.append(_chunk({"content": "Hello."}, "stop"))
    chunks.append(
        {"choices": [], "usage": {"prompt_tokens": 120, "completion_tokens": 9}}
    )
    return httpx.Response(
        200, content=_chat_sse(*chunks), headers={"content-type": "text/event-stream"}
    )


def _engine_request(
    model: str = "own:deepseek:deepseek-v4-pro", *, stream: bool = True, **extra: Any
) -> dict[str, Any]:
    """What the engine's AI SDK writes for an `own:` model."""
    return {
        "model": model,
        "input": [
            {"role": "developer", "content": "You are Nora."},
            {"role": "user", "content": [{"type": "input_text", "text": "Hello"}]},
        ],
        "max_output_tokens": 32000,
        "reasoning": {"effort": "medium"},
        "tools": [
            {
                "type": "function",
                "name": "Weather",
                "description": "The weather.",
                "parameters": {"type": "object", "properties": {}},
                "strict": True,
            }
        ],
        "tool_choice": "auto",
        "prompt_cache_key": "agent-nora",
        "stream": stream,
        **extra,
    }


def _events(body: bytes) -> list[dict[str, Any]]:
    return [
        json.loads(line.removeprefix("data: "))
        for line in body.decode().splitlines()
        if line.startswith("data: ")
    ]


def _simeons() -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "resp_s",
            "output": [],
            "usage": {"input_tokens": 1000, "output_tokens": 10},
        },
    )


@pytest.mark.asyncio
class TestTheList:
    async def test_every_provider_in_the_founders_order(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)

        listed = await client.get("/desktop/api/models/accounts", headers=headers)

        providers = listed.json()["keyProviders"]
        assert [one["name"] for one in providers] == [
            "Anthropic",
            "OpenAI",
            "SpaceXAI",
            "Google",
            "Amazon Bedrock",
            "Ant Ling",
            "Azure OpenAI",
            "Baseten",
            "Cerebras",
            "Cloudflare Workers AI",
            "DeepSeek",
            "Fireworks",
            "GitHub Copilot",
            "Groq",
            "Hugging Face",
            "Meta",
            "MiniMax",
            "Mistral",
            "Moonshot AI",
            "NVIDIA",
            "OpenCode Go",
            "Qwen",
            "Together",
            "Xiaomi",
            "Z.AI",
        ]
        soon = [one["provider"] for one in providers if not one["available"]]
        assert soon == ["copilot", "meta"]
        by = {one["provider"]: one for one in providers}
        assert (
            by["xai"]["hint"]
            == "SuperGrok or X Premium+? Connect Grok under Subscriptions."
        )
        assert [one["key"] for one in by["azure"]["fields"]] == [
            "endpoint",
            "deployments",
        ]
        assert by["bedrock"]["fields"][0]["default"] == "us-east-1"
        assert by["deepseek"]["keyPage"] == "https://platform.deepseek.com/api_keys"
        # Every slug fits the column it is kept in.
        assert all(len(one["provider"]) <= 20 for one in providers)


@pytest.mark.asyncio
class TestConnect:
    async def test_a_key_tried_then_kept_sealed_with_its_models(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.get(f"{DEEPSEEK}/models").mock(
                return_value=_listed(
                    "deepseek-flash", "deepseek-v4-pro", "deepseek-embed"
                )
            )
            answer = await _connect(client, headers)

        assert answer.status_code == 200, answer.text
        assert route.calls[0].request.headers["authorization"] == f"Bearer {KEY}"
        account = answer.json()["account"]
        assert account["provider"] == "deepseek"
        assert account["kind"] == "api_key"
        assert account["label"] == "…abcd"
        # Named here, best first; nothing that isn't a chat model.
        assert account["models"] == [
            {
                "id": "deepseek-v4-pro",
                "name": "DeepSeek V4 Pro",
                "contextWindow": 1_000_000,
            },
            {
                "id": "deepseek-flash",
                "name": "DeepSeek Flash",
                "contextWindow": 1_000_000,
            },
        ]
        assert KEY not in answer.text
        [row] = await _rows(session, user)
        assert KEY not in row.access_token
        assert KEY not in row.account_key
        opened = unseal(row.access_token, purpose="model-account")
        assert opened is not None
        assert json.loads(opened) == {"key": KEY, "fields": {}}

    async def test_the_same_key_again_replaces_it(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock() as mock:
            mock.get(f"{DEEPSEEK}/models").mock(return_value=_listed("deepseek-v4-pro"))
            await _connect(client, headers)
            await _connect(client, headers)
            await _connect(client, headers, key="sk-another-key-9999")

        rows = await _rows(session, user)
        assert [one.label for one in rows] == ["…abcd", "…9999"]

    async def test_a_key_refused_is_never_kept(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock() as mock:
            mock.get(f"{DEEPSEEK}/models").mock(return_value=httpx.Response(401))
            answer = await _connect(client, headers)

        assert answer.status_code == 400
        assert answer.json()["error"] == {
            "code": "key_refused",
            "message": "DeepSeek didn't accept this key.",
        }
        assert await _rows(session, user) == []

    async def test_googles_own_words_for_a_bad_key(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock() as mock:
            mock.get(
                "https://generativelanguage.googleapis.com/v1beta/openai/models"
            ).mock(
                return_value=httpx.Response(
                    400,
                    json=[
                        {
                            "error": {
                                "message": "API key not valid. Please pass a valid API key."
                            }
                        }
                    ],
                )
            )
            answer = await _connect(client, headers, "google", "AIzaSyBadKeyBadKey")

        assert answer.json()["error"]["code"] == "key_refused"

    async def test_details_checked_before_anything_is_sent(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        # No route: any request at all would fail the test.
        with respx.mock():
            elsewhere = await _connect(
                client,
                headers,
                "azure",
                fields={"endpoint": "https://evil.example.com", "deployments": "gpt"},
            )
            no_account = await _connect(client, headers, "cloudflare", fields={})
            bad_region = await _connect(
                client, headers, "bedrock", fields={"region": "../../etc"}
            )
            spaces = await _connect(client, headers, key="sk with spaces")

        for answer in (elsewhere, no_account, bad_region):
            assert answer.status_code == 400
            assert answer.json()["error"]["code"] == "invalid_fields"
        assert spaces.json()["error"]["code"] == "invalid_key"

    async def test_azure_tried_on_the_first_deployment(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            probe = mock.post(
                "https://my-resource.openai.azure.com/openai/v1/responses"
            ).mock(return_value=httpx.Response(200, json={"id": "resp_1"}))
            answer = await _connect(
                client,
                headers,
                "azure",
                "0123456789abcdef0123456789abcdef",
                fields={
                    "endpoint": "https://my-resource.openai.azure.com/",
                    "deployments": "gpt-6-astra, gpt-6-luna",
                },
            )

        assert answer.status_code == 200, answer.text
        sent = probe.calls[0].request
        assert sent.headers["api-key"] == "0123456789abcdef0123456789abcdef"
        assert "authorization" not in sent.headers
        assert json.loads(sent.content)["model"] == "gpt-6-astra"
        assert [one["id"] for one in answer.json()["account"]["models"]] == [
            "gpt-6-astra",
            "gpt-6-luna",
        ]

    async def test_a_provider_without_a_list_is_asked_one_word(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.get("https://api.minimax.io/v1/models").mock(
                return_value=httpx.Response(404)
            )
            probe = mock.post("https://api.minimax.io/anthropic/v1/messages").mock(
                return_value=httpx.Response(200, json={"id": "msg_1"})
            )
            answer = await _connect(client, headers, "minimax", "mm-key-0000")

        assert answer.status_code == 200, answer.text
        assert json.loads(probe.calls[0].request.content)["max_tokens"] == 1
        assert [one["id"] for one in answer.json()["account"]["models"]] == [
            "MiniMax-M3",
            "MiniMax-M3.1-Flash",
        ]

    async def test_a_host_of_many_models_offers_the_best_known_first(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        account_id = "0123456789abcdef0123456789abcdef"
        with respx.mock(assert_all_called=True) as mock:
            mock.get(
                f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/models/search"
            ).mock(
                return_value=httpx.Response(
                    200,
                    json={
                        "result": [
                            {"name": "@cf/meta/llama-3.3-70b-instruct"},
                            {"name": "@cf/baai/bge-large-en"},
                            {
                                "name": "@cf/moonshotai/kimi-k3",
                                "properties": [
                                    {"property_id": "context_window", "value": "262144"}
                                ],
                            },
                            {"name": "@cf/zai-org/glm-5.3"},
                        ]
                    },
                )
            )
            answer = await _connect(
                client,
                headers,
                "cloudflare",
                "cf-token-0000",
                {"account_id": account_id},
            )

        models = answer.json()["account"]["models"]
        assert [one["id"] for one in models] == [
            "@cf/moonshotai/kimi-k3",
            "@cf/zai-org/glm-5.3",
            "@cf/meta/llama-3.3-70b-instruct",
        ]
        assert models[0]["contextWindow"] == 262144
        assert models[0]["name"] == "Kimi K3"

    async def test_a_provider_not_offered(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)

        copilot = await _connect(client, headers, "copilot")
        unknown = await _connect(client, headers, "nobody")

        assert copilot.status_code == 404
        assert unknown.json()["error"]["code"] == "unknown_provider"


class TestAHostsMenu:
    """The models of a host of many, as the composer's menu lists them."""

    def test_a_hosts_menu_best_first_without_the_small_ones(self) -> None:
        # What the composer's menu shows for Together: the families agents
        # do best with first, the bigger first within each, nothing under
        # 14B, a name for each that the person reads.
        listed = key_providers.listed(
            "together",
            [
                {"id": one, "type": "chat"}
                for one in (
                    "arcee-ai/AFM-5B",
                    "microsoft/Phi-5",
                    "Qwen/Qwen3.5-7B-Instruct",
                    "google/gemma-4-27b-it",
                    "Qwen/Qwen3.5-235B-A22B-Instruct",
                    "meta-llama/Llama-4-Scout-17B-16E-Instruct",
                    "mistralai/Mixtral-8x22B-Instruct-v0.1",
                    "Qwen/Qwen3.5-Coder-480B-A35B-Instruct",
                    "moonshotai/Kimi-K3",
                    "openai/gpt-oss-20b",
                    "openai/gpt-oss-120b",
                )
            ],
        )
        together = key_providers.provider("together")
        assert together is not None
        offered = key_providers.offered(together, listed)
        assert [one["name"] for one in offered] == [
            "Kimi K3",
            "Qwen3.5 Coder 480B A35B",
            "Qwen3.5 235B A22B",
            "GPT OSS 120B",
            "Llama 4 Scout 17B 16E",
            "GPT OSS 20B",
            "Gemma 4 27B",
            "Mixtral 8x22B v0.1",
            "Phi 5",
        ]
        # A host that lists only small ones still offers them.
        small = key_providers.listed("together", [{"id": "arcee-ai/AFM-5B"}])
        assert [one["name"] for one in key_providers.offered(together, small)] == [
            "AFM 5B"
        ]

    def test_two_of_a_hosts_models_under_one_name_show_once(self) -> None:
        nvidia = key_providers.provider("nvidia")
        assert nvidia is not None
        listed = [
            {
                "id": "meta/llama-4-maverick-17b-128e-instruct",
                "name": "Llama 4 Maverick",
            },
            {
                "id": "meta/llama-4-maverick-17b-128e-instruct-fp8",
                "name": "Llama 4 Maverick",
            },
        ]
        offered = key_providers.offered(nvidia, listed)
        assert [one["id"] for one in offered] == [
            "meta/llama-4-maverick-17b-128e-instruct"
        ]


@pytest.mark.asyncio
class TestTheChoice:
    async def test_the_keys_models_offered_chosen_and_followed(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(session, user, choose=None)

        offered = await client.get("/desktop/api/models/own", headers=headers)
        assert [one["modelId"] for one in offered.json()["models"]] == [
            "own:deepseek:deepseek-v4-pro",
            "own:deepseek:deepseek-flash",
        ]
        chosen = await client.put(
            "/desktop/api/models/own",
            headers=headers,
            json={"model": "own:deepseek:deepseek-v4-pro"},
        )
        assert chosen.status_code == 200, chosen.text
        assert chosen.json()["model"] == "own:deepseek:deepseek-v4-pro"
        # DeepSeek takes no effort here.
        assert chosen.json()["efforts"] == []
        rows = (
            await client.get("/desktop/api/models/available", headers=headers)
        ).json()["data"]
        mine = [
            (row["modelId"], row["role"])
            for row in rows
            if row["modelId"].startswith("own:")
        ]
        # Every role on the chosen model: the person's key pays for all of it.
        assert mine == [
            ("own:deepseek:deepseek-v4-pro", "primary"),
            ("own:deepseek:deepseek-v4-pro", "cheap"),
            ("own:deepseek:deepseek-v4-pro", "computer"),
        ]
        primary = next(
            row for row in rows if row["modelId"] == "own:deepseek:deepseek-v4-pro"
        )
        assert primary["description"] == "DeepSeek V4 Pro on your DeepSeek key"
        assert primary["contextWindow"] == 1_000_000

    async def test_claudes_efforts_on_a_key(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(session, user, "anthropic", key="sk-ant-test-0000", choose=None)

        chosen = await client.put(
            "/desktop/api/models/own",
            headers=headers,
            json={"model": "own:anthropic:claude-opus-5-5"},
        )

        assert chosen.json()["efforts"] == ["low", "medium", "high", "xhigh", "max"]
        assert chosen.json()["effort"] == "medium"

    async def test_a_model_the_key_doesnt_reach_isnt_chosen(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(session, user, choose=None)

        refused = await client.put(
            "/desktop/api/models/own",
            headers=headers,
            json={"model": "own:deepseek:deepseek-r9"},
        )

        assert refused.status_code == 400


@pytest.mark.asyncio
class TestTheRelay:
    async def test_a_chat_provider_answers_on_the_responses_wire(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(session, user)
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{DEEPSEEK}/chat/completions").mock(
                return_value=_chat_answer()
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers={**headers, "x-simeon-call-reason": "chat"},
                json=_engine_request(),
            )

        assert answer.status_code == 200, answer.text
        sent = route.calls[0].request
        assert sent.headers["authorization"] == f"Bearer {KEY}"
        body = json.loads(sent.content)
        assert body["model"] == "deepseek-v4-pro"
        assert body["messages"][0] == {"role": "system", "content": "You are Nora."}
        assert body["stream_options"] == {"include_usage": True}
        assert body["tools"][0]["function"]["name"] == "Weather"
        events = _events(answer.content)
        assert events[0]["type"] == "response.created"
        assert [
            one["delta"]
            for one in events
            if one["type"] == "response.output_text.delta"
        ] == ["Hello."]
        assert events[-1]["type"] == "response.completed"
        assert events[-1]["response"]["usage"]["input_tokens"] == 120
        [row] = await _usage(session, user)
        assert row.model == "own:deepseek:deepseek-v4-pro"
        assert row.provider == "deepseek"
        assert row.credits == 0

    async def test_an_answer_wanted_whole(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(session, user)
        with respx.mock() as mock:
            mock.post(f"{DEEPSEEK}/chat/completions").mock(return_value=_chat_answer())
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(stream=False),
            )

        assert answer.status_code == 200, answer.text
        whole = answer.json()
        assert whole["status"] == "completed"
        assert [one["type"] for one in whole["output"]] == ["reasoning", "message"]
        assert whole["output"][1]["content"][0]["text"] == "Hello."

    async def test_what_deepseek_thought_goes_back_with_its_call(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Any,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(own_models, "_store", return_value=redis)
        headers = await _headers(client, session, user)
        await _keyed(session, user)
        with respx.mock() as mock:
            route = mock.post(f"{DEEPSEEK}/chat/completions").mock(
                side_effect=[_chat_answer(call=True), _chat_answer()]
            )
            await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
            follow = _engine_request()
            follow["input"] += [
                {
                    "type": "function_call",
                    "call_id": "call_w",
                    "name": "Weather",
                    "arguments": '{"city":"Paris"}',
                },
                {
                    "type": "function_call_output",
                    "call_id": "call_w",
                    "output": "Sunny",
                },
            ]
            await client.post(
                "/desktop/api/proxy/v1/responses", headers=headers, json=follow
            )

        second = json.loads(route.calls[1].request.content)
        turn = second["messages"][2]
        assert turn["role"] == "assistant"
        assert turn["reasoning_content"] == "Weather first."
        assert turn["tool_calls"][0]["id"] == "call_w"

    async def test_a_model_that_refuses_the_rest_is_sent_it_plain(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        redis: Any,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(own_models, "_store", return_value=redis)
        headers = await _headers(client, session, user)
        await _keyed(session, user)
        with respx.mock() as mock:
            route = mock.post(f"{DEEPSEEK}/chat/completions").mock(
                side_effect=[
                    httpx.Response(400, json={"error": {"message": "Unknown field"}}),
                    _chat_answer(),
                    _chat_answer(),
                ]
            )
            first = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )
            await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )

        assert first.status_code == 200, first.text
        sent = [json.loads(one.request.content) for one in route.calls]
        assert "stream_options" in sent[0]
        assert "stream_options" not in sent[1]
        # Kept for that model: the next call goes plain at once.
        assert len(sent) == 3
        assert "stream_options" not in sent[2]

    async def test_a_key_no_longer_taken_shows_signed_out(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{DEEPSEEK}/chat/completions").mock(
                return_value=httpx.Response(401, json={"error": {"message": "bad key"}})
            )
            simeon = mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/responses").mock(
                return_value=_simeons()
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(stream=False),
            )

        assert answer.status_code == 200, answer.text
        assert simeon.called
        [row] = await _rows(session, user)
        assert row.status == accounts.STATUS_SIGNED_OUT
        listed = await client.get("/desktop/api/models/accounts", headers=headers)
        assert listed.json()["accounts"][0]["status"] == "signed_out"

    async def test_a_rate_limit_waits_as_the_provider_says(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(session, user)
        with respx.mock(assert_all_called=True) as mock:
            mock.post(f"{DEEPSEEK}/chat/completions").mock(
                return_value=httpx.Response(429, headers={"retry-after": "30"})
            )
            mock.post(f"{settings.DESKTOP_OPENAI_BASE_URL}/v1/responses").mock(
                return_value=_simeons()
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(stream=False),
            )

        assert answer.status_code == 200
        [row] = await _rows(session, user)
        assert row.limited_until is not None
        assert row.limited_until < utc_now() + timedelta(seconds=31)
        [usage] = await _usage(session, user)
        assert usage.credits > 0

    async def test_a_request_the_provider_refuses_is_handed_back(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(session, user)
        with respx.mock() as mock:
            mock.post(f"{DEEPSEEK}/chat/completions").mock(
                return_value=httpx.Response(
                    403, json={"error": {"message": "This key can't use that model."}}
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )

        assert answer.status_code == 403
        assert answer.json()["error"]["message"] == "This key can't use that model."

    async def test_claude_on_its_own_wire_with_its_cache(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(
            session,
            user,
            "anthropic",
            key="sk-ant-test-0000",
            choose="own:anthropic:claude-opus-5-5",
        )
        claude = "".join(
            f"event: {one['type']}\ndata: {json.dumps(one)}\n\n"
            for one in (
                {
                    "type": "message_start",
                    "message": {
                        "id": "msg_1",
                        "model": "claude-opus-5-5",
                        "usage": {"input_tokens": 3, "cache_read_input_tokens": 9000},
                    },
                },
                {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {"type": "text", "text": ""},
                },
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": "Bonjour."},
                },
                {"type": "content_block_stop", "index": 0},
                {
                    "type": "message_delta",
                    "delta": {"stop_reason": "end_turn"},
                    "usage": {"output_tokens": 4},
                },
                {"type": "message_stop"},
            )
        ).encode()
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{ANTHROPIC}/v1/messages").mock(
                return_value=httpx.Response(
                    200, content=claude, headers={"content-type": "text/event-stream"}
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request("own:anthropic:claude-opus-5-5"),
            )

        assert answer.status_code == 200, answer.text
        sent = route.calls[0].request
        assert sent.headers["x-api-key"] == "sk-ant-test-0000"
        assert sent.headers["anthropic-version"]
        body = json.loads(sent.content)
        assert body["model"] == "claude-opus-5-5"
        assert body["system"][-1]["cache_control"] == {"type": "ephemeral"}
        # The person's effort (Anthropic's own default, here).
        assert body["output_config"] == {"effort": "medium"}
        events = _events(answer.content)
        assert [
            one["delta"]
            for one in events
            if one["type"] == "response.output_text.delta"
        ] == ["Bonjour."]
        assert events[-1]["response"]["usage"]["input_tokens_details"] == {
            "cached_tokens": 9000
        }

    async def test_openai_takes_the_engines_request_as_it_is(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(
            session,
            user,
            "openai",
            key="sk-openai-test-0000",
            choose="own:openai:gpt-6-astra",
        )
        responses = (
            b'data: {"type":"response.output_text.delta","delta":"Hi"}\n\n'
            b'data: {"type":"response.completed","response":{"id":"resp_o","status":"completed",'
            b'"output":[],"usage":{"input_tokens":7,"output_tokens":1}}}\n\n'
        )
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{OPENAI}/responses").mock(
                return_value=httpx.Response(
                    200,
                    content=responses,
                    headers={"content-type": "text/event-stream"},
                )
            )
            answer = await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request("own:openai:gpt-6-astra"),
            )

        assert answer.status_code == 200, answer.text
        assert answer.content == responses
        body = json.loads(route.calls[0].request.content)
        assert body["model"] == "gpt-6-astra"
        assert body["store"] is False
        assert body["reasoning"] == {"effort": "medium"}
        assert body["prompt_cache_key"] == "agent-nora"

    async def test_background_work_on_a_key_is_sent_at_low(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        await _keyed(
            session,
            user,
            "anthropic",
            key="sk-ant-test-0000",
            choose="own:anthropic:claude-opus-5-5",
        )
        user.meta = {**(user.meta or {}), own_models.EFFORT_KEY: "max"}
        session.add(user)
        await session.commit()
        claude = "".join(
            f"event: {one['type']}\ndata: {json.dumps(one)}\n\n"
            for one in (
                {
                    "type": "message_start",
                    "message": {"id": "msg_1", "usage": {"input_tokens": 3}},
                },
                {
                    "type": "message_delta",
                    "delta": {"stop_reason": "end_turn"},
                    "usage": {"output_tokens": 1},
                },
                {"type": "message_stop"},
            )
        ).encode()
        reasons = ["safety", "browser", "chat"]
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post(f"{ANTHROPIC}/v1/messages").mock(
                side_effect=[
                    httpx.Response(
                        200,
                        content=claude,
                        headers={"content-type": "text/event-stream"},
                    )
                    for _ in reasons
                ]
            )
            for reason in reasons:
                answer = await client.post(
                    "/desktop/api/proxy/v1/responses",
                    headers={**headers, "x-simeon-call-reason": reason},
                    json=_engine_request("own:anthropic:claude-opus-5-5"),
                )
                assert answer.status_code == 200, answer.text
        efforts = [
            json.loads(call.request.content)["output_config"] for call in route.calls
        ]
        # The safety review and the helper in the browser at low (12 November
        # 2026); the agent's own turn at the effort chosen.
        assert efforts == [{"effort": "low"}, {"effort": "low"}, {"effort": "max"}]


@pytest.mark.asyncio
class TestNothingSecretIsLogged:
    async def test_no_key_reaches_the_log(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        with capture_logs() as logs, respx.mock() as mock:
            mock.get(f"{DEEPSEEK}/models").mock(return_value=_listed("deepseek-v4-pro"))
            mock.post(f"{DEEPSEEK}/chat/completions").mock(
                side_effect=[
                    httpx.Response(400, json={"error": {"message": "nope"}}),
                    httpx.Response(403, json={"error": {"message": "still no"}}),
                ]
            )
            await _connect(client, headers)
            user.meta = {own_models.CHOICE_KEY: "own:deepseek:deepseek-v4-pro"}
            session.add(user)
            await session.commit()
            await client.post(
                "/desktop/api/proxy/v1/responses",
                headers=headers,
                json=_engine_request(),
            )

        assert logs
        assert KEY not in json.dumps(logs, default=str)
