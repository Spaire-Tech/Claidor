from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.community_comment import CommunityComment
    from polar.models.community_event import CommunityEvent
    from polar.models.community_post_media import CommunityPostMedia
    from polar.models.community_tag import CommunityTag
    from polar.models.course import Course
    from polar.models.course_enrollment import CourseEnrollment
    from polar.models.course_lesson import CourseLesson
    from polar.models.user import User


class CommunityPost(RecordModel):
    """Top-level community post.

    Author is either a CourseEnrollment (student) OR a User (creator/admin),
    never both — enforced by a CHECK constraint. Pin state is stored inline
    so the feed query can sort by `coalesce(pinned_at, published_at)` without
    a join. See docs/plans/community-feed-decision-comments-table.md for why
    this isn't polymorphic with lesson_comments."""

    __tablename__ = "community_posts"
    __table_args__ = (
        CheckConstraint(
            "(author_enrollment_id IS NOT NULL)::int "
            "+ (author_user_id IS NOT NULL)::int = 1",
            name="community_posts_author_exactly_one_check",
        ),
        CheckConstraint(
            "type IN ('text', 'video')",
            name="community_posts_type_check",
        ),
        CheckConstraint(
            "body_format IN ('markdown', 'plain')",
            name="community_posts_body_format_check",
        ),
        CheckConstraint(
            "comments_mode IS NULL OR comments_mode IN ('visible', 'hidden', 'locked')",
            name="community_posts_comments_mode_check",
        ),
        CheckConstraint(
            "pin_type IS NULL OR pin_type IN "
            "('announcement', 'prompt_of_week', 'activity')",
            name="community_posts_pin_type_check",
        ),
        # If pin_type is set, pinned_at must be set too — guards against
        # a half-set pin state from a bad service write.
        CheckConstraint(
            "(pin_type IS NULL) = (pinned_at IS NULL)",
            name="community_posts_pin_consistency_check",
        ),
    )

    course_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="cascade"),
        nullable=False,
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

    # 'text'  — body only (possibly with image media rows attached)
    # 'video' — has a community_post_media row of media_type='video';
    #           replies may carry timestamp_seconds for the scrubber.
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")

    # Optional title — short posts go straight into body.
    title: Mapped[str | None] = mapped_column(String(280), nullable=True, default=None)

    body: Mapped[str] = mapped_column(Text, nullable=False)

    # Tiptap RichTextEditor round-trips markdown.
    body_format: Mapped[str] = mapped_column(
        String(20), nullable=False, default="markdown"
    )

    # "re: Module 2 — Hydration" chip. Soft-link; if the lesson is deleted
    # we keep the post but the chip stops resolving.
    lesson_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("course_lessons.id", ondelete="set null"),
        nullable=True,
        default=None,
    )

    # One tag per post — see decision doc for why not M:N. Cleared on
    # tag deletion (the tag row carries a soft-delete; this is the
    # post-side cleanup).
    tag_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("community_tags.id", ondelete="set null"),
        nullable=True,
        default=None,
    )

    # Sort cursor for the feed. A draft has published_at IS NULL. The
    # creator can schedule by setting it to a future time; the feed
    # query filters published_at <= now().
    published_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    # Pin block — inline because each post has at most one pin and the
    # feed needs `coalesce(pinned_at, published_at)` as a sort key without
    # a join. The CHECK constraint above guarantees pin_type and pinned_at
    # are set together.
    pinned_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    pin_type: Mapped[str | None] = mapped_column(
        String(30), nullable=True, default=None
    )
    pin_expires_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    # Per-post override of the course-wide comments_mode. Null = inherit
    # from community_settings.comments_mode.
    comments_mode: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default=None
    )

    # Materialized counters — cheaper than count(*) on every render and
    # updated by the service on react/comment/unreact.
    reaction_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Poll attachment. Shape:
    #   { "options": [{"id": "o0", "text": "..."}],
    #     "votes":   {"o0": 3, "o1": 5},
    #     "voters":  {"u:<uuid>": "o0", "e:<uuid>": "o1"} }
    # Null when the post carries no poll. One vote per user is enforced in
    # the service via the voters map.
    poll: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    # Embedded event card — soft link to a scheduled community_event.
    event_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("community_events.id", ondelete="set null"),
        nullable=True,
        default=None,
    )

    @declared_attr
    def course(cls) -> Mapped["Course"]:
        return relationship("Course", lazy="raise")

    @declared_attr
    def event(cls) -> Mapped["CommunityEvent | None"]:
        return relationship("CommunityEvent", lazy="raise")

    @declared_attr
    def lesson(cls) -> Mapped["CourseLesson | None"]:
        return relationship("CourseLesson", lazy="raise")

    @declared_attr
    def tag(cls) -> Mapped["CommunityTag | None"]:
        return relationship("CommunityTag", lazy="selectin")

    @declared_attr
    def author_enrollment(cls) -> Mapped["CourseEnrollment | None"]:
        return relationship("CourseEnrollment", lazy="raise")

    @declared_attr
    def author_user(cls) -> Mapped["User | None"]:
        return relationship("User", lazy="raise")

    @declared_attr
    def media(cls) -> Mapped[list["CommunityPostMedia"]]:
        return relationship(
            "CommunityPostMedia",
            lazy="selectin",
            order_by="CommunityPostMedia.position",
            cascade="all, delete-orphan",
            back_populates="post",
        )

    @declared_attr
    def comments(cls) -> Mapped[list["CommunityComment"]]:
        # Lazy raise — comments are fetched via the repository with an
        # explicit query that handles soft-delete tombstones. Walking
        # post.comments naively would skip the tombstone preservation.
        return relationship(
            "CommunityComment",
            lazy="raise",
            cascade="all, delete-orphan",
            back_populates="post",
        )
