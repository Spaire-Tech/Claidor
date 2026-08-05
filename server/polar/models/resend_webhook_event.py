from datetime import datetime

from sqlalchemy import TIMESTAMP, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from polar.kit.db.models import RecordModel


class ResendWebhookEvent(RecordModel):
    """Idempotency log for Resend webhook deliveries.

    Svix retries failed webhooks; every retry resends the same ``svix-id``.
    Without dedup, each retry would increment ``open_count`` / ``click_count``
    again. We insert before processing and skip on UNIQUE conflict.
    """

    __tablename__ = "resend_webhook_events"
    __table_args__ = (
        UniqueConstraint(
            "webhook_event_id",
            name="resend_webhook_events_webhook_event_id_key",
        ),
    )

    webhook_event_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    email_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, default=None
    )
    processed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
