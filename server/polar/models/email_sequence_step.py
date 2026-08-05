from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel


class EmailSequenceStep(RecordModel):
    __tablename__ = "email_sequence_steps"
    __table_args__ = (
        Index("ix_email_sequence_steps_sequence_id", "sequence_id"),
    )

    sequence_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("email_sequences.id", ondelete="cascade"),
        nullable=False,
    )
    # Ordering position within the sequence (0-based)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Hours to wait after enrollment (step 0) or after previous step (step N)
    delay_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(100), nullable=False)
    sender_email: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    reply_to_email: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    content_html: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # Reserved for future rich editor (Tiptap/Lexical JSON)
    content_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    # Stable client-authored id linking this row to a node in the flow_doc.
    # The editor materialises flow_doc email nodes into rows; we use this id
    # to align desired↔server steps on save (instead of array position, which
    # silently drifts after the first reorder/delete). Optional for legacy
    # rows authored before flow_doc existed; new rows always set it.
    flow_step_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None, index=True
    )

    @declared_attr
    def sequence(cls) -> Mapped["EmailSequence"]:  # type: ignore[name-defined]  # noqa: F821
        return relationship("EmailSequence", lazy="raise")
