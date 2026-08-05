from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailBroadcastABWinnerMetric(StrEnum):
    open_rate = "open_rate"
    click_rate = "click_rate"


class EmailBroadcastABVariant(StrEnum):
    a = "a"
    b = "b"


class EmailBroadcastABTest(RecordModel):
    __tablename__ = "email_broadcast_ab_tests"
    __table_args__ = (
        UniqueConstraint(
            "broadcast_id",
            "deleted_at",
            name="email_broadcast_ab_tests_broadcast_key",
        ),
        Index(
            "ix_email_broadcast_ab_tests_broadcast_id",
            "broadcast_id",
        ),
    )

    broadcast_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_broadcasts.id", ondelete="cascade"),
        nullable=False,
    )
    subject_b: Mapped[str] = mapped_column(String(255), nullable=False)
    slice_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    decide_after_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=240
    )
    winner_metric: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EmailBroadcastABWinnerMetric.open_rate
    )
    winner_variant: Mapped[str | None] = mapped_column(
        String(1), nullable=True, default=None
    )
    test_sent_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    winner_picked_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    @declared_attr
    def broadcast(cls) -> Mapped["EmailBroadcast"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailBroadcast", lazy="raise")
