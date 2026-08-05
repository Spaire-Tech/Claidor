from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSequenceStepSendStatus(StrEnum):
    pending = "pending"
    sent = "sent"
    delivered = "delivered"
    opened = "opened"
    clicked = "clicked"
    bounced = "bounced"
    failed = "failed"


class EmailSequenceStepSend(RecordModel):
    __tablename__ = "email_sequence_step_sends"
    __table_args__ = (
        Index(
            "ix_email_sequence_step_sends_resend_email_id",
            "resend_email_id",
        ),
        Index(
            "ix_email_sequence_step_sends_enrollment_id",
            "enrollment_id",
        ),
    )

    enrollment_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_sequence_enrollments.id", ondelete="cascade"),
        nullable=False,
    )
    step_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_sequence_steps.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    subscriber_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_subscribers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    # Resend email ID for webhook event matching
    resend_email_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EmailSequenceStepSendStatus.pending
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

    @declared_attr
    def enrollment(cls) -> Mapped["EmailSequenceEnrollment"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSequenceEnrollment", lazy="raise")

    @declared_attr
    def step(cls) -> Mapped["EmailSequenceStep"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSequenceStep", lazy="raise")

    @declared_attr
    def subscriber(cls) -> Mapped["EmailSubscriber"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSubscriber", lazy="raise")
