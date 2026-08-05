from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Text, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.community_post import CommunityPost
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.user import User


class CommunityComment(RecordModel):
    """Reply on a community post.

    Forked from lesson_comments (see
    docs/plans/community-feed-decision-comments-table.md). Adds:
      - author union (enrollment | user) so creators can reply
      - timestamp_seconds for video-post replies, clustered on the scrubber
    """

    __tablename__ = "community_comments"
    __table_args__ = (
        CheckConstraint(
            "(author_enrollment_id IS NOT NULL)::int "
            "+ (author_user_id IS NOT NULL)::int = 1",
            name="community_comments_author_exactly_one_check",
        ),
        CheckConstraint(
            "timestamp_seconds IS NULL OR timestamp_seconds >= 0",
            name="community_comments_timestamp_seconds_check",
        ),
    )

    post_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("community_posts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    parent_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("community_comments.id", ondelete="cascade"),
        nullable=True,
        default=None,
    )

    # Exactly one of the next two is non-null (CHECK constraint above).
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

    content: Mapped[str] = mapped_column(Text, nullable=False)

    # For replies pinned to a moment in a video post. Null on all other
    # replies. Clipped to the media duration in the service.
    timestamp_seconds: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )

    @declared_attr
    def post(cls) -> Mapped["CommunityPost"]:
        return relationship("CommunityPost", lazy="raise", back_populates="comments")

    @declared_attr
    def author_enrollment(cls) -> Mapped["CourseEnrollment | None"]:
        return relationship("CourseEnrollment", lazy="raise")

    @declared_attr
    def author_user(cls) -> Mapped["User | None"]:
        return relationship("User", lazy="raise")
