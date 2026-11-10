"""Simeon as an MCP server (`simeon/desktop/mcp.py`, 10 November 2026): a
bot the person added signs in with the server's OAuth, then lists their
agents, messages one (through the inbox) and reads the answer."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.desktop import mcp
from simeon.desktop.chat_repository import DesktopChatInboxRepository
from simeon.models import OAuth2Client, User
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.oauth2.conftest import create_oauth2_token

from .test_chats import _copy, _line, _signed_in_with_box

TOKEN = "simeon_at_mcp_test"


@pytest.fixture
def published(mocker: MockerFixture) -> Any:
    return mocker.patch.object(mcp, "publish", new=mocker.AsyncMock())


async def _bot(
    save_fixture: SaveFixture, user: User, scopes: list[str]
) -> dict[str, str]:
    """A bot called Dots, signed in as the person with these scopes."""
    client = OAuth2Client(
        client_id="simeon_ci_dots",
        client_secret="simeon_cs_dots",
        registration_access_token="simeon_crt_dots",
        user=None,
    )
    client.set_client_metadata(
        {
            "client_name": "Dots",
            "redirect_uris": ["https://chatgpt.com/connector_platform_oauth_redirect"],
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": " ".join(scopes),
        }
    )
    await save_fixture(client)
    await create_oauth2_token(
        save_fixture,
        client=client,
        access_token=TOKEN,
        refresh_token="simeon_rt_mcp_test",
        scopes=scopes,
        user=user,
    )
    return {"Authorization": f"Bearer {TOKEN}"}


async def _rpc(
    client: httpx.AsyncClient, headers: dict[str, str], method: str, **params: Any
) -> dict[str, Any]:
    response = await client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _tool(
    client: httpx.AsyncClient, headers: dict[str, str], name: str, **arguments: Any
) -> dict[str, Any]:
    answer = await _rpc(client, headers, "tools/call", name=name, arguments=arguments)
    return answer["result"]


AGENTS = [
    {"id": "iris", "name": "Iris", "title": "Travel"},
    {"id": "theo", "name": "Theo", "title": "Ops"},
    {
        "id": "team",
        "name": "Launch team",
        "isGroup": True,
        "memberIds": ["iris", "theo"],
    },
]


@pytest.mark.asyncio
class TestSignIn:
    async def test_without_a_token_it_says_where_to_sign_in(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.post(
            "/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize"}
        )
        assert response.status_code == 401
        header = response.headers["www-authenticate"]
        assert header.startswith("Bearer ")
        assert 'resource_metadata="' in header
        assert "/.well-known/oauth-protected-resource/mcp" in header
        assert 'scope="agents"' in header

    async def test_an_unknown_token_is_the_same_401_not_an_oauth_error(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "initialize"},
            headers={"Authorization": "Bearer simeon_at_nope"},
        )
        assert response.status_code == 401
        assert 'error="invalid_token"' in response.headers["www-authenticate"]

    async def test_the_resource_names_its_sign_in_server(
        self, client: httpx.AsyncClient
    ) -> None:
        # The sign-in server's own metadata: tests/oauth2/endpoints/test_oauth2.py.
        for path in ("/mcp", ""):
            resource = (
                await client.get(f"/.well-known/oauth-protected-resource{path}")
            ).json()
            assert resource["resource"].endswith("/mcp")
            assert resource["scopes_supported"] == ["agents"]
            assert resource["authorization_servers"] == ["https://api.simeonlabs.com"]

    async def test_a_token_without_the_agents_scope_is_refused(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        bot = await _bot(save_fixture, user, ["openid", "profile"])
        response = await client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            headers=bot,
        )
        assert response.status_code == 403
        assert 'error="insufficient_scope"' in response.headers["www-authenticate"]

    async def test_no_stream_to_open(self, client: httpx.AsyncClient) -> None:
        assert (await client.get("/mcp")).status_code == 405


@pytest.mark.asyncio
class TestProtocol:
    async def test_initialize_tools_and_notifications(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        bot = await _bot(save_fixture, user, ["agents"])
        hello = await _rpc(client, bot, "initialize", protocolVersion="2025-06-18")
        assert hello["result"]["protocolVersion"] == "2025-06-18"
        assert hello["result"]["serverInfo"]["title"] == "Simeon"
        assert "tools" in hello["result"]["capabilities"]
        later = await _rpc(client, bot, "initialize", protocolVersion="2099-01-01")
        assert later["result"]["protocolVersion"] == mcp.PROTOCOL_VERSIONS[0]
        note = await client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            headers=bot,
        )
        assert note.status_code == 202
        tools = (await _rpc(client, bot, "tools/list"))["result"]["tools"]
        assert [t["name"] for t in tools] == [
            "list_agents",
            "send_message",
            "read_messages",
        ]
        assert (await _rpc(client, bot, "nope"))["error"]["code"] == -32601


@pytest.mark.asyncio
class TestTools:
    async def test_list_message_and_read(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        published: Any,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _copy(
            client,
            box,
            agents=AGENTS,
            lines=[
                {"agentId": "iris", "entry": _line("u1", "Find me a flight", 1_000)},
                {
                    "agentId": "iris",
                    "entry": {
                        "kind": "send-message",
                        "id": "a1",
                        "message": {"type": "text", "content": "On it."},
                        "timestampMs": 2_000,
                    },
                },
                {
                    "agentId": "iris",
                    "entry": {"kind": "tool-call", "id": "t1", "timestampMs": 2_500},
                },
            ],
        )
        bot = await _bot(save_fixture, user, ["agents"])

        listed = (await _tool(client, bot, "list_agents"))["structuredContent"]
        assert listed["agents"] == [
            {"id": "iris", "name": "Iris", "role": "Travel"},
            {
                "id": "team",
                "name": "Launch team",
                "group": True,
                "members": ["Iris", "Theo"],
            },
            {"id": "theo", "name": "Theo", "role": "Ops"},
        ]

        sent = await _tool(
            client, bot, "send_message", agent="iris", message=" Book the 9am one "
        )
        assert sent["structuredContent"]["sent"] is True
        assert sent["structuredContent"]["agent"] == {"id": "iris", "name": "Iris"}
        published.assert_awaited_once()
        assert published.await_args.args[1:] == (user.id, "chat-inbox")
        (waiting,) = await DesktopChatInboxRepository.from_session(session).waiting(
            user.id, 10
        )
        assert waiting.agent_id == "iris"
        assert waiting.message["prompt"] == "Dots: Book the 9am one"

        read = (await _tool(client, bot, "read_messages", agent="Iris"))[
            "structuredContent"
        ]
        assert read["messages"] == [
            {"id": "u1", "from": "you", "text": "Find me a flight", "at": 1_000},
            {"id": "a1", "from": "Iris", "text": "On it.", "at": 2_000},
        ]
        after = await _tool(client, bot, "read_messages", agent="iris", since=1_500)
        assert [m["id"] for m in after["structuredContent"]["messages"]] == ["a1"]

    async def test_an_unknown_agent_is_said_with_the_names(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        published: Any,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _copy(client, box, agents=AGENTS)
        bot = await _bot(save_fixture, user, ["agents"])
        refused = await _tool(client, bot, "send_message", agent="Nora", message="Hi")
        assert refused["isError"] is True
        assert "Iris, Launch team, Theo" in refused["content"][0]["text"]
        empty = await _tool(client, bot, "send_message", agent="iris", message="  ")
        assert empty["isError"] is True
        published.assert_not_awaited()
