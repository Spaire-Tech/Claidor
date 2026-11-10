"""Settings › External Agents (`simeon/desktop/external_agents.py`, 11
November 2026): the bots a person let in, one row per kind of bot with when
it was last used, and Disconnect, after which the bot can't call again."""

from __future__ import annotations

import httpx
import pytest

from simeon.desktop.service import desktop
from simeon.models import User
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture

from .test_mcp import CURSORS, _bot, _hello, _rpc, _said

LIST = "/desktop/api/external-agents"
DISCONNECT = "/desktop/api/external-agents/disconnect"


async def _app(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    code = await desktop.create_auth_code(session, user)
    await session.commit()
    response = await client.post(
        "/desktop/api/auth/exchange", json={"authCode": code, "firstKeyfrom": "x"}
    )
    return {"Authorization": f"Bearer {response.json()['data']['accessToken']}"}


async def _listed(client: httpx.AsyncClient, app: dict[str, str]) -> list[dict]:
    response = await client.get(LIST, headers=app)
    assert response.status_code == 200, response.text
    return response.json()["data"]["agents"]


@pytest.mark.asyncio
class TestExternalAgents:
    async def test_connected_bots_are_listed_with_their_last_use(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        app = await _app(client, session, user)
        assert await _listed(client, app) == []

        hosted = await _bot(
            save_fixture,
            user,
            ["agents"],
            name="Cursor",
            token="simeon_at_hosted",
            redirect_uris=CURSORS,
        )
        await _said(
            client, await _hello(client, hosted, "Cursor", "/mcp/grok-bot"), "list_team"
        )
        # A second conversation that registered a client of its own: still one Grok Bot.
        again = await _bot(
            save_fixture,
            user,
            ["agents"],
            name="Cursor",
            token="simeon_at_again",
            redirect_uris=CURSORS,
            key="hostedagain",
        )
        await _hello(client, again, "Cursor", "/mcp/grok-bot")
        # A token for something else of the account isn't an external agent.
        await _bot(
            save_fixture, user, ["openid"], name="Other", token="simeon_at_other"
        )

        listed = await _listed(client, app)
        (bot,) = listed
        assert (bot["id"], bot["kind"], bot["name"]) == (
            "grok-bot",
            "grok-bot",
            "Grok Bot",
        )
        assert bot["lastUsedAt"] >= bot["connectedAt"] > 0

    async def test_disconnect_lets_the_bot_out(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
    ) -> None:
        app = await _app(client, session, user)
        dots = await _hello(
            client,
            await _bot(save_fixture, user, ["agents"], name="Dots"),
            "openai-mcp",
        )
        claude_code = await _hello(
            client,
            await _bot(
                save_fixture, user, ["agents"], name="Claude Code", token="simeon_at_cc"
            ),
            "claude-code",
        )
        assert [a["id"] for a in await _listed(client, app)] == ["claude-code", "dots"]

        refused = await client.post(DISCONNECT, json={"id": "muse"}, headers=app)
        assert refused.status_code == 404

        response = await client.post(DISCONNECT, json={"id": "dots"}, headers=app)
        assert response.status_code == 200, response.text
        assert [a["id"] for a in response.json()["data"]["agents"]] == ["claude-code"]
        # Its token no longer opens the door; the other bot's still does.
        locked = await client.post(
            "/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            headers={"Authorization": dots["Authorization"]},
        )
        assert locked.status_code == 401
        assert "result" in await _rpc(client, claude_code, "tools/list")
        # Its session is off the network.
        team = await _said(client, claude_code, "list_team", all=True)
        assert not any(a["kind"] == "dots" for a in team["agents"])

    async def test_only_the_persons_own_bots(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
    ) -> None:
        await _hello(
            client, await _bot(save_fixture, user_second, ["agents"], name="Dots"), "x"
        )
        app = await _app(client, session, user)
        assert await _listed(client, app) == []
        refused = await client.post(DISCONNECT, json={"id": "dots"}, headers=app)
        assert refused.status_code == 404
