"""Queries behind the sharing relay (`polar/sand/sharing.py`)."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select

from polar.kit.repository import RepositoryBase
from polar.models import (
    DesktopShareEvent,
    DesktopShareJoinRequest,
    DesktopShareRoom,
    DesktopShareRoomMember,
)

#: The most events one poll answers; the rest come on the next tick.
POLL_BATCH = 200


class ShareRoomRepository(RepositoryBase[DesktopShareRoom]):
    model = DesktopShareRoom

    async def get_live(self, room_id: UUID) -> DesktopShareRoom | None:
        statement = self.get_base_statement().where(
            DesktopShareRoom.id == room_id, DesktopShareRoom.ended_at.is_(None)
        )
        return await self.get_one_or_none(statement)

    async def list_live_for_user(self, user_id: UUID) -> Sequence[DesktopShareRoom]:
        """Every room the person is a human member of, oldest first."""
        statement = (
            self.get_base_statement()
            .where(
                DesktopShareRoom.ended_at.is_(None),
                DesktopShareRoom.id.in_(
                    select(DesktopShareRoomMember.room_id).where(
                        DesktopShareRoomMember.user_id == user_id,
                        DesktopShareRoomMember.kind == "human",
                    )
                ),
            )
            .order_by(DesktopShareRoom.created_at)
        )
        return await self.get_all(statement)


class ShareMemberRepository(RepositoryBase[DesktopShareRoomMember]):
    model = DesktopShareRoomMember

    async def list_for_room(self, room_id: UUID) -> Sequence[DesktopShareRoomMember]:
        statement = (
            self.get_base_statement()
            .where(DesktopShareRoomMember.room_id == room_id)
            .order_by(DesktopShareRoomMember.created_at)
        )
        return await self.get_all(statement)

    async def list_agent_rooms(
        self, user_id: UUID, agent_id: str
    ) -> Sequence[DesktopShareRoomMember]:
        statement = self.get_base_statement().where(
            DesktopShareRoomMember.user_id == user_id,
            DesktopShareRoomMember.kind == "agent",
            DesktopShareRoomMember.agent_id == agent_id,
        )
        return await self.get_all(statement)

    async def delete_rows(self, ids: Sequence[UUID]) -> None:
        if not ids:
            return
        await self.session.execute(
            delete(DesktopShareRoomMember).where(DesktopShareRoomMember.id.in_(ids))
        )

    async def delete_for_room(self, room_id: UUID) -> None:
        await self.session.execute(
            delete(DesktopShareRoomMember).where(
                DesktopShareRoomMember.room_id == room_id
            )
        )


class ShareJoinRequestRepository(RepositoryBase[DesktopShareJoinRequest]):
    model = DesktopShareJoinRequest

    async def get_latest(
        self, room_id: UUID, requester_user_id: UUID
    ) -> DesktopShareJoinRequest | None:
        statement = (
            self.get_base_statement()
            .where(
                DesktopShareJoinRequest.room_id == room_id,
                DesktopShareJoinRequest.requester_user_id == requester_user_id,
            )
            .order_by(DesktopShareJoinRequest.created_at.desc())
            .limit(1)
        )
        return await self.get_one_or_none(statement)

    async def list_pending_for_host(
        self, host_user_id: UUID
    ) -> Sequence[tuple[DesktopShareJoinRequest, DesktopShareRoom]]:
        statement = (
            select(DesktopShareJoinRequest, DesktopShareRoom)
            .join(
                DesktopShareRoom, DesktopShareRoom.id == DesktopShareJoinRequest.room_id
            )
            .where(
                DesktopShareRoom.host_user_id == host_user_id,
                DesktopShareRoom.ended_at.is_(None),
                DesktopShareJoinRequest.status == "pending",
            )
            .order_by(DesktopShareJoinRequest.created_at)
        )
        result = await self.session.execute(statement)
        return [(request, room) for request, room in result.all()]


class ShareEventRepository(RepositoryBase[DesktopShareEvent]):
    model = DesktopShareEvent

    async def enqueue(self, user_id: UUID, kind: str, payload: dict[str, Any]) -> None:
        await self.create(
            DesktopShareEvent(user_id=user_id, kind=kind, payload=payload)
        )

    async def ack(self, user_id: UUID, ids: Sequence[UUID]) -> None:
        if not ids:
            return
        await self.session.execute(
            delete(DesktopShareEvent).where(
                DesktopShareEvent.user_id == user_id, DesktopShareEvent.id.in_(ids)
            )
        )

    async def list_pending(self, user_id: UUID) -> Sequence[DesktopShareEvent]:
        statement = (
            self.get_base_statement()
            .where(DesktopShareEvent.user_id == user_id)
            .order_by(DesktopShareEvent.seq)
            .limit(POLL_BATCH)
        )
        return await self.get_all(statement)
