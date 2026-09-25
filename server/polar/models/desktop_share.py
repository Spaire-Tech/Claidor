"""Sharing: a room with another person's agent (25 September 2026).

The app's cross-user sharing (`desktop/source/host/extensions/cross-user-sharing/`)
rode Cursor's `/sand/xuser` and `/sand/share-rooms` relay. These four
tables are that relay's whole state on Simeon Labs' server
(`polar/sand/sharing.py`):

- `DesktopShareRoom`: one room, its host and its picture. A host who
  leaves ends the room (`ended_at`); the row stays for the record.
- `DesktopShareRoomMember`: one row per member, human or agent. The
  `authId` the app reads is the member's user id, the JWT `sub` of the
  access-token envelope (`polar.desktop.service.envelope_access_token`),
  so a person's own agents in a room carry their owner's id.
- `DesktopShareJoinRequest`: a person who opened an invite link, waiting
  on the host. `pending`, `approved` or `denied`.
- `DesktopShareEvent`: the per-person event queue the box's host polls
  at `POST /sand/xuser/poll` and acks away by id. Delivered in `seq`
  order; an ack deletes the row.

Invite links are signed tokens (`polar.kit.jwt`, type
`desktop_share_invite`) and have no table; typing state and the
turn-request nonce live in Redis with a TTL.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    BigInteger,
    ForeignKey,
    Identity,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from polar.kit.db.models import RecordModel


class DesktopShareRoom(RecordModel):
    __tablename__ = "desktop_share_rooms"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    host_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    avatar_data_url: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    @property
    def is_ended(self) -> bool:
        return self.ended_at is not None


class DesktopShareRoomMember(RecordModel):
    __tablename__ = "desktop_share_room_members"

    room_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("desktop_share_rooms.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: "human" or "agent".
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    #: The agent's id on its owner's machine; None for a human.
    agent_id: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None
    )
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    avatar_data_url: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )


class DesktopShareJoinRequest(RecordModel):
    __tablename__ = "desktop_share_join_requests"

    room_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("desktop_share_rooms.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    requester_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: "pending", "approved" or "denied".
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    decided_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )


class DesktopShareEvent(RecordModel):
    __tablename__ = "desktop_share_events"

    #: Delivery order; the queue is read by this, never by `created_at`.
    seq: Mapped[int] = mapped_column(
        BigInteger, Identity(), nullable=False, unique=True
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    #: The event kind the app switches on (`xuser-sharing-service.ts`,
    #: `handleEvent`): room-join-request, room-join-decision, room-upsert,
    #: room-typing, room-entry, turn-request, turn-result, member-left,
    #: room-ended.
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
