"""Pydantic schemas for community activities + submissions."""

from datetime import datetime
from typing import Literal

from pydantic import UUID4, Field

from polar.kit.schemas import Schema, TimestampedSchema

from .events_schemas import COVER_OBJECT_POSITION_PATTERN

ActivitySubmissionType = Literal["photo", "video", "text", "link"]
ActivityStatus = Literal["open", "closed"]
ActivityChannelKind = Literal["module", "lesson"]
ActivitySubmissionVisibility = Literal["cohort", "all", "instr"]


class CommunityActivityHost(Schema):
    user_id: UUID4
    name: str
    avatar_url: str | None = None


class CommunityActivitySubmissionRead(TimestampedSchema):
    id: UUID4
    activity_id: UUID4
    submission_type: ActivitySubmissionType
    body: str | None = None
    file_id: UUID4 | None = None
    file_url: str | None = None
    mux_playback_id: str | None = None
    # Video lifecycle: 'waiting' | 'processing' | 'ready' | 'errored' |
    # 'deleted'. Null for non-video submissions. Clients render an
    # encoding state when this is set and != 'ready'.
    mux_status: str | None = None
    link_url: str | None = None
    image_object_position: str | None = None
    visibility: ActivitySubmissionVisibility = "cohort"

    # Submitter identity. We surface the customer's display name +
    # avatar; never the customer_id (PII).
    author_name: str
    author_avatar_url: str | None = None
    is_own: bool = False


class CommunityActivityRead(TimestampedSchema):
    id: UUID4
    course_id: UUID4
    channel_kind: ActivityChannelKind
    module_id: UUID4 | None = None
    lesson_id: UUID4 | None = None
    channel_label: str | None = None  # resolved server-side for the card chip
    title: str
    description: str | None = None
    cover_url: str | None = None
    cover_object_position: str | None = None
    submission_type: ActivitySubmissionType
    status: ActivityStatus
    pin_to_feed: bool
    notify_on_publish: bool
    submission_count: int
    # Number of distinct customers who have submitted at least once. The
    # progress bar shows distinct, not raw count.
    distinct_submitter_count: int = 0
    host: CommunityActivityHost
    # Per-viewer.
    has_own_submission: bool = False


class CommunityActivityCreate(Schema):
    channel_kind: ActivityChannelKind
    module_id: UUID4 | None = None
    lesson_id: UUID4 | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    cover_url: str | None = Field(default=None, max_length=2000)
    cover_object_position: str | None = Field(
        default=None, max_length=32, pattern=COVER_OBJECT_POSITION_PATTERN
    )
    submission_type: ActivitySubmissionType
    pin_to_feed: bool = False
    notify_on_publish: bool = True


class CommunityActivityUpdate(Schema):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    cover_url: str | None = Field(default=None, max_length=2000)
    cover_object_position: str | None = Field(
        default=None, max_length=32, pattern=COVER_OBJECT_POSITION_PATTERN
    )
    submission_type: ActivitySubmissionType | None = None
    pin_to_feed: bool | None = None
    status: ActivityStatus | None = None


class CommunityActivitySubmissionCommentAuthor(Schema):
    """Display identity for a submission comment. The kind discriminator
    lines up with CommunityAuthor on posts so the FE can reuse the
    avatar/name pair."""

    kind: Literal["student", "instructor"]
    name: str
    avatar_url: str | None = None


class CommunityActivitySubmissionCommentRead(TimestampedSchema):
    id: UUID4
    submission_id: UUID4
    body: str
    author: CommunityActivitySubmissionCommentAuthor
    is_own: bool = False


class CommunityActivitySubmissionCommentCreate(Schema):
    body: str = Field(min_length=1, max_length=4000)


class CommunityActivitySubmissionCreate(Schema):
    submission_type: ActivitySubmissionType
    body: str | None = Field(default=None, max_length=4000)
    file_id: UUID4 | None = None
    mux_upload_id: str | None = None
    link_url: str | None = Field(default=None, max_length=2000)
    image_object_position: str | None = Field(
        default=None, max_length=32, pattern=COVER_OBJECT_POSITION_PATTERN
    )
    visibility: ActivitySubmissionVisibility = "cohort"


_ = datetime  # for explicit reference where needed
