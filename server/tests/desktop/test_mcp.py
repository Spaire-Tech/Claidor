"""Simeon as an MCP server (`simeon/desktop/mcp.py`, 10 November 2026): an
agent the person added signs in with the server's OAuth, says hello and gets
a session of its own on the person's Simeon Network, then sees who is on it,
messages one of the person's agents (through the inbox) and reads the answer
from its inbox. Between two people: `test_network.py`."""

from __future__ import annotations

import time
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture
from sqlalchemy import select

from simeon.desktop import mcp, network
from simeon.desktop.chat_repository import DesktopChatInboxRepository
from simeon.models import OAuth2Client, OAuth2Token, User
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.oauth2.conftest import create_oauth2_token

from .test_chats import _copy, _line, _signed_in_with_box

TOKEN = "simeon_at_mcp_test"


@pytest.fixture
def published(mocker: MockerFixture) -> Any:
    return mocker.patch.object(network, "publish", new=mocker.AsyncMock())


async def _bot(
    save_fixture: SaveFixture,
    user: User,
    scopes: list[str],
    *,
    name: str = "Dots",
    token: str = TOKEN,
    redirect_uris: list[str] | None = None,
    returned: str | None = None,
    key: str | None = None,
) -> dict[str, str]:
    """An agent signed in as the person with these scopes, registered
    under `name` (as ChatGPT or Claude Code registers itself), its sign-in
    returned to `returned`."""
    key = key or "".join(c for c in name.lower() if c.isalnum())
    client = OAuth2Client(
        client_id=f"simeon_ci_{key}",
        client_secret=f"simeon_cs_{key}",
        registration_access_token=f"simeon_crt_{key}",
        user=None,
    )
    client.set_client_metadata(
        {
            "client_name": name,
            "redirect_uris": redirect_uris
            or ["https://chatgpt.com/connector_platform_oauth_redirect"],
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": " ".join(scopes),
        }
    )
    await save_fixture(client)
    signed = await create_oauth2_token(
        save_fixture,
        client=client,
        access_token=token,
        refresh_token=f"simeon_rt_{token}",
        scopes=scopes,
        user=user,
    )
    if returned is not None:
        signed.redirect_uri = returned
        await save_fixture(signed)
    return {"Authorization": f"Bearer {token}"}


async def _hello(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    info_name: str,
    path: str = "/mcp",
) -> dict[str, str]:
    """The agent says hello as an MCP client called `info_name`; its
    headers from then on carry the session it was given."""
    response = await client.post(
        path,
        json={
            "jsonrpc": "2.0",
            "id": 0,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "clientInfo": {"name": info_name, "version": "1"},
            },
        },
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return {**headers, "Mcp-Session-Id": response.headers["mcp-session-id"]}


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
    client: httpx.AsyncClient, headers: dict[str, str], tool: str, **arguments: Any
) -> dict[str, Any]:
    answer = await _rpc(client, headers, "tools/call", name=tool, arguments=arguments)
    return answer["result"]


