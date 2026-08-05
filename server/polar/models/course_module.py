from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course import Course
    from polar.models.course_lesson import CourseLesson


class CourseModule(RecordModel):
    __tablename__ = "course_modules"

    course_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)

    description: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")

    # DateTime(timezone=True) → Postgres timestamptz, same as the column the
    # migration created; matches course_lesson.release_at and the rest of the
    # models (RecordModel uses DateTime), so the two drip columns line up.
    release_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    drip_days: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)

    # Bonus section — its lessons render in the portal's "Bonus Content"
    # rail (own section at the bottom, like Trailers), sit outside the
    # course's lesson numbering, and don't count toward completion.
    is_bonus: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    @declared_attr
    def course(cls) -> Mapped["Course"]:
        return relationship("Course", lazy="raise", back_populates="modules")

    @declared_attr
    def lessons(cls) -> Mapped[list["CourseLesson"]]:
        # Hide soft-deleted lessons from the relationship. The customer
        # portal walks course.modules[*].lessons, so without this filter a
        # soft-deleted lesson would still appear to enrolled students.
        return relationship(
            "CourseLesson",
            lazy="selectin",
            order_by="CourseLesson.position",
            cascade="all, delete-orphan",
            back_populates="module",
            primaryjoin=(
                "and_(CourseModule.id == CourseLesson.module_id, "
                "CourseLesson.deleted_at.is_(None))"
            ),
        )
