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
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSequenceEnrollmentStatus(StrEnum):
    active = "active"
    completed = "completed"
    paused = "paused"
    cancelled = "cancelled"


class EmailSequenceEnrollment(RecordModel):
    __tablename__ = "email_sequence_enrollments"
    __table_args__ = (
        UniqueConstraint(
            "sequence_id",
            "subscriber_id",
            "deleted_at",
            name="email_sequence_enrollments_seq_sub_key",
        ),
        Index(
            "ix_email_sequence_enrollments_status_next_step_at",
            "status",
            "next_step_at",
        ),
    )

    sequence_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_sequences.id", ondelete="cascade"),
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
        String(20), nullable=False, default=EmailSequenceEnrollmentStatus.active
    )
    # Position of the step we're waiting to send next (0-based, matches EmailSequenceStep.position).
    # Used by the legacy email-step walker; the flow_doc walker uses flow_index.
    current_step_position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Cursor into the parent sequence's flow_doc.steps array. Populated for
    # sequences that ship an authored flow_doc (templates, anything created
    # in the new editor). Legacy sequences leave this NULL and the worker
    # falls back to the email-step walker.
    flow_index: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    # Tree cursor (Phase 3b): id of the next step to visit in the flow_doc
    # tree. Replaces flow_index for tree-shaped flows where branches carry
    # nested yes/no children — flow_index can't represent "we're inside the
    # No arm of the third branch". Legacy enrollments authored before this
    # column landed leave flow_next_step_id NULL and continue using
    # flow_index against the (now-migrated-on-load) tree.
    flow_next_step_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None, index=True
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
    # When to send the current step. The scheduler polls for rows where next_step_at <= now.
    next_step_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    @declared_attr
    def sequence(cls) -> Mapped["EmailSequence"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSequence", lazy="raise")

    @declared_attr
    def subscriber(cls) -> Mapped["EmailSubscriber"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSubscriber", lazy="raise")
