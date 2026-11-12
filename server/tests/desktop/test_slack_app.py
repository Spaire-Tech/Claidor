"""An agent in Slack through Simeon's own Slack app
(`simeon/desktop/slack_app.py`, 12 November 2026): an app's Connect Slack
link, Slack's sign-in naming the agent, a direct message or a mention
reaching the agent's inbox, the answer posted under the agent's name, and
Disconnect. Slack itself is a stand-in (`httpx.MockTransport`): nothing here
reaches slack.com.
"""

from __future__ import annotations

import base64
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop import slack_app
from simeon.models import DesktopChatAgent, SandListenerConnection, User
from simeon.postgres import AsyncSession
from simeon.sand import listeners_connections
from simeon.sand.listeners_repository import SandListenerConnectionRepository
from simeon.sand.listeners_slack import SlackWebClient
from tests.fixtures.database import SaveFixture
from tests.sand.test_listeners import SLACK_SECRET, _slack_signed

from .test_chats import _signed_in_with_box

LINK = "/desktop/api/channels/slack/link"
SEND = "/desktop/api/channels/slack/send"
DISCONNECT = "/desktop/api/channels/slack/disconnect"
SYNC = "/desktop/api/channels/sync"
INBOX = "/desktop/api/chats/inbox"
EVENTS = "/sand/ingress/slack/events"


class FakeSlack:
    """Slack's Web API as far as these calls go, every call written down."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.uploaded: list[bytes] = []
        self.fail: dict[str, str] = {}

    def handle(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == "files.example":
            self.uploaded.append(request.content)
            return httpx.Response(200, text="OK")
        method = request.url.path.rsplit("/", 1)[-1]
        form = {
            key: values[0] for key, values in parse_qs(request.content.decode()).items()
        }
        self.calls.append((method, form))
        if method in self.fail:
            return httpx.Response(200, json={"ok": False, "error": self.fail[method]})
        if method == "oauth.v2.access":
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "access_token": "xoxb-workspace",
                    "bot_user_id": "U_BOT",
                    "team": {"id": "T123", "name": "Simeon Labs"},
                    "authed_user": {"id": "U_OWNER"},
                },
            )
        if method == "conversations.list":
            return httpx.Response(200, json={"ok": True, "channels": []})
        if method == "users.info":
            return httpx.Response(
                200,
                json={"ok": True, "user": {"profile": {"display_name": "Alice"}}},
            )
        if method == "files.getUploadURLExternal":
            return httpx.Response(
                200,
                json={
                    "ok": True,
                    "upload_url": "https://files.example/upload",
                    "file_id": "F1",
                },
            )
        return httpx.Response(200, json={"ok": True})

    def methods(self) -> list[str]:
        return [method for method, _ in self.calls]


@pytest.fixture
def slack(mocker: MockerFixture) -> FakeSlack:
    fake = FakeSlack()
    client = SlackWebClient(
        http=httpx.AsyncClient(transport=httpx.MockTransport(fake.handle))
    )
    mocker.patch.object(slack_app, "slack_client", client)
    mocker.patch.object(listeners_connections, "slack_client", client)
    mocker.patch.object(settings, "SLACK_CLIENT_ID", "client-id")
    mocker.patch.object(settings, "SLACK_CLIENT_SECRET", "client-secret")
    mocker.patch.object(settings, "SLACK_SIGNING_SECRET", SLACK_SECRET)
    return fake


@pytest.fixture
def published(mocker: MockerFixture) -> Any:
    mocker.patch("simeon.sand.listeners_connections.publish", new=mocker.AsyncMock())
    mocker.patch("simeon.sand.listeners_service.publish", new=mocker.AsyncMock())
    return mocker.patch.object(slack_app, "publish", new=mocker.AsyncMock())


async def _agents(save_fixture: SaveFixture, user: User, **names: str) -> None:
    for agent_id, name in names.items():
        await save_fixture(
            DesktopChatAgent(
                user_id=user.id, agent_id=agent_id, row={"id": agent_id, "name": name}
            )
        )


async def _workspace(
    save_fixture: SaveFixture, user: User, agents: list[str]
) -> SandListenerConnection:
    row = SandListenerConnection(
        user_id=user.id,
        platform="slack",
        external_id="T123",
        external_name="Simeon Labs",
        external_user_id="U_OWNER",
        access_token="xoxb-workspace",
        extra={
            "bot_user_id": "U_BOT",
            "channels": [],
            "channels_refreshed_at": None,
            "agents": agents,
        },
    )
    await save_fixture(row)
    return row


async def _connect(
    client: httpx.AsyncClient, app: dict[str, str], agent_id: str
) -> httpx.Response:
    """Connect Slack from an agent's Channels tab, through Slack's sign-in."""
    link = await client.post(LINK, json={"agentId": agent_id}, headers=app)
    assert link.status_code == 200, link.text
    url = urlparse(link.json()["data"]["url"])
    assert url.path == "/sand/slack/install"
    opened = await client.get(f"{url.path}?{url.query}", follow_redirects=False)
    assert opened.status_code == 303, opened.text
    slack_page = urlparse(opened.headers["location"])
    assert slack_page.netloc == "slack.com"
    asked = parse_qs(slack_page.query)
    assert "im:history" in asked["scope"][0].split(",")
    assert "chat:write.customize" in asked["scope"][0].split(",")
    return await client.get(
        "/sand/slack/callback", params={"code": "c", "state": asked["state"][0]}
    )


async def _row(session: AsyncSession) -> SandListenerConnection:
    """The workspace's row as the server last wrote it."""
    session.expunge_all()
    row = await SandListenerConnectionRepository.from_session(session).get_by_external(
        "slack", "T123"
    )
    assert row is not None
    return row


