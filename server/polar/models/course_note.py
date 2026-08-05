from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.course_lesson import CourseLesson


class CourseNote(RecordModel):
    __tablename__ = "course_notes"

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

    content: Mapped[str] = mapped_column(Text, nullable=False, default="")

    @declared_attr
    def enrollment(cls) -> Mapped["CourseEnrollment"]:
        return relationship("CourseEnrollment", lazy="selectin")

    @declared_attr
    def lesson(cls) -> Mapped["CourseLesson"]:
        return relationship("CourseLesson", lazy="raise")