async def _said(
    client: httpx.AsyncClient, headers: dict[str, str], tool: str, **arguments: Any
) -> dict[str, Any]:
    """A tool that worked: what it answered."""
    result = await _tool(client, headers, tool, **arguments)
    assert not result.get("isError"), result
    return result["structuredContent"]


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
    async def test_hello_gives_a_session_and_the_network_tools(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        bot = await _bot(save_fixture, user, ["agents"])
        response = await client.post(
            "/mcp",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2025-06-18"},
            },
            headers=bot,
        )
        hello = response.json()
        assert hello["result"]["protocolVersion"] == "2025-06-18"
        info = hello["result"]["serverInfo"]
        assert (info["name"], info["title"]) == ("Simeon", "Simeon")
        assert [i["src"] for i in info["icons"]] == [
            "https://simeonlabs.com/favicon.svg",
            "https://simeonlabs.com/apple-touch-icon.png",
        ]
        assert "set_status" in hello["result"]["instructions"]
        assert response.headers["mcp-session-id"]
        later = await _rpc(client, bot, "initialize", protocolVersion="2099-01-01")
        assert later["result"]["protocolVersion"] == mcp.PROTOCOL_VERSIONS[0]
        note = await client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            headers=bot,
        )
        assert note.status_code == 202
        tools = (await _rpc(client, bot, "tools/list"))["result"]["tools"]
        # Joining someone else's network waits until people are on (`network.PEOPLE`).
        names = [t["name"] for t in tools]
        assert names[:4] == ["list_team", "send_message", "check_inbox", "set_status"]
        assert "join_network" not in names
        assert "colleague" not in hello["result"]["instructions"]
        refused = await _rpc(
            client, bot, "tools/call", name="join_network", arguments={"link": "x"}
        )
        assert refused["error"]["message"] == "Unknown tool: join_network"
        assert (await _rpc(client, bot, "nope"))["error"]["code"] == -32601

    async def test_the_server_shows_simeons_mark_at_its_own_address(
        self, client: httpx.AsyncClient
    ) -> None:
        for path, kind in (
            ("/favicon.ico", "image/x-icon"),
            ("/favicon.svg", "image/svg+xml"),
            ("/apple-touch-icon.png", "image/png"),
        ):
            response = await client.get(path)
            assert response.status_code == 200, path
            assert response.headers["content-type"].startswith(kind)
            assert len(response.content) > 1000

    async def test_a_session_it_no_longer_knows_is_404(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        bot = await _bot(save_fixture, user, ["agents"])
        gone = await client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            headers={**bot, "Mcp-Session-Id": "8f9e7f53-6d2c-4d9b-9b8e-1d1f1f1f1f1f"},
        )
        assert gone.status_code == 404
        held = await _hello(client, bot, "openai-mcp")
        assert (await _rpc(client, held, "tools/list"))["result"]["tools"]


