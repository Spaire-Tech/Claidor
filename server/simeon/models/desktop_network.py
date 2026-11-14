"""The Simeon Network (10 November 2026, the founder, with Reason Network as
the reference: "do the reason network").

People's agents ask each other for work through Simeon Labs' server: their
Simeon agents, and every agent that adds Simeon's MCP server
(`simeon.desktop.mcp`): Claude Code, Codex, Cursor on their computers, and
Dots, Muse and Grok Bot from their phones. `simeon.desktop.network` holds
the rules.

- `DesktopNetwork`: one network, its name, and the version of its invite
  link (the link is signed, `network.invite_link`; a new link raises the
  version and the old one stops working).
- `DesktopNetworkMember`: a person on a network, under the short name the
  others address them by (`maya` in `maya/claude`). A person is on one
  network at a time.
- `DesktopNetworkSession`: one agent that reached the server over MCP (a
  Claude Code session, a Dots chat…): its name, where it works and what it
  is doing, as it last said. Its id is the `Mcp-Session-Id` it sends.
- `DesktopNetworkMessage`: one message from one agent to another. A
  message for an agent on a computer waits here until it reads its inbox;
  one for a Simeon agent also goes into its person's inbox
  (`DesktopChatInbox`, `nonce`) and the agent's answer is read from its
  chat (`answered_ms`, `closed`).
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    BigInteger,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from simeon.kit.db.models import RecordModel


class DesktopNetwork(RecordModel):
    __tablename__ = "desktop_networks"

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    #: Part of the signed invite link: raised by "New link".
    invite_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True
    )


class DesktopNetworkMember(RecordModel):
    __tablename__ = "desktop_network_members"
    __table_args__ = (UniqueConstraint("network_id", "handle"),)

    network_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("desktop_networks.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    #: One network at a time.
    user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="cascade"),
        nullable=False,
        unique=True,
    )
    #: How the others address them: `maya` in `maya/claude`.
    handle: Mapped[str] = mapped_column(String(40), nullable=False)


class DesktopNetworkSession(RecordModel):
    __tablename__ = "desktop_network_sessions"
    __table_args__ = (
        Index("ix_desktop_network_sessions_user_seen", "user_id", "last_seen_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False
    )
    #: The OAuth client it signed in with (Claude Code, ChatGPT…).
    client_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    #: `claude-code`, `codex`, `cursor`, `dots`, `muse`, `grok-bot`… or `agent`.
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    #: Its address after the person's handle: `claude` in `maya/claude`.
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    machine: Mapped[str | None] = mapped_column(String(80), nullable=True)
    repo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    branch: Mapped[str | None] = mapped_column(String(120), nullable=True)
    doing: Mapped[str | None] = mapped_column(String(200), nullable=True)
    #: What the person calls this agent, when it said so (`set_status`, 14
    #: November 2026): shown in their chats in place of its product's name.
    called: Mapped[str | None] = mapped_column(String(40), nullable=True)
    busy: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )


class DesktopNetworkMessage(RecordModel):
    __tablename__ = "desktop_network_messages"
    __table_args__ = (
        Index("ix_desktop_network_messages_to_session", "to_session_id", "read_at"),
        Index("ix_desktop_network_messages_from_session", "from_session_id"),
    )

    network_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("desktop_networks.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    from_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False
    )
    from_session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("desktop_network_sessions.id", ondelete="set null"),
        nullable=True,
    )
    #: A Simeon agent that sent it (its id on its person's computer).
    from_agent_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    #: `maya/claude`, as it was when sent.
    from_address: Mapped[str] = mapped_column(String(120), nullable=False)
    to_user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    to_session_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("desktop_network_sessions.id", ondelete="cascade"),
        nullable=True,
    )
    to_agent_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    to_address: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    #: For a Simeon agent: the nonce of the message in its person's inbox,
    #: which its computer keeps on the chat line (`clientNonce`).
    nonce: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reply_to_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    #: For a Simeon agent: its answers up to this line's time were read.
    answered_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    #: For a Simeon agent: someone wrote in its chat after it answered, so
    #: nothing more is read as its answer.
    closed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
