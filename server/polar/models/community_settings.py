from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course import Course


class CommunitySettings(RecordModel):
    """Per-course community configuration. One row per course, created lazily
    on first community-tab visit in the course builder."""

    __tablename__ = "community_settings"
    __table_args__ = (
        UniqueConstraint("course_id", name="community_settings_course_id_unique"),
        CheckConstraint(
            "comments_mode IN ('visible', 'hidden', 'locked')",
            name="community_settings_comments_mode_check",
        ),
        CheckConstraint(
            "watching_rail_threshold >= 1",
            name="community_settings_watching_rail_threshold_check",
        ),
        CheckConstraint(
            "who_can_post IN ('everyone', 'approved')",
            name="community_settings_who_can_post_check",
        ),
        CheckConstraint(
            "default_meeting_provider IN "
            "('zoom', 'meet', 'teams', 'webex', 'other')",
            name="community_settings_default_provider_check",
        ),
    )

    course_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="cascade"),
        nullable=False,
    )

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # When false, the Community tab is reachable by deep link but not
    # rendered in the PortalShell tab bar. Lets a creator soft-launch
    # to a cohort before exposing it course-wide.
    show_in_portal_tabs: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    comments_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, default="visible"
    )

    # Hero block on the feed home.
    hero_thumbnail_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True, default=None
    )
    hero_thumbnail_object_position: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )

    feed_title_override: Mapped[str | None] = mapped_column(
        String(120), nullable=True, default=None
    )
    feed_eyebrow_override: Mapped[str | None] = mapped_column(
        String(120), nullable=True, default=None
    )

    # Inline-rename of CourseModule.title in the community context only.
    # Shape: { "<module_uuid>": "Hydration & Dough", ... }. CourseModule.title
    # remains the source of truth everywhere else.
    module_label_overrides: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    # Persisted ordering of modules in the rail. Shape: ["<uuid>", ...].
    # Null = inherit CourseModule.position.
    module_order: Mapped[list | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    reactions_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    milestones_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    watching_rail_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Don't render "1 student watching" — feels sad. Default 3.
    watching_rail_threshold: Mapped[int] = mapped_column(
        Integer, nullable=False, default=3
    )

    # Manual override for the presence-card stat line; null = auto-computed
    # weekly from creator activity.
    presence_blurb: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )

    # Fast lookup for "what's the prompt-of-the-week" without scanning posts.
    # Not a true FK to community_posts because of circular create order —
    # the service layer enforces the post belongs to this course.
    prompt_of_week_post_id: Mapped[UUID | None] = mapped_column(
        Uuid, nullable=True, default=None
    )

    # ---- Posting & moderation (Community Hub Settings tab) ----
    # Who may start a submission or thread: everyone, or approved members only.
    who_can_post: Mapped[str] = mapped_column(
        String(20), nullable=False, default="everyone"
    )
    # Hold the first post from a new member for review before it hits the feed.
    moderate_new_members: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    # Auto-hide flagged language.
    profanity_filter: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # ---- Events ----
    # Pre-selected provider when scheduling a live moment.
    default_meeting_provider: Mapped[str] = mapped_column(
        String(20), nullable=False, default="zoom"
    )
    # Let members RSVP (and receive reminders).
    member_rsvp: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # ---- Notifications ----
    notify_new_submissions: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    notify_new_comments: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    weekly_digest: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # ---- Danger zone ----
    # Hidden from members and paused; restorable.
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    @declared_attr
    def course(cls) -> Mapped["Course"]:
        return relationship("Course", lazy="raise")
