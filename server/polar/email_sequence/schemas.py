from datetime import datetime

from pydantic import UUID4, Field

from polar.kit.schemas import IDSchema, Schema, TimestampedSchema
from polar.models.email_sequence import EmailSequenceStatus, EmailSequenceTriggerType


class EmailSequenceStepCreate(Schema):
    position: int | None = Field(default=None, description="Position (auto-appended if omitted)")
    delay_hours: int = Field(default=0, ge=0, description="Hours to wait before sending")
    subject: str = Field(max_length=255)
    sender_name: str = Field(max_length=100)
    sender_email: str | None = None
    reply_to_email: str | None = None
    content_html: str | None = None
    content_json: dict | None = None
    # Stable client-authored id linking this row to a node in the flow_doc.
    # The editor sets it on every new step; the server stores it so future
    # saves can align desired<->existing steps by id rather than array index.
    flow_step_id: str | None = Field(default=None, max_length=64)


class EmailSequenceStepUpdate(Schema):
    position: int | None = None
    delay_hours: int | None = Field(default=None, ge=0)
    subject: str | None = Field(default=None, max_length=255)
    sender_name: str | None = Field(default=None, max_length=100)
    sender_email: str | None = None
    reply_to_email: str | None = None
    content_html: str | None = None
    content_json: dict | None = None
    flow_step_id: str | None = Field(default=None, max_length=64)


class EmailSequenceStep(TimestampedSchema, IDSchema):
    id: UUID4
    sequence_id: UUID4
    position: int
    delay_hours: int
    subject: str
    sender_name: str
    sender_email: str | None = None
    reply_to_email: str | None = None
    content_html: str | None = None
    content_json: dict | None = None
    flow_step_id: str | None = None


class EmailSequenceReorderItem(Schema):
    id: UUID4
    position: int


class EmailSequenceCreate(Schema):
    name: str = Field(max_length=255)
    description: str | None = None
    trigger_type: EmailSequenceTriggerType = EmailSequenceTriggerType.manual
    trigger_config: dict = Field(default_factory=dict)
    course_id: UUID4 | None = None
    lesson_id: UUID4 | None = None
    # Optional authored flow document. The editor sends this on first save so
    # a fresh sequence can ship with audience filters / waits / branches
    # already in place; without it the user has to PATCH right after creating.
    # Stored on `trigger_config.flow_doc` (the server's source of truth for
    # the flow walker) — the field is duplicated up to the top level here
    # purely so the JSON shape is obvious at the API surface.
    flow_doc: dict | None = None


class EmailSequenceUpdate(Schema):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    trigger_type: EmailSequenceTriggerType | None = None
    trigger_config: dict | None = None
    status: EmailSequenceStatus | None = None
    course_id: UUID4 | None = None
    lesson_id: UUID4 | None = None


class EmailSequence(TimestampedSchema, IDSchema):
    id: UUID4
    organization_id: UUID4
    name: str
    description: str | None = None
    trigger_type: str
    trigger_config: dict
    status: str
    course_id: UUID4 | None = None
    lesson_id: UUID4 | None = None
    step_count: int = 0
    enrollment_count: int = 0


class EmailSequenceEnrollment(TimestampedSchema, IDSchema):
    id: UUID4
    sequence_id: UUID4
    subscriber_id: UUID4
    status: str
    current_step_position: int
    enrolled_at: datetime
    next_step_at: datetime | None = None
    completed_at: datetime | None = None
    # Tree cursor (Phase 3b). Surface read-only so observability tools and
    # the dashboard can show "this enrollment is parked at step XYZ" even
    # when we walk through nested branch arms.
    flow_next_step_id: str | None = None


class EmailSequenceEnrollRequest(Schema):
    subscriber_id: UUID4


class EmailSequenceFireEvent(Schema):
    """Caller fires a named event for a subscriber. Any active enrolment
    parked on `wait{ mode:'until-event', event:<name> }` for that
    subscriber resumes immediately."""

    event_name: str = Field(min_length=1, max_length=120)
    subscriber_id: UUID4


class EmailSequenceFireEventResult(Schema):
    woken_enrolment_ids: list[UUID4]


class EmailSequenceStepAnalytics(Schema):
    step_id: UUID4
    sent: int = 0
    delivered: int = 0
    opened: int = 0
    clicked: int = 0
    bounced: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0


class EmailSequenceStepTestSend(Schema):
    email: str


class EmailSequenceTemplate(Schema):
    slug: str
    name: str
    description: str
    category: str
    trigger_type: EmailSequenceTriggerType
    step_count: int
    # Full authored flow doc — small enough to ship with the list response so
    # the template gallery can render a free preview without a second fetch.
    flow_doc: dict | None = None


class EmailSequenceFromTemplate(Schema):
    slug: str
    course_id: UUID4 | None = None
    lesson_id: UUID4 | None = None


class EmailSequenceAnalytics(Schema):
    total_sent: int = 0
    delivered: int = 0
    opened: int = 0
    clicked: int = 0
    bounced: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0
    total_enrolled: int = 0
    active_enrollments: int = 0
    completed_enrollments: int = 0
