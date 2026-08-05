from datetime import datetime
from typing import Literal

from pydantic import UUID4, Field

from polar.kit.schemas import Schema, TimestampedSchema

from .sorting import CommunityPostSortProperty

# =====================================================================
# Settings
# =====================================================================


class CommunitySettingsRead(TimestampedSchema):
    id: UUID4
    course_id: UUID4
    enabled: bool
    show_in_portal_tabs: bool
    comments_mode: Literal["visible", "hidden", "locked"]
    hero_thumbnail_url: str | None = None
    hero_thumbnail_object_position: str | None = None
    feed_title_override: str | None = None
    feed_eyebrow_override: str | None = None
    module_label_overrides: dict | None = None
    module_order: list | None = None
    reactions_enabled: bool
    milestones_enabled: bool
    watching_rail_enabled: bool
    watching_rail_threshold: int
    presence_blurb: str | None = None
    prompt_of_week_post_id: UUID4 | None = None
    who_can_post: Literal["everyone", "approved"]
    moderate_new_members: bool
    profanity_filter: bool
    default_meeting_provider: Literal["zoom", "meet", "teams", "webex", "other"]
    member_rsvp: bool
    notify_new_submissions: bool
    notify_new_comments: bool
    weekly_digest: bool
    archived: bool


class CommunitySettingsUpdate(Schema):
    """Creator-side PATCH. Any field omitted is left unchanged."""

    enabled: bool | None = None
    show_in_portal_tabs: bool | None = None
    comments_mode: Literal["visible", "hidden", "locked"] | None = None
    hero_thumbnail_url: str | None = Field(default=None, max_length=500)
    hero_thumbnail_object_position: str | None = Field(default=None, max_length=32)
    feed_title_override: str | None = Field(default=None, max_length=120)
    feed_eyebrow_override: str | None = Field(default=None, max_length=120)
    module_label_overrides: dict | None = None
    module_order: list[UUID4] | None = None
    reactions_enabled: bool | None = None
    milestones_enabled: bool | None = None
    watching_rail_enabled: bool | None = None
    watching_rail_threshold: int | None = Field(default=None, ge=1)
    presence_blurb: str | None = None
    prompt_of_week_post_id: UUID4 | None = None
    who_can_post: Literal["everyone", "approved"] | None = None
    moderate_new_members: bool | None = None
    profanity_filter: bool | None = None
    default_meeting_provider: (
        Literal["zoom", "meet", "teams", "webex", "other"] | None
    ) = None
    member_rsvp: bool | None = None
    notify_new_submissions: bool | None = None
    notify_new_comments: bool | None = None
    weekly_digest: bool | None = None
    archived: bool | None = None


# =====================================================================
# Tags
# =====================================================================


class CommunityTagRead(TimestampedSchema):
    id: UUID4
    course_id: UUID4
    slug: str
    label: str
    position: int


class CommunityTagCreate(Schema):
    label: str = Field(min_length=1, max_length=50)
    # Optional. Service derives a slug from the label when omitted —
    # callers only need to pass it explicitly when they need a stable
    # identifier the milestone job can look up by.
    slug: str | None = Field(default=None, min_length=1, max_length=50)


class CommunityTagUpdate(Schema):
    label: str | None = Field(default=None, min_length=1, max_length=50)
    position: int | None = Field(default=None, ge=0)


class CommunityTagReorderRequest(Schema):
    """Batch-reorder payload — `ordered_ids` is the desired top-to-bottom
    order. Each id gets its `position` set to its array index."""

    ordered_ids: list[UUID4] = Field(min_length=0, max_length=50)


# =====================================================================
# Author resolution — discriminated by `kind`
# =====================================================================


class CommunityAuthorInstructor(Schema):
    """Creator/admin-side author. `user_id` is included so the client can
    pair posts authored under the same instructor identity, e.g. to badge
    them as "Instructor"."""

    kind: Literal["instructor"] = "instructor"
    user_id: UUID4
    name: str | None = None
    avatar_url: str | None = None


