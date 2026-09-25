"""The sharing relay's logic: rooms, invites, joins, fan-out and turns.

One `SharingRelay` per request, acting as the signed-in person (the
`DesktopSession.user` behind the bearer, the Mac's or the box's). Every
answer is the JSON shape `desktop/source/host/extensions/cross-user-sharing/`
reads, with its field names; `docs/product/sharing-served.md` is the record.

Identity on the wire is the person's user id: the app reads `sub` off
its access-token envelope (`envelope_access_token`, `getSelfAuthId` in
`extension.ts`) and compares it with `hostAuthId`, `members[].authId`,
`authorAuthId` and `agentOwnerAuthId`, so every `authId` here is
`str(user.id)` and nothing else.
"""

from __future__ import annotations

import time
from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import UUID

import structlog

from polar.config import settings
from polar.desktop.service import desktop
from polar.kit import jwt
from polar.kit.utils import utc_now
from polar.models import (
    DesktopShareJoinRequest,
    DesktopShareRoom,
    DesktopShareRoomMember,
    User,
)
from polar.postgres import AsyncSession
from polar.redis import Redis

from .notify import publish
from .sharing_repository import (
    ShareEventRepository,
    ShareJoinRequestRepository,
    ShareMemberRepository,
    ShareRoomRepository,
)

log = structlog.get_logger()

INVITE_TOKEN_TYPE = "desktop_share_invite"
#: Where an invite link points. No page answers it yet: the person pastes
#: the whole link into Simeon's join box, and `/sand/share-rooms/join`
#: reads the token off the last path segment. A landing page on the web
#: app is the founder's call (`docs/product/sharing-served.md`).
INVITE_PATH = "/share/"
#: `room-typing` lives this long in Redis and on the other members' screens.
TYPING_TTL_SECONDS = 8
#: A `turn-request`'s nonce → who asked, so the `turn-result` finds its way
#: back; the app's own deadline on a remote turn is ten minutes.
TURN_NONCE_TTL_SECONDS = 15 * 60
NAME_MAX = 200
#: The app sends at most four inline images per entry and clamps them to
#: 1.1 MB itself (`xuser-entry-publisher.ts`); the relay refuses more.
ENTRY_MAX_BYTES = 2_000_000
TURN_MESSAGES_MAX = 24
PEERS_MAX = 32


def now_ms() -> int:
    return int(time.time() * 1000)


def to_ms(value: datetime) -> int:
    return int(value.timestamp() * 1000)


