"""The clause failure registry: court opinions, and what they did to a clause.

The asset the product runs on. Each finished entry says: *this kind of
clause, worded this way, went to court in this jurisdiction, and the court
did this to it — here is the judgment.*

These first two tables cover step one of the pipeline, harvesting. An
opinion is a court document we hold verbatim; a candidate is one opinion
considered against one doctrine, because the same judgment can be relevant
to several and irrelevant to others.

Nothing here holds client data, and nothing ever will. A firm's documents
are never a source for the registry — which is why the data-rights problem
that sinks feedback-derived datasets does not apply to it.

See ``docs/registry/plan.md``.
"""

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from polar.kit.db.models import RecordModel


class OpinionSource(StrEnum):
    """Where an opinion's text came from.

    Recorded per row rather than assumed, because coverage differs: the
    CourtListener API reaches recent unpublished appellate memoranda that
    the Caselaw Access Project — book-published material — never had.
    """

    courtlistener = "courtlistener"
    caselaw_access_project = "cap"
    manual = "manual"


class RegistryOpinion(RecordModel):
    """One court opinion, held verbatim.

    The opinion is the evidence. Everything downstream — the clause
    wording, the treatment, the reason — is derived from this text and must
    be checkable against it, so it is stored once and never rewritten.

    US judicial opinions are not subject to copyright (the government
    edicts doctrine), and this table holds opinion text only. West and
    Lexis editorial layers — headnotes, syllabi, key numbers — are
    deliberately absent; that boundary is what keeps the registry clear of
    the risk *Thomson Reuters v. Ross Intelligence* turned on.
    """

    __tablename__ = "registry_opinions"
    __table_args__ = (
        UniqueConstraint(
            "source", "source_id", name="registry_opinions_source_source_id_key"
        ),
        Index("ix_registry_opinions_court_id", "court_id"),
        Index("ix_registry_opinions_date_filed", "date_filed"),
    )

    source: Mapped[OpinionSource] = mapped_column(String(32), nullable=False)
    #: The upstream identifier, e.g. a CourtListener opinion id. Unique per
    #: source, so re-running the harvest updates rather than duplicates.
    source_id: Mapped[str] = mapped_column(String(64), nullable=False)
    #: Where a human can read the same document. Provenance is not optional:
    #: every claim the registry makes has to be traceable to a public URL.
    source_url: Mapped[str] = mapped_column(Text, nullable=False)

    #: A search result is a *cluster* — one case, which may hold a lead
    #: opinion, concurrences and dissents. We store one row per opinion,
    #: because text and identifiers are per-opinion, and keep the cluster
    #: id so the pieces of one case regroup.
    cluster_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None, index=True
    )
    #: "combined-opinion", "lead-opinion", "dissent", "concurrence"…
    #: Load-bearing, not decorative: a clause "struck down" according to a
    #: dissent was not struck down at all, and an entry built from one
    #: would be the worst kind of error this registry can make.
    opinion_type: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )

    case_name: Mapped[str] = mapped_column(Text, nullable=False)
    #: CourtListener's court identifier, e.g. "txctapp5". Kept raw rather
    #: than mapped to a tidy enum: the authoritative list has 3,361 entries
    #: and inventing our own taxonomy would lose the parent/child structure
    #: that makes "all Texas courts of appeals" a single query.
    court_id: Mapped[str] = mapped_column(String(32), nullable=False)
    court_name: Mapped[str] = mapped_column(Text, nullable=False)
    date_filed: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    docket_number: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    #: Reporter citations as the source gives them. Frequently empty: a
    #: large share of recent Texas appellate memoranda are unpublished and
    #: carry no S.W.3d cite at all.
    citations: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=None)
    #: Published, Unpublished, Errata… as reported upstream.
    precedential_status: Mapped[str | None] = mapped_column(
        String(32), nullable=True, default=None
    )

    #: The opinion itself. Null until the text has been fetched — harvesting
    #: the candidate list and fetching full text are separate steps, and a
    #: candidate with no text yet is an honest state rather than a failure.
    plain_text: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    #: SHA-256 of ``plain_text``. Lets a later re-fetch prove the text we
    #: reasoned over is the text still published.
    text_sha256: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    text_fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    candidates: Mapped[list["RegistryCandidate"]] = relationship(
        "RegistryCandidate", back_populates="opinion", lazy="raise"
    )


class ScreeningVerdict(StrEnum):
    """Whether an opinion actually turns on the doctrine.

    Most hits mention a doctrine in passing. ``pending`` is the state after
    harvesting and before screening — kept explicit so an unscreened
    candidate can never be mistaken for a rejected one.
    """

    pending = "pending"
    on_point = "on_point"
    not_on_point = "not_on_point"
    uncertain = "uncertain"


class RegistryCandidate(RecordModel):
    """One opinion considered against one doctrine.

    Separate from the opinion because relevance is per-doctrine: a judgment
    disposing of several clauses is on point for one and noise for another.

    The row is written at harvest time, before anything has read the case,
    so that the set considered is recoverable later. A registry that
    remembers only what it accepted cannot answer « what did you look at
    and reject? », and that question is the whole reason the assessment
    ledger exists.
    """

    __tablename__ = "registry_candidates"
    __table_args__ = (
        UniqueConstraint(
            "opinion_id", "doctrine", name="registry_candidates_opinion_doctrine_key"
        ),
        Index("ix_registry_candidates_doctrine_verdict", "doctrine", "verdict"),
    )

    opinion_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("registry_opinions.id", ondelete="cascade"), nullable=False
    )
    #: Doctrine slug, e.g. "tx-express-negligence". Defined in code
    #: (``polar.registry.doctrines``) rather than in a table: a doctrine is
    #: a query plus a rule plus prose, none of which belongs in a row.
    doctrine: Mapped[str] = mapped_column(String(64), nullable=False)

    #: Which query found it, so a change in recall can be traced to the
    #: phrasing that caused it.
    found_by_query: Mapped[str] = mapped_column(Text, nullable=False)
    #: Upstream relevance rank, purely diagnostic.
    search_rank: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    #: The snippet the search returned — useful when reviewing screening
    #: decisions without opening the whole opinion.
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    verdict: Mapped[ScreeningVerdict] = mapped_column(
        String(32), nullable=False, default=ScreeningVerdict.pending
    )
    #: Why, in the screener's own words. An unexplained rejection is
    #: indistinguishable from a bug.
    verdict_reason: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    #: Model and prompt that produced the verdict, so a systematic bias
    #: found later can be re-audited against the exact configuration.
    verdict_model: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    verdict_prompt_sha: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    screened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    opinion: Mapped[RegistryOpinion] = relationship(
        "RegistryOpinion", back_populates="candidates", lazy="raise"
    )