class CommunityAuthorStudent(Schema):
    """Enrolled-student author. `enrollment_id` is the stable identity in
    the community context; we don't surface customer_id here so the API
    stays customer-PII-light."""

    kind: Literal["student"] = "student"
    enrollment_id: UUID4
    name: str | None = None
    avatar_url: str | None = None


CommunityAuthor = CommunityAuthorInstructor | CommunityAuthorStudent


# =====================================================================
# Reactions
# =====================================================================


# Mirrors the CHECK constraint in the migration and the
# COMMUNITY_REACTION_EMOJIS tuple on the model. Kept here so OpenAPI
# documents the allowed values without importing the model.
CommunityReactionEmoji = Literal[
    "thumbsup", "clap", "heart", "fire", "idea", "pray"
]


class CommunityReactionSummaryEntry(Schema):
    """One emoji's row on a post or comment. `mine` is true when the
    current viewer has reacted with this emoji."""

    emoji: CommunityReactionEmoji
    count: int
    mine: bool = False


class CommunityReactionToggle(Schema):
    """POST body for `/react`. The server toggles — if the row exists
    it's deleted, otherwise inserted."""

    emoji: CommunityReactionEmoji


class CommunityReactionToggleResult(Schema):
    """Returned by the toggle endpoint so optimistic clients have a
    server-confirmed state to settle on.

    `reactions` is the authoritative per-emoji breakdown for this
    target after the toggle — clients should replace their cached
    `reactions` array with this value rather than mutating it in
    place. `count` is the sum of `reactions[].count` and matches
    `community_posts.reaction_count` for post targets."""

    emoji: CommunityReactionEmoji
    active: bool
    count: int
    reactions: list[CommunityReactionSummaryEntry] = Field(
        default_factory=list
    )


# =====================================================================
# Posts
# =====================================================================


class CommunityPostMediaCreate(Schema):
    """One attachment on a new post.

    Image branch: client uploaded a File via the
      community_post_image service first, passes the file_id here.
      Up to 4 image rows per post, positioned 0..3.

    Video branch (Phase 3A): client created a Mux direct upload via
      POST /media/mux-upload, the browser PUT the bytes to Mux, then
      passes `mux_upload_id` here. Exactly one video per post.
    """

    media_type: Literal["image", "video", "gif"] = "image"
    file_id: UUID4 | None = None
    mux_upload_id: str | None = Field(default=None, max_length=255)
    # GIF branch: the GIPHY media URL.
    external_url: str | None = Field(default=None, max_length=1000)
    position: int = Field(default=0, ge=0, le=3)


class CommunityPostImageUploadResult(Schema):
    """Returned by the image upload endpoint so the composer can stash
    the file_id alongside the local image preview, then include it in
    the post create payload."""

    file_id: UUID4
    public_url: str
    size: int
    mime_type: str


class CommunityPostVideoUploadResult(Schema):
    """Returned by the Mux direct-upload endpoint. The browser PUTs
    bytes straight to `upload_url`; the upload_id is what gets passed
    back into the post-create payload. The Mux webhook later flips the
    media row's mux_status to 'ready' and fills in playback details."""

    upload_id: str
    upload_url: str


class CommunityPostMediaRead(Schema):
    id: UUID4
    media_type: Literal["image", "video", "gif"]
    position: int
    # GIF branch — the external (GIPHY) URL the client renders directly.
    external_url: str | None = None
    # Image branch — file_id is the File row; public_url is the
    # rendered S3 URL the client uses in <img>. Resolved server-side
    # so the client doesn't need to know which bucket each service
    # writes to.
    file_id: UUID4 | None = None
    public_url: str | None = None
    # Video branch — populated for media_type='video'. `playback_url` is
    # the server-signed HLS URL (preferred — HlsVideo uses it directly);
    # `mux_playback_id` is exposed for the legacy public-asset path.
    # `mux_status` is one of 'waiting' | 'processing' | 'ready' |
    # 'errored' — the client should treat anything but 'ready' as
    # "still encoding, show a placeholder".
    mux_playback_id: str | None = None
    playback_url: str | None = None
    mux_status: str | None = None
    duration_seconds: int | None = None
    thumbnail_url: str | None = None


