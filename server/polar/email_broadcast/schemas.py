from datetime import datetime

from pydantic import UUID4, Field, field_validator

from polar.kit.schemas import IDSchema, Schema, TimestampedSchema
from polar.kit.utils import utc_now


class EmailBroadcastCreate(Schema):
    subject: str = Field(description="Email subject line", max_length=255)
    preview_text: str | None = Field(
        default=None,
        description="Inbox preview text shown after the subject.",
        max_length=150,
    )
    sender_name: str = Field(description="Sender display name", max_length=100)
    # The sender column is non-nullable on the model so creates have to set it
    # somehow; previously the API surface forced callers to leave it to a DB
    # default they couldn't see (audit issue #49 / fix-list #49). Optional
    # here so existing callers don't break — the service falls back to the
    # organization's notifications domain when None.
    sender_email: str | None = Field(
        default=None,
        description=(
            "Sender email address (the From). When omitted, the service "
            "uses the org's configured notifications sender."
        ),
        max_length=255,
    )
    reply_to_email: str | None = Field(default=None, description="Reply-to email address")
    content_json: dict | None = Field(default=None, description="Structured editor content")
    content_html: str | None = Field(default=None, description="HTML content for sending")
    segment_id: UUID4 | None = Field(default=None, description="Target segment ID")
    filter_rules: dict | None = Field(
        default=None,
        description="Inline audience filter (overrides segment_id when set).",
    )


class EmailBroadcastUpdate(Schema):
    subject: str | None = None
    preview_text: str | None = None
    sender_name: str | None = None
    sender_email: str | None = None
    reply_to_email: str | None = None
    content_json: dict | None = None
    content_html: str | None = None
    segment_id: UUID4 | None = None
    filter_rules: dict | None = None


class EmailBroadcast(TimestampedSchema, IDSchema):
    id: UUID4
    organization_id: UUID4
    subject: str
    preview_text: str | None = None
    sender_name: str
    sender_email: str
    reply_to_email: str | None = None
    content_json: dict | None = None
    content_html: str | None = None
    segment_id: UUID4 | None = None
    filter_rules: dict | None = None
    status: str
    scheduled_at: datetime | None = None
    sent_at: datetime | None = None
    total_recipients: int = 0


class EmailCopyRequest(Schema):
    course_id: UUID4 = Field(description="Course to generate the recap copy from.")
    moment: str = Field(
        default="enrolment",
        description=(
            "Lifecycle moment: enrolment, firstLesson, specificLesson, halfway, "
            "courseComplete, or inactive."
        ),
        max_length=40,
    )


class EmailCopyResponse(Schema):
    subject: str = Field(description="Generated subject line.")
    preview: str = Field(description="Generated inbox preview text.")
    heading: str = Field(description="Generated welcome-note heading.")
    body: list[str] = Field(
        default_factory=list, description="Generated welcome-note paragraphs."
    )


class EmailBroadcastTestSend(Schema):
    email: str = Field(description="Inbox to send the test email to.", max_length=320)


class EmailBroadcastTestInline(Schema):
    """Send a test of in-progress authored content (not a saved broadcast) —
    used by the sequence email editor's "Send test to me"."""

    subject: str = Field(default="", max_length=998)
    content_html: str = Field(description="The authored, inbox-ready HTML.")
    preview_text: str | None = Field(default=None, max_length=512)
    sender_name: str | None = Field(default=None, max_length=255)
    to_email: str | None = Field(
        default=None,
        max_length=320,
        description="Recipient; defaults to the authenticated user's email.",
    )


class EmailBroadcastTopLink(Schema):
    url: str
    clicks: int
    ctr: float


class EmailBroadcastDeviceShare(Schema):
    name: str
    share: float


class EmailBroadcastDailyEngagementPoint(Schema):
    day: str
    open_rate: float
    click_rate: float


class EmailBroadcastABTestUpsert(Schema):
    subject_b: str = Field(max_length=255)
    slice_pct: int = Field(default=20, ge=5, le=50)
    decide_after_minutes: int = Field(default=240, ge=15, le=10080)
    winner_metric: str = Field(default="open_rate")


class EmailBroadcastABTest(Schema):
    id: UUID4
    broadcast_id: UUID4
    subject_b: str
    slice_pct: int
    decide_after_minutes: int
    winner_metric: str
    winner_variant: str | None = None
    test_sent_at: datetime | None = None
    winner_picked_at: datetime | None = None


class EmailBroadcastABVariantStats(Schema):
    total: int = 0
    delivered: int = 0
    opened: int = 0
    clicked: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0


class EmailBroadcastABTestState(Schema):
    config: EmailBroadcastABTest | None = None
    variants: dict[str, EmailBroadcastABVariantStats] | None = None


class EmailBroadcastSchedule(Schema):
    scheduled_at: datetime = Field(description="When to send the broadcast (UTC)")

    @field_validator("scheduled_at")
    @classmethod
    def must_be_future(cls, v: datetime) -> datetime:
        if v <= utc_now():
            raise ValueError("scheduled_at must be in the future")
        return v


class EmailBroadcastAnalytics(Schema):
    total_recipients: int = 0
    sent: int = 0
    delivered: int = 0
    opened: int = 0
    clicked: int = 0
    bounced: int = 0
    unsubscribed: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0


class EmailBroadcastRowAnalytics(Schema):
    recipients: int = 0
    delivered: int = 0
    opens: int = 0
    clicks: int = 0
    unsubs: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0


class EmailBroadcastWithAnalytics(EmailBroadcast):
    analytics: EmailBroadcastRowAnalytics | None = None


class EmailBroadcastSendRow(Schema):
    id: UUID4
    subscriber_id: UUID4
    subscriber_email: str
    subscriber_name: str | None = None
    status: str
    sent_at: datetime | None = None
    opened_at: datetime | None = None
    open_count: int = 0
    clicked_at: datetime | None = None
    click_count: int = 0
    bounced_at: datetime | None = None
    unsubscribed_at: datetime | None = None
