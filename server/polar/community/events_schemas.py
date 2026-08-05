"""Pydantic schemas for community events + RSVPs.

Kept in a separate file (events_schemas.py) rather than appended to
schemas.py so the event/RSVP surface is easy to find and review."""

from datetime import datetime
from typing import Literal

from pydantic import UUID4, Field

from polar.kit.schemas import Schema, TimestampedSchema

EventType = Literal["workshop", "office", "cohort", "guest"]

# `object-position: <X>% <Y>%` only. The string is dropped straight into
# an inline style on the cover image so anything outside this shape is a
# CSS-injection footgun.
COVER_OBJECT_POSITION_PATTERN = r"^\d{1,3}(\.\d+)?%\s+\d{1,3}(\.\d+)?%$"


class CommunityEventHost(Schema):
    """Lightweight host identity. The host is always the course owner
    (an org-side User) — we surface the display name from the course's
    `instructor_name` (set in course settings) and fall back to the
    user's name/email if it's unset."""

    user_id: UUID4
    name: str
    avatar_url: str | None = None


class CommunityEventRead(TimestampedSchema):
    id: UUID4
    course_id: UUID4
    title: str
    type: EventType
    description: str | None = None
    start_at: datetime
    timezone: str = "UTC"
    duration_minutes: int
    meeting_url: str | None = None
    location: str | None = None
    cover_url: str | None = None
    cover_object_position: str | None = None
    notify_on_publish: bool
    rsvp_count: int
    host: CommunityEventHost

    # Per-viewer + derived fields. `going` is from the RSVP join for the
    # current customer (always False when viewed by the host). `live`
    # and `past` are computed from start_at + duration_minutes vs now().
    going: bool = False
    live: bool = False
    past: bool = False


class CommunityEventCreate(Schema):
    title: str = Field(min_length=1, max_length=200)
    type: EventType
    description: str | None = Field(default=None, max_length=4000)
    start_at: datetime
    timezone: str = Field(default="UTC", max_length=64)
    duration_minutes: int = Field(ge=5, le=600, default=60)
    meeting_url: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=500)
    cover_url: str | None = Field(default=None, max_length=2000)
    cover_object_position: str | None = Field(
        default=None, max_length=32, pattern=COVER_OBJECT_POSITION_PATTERN
    )
    notify_on_publish: bool = True


class CommunityEventUpdate(Schema):
    """PATCH — every field optional."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    type: EventType | None = None
    description: str | None = Field(default=None, max_length=4000)
    start_at: datetime | None = None
    timezone: str | None = Field(default=None, max_length=64)
    duration_minutes: int | None = Field(default=None, ge=5, le=600)
    meeting_url: str | None = Field(default=None, max_length=2000)
    location: str | None = Field(default=None, max_length=500)
    cover_url: str | None = Field(default=None, max_length=2000)
    cover_object_position: str | None = Field(
        default=None, max_length=32, pattern=COVER_OBJECT_POSITION_PATTERN
    )


class CommunityEventRsvpResult(Schema):
    """Returned from POST/DELETE /events/{id}/rsvp — the new state plus
    the updated counter so the UI doesn't need a second fetch."""

    going: bool
    rsvp_count: int


class CommunityEventAttendee(Schema):
    """One row in the host-facing attendees roster. Name falls back to
    the email local part when the customer didn't set a display name —
    matches how customer surfaces elsewhere in the product handle the
    missing-name case."""

    customer_id: UUID4
    name: str
    email: str
    avatar_url: str | None = None
    rsvp_at: datetime


class CommunityEventAnnounceResult(Schema):
    """Returned from POST /events/{id}/announce. `enqueued=True` means
    the fan-out job is on its way; we don't synchronously wait for
    delivery."""

    enqueued: bool


class CommunityEventAnnouncementCreate(Schema):
    """Composer payload. v1 always sends immediately; `send_now=False`
    is reserved for a future draft-and-send flow."""

    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=4000)
    send_now: bool = True


class CommunityEventAnnouncementPreviewRequest(Schema):
    """Renders subject + body into the full transactional email HTML
    so the composer modal can show a live preview without saving."""

    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(default="", max_length=4000)


class CommunityEventAnnouncementPreviewResult(Schema):
    """Returned from POST /announcements/preview — full rendered HTML
    the composer drops straight into a sandboxed iframe."""

    subject: str
    html: str


class CommunityEventAnnouncementRead(TimestampedSchema):
    id: UUID4
    event_id: UUID4
    course_id: UUID4
    subject: str
    body: str
    status: Literal["draft", "sending", "sent", "failed"]
    sent_at: datetime | None = None
    recipient_count: int


class CommunityEventPublic(Schema):
    """Trimmed view for the unauthenticated public event page.

    Omits `going` and `rsvp_count` (no logged-in customer context, and
    an accurate count would leak activity). `meeting_url` IS included:
    the page is a link the host chose to share, community events are
    low-risk, and hiding it left every "View event" path — including
    the ones we email to enrolled members — unable to show people how
    to actually join. If RSVP-gated links are needed later that's a
    separate "private events" feature.
    """

    id: UUID4
    organization_slug: str
    course_id: UUID4
    course_name: str
    title: str
    type: EventType
    description: str | None = None
    start_at: datetime
    timezone: str = "UTC"
    duration_minutes: int
    location: str | None = None
    meeting_url: str | None = None
    cover_url: str | None = None
    cover_object_position: str | None = None
    host: CommunityEventHost
    live: bool = False
    past: bool = False