class CommunityLessonChip(Schema):
    """Resolved `re: Module — Lesson` chip shown above the post body."""

    lesson_id: UUID4
    lesson_title: str
    module_id: UUID4 | None = None
    module_title: str | None = None


class CommunityModuleChip(Schema):
    """Module-only chip used on activity pins where the activity is
    scoped to a module (no lesson). Mirrors CommunityLessonChip's shape
    so the FE can render the same pill component."""

    module_id: UUID4
    module_title: str | None = None


class CommunityPollCreate(Schema):
    """A poll attached to a new post: 2–4 short options."""

    options: list[str] = Field(min_length=2, max_length=4)


class CommunityPollOptionRead(Schema):
    id: str
    text: str
    votes: int = 0


class CommunityPollRead(Schema):
    options: list[CommunityPollOptionRead]
    total: int = 0
    # The option id the viewer voted for, or None.
    my_vote: str | None = None


class CommunityPollVote(Schema):
    option_id: str = Field(max_length=8)


class CommunityPostEventRef(Schema):
    """Compact event summary embedded on a post that links an event."""

    id: UUID4
    title: str
    type: Literal["workshop", "office", "cohort", "guest"]
    start_at: datetime
    timezone: str
    duration_minutes: int
    cover_url: str | None = None
    cover_object_position: str | None = None
    meeting_url: str | None = None


class CommunityPostCreate(Schema):
    # text + video. A video post carries exactly one media entry with
    # media_type='video' and a mux_upload_id from /media/mux-upload;
    # CommunityService._validate_media enforces that shape.
    type: Literal["text", "video"] = "text"
    title: str | None = Field(default=None, max_length=280)
    body: str = Field(min_length=1, max_length=20_000)
    body_format: Literal["markdown", "plain"] = "markdown"
    lesson_id: UUID4 | None = None
    tag_id: UUID4 | None = None
    # If the creator wants to schedule into the future; omitted means
    # publish-now. Drafts go through a separate flag once added.
    publish_at: datetime | None = None
    # Up to 4 image attachments. The client uploads each image via the
    # standard file pipeline (FileServiceTypes.community_post_image)
    # first, then passes the resulting file_ids here. The server creates
    # one community_post_media row per entry in the same transaction as
    # the post so a partial-failure can't leave orphan files.
    media: list[CommunityPostMediaCreate] = Field(
        default_factory=list,
        max_length=4,
    )
    # Optional poll (2–4 options) and/or an embedded event card.
    poll: CommunityPollCreate | None = None
    event_id: UUID4 | None = None


class CommunityPostUpdate(Schema):
    """Owner-side update. Body edits flag the post as `modified_at`; the
    client can choose to surface that as "edited"."""

    title: str | None = Field(default=None, max_length=280)
    body: str | None = Field(default=None, min_length=1, max_length=20_000)
    tag_id: UUID4 | None = None


class CommunityPinPayload(Schema):
    pin_type: Literal["announcement", "prompt_of_week", "activity"]
    # When null, the pin sticks until manually unpinned. Default cap of
    # 7 days is applied in the service when omitted.
    expires_at: datetime | None = None


