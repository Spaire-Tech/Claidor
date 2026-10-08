"""Pushes to the person's iPhone (`simeon/desktop/push.py`, `push_tasks.py`,
8 October 2026).

Over HTTP: the phone registers and unregisters with its own desktop token
(and a box cannot register one), the box posts a push with its own
credential, a person with no phone gets `{"sent": 0}`, and the caps drop
a runaway loop's extra pushes. The actor, with Expo mocked: one message
per phone with the title, body and `data` the phone app reads, and a phone
Expo calls gone is removed; once more with only Expo's HTTP answer faked,
so the JSON Expo would receive is the one checked.
"""

import json
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest
from exponent_server_sdk import PushServerError, PushTicket
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop import push as push_module
from simeon.desktop.push_tasks import desktop_push_send
from simeon.models import User
from simeon.models.notification_recipient import NotificationRecipient
from simeon.notification_recipient.repository import NotificationRecipientRepository
from simeon.notifications.tasks import push as expo
from simeon.notifications.tasks.push import ExpoPushMessage, is_expo_push_token
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture

from .test_endpoints import _signed_in

DEVICES = "/desktop/push-devices"
PUSH = "/desktop/push"
TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]"
NEW_SPELLING = "ExpoPushToken[0123456789abcdefghijkl]"


def _bearer(access: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access}"}


async def _box_access(client: httpx.AsyncClient, access: str) -> str:
    """The access token the box's host holds: the Mac mints the box's
    credential, the box trades it (`tests/desktop/test_box_credential.py`)."""
    minted = await client.post(
        "/desktop/api/box/renewal-credential", headers=_bearer(access)
    )
    credential = minted.json()["data"]["credential"]
    traded = await client.post(
        "/sand-box/inference-credential", json={"credential": credential}
    )
    assert traded.status_code == 200, traded.text
    return str(traded.json()["accessToken"])


async def _live_devices(
    session: AsyncSession, user: User
) -> list[NotificationRecipient]:
    repository = NotificationRecipientRepository.from_session(session)
    return list(await repository.list_by_user(user.id, None, None))


async def _device(
    save_fixture: SaveFixture, user: User, token: str = TOKEN
) -> NotificationRecipient:
    device = NotificationRecipient(
        user_id=user.id, platform="ios", expo_push_token=token
    )
    await save_fixture(device)
    return device


def _push_body(**overrides: Any) -> dict[str, Any]:
    return {
        "agent_id": "agent-1",
        "kind": "agent-done",
        "title": "Ada",
        "body": "Booked the 9:40 to Lisbon.",
        **overrides,
    }


def test_expo_push_tokens() -> None:
    for token in (TOKEN, NEW_SPELLING):
        assert is_expo_push_token(token), token
    for token in (
        "",
        "ExponentPushToken[]",
        "ExponentPushToken[abc",
        "abc",
        "ExponentPushToken[a b]",
        "fcm:abcdef",
        f"{TOKEN} ",
    ):
        assert not is_expo_push_token(token), token


def test_the_new_spelling_gets_a_payload() -> None:
    """The SDK's own check refuses `ExpoPushToken[…]`; ours does not."""
    payload = ExpoPushMessage(to=NEW_SPELLING, title="t", body="b").get_payload()
    assert payload == {"to": NEW_SPELLING, "title": "t", "body": "b"}
    with pytest.raises(ValueError, match="Invalid push token"):
        ExpoPushMessage(to="nope", title="t").get_payload()


