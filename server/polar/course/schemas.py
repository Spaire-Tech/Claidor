from datetime import datetime
from typing import Literal

from pydantic import UUID4, Field, field_validator

from polar.kit.schemas import Schema, TimestampedSchema

from .landing import validate_landing_overrides, validate_object_position


# Series-only "Episode Sample" block. The creator picks one lesson and a
# window inside it (start + duration in seconds), and that slice auto-plays
# on scroll as a sub-hero on the public series landing. duration_seconds is
# capped at three minutes so the sample stays a promotional teaser, not a
# free episode in disguise.
class CourseSample(Schema):
    enabled: bool = True
    lesson_id: UUID4
    start_seconds: int = Field(ge=0)
    duration_seconds: int = Field(ge=5, le=180)


class CourseLessonCreate(Schema):
    title: str = Field(max_length=500)
    content_type: Literal["video", "text", "download", "quiz"] = "text"
    content: dict | None = None
    video_asset_id: str | None = None
    duration_seconds: int | None = None
    position: int = 0
    is_free_preview: bool = False
    published: bool = False
    description: str | None = None
    release_at: datetime | None = None
    drip_days: int | None = None
    comments_mode: Literal["visible", "hidden", "locked"] = "visible"
    # When the client has already created a Mux direct upload via the
    # staging endpoint (so video upload could start before the lesson row
    # existed), pass the resulting upload id here. The lesson is then
    # created with `mux_status='waiting'` so the Mux webhook can attach
    # the asset / playback id by upload_id lookup.
    mux_upload_id: str | None = None
    thumbnail_url: str | None = None


class CourseLessonUpdate(Schema):
    title: str | None = Field(None, max_length=500)
    # Move the lesson to another module of the SAME course (the outline's
    # cross-season drag). Validated in the endpoint.
    module_id: UUID4 | None = None
    content_type: Literal["video", "text", "download", "quiz"] | None = None
    content: dict | None = None
    video_asset_id: str | None = None
    duration_seconds: int | None = None
    position: int | None = None
    is_free_preview: bool | None = None
    published: bool | None = None
    thumbnail_url: str | None = None
    thumbnail_object_position: str | None = Field(None, max_length=32)
    description: str | None = None
    release_at: datetime | None = None
    drip_days: int | None = None
    comments_mode: Literal["visible", "hidden", "locked"] | None = None

    @field_validator("thumbnail_object_position")
    @classmethod
    def _validate_object_position(cls, value: str | None) -> str | None:
        return validate_object_position(value)


class MuxUploadRead(Schema):
    upload_id: str
    upload_url: str


class LessonAiRewriteRequest(Schema):
    # Which editor section to rewrite from the transcript:
    # "details" → title + description; "overview" → overview note + takeaways.
    section: Literal["details", "overview"]


class CourseLessonRead(TimestampedSchema):
    id: UUID4
    module_id: UUID4
    title: str
    content_type: str
    content: dict | None
    video_asset_id: str | None
    duration_seconds: int | None
    position: int
    is_free_preview: bool
    published: bool
    mux_upload_id: str | None = None
    mux_asset_id: str | None = None
    mux_playback_id: str | None = None
    # Signed (when signing keys are configured) HLS URL for creator-side
    # playback: the editor's Play button and the sample-clip preview can't
    # build a working URL from the bare playback id once assets use the
    # `signed` playback policy.
    mux_playback_url: str | None = None
    # Signed storyboard (sprite sheet) WebVTT URL for hover-scrub
    # thumbnails in the editor's preview player.
    mux_storyboard_url: str | None = None
    mux_status: str | None = None
    # Course Assistant transcript pipeline state, surfaced so the editor can
    # show whether a video lesson has been transcribed yet:
    # pending | ready | failed | unavailable (null = not started / not a video).
    transcript_status: str | None = None
    # AI lesson-draft pipeline state — drives the editor's "AI is drafting
    # your lesson…" banner: pending | done | failed | cancelled (null = not
    # started / not a video).
    ai_autofill_status: str | None = None
    thumbnail_url: str | None = None
    thumbnail_object_position: str | None = None
    description: str | None = None
    release_at: datetime | None = None
    drip_days: int | None = None
    comments_mode: str = "visible"


class CourseLessonFlatRead(TimestampedSchema):
    id: UUID4
    title: str
    content_type: str
    content: dict | None
    video_asset_id: str | None
    duration_seconds: int | None
    position: int
    is_free_preview: bool
    published: bool
    mux_upload_id: str | None = None
    mux_asset_id: str | None = None
    mux_playback_id: str | None = None
    mux_status: str | None = None
    thumbnail_url: str | None = None
    thumbnail_object_position: str | None = None
    description: str | None = None
    release_at: datetime | None = None
    drip_days: int | None = None
    comments_mode: str = "visible"
    locked: bool = False
    locked_until: datetime | None = None
    completed: bool = False