class CommunityPostRead(TimestampedSchema):
    id: UUID4
    course_id: UUID4
    type: Literal["text", "video"]
    title: str | None
    body: str
    body_format: Literal["markdown", "plain"]
    author: CommunityAuthor = Field(discriminator="kind")
    lesson: CommunityLessonChip | None = None
    # Set on activity pins whose underlying activity is module-scoped
    # (channel_kind='module'); these don't have a lesson chip but the
    # feed should still show "re: Module N" so the pin is contextual.
    module: CommunityModuleChip | None = None
    tag: CommunityTagRead | None = None
    media: list[CommunityPostMediaRead] = Field(default_factory=list)
    published_at: datetime | None
    pinned_at: datetime | None = None
    pin_type: Literal["announcement", "prompt_of_week", "activity"] | None = None
    pin_expires_at: datetime | None = None
    comments_mode: Literal["visible", "hidden", "locked"] | None = None
    reaction_count: int = 0
    comment_count: int = 0
    reactions: list[CommunityReactionSummaryEntry] = Field(default_factory=list)
    # For posts with pin_type='activity', the linked activity id so the
    # feed renderer can offer an "Open activity" CTA.
    activity_id: UUID4 | None = None
    # Richer summary for the inline activity-CTA panel (submission
    # type + count). Present iff pin_type='activity'. Kept alongside
    # activity_id so the simpler "Open activity →" link still works
    # for clients that haven't picked up the new field.
    activity: "CommunityPostActivityPin | None" = None
    # Composer extras.
    poll: CommunityPollRead | None = None
    event: CommunityPostEventRef | None = None


class CommunityPostActivityPin(Schema):
    """Compact activity summary rendered inline on a pin_type='activity'
    feed post — drives the activity-CTA-row panel."""

    id: UUID4
    submission_type: Literal["photo", "video", "text", "link"]
    submission_count: int


# =====================================================================
# Comments
# =====================================================================


class CommunityCommentCreate(Schema):
    content: str = Field(min_length=1, max_length=5_000)
    parent_id: UUID4 | None = None
    # Only set on video-post replies — the scrubber UI clusters by this.
    timestamp_seconds: int | None = Field(default=None, ge=0)


class CommunityCommentRead(TimestampedSchema):
    id: UUID4
    post_id: UUID4
    parent_id: UUID4 | None
    author: CommunityAuthor = Field(discriminator="kind")
    # Soft-deleted comments come back with content='' and deleted=True so
    # the reply chain stays renderable as a tombstone — same pattern as
    # lesson_comments.
    content: str
    timestamp_seconds: int | None = None
    deleted: bool = False
    is_own: bool = False
    reactions: list[CommunityReactionSummaryEntry] = Field(default_factory=list)


# =====================================================================
# Picker — customer-portal "which communities can I access?"
# =====================================================================


class CommunityCourseSummary(Schema):
    """One row in the customer-portal picker. `community_enabled` is
    false when the creator hasn't enabled the feed for this course yet
    (or the settings row doesn't exist at all)."""

    course_id: UUID4
    course_title: str | None
    course_thumbnail_url: str | None
    course_thumbnail_object_position: str | None
    community_enabled: bool


# =====================================================================
# Members
# =====================================================================


class CommunityMemberRead(Schema):
    """One row in the Members tab. The instructor is included as a
    synthetic first entry (kind='instructor', id=user_id). Students are
    one-per-enrollment, keyed by enrollment_id."""

    id: UUID4
    kind: Literal["instructor", "student"]
    name: str | None
    avatar_url: str | None
    joined_at: datetime | None


# =====================================================================
# Feed
# =====================================================================


class CommunityFeedFilters(Schema):
    """Read-only query-param container. Each field becomes a `?key=val`
    on the feed endpoint."""

    sort: CommunityPostSortProperty = CommunityPostSortProperty.recent
    module_id: UUID4 | None = None
    lesson_id: UUID4 | None = None
    tag_id: UUID4 | None = None


# Cursor format: base64(`<iso-timestamp>_<uuid>`). The repository decodes
# this to a (sort_key, id) tuple and seeds the next page's WHERE clause.
class CommunityFeedCursor(Schema):
    cursor: str | None = None
    limit: int = Field(default=20, ge=1, le=50)
