"""An agent's own Discord or Slack bot, listened to from the server
(`simeon/desktop/channel_bots.py`, 26 October 2026): the computer hands its
bots' tokens, sealed here; the runner takes them and reports each bot's state
and what it heard, which waits in the inbox for the computer."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop import channel_bots, chats
from simeon.desktop.channel_repository import DesktopChannelBotRepository
from simeon.kit.utils import utc_now
from simeon.models import User
from simeon.postgres import AsyncSession

from .test_chats import _signed_in_with_box

SYNC = "/desktop/api/channels/sync"
HOLD = "/maty/runner/channels"
REPORT = "/maty/runner/channels/report"
INBOX = "/desktop/api/chats/inbox"
RUNNER_TOKEN = "a-service-secret-that-belongs-to-no-person"
RUNNER = {"Authorization": f"Bearer {RUNNER_TOKEN}"}
DISCORD_TOKEN = "discord-bot-token-for-theo"


@pytest.fixture(autouse=True)
def runner(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "MATY_RUNNER_TOKEN", RUNNER_TOKEN)
    mocker.patch.object(settings, "CHANNELS_ON_SERVER", True)


@pytest.fixture
def published(mocker: MockerFixture) -> Any:
    return mocker.patch.object(channel_bots, "publish", new=mocker.AsyncMock())


def _bot(
    fingerprint: str, secrets: dict[str, str] | None, **more: Any
) -> dict[str, Any]:
    bot: dict[str, Any] = {
        "agentId": "theo",
        "platform": "discord",
        "fingerprint": fingerprint,
        **more,
    }
    if secrets is not None:
        bot["secrets"] = secrets
    return bot


async def _sync(
    client: httpx.AsyncClient, box: dict[str, str], *bots: dict[str, Any]
) -> dict[str, Any]:
    response = await client.post(SYNC, json={"channels": list(bots)}, headers=box)
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def _hold(
    client: httpx.AsyncClient, have: list[dict[str, str]] | None = None
) -> list[dict[str, Any]]:
    response = await client.post(HOLD, json={"have": have or []}, headers=RUNNER)
    assert response.status_code == 200, response.text
    return response.json()["bots"]


def _heard(bot_id: str, message_id: str, text: str, **more: Any) -> dict[str, Any]:
    return {
        "id": bot_id,
        "messageId": message_id,
        "envelope": {
            "address": {"platform": "discord", "chat": "c1"},
            "sender": "Iris",
            "text": text,
            "timestampMs": 1_750_000_000_000,
            **more,
        },
    }


@pytest.mark.asyncio
class TestChannelBots:
    async def test_the_computer_hands_its_bots_sealed_and_the_runner_takes_them(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        answer = await _sync(client, box, _bot("f1", {"token": DISCORD_TOKEN}))
        assert answer == {
            "held": True,
            "channels": [
                {
                    "agentId": "theo",
                    "platform": "discord",
                    "missing": False,
                    "status": None,
                    "detail": None,
                    "fresh": False,
                }
            ],
        }
        (row,) = await DesktopChannelBotRepository.from_session(session).list_by_user(
            user.id
        )
        assert DISCORD_TOKEN not in row.secrets, "kept sealed, never as itself"

        (bot,) = await _hold(client)
        assert bot == {
            "id": str(row.id),
            "platform": "discord",
            "fingerprint": "f1",
            "secrets": {"token": DISCORD_TOKEN},
        }
        # Held as it is now: no token on the wire again.
        (again,) = await _hold(client, [{"id": str(row.id), "fingerprint": "f1"}])
        assert "secrets" not in again

    async def test_what_a_bot_hears_waits_for_the_computer_once_and_wakes_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        published: Any,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _sync(client, box, _bot("f1", {"token": DISCORD_TOKEN}))
        (bot,) = await _hold(client)
        report = {
            "statuses": [
                {
                    "id": bot["id"],
                    "status": "connected",
                    "detail": {"key": "channel.connectedAs", "args": {"name": "Theo"}},
                }
            ],
            "inbound": [_heard(bot["id"], "m1", "Hi Theo", thread="t1")],
        }
        assert (
            await client.post(REPORT, json=report, headers=RUNNER)
        ).status_code == 200
        published.assert_awaited_once()
        assert published.await_args.args[1:] == (user.id, "chat-inbox")
        # Heard twice (a reconnect), it waits once.
        assert (
            await client.post(
                REPORT,
                json={"inbound": [_heard(bot["id"], "m1", "Hi Theo")]},
                headers=RUNNER,
            )
        ).status_code == 200

        (waiting,) = (await client.get(INBOX, headers=box)).json()["data"]["messages"]
        assert waiting["agentId"] == "theo"
        assert waiting["kind"] == "channel"
        assert waiting["message"] == {
            "address": {"platform": "discord", "chat": "c1"},
            "sender": "Iris",
            "text": "Hi Theo",
            "timestampMs": 1_750_000_000_000,
            "thread": "t1",
            "messageId": "m1",
        }
        # The computer reads the runner's word on the bot.
        answer = await _sync(client, box, _bot("f1", None))
        assert answer["channels"][0] | {} == {
            "agentId": "theo",
            "platform": "discord",
            "missing": False,
            "status": "connected",
            "detail": {"key": "channel.connectedAs", "args": {"name": "Theo"}},
            "fresh": True,
        }
        # A word older than three minutes is not trusted: the computer listens itself.
        (row,) = await DesktopChannelBotRepository.from_session(session).list_by_user(
            user.id
        )
        row.status_at = utc_now() - timedelta(minutes=4)
        await session.flush()
        assert (await _sync(client, box, _bot("f1", None)))["channels"][0][
            "fresh"
        ] is False

    async def test_what_is_not_a_message_or_too_many_is_not_kept(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        published: Any,
        mocker: MockerFixture,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _sync(client, box, _bot("f1", {"token": DISCORD_TOKEN}))
        (bot,) = await _hold(client)
        slack = _heard(bot["id"], "s1", "Wrong platform")
        slack["envelope"]["address"]["platform"] = "slack"
        nameless = _heard(bot["id"], "n1", "No sender")
        del nameless["envelope"]["sender"]
        mocker.patch.object(channel_bots, "WAITING_MAX", 1)
        report = {
            "inbound": [
                slack,
                nameless,
                _heard(bot["id"], "a", "One\x00"),
                _heard(bot["id"], "b", "Two"),
            ]
        }
        assert (
            await client.post(REPORT, json=report, headers=RUNNER)
        ).status_code == 200
        waiting = (await client.get(INBOX, headers=box)).json()["data"]["messages"]
        assert [message["message"]["text"] for message in waiting] == ["One"], (
            "no NUL, and a flood is not kept"
        )
        assert chats.WAITING_MAX == 200

    async def test_new_tokens_replace_the_old_and_a_bot_gone_is_let_go(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        published: Any,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _sync(client, box, _bot("f1", {"token": DISCORD_TOKEN}))
        (bot,) = await _hold(client)
        await client.post(
            REPORT,
            json={"statuses": [{"id": bot["id"], "status": "connected"}]},
            headers=RUNNER,
        )
        # New tokens: the old state goes with them.
        answer = await _sync(client, box, _bot("f2", {"token": "a-new-token"}))
        assert answer["channels"][0]["status"] is None
        (bot,) = await _hold(client, [{"id": bot["id"], "fingerprint": "f1"}])
        assert bot["secrets"] == {"token": "a-new-token"}
        # Changed, but sent without its tokens: the server says it lacks them.
        assert (await _sync(client, box, _bot("f3", None)))["channels"][0][
            "missing"
        ] is True
        # No longer listed: let go.
        assert (await _sync(client, box))["channels"] == []
        assert await _hold(client) == []

    async def test_switched_off_no_token_is_kept(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _sync(client, box, _bot("f1", {"token": DISCORD_TOKEN}))
        mocker.patch.object(settings, "CHANNELS_ON_SERVER", False)
        assert await _sync(client, box, _bot("f1", {"token": DISCORD_TOKEN})) == {
            "held": False,
            "channels": [],
        }
        assert (
            await DesktopChannelBotRepository.from_session(session).list_by_user(
                user.id
            )
            == []
        )
        assert await _hold(client) == []

    async def test_the_runners_routes_need_the_runners_token(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)
        assert (await client.post(HOLD, json={"have": []})).status_code == 401
        assert (
            await client.post(HOLD, json={"have": []}, headers=app)
        ).status_code == 401
        assert (
            await client.post(HOLD, json={"have": []}, headers=box)
        ).status_code == 401
        assert (
            await client.post(
                REPORT, json={}, headers={"Authorization": "Bearer wrong"}
            )
        ).status_code == 401
        assert (await client.post(SYNC, json={"channels": []})).status_code == 401