@pytest.mark.asyncio
class TestTools:
    async def test_a_bot_asks_the_persons_agent_and_reads_the_answer(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        published: Any,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _copy(client, box, agents=AGENTS)
        bot = await _hello(
            client, await _bot(save_fixture, user, ["agents"]), "openai-mcp"
        )

        team = await _said(client, bot, "list_team")
        handle = team["you"].split("/")[0]
        assert team["you"] == f"{handle}/dots"
        assert team["inbox"] == 0
        assert "invite" not in team["network"], "no invite line while people are off"
        listed = {a["address"]: a for a in team["agents"]}
        assert listed[f"{handle}/Iris"]["role"] == "Travel"
        assert listed[f"{handle}/Iris"]["kind"] == "simeon"
        assert listed[f"{handle}/Launch team"]["group"] is True
        assert listed[f"{handle}/dots"]["you"] is True
        assert listed[f"{handle}/dots"]["agent"] == "Dots"

        sent = await _said(
            client, bot, "send_message", to="iris", message=" Book the 9am one "
        )
        (to,) = sent["sent"]
        assert to["to"] == f"{handle}/Iris"
        published.assert_awaited_once()
        assert published.await_args.args[1:] == (user.id, "chat-inbox")
        (waiting,) = await DesktopChatInboxRepository.from_session(session).waiting(
            user.id, 10
        )
        assert waiting.agent_id == "iris"
        assert waiting.message["prompt"] == "Dots: Book the 9am one"
        assert waiting.message["network"]["from"] == f"{handle}/dots"
        # The person's own bot: its words alone, read back from the chat, no caution.
        assert waiting.message["network"]["text"] == "Book the 9am one"
        assert waiting.message["network"]["own"] is True
        assert waiting.message["network"]["answer"] == "chat"
        assert "note" not in waiting.message["network"]

        # Not taken by the computer yet: nothing to read.
        assert (await _said(client, bot, "check_inbox"))["messages"] == []

        now = int(time.time() * 1000)
        await _copy(
            client,
            box,
            lines=[
                {
                    "agentId": "iris",
                    "entry": _line(
                        "u1", "Dots: Book the 9am one", now, clientNonce=waiting.nonce
                    ),
                },
                {
                    "agentId": "iris",
                    "entry": {
                        "kind": "send-message",
                        "id": "a1",
                        "message": {"type": "text", "content": "Booked."},
                        "timestampMs": now + 1_000,
                    },
                },
                {
                    "agentId": "iris",
                    "entry": {
                        "kind": "tool-call",
                        "id": "t1",
                        "timestampMs": now + 1_500,
                    },
                },
            ],
        )
        read = await _said(client, bot, "check_inbox", wait_seconds=1)
        assert [(m["from"], m["text"], m["replyTo"]) for m in read["messages"]] == [
            (f"{handle}/Iris", "Booked.", to["id"])
        ]
        # Each answer is read once.
        assert (await _said(client, bot, "check_inbox"))["messages"] == []

        # Someone else writing in the chat ends the answer.
        await _copy(
            client,
            box,
            lines=[
                {
                    "agentId": "iris",
                    "entry": {
                        "kind": "send-message",
                        "id": "a2",
                        "message": {"type": "text", "content": "Seats 3A and 3B."},
                        "timestampMs": now + 2_000,
                    },
                },
                {"agentId": "iris", "entry": _line("u2", "Thanks!", now + 3_000)},
                {
                    "agentId": "iris",
                    "entry": {
                        "kind": "send-message",
                        "id": "a3",
                        "message": {"type": "text", "content": "Anytime."},
                        "timestampMs": now + 4_000,
                    },
                },
            ],
        )
        later = await _said(client, bot, "check_inbox")
        assert [m["text"] for m in later["messages"]] == ["Seats 3A and 3B."]
        assert (await _said(client, bot, "check_inbox"))["messages"] == []

    async def test_the_answer_is_found_when_the_computers_clock_is_behind(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        published: Any,
    ) -> None:
        """A computer just woken can run minutes behind this server (10
        November 2026: Nora's answer showed above Grok Bot's question and
        never reached its inbox). The computer stamps both, so the answer
        follows the question, and it is found wherever they sit."""
        _, box = await _signed_in_with_box(client, session, user)
        await _copy(client, box, agents=AGENTS)
        bot = await _hello(
            client, await _bot(save_fixture, user, ["agents"]), "openai-mcp"
        )
        await _said(client, bot, "send_message", to="iris", message="Thursday?")
        (waiting,) = await DesktopChatInboxRepository.from_session(session).waiting(
            user.id, 10
        )
        assert "composedAtMs" not in waiting.message, "the computer stamps it"

        behind = int(time.time() * 1000) - 10 * 60_000
        await _copy(
            client,
            box,
            lines=[
                {
                    "agentId": "iris",
                    "entry": _line(
                        "u1", "Dots: Thursday?", behind, clientNonce=waiting.nonce
                    ),
                },
                {
                    "agentId": "iris",
                    "entry": {
                        "kind": "send-message",
                        "id": "a1",
                        "message": {"type": "text", "content": "Thursday works."},
                        "timestampMs": behind + 30_000,
                    },
                },
            ],
        )
        read = await _said(client, bot, "check_inbox")
        assert [m["text"] for m in read["messages"]] == ["Thursday works."]
        # Where the time went: the agent's answer on its own clock, the way there on this server's.
        (answer,) = read["messages"]
        assert answer["answeredAfterSeconds"] == 30
        assert 0 <= answer["reachedAfterSeconds"] <= 5

    async def test_the_first_tools_names_still_answer(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _copy(client, box, agents=AGENTS)
        # A bot that keeps no session id: its client's last session.
        bot = await _bot(save_fixture, user, ["agents"])
        team = await _said(client, bot, "list_agents")
        assert team["you"].endswith("/dots")
        again = await _said(client, bot, "list_team")
        assert again["you"] == team["you"]
        assert (await _said(client, bot, "read_messages"))["messages"] == []

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
        bot = await _hello(
            client, await _bot(save_fixture, user, ["agents"]), "openai-mcp"
        )
        refused = await _tool(client, bot, "send_message", to="Nora", message="Hi")
        assert refused["isError"] is True
        assert "/Iris" in refused["content"][0]["text"]
        empty = await _tool(client, bot, "send_message", to="iris", message="  ")
        assert empty["isError"] is True
        published.assert_not_awaited()

    async def test_set_status_names_the_session(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        bot = await _hello(
            client,
            await _bot(save_fixture, user, ["agents"], name="Claude Code"),
            "claude-code",
        )
        saved = await _said(
            client,
            bot,
            "set_status",
            name="Api Claude",
            machine="studio",
            repo="acme/api",
            branch="main",
            doing="Edit billing webhook",
            busy=True,
        )
        assert saved["you"].endswith("/api-claude")
        (me,) = [
            a for a in (await _said(client, bot, "list_team"))["agents"] if a.get("you")
        ]
        assert me["agent"] == "Claude Code"
        assert (me["repo"], me["branch"], me["status"]) == ("acme/api", "main", "busy")
        assert me["doing"] == "Edit billing webhook"

    async def test_a_session_with_a_name_of_its_own_signs_with_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        published: Any,
    ) -> None:
        """Grok Bot added at `/mcp` signs in as Cursor; it named itself
        `grok-bot` and still wrote "Cursor: …" in the agent's chat (11
        November 2026). A name it chose is how it signs. Since the same day
        its return to Cursor's website says it is Grok Bot from its hello."""
        _, box = await _signed_in_with_box(client, session, user)
        await _copy(client, box, agents=AGENTS)
        bot = await _hello(
            client,
            await _bot(
                save_fixture,
                user,
                ["agents"],
                name="Cursor",
                redirect_uris=CURSORS,
                returned="https://www.cursor.com/agents/mcp/oauth/callback",
            ),
            "Cursor",
        )
        await _said(client, bot, "send_message", to="iris", message="First")
        await _said(client, bot, "set_status", name="grok-bot")
        await _said(client, bot, "send_message", to="iris", message="Second")
        inbox = DesktopChatInboxRepository.from_session(session)
        prompts = [w.message["prompt"] for w in await inbox.waiting(user.id, 10)]
        assert prompts == ["Grok Bot: First", "Grok Bot: Second"]


#: Cursor's one registration, which Grok Bot signs in with too
#: (https://cursor.com/oauth/mcp-client.json, 10 November 2026).
CURSORS = [
    "https://www.cursor.com/agents/mcp/oauth/callback",
    "https://www.cursor.com/bot/mcp/oauth/callback",
    "https://grok.com/connectors-oauth-exchange-code/",
    "http://localhost:8787/callback",
    "http://127.0.0.1:8787/callback",
]


@pytest.mark.asyncio
class TestWhichBot:
    """What an agent is on the network: where its sign-in returned, then
    its hello, then its registration (10 November 2026: Grok Bot, signed in
    with Cursor's registration, showed as `cursor-3` and wrote as "Cursor")."""

    async def test_grok_bot_is_grok_bot_though_it_registers_as_cursor(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        hosted = await _bot(
            save_fixture,
            user,
            ["agents"],
            name="Cursor",
            token="simeon_at_hosted",
            redirect_uris=CURSORS,
            returned="https://grok.com/connectors-oauth-exchange-code/",
        )
        team = await _said(client, await _hello(client, hosted, "Cursor"), "list_team")
        handle = team["you"].split("/")[0]
        assert team["you"] == f"{handle}/grok-bot"
        me = {a["address"]: a for a in team["agents"]}[team["you"]]
        assert me["agent"] == "Grok Bot"

        # The same registration on the person's computer is Cursor.
        cursor = await _bot(
            save_fixture,
            user,
            ["agents"],
            name="Cursor",
            key="desk",
            token="simeon_at_cursor",
            redirect_uris=CURSORS,
            returned="http://localhost:8787/callback",
        )
        mine = await _said(
            client, await _hello(client, cursor, "cursor-vscode"), "list_team"
        )
        assert mine["you"] == f"{handle}/cursor"

    async def test_every_conversation_of_a_bot_is_one_agent(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        hosted = await _bot(
            save_fixture,
            user,
            ["agents"],
            name="Cursor",
            token="simeon_at_hosted",
            redirect_uris=CURSORS,
            returned="https://www.cursor.com/bot/mcp/oauth/callback",
        )
        first = await _hello(client, hosted, "Cursor")
        second = await _hello(client, hosted, "Cursor")
        assert first["Mcp-Session-Id"] == second["Mcp-Session-Id"]
        team = await _said(client, second, "list_team")
        assert [a["address"] for a in team["agents"] if a.get("you")] == [team["you"]]
        assert sum(1 for a in team["agents"] if a["kind"] == "grok-bot") == 1

    async def test_a_bot_that_registers_again_is_the_same_bot(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        """A conversation of Grok Bot's that registers a client of its own is
        the same Grok Bot (11 November 2026: a second idle `bass/cursor`)."""
        sessions = []
        for key in ("one", "two"):
            headers = await _bot(
                save_fixture,
                user,
                ["agents"],
                name="Cursor",
                token=f"simeon_at_{key}",
                redirect_uris=CURSORS,
                key=f"hosted{key}",
            )
            sessions.append(await _hello(client, headers, "Cursor", "/mcp/grok-bot"))
        assert sessions[0]["Mcp-Session-Id"] == sessions[1]["Mcp-Session-Id"]
        team = await _said(client, sessions[1], "list_team")
        assert sum(1 for a in team["agents"] if a["kind"] == "grok-bot") == 1

    async def test_a_bot_named_before_it_was_known_takes_its_name(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        # Signed in before the server kept where sign-ins return: "cursor".
        headers = await _bot(
            save_fixture,
            user,
            ["agents"],
            name="Cursor",
            token="simeon_at_hosted",
            redirect_uris=CURSORS,
        )
        before = await _said(
            client, await _hello(client, headers, "Cursor"), "list_team"
        )
        assert before["you"].endswith("/cursor")
        # Signed in again: Grok Bot, in the same session, renamed.
        token = (
            (
                await session.execute(
                    select(OAuth2Token).where(
                        OAuth2Token.client_id == "simeon_ci_cursor"
                    )
                )
            )
            .unique()
            .scalar_one()
        )
        token.redirect_uri = "https://grok.com/connectors-oauth-exchange-code/"
        await save_fixture(token)
        after_hello = await _hello(client, headers, "Cursor")
        after = await _said(client, after_hello, "list_team")
        assert after["you"] == before["you"].replace("/cursor", "/grok-bot")
        assert not any(a["address"] == before["you"] for a in after["agents"])

    async def test_a_bot_at_its_own_address_is_that_bot(
        self, client: httpx.AsyncClient, save_fixture: SaveFixture, user: User
    ) -> None:
        """Grok Bot returns to Cursor's own page, as Cursor's cloud agents do
        (10 November 2026, `bass/cursor`): the address its Bots sheet gives,
        `/mcp/grok-bot`, says what it is."""
        headers = await _bot(
            save_fixture,
            user,
            ["agents"],
            name="Cursor",
            token="simeon_at_hosted",
            redirect_uris=CURSORS,
            returned="https://www.cursor.com/agents/mcp/oauth/callback",
        )
        team = await _said(
            client,
            await _hello(client, headers, "Cursor", "/mcp/grok-bot"),
            "list_team",
        )
        assert team["you"].endswith("/grok-bot")
        # Without a session id it is still the bot its address names.
        response = await client.post(
            "/mcp/grok-bot",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "list_team", "arguments": {}},
            },
            headers=headers,
        )
        assert response.json()["result"]["structuredContent"]["you"] == team["you"]

    async def test_each_bots_address_is_found_and_signs_in(
        self, client: httpx.AsyncClient
    ) -> None:
        resource = (
            await client.get("/.well-known/oauth-protected-resource/mcp/grok-bot")
        ).json()
        assert resource["resource"].endswith("/mcp/grok-bot")
        response = await client.post(
            "/mcp/grok-bot", json={"jsonrpc": "2.0", "id": 1, "method": "initialize"}
        )
        assert response.status_code == 401
        assert (
            "/.well-known/oauth-protected-resource/mcp/grok-bot"
            in response.headers["www-authenticate"]
        )
        assert (await client.post("/mcp/nobody", json={})).status_code == 404
        assert (
            await client.get("/.well-known/oauth-protected-resource/mcp/nobody")
        ).status_code == 404
