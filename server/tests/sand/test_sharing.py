"""The sharing relay (25 September 2026, `polar/sand/sharing.py`).

Two people, each signed in as the app does (`_signed_in`), speak to the
relay the way `desktop/source/host/extensions/cross-user-sharing/xuser-relay.ts`
does: a room is minted from an agent, the second person opens the invite
link and waits, the host approves, both read the room in `/sand/share-state`;
a `room-entry` one sends is polled by the other and acked away; a
`turn-request` reaches the agent's owner and its `turn-result` returns to
the requester; a host who leaves ends the room; an invalid link and a
burst of joins answer their statuses.
"""

from typing import Any

import httpx
import pytest

from polar.config import settings
from polar.models import User
from polar.postgres import AsyncSession
from tests.desktop.test_endpoints import _signed_in


async def _call(
    client: httpx.AsyncClient,
    access: str,
    path: str,
    body: dict[str, Any] | None = None,
) -> httpx.Response:
    return await client.post(
        path, json=body or {}, headers={"Authorization": f"Bearer {access}"}
    )


async def _ok(
    client: httpx.AsyncClient,
    access: str,
    path: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    response = await _call(client, access, path, body)
    assert response.status_code == 200, (path, response.text)
    return response.json()


async def _poll(
    client: httpx.AsyncClient, access: str, ack: list[str] | None = None
) -> list[dict[str, Any]]:
    return (await _ok(client, access, "/sand/xuser/poll", {"ackIds": ack or []}))[
        "events"
    ]


@pytest.mark.asyncio
class TestSharing:
    async def test_a_room_from_an_agent_is_joined_approved_mirrored_and_ended(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        host, _ = await _signed_in(client, session, user)
        guest, _ = await _signed_in(client, session, user_second)
        host_id, guest_id = str(user.id), str(user_second.id)

        # The host shares an agent: a room named after it and an invite link.
        minted = await _ok(
            client,
            host,
            "/sand/share-rooms/from-agent",
            {
                "agentId": "agent-1",
                "agentName": "Muse",
                "avatarDataUrl": "data:image/png;base64,AAAA",
            },
        )
        assert minted["shareUrl"].startswith(settings.FRONTEND_BASE_URL + "/share/")
        assert isinstance(minted["expiresAtMs"], int)
        room_id = minted["room"]["roomId"]
        assert minted["room"]["hostAuthId"] == host_id
        assert {m["kind"] for m in minted["room"]["members"]} == {"human", "agent"}
        agent = next(m for m in minted["room"]["members"] if m["kind"] == "agent")
        assert agent == {
            "kind": "agent",
            "authId": host_id,
            "agentId": "agent-1",
            "displayName": "Muse",
            "avatarDataUrl": "data:image/png;base64,AAAA",
        }
        human = next(m for m in minted["room"]["members"] if m["kind"] == "human")
        assert human["displayName"]  # the renderer refuses a human with no name

        # A second link for the same room is answered to the host only.
        again = await _ok(
            client, host, "/sand/share-rooms/invite-links", {"roomId": room_id}
        )
        assert again["room"]["roomId"] == room_id
        assert (
            await _call(
                client, guest, "/sand/share-rooms/invite-links", {"roomId": room_id}
            )
        ).status_code == 404

        # The guest opens the link: pending, and the host is told.
        joined = await _ok(
            client, guest, "/sand/share-rooms/join", {"link": minted["shareUrl"]}
        )
        assert joined == {"status": "pending", "roomName": "Muse"}
        assert (
            await _ok(
                client, guest, "/sand/share-rooms/join", {"link": minted["shareUrl"]}
            )
        )["status"] == "pending"
        host_events = await _poll(client, host)
        assert [e["kind"] for e in host_events] == ["room-join-request"]
        request = host_events[0]["request"]
        assert request["roomId"] == room_id
        assert request["requesterAuthId"] == guest_id
        assert request["requesterName"]
        state = await _ok(client, host, "/sand/share-state")
        assert [r["requestId"] for r in state["pendingJoinRequests"]] == [
            request["requestId"]
        ]
        assert (await _ok(client, guest, "/sand/share-state"))["rooms"] == []

        # The host approves: the guest gets the decision with the room, both see it.
        decided = await _ok(
            client,
            host,
            "/sand/share-rooms/join/respond",
            {"requestId": request["requestId"], "isApproved": True},
        )
        assert decided["status"] == "approved"
        assert {
            m["authId"] for m in decided["room"]["members"] if m["kind"] == "human"
        } == {host_id, guest_id}
        guest_events = await _poll(client, guest)
        assert [e["kind"] for e in guest_events] == ["room-join-decision"]
        assert guest_events[0]["isApproved"] is True
        assert guest_events[0]["room"]["roomId"] == room_id
        for access in (host, guest):
            state = await _ok(client, access, "/sand/share-state")
            assert [r["roomId"] for r in state["rooms"]] == [room_id]
            assert state["rooms"][0]["hostName"] == human["displayName"]
        assert (await _ok(client, host, "/sand/share-state"))[
            "pendingJoinRequests"
        ] == []
        assert (
            await _ok(
                client, guest, "/sand/share-rooms/join", {"link": minted["shareUrl"]}
            )
        )["status"] == "already-member"

        # The guest adds an agent of their own; the host is told with the room.
        added = await _ok(
            client,
            guest,
            "/sand/share-rooms/agents/add",
            {"roomId": room_id, "agentId": "agent-2", "agentName": "Scout"},
        )
        assert any(
            m.get("agentId") == "agent-2" and m["authId"] == guest_id
            for m in added["room"]["members"]
        )
        acked = [e["id"] for e in host_events]
        host_events = await _poll(client, host, acked)
        assert [e["kind"] for e in host_events] == ["room-upsert"]
        assert any(
            m.get("agentId") == "agent-2" for m in host_events[0]["room"]["members"]
        )

        # A message the host's user typed is mirrored to the guest, once, and acked away.
        sent = await _ok(
            client,
            host,
            "/sand/xuser/send",
            {
                "kind": "room-entry",
                "roomId": room_id,
                "entry": {
                    "kind": "human-message",
                    "entryId": "e1",
                    "authorAuthId": host_id,
                    "authorName": "Host",
                    "text": "hello",
                    "images": [],
                },
            },
        )
        assert isinstance(sent["timestampMs"], int)
        guest_events = await _poll(client, guest, [e["id"] for e in guest_events])
        assert [e["kind"] for e in guest_events] == [
            "room-entry"
        ]  # the guest made the add and read the room in its answer
        entry = guest_events[0]["entry"]
        assert entry["kind"] == "human-message"
        assert entry["entryId"] == "e1"
        assert entry["text"] == "hello"
        assert entry["authorAuthId"] == host_id
        assert entry["authorName"] == human["displayName"]
        assert entry["timestampMs"] == sent["timestampMs"]
        assert await _poll(client, host, [e["id"] for e in host_events]) == []
        assert await _poll(client, guest, [e["id"] for e in guest_events]) == []

        # The host asks the guest's agent for a turn; the result comes back to the host.
        asked = await _ok(
            client,
            host,
            "/sand/xuser/send",
            {
                "kind": "turn-request",
                "roomId": room_id,
                "turnNonce": "n1",
                "ownerAuthId": guest_id,
                "agentId": "agent-2",
                "groupName": "Muse",
                "groupDescription": "",
                "peers": [{"name": "Muse", "description": ""}],
                "newMessages": [
                    {"speakerKind": "human", "speakerName": "Host", "text": "hello"}
                ],
            },
        )
        assert "timestampMs" in asked
        guest_events = await _poll(client, guest)
        assert [e["kind"] for e in guest_events] == ["turn-request"]
        turn = guest_events[0]
        assert turn["roomId"] == room_id
        assert turn["turnNonce"] == "n1"
        assert turn["agentId"] == "agent-2"
        assert turn["hostAuthId"] == host_id
        assert turn["newMessages"][0]["text"] == "hello"
        assert turn["peers"][0]["name"] == "Muse"
        # Only the host may ask, and only for an agent that is in the room.
        assert (
            await _call(
                client,
                guest,
                "/sand/xuser/send",
                {
                    "kind": "turn-request",
                    "roomId": room_id,
                    "turnNonce": "n2",
                    "ownerAuthId": host_id,
                    "agentId": "agent-1",
                },
            )
        ).status_code == 404
        assert (
            await _call(
                client,
                host,
                "/sand/xuser/send",
                {
                    "kind": "turn-request",
                    "roomId": room_id,
                    "turnNonce": "n3",
                    "ownerAuthId": guest_id,
                    "agentId": "not-there",
                },
            )
        ).status_code == 404
        await _ok(
            client,
            guest,
            "/sand/xuser/send",
            {
                "kind": "turn-result",
                "roomId": room_id,
                "turnNonce": "n1",
                "agentId": "agent-2",
                "messages": ["Hi from Scout", "second", "third"],
            },
        )
        host_events = await _poll(client, host)
        assert [e["kind"] for e in host_events] == ["turn-result"]
        assert host_events[0]["turnNonce"] == "n1"
        assert host_events[0]["messages"] == [
            "Hi from Scout",
            "second",
        ]

        # Typing travels to the other members with an expiry.
        await _ok(
            client,
            guest,
            "/sand/xuser/send",
            {"kind": "room-typing", "roomId": room_id, "isTyping": True},
        )
        host_events = await _poll(client, host, [e["id"] for e in host_events])
        assert [e["kind"] for e in host_events] == ["room-typing"]
        assert host_events[0]["isTyping"] is True
        assert host_events[0]["user"]["authId"] == guest_id
        assert host_events[0]["user"]["expiresAtMs"] > sent["timestampMs"]

        # The host leaves: the room ends and the guest is told.
        assert (
            await _ok(client, host, "/sand/share-rooms/leave", {"roomId": room_id})
            == {}
        )
        guest_events = await _poll(client, guest, [e["id"] for e in guest_events])
        assert [e["kind"] for e in guest_events] == ["room-ended"]
        assert guest_events[0]["roomId"] == room_id
        for access in (host, guest):
            assert (await _ok(client, access, "/sand/share-state"))["rooms"] == []
        assert (
            await _ok(
                client, guest, "/sand/share-rooms/join", {"link": minted["shareUrl"]}
            )
        )["status"] == "invalid"

    async def test_a_guest_leaves_and_a_host_removes_and_denies(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        host, _ = await _signed_in(client, session, user)
        guest, _ = await _signed_in(client, session, user_second)
        created = await _ok(
            client,
            host,
            "/sand/share-rooms",
            {
                "name": "Planning",
                "agents": [
                    {"agentId": "a", "agentName": "A"},
                    {"agentId": "b", "agentName": "B"},
                ],
            },
        )
        assert created["status"] == "created"
        assert created["room"]["name"] == "Planning"
        room_id = created["room"]["roomId"]
        assert len([m for m in created["room"]["members"] if m["kind"] == "agent"]) == 2
        link = (
            await _ok(
                client, host, "/sand/share-rooms/invite-links", {"roomId": room_id}
            )
        )["shareUrl"]

        # Denied: the guest is told and a second try says so.
        await _ok(client, guest, "/sand/share-rooms/join", {"link": link})
        request_id = (await _poll(client, host))[0]["request"]["requestId"]
        assert (
            await _ok(
                client,
                host,
                "/sand/share-rooms/join/respond",
                {"requestId": request_id, "isApproved": False},
            )
        )["status"] == "denied"
        assert (await _poll(client, guest))[0] | {"id": ""} == {
            "id": "",
            "kind": "room-join-decision",
            "isApproved": False,
            "roomId": room_id,
        }
        assert (await _ok(client, guest, "/sand/share-rooms/join", {"link": link}))[
            "status"
        ] == "denied"

        # A room the host removes one agent from, then the picture, then a deleted agent.
        removed = await _ok(
            client,
            host,
            "/sand/share-rooms/agents/remove",
            {"roomId": room_id, "agentId": "b"},
        )
        assert [
            m["agentId"] for m in removed["room"]["members"] if m["kind"] == "agent"
        ] == ["a"]
        pictured = await _ok(
            client,
            host,
            "/sand/share-rooms/picture",
            {"roomId": room_id, "avatarDataUrl": "data:image/png;base64,BBBB"},
        )
        assert pictured["room"]["avatarDataUrl"] == "data:image/png;base64,BBBB"
        deleted = await _ok(
            client, host, "/sand/share-rooms/agents/remove-deleted", {"agentId": "a"}
        )
        assert [r["roomId"] for r in deleted["rooms"]] == [room_id]
        assert [m for m in deleted["rooms"][0]["members"] if m["kind"] == "agent"] == []

        # A bare token or a link with a query works; garbage and a wrong-typed token do not.
        token = link.rsplit("/", 1)[-1]
        assert (await _ok(client, guest, "/sand/share-rooms/join", {"link": token}))[
            "status"
        ] == "denied"
        assert (
            await _ok(
                client,
                guest,
                "/sand/share-rooms/join",
                {"link": "https://app.simeonlabs.com/share/not.a.token"},
            )
        )["status"] == "invalid"
        assert (await _ok(client, guest, "/sand/share-rooms/join", {"link": ""}))[
            "status"
        ] == "invalid"
        assert (await _ok(client, guest, "/sand/share-rooms/join", {"link": host}))[
            "status"
        ] == "invalid"

    async def test_joins_are_rate_limited_per_person(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        user_second: User,
    ) -> None:
        guest, _ = await _signed_in(client, session, user_second)
        for _ in range(settings.DESKTOP_SHARE_JOINS_PER_MINUTE):
            assert (
                await _ok(client, guest, "/sand/share-rooms/join", {"link": "nope"})
            )["status"] == "invalid"
        assert (await _ok(client, guest, "/sand/share-rooms/join", {"link": "nope"}))[
            "status"
        ] == "rate-limited"

    async def test_the_relay_needs_a_signed_in_person(
        self, client: httpx.AsyncClient
    ) -> None:
        for path in (
            "/sand/xuser/poll",
            "/sand/xuser/send",
            "/sand/share-state",
            "/sand/share-rooms/join",
        ):
            assert (await client.post(path, json={})).status_code == 401, path