@pytest.mark.asyncio
class TestPushDevices:
    async def test_anonymous(self, client: httpx.AsyncClient) -> None:
        response = await client.post(
            DEVICES, json={"expo_push_token": TOKEN, "platform": "ios"}
        )
        assert response.status_code == 401

    async def test_register_is_idempotent(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        first = await client.post(
            DEVICES,
            json={"expo_push_token": TOKEN, "platform": "ios"},
            headers=_bearer(access),
        )
        assert first.status_code == 200, first.text
        assert first.json()["expo_push_token"] == TOKEN
        assert first.json()["platform"] == "ios"
        again = await client.post(
            DEVICES,
            json={"expo_push_token": f"  {TOKEN} ", "platform": "ios"},
            headers=_bearer(access),
        )
        assert again.status_code == 200, again.text
        assert again.json()["id"] == first.json()["id"]
        devices = await _live_devices(session, user)
        assert [device.expo_push_token for device in devices] == [TOKEN]

    async def test_new_spelling_and_default_platform(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            DEVICES, json={"expo_push_token": NEW_SPELLING}, headers=_bearer(access)
        )
        assert response.status_code == 200, response.text
        assert response.json()["platform"] == "ios"

    @pytest.mark.parametrize(
        "body",
        [
            {"expo_push_token": "not-a-token", "platform": "ios"},
            {"expo_push_token": "ExponentPushToken[]", "platform": "ios"},
            {"expo_push_token": TOKEN, "platform": "windows"},
            {"platform": "ios"},
        ],
    )
    async def test_refuses_what_is_not_an_expo_token(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        body: dict[str, str],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(DEVICES, json=body, headers=_bearer(access))
        assert response.status_code == 422, response.text
        assert await _live_devices(session, user) == []

    async def test_a_phone_moves_to_whoever_signed_in_on_it(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
    ) -> None:
        await _device(save_fixture, user_second)
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            DEVICES,
            json={"expo_push_token": TOKEN, "platform": "ios"},
            headers=_bearer(access),
        )
        assert response.status_code == 200, response.text
        assert [d.expo_push_token for d in await _live_devices(session, user)] == [
            TOKEN
        ]
        assert await _live_devices(session, user_second) == []

    async def test_the_box_cannot_register_a_phone(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        box = await _box_access(client, access)
        response = await client.post(
            DEVICES,
            json={"expo_push_token": TOKEN, "platform": "ios"},
            headers=_bearer(box),
        )
        assert response.status_code == 401, response.text

    async def test_unregister(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        user_second: User,
    ) -> None:
        await _device(save_fixture, user)
        await _device(save_fixture, user_second, NEW_SPELLING)
        access, _ = await _signed_in(client, session, user)
        removed = await client.request(
            "DELETE", DEVICES, json={"expo_push_token": TOKEN}, headers=_bearer(access)
        )
        assert removed.status_code == 200, removed.text
        assert removed.json() == {"removed": 1}
        assert await _live_devices(session, user) == []
        # Again: nothing left to remove, and still fine.
        again = await client.request(
            "DELETE", DEVICES, json={"expo_push_token": TOKEN}, headers=_bearer(access)
        )
        assert again.json() == {"removed": 0}
        # Somebody else's phone is not this person's to remove.
        other = await client.request(
            "DELETE",
            DEVICES,
            json={"expo_push_token": NEW_SPELLING},
            headers=_bearer(access),
        )
        assert other.json() == {"removed": 0}
        assert len(await _live_devices(session, user_second)) == 1


@pytest.mark.asyncio
class TestPush:
    async def test_anonymous(self, client: httpx.AsyncClient) -> None:
        response = await client.post(PUSH, json=_push_body())
        assert response.status_code == 401

    async def test_no_phone_is_a_quiet_no_op(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        enqueue_job = mocker.patch("simeon.desktop.push.enqueue_job")
        access, _ = await _signed_in(client, session, user)
        box = await _box_access(client, access)
        response = await client.post(PUSH, json=_push_body(), headers=_bearer(box))
        assert response.status_code == 200, response.text
        assert response.json() == {"sent": 0}
        enqueue_job.assert_not_called()

    async def test_the_box_queues_a_push(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        enqueue_job = mocker.patch("simeon.desktop.push.enqueue_job")
        await _device(save_fixture, user)
        access, _ = await _signed_in(client, session, user)
        box = await _box_access(client, access)
        long_body = "word " * 200
        response = await client.post(
            PUSH,
            json=_push_body(
                kind="agent-needs-input",
                title="  Ada   needs you ",
                body=long_body,
                extra="ignored",
            ),
            headers=_bearer(box),
        )
        assert response.status_code == 202, response.text
        assert response.json() == {"queued": 1}
        enqueue_job.assert_called_once()
        (actor,), kwargs = enqueue_job.call_args
        assert actor == "desktop.push.send"
        assert kwargs["user_id"] == str(user.id)
        assert kwargs["agent_id"] == "agent-1"
        assert kwargs["kind"] == "agent-needs-input"
        assert kwargs["title"] == "Ada needs you"
        assert len(kwargs["body"]) == push_module.BODY_MAX_CHARS
        assert kwargs["body"].endswith("…")

    async def test_the_mac_may_post_one_too(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.desktop.push.enqueue_job")
        await _device(save_fixture, user)
        access, _ = await _signed_in(client, session, user)
        response = await client.post(PUSH, json=_push_body(), headers=_bearer(access))
        assert response.status_code == 202, response.text

    @pytest.mark.parametrize(
        "body",
        [
            _push_body(kind="agent-started"),
            _push_body(agent_id=""),
            {"agent_id": "agent-1", "kind": "agent-done", "title": "Ada"},
        ],
    )
    async def test_refuses_a_malformed_push(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        body: dict[str, Any],
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(PUSH, json=body, headers=_bearer(access))
        assert response.status_code == 422, response.text

    async def test_the_same_news_once_in_thirty_seconds(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        enqueue_job = mocker.patch("simeon.desktop.push.enqueue_job")
        await _device(save_fixture, user)
        access, _ = await _signed_in(client, session, user)
        box = await _box_access(client, access)
        first = await client.post(PUSH, json=_push_body(), headers=_bearer(box))
        assert first.status_code == 202
        repeated = await client.post(PUSH, json=_push_body(), headers=_bearer(box))
        assert repeated.status_code == 200
        assert repeated.json() == {"sent": 0, "capped": "same_push"}
        # Another kind, or another agent, is other news.
        needs = await client.post(
            PUSH, json=_push_body(kind="agent-needs-input"), headers=_bearer(box)
        )
        assert needs.status_code == 202
        other = await client.post(
            PUSH, json=_push_body(agent_id="agent-2"), headers=_bearer(box)
        )
        assert other.status_code == 202
        assert enqueue_job.call_count == 3

    async def test_at_most_twenty_a_minute(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        enqueue_job = mocker.patch("simeon.desktop.push.enqueue_job")
        await _device(save_fixture, user)
        access, _ = await _signed_in(client, session, user)
        box = await _box_access(client, access)
        answers = [
            await client.post(
                PUSH, json=_push_body(agent_id=f"agent-{index}"), headers=_bearer(box)
            )
            for index in range(push_module.PUSHES_PER_MINUTE + 3)
        ]
        assert [answer.status_code for answer in answers].count(
            202
        ) == push_module.PUSHES_PER_MINUTE
        assert answers[-1].json() == {"sent": 0, "capped": "per_minute"}
        assert enqueue_job.call_count == push_module.PUSHES_PER_MINUTE


def _ticket(message: ExpoPushMessage, error: str | None = None) -> PushTicket:
    if error is None:
        return PushTicket(
            push_message=message, status="ok", message="", details=None, id="t"
        )
    return PushTicket(
        push_message=message,
        status="error",
        message="nope",
        details={"error": error},
        id=None,
    )


@pytest.mark.asyncio
class TestSendActor:
    async def test_one_message_per_phone_and_a_gone_phone_is_removed(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _device(save_fixture, user, TOKEN)
        await _device(save_fixture, user, NEW_SPELLING)
        sent: list[ExpoPushMessage] = []

        def publish(messages: list[ExpoPushMessage]) -> list[PushTicket]:
            sent.extend(messages)
            return [
                _ticket(
                    message,
                    "DeviceNotRegistered" if message.to == NEW_SPELLING else None,
                )
                for message in messages
            ]

        mocker.patch(
            "simeon.desktop.push_tasks.publish_push_messages", side_effect=publish
        )
        await desktop_push_send(
            user_id=str(user.id),
            agent_id="agent-1",
            kind="agent-needs-input",
            title="Ada needs you",
            body="Which card should I use?",
        )

        assert sorted(message.to for message in sent) == sorted([TOKEN, NEW_SPELLING])
        for message in sent:
            assert message.title == "Ada needs you"
            assert message.body == "Which card should I use?"
            assert message.data == {"agentId": "agent-1", "kind": "agent-needs-input"}
            assert message.sound == "default"
            assert message.badge == 1
            assert message.priority == "high"
            message.get_payload()
        assert [
            device.expo_push_token for device in await _live_devices(session, user)
        ] == [TOKEN]

    async def test_a_finished_turn_is_not_high_priority(
        self,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _device(save_fixture, user)
        publish = mocker.patch(
            "simeon.desktop.push_tasks.publish_push_messages",
            side_effect=lambda messages: [_ticket(m) for m in messages],
        )
        await desktop_push_send(
            user_id=str(user.id),
            agent_id="agent-1",
            kind="agent-done",
            title="Ada",
            body="Done.",
        )
        (messages,), _ = publish.call_args
        assert [message.priority for message in messages] == ["default"]

    async def test_expo_failing_does_not_raise(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _device(save_fixture, user)
        mocker.patch(
            "simeon.desktop.push_tasks.publish_push_messages",
            side_effect=PushServerError("Request failed", MagicMock()),
        )
        await desktop_push_send(
            user_id=str(user.id),
            agent_id="agent-1",
            kind="agent-done",
            title="Ada",
            body="Done.",
        )
        assert len(await _live_devices(session, user)) == 1

    async def test_no_phone_sends_nothing(
        self, user: User, mocker: MockerFixture
    ) -> None:
        publish = mocker.patch("simeon.desktop.push_tasks.publish_push_messages")
        await desktop_push_send(
            user_id=str(user.id),
            agent_id="agent-1",
            kind="agent-done",
            title="Ada",
            body="Done.",
        )
        publish.assert_not_called()


def test_the_expo_client_carries_the_access_token_when_set(
    mocker: MockerFixture,
) -> None:
    assert "Authorization" not in expo._create_push_client().session.headers
    mocker.patch.object(settings, "EXPO_ACCESS_TOKEN", "expo-secret")
    client = expo._create_push_client()
    assert client.session.headers["Authorization"] == "Bearer expo-secret"
    assert client.timeout == expo.PUSH_TIMEOUT_SECONDS


@pytest.mark.asyncio
async def test_what_expo_receives(
    session: AsyncSession,
    save_fixture: SaveFixture,
    user: User,
    mocker: MockerFixture,
) -> None:
    """Only the HTTP post is faked: the SDK builds the request and reads
    Expo's answer (`exp.host/--/api/v2/push/send`)."""
    await _device(save_fixture, user, TOKEN)
    await _device(save_fixture, user, NEW_SPELLING)

    def expo_answers(url: str, data: str, timeout: int) -> MagicMock:
        # One ticket per message, in the order sent: the new spelling's
        # phone is gone.
        answer = MagicMock()
        answer.json.return_value = {
            "data": [
                {"status": "ok", "id": "ticket-1"}
                if message["to"] == TOKEN
                else {
                    "status": "error",
                    "message": "not a registered push notification recipient",
                    "details": {"error": "DeviceNotRegistered"},
                }
                for message in json.loads(data)
            ]
        }
        return answer

    post = mocker.patch.object(
        expo._push_client.session, "post", side_effect=expo_answers
    )

    await desktop_push_send(
        user_id=str(user.id),
        agent_id="agent-1",
        kind="agent-done",
        title="Ada",
        body="Booked the 9:40 to Lisbon.",
    )

    (url,), kwargs = post.call_args
    assert url == "https://exp.host/--/api/v2/push/send"
    assert kwargs["timeout"] == expo.PUSH_TIMEOUT_SECONDS
    sent = sorted(json.loads(kwargs["data"]), key=lambda message: message["to"])
    assert [message["to"] for message in sent] == [NEW_SPELLING, TOKEN]
    assert sent[1] == {
        "to": TOKEN,
        "title": "Ada",
        "body": "Booked the 9:40 to Lisbon.",
        "data": {"agentId": "agent-1", "kind": "agent-done"},
        "sound": "default",
        "badge": 1,
        "priority": "default",
        "ttl": 86400,
        "channelId": "default",
    }
    # The second phone's ticket said it is gone.
    assert [d.expo_push_token for d in await _live_devices(session, user)] == [TOKEN]
