from datetime import date

from pydantic import UUID4, Field

from polar.kit.schemas import Schema
from polar.models.legal_act import ArticleEquivalenceRelation


class CorpusActVersion(Schema):
    """One temporal expression of an act, as shown on the act page."""

    id: UUID4
    label: str = Field(description="Human label practitioners use: '1998', '2023'.")
    adopted_on: date | None
    in_force_from: date | None
    gazette_reference: str | None
    transitional_rule: str | None
    article_count: int = Field(description="Number of loaded articles.")


class CorpusAct(Schema):
    """A uniform act with its loaded versions."""

    id: UUID4
    short_code: str
    title: str
    versions: list[CorpusActVersion]


class CorpusArticleListItem(Schema):
    """Sidebar-weight article entry: numbers only, no text."""

    id: UUID4
    number: str
    sort_key: int
    heading: str | None


class CorpusArticleEquivalence(Schema):
    """Counterpart of an article in the other version of the act."""

    article_id: UUID4
    number: str
    version_label: str
    relation: ArticleEquivalenceRelation
    note: str | None


class CorpusLinkedDecision(Schema):
    """A decision with a verified link to the article."""

    id: UUID4
    number: str
    decided_on: date
    summary: str | None
    # Always None for now: no treatment has been human-accepted yet.
    treatment: str | None


class CorpusProvenance(Schema):
    """Where the article text came from and how it was verified."""

    source: str | None
    kind: str | None
    authority_crosscheck: str | None


class CorpusArticleDetail(Schema):
    """Full article detail for the reading room hub page."""

    id: UUID4
    number: str
    heading: str | None
    text: str
    alineas: list[str] = Field(
        description="Structured alinéa breakdown, falling back to text lines."
    )
    version_label: str
    act_short_code: str
    provenance: CorpusProvenance | None
    equivalences: list[CorpusArticleEquivalence]
    decisions: list[CorpusLinkedDecision]


class CorpusDecisionArticle(Schema):
    """An article cited by a decision (verified link)."""

    article_id: UUID4
    number: str
    version_label: str


class CorpusDecisionDetail(Schema):
    """Full decision detail for the reading room decision page."""

    id: UUID4
    number: str
    decided_on: date
    chamber: str | None
    urn_lex: str | None
    ohadata_code: str | None
    source_url: str | None
    summary: str | None
    full_text: str | None
    articles: list[CorpusDecisionArticle]
