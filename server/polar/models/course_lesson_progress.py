from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.course_lesson import CourseLesson


class CourseLessonProgress(RecordModel):
    __tablename__ = "course_lesson_progress"
    __table_args__ = (
        UniqueConstraint("enrollment_id", "lesson_id"),
    )

    enrollment_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("course_enrollments.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    lesson_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("course_lessons.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    completed_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
    )

    @declared_attr
    def enrollment(cls) -> Mapped["CourseEnrollment"]:
        return relationship("CourseEnrollment", lazy="raise")

    @declared_attr
    def lesson(cls) -> Mapped["CourseLesson"]:
        return relationship("CourseLesson", lazy="raise")
