from datetime import datetime

from pydantic import UUID4, Field

from polar.kit.schemas import IDSchema, Schema, TimestampedSchema


class EmailSubscriberCreate(Schema):
    email: str = Field(description="Subscriber email address", max_length=320)
    name: str | None = Field(default=None, description="Subscriber name", max_length=256)


class EmailSubscriberUpdate(Schema):
    name: str | None = None
    status: str | None = Field(
        default=None, description="Subscriber status: active, unsubscribed, archived"
    )


class EmailSubscriber(TimestampedSchema, IDSchema):
    id: UUID4
    organization_id: UUID4
    email: str
    name: str | None = None
    status: str
    source: str
    import_source: str | None = None
    customer_id: UUID4 | None = None
    email_verified_at: datetime | None = None
    unsubscribed_at: datetime | None = None


class EmailSubscriberStats(Schema):
    total: int = 0
    active: int = 0
    unsubscribed: int = 0
    archived: int = 0
    invalid: int = 0
    added_30d: int = 0
    unsubs_30d: int = 0
    avg_daily_growth_30d: float = 0.0
    unsub_rate_30d: float = 0.0


class EmailSubscriberBulkRow(Schema):
    email: str = Field(max_length=320)
    name: str | None = Field(default=None, max_length=256)


class EmailSubscriberBulkCreate(Schema):
    rows: list[EmailSubscriberBulkRow] = Field(default_factory=list)
    import_source: str | None = Field(default=None, max_length=50)


class EmailSubscriberBulkResult(Schema):
    created: int = 0
    updated: int = 0
    skipped: int = 0
    # Optional row-level errors so callers (CSV import in particular) can
    # surface "row 14: missing email" instead of a single opaque count.
    errors: list["EmailSubscriberImportRowError"] = Field(default_factory=list)


class EmailSubscriberImportRowError(Schema):
    row: int = Field(description="1-based row index in the source file.")
    message: str


class EmailSubscriberFilterPreview(Schema):
    filter_rules: dict | None = Field(default=None)


class EmailSubscriberFilterPreviewResult(Schema):
    count: int = 0
    sample: list["EmailSubscriber"] = Field(default_factory=list)


class StorefrontSubscribe(Schema):
    """Public schema for Space card subscribe."""

    email: str = Field(description="Email address to subscribe", max_length=320)
    name: str | None = Field(default=None, description="Optional name", max_length=256)