class CourseLessonPublicRead(Schema):
    id: UUID4
    title: str
    description: str | None
    content_type: str
    position: int
    is_free_preview: bool
    duration_seconds: int | None
    thumbnail_url: str | None
    thumbnail_object_position: str | None = None


class CourseModuleCreate(Schema):
    title: str = Field(max_length=500)
    description: str | None = None
    position: int = 0
    status: str = "draft"
    release_at: datetime | None = None
    drip_days: int | None = None
    lessons: list[CourseLessonCreate] = Field(default_factory=list)


class CourseModuleUpdate(Schema):
    title: str | None = Field(None, max_length=500)
    description: str | None = None
    position: int | None = None
    status: str | None = None
    release_at: datetime | None = None
    drip_days: int | None = None
    # Bonus section — renders as the portal's "Bonus Content" rail; its
    # lessons are unnumbered and don't count toward completion.
    is_bonus: bool | None = None


class CourseModuleRead(TimestampedSchema):
    id: UUID4
    course_id: UUID4
    title: str
    description: str | None
    position: int
    status: str
    release_at: datetime | None
    drip_days: int | None
    is_bonus: bool = False
    lessons: list[CourseLessonRead]


class CourseCreate(Schema):
    product_id: UUID4
    organization_id: UUID4
    title: str | None = None
    slug: str | None = None
    course_type: Literal["evergreen", "cohort"] = "evergreen"
    format: Literal["course", "series"] = "course"
    paywall_enabled: bool = False
    paywall_lesson_id: UUID4 | None = None
    paywall_position: int | None = None
    ai_generated: bool = False
    # Course Assistant defaults ON for new courses.
    assistant_enabled: bool = True
    assistant_strictness: Literal["course_only", "course_plus_general"] = (
        "course_plus_general"
    )
    # Onboarding presentation choices — drive the public portal render.
    hero_variant: Literal["marquee", "cover"] = "cover"
    lesson_card_variant: Literal["spotlight", "catalog"] = "catalog"
    trial_mode: Literal["free_preview", "lesson_sample"] = "free_preview"
    description: str | None = None
    thumbnail_url: str | None = None
    thumbnail_object_position: str | None = Field(None, max_length=32)
    instructor_name: str | None = Field(None, max_length=200)
    instructor_bio: str | None = None
    trailer_url: str | None = Field(None, max_length=2048)
    instructor_name_italic: bool = True
    instructor_name_bold: bool = True
    instructor_name_uppercase: bool = True
    landing_overrides: dict | None = None
    sample: CourseSample | None = None
    modules: list[CourseModuleCreate] = Field(default_factory=list)

    @field_validator("thumbnail_object_position")
    @classmethod
    def _validate_object_position(cls, value: str | None) -> str | None:
        return validate_object_position(value)

    @field_validator("landing_overrides")
    @classmethod
    def _validate_landing_overrides(cls, value: dict | None) -> dict | None:
        return validate_landing_overrides(value)


class CourseUpdate(Schema):
    title: str | None = None
    slug: str | None = None
    course_type: Literal["evergreen", "cohort"] | None = None
    format: Literal["course", "series"] | None = None
    paywall_enabled: bool | None = None
    paywall_lesson_id: UUID4 | None = None
    paywall_position: int | None = None
    assistant_enabled: bool | None = None
    assistant_strictness: Literal["course_only", "course_plus_general"] | None = None
    hero_variant: Literal["marquee", "cover"] | None = None
    lesson_card_variant: Literal["spotlight", "catalog"] | None = None
    trial_mode: Literal["free_preview", "lesson_sample"] | None = None
    description: str | None = None
    thumbnail_url: str | None = None
    thumbnail_object_position: str | None = Field(None, max_length=32)
    instructor_name: str | None = Field(None, max_length=200)
    instructor_bio: str | None = None
    trailer_url: str | None = Field(None, max_length=2048)
    instructor_name_italic: bool | None = None
    instructor_name_bold: bool | None = None
    instructor_name_uppercase: bool | None = None
    landing_overrides: dict | None = None
    # `null` clears the sample (block disappears). A full CourseSample
    # object replaces whatever was there. Partial patches are not supported
    # — send the complete object every time.
    sample: CourseSample | None = None

    @field_validator("thumbnail_object_position")
    @classmethod
    def _validate_object_position(cls, value: str | None) -> str | None:
        return validate_object_position(value)

    @field_validator("landing_overrides")
    @classmethod
    def _validate_landing_overrides(cls, value: dict | None) -> dict | None:
        return validate_landing_overrides(value)


class CourseLessonThumbnailFromVideo(Schema):
    """Pick a video frame as the lesson thumbnail (YouTube-style).

    The server grabs the frame at ``time_seconds`` from the lesson's
    processed video and stores it as the thumbnail image.
    """

    time_seconds: float = Field(ge=0, le=12 * 60 * 60)


class QuizAnswerSubmission(Schema):
    question_id: str
    selected_option_ids: list[str] = Field(default_factory=list)


class QuizAttemptSubmission(Schema):
    answers: list[QuizAnswerSubmission]


