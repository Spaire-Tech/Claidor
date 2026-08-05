from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from polar.kit.db.models import RecordModel


class MasterclassArchitectAnalysis(RecordModel):
    """One run of the Masterclass Architect over a pasted channel.

    Stores derived conclusions only — the resolved channel snapshot, the
    fast-pass mirror, and the gated proposals — never raw video/comment
    dumps (YouTube ToS stance; see docs/plans/masterclass-architect-plan.md).
    """

    __tablename__ = "masterclass_architect_analyses"

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    # What the creator pasted, verbatim (funnel data even when unresolvable).
    input_ref: Mapped[str] = mapped_column(String(500), nullable=False)

    # queued | mirror_ready | completed | failed (orchestration.py owns these)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="queued", index=True
    )
    # AnalysisFailure value when status == failed.
    failure_reason: Mapped[str | None] = mapped_column(
        String(30), nullable=True, default=None
    )

    # The resolved YouTube channel id (UC…) — reuse-window lookups.
    external_channel_id: Mapped[str | None] = mapped_column(
        String(40), nullable=True, default=None, index=True
    )
    # Resolved channel snapshot: title, handle, about, avatar_url,
    # subscriber_count, video_count, created_at — the instant confirmation.
    channel: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    # The creator's optional answer to "what do people keep asking you
    # about?" — PATCHable while the analysis runs; the deep pass re-reads it
    # just before building evidence.
    faq_answer: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    # Fast-pass output (pure stats): highlights + channel header.
    mirror: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    # Deep-pass output, post anti-fabrication gate: proposals, banked
    # themes, flagship flag, mirror_pattern, no_proposal_reason.
    proposals: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )

    recipe_version: Mapped[str | None] = mapped_column(
        String(40), nullable=True, default=None
    )
    # Receipt violations stripped by the gate — a launch health metric.
    receipt_violation_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )

    mirror_ready_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
