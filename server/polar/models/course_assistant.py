from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models.course import Course


class CourseAssistant(RecordModel):
    """The AI teaching assistant ("Office Hours" TA) for a single course.

    Lifecycle / snapshot model (v1 — creator preview only)
    ------------------------------------------------------
    The ``draft_*`` / ``live`` snapshot columns and the ``ready_for_review`` →
    approve flow described below belong to the original approval-gated design.
    In that model every build writes to the ``draft_*`` columns, leaves the
    course in ``ready_for_review``, and nothing is served until a creator
    approves it (copying the draft into the serving columns and setting
    ``live``).

    NOTE: this approval gate is no longer on the student path. Students are
    served by the v2 stateless flow, which answers live from the current course
    content gated only by the course's ``assistant_enabled`` setting and an
    active enrollment (see ``course_assistant`` service / endpoints). The
    snapshot/approval columns and methods here are now exercised only by the
    creator-facing *preview* endpoint. They are retained (not deleted) so the
    approval workflow can be reinstated, but do not assume student answers pass
    through them.
    """

    __tablename__ = "course_assistants"

    course_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("courses.id", ondelete="cascade"),
        nullable=False,
        unique=True,
        index=True,
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    # building | ready_for_review | live | failed | disabled
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="building", server_default="building"
    )

    # Whether the assistant is currently serving students. Only ever set true
    # by an explicit approval; the answer endpoint refuses to respond unless
    # this is true (and a serving knowledge base exists).
    live: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Creator-facing identity. Falls back to the course's instructor name when
    # null. The disclaimer is shown to students / used in the system prompt.
    display_name: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None
    )
    disclaimer: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    # Model used for answers (snapshotted at approval for reproducibility).
    model: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)

    # ── Serving snapshot (approved; what students actually get) ──────────────
    knowledge_base: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    voice_card: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    sample_questions: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    knowledge_base_tokens: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    source_lesson_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )

    # ── Draft snapshot (latest build output, awaiting review) ────────────────
    draft_knowledge_base: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    draft_voice_card: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    draft_sample_questions: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    draft_knowledge_base_tokens: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    draft_source_lesson_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )

    # ── Timestamps / provenance / errors ─────────────────────────────────────
    draft_built_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    approved_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    # Latest failure reason (KB too big, no content, build error, ...).
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    @declared_attr
    def course(cls) -> Mapped["Course"]:
        return relationship("Course", lazy="raise")

    @property
    def has_pending_review(self) -> bool:
        """A newer draft exists than what was last approved."""
        if self.draft_built_at is None:
            return False
        if self.approved_at is None:
            return True
        return self.draft_built_at > self.approved_at

    @property
    def is_answerable(self) -> bool:
        """Whether the answer endpoint may serve this assistant."""
        return self.live and bool(self.knowledge_base)
