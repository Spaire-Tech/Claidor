from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSubscriberCustomField(RecordModel):
    """Custom key/value pairs on email subscribers.

    Written by the sequence `update-field` action and read by audience and
    branch evaluators as those grow `custom_field` support. Soft-deleted on
    removal so the historical value isn't lost.
    """

    __tablename__ = "email_subscriber_custom_fields"
    __table_args__ = (
        UniqueConstraint(
            "subscriber_id",
            "key",
            "deleted_at",
            name="email_subscriber_custom_fields_subscriber_key_key",
        ),
        Index(
            "ix_email_subscriber_custom_fields_key",
            "key",
        ),
    )

    subscriber_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_subscribers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    value: Mapped[str | None] = mapped_column(String(512), nullable=True)
    set_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )

    @declared_attr
    def subscriber(cls) -> Mapped["EmailSubscriber"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSubscriber", lazy="raise")
