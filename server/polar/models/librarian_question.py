from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from polar.kit.db.models import RecordModel

from .dossier import QuestionStatus


class LibrarianQuestion(RecordModel):
    """A question asked outside any matter, and what was answered.

    Questions asked inside a dossier are already kept as the matter's
    record. Everything asked from the Assistant vanished when the tab
    closed — which made Historique a screen that could only ever show the
    current session, and lost the one thing a lawyer wants to find again:
    the answer they read last week.

    Kept per user and per workspace, with the same honesty as a matter's
    record: the row is written when the question is asked, so a question
    survives even when the answer fails, and a clarification is stored as
    what it was rather than as an answer.
    """

    __tablename__ = "librarian_questions"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    status: Mapped[QuestionStatus] = mapped_column(
        String(32), nullable=False, default=QuestionStatus.answered
    )
    #: Act versions the answer relied on, e.g. ["1998"].
    versions_used: Mapped[list | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    #: What the answer stood on, as it was shown when it was given: one
    #: entry per citation, with the quote that was verified against the
    #: source text. Kept because an answer reopened next week without its
    #: citations is a claim rather than a record, and a legal conclusion
    #: with nothing under it is the one thing Claidor never shows.
    sources: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=None)
    authority_label: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    authority_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    answered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
