from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course import Course
    from polar.models.customer import Customer


class CourseAssistantQuestion(RecordModel):
    """A single question a student asked a course's live assistant.

    Append-only log (Phase 5, "What students are asking"). One row per ask,
    written best-effort from a background task *after* the answer has streamed,
    so logging can never degrade or break the student answer path. Creator
    preview/draft asks are intentionally NOT logged here.

    The creator-facing insight surface groups these by ``question_normalized``
    to merge trivially-different phrasings, counts occurrences and distinct
    askers, and surfaces how many couldn't be answered (``outcome='refused'``)
    — the strongest signal of a gap in the course content.
    """

    __tablename__ = "course_assistant_questions"

    course_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    # The student who asked. Set null on customer deletion so the question
    # (and its aggregate) survives — we still want the demand signal.
    customer_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("customers.id", ondelete="set null"),
        nullable=True,
        index=True,
        default=None,
    )

    # The question as the student typed it.
    question: Mapped[str] = mapped_column(Text, nullable=False)
    # Lowercased / whitespace-collapsed / punctuation-stripped grouping key,
    # truncated for index friendliness. Used only for GROUP BY, never shown.
    question_normalized: Mapped[str] = mapped_column(
        String(500), nullable=False, index=True
    )

    # answered | refused | error
    outcome: Mapped[str] = mapped_column(
        String(16), nullable=False, default="answered", server_default="answered"
    )

    @declared_attr
    def course(cls) -> Mapped["Course"]:
        return relationship("Course", lazy="raise")

    @declared_attr
    def customer(cls) -> Mapped["Customer | None"]:
        return relationship("Customer", lazy="raise")
