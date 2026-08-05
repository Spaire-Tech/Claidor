from pydantic import UUID4, Field

from polar.kit.schemas import IDSchema, Schema, TimestampedSchema


class EmailSegmentCreate(Schema):
    name: str = Field(description="Segment display name", max_length=100)
    slug: str = Field(description="URL-friendly identifier", max_length=100)
    type: str = Field(default="manual", description="Segment type")
    product_id: UUID4 | None = Field(default=None, description="Product ID for product-specific segments")


class EmailSegmentUpdate(Schema):
    name: str | None = None


class EmailSegment(TimestampedSchema, IDSchema):
    id: UUID4
    organization_id: UUID4
    name: str
    slug: str
    type: str
    product_id: UUID4 | None = None
    is_system: bool
    subscriber_count: int = 0


class EmailSegmentSubscriberAction(Schema):
    subscriber_ids: list[UUID4] = Field(description="List of subscriber IDs")
