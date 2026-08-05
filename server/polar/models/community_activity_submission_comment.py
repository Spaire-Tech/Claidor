from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.community_activity_submission import (
        CommunityActivitySubmission,
    )
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.user import User


class CommunityActivitySubmissionComment(RecordModel):
    """A comment thread under a CommunityActivitySubmission.

    Mirrors the dual-author pattern used by CommunityPost — the author
    is either a CourseEnrollment (student, including the submission's
    owner) or a User (instructor/host). CHECK constraint enforces
    exactly one is set."""

    __tablename__ = "community_activity_submission_comments"
    __table_args__ = (
        CheckConstraint(
            "(author_enrollment_id IS NOT NULL)::int "
            "+ (author_user_id IS NOT NULL)::int = 1",
            name="community_activity_submission_comments_author_check",
        ),
    )

    submission_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey(
            "community_activity_submissions.id", ondelete="cascade"
        ),
        nullable=False,
        index=True,
    )

    # Exactly one of these is set (CHECK constraint above).
    author_enrollment_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("course_enrollments.id", ondelete="set null"),
        nullable=True,
    )
    author_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="set null"),
        nullable=True,
    )

    body: Mapped[str] = mapped_column(Text, nullable=False)

    @declared_attr
    def submission(cls) -> Mapped["CommunityActivitySubmission"]:
        return relationship("CommunityActivitySubmission", lazy="raise")

    @declared_attr
    def author_enrollment(cls) -> Mapped["CourseEnrollment | None"]:
        return relationship("CourseEnrollment", lazy="raise")

    @declared_attr
    def author_user(cls) -> Mapped["User | None"]:
        return relationship("User", lazy="raise")
