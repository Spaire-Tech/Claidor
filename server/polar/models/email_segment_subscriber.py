from uuid import UUID

from sqlalchemy import ForeignKey, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSegmentSubscriber(RecordModel):
    __tablename__ = "email_segment_subscribers"
    __table_args__ = (
        UniqueConstraint(
            "segment_id",
            "subscriber_id",
            "deleted_at",
            name="email_segment_subscribers_seg_sub_key",
        ),
    )

    segment_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_segments.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    subscriber_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_subscribers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    @declared_attr
    def segment(cls) -> Mapped["EmailSegment"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSegment", lazy="raise")

    @declared_attr
    def subscriber(cls) -> Mapped["EmailSubscriber"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSubscriber", lazy="raise")
