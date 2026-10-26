"""The copy of the agents and their chats (`simeon/desktop/chats.py`, 26
October 2026): the computer sends them, the apps read them while it is
away; each person's own, the newest lines only, nothing of the moment."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.desktop import chats
from simeon.desktop.chat_repository import DesktopChatInboxRepository
from simeon.kit.utils import utc_now
from simeon.models import User
from simeon.postgres import AsyncSession

from .test_box_credential import _box_credential
from .test_endpoints import _signed_in

COPY = "/desktop/api/chats/copy"
STATE = "/desktop/api/chats/state"
AGENTS = "/desktop/api/chats/agents"
LINES = "/desktop/api/chats/lines"


async def _signed_in_with_box(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> tuple[dict[str, str], dict[str, str]]:
    """The app's headers, and the person's computer's (its own credential
    traded for an access token, as the computer does)."""
    access, _ = await _signed_in(client, session, user)
    credential = (await _box_credential(client, access))["credential"]
    traded = await client.post(
        "/sand-box/inference-credential", json={"credential": credential}
    )
    assert traded.status_code == 200, traded.text
    return (
        {"Authorization": f"Bearer {access}"},
        {"Authorization": f"Bearer {traded.json()['accessToken']}"},
    )


def _line(entry_id: str, content: str, at: int | None, **more: Any) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "kind": "message",
        "id": entry_id,
        "role": "user",
        "content": content,
    }
    if at is not None:
        entry["timestampMs"] = at
    return {**entry, **more}


async def _copy(
    client: httpx.AsyncClient, headers: dict[str, str], **body: Any
) -> dict[str, int]:
    response = await client.post(COPY, json=body, headers=headers)
    assert response.status_code == 200, response.text
    answer = response.json()
    assert answer["code"] == 0, answer
    return answer["data"]


async def _lines(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    agent_id: str,
    limit: int | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"agentId": agent_id}
    if limit is not None:
        params["limit"] = limit
    response = await client.get(LINES, params=params, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.mark.asyncio
class TestChatCopy:
    async def test_the_computer_copies_and_the_app_reads_without_the_moment(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)
        theo = {
            "id": "theo",
            "name": "Theo",
            "avatarDataUrl": "data:image/png;base64,AAAA",
            "avatarShape": "clay-07",
            "isRunning": True,
            "isRunningTurn": True,
            "isComposingMessage": True,
            "currentActivity": {"label": "Searching"},
            "lastMessageId": "a1",
            "hasUnread": True,
        }
        counts = await _copy(
            client,
            box,
            agents=[theo],
            lines=[
                {"agentId": "theo", "entry": _line("u1", "Book it", 1_000)},
                {
                    "agentId": "theo",
                    "entry": _line(
                        "a1", "On it\x00", 2_000, role="assistant", isStreaming=True
                    ),
                },
            ],
        )
        assert counts["agents"] == 1
        assert counts["lines"] == 2

        listed = (await client.get(AGENTS, headers=app)).json()["data"]["agents"]
        assert listed == [
            {
                "id": "theo",
                "name": "Theo",
                "avatarDataUrl": None,
                "avatarShape": "clay-07",
                "lastMessageId": "a1",
                "hasUnread": True,
            }
        ]
        read = await _lines(client, app, "theo")
        assert [entry["id"] for entry in read["entries"]] == ["u1", "a1"]
        assert read["entries"][1]["content"] == "On it"
        assert "isStreaming" not in read["entries"][1]
        assert read["hasOlder"] is False

    async def test_a_line_sent_again_takes_its_own_place(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        app = (await _signed_in_with_box(client, session, user))[0]
        await _copy(
            client,
            box,
            lines=[
                {
                    "agentId": "theo",
                    "entry": _line("n1", "A notice", None, kind="notice"),
                },
                {"agentId": "theo", "entry": _line("u1", "First", 1_000)},
            ],
        )
        # The notice has no time of its own: it keeps the one it first came with.
        await _copy(
            client,
            box,
            lines=[
                {"agentId": "theo", "entry": _line("u1", "First, edited", 1_000)},
                {
                    "agentId": "theo",
                    "entry": _line("n1", "The notice again", None, kind="notice"),
                },
                {"agentId": "theo", "entry": _line("u2", "Later", 99_999_999_999_999)},
            ],
        )
        read = await _lines(client, app, "theo")
        assert [entry["id"] for entry in read["entries"]] == ["u1", "n1", "u2"]
        assert read["entries"][0]["content"] == "First, edited"
        assert read["entries"][1]["content"] == "The notice again"

    async def test_lines_taken_out_chats_emptied_and_agents_gone_leave_the_copy(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)
        await _copy(
            client,
            box,
            agents=[
                {"id": "theo", "name": "Theo"},
                {"id": "iris", "name": "Iris"},
                {"id": "noa"},
            ],
            lines=[
                {"agentId": "theo", "entry": _line("u1", "One", 1_000)},
                {"agentId": "theo", "entry": _line("u2", "Two", 2_000)},
                {"agentId": "iris", "entry": _line("i1", "Hi", 1_000)},
                {"agentId": "noa", "entry": _line("n1", "Hey", 1_000)},
            ],
        )
        counts = await _copy(
            client,
            box,
            agents=[{"id": "theo", "name": "Theo"}, {"id": "noa"}],
            removed=[{"agentId": "theo", "id": "u1"}],
            cleared=["noa"],
            lines=[{"agentId": "noa", "entry": _line("n2", "After the clear", 3_000)}],
        )
        assert counts["gone"] == 1
        names = [
            row["id"]
            for row in (await client.get(AGENTS, headers=app)).json()["data"]["agents"]
        ]
        assert sorted(names) == ["noa", "theo"]
        assert [
            entry["id"] for entry in (await _lines(client, app, "theo"))["entries"]
        ] == ["u2"]
        assert (await _lines(client, app, "iris"))["entries"] == [], (
            "an agent gone takes its chat"
        )
        assert [
            entry["id"] for entry in (await _lines(client, app, "noa"))["entries"]
        ] == ["n2"]

    async def test_only_a_chats_newest_lines_are_kept(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(chats, "LINES_KEPT", 3)
        app, box = await _signed_in_with_box(client, session, user)
        await _copy(
            client,
            box,
            lines=[
                {"agentId": "theo", "entry": _line(f"u{n}", f"Line {n}", n * 1_000)}
                for n in range(1, 6)
            ],
        )
        read = await _lines(client, app, "theo")
        assert [entry["id"] for entry in read["entries"]] == ["u3", "u4", "u5"]
        assert read["hasOlder"] is False
        newest_two = await _lines(client, app, "theo", limit=2)
        assert [entry["id"] for entry in newest_two["entries"]] == ["u4", "u5"]
        assert newest_two["hasOlder"] is True

    async def test_what_cannot_be_kept_is_skipped_not_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch.object(chats, "LINE_MAX_BYTES", 200)
        app, box = await _signed_in_with_box(client, session, user)
        counts = await _copy(
            client,
            box,
            agents=[{"id": "theo"}, {"name": "No id"}],
            lines=[
                {"agentId": "theo", "entry": _line("u1", "Short", 1_000)},
                {"agentId": "theo", "entry": _line("u2", "x" * 500, 2_000)},
                {"agentId": "theo", "entry": {"id": "k1", "content": "No kind"}},
            ],
        )
        assert counts["skipped"] == 3
        assert counts["lines"] == 1
        assert [
            entry["id"] for entry in (await _lines(client, app, "theo"))["entries"]
        ] == ["u1"]

    async def test_the_state_names_each_chats_newest_line(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        await _copy(
            client,
            box,
            agents=[{"id": "theo"}, {"id": "iris"}],
            lines=[
                {"agentId": "theo", "entry": _line("u1", "One", 1_000)},
                {"agentId": "theo", "entry": _line("u2", "Two", 2_000)},
                {"agentId": "iris", "entry": _line("i1", "Hi", 5_000)},
            ],
        )
        state = (await client.get(STATE, headers=box)).json()["data"]
        assert state == {"newest": {"theo": "u2", "iris": "i1"}, "agents": 2}

    async def test_each_person_reads_only_their_own(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        other, _ = await _signed_in_with_box(client, session, user_second)
        await _copy(
            client,
            box,
            agents=[{"id": "theo"}],
            lines=[{"agentId": "theo", "entry": _line("u1", "Private", 1_000)}],
        )
        assert (await client.get(AGENTS, headers=other)).json()["data"]["agents"] == []
        assert (await _lines(client, other, "theo"))["entries"] == []

    async def test_reading_is_the_apps_and_needs_a_sign_in(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        assert (await client.get(AGENTS)).status_code == 401
        assert (await client.post(COPY, json={})).status_code == 401
        # The computer sends; reading is for the apps.
        assert (await client.get(AGENTS, headers=box)).status_code == 401
        assert (
            await client.get(LINES, params={"agentId": "theo"}, headers=box)
        ).status_code == 401


SEND = "/desktop/api/chats/send"
INBOX = "/desktop/api/chats/inbox"
ACK = "/desktop/api/chats/inbox/ack"


def _send_args(nonce: str, prompt: str, **more: Any) -> dict[str, Any]:
    """What the apps send: `sendPrompt`'s own arguments
    (`LiveBackend.sendArguments`)."""
    return {
        "agentId": "theo",
        "prompt": prompt,
        "attachmentPaths": [],
        "attachmentNames": [],
        "clientNonce": nonce,
        "directAddressedAcceptance": True,
        **more,
    }


@pytest.fixture
def published(mocker: MockerFixture) -> Any:
    return mocker.patch.object(chats, "publish", new=mocker.AsyncMock())


async def _waiting(client: httpx.AsyncClient, box: dict[str, str]) -> list[Any]:
    response = await client.get(INBOX, headers=box)
    assert response.status_code == 200, response.text
    return response.json()["data"]["messages"]


@pytest.mark.asyncio
class TestChatInbox:
    async def test_a_message_waits_as_written_and_the_computer_takes_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        published: Any,
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)
        args = _send_args(
            "ios-1",
            "  Book the table \n",
            richText='{"type":"doc"}',
            replyToId="e7",
            isFork=True,
            composedAtMs=1_750_000_000_000,
        )
        answer = await client.post(SEND, json=args, headers=app)
        assert answer.status_code == 200, answer.text
        assert answer.json() == {"code": 0, "data": {"queued": True}}
        published.assert_awaited_once()
        assert published.await_args.args[1:] == (user.id, "chat-inbox")
        # Sent again (a retry): it waits once.
        assert (await client.post(SEND, json=args, headers=app)).status_code == 200
        await client.post(SEND, json=_send_args("ios-2", "Then call Iris"), headers=app)

        (first, second) = await _waiting(client, box)
        # Exactly as written: the computer knows a message sent both ways by
        # its words as well as its nonce.
        assert first["agentId"] == "theo"
        assert first["nonce"] == "ios-1"
        assert first["kind"] == "prompt"
        assert first["message"] == {
            "prompt": "  Book the table \n",
            "richText": '{"type":"doc"}',
            "replyToId": "e7",
            "isFork": True,
            "composedAtMs": 1_750_000_000_000,
        }
        assert second["message"] == {"prompt": "Then call Iris"}

        taken = await client.post(ACK, json={"ids": [first["id"]]}, headers=box)
        assert taken.json() == {"code": 0, "data": {"removed": 1}}
        assert [message["nonce"] for message in await _waiting(client, box)] == [
            "ios-2"
        ]
        # One no computer took in a week goes.
        (row,) = await DesktopChatInboxRepository.from_session(session).waiting(
            user.id, 10
        )
        row.created_at = utc_now() - timedelta(days=8)
        await session.flush()
        assert await _waiting(client, box) == []

    async def test_what_cannot_wait_is_refused_and_stays_on_the_device(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        published: Any,
        mocker: MockerFixture,
    ) -> None:
        app, box = await _signed_in_with_box(client, session, user)

        async def refused(body: dict[str, Any]) -> int:
            response = await client.post(SEND, json=body, headers=app)
            assert response.json()["message"], response.text
            return response.status_code

        assert (
            await refused(_send_args("f", "A file", attachmentPaths=["/a.png"])) == 422
        )
        assert await refused(_send_args("e", "   ")) == 422
        assert await refused(_send_args("n", "Hi\x00there")) == 422
        mocker.patch.object(chats, "MESSAGE_MAX_BYTES", 100)
        assert await refused(_send_args("l", "x" * 200)) == 413
        mocker.patch.object(chats, "WAITING_MAX", 1)
        assert (
            await client.post(SEND, json=_send_args("a", "One"), headers=app)
        ).status_code == 200
        assert await refused(_send_args("b", "Two")) == 429
        assert [message["nonce"] for message in await _waiting(client, box)] == ["a"]

    async def test_each_persons_messages_are_their_own(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
        published: Any,
    ) -> None:
        app, _ = await _signed_in_with_box(client, session, user)
        _, other_box = await _signed_in_with_box(client, session, user_second)
        await client.post(SEND, json=_send_args("ios-1", "Private"), headers=app)
        assert await _waiting(client, other_box) == []
        _, box = await _signed_in_with_box(client, session, user)
        (mine,) = await _waiting(client, box)
        # Another person's computer can't take it away.
        gone = await client.post(
            ACK, json={"ids": [mine["id"], "not-an-id"]}, headers=other_box
        )
        assert gone.json()["data"]["removed"] == 0
        assert len(await _waiting(client, box)) == 1

    async def test_sending_is_the_apps_and_needs_a_sign_in(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        published: Any,
    ) -> None:
        _, box = await _signed_in_with_box(client, session, user)
        assert (await client.post(SEND, json=_send_args("a", "Hi"))).status_code == 401
        assert (await client.get(INBOX)).status_code == 401
        assert (await client.post(ACK, json={"ids": []})).status_code == 401
        # The computer takes messages; it does not write them.
        assert (
            await client.post(SEND, json=_send_args("a", "Hi"), headers=box)
        ).status_code == 401
        published.assert_not_awaited()
