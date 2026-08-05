from enum import StrEnum
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSequenceStatus(StrEnum):
    draft = "draft"
    active = "active"
    paused = "paused"


class EmailSequenceTriggerType(StrEnum):
    on_subscribe = "on_subscribe"
    on_purchase = "on_purchase"
    on_subscription_created = "on_subscription_created"
    on_subscription_cancelled = "on_subscription_cancelled"
    on_form_submit = "on_form_submit"
    manual = "manual"


class EmailSequence(RecordModel):
    __tablename__ = "email_sequences"
    __table_args__ = (
        Index("ix_email_sequences_organization_id_status", "organization_id", "status"),
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    trigger_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default=EmailSequenceTriggerType.manual
    )
    # e.g. { "product_id": "..." } for on_purchase filter
    trigger_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EmailSequenceStatus.draft
    )

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("Organization", lazy="raise")
