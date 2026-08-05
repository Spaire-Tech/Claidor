from enum import StrEnum
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSequenceStatus(StrEnum):
    draft = "draft"
    active = "active"
    paused = "paused"


class EmailSequenceTriggerType(StrEnum):
    on_subscribe = "on_subscribe"
    on_purchase = "on_purchase"
    on_subscription_created = "on_subscription_created"
    on_subscription_cancelled = "on_subscription_cancelled"
    on_form_submit = "on_form_submit"
    # Enters a subscriber when they complete the lesson the sequence is scoped
    # to (lesson_id). Used by the per-lesson automations built from the lesson
    # editor — their trigger is always "completes this lesson".
    on_lesson_completed = "on_lesson_completed"
    # Course-lifecycle entry triggers. Scoped to the sequence's course_id; the
    # course module fires enrolment when the student crosses each milestone.
    on_first_lesson_completed = "on_first_lesson_completed"
    on_course_progress_halfway = "on_course_progress_halfway"
    on_course_completed = "on_course_completed"
    # Enters a student who has had no course activity for trigger_config's
    # `inactive_days`; a daily scan enqueues the enrolment.
    on_inactivity = "on_inactivity"
    manual = "manual"


class EmailSequence(RecordModel):
    __tablename__ = "email_sequences"
    __table_args__ = (
        Index("ix_email_sequences_organization_id_status", "organization_id", "status"),
        Index("ix_email_sequences_course_id", "course_id"),
        Index("ix_email_sequences_lesson_id", "lesson_id"),
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    trigger_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default=EmailSequenceTriggerType.manual
    )
    # e.g. { "product_id": "..." } for on_purchase filter
    trigger_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EmailSequenceStatus.draft
    )
    # Optional links so a sequence can be scoped to a specific course or lesson.
    # When set, the Automations panel on the course/lesson surface lists this sequence.
    course_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    lesson_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("course_lessons.id", ondelete="set null"),
        nullable=True,
        default=None,
    )

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Organization", lazy="raise")
