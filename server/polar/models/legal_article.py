from uuid import UUID

from sqlalchemy import ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from polar.kit.db.models import RecordModel

from .legal_act import ArticleEquivalenceRelation, LegalActVersion


class LegalArticle(RecordModel):
    """One article of one act *version*.

    An article row always belongs to a specific ``LegalActVersion`` — there is
    no version-less article text anywhere in the system, because "what does
    Article 157 say" is only answerable relative to a version.
    """

    __tablename__ = "legal_articles"
    __table_args__ = (UniqueConstraint("act_version_id", "number"),)

    act_version_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("legal_act_versions.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    # Article number as cited, including compound numbers: "157", "157-1", "335".
    number: Mapped[str] = mapped_column(String(32), nullable=False)
    # Numeric ordering key (parsed from number) so "157-1" sorts after "157"
    # and before "158" without string-sort surprises.
    sort_key: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heading: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # Canonical French text of the article, alinéas separated by newlines.
    text: Mapped[str] = mapped_column(Text, nullable=False)
    # Akoma Ntoso element id within the expression (e.g. "art_157"), when the
    # source was structured XML.
    akn_eid: Mapped[str | None] = mapped_column(
        String(128), nullable=True, default=None
    )
    # Structured alinéa breakdown and any source-specific metadata.
    structure: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    # Where this text came from and how it was verified — provenance is part
    # of the product's trust claim, so it lives on the row, not in a log.
    provenance: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    act_version: Mapped[LegalActVersion] = relationship("LegalActVersion", lazy="raise")


class LegalArticleEquivalence(RecordModel):
    """Old↔new concordance between articles of two versions of an act.

    This is the table practitioners will test first: "article 172 of the 1998
    act — where is it in 2023?". Relations follow
    :class:`ArticleEquivalenceRelation`; split/merged pairs produce multiple
    rows sharing the same source or target.
    """

    __tablename__ = "legal_article_equivalences"
    __table_args__ = (UniqueConstraint("old_article_id", "new_article_id"),)

    old_article_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("legal_articles.id", ondelete="cascade"),
        nullable=True,
        index=True,
    )
    new_article_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("legal_articles.id", ondelete="cascade"),
        nullable=True,
        index=True,
    )
    relation: Mapped[ArticleEquivalenceRelation] = mapped_column(
        String(32), nullable=False
    )
    # What changed, in plain language — feeds the "ce qui a changé" surface.
    note: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    old_article: Mapped[LegalArticle | None] = relationship(
        "LegalArticle", foreign_keys=[old_article_id], lazy="raise"
    )
    new_article: Mapped[LegalArticle | None] = relationship(
        "LegalArticle", foreign_keys=[new_article_id], lazy="raise"
    )
