from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSubscriberStatus(StrEnum):
    active = "active"
    unsubscribed = "unsubscribed"
    archived = "archived"
    invalid = "invalid"


class EmailSubscriberSource(StrEnum):
    space_signup = "space_signup"
    lead_magnet = "lead_magnet"
    purchase = "purchase"
    manual = "manual"
    import_ = "import"


class EmailSubscriber(RecordModel):
    __tablename__ = "email_subscribers"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "email",
            "deleted_at",
            name="email_subscribers_org_email_key",
        ),
        Index(
            "ix_email_subscribers_organization_id_status",
            "organization_id",
            "status",
        ),
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str | None] = mapped_column(String(256), nullable=True, default=None)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EmailSubscriberStatus.active
    )
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EmailSubscriberSource.space_signup
    )
    import_source: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default=None
    )
    customer_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("customers.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    unsubscribed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    # Best-effort IANA timezone name (e.g. "America/New_York"). When set and
    # the parent sequence opts into respect_timezone, send-window deferrals
    # are computed in this tz instead of UTC. NULL falls back to UTC.
    timezone: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Organization", lazy="raise")

    @declared_attr
    def customer(cls) -> Mapped["Customer | None"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Customer", lazy="raise")
