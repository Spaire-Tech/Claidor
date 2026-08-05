from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.course_lesson import CourseLesson


class LessonComment(RecordModel):
    __tablename__ = "lesson_comments"

    lesson_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("course_lessons.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    enrollment_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("course_enrollments.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    parent_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("lesson_comments.id", ondelete="cascade"),
        nullable=True,
        index=True,
    )

    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Instructor moderation, YouTube-style. At most one comment per lesson
    # is pinned at a time (the service unpins siblings when pinning) and a
    # comment can carry a single creator heart. Both are set/cleared only
    # by the course's instructor.
    pinned_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    instructor_hearted_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    @declared_attr
    def enrollment(cls) -> Mapped["CourseEnrollment"]:
        return relationship("CourseEnrollment", lazy="selectin")

    @declared_attr
    def lesson(cls) -> Mapped["CourseLesson"]:
        return relationship("CourseLesson", lazy="raise")
