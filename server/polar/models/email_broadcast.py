from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailBroadcastStatus(StrEnum):
    draft = "draft"
    pending_approval = "pending_approval"
    sending = "sending"
    sent = "sent"
    failed = "failed"
    scheduled = "scheduled"


class EmailBroadcast(RecordModel):
    __tablename__ = "email_broadcasts"

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    preview_text: Mapped[str | None] = mapped_column(
        String(150), nullable=True, default=None
    )
    sender_name: Mapped[str] = mapped_column(String(100), nullable=False)
    sender_email: Mapped[str] = mapped_column(
        String(255), nullable=False, default="noreply@notifications.spairehq.com"
    )
    reply_to_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    content_json: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    content_html: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    segment_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("email_segments.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    filter_rules: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EmailBroadcastStatus.draft
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    total_recipients: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Organization", lazy="raise")

    @declared_attr
    def segment(cls) -> Mapped["EmailSegment | None"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSegment", lazy="raise")
