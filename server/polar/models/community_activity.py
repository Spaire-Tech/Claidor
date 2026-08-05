from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course import Course
    from polar.models.user import User


COMMUNITY_ACTIVITY_SUBMISSION_TYPES = ("photo", "video", "text", "link")
COMMUNITY_ACTIVITY_STATUSES = ("open", "closed")
COMMUNITY_ACTIVITY_CHANNEL_KINDS = ("module", "lesson")


class CommunityActivity(RecordModel):
    """A host-created prompt that students submit to.

    channel_kind discriminates which FK (module_id vs lesson_id) is
    populated — the editor uses 'module' for course-format courses and
    'lesson' for series. Channel is required; activities are always tied
    to a specific module/episode.

    `pinned_post_id` is set when the host enables `pin_to_feed`: we
    create a synthetic community_post (pin_type='activity') and stash
    its id here. Toggling the activity off (or closing it) cascades to
    unpinning the post."""

    __tablename__ = "community_activities"
    __table_args__ = (
        CheckConstraint(
            "submission_type IN ('photo', 'video', 'text', 'link')",
            name="community_activities_submission_type_check",
        ),
        CheckConstraint(
            "status IN ('open', 'closed')",
            name="community_activities_status_check",
        ),
        CheckConstraint(
            "channel_kind IN ('module', 'lesson')",
            name="community_activities_channel_kind_check",
        ),
        CheckConstraint(
            "(module_id IS NOT NULL)::int + (lesson_id IS NOT NULL)::int = 1",
            name="community_activities_channel_exactly_one_check",
        ),
    )

    course_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    host_user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="cascade"),
        nullable=False,
    )

    channel_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    module_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("course_modules.id", ondelete="set null"),
        nullable=True,
    )
    lesson_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("course_lessons.id", ondelete="set null"),
        nullable=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    cover_object_position: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )

    submission_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open"
    )

    pin_to_feed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    notify_on_publish: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # FK to the synthetic community_posts row created when pin_to_feed is
    # true. Soft-link — if the post is deleted, the activity stays and
    # we can re-pin later.
    pinned_post_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("community_posts.id", ondelete="set null"),
        nullable=True,
        default=None,
    )

    # Maintained by the service on submission create/delete.
    submission_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )

    @declared_attr
    def course(cls) -> Mapped["Course"]:
        return relationship("Course", lazy="raise")

    @declared_attr
    def host_user(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")


_ = (datetime, "CommunityPost")  # forward-ref placeholders
