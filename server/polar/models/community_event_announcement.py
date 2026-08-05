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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.community_event import CommunityEvent
    from polar.models.course import Course
    from polar.models.user import User


COMMUNITY_EVENT_ANNOUNCEMENT_STATUSES = ("draft", "sending", "sent", "failed")


class CommunityEventAnnouncement(RecordModel):
    """A host-composed announcement sent to enrolled customers about a
    community event.

    Replaces the implicit "Notify members" auto-fire that used to
    happen on event create. The host now composes a subject + body
    (free-text), previews the email (which renders the body inside
    an EventCard chrome), and explicitly sends to every enrolled
    customer in the course. One event can have many announcements
    over its lifetime (initial publish nudge, day-before bump, etc.).

    `status` tracks the lifecycle:
      draft   — composed but not yet sent. (v1 always sends
                immediately; reserved for future "Save draft" UX.)
      sending — actor is fanning out right now.
      sent    — fan-out completed (recipient_count populated).
      failed  — fan-out errored; manual retry needed.
    """

    __tablename__ = "community_event_announcements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'sending', 'sent', 'failed')",
            name="community_event_announcements_status_check",
        ),
    )

    event_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("community_events.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    # Denormalised so the announcements list endpoint can scope by
    # course without a JOIN to community_events.
    course_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    # User (instructor / course owner) who hit "Send".
    sent_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="set null"),
        nullable=True,
    )

    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="draft"
    )
    # Set when the actor finishes fan-out. Stays null on drafts.
    sent_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    # Denormalised count of enrolled customers we attempted to
    # notify. Populated by the actor at fan-out time. Useful both for
    # the "Sent to N members" toast on the host side and for the
    # audit list under the event.
    recipient_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )

    event: Mapped["CommunityEvent"] = relationship(
        "CommunityEvent", lazy="raise"
    )
    course: Mapped["Course"] = relationship("Course", lazy="raise")
    sent_by: Mapped["User | None"] = relationship("User", lazy="raise")
