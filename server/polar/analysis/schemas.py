from datetime import date
from uuid import UUID

from polar.kit.schemas import Schema


class AnalysisSubject(Schema):
    """What the analysis was run on — echoed so the UI never guesses."""

    kind: str  # "article" | "decision"
    id: UUID
    label: str


class AuthorityRow(Schema):
    decision_id: UUID
    reference: str
    decided_on: date
    quote: str | None


class AuthorityAnalysis(Schema):
    """« Vérifier l'autorité » — is this held once, or held repeatedly."""

    subject: AnalysisSubject
    #: The article the count is computed on. Every figure below is relative
    #: to THIS article, so the denominator can be named on screen.
    anchor_article_id: UUID | None
    anchor_label: str | None
    #: Other provisions the subject decision cites, for the header line.
    also_cited: list[str]
    level: str  # "constante" | "limitee" | "isolee" | "aucune"
    decision_count: int
    year_span: int
    label: str
    rows: list[AuthorityRow]


class VersionRow(Schema):
    version_id: UUID
    label: str
    in_force_from: date | None
    in_force_to: date | None
    #: Set when the analysis was asked about a date, and this version governs.
    governs: bool
    #: The article's number in this version, when a concordance is known.
    article_number: str | None
    article_id: UUID | None
    relation: str | None
    note: str | None


class ChangeRow(Schema):
    sign: str  # "+" | "−" | "~"
    kind: str
    alinea: int
    text: str


class HistoryAnalysis(Schema):
    """« Retracer l'historique » — which version governs, and what moved."""

    subject: AnalysisSubject
    act_short_code: str
    versions: list[VersionRow]
    #: Present only when the caller supplied a date.
    governing_label: str | None
    changes: list[ChangeRow]
    #: True when the concordance is known but the texts were not compared
    #: (no equivalence recorded) — the UI must not imply "no change".
    changes_unavailable: bool


class ComparePane(Schema):
    title: str
    version_label: str
    alineas: list[str]
    #: Indexes (1-based) of alinéas that are new or reworded on this side.
    highlighted: list[int]


class CompareAnalysis(Schema):
    """« Comparer les versions » — the two texts, word for word."""

    subject: AnalysisSubject
    left: ComparePane
    right: ComparePane
    changes: list[ChangeRow]
    identical: bool


class CoCitedArticle(Schema):
    article_id: UUID
    label: str
    count: int


class CitationRow(Schema):
    decision_id: UUID
    reference: str
    decided_on: date


class CitationsAnalysis(Schema):
    """« Cartographier les citations » — an article's life in the courts."""

    subject: AnalysisSubject
    decision_count: int
    cited_with: list[CoCitedArticle]
    rows: list[CitationRow]


class AnalysisTarget(Schema):
    """One thing worth running an analysis on, as the corpus ranked it."""

    kind: str  # "article" | "decision"
    id: UUID
    label: str


class AnalysisSuggestions(Schema):
    """Entry points for the Analyses screen, computed from the corpus.

    Four lists, one per analysis, each drawn from what the collection
    actually holds: the most-cited provisions, the judgments that turn on
    the most of them. Nothing here is chosen by hand, so the screen cannot
    drift away from the corpus behind it.
    """

    authority: list[AnalysisTarget]
    history: list[AnalysisTarget]
    compare: list[AnalysisTarget]
    citations: list[AnalysisTarget]