def clamp_name(value: object, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback
    text = " ".join(value.split())[:NAME_MAX]
    return text or fallback


def parse_uuid(value: object) -> UUID | None:
    if not isinstance(value, str):
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def display_name_of(user: User) -> str:
    return clamp_name(desktop.user_payload(user)["nickname"], "Someone")


def avatar_of(user: User) -> str | None:
    return user.avatar_url or None


def is_data_url(value: object) -> bool:
    return (
        isinstance(value, str)
        and value.startswith("data:image/")
        and len(value) <= 200_000
    )


# --- invite links ------------------------------------------------------------


def mint_invite(room: DesktopShareRoom) -> tuple[str, str, datetime]:
    """The link, its token and its expiry."""
    expires_at = utc_now() + settings.DESKTOP_SHARE_INVITE_TTL
    token = jwt.encode(
        data={"room": str(room.id), "host": str(room.host_user_id)},
        secret=settings.SECRET,
        expires_at=expires_at,
        type=INVITE_TOKEN_TYPE,  # type: ignore[arg-type]
    )
    return settings.generate_frontend_url(f"{INVITE_PATH}{token}"), token, expires_at


def invite_token_of(link: str) -> str:
    """The token in a pasted link: the whole thing, or the last path
    segment of a URL, or its `invite` query parameter."""
    text = link.strip()
    if "://" not in text and "/" not in text:
        return text
    try:
        parsed = urlparse(text if "://" in text else f"https://x/{text.lstrip('/')}")
    except ValueError:
        return text
    query = parse_qs(parsed.query).get("invite")
    if query:
        return query[0].strip()
    return parsed.path.rstrip("/").rsplit("/", 1)[-1].strip()


def parse_invite(link: object) -> UUID | None:
    if not isinstance(link, str) or not link.strip():
        return None
    token = invite_token_of(link)
    if token.count(".") != 2:
        return None
    try:
        payload = jwt.decode(
            token=token, secret=settings.SECRET, type=INVITE_TOKEN_TYPE
        )  # type: ignore[arg-type]
    except Exception:
        return None
    return parse_uuid(payload.get("room"))


# --- the relay ---------------------------------------------------------------


class SharingRelay:
    def __init__(self, session: AsyncSession, redis: Redis, user: User) -> None:
        self.session = session
        self.redis = redis
        self.user = user
        self.user_id: UUID = user.id
        self.auth_id = str(user.id)
        self.rooms = ShareRoomRepository.from_session(session)
        self.members = ShareMemberRepository.from_session(session)
        self.requests = ShareJoinRequestRepository.from_session(session)
        self.events = ShareEventRepository.from_session(session)

    # wire shapes

    @staticmethod
    def member_wire(member: DesktopShareRoomMember) -> dict[str, Any]:
        wire: dict[str, Any] = {
            "kind": member.kind,
            "authId": str(member.user_id),
            "displayName": member.display_name,
        }
        if member.agent_id is not None:
            wire["agentId"] = member.agent_id
        if member.avatar_data_url:
            wire["avatarDataUrl"] = member.avatar_data_url
        return wire

    async def room_wire(self, room: DesktopShareRoom) -> dict[str, Any]:
        members = await self.members.list_for_room(room.id)
        host = next(
            (
                m
                for m in members
                if m.kind == "human" and m.user_id == room.host_user_id
            ),
            None,
        )
        wire: dict[str, Any] = {
            "roomId": str(room.id),
            "name": room.name,
            "hostAuthId": str(room.host_user_id),
            "hostName": host.display_name if host is not None else "Host",
            "members": [self.member_wire(m) for m in members],
        }
        if room.avatar_data_url:
            wire["avatarDataUrl"] = room.avatar_data_url
        return wire

    @staticmethod
    def human_ids(members: Iterable[DesktopShareRoomMember]) -> set[UUID]:
        return {m.user_id for m in members if m.kind == "human"}

    # events

    async def emit(
        self, user_ids: Iterable[UUID], kind: str, payload: dict[str, Any]
    ) -> None:
        targets = {uid for uid in user_ids}
        for uid in targets:
            await self.events.enqueue(uid, kind, payload)
        await self.session.flush()
        # The rows land when the request commits; a poll woken by this
        # publish that arrives first sees them on its next tick (4 s), so
        # a lost race costs a poll and never an event.
        for uid in targets:
            await publish(self.redis, uid, "xuser-events")
        log.info("desktop.sharing.event", kind=kind, recipients=len(targets))

    async def emit_room_upsert(
        self, room: DesktopShareRoom, *, exclude: Iterable[UUID] = ()
    ) -> dict[str, Any]:
        """The room to every human member but the actor (who reads it in
        the answer) and whoever `exclude` names."""
        wire = await self.room_wire(room)
        members = await self.members.list_for_room(room.id)
        skip = {self.user_id, *exclude}
        await self.emit(
            (uid for uid in self.human_ids(members) if uid not in skip),
            "room-upsert",
            {"room": wire},
        )
        return wire

    async def poll(self, ack_ids: object) -> dict[str, Any]:
        ids = [
            parsed
            for value in (ack_ids if isinstance(ack_ids, list) else [])
            if (parsed := parse_uuid(value)) is not None
        ]
        await self.events.ack(self.user_id, ids)
        pending = await self.events.list_pending(self.user_id)
        return {
            "events": [
                {"id": str(event.id), "kind": event.kind, **event.payload}
                for event in pending
            ]
        }

    # rooms

    async def membership(
        self, room_id: object
    ) -> tuple[DesktopShareRoom, Sequence[DesktopShareRoomMember]] | None:
        """The live room and its members when the caller is a human member."""
        parsed = parse_uuid(room_id)
        if parsed is None:
            return None
        room = await self.rooms.get_live(parsed)
        if room is None:
            return None
        members = await self.members.list_for_room(room.id)
        if self.user_id not in self.human_ids(members):
            return None
        return room, members

    async def add_human(
        self, room: DesktopShareRoom, user: User
    ) -> DesktopShareRoomMember:
        member = DesktopShareRoomMember(
            room_id=room.id,
            user_id=user.id,
            kind="human",
            agent_id=None,
            display_name=display_name_of(user),
            avatar_data_url=avatar_of(user),
        )
        await self.members.create(member, flush=True)
        return member

    async def upsert_agent(
        self,
        room: DesktopShareRoom,
        members: Sequence[DesktopShareRoomMember],
        agent: dict[str, Any],
    ) -> DesktopShareRoomMember | None:
        agent_id = agent.get("agentId")
        if not isinstance(agent_id, str) or not agent_id.strip():
            return None
        agent_id = agent_id.strip()[:NAME_MAX]
        name = clamp_name(agent.get("agentName") or agent.get("name"), "Agent")
        avatar = agent.get("avatarDataUrl")
        existing = next(
            (
                m
                for m in members
                if m.kind == "agent"
                and m.user_id == self.user_id
                and m.agent_id == agent_id
            ),
            None,
        )
        if existing is not None:
            existing.display_name = name
            if is_data_url(avatar):
                existing.avatar_data_url = avatar
            await self.session.flush()
            return existing
        member = DesktopShareRoomMember(
            room_id=room.id,
            user_id=self.user_id,
            kind="agent",
            agent_id=agent_id,
            display_name=name,
            avatar_data_url=avatar if is_data_url(avatar) else None,
        )
        await self.members.create(member, flush=True)
        return member

    async def create_room(
        self, name: object, agents: Sequence[dict[str, Any]], avatar: object = None
    ) -> DesktopShareRoom:
        room = DesktopShareRoom(
            name=clamp_name(name, "Shared room"),
            host_user_id=self.user_id,
            avatar_data_url=avatar if is_data_url(avatar) else None,
        )
        await self.rooms.create(room, flush=True)
        await self.add_human(room, self.user)
        for agent in agents:
            await self.upsert_agent(room, [], agent)
        log.info(
            "desktop.sharing.room_created", room_id=str(room.id), agents=len(agents)
        )
        return room

    async def invite_answer(self, room: DesktopShareRoom) -> dict[str, Any]:
        share_url, _token, expires_at = mint_invite(room)
        return {
            "shareUrl": share_url,
            "expiresAtMs": to_ms(expires_at),
            "room": await self.room_wire(room),
        }

    async def from_agent(self, body: dict[str, Any]) -> dict[str, Any] | None:
        agent_id = body.get("agentId")
        if not isinstance(agent_id, str) or not agent_id.strip():
            return None
        agent = {
            "agentId": agent_id,
            "agentName": body.get("agentName"),
            "avatarDataUrl": body.get("avatarDataUrl"),
        }
        room = await self.create_room(
            clamp_name(body.get("agentName"), "Shared room"),
            [agent],
            body.get("avatarDataUrl"),
        )
        return await self.invite_answer(room)

    async def create(self, body: dict[str, Any]) -> dict[str, Any]:
        raw = body.get("agents")
        agents = (
            [a for a in raw if isinstance(a, dict)] if isinstance(raw, list) else []
        )
        room = await self.create_room(
            body.get("name"), agents, body.get("avatarDataUrl")
        )
        return {"status": "created", "room": await self.room_wire(room)}

    async def invite_link(self, body: dict[str, Any]) -> dict[str, Any] | None:
        found = await self.membership(body.get("roomId"))
        if found is None or found[0].host_user_id != self.user_id:
            return None
        return await self.invite_answer(found[0])

    async def join_rate_limited(self) -> bool:
        key = f"sand:share:join:{self.user_id}"
        count = await self.redis.incr(key)
        if count == 1:
            await self.redis.expire(key, 60)
        return count > settings.DESKTOP_SHARE_JOINS_PER_MINUTE

    async def join(self, body: dict[str, Any]) -> dict[str, Any]:
        if await self.join_rate_limited():
            log.info("desktop.sharing.join_rate_limited", user_id=self.auth_id)
            return {"status": "rate-limited"}
        room_id = parse_invite(body.get("link"))
        room = await self.rooms.get_live(room_id) if room_id is not None else None
        if room is None:
            log.info("desktop.sharing.join_invalid", user_id=self.auth_id)
            return {"status": "invalid"}
        members = await self.members.list_for_room(room.id)
        if self.user_id in self.human_ids(members):
            return {"status": "already-member", "room": await self.room_wire(room)}
        latest = await self.requests.get_latest(room.id, self.user_id)
        if latest is not None and latest.status == "pending":
            return {"status": "pending", "roomName": room.name}
        if latest is not None and latest.status == "denied":
            return {"status": "denied"}
        request = DesktopShareJoinRequest(
            room_id=room.id, requester_user_id=self.user_id, status="pending"
        )
        await self.requests.create(request, flush=True)
        await self.emit(
            [room.host_user_id],
            "room-join-request",
            {"request": self.request_wire(request, room)},
        )
        log.info(
            "desktop.sharing.join_requested", room_id=str(room.id), user_id=self.auth_id
        )
        return {"status": "pending", "roomName": room.name}

    def request_wire(
        self,
        request: DesktopShareJoinRequest,
        room: DesktopShareRoom,
        requester: User | None = None,
    ) -> dict[str, Any]:
        person = requester or self.user
        wire: dict[str, Any] = {
            "requestId": str(request.id),
            "roomId": str(room.id),
            "roomName": room.name,
            "requesterAuthId": str(request.requester_user_id),
            "requesterName": display_name_of(person),
            "createdAtMs": to_ms(request.created_at),
        }
        if avatar_of(person):
            wire["requesterAvatarUrl"] = avatar_of(person)
        return wire

    async def respond(self, body: dict[str, Any]) -> dict[str, Any] | None:
        request_id = parse_uuid(body.get("requestId"))
        if request_id is None:
            return None
        request = await self.session.get(DesktopShareJoinRequest, request_id)
        if request is None or request.status != "pending":
            return None
        room = await self.rooms.get_live(request.room_id)
        if room is None or room.host_user_id != self.user_id:
            return None
        approved = (
            body.get("isApproved") is True
            or body.get("decision") in ("approve", "approved")
            or body.get("approve") is True
        )
        request.status = "approved" if approved else "denied"
        request.decided_at = utc_now()
        await self.session.flush()
        if not approved:
            await self.emit(
                [request.requester_user_id],
                "room-join-decision",
                {"isApproved": False, "roomId": str(room.id)},
            )
            log.info("desktop.sharing.join_denied", room_id=str(room.id))
            return {"status": "denied"}
        requester = await self.session.get(User, request.requester_user_id)
        if requester is None:
            return None
        members = await self.members.list_for_room(room.id)
        if requester.id not in self.human_ids(members):
            await self.add_human(room, requester)
        wire = await self.room_wire(room)
        await self.emit(
            [requester.id], "room-join-decision", {"isApproved": True, "room": wire}
        )
        await self.emit_room_upsert(room, exclude=[requester.id])
        log.info("desktop.sharing.join_approved", room_id=str(room.id))
        return {"status": "approved", "room": wire}

    async def add_agent(self, body: dict[str, Any]) -> dict[str, Any] | None:
        found = await self.membership(body.get("roomId"))
        if found is None:
            return None
        room, members = found
        if await self.upsert_agent(room, members, body) is None:
            return None
        return {"room": await self.emit_room_upsert(room)}

    async def remove_agent(self, body: dict[str, Any]) -> dict[str, Any] | None:
        found = await self.membership(body.get("roomId"))
        if found is None:
            return None
        room, members = found
        agent_id = body.get("agentId")
        gone = [
            m.id
            for m in members
            if m.kind == "agent"
            and m.user_id == self.user_id
            and m.agent_id == agent_id
        ]
        await self.members.delete_rows(gone)
        await self.session.flush()
        return {"room": await self.emit_room_upsert(room)}

    async def remove_deleted_agent(self, body: dict[str, Any]) -> dict[str, Any]:
        agent_id = body.get("agentId")
        rooms: list[dict[str, Any]] = []
        if isinstance(agent_id, str) and agent_id:
            rows = await self.members.list_agent_rooms(self.user_id, agent_id)
            room_ids = {row.room_id for row in rows}
            await self.members.delete_rows([row.id for row in rows])
            await self.session.flush()
            for room_id in room_ids:
                room = await self.rooms.get_live(room_id)
                if room is not None:
                    rooms.append(await self.emit_room_upsert(room))
        return {"rooms": rooms}

    async def set_picture(self, body: dict[str, Any]) -> dict[str, Any] | None:
        found = await self.membership(body.get("roomId"))
        if found is None or found[0].host_user_id != self.user_id:
            return None
        room = found[0]
        avatar = body.get("avatarDataUrl")
        if not is_data_url(avatar):
            return None
        room.avatar_data_url = avatar
        await self.session.flush()
        return {"room": await self.emit_room_upsert(room)}

    async def leave(self, body: dict[str, Any]) -> dict[str, Any] | None:
        found = await self.membership(body.get("roomId"))
        if found is None:
            return None
        room, members = found
        target = (
            parse_uuid(body.get("targetAuthId"))
            if body.get("targetAuthId") is not None
            else None
        )
        if target is not None and target != self.user_id:
            # The host removes someone.
            if room.host_user_id != self.user_id:
                return None
            await self.members.delete_rows(
                [m.id for m in members if m.user_id == target]
            )
            await self.session.flush()
            await self.emit(
                [target], "member-left", {"roomId": str(room.id), "authId": str(target)}
            )
            await self.emit_room_upsert(room, exclude=[target])
            log.info("desktop.sharing.member_removed", room_id=str(room.id))
            return {}
        if room.host_user_id == self.user_id:
            others = self.human_ids(members) - {self.user_id}
            room.ended_at = utc_now()
            await self.members.delete_for_room(room.id)
            await self.session.flush()
            await self.emit(others, "room-ended", {"roomId": str(room.id)})
            log.info("desktop.sharing.room_ended", room_id=str(room.id))
            return {}
        await self.members.delete_rows(
            [m.id for m in members if m.user_id == self.user_id]
        )
        await self.session.flush()
        await self.emit_room_upsert(room)
        log.info("desktop.sharing.member_left", room_id=str(room.id))
        return {}

    async def share_state(self) -> dict[str, Any]:
        rooms = [
            await self.room_wire(room)
            for room in await self.rooms.list_live_for_user(self.user_id)
        ]
        pending: list[dict[str, Any]] = []
        for request, room in await self.requests.list_pending_for_host(self.user_id):
            requester = await self.session.get(User, request.requester_user_id)
            if requester is not None:
                pending.append(self.request_wire(request, room, requester))
        return {"pendingJoinRequests": pending, "rooms": rooms}

    # /sand/xuser/send

    async def send(self, body: dict[str, Any]) -> dict[str, Any] | None:
        kind = body.get("kind")
        found = await self.membership(body.get("roomId"))
        if found is None:
            return None
        room, members = found
        others = self.human_ids(members) - {self.user_id}
        room_id = str(room.id)
        if kind == "room-entry":
            entry = body.get("entry")
            if not isinstance(entry, dict) or len(str(entry)) > ENTRY_MAX_BYTES:
                return None
            stamped = self.stamp_entry(entry)
            if stamped is None:
                return None
            await self.emit(others, "room-entry", {"roomId": room_id, "entry": stamped})
            return {"timestampMs": stamped["timestampMs"]}
        if kind == "room-typing":
            is_typing = body.get("isTyping") is True
            key = f"sand:share:typing:{room_id}:{self.user_id}"
            if is_typing:
                await self.redis.set(key, "1", ex=TYPING_TTL_SECONDS)
            else:
                await self.redis.delete(key)
            user: dict[str, Any] = {
                "roomId": room_id,
                "authId": self.auth_id,
                "name": display_name_of(self.user),
                "expiresAtMs": now_ms() + TYPING_TTL_SECONDS * 1000,
            }
            if avatar_of(self.user):
                user["avatarUrl"] = avatar_of(self.user)
            await self.emit(
                others,
                "room-typing",
                {"roomId": room_id, "isTyping": is_typing, "user": user},
            )
            return {"timestampMs": now_ms()}
        if kind == "turn-request":
            if room.host_user_id != self.user_id:
                return None
            owner = parse_uuid(body.get("ownerAuthId"))
            agent_id = body.get("agentId")
            nonce = body.get("turnNonce")
            if (
                owner is None
                or not isinstance(agent_id, str)
                or not isinstance(nonce, str)
                or not nonce
            ):
                return None
            if not any(
                m.kind == "agent" and m.user_id == owner and m.agent_id == agent_id
                for m in members
            ):
                return None
            await self.redis.set(
                f"sand:share:turn:{nonce}", self.auth_id, ex=TURN_NONCE_TTL_SECONDS
            )
            peers = body.get("peers")
            new_messages = body.get("newMessages")
            await self.emit(
                [owner],
                "turn-request",
                {
                    "roomId": room_id,
                    "turnNonce": nonce,
                    "agentId": agent_id,
                    "hostAuthId": self.auth_id,
                    "groupName": clamp_name(body.get("groupName"), room.name),
                    "groupDescription": body.get("groupDescription")
                    if isinstance(body.get("groupDescription"), str)
                    else "",
                    "peers": [p for p in peers if isinstance(p, dict)][:PEERS_MAX]
                    if isinstance(peers, list)
                    else [],
                    "newMessages": [m for m in new_messages if isinstance(m, dict)][
                        :TURN_MESSAGES_MAX
                    ]
                    if isinstance(new_messages, list)
                    else [],
                },
            )
            log.info(
                "desktop.sharing.turn_requested", room_id=room_id, agent_id=agent_id
            )
            return {"timestampMs": now_ms()}
        if kind == "turn-result":
            nonce = body.get("turnNonce")
            agent_id = body.get("agentId")
            if not isinstance(nonce, str) or not nonce or not isinstance(agent_id, str):
                return None
            if not any(
                m.kind == "agent"
                and m.user_id == self.user_id
                and m.agent_id == agent_id
                for m in members
            ):
                return None
            asked = await self.redis.get(f"sand:share:turn:{nonce}")
            if isinstance(asked, bytes):
                asked = asked.decode("utf-8", "replace")
            requester = parse_uuid(asked) or room.host_user_id
            messages = body.get("messages")
            await self.emit(
                [requester],
                "turn-result",
                {
                    "roomId": room_id,
                    "turnNonce": nonce,
                    "agentId": agent_id,
                    "messages": [m for m in messages if isinstance(m, str)][:2]
                    if isinstance(messages, list)
                    else [],
                },
            )
            log.info(
                "desktop.sharing.turn_answered", room_id=room_id, agent_id=agent_id
            )
            return {"timestampMs": now_ms()}
        return None

    def stamp_entry(self, entry: dict[str, Any]) -> dict[str, Any] | None:
        """The mirror entry the other members read: the sender's identity
        replaces whatever author the wire claimed, and the relay's clock
        is the timestamp the sender restamps its own copy with."""
        kind = entry.get("kind")
        entry_id = entry.get("entryId")
        if not isinstance(entry_id, str) or not entry_id:
            return None
        text = entry.get("text") if isinstance(entry.get("text"), str) else ""
        raw_images = entry.get("images")
        images: list[Any] = raw_images[:4] if isinstance(raw_images, list) else []
        stamped: dict[str, Any] = {
            "entryId": entry_id,
            "text": text,
            "images": images,
            "timestampMs": now_ms(),
        }
        if kind == "human-message":
            stamped.update(
                kind="human-message",
                authorAuthId=self.auth_id,
                authorName=display_name_of(self.user),
            )
            if avatar_of(self.user):
                stamped["authorAvatarUrl"] = avatar_of(self.user)
            if isinstance(entry.get("clientNonce"), str) and entry["clientNonce"]:
                stamped["clientNonce"] = entry["clientNonce"]
            return stamped
        if kind == "agent-message":
            agent_id = entry.get("agentId")
            if not isinstance(agent_id, str) or not agent_id:
                return None
            stamped.update(
                kind="agent-message",
                agentOwnerAuthId=self.auth_id,
                agentId=agent_id,
                authorName=clamp_name(entry.get("authorName"), "Agent"),
            )
            return stamped
        return None
