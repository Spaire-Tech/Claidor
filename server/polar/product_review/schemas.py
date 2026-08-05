from pydantic import UUID4, Field

from polar.kit.schemas import Schema, TimestampedSchema


class ProductReviewCreate(Schema):
    product_id: UUID4 = Field(description="The product ID to review.")
    rating: int = Field(ge=1, le=5, description="Rating from 1 to 5.")
    title: str | None = Field(None, max_length=200, description="Review title.")
    text: str | None = Field(None, max_length=2000, description="Review body.")


class ProductReviewRead(TimestampedSchema):
    id: UUID4
    product_id: UUID4
    rating: int
    title: str | None
    text: str | None
    customer_name: str


class ProductReviewStats(Schema):
    product_id: UUID4
    average_rating: float
    total_reviews: int
