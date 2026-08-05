from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSegmentType(StrEnum):
    all = "all"
    customers = "customers"
    repeating_customers = "repeating_customers"
    product = "product"
    manual = "manual"
    archived = "archived"


class EmailSegment(RecordModel):
    __tablename__ = "email_segments"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "slug",
            "deleted_at",
            name="email_segments_org_slug_key",
        ),
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(
        String(30), nullable=False, default=EmailSegmentType.all
    )
    product_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        # SET NULL (not CASCADE) so deleting a product orphans the
        # segment instead of silently nuking the entire segment
        # config. Orphaned segments still render in the UI; the
        # service layer can detect and clean them up explicitly.
        ForeignKey("products.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    filter_rules: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Organization", lazy="raise")

    @declared_attr
    def product(cls) -> Mapped["Product | None"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Product", lazy="raise")
