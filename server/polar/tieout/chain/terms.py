"""The terms table — the Grid's second use of extraction, persisted.

`swens.md` § 3d, the whole specification: « pulling the terms out of
the contracts, term sheets and quotes into a structured table, so the
model's inputs can be tested against them at scale rather than one at
a time. » The agreed shape is `docs/pierce/terms-table-shape.md`;
where this file and that document disagree, the document wins and the
disagreement is a defect here.

A term is a named quantity a banker would recognise from the term
sheet — a margin, a facility amount, a tenor, a covenant level. The
table is **a curation layer over the fact store plus the confirm-once
mechanic applied table-wise**, and three rules carry over from the
rest of the Chain unchanged, because they are the product:

- **A row exists because a person acted.** Extraction *ranks*
  candidates for picking (:func:`rank`); it never elects one. An
  automatic « this looks like a term » classifier would be a new
  inference with a new false-positive budget, and quietness is the
  product — the shape document records this as the founder's first
  decision, decided.
- **Values locate nothing; they only report.** The model side anchors
  by the cell's own name, the document side by the printed line —
  exactly `anchor.py`'s rules, which this module calls rather than
  re-implements.
- **Nothing is inferred at the boundary.** The scale, the basis and
  the supersession of a term are a person's statements, stored as
  such. A typed term (one extraction refused or missed — the
  spread-table case) records who typed it and compares at its stated
  value forever, because there is no printed line to re-read.

What this deliberately is not: a matcher. Binding a term to a model
input is a person's act, assisted by the same proposal machinery D3
serves, and this module never chooses a cell.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, Float, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from polar.kit.db.models import RecordModel

from .propose import is_reference, label_tokens

#: Who put the row's document side on the record. `extracted` rows
#: carry a fact id and a printed line and re-anchor across document
#: versions; `typed` rows are a person supplying what geometry
#: withheld — cited to a page, compared at the stated value, and
#: honest about not being re-readable.
STATED_EXTRACTED = "extracted"
STATED_TYPED = "typed"

#: A printed token that carries its own unit mark — a currency symbol,
#: a percent, or a scale suffix on the digits (« 3.4m », « 2bn »).
#: Ranked above bare counts when candidates are ordered, because a
#: quantity that states its unit is more often a term of the deal than
#: a « 3 » in prose.
_UNIT_MARK = re.compile(r"[£$€%]|\d(?:bn|m|k)[.,;:]?$", re.IGNORECASE)


class ChainTerm(RecordModel):
    """One term of the deal: a named quantity, cited, and testable.

    The document side mirrors `ChainLink`'s — same anchors, same
    citation columns, same `value` semantics — so the one re-anchoring
    vocabulary serves both. The model side is nullable as a group: a
    term exists the moment a person picks or types it, and is bound to
    a model input by a second, separate act.
    """

    __tablename__ = "tieout_chain_terms"
    __table_args__ = (
        #: Every read is scoped by the deal, so every read starts here.
        Index("ix_tieout_chain_terms_dossier_created", "dossier_id", "created_at"),
    )

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("dossiers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    #: The term's name — the printed line (plus its column header where
    #: tabular) by default, a person's correction when they gave one.
    #: Always printed or typed words; never an inference.
    name: Mapped[str] = mapped_column(Text, nullable=False)

    #: :data:`STATED_EXTRACTED` or :data:`STATED_TYPED`.
    stated: Mapped[str] = mapped_column(String(16), nullable=False)

    # --- the document side (as ChainLink holds it) ---------------------

    #: The artifact lineage: the document across all its versions.
    document_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    #: The exact upload the term was stated from — `tieout_artifacts.id`.
    document_version_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    #: The chain fact a picked term came from; null for typed terms.
    fact_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("tieout_chain_facts.id", ondelete="set null"),
        nullable=True,
        index=True,
    )
    #: Citation only. A page number is a coordinate.
    page: Mapped[int] = mapped_column(Integer, nullable=False)
    #: The token exactly as printed (or typed) — and the precision every
    #: comparison of this term happens at.
    printed_text: Mapped[str] = mapped_column(String(128), nullable=False)
    #: The document-side anchor: the printed line the figure sat in.
    #: Empty for typed terms — there is nothing printed to re-find.
    anchor_line: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: Which number within that line — the re-anchoring tiebreak.
    ordinal_in_line: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: The column header above the figure, where the page had one.
    column: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: The parsed magnitude as stated. Reported, never used to locate.
    value: Mapped[float] = mapped_column(Float, nullable=False)

    # --- lifecycle: supersession is a person's statement ----------------

    #: « The amended agreement now governs; this term sheet figure no
    #: longer does. » Set and cleared by a person, on the record, never
    #: guessed from document dates.
    superseded_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    superseded_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True
    )
    superseded_note: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # --- the model side: bound by a person, nullable as a group ---------

    model_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    model_version_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="set null"),
        nullable=True,
    )
    cell_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    #: « Inputs!D19 » at binding. Citation, never the anchor.
    model_ref: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    #: The engine's own `Cell.name` — THE model-side anchor. Empty means
    #: unbound, which the check reports as « untested », the coverage
    #: gap `swens.md` § 3a's fourth principle requires on the face.
    cell_name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: What the cell held when the person bound it.
    model_value_at_confirmation: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    # --- what the person stated at binding ------------------------------

    #: document value × scale = model value. Stated, never inferred —
    #: unit inference is Track E's, and this column is the boundary.
    scale: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    basis: Mapped[str] = mapped_column(Text, nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True
    )
    confirmed_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )


@dataclass(frozen=True)
class CandidateSignals:
    """Why a fact ranks where it ranks — shown, so the ordering is
    inspectable rather than asserted. Each is geometry or the matcher's
    own registered rules; none is a new inference."""

    #: Its line carries label words — without them a term has no name.
    labelled: bool
    #: A column header stands above it: a table cell, not prose.
    tabular: bool
    #: Its number reads as a document reference (« Table 14 »,
    #: « SpC 3.2 ») under the matcher's registered rule — ranked last,
    #: never hidden.
    reference: bool
    #: It prints its own unit mark (%, a currency symbol, a scale
    #: suffix on the digits).
    unit_marked: bool


def signals_for(line: str, column: str, text: str) -> CandidateSignals:
    """One fact's picking signals, from what the page printed."""
    return CandidateSignals(
        labelled=bool(label_tokens(line)),
        tabular=bool(column.strip()),
        reference=is_reference(text, line),
        unit_marked=bool(_UNIT_MARK.search(text)),
    )


def rank(entries: Sequence[tuple[str, str, str]]) -> list[tuple[int, CandidateSignals]]:
    """Order a document's facts for a person picking terms.

    ``entries`` are ``(line, column, text)`` in reading order. Returns
    ``(index, signals)`` best-first: labelled before unlabelled (a term
    needs a name), non-references before references, tabular before
    prose, unit-marked before bare counts — reading order breaking
    ties, so the ordering is stable and a person scanning the list
    walks the document top to bottom within each band.

    This is assistance for a person's pick, not an inference: nothing
    is excluded, nothing is elected, and every row shows its signals.
    """
    scored = [
        (index, signals_for(line, column, text))
        for index, (line, column, text) in enumerate(entries)
    ]
    return sorted(
        scored,
        key=lambda pair: (
            not pair[1].labelled,
            pair[1].reference,
            not pair[1].tabular,
            not pair[1].unit_marked,
            pair[0],
        ),
    )


def default_name(line: str, column: str) -> str:
    """What a picked term is called until a person renames it.

    The printed line names the row; the column header, where the page
    had one, names the column — both printed there, neither inferred.
    """
    if column.strip():
        return f"{line} — {column}"
    return line