def _event(**event: Any) -> dict[str, Any]:
    return {"type": "event_callback", "team_id": "T123", "event": event}


async def _deliver(client: httpx.AsyncClient, body: dict[str, Any]) -> None:
    raw, headers = _slack_signed(body)
    answer = await client.post(EVENTS, content=raw, headers=headers)
    assert answer.status_code == 200, answer.text


async def _waiting(
    client: httpx.AsyncClient, box: dict[str, str]
) -> list[dict[str, Any]]:
    return (await client.get(INBOX, headers=box)).json()["data"]["messages"]


@pytest.mark.asyncio
class TestConnect:
    async def test_an_agent_connects_through_slack_s_sign_in_and_another_joins_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        slack: FakeSlack,
        published: Any,
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)
        page = await _connect(client, app, "nora")
        assert page.status_code == 200, page.text
        assert "Slack is connected to Simeon" in page.text
        assert slack.methods()[0] == "oauth.v2.access"
        row = await _row(session)
        assert row.user_id == user.id
        assert row.extra["agents"] == ["nora"]

        assert (await _connect(client, app, "theo")).status_code == 200
        assert (await _row(session)).extra["agents"] == ["nora", "theo"]

        sync = await client.post(SYNC, json={"channels": []}, headers=box)
        assert sync.json()["data"]["hosted"] == [
            {"agentId": "nora", "platform": "slack", "label": "Simeon Labs"},
            {"agentId": "theo", "platform": "slack", "label": "Simeon Labs"},
        ]

    async def test_a_link_is_used_once_and_refused_when_the_app_is_not_registered(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        slack: FakeSlack,
        mocker: MockerFixture,
    ) -> None:
        app, _ = await _signed_in_with_box(client, session, user)
        link = (await client.post(LINK, json={"agentId": "nora"}, headers=app)).json()
        url = urlparse(link["data"]["url"])
        assert (
            await client.get(f"{url.path}?{url.query}", follow_redirects=False)
        ).status_code == 303
        again = await client.get(f"{url.path}?{url.query}", follow_redirects=False)
        assert again.status_code == 400
        assert "This link expired" in again.text

        mocker.patch.object(settings, "SLACK_CLIENT_ID", "")
        refused = await client.post(LINK, json={"agentId": "nora"}, headers=app)
        assert refused.status_code == 503
        assert refused.json() == {"code": 1, "message": "Slack isn't available yet."}

    async def test_disconnect_takes_the_agent_out_and_the_workspace_stays(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        slack: FakeSlack,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        row = await _workspace(save_fixture, user, ["nora", "theo"])
        answer = await client.post(DISCONNECT, json={"agentId": "nora"}, headers=box)
        assert answer.json() == {"code": 0, "data": {"removed": 1}}
        row = await _row(session)
        assert row.extra["agents"] == ["theo"]
        assert row.access_token == "xoxb-workspace"
        sync = await client.post(SYNC, json={"channels": []}, headers=box)
        assert [one["agentId"] for one in sync.json()["data"]["hosted"]] == ["theo"]


@pytest.mark.asyncio
class TestHeard:
    async def test_a_direct_message_reaches_the_first_agent_s_inbox(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        slack: FakeSlack,
        published: Any,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _agents(save_fixture, user, nora="Nora", theo="Theo")
        await _workspace(save_fixture, user, ["nora", "theo"])
        body = _event(
            type="message",
            channel_type="im",
            channel="D1",
            user="U_ALICE",
            text="Can you book &amp; pay?",
            ts="1750000000.000100",
        )
        await _deliver(client, body)
        # Slack's retry of the same message is kept once.
        await _deliver(client, body)
        (waiting,) = await _waiting(client, box)
        assert waiting["agentId"] == "nora"
        assert waiting["kind"] == "channel"
        assert waiting["message"] == {
            "address": {"platform": "slack", "chat": "D1"},
            "sender": "Alice",
            "text": "Can you book & pay?",
            "timestampMs": 1_750_000_000_000,
            "messageId": "D1:1750000000.000100",
            "app": True,
        }
        assert published.await_args.args[1:] == (user.id, "chat-inbox")

    async def test_a_mention_names_its_agent_answers_in_its_thread_and_the_thread_stays_with_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        slack: FakeSlack,
        published: Any,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _agents(save_fixture, user, nora="Nora", theo="Theo")
        await _workspace(save_fixture, user, ["nora", "theo"])
        await _deliver(
            client,
            _event(
                type="app_mention",
                channel="C_ENG",
                user="U_ALICE",
                text="<@U_BOT> Theo, what's left on the launch?",
                ts="1.0",
            ),
        )
        # The follow-up in that thread names nobody: it stays with Theo.
        await _deliver(
            client,
            _event(
                type="app_mention",
                channel="C_ENG",
                user="U_ALICE",
                text="<@U_BOT> and the deck?",
                ts="2.0",
                thread_ts="1.0",
            ),
        )
        first, second = await _waiting(client, box)
        assert first["agentId"] == "theo"
        assert first["message"]["text"] == "Theo, what's left on the launch?"
        assert first["message"]["thread"] == "1.0"
        assert second["agentId"] == "theo"
        assert second["message"]["text"] == "and the deck?"
        assert second["message"]["thread"] == "1.0"

    async def test_the_app_s_own_messages_bots_and_a_workspace_without_agents_are_left_alone(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        slack: FakeSlack,
        published: Any,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        row = await _workspace(save_fixture, user, ["nora"])
        await _deliver(
            client,
            _event(
                type="message",
                channel_type="im",
                channel="D1",
                user="U_BOT",
                text="hi",
                ts="1.0",
            ),
        )
        await _deliver(
            client,
            _event(
                type="message",
                channel_type="im",
                channel="D1",
                bot_id="B1",
                user="U_X",
                text="hi",
                ts="2.0",
            ),
        )
        # A message in a channel that does not mention the app is a routine's, not the agent's.
        await _deliver(
            client,
            _event(
                type="message",
                channel_type="channel",
                channel="C_ENG",
                user="U_ALICE",
                text="hi",
                ts="3.0",
            ),
        )
        assert await _waiting(client, box) == []
        await SandListenerConnectionRepository.from_session(session).update(
            row, update_dict={"extra": {**row.extra, "agents": []}}
        )
        await session.commit()
        await _deliver(
            client,
            _event(
                type="message",
                channel_type="im",
                channel="D1",
                user="U_ALICE",
                text="hi",
                ts="4.0",
            ),
        )
        assert await _waiting(client, box) == []


@pytest.mark.asyncio
class TestSend:
    async def test_an_answer_goes_under_the_agent_s_name_in_its_thread(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        slack: FakeSlack,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _agents(save_fixture, user, nora="Nora")
        await _workspace(save_fixture, user, ["nora"])
        sent = await client.post(
            SEND,
            json={
                "agentId": "nora",
                "chat": "C_ENG",
                "thread": "1.0",
                "text": "On it.",
            },
            headers=box,
        )
        assert sent.json() == {"code": 0, "data": {"ok": True}}
        assert slack.calls[-1] == (
            "chat.postMessage",
            {
                "channel": "C_ENG",
                "text": "On it.",
                "thread_ts": "1.0",
                "username": "Nora",
            },
        )

    async def test_a_file_is_uploaded_and_shared_in_the_thread(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        slack: FakeSlack,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _workspace(save_fixture, user, ["nora"])
        sent = await client.post(
            SEND,
            json={
                "agentId": "nora",
                "chat": "D1",
                "file": {
                    "name": "plan.pdf",
                    "data": base64.b64encode(b"%PDF").decode(),
                },
                "caption": "The plan",
            },
            headers=box,
        )
        assert sent.json()["code"] == 0, sent.text
        assert slack.methods()[-2:] == [
            "files.getUploadURLExternal",
            "files.completeUploadExternal",
        ]
        assert slack.uploaded == [b"%PDF"]
        assert slack.calls[-1][1]["channel_id"] == "D1"
        assert slack.calls[-1][1]["initial_comment"] == "The plan"

    async def test_no_workspace_and_slack_s_refusal_are_said(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        slack: FakeSlack,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        missing = await client.post(
            SEND, json={"agentId": "nora", "chat": "D1", "text": "hi"}, headers=box
        )
        assert missing.status_code == 404
        assert missing.json()["message"] == "Slack isn't connected for this agent."
        await _workspace(save_fixture, user, ["nora"])
        slack.fail["chat.postMessage"] = "token_revoked"
        refused = await client.post(
            SEND, json={"agentId": "nora", "chat": "D1", "text": "hi"}, headers=box
        )
        assert refused.status_code == 502
        assert refused.json()["message"] == "Slack answered: token_revoked."
