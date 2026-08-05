from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.community_event import CommunityEvent
    from polar.models.customer import Customer


class CommunityEventRsvp(RecordModel):
    """One RSVP per (event, customer). Soft-deletion is inherited from
    RecordModel so an unrsvp is a tombstone — we recompute rsvp_count on
    every toggle from the live (non-deleted) set."""

    __tablename__ = "community_event_rsvps"
    __table_args__ = (
        Index(
            "ix_community_event_rsvps_event_customer",
            "event_id",
            "customer_id",
            "deleted_at",
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )

    event_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("community_events.id", ondelete="cascade"),
        nullable=False,
    )

    customer_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("customers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    @declared_attr
    def event(cls) -> Mapped["CommunityEvent"]:
        return relationship("CommunityEvent", lazy="raise")

    @declared_attr
    def customer(cls) -> Mapped["Customer"]:
        return relationship("Customer", lazy="raise")
