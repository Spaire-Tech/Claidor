from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from polar.kit.db.models import RecordModel


class WatchTarget(StrEnum):
    """What is being watched. Only things the corpus can actually observe.

    A watch on a topic would need someone to decide what counts as
    relevant; a watch on an article is answerable from the citation graph,
    and a watch on an act is answerable from its versions. Both are facts,
    so both can be reported without judgement.
    """

    article = "article"
    act = "act"


class Veille(RecordModel):
    """A standing question: tell me when this moves."""

    __tablename__ = "veilles"

    organization_id: Mapped[UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    created_by_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="cascade"), nullable=False
    )
    target: Mapped[WatchTarget] = mapped_column(String(16), nullable=False)
    #: The article or act being watched.
    target_id: Mapped[UUID] = mapped_column(nullable=False, index=True)
    #: How it reads on screen, e.g. « Art. 170 (AUPSRVE 1998) ».
    label: Mapped[str] = mapped_column(String(256), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    #: Everything up to here has already been reported. A watch created
    #: today does not fire for ten years of existing case law.
    scanned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )


class VeilleSignal(RecordModel):
    """Something that happened, with what it happened to.

    Signals are facts drawn from the corpus — a decision citing a watched
    article, a new version of a watched act — never an interpretation of
    what the change means for the reader's case.
    """

    __tablename__ = "veille_signals"

    veille_id: Mapped[UUID] = mapped_column(
        ForeignKey("veilles.id", ondelete="cascade"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    #: What to open: a decision or an article.
    source_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    source_id: Mapped[UUID | None] = mapped_column(nullable=True, default=None)
    #: The date of the event itself (the decision's date), not of the scan.
    happened_on: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