class QuizAnswerResult(Schema):
    question_id: str
    correct: bool
    correct_option_ids: list[str]
    explanations: dict[str, str]


class QuizAttemptResult(Schema):
    score: float
    passed: bool
    passing_grade: int
    total_questions: int
    correct_count: int
    answers: list[QuizAnswerResult]


class ReorderRequest(Schema):
    ordered_ids: list[UUID4] = Field(min_length=0)


class CourseProgressRead(Schema):
    total_lessons: int
    completed_lessons: int
    completion_percent: float
    completed: dict[str, str]  # lesson_id -> completed_at ISO string
    # lesson_id -> partial watch position (fraction 0..1) for lessons the
    # student has started but not completed.
    positions: dict[str, float] = {}


class LessonCommentCreate(Schema):
    content: str = Field(min_length=1, max_length=5000)
    parent_id: UUID4 | None = None


class LessonCommentAuthor(Schema):
    enrollment_id: UUID4
    name: str | None = None
    avatar_url: str | None = None
    # True when this author is the course's instructor (their customer
    # email matches an org member's user email) — drives the badge.
    is_instructor: bool = False


class LessonCommentRead(Schema):
    id: UUID4
    lesson_id: UUID4
    parent_id: UUID4 | None
    content: str
    created_at: datetime
    is_own: bool
    author: LessonCommentAuthor
    # Hearts — total count + whether the requesting customer has liked it.
    likes: int = 0
    liked: bool = False
    # Instructor moderation, YouTube-style: a pinned comment sorts to the
    # top; instructor_hearted is the single creator heart.
    pinned: bool = False
    instructor_hearted: bool = False
    # True when the REQUESTING customer is the course's instructor — the
    # client uses it to show pin / heart / delete-any controls.
    viewer_is_instructor: bool = False
    # True when the comment has been soft-deleted but is included in the
    # response as a tombstone so its replies remain renderable.
    deleted: bool = False


class LessonCommentLikeRead(Schema):
    # Returned by the heart toggle endpoint: the requesting customer's new
    # liked state plus the comment's refreshed total.
    liked: bool
    likes: int


class CourseRead(TimestampedSchema):
    id: UUID4
    product_id: UUID4
    organization_id: UUID4
    title: str | None
    slug: str | None
    course_type: str
    format: str
    paywall_enabled: bool
    paywall_lesson_id: UUID4 | None
    paywall_position: int | None
    ai_generated: bool
    assistant_enabled: bool = True
    assistant_strictness: str = "course_plus_general"
    hero_variant: str = "cover"
    lesson_card_variant: str = "catalog"
    trial_mode: str = "free_preview"
    description: str | None = None
    thumbnail_url: str | None = None
    thumbnail_object_position: str | None = None
    instructor_name: str | None = None
    instructor_bio: str | None = None
    trailer_url: str | None = None
    instructor_name_italic: bool = True
    instructor_name_bold: bool = True
    instructor_name_uppercase: bool = True
    landing_overrides: dict | None = None
    sample: CourseSample | None = None
    modules: list[CourseModuleRead]


class CourseLandingPageRead(TimestampedSchema):
    id: UUID4
    title: str | None
    description: str | None
    thumbnail_url: str | None
    thumbnail_object_position: str | None = None
    instructor_name: str | None = None
    instructor_bio: str | None = None
    trailer_url: str | None = None
    instructor_name_italic: bool = True
    instructor_name_bold: bool = True
    instructor_name_uppercase: bool = True
    course_type: str
    format: str
    hero_variant: str = "cover"
    lesson_card_variant: str = "catalog"
    trial_mode: str = "free_preview"
    lesson_count: int
    total_duration_seconds: int
    lessons: list[CourseLessonPublicRead]
    paywall_enabled: bool = False
    paywall_position: int | None = None
    has_access: bool = False
    # Series-only sample block config. When enabled and the referenced
    # lesson is still on the course (and its mux asset is ready), the
    # public landing renders an auto-play-on-scroll sub-hero.
    sample: CourseSample | None = None


class CourseEnrollmentCustomer(Schema):
    id: UUID4
    email: str | None = None
    name: str | None = None
    avatar_url: str | None = None


class CourseEnrollmentProgress(Schema):
    """Instructor-facing progress rollup for one enrollment."""

    total_lessons: int
    completed_lessons: int
    # Lessons with a recorded partial watch position (started, not finished).
    started_lessons: int
    completion_percent: float
    last_active_at: datetime | None = None


class CourseEnrollmentRead(Schema):
    id: UUID4
    customer_id: UUID4
    enrolled_at: datetime
    customer: CourseEnrollmentCustomer | None = None
    progress: CourseEnrollmentProgress | None = None


class WatchProgressUpdate(Schema):
    fraction: float = Field(ge=0.0, le=1.0)


class CourseNoteUpsert(Schema):
    content: str


class CourseNoteRead(TimestampedSchema):
    id: UUID4
    lesson_id: UUID4
    content: str
