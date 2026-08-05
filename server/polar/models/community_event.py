from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
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


COMMUNITY_EVENT_TYPES = ("workshop", "office", "cohort", "guest")
COMMUNITY_EVENT_REPLAY_NAG_STATES = (
    "pending",
    "t2h_sent",
    "t24h_sent",
    "done",
    "skipped",
)


class CommunityEvent(RecordModel):
    """A scheduled community event for a course.

    Hosting is link-only for v1 — meeting_url points at Zoom/Meet/Calendly/etc.
    `live` and `past` are derived (start_at + duration_minutes vs now), not
    stored. RSVP'd attendance is tracked in community_event_rsvp."""

    __tablename__ = "community_events"
    __table_args__ = (
        CheckConstraint(
            "type IN ('workshop', 'office', 'cohort', 'guest')",
            name="community_events_type_check",
        ),
        CheckConstraint(
            "replay_nag_state IN ('pending', 't2h_sent', 't24h_sent', 'done', 'skipped')",
            name="community_events_replay_nag_state_check",
        ),
        CheckConstraint(
            "duration_minutes > 0",
            name="community_events_duration_positive_check",
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

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    start_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, index=True
    )
    # IANA timezone the host picked, e.g. "America/Los_Angeles". start_at
    # is canonical UTC; this is the host's preferred display zone so
    # the card can show "8pm PT (your time: 11pm)".
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="UTC"
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)

    meeting_url: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    location: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    replay_url: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    cover_object_position: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )

    recurring_weekly: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    notify_on_publish: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # Denormalized counter; service maintains it on rsvp/unrsvp.
    rsvp_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Replay-nag lifecycle. Transitions:
    #   pending -> t2h_sent -> t24h_sent -> done|skipped
    # `done` = host pasted a replay_url; `skipped` = explicit dismissal.
    replay_nag_state: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )

    @declared_attr
    def course(cls) -> Mapped["Course"]:
        return relationship("Course", lazy="raise")

    @declared_attr
    def host_user(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")
