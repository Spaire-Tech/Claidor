from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailBroadcastSendStatus(StrEnum):
    pending = "pending"
    sent = "sent"
    delivered = "delivered"
    opened = "opened"
    clicked = "clicked"
    bounced = "bounced"
    failed = "failed"


class EmailBroadcastSend(RecordModel):
    __tablename__ = "email_broadcast_sends"
    __table_args__ = (
        UniqueConstraint(
            "broadcast_id",
            "subscriber_id",
            name="email_broadcast_sends_broadcast_sub_key",
        ),
        Index(
            "ix_email_broadcast_sends_broadcast_id_status",
            "broadcast_id",
            "status",
        ),
        # Webhook lookup index — every Resend event arrives keyed on this.
        Index(
            "ix_email_broadcast_sends_resend_email_id",
            "resend_email_id",
        ),
    )

    broadcast_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_broadcasts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    subscriber_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_subscribers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EmailBroadcastSendStatus.pending
    )
    resend_email_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    opened_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    open_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    clicked_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    click_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bounced_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    unsubscribed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    clicked_links: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    last_user_agent: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )
    # 'a' / 'b' for the test slice; null means the recipient gets the
    # winner (or the only) variant — see EmailBroadcastABTest.
    variant: Mapped[str | None] = mapped_column(
        String(1), nullable=True, default=None
    )

    @declared_attr
    def broadcast(cls) -> Mapped["EmailBroadcast"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailBroadcast", lazy="raise")

    @declared_attr
    def subscriber(cls) -> Mapped["EmailSubscriber"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSubscriber", lazy="raise")
