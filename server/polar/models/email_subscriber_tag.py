from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSubscriberTag(RecordModel):
    """First-class tags on email subscribers.

    Tags are scoped to a subscriber (which is itself scoped to an organisation
    via FK), so the (subscriber_id, tag) pair is unique. Branches and actions
    in sequences read/write through this table.
    """

    __tablename__ = "email_subscriber_tags"
    __table_args__ = (
        UniqueConstraint(
            "subscriber_id",
            "tag",
            "deleted_at",
            name="email_subscriber_tags_subscriber_tag_key",
        ),
        Index(
            "ix_email_subscriber_tags_tag",
            "tag",
        ),
    )

    subscriber_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_subscribers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    tag: Mapped[str] = mapped_column(String(80), nullable=False)
    added_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )

    @declared_attr
    def subscriber(cls) -> Mapped["EmailSubscriber"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSubscriber", lazy="raise")
