from uuid import UUID

from sqlalchemy import (
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class ProductReview(RecordModel):
    __tablename__ = "product_reviews"
    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "customer_id",
            "deleted_at",
            name="product_reviews_product_customer_key",
        ),
        Index(
            "ix_product_reviews_product_id",
            "product_id",
        ),
    )

    product_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("products.id", ondelete="cascade"),
        nullable=False,
    )
    customer_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("customers.id", ondelete="cascade"),
        nullable=False,
    )
    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True, default=None)
    text: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    customer_name: Mapped[str] = mapped_column(String(256), nullable=False)

    @declared_attr
    def product(cls) -> Mapped["Product"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Product", lazy="raise")

    @declared_attr
    def customer(cls) -> Mapped["Customer"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Customer", lazy="raise")

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Organization", lazy="raise")
