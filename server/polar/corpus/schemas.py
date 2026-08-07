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


class CorpusSimilarDecision(Schema):
    """Another decision turning on the same provisions."""

    decision_id: UUID4
    number: str
    decided_on: date
    #: How many provisions the two decisions share — the whole basis of
    #: the claim, shown so it is never mistaken for an opinion.
    shared_articles: int


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
    #: Extracted verbatim from the judgment (see decision_summary.py), or
    #: absent when its structure was not recognised. Never generated.
    argued: str | None = None
    held: str | None = None
    similar: list[CorpusSimilarDecision] = []


class CorpusSearchInterpretation(Schema):
    """How Claidor read the query — shown back, so it is never a mystery.

    A lawyer who types « article 170 AUPSRVE » and gets a topic list should
    see at once that the query was read as a topic, not as a citation.
    """

    kind: str = Field(description="article | decision | text")
    number: str | None = None
    act_code: str | None = None
    year: int | None = None


class CorpusSearchArticleResult(Schema):
    id: UUID4
    number: str
    act_short_code: str
    act_title: str
    version_label: str
    in_force_from: date | None
    excerpt: str
    exact: bool = Field(
        default=False, description="An exact citation landing, not a text match."
    )


class CorpusSearchDecisionResult(Schema):
    id: UUID4
    number: str
    decided_on: date
    chamber: str | None
    keyword_header: str | None
    excerpt: str
    exact: bool = False


class CorpusSearchResults(Schema):
    interpretation: CorpusSearchInterpretation
    articles: list[CorpusSearchArticleResult]
    decisions: list[CorpusSearchDecisionResult]
    chambers: list[str] = Field(
        default_factory=list, description="Distinct chambers, for the filter UI."
    )
