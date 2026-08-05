from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import TIMESTAMP, Boolean, ForeignKey, Index, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel
from polar.types import JSONDict

if TYPE_CHECKING:
    from polar.models.customer import Customer


class CustomerNotification(RecordModel):
    """In-portal notification for a Customer. Separate from the org-side
    `notifications` table because customers and users are different
    subjects with different identity columns and different read surfaces.

    `read_at` is nullable; unread = NULL. The bell badge query is a
    count where read_at IS NULL AND deleted_at IS NULL."""

    __tablename__ = "customer_notifications"
    __table_args__ = (
        Index(
            "ix_customer_notifications_unread",
            "customer_id",
            "read_at",
            postgresql_where="deleted_at IS NULL",
        ),
    )

    customer_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("customers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[JSONDict] = mapped_column(JSONB, nullable=False, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    @declared_attr
    def customer(cls) -> Mapped["Customer"]:
        return relationship("Customer", lazy="raise")


class CustomerNotificationPreferences(RecordModel):
    """Per-customer global notification toggles. Two booleans:

    - `email_enabled`: gate the email channel (default True)
    - `bell_enabled`:  gate the in-portal bell row (default True)

    A missing row means defaults (both True). The settings UI lets the
    customer toggle either independently."""

    __tablename__ = "customer_notification_preferences"

    customer_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("customers.id", ondelete="cascade"),
        nullable=False,
        unique=True,
    )

    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    bell_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    @declared_attr
    def customer(cls) -> Mapped["Customer"]:
        return relationship("Customer", lazy="raise")
