from datetime import date
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Date, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from polar.kit.db.models import RecordModel

from .legal_article import LegalArticle


class CourtDecision(RecordModel):
    """A published court decision (CCJA in v1).

    Carries every identifier practitioners use so search matches how they
    cite: the decision number ("022/2014"), the URN:LEX, and the Ohadata
    J-code ("J-16-198").
    """

    __tablename__ = "court_decisions"
    __table_args__ = (UniqueConstraint("court", "number", "decided_on"),)

    court: Mapped[str] = mapped_column(String(32), nullable=False, default="CCJA")
    # As cited: "022/2014", "221/2025".
    number: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    decided_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    chamber: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    urn_lex: Mapped[str | None] = mapped_column(
        String(256), nullable=True, default=None, unique=True
    )
    ohadata_code: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None, index=True
    )
    source_url: Mapped[str | None] = mapped_column(
        String(512), nullable=True, default=None
    )
    # The Juricaf keyword header verbatim (names the articles applied) — the
    # human-written seed of the citation graph, kept as acquired.
    keyword_header: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    full_text: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    provenance: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    article_links: Mapped[list["DecisionArticleLink"]] = relationship(
        "DecisionArticleLink", back_populates="decision", lazy="raise"
    )


class DecisionArticleTreatment(StrEnum):
    applies = "applies"
    interprets = "interprets"
    distinguishes = "distinguishes"
    cites = "cites"


class TreatmentStatus(StrEnum):
    # No treatment claim may surface in the product unless a human accepted
    # (or corrected) the proposed label. The link itself (the citation) is
    # governed by DecisionLinkStatus; this governs only the HOW label.
    unverified = "unverified"
    proposed = "proposed"
    accepted = "accepted"
    corrected = "corrected"
    rejected = "rejected"


class DecisionLinkStatus(StrEnum):
    # Seeded from a source (e.g. the Juricaf keyword header) but not yet
    # verified against the decision body by a human.
    proposed = "proposed"
    verified = "verified"
    rejected = "rejected"


class DecisionArticleLink(RecordModel):
    """A decision ↔ article edge in the citation graph.

    The article side is a *version-specific* article row, which is what makes
    an edge mean "interprets the 1998 text of art. 160" rather than the
    version-blind "cites art. 160". Nothing with ``status != verified`` may
    surface in the product; links ship decision by decision, verified before
    they enter the graph.
    """

    __tablename__ = "court_decision_article_links"
    __table_args__ = (UniqueConstraint("decision_id", "article_id"),)

    decision_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("court_decisions.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    article_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("legal_articles.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    treatment: Mapped[DecisionArticleTreatment] = mapped_column(
        String(32), nullable=False, default=DecisionArticleTreatment.cites
    )
    treatment_status: Mapped[TreatmentStatus] = mapped_column(
        String(32), nullable=False, default=TreatmentStatus.unverified, index=True
    )
    # Short passage from the decision supporting the proposed treatment label.
    treatment_quote: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    status: Mapped[DecisionLinkStatus] = mapped_column(
        String(32), nullable=False, default=DecisionLinkStatus.proposed, index=True
    )
    # Where the proposed edge came from: "juricaf_header", "manual", "model".
    seed_source: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )
    verified_by_user_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True, default=None
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    decision: Mapped[CourtDecision] = relationship(
        "CourtDecision", back_populates="article_links", lazy="raise"
    )
    article: Mapped[LegalArticle] = relationship("LegalArticle", lazy="raise")
