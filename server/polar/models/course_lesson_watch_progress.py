from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import TIMESTAMP, Float, ForeignKey, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.course_lesson import CourseLesson


class CourseLessonWatchProgress(RecordModel):
    """Partial (in-progress) watch position for a video lesson.

    CourseLessonProgress records only *completed* lessons; this table
    records where a student currently is inside a lesson they haven't
    finished, so partial progress survives across devices and is visible
    to the instructor. One row per (enrollment, lesson), overwritten as
    the student watches.
    """

    __tablename__ = "course_lesson_watch_progress"
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

    # Last playback position as a fraction of the lesson's duration (0..1).
    # A fraction rather than seconds so it stays meaningful if the video
    # asset is replaced with a re-edited cut of slightly different length.
    fraction: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    last_watched_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
    )

    @declared_attr
    def enrollment(cls) -> Mapped["CourseEnrollment"]:
        return relationship("CourseEnrollment", lazy="raise")

    @declared_attr
    def lesson(cls) -> Mapped["CourseLesson"]:
        return relationship("CourseLesson", lazy="raise")
