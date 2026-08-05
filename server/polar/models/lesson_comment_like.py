from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.lesson_comment import LessonComment


class LessonCommentLike(RecordModel):
    """A single heart on a lesson comment.

    One row per (comment, enrollment) — the unique constraint is the
    toggle key. POST creates the row, a second POST hard-deletes it, so a
    student can never double-like the same comment. Likes live only in the
    customer portal, so the actor is always an enrollment (no user union,
    unlike `community_reactions`)."""

    __tablename__ = "lesson_comment_likes"
    __table_args__ = (
        UniqueConstraint(
            "lesson_comment_id",
            "enrollment_id",
            name="lesson_comment_likes_comment_enrollment_unique",
        ),
    )

    lesson_comment_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("lesson_comments.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    enrollment_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("course_enrollments.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    @declared_attr
    def comment(cls) -> Mapped["LessonComment"]:
        return relationship("LessonComment", lazy="raise")

    @declared_attr
    def enrollment(cls) -> Mapped["CourseEnrollment"]:
        return relationship("CourseEnrollment", lazy="raise")
