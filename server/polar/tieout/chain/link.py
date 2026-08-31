"""The confirmed-link store — D4's contract, persisted as rows.

The shape is the one approved from the Scribe log at the twenty-fourth
sweep, including the `value_at_confirmation` amendment registered when
the measurement found the proposed schema could not say *which side*
moved.

**One sentence the track rests on:** a person confirms that a model
cell comes from a document figure; from then on, re-checking that pair
is arithmetic — every time, on every revision, with no inference of any
kind. What is stored here is therefore human input, never engine
output: a row exists because somebody acted.

**There is no « proposed » state.** A proposal is computed on demand by
`propose.py` and never written down, so the presence of a row always
means a person confirmed, rejected, or a re-anchor found trouble.
`broken` and `ambiguous` are set by re-anchoring — by
:mod:`polar.tieout.chain.anchor`, which guesses nothing — and never by
a matcher.

**Anchors are labels; refs and pages are citations.** `cell_name` and
`anchor_line` are what re-finds this pair in a later version.
`model_ref` and `page` are recorded so a screen can cite the thing, and
they are deliberately *not* used to locate it: somebody inserts a row
and a ref is wrong while the figure it named has not moved at all.

**Values are stored to report, never to locate.** Both
`value_at_confirmation` columns exist so the re-check can say which
side moved. Nothing in this package searches by value; that asymmetry
is the whole of D4's design, and the log records why.
"""

import enum
from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from polar.kit.db.models import RecordModel


class LinkState(enum.StrEnum):
    """Why a row exists. Every value means a person or a re-anchor acted.

    There is no « proposed »: see the module docstring.
    """

    #: A person vouched for this pair.
    confirmed = "confirmed"
    #: A person was shown this pair and said no. Kept, so the same
    #: proposal is not put to them twice.
    rejected = "rejected"
    #: Re-anchoring could not find one side in a later version. Set by
    #: `anchor.py`, never by a guess.
    broken = "broken"
    #: Re-anchoring found several candidates the anchor cannot
    #: separate. A person decides; the link is never re-pointed
    #: silently, because a wrongly re-pointed link is worse than a
    #: broken one — nobody goes looking for it.
    ambiguous = "ambiguous"


class ChainLink(RecordModel):
    """One confirmed link: a model cell, a document figure, a person."""

    __tablename__ = "tieout_chain_links"
    __table_args__ = (
        #: Every read is scoped by the deal, so every read starts here.
        Index("ix_tieout_chain_links_dossier_state", "dossier_id", "state"),
    )

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("dossiers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    state: Mapped[LinkState] = mapped_column(
        String(32), nullable=False, default=LinkState.confirmed
    )

    # --- the document side --------------------------------------------

    #: The artifact lineage: the document across all its versions.
    document_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    #: The exact upload confirmed against — `tieout_artifacts.id`.
    document_version_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    #: The chain fact as confirmed. Stable *within* its version by
    #: construction; deliberately NOT the anchor across versions.
    fact_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tieout_chain_facts.id", ondelete="set null"),
        nullable=True,
        index=True,
    )
    #: Citation only. A page number is a coordinate.
    page: Mapped[int] = mapped_column(Integer, nullable=False)
    #: The token exactly as printed — and the precision the re-check
    #: compares at, since a document states what it states.
    printed_text: Mapped[str] = mapped_column(String(128), nullable=False)
    #: THE document-side anchor: the printed line the figure sat in.
    anchor_line: Mapped[str] = mapped_column(Text, nullable=False)
    #: Which number within that line (1st, 2nd…) — the tiebreak.
    ordinal_in_line: Mapped[int] = mapped_column(Integer, nullable=False)
    #: The amendment: what the document said when the person vouched.
    document_value_at_confirmation: Mapped[float] = mapped_column(Float, nullable=False)

    # --- the model side ------------------------------------------------

    #: The workbook lineage.
    model_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    model_version_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    cell_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    #: « Model!D26 » at confirmation. Citation, never the anchor.
    model_ref: Mapped[str] = mapped_column(String(128), nullable=False)
    #: « FY2025A Adjusted EBITDA » — the engine's own `Cell.name`, and
    #: THE model-side anchor, exactly as `FigureLink.cell_name` is.
    cell_name: Mapped[str] = mapped_column(Text, nullable=False)
    #: The amendment: what the cell held when the person vouched.
    model_value_at_confirmation: Mapped[float] = mapped_column(Float, nullable=False)

    # --- what the person stated ----------------------------------------

    #: A named deterministic function; « identity » today. The engine's
    #: own extension channel, same vocabulary as
    #: `FigureLink.transformation`, so one re-check serves both.
    transformation: Mapped[str] = mapped_column(
        String(64), nullable=False, default="identity"
    )
    #: document value × scale = model value. **The person states it at
    #: confirmation; Swens never infers it.** Unit inference is Track
    #: E's, and this column is deliberately the boundary.
    scale: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    #: Reported / adjusted / pro forma, and the period. Carried because
    #: the same two numbers on different bases are not in disagreement.
    basis: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: What the person wanted the next reader to know.
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")

    confirmed_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True
    )
    confirmed_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False
    )
