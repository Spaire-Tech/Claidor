from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    ForeignKey,
    Integer,
    String,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from polar.kit.db.models import RecordModel
from polar.kit.utils import utc_now


class QuotaNotification(RecordModel):
    """One row per (organization, quota_key, threshold, period_key) for
    which an alert has been sent. The cron task uses presence of a row
    to know whether the threshold has already been notified for the
    current period and avoids duplicate emails.

    For monthly quotas (video_views_monthly), the period_key is the
    calendar month "YYYY-MM" so notifications reset naturally on the 1st
    of each month.

    For lifetime quotas (storage_gb, video_hours_hosted), period_key is
    the constant "lifetime"; the cron deletes the row when usage drops
    back below the threshold so future crossings can notify again.
    """

    __tablename__ = "quota_notifications"

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    quota_key: Mapped[str] = mapped_column(String(64), nullable=False)
    threshold: Mapped[int] = mapped_column(Integer, nullable=False)
    period_key: Mapped[str] = mapped_column(String(16), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, default=utc_now
    )
