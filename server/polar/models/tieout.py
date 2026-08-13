"""The chain, persisted: a figure, the cell behind it, and who vouched.

The engine in :mod:`polar.tieout` reads two files and returns findings. It
remembers nothing, which is fine for a library and useless for a product:
the whole claim is that **a figure a banker has confirmed cannot go stale
without them being told**, and there is no way to keep that promise
without writing down what was confirmed.

Everything here exists to make one sentence true. Two fields carry it.

**`FigureLink.basis`.** FY2025A reported EBITDA is $41.2mm and FY2025A
adjusted EBITDA is $48.9mm. Both are correct, both are printed in the same
deck, and comparing one against the other's cell is the most confident way
to be wrong. The basis travels with the link.

**`FigureLink.confirmed_by_id`.** The engine finds 56% of what it is shown
and invents nothing. That is enough to *propose* and never enough to
*assert*. A confirmed link is no longer a guess — re-checking it is
arithmetic, right every time — which is how a probabilistic engine backs a
deterministic promise.

**Identity is by label, never by address.** `Model!D26` is where a figure
lives today. The Cascade model's own Outputs tab says its adjusted EBITDA
is at `Model!D25`, and it is not — somebody inserted a row and the
reference never caught up. So a link records the *name* it was confirmed
against and re-finds the cell in each new version. An address is a
location, not an identity.

**Enum columns round-trip as enums.** They are declared with
``StrEnumType`` rather than a bare ``String``, so a value read back from
the database is the enum member and not a look-alike string. Without it
``artifact.status is ArtifactStatus.ready`` is quietly ``False`` on every
row loaded from Postgres while ``==`` still works — which is exactly the
kind of defect that passes every test written against freshly constructed
objects and fails the first time anything is re-read.

**The chain outlives the documents.** What is stored below is figures,
cells, formulas, labels and links — enough to re-check forever without
opening a file again, which is the property that lets « keep the chain,
drop the documents » be true in the schema rather than in a policy page.

Writing is the one thing that needs the file back, because a correction is
a new version of a real `.pptx` and there is nothing here to build one out
of. So a document *is* kept while it is in the deal, at
`Artifact.storage_path`, and dropping it costs the ability to correct that
version and nothing else: every check still runs, every chain still
renders, and the screen that offers to write says to upload it again.
"""

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    Boolean,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel
from polar.kit.extensions.sqlalchemy import StrEnumType

if TYPE_CHECKING:
    from polar.models import Dossier, File, User


class ArtifactKind(StrEnum):
    """What a file is *for*, which decides what is read out of it."""

    #: A workbook. Cells, labels, formulas, precedents.
    model = "model"
    #: A deck. Printed figures and the words that name them.
    deck = "deck"
    #: A memo, a CIM, an IC paper. Prose with figures in it.
    memo = "memo"
    #: An email. Prose with figures in it, read exactly as a memo is, and
    #: a deliverable exactly as a deck is — with the difference that a
    #: deck can be pulled back out of a data room and a sent message
    #: cannot be pulled back out of anything.
    message = "message"
    #: Audited accounts, a term sheet — the beginning of the chain.
    source = "source"


class ArtifactStatus(StrEnum):
    uploading = "uploading"
    processing = "processing"
    ready = "ready"
    failed = "failed"


class Artifact(RecordModel):
    """One file in a deal, at one version.

    A new upload of the same document is a new row, not an edit. The chain
    is versioned or it is a snapshot, and « what moved since Tuesday » is
    the question the product exists to answer.
    """

    __tablename__ = "tieout_artifacts"
    __table_args__ = (Index("ix_tieout_artifacts_dossier_kind", "dossier_id", "kind"),)

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("dossiers.id", ondelete="cascade"), nullable=False, index=True
    )

    @declared_attr
    def dossier(cls) -> Mapped["Dossier"]:
        return relationship("Dossier", lazy="raise")

    #: The stored file. Nullable because the retention policy allows the
    #: document to be dropped while the chain it produced is kept.
    file_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("files.id", ondelete="set null"), nullable=True, default=None
    )

    #: Where the bytes are, when they were kept. **Reading never needs
    #: this** — every check runs off the rows below — and writing cannot
    #: happen without it: a correction is a new version of a real file, and
    #: there is no way to produce one from figures and cells.
    #:
    #: Null is a normal state, not a defect. It means the upload predates
    #: retention, or the object store was unreachable when the file
    #: arrived, or the document has since been dropped under the « keep the
    #: chain, drop the documents » policy. Every one of those reads the
    #: same way to a banker — the check still works and the correction has
    #: to be re-uploaded — so they are one field and one sentence.
    storage_path: Mapped[str | None] = mapped_column(
        String(1024), nullable=True, default=None
    )

    #: The file store's own id for this document — a Graph drive item id.
    #: **Identity, at last, rather than a filename guess.** Versions of one
    #: document share a lineage, and until now the only way to know two
    #: uploads were the same document was that they had the same name: a
    #: rename started a second lineage and two `Model.xlsx` in different
    #: folders were one. A drive item survives both.
    #:
    #: Null for a hand-uploaded file, which has no better answer and keeps
    #: the filename rule.
    external_id: Mapped[str | None] = mapped_column(
        String(512), nullable=True, default=None, index=True
    )
    #: What the store said this version was — Graph's `cTag`, which changes
    #: when the *content* does and not when somebody renames it. How the
    #: sync knows a file it has already read has actually moved on.
    external_version: Mapped[str | None] = mapped_column(
        String(512), nullable=True, default=None
    )

    @declared_attr
    def file(cls) -> Mapped["File | None"]:
        return relationship("File", lazy="raise")

    kind: Mapped[ArtifactKind] = mapped_column(
        StrEnumType(ArtifactKind, length=16), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(512), nullable=False)

    #: Which upload of this document. Versions share a `lineage_id`; the
    #: first upload starts a lineage and every later one joins it.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    lineage_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)

    status: Mapped[ArtifactStatus] = mapped_column(
        StrEnumType(ArtifactStatus, length=16),
        nullable=False,
        default=ArtifactStatus.uploading,
        index=True,
    )
    #: What went wrong, in words a person can act on: « this .xls is
    #: password protected », « this workbook has no calculated values —
    #: open it in Excel once and save ».
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    #: Figures, cells, formulas, sheets, slides. Shown on the deal page
    #: without touching the rows.
    counts: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    #: The figures a model *publishes* — its Outputs tab, if it has one —
    #: with each stale source reference already repaired against the
    #: workbook. Kept here rather than rebuilt from cells because the tab's
    #: own columns are text and only numeric cells are stored.
    #:
    #: Two passes reconcile a deck, and neither subsumes the other: the
    #: published pass reaches figures the workbook has no cell for, such
    #: as a CAGR computed on the tab itself, and the workbook pass reaches
    #: everything the tab never published. Dropping this one costs seven
    #: reconciled figures on the Cascade deck and the revenue CAGR drift.
    outputs: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list
    )

    uploaded_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="restrict"), nullable=False
    )

    @declared_attr
    def uploaded_by(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")

    figures: Mapped[list["Figure"]] = relationship(
        "Figure", back_populates="artifact", lazy="raise", cascade="all, delete-orphan"
    )
    cells: Mapped[list["ModelCell"]] = relationship(
        "ModelCell",
        back_populates="artifact",
        lazy="raise",
        cascade="all, delete-orphan",
    )


class Figure(RecordModel):
    """A number printed in a deliverable, and the words that name it.

    Everything the engine needs to compare, and everything a screen needs
    to take a reader to it. `label` is what the deck calls *this* figure
    and no other — a sentence holding three figures gives each its own
    clause, because a label covering two of them reconciles one against
    the other's cell.
    """

    __tablename__ = "tieout_figures"
    __table_args__ = (Index("ix_tieout_figures_artifact_page", "artifact_id", "page"),)

    artifact_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    artifact: Mapped["Artifact"] = relationship(
        "Artifact", back_populates="figures", lazy="raise"
    )

    #: As it appears: « $48.9mm », « 9.9x », « (96.4) ».
    printed: Mapped[str] = mapped_column(String(64), nullable=False)
    #: What the printing denotes, in the model's units — millions for
    #: currency, a fraction for a percentage.
    value: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    #: How many decimals the deck chose. The precision of the claim, and
    #: the precision every comparison is made at.
    decimals: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: `currency` · `percent` · `multiple` · `plain`.
    kind: Mapped[str] = mapped_column(String(16), nullable=False)

    #: Slide number, page number. One axis serves both.
    page: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: What the deck calls it. The whole basis of linking.
    label: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: Where it sits, for taking a reader to it.
    location: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: The line as printed, so a finding can quote the deck to itself.
    context: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: The page's own heading. Background, never a name.
    section: Mapped[str] = mapped_column(Text, nullable=False, default="")

    #: One end of a printed range — « $455mm to $528mm ». Claims two cells
    #: at once, so it reconciles to neither.
    range_endpoint: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: Printed in parentheses, which in a bridge means « subtracted here »
    #: and not « the cell is negative ».
    parenthesised: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: A table's row label, when it has one. A whole name for a line item.
    subject: Mapped[str] = mapped_column(Text, nullable=False, default="")

    #: The same position as :attr:`location`, in coordinates a host
    #: application can act on: `shape_id`, and then whatever identifies a
    #: position in that kind of shape — row and column, series and point,
    #: paragraph and character offsets.
    #:
    #: Prose is for the reader; this is for the panel. Asking a panel
    #: inside PowerPoint to parse « slide 3, row « Adjusted EBITDA » » back
    #: into a selection is the sort of thing that works on the deck it was
    #: written against and nothing else.
    anchor: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )


class ModelCell(RecordModel):
    """One numeric cell of a model, named from the labels beside it.

    `Model!D26` means nothing; « FY2025A Adjusted EBITDA » means something,
    and the workbook already says so in column A and row 4. The name is
    built to the same shape a deck figure's label has, deliberately, so one
    matcher serves both.
    """

    __tablename__ = "tieout_cells"
    __table_args__ = (
        UniqueConstraint("artifact_id", "ref", name="uq_tieout_cells_artifact_ref"),
        Index("ix_tieout_cells_artifact_sheet", "artifact_id", "sheet"),
    )

    artifact_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    artifact: Mapped["Artifact"] = relationship(
        "Artifact", back_populates="cells", lazy="raise"
    )

    #: « Model!D26 ».
    ref: Mapped[str] = mapped_column(String(128), nullable=False)
    sheet: Mapped[str] = mapped_column(String(128), nullable=False)
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    column: Mapped[int] = mapped_column(Integer, nullable=False)

    #: As Excel last computed it. Null when the workbook has never been
    #: calculated, which happens with generated files and is readable
    #: anyway because the audit needs only the formulas.
    value: Mapped[Decimal | None] = mapped_column(
        Numeric(28, 10), nullable=True, default=None
    )
    formula: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    row_label: Mapped[str] = mapped_column(Text, nullable=False, default="")
    column_label: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: The workbook's own format code — `0.0%`, `#,##0.0`, `"$"#,##0`.
    #: Presentation, not data: the value stays exactly as Excel computed it
    #: and this says how the model draws it. Without it a screen shows
    #: `0.1222587719` where the model shows `12.2%`, which on a product
    #: about printed precision is the screen contradicting the argument.
    number_format: Mapped[str | None] = mapped_column(
        String(128), nullable=True, default=None
    )
    #: « FY2025A Adjusted EBITDA ». Stored rather than derived so that a
    #: link can be re-found by name in a later version.
    name: Mapped[str] = mapped_column(Text, nullable=False, default="", index=True)

    #: The cells this one is computed from, so the chain renders without
    #: re-parsing the workbook.
    precedents: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    #: What this cell reads that could *not* be resolved to a cell, each
    #: with a sentence saying why: a reference into another workbook, a
    #: defined name left pointing at `#REF!`, a range longer than the
    #: chain will follow.
    #:
    #: Stored beside the precedents rather than dropped, because the two
    #: together are the honest answer and one alone is not. A chain short
    #: by an input, presented as complete, was the state of 4.4% of
    #: formulas across two real Ofgem models — and of the one input that
    #: decided the answer in 3,542 of them.
    unresolved: Mapped[list[list[str]]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    #: Set when the whole formula is one reference — a pointer, not a
    #: figure. Excluded from linking so one figure does not have two homes.
    alias_of: Mapped[str | None] = mapped_column(
        String(128), nullable=True, default=None
    )


class LinkState(StrEnum):
    #: The engine's guess. Useful, and not yet a fact.
    proposed = "proposed"
    #: A banker vouched. From here re-checking is arithmetic.
    confirmed = "confirmed"
    #: A banker said no. Never proposed again for this pair.
    rejected = "rejected"
    #: The cell it pointed at is gone from a later version.
    broken = "broken"


class FigureLink(RecordModel):
    """« Slide 2's adjusted EBITDA is Model!D26 », and who says so.

    The object the whole product rests on. Once `state` is `confirmed`,
    checking this figure never involves a model again: fetch the cell,
    apply the transformation, compare at the figure's printed precision.
    """

    __tablename__ = "tieout_links"
    __table_args__ = (
        UniqueConstraint("figure_id", "cell_id", name="uq_tieout_links_figure_cell"),
        Index("ix_tieout_links_dossier_state", "dossier_id", "state"),
    )

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("dossiers.id", ondelete="cascade"), nullable=False, index=True
    )
    figure_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("tieout_figures.id", ondelete="cascade"), nullable=False
    )
    cell_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("tieout_cells.id", ondelete="cascade"), nullable=False
    )

    state: Mapped[LinkState] = mapped_column(
        StrEnumType(LinkState, length=16),
        nullable=False,
        default=LinkState.proposed,
        index=True,
    )
    #: How well the label accounted for the cell's name, 0–1. A drift on a
    #: 0.56 link reads differently from one on a 1.00 link.
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, default=0)

    #: `identity` today; later `sum` · `margin` · `growth` · `cagr` ·
    #: `unit` · `currency`. A named deterministic function, so re-checking
    #: a confirmed link stays arithmetic.
    transformation: Mapped[str] = mapped_column(
        String(32), nullable=False, default="identity"
    )
    #: Reported · adjusted · pro forma · run-rate, and the period. Carried
    #: on the link because the same two numbers on different bases are not
    #: in disagreement.
    basis: Mapped[str] = mapped_column(Text, nullable=False, default="")

    #: **Identity, as opposed to address.** What the cell was called when
    #: this link was confirmed, so a later version can be re-found by name
    #: after somebody inserts a row above it.
    cell_name: Mapped[str] = mapped_column(Text, nullable=False, default="")
    figure_label: Mapped[str] = mapped_column(Text, nullable=False, default="")

    confirmed_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True, default=None
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )


class CheckKind(StrEnum):
    #: The deck disagrees with the model.
    tieout = "tieout"
    #: The model disagrees with itself.
    audit = "audit"
    #: Two documents in the deal disagree.
    crosscheck = "crosscheck"


class CheckStatus(StrEnum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


class CheckRun(RecordModel):
    """One pass of one checker over named versions of named files.

    Recorded so that a finding can say *what it was checked against*, and
    so that « this deck was last checked against version 2 of the model »
    is answerable without guessing.
    """

    __tablename__ = "tieout_check_runs"

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("dossiers.id", ondelete="cascade"), nullable=False, index=True
    )
    kind: Mapped[CheckKind] = mapped_column(
        StrEnumType(CheckKind, length=16), nullable=False
    )
    status: Mapped[CheckStatus] = mapped_column(
        StrEnumType(CheckStatus, length=16),
        nullable=False,
        default=CheckStatus.queued,
        index=True,
    )

    #: The artifacts this run read, by id. A tie-out reads two; an audit
    #: reads one.
    artifact_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    #: Reconciled, agreeing, drifting, unlinked, and the reasons — the
    #: coverage line, computed once at the end of the run.
    summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    started_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    requested_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True, default=None
    )


class FindingKind(StrEnum):
    #: A printed figure does not agree with the cell behind it.
    drift = "drift"
    #: A mechanical defect in a model — a broken reference, a total that
    #: skips a row, a value typed over a formula.
    audit = "audit"
    #: Two documents in the deal say different things.
    contradiction = "contradiction"
    #: The model moved and this figure has not caught up.
    stale = "stale"
    #: The model's own index of figures points somewhere it should not.
    reference = "reference"


class FindingSeverity(StrEnum):
    #: Wrong however the document is used.
    error = "error"
    #: A departure from standard that is often deliberate. **Never added
    #: into one number with errors.**
    smell = "smell"


class FindingState(StrEnum):
    open = "open"
    accepted = "accepted"
    #: Deliberately set aside. A dismissed finding that comes back is the
    #: fastest way to lose a user, so dismissal is recorded per finding
    #: *identity* and survives a re-run.
    dismissed = "dismissed"
    fixed = "fixed"


class Finding(RecordModel):
    """One thing worth telling a banker, and what happened to it."""

    __tablename__ = "tieout_findings"
    __table_args__ = (
        Index("ix_tieout_findings_dossier_state", "dossier_id", "state"),
        Index("ix_tieout_findings_fingerprint", "dossier_id", "fingerprint"),
    )

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("dossiers.id", ondelete="cascade"), nullable=False, index=True
    )
    check_run_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("tieout_check_runs.id", ondelete="set null"),
        nullable=True,
        default=None,
    )
    #: Where the problem is *printed*. The model, for an audit finding.
    artifact_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("tieout_artifacts.id", ondelete="cascade"), nullable=True
    )

    kind: Mapped[FindingKind] = mapped_column(
        StrEnumType(FindingKind, length=16), nullable=False, index=True
    )
    severity: Mapped[FindingSeverity] = mapped_column(
        StrEnumType(FindingSeverity, length=8), nullable=False
    )
    state: Mapped[FindingState] = mapped_column(
        StrEnumType(FindingState, length=16),
        nullable=False,
        default=FindingState.open,
        index=True,
    )

    #: What survives a re-run: the same defect in the same place keeps its
    #: identity so that a dismissal sticks and a fix can be noticed.
    fingerprint: Mapped[str] = mapped_column(String(128), nullable=False)

    #: The rule, for an audit finding: `skipped-cell`, `circular`.
    rule: Mapped[str] = mapped_column(String(48), nullable=False, default="")
    #: The published standard it comes from, so « says who » has an answer
    #: that is not « the tool ».
    standard: Mapped[str] = mapped_column(String(64), nullable=False, default="")

    page: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    printed: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    expected: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    #: True when the two differ by exactly one unit at the printed
    #: precision — 18.6% against 18.655%. Almost always a rounding
    #: convention, always still reported, ranked below the rest.
    one_tick: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    detail: Mapped[str] = mapped_column(Text, nullable=False, default="")
    location: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: Where to take the reader, in coordinates the host can act on. The
    #: shape on the slide for a drift; the cell for an audit finding, which
    #: Excel can select as it stands.
    #:
    #: This is the panel's entire point. « Click a finding and PowerPoint
    #: goes to it » is either a lookup or a heuristic, and a heuristic that
    #: lands on the wrong shape is worse than a panel that does not jump.
    anchor: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    #: The finding's own evidence — the chain, the source cell, the basis,
    #: the confidence. Rendered by the screen, never queried on.
    evidence: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    dismissed_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True, default=None
    )
    dismissed_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: The reason, in the person's own words — « pre-IFRS 16 EBITDA,
    #: agreed with the client ». Required when dismissing and only then:
    #: a dismissal says the check is wrong about this one, which is the
    #: decision somebody questions three weeks later. Pierce stores its
    #: own words about every finding; this is the one field that is the
    #: user's.
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")


class CorrectionState(StrEnum):
    #: Written down and not in the file. Everything starts here.
    proposed = "proposed"
    #: A banker accepted it and it is in the document.
    applied = "applied"
    #: A banker said the deck is right. The finding stands.
    rejected = "rejected"
    #: Applied, and then taken back out. The document reads as it did.
    reversed = "reversed"
    #: The write was attempted and refused. `error` says why, in words a
    #: person can act on — « somebody has edited slide 3 since ».
    failed = "failed"


class CorrectionWhere(StrEnum):
    #: The deal's own copy. Applying produces a new version of the file,
    #: which anybody on the deal can download.
    file = "file"
    #: The copy open in Office in front of a banker, written by the panel.
    #: The deal's copy is untouched until they upload what they saved.
    document = "document"


class Correction(RecordModel):
    """« Slide 3 should read $48.9mm », and what became of it.

    **A change is proposed, never applied.** Nothing in this product writes
    to a document without a person pressing a button first, and this row is
    where that person's decision lives. It carries both sides — what the
    document says and what it should say — so the change is reversible
    without a revision format the `.pptx` specification does not have. See
    `docs/pierce/writing-pptx.md`.

    **Keyed on the finding's fingerprint, not on its id.** Every check run
    deletes its findings and writes them again, with identity carried by
    the fingerprint; a correction hung on `finding_id` would be gone the
    first time anybody pressed Re-check. This is the same key a dismissal
    survives on, for the same reason.
    """

    __tablename__ = "tieout_corrections"
    __table_args__ = (
        UniqueConstraint(
            "dossier_id", "fingerprint", name="uq_tieout_corrections_fingerprint"
        ),
        Index("ix_tieout_corrections_dossier_state", "dossier_id", "state"),
    )

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("dossiers.id", ondelete="cascade"), nullable=False, index=True
    )
    #: The finding's durable identity. See the class docstring.
    fingerprint: Mapped[str] = mapped_column(String(128), nullable=False)

    #: The version the correction was proposed against, and the lineage it
    #: belongs to. The lineage is what survives applying, because applying
    #: makes a new version of the same document.
    artifact_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    lineage_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, index=True)
    #: The version applying produced. Null until then, and null forever on
    #: a correction the panel wrote into the document in front of a banker
    #: — that file is on their machine and this deal has never seen it.
    wrote_artifact_id: Mapped[UUID | None] = mapped_column(
        Uuid,
        ForeignKey("tieout_artifacts.id", ondelete="set null"),
        nullable=True,
        default=None,
    )

    #: Where the figure sits, in the coordinates the reader recorded — the
    #: same anchor the panel navigates by, and the only thing that makes a
    #: write land on the right characters rather than on the first match.
    anchor: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    page: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    #: Prose, for a screen: « slide 3, row « Adjusted EBITDA » ».
    location: Mapped[str] = mapped_column(Text, nullable=False, default="")

    #: What the document says, and what it should say. Both sides, because
    #: the database is the revision store.
    before: Mapped[str] = mapped_column(String(64), nullable=False)
    after: Mapped[str] = mapped_column(String(64), nullable=False)
    #: The cell the figure will tie to once this is applied — `Model!D26`.
    #: Carried here rather than looked up later because the finding it came
    #: from is deleted by the very run that proves the correction worked.
    source: Mapped[str] = mapped_column(Text, nullable=False, default="")

    state: Mapped[CorrectionState] = mapped_column(
        StrEnumType(CorrectionState, length=16),
        nullable=False,
        default=CorrectionState.proposed,
        index=True,
    )
    where: Mapped[CorrectionWhere] = mapped_column(
        StrEnumType(CorrectionWhere, length=16),
        nullable=False,
        default=CorrectionWhere.file,
    )
    #: Why a write was refused, in the writer's own words.
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    proposed_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True, default=None
    )
    #: Who last accepted, rejected or reversed it. « Nothing leaves the
    #: firm without a banker accepting it » is a sentence about this column.
    decided_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="set null"), nullable=True, default=None
    )
    decided_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )


class OneOffCheck(RecordModel):
    """One file checked outside any deal's data room.

    The check that works on a loose attachment forwarded at 11pm: no
    deal, no upload into a room, just a file and an answer. What is kept
    is the *answer* — the counts and the findings, exactly as the screen
    drew them — and never the file. The bytes are read, checked and
    dropped in one request, which is the strictest form of the product's
    retention posture: a one-off check has no correction to write, so
    there is nothing the bytes would ever be needed for again.

    A row here is one line of « Recent one-off checks ». Reopening one
    replays the stored result; it does not re-run anything, because the
    file is gone and a silent re-check against a moved deal would show a
    different answer under an old date.
    """

    __tablename__ = "tieout_one_off_checks"

    #: Whose check this was. Recents are personal — a loose file checked
    #: before it is anybody's deal is not yet the team's business.
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )

    #: The deal whose model the file was checked against, when one was
    #: picked. Set-null rather than cascade: the check happened, and a
    #: deleted deal should not silently erase the record of it.
    dossier_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("dossiers.id", ondelete="set null"), nullable=True, index=True
    )
    #: The deal's name as it read at check time, because the row above is
    #: allowed to go null and « Checked against Project Falcon » must not
    #: quietly become « Checked on its own ». Empty for a solo check.
    against: Mapped[str] = mapped_column(String(512), nullable=False, default="")

    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    kind: Mapped[ArtifactKind] = mapped_column(
        StrEnumType(ArtifactKind, length=16), nullable=False
    )

    #: What was read and what was compared — slides, figures, names
    #: stated more than once, differences. The tally row, verbatim.
    counts: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    #: The findings as the screen received them, stored whole so a recent
    #: reopens to the same answer it showed. Three lists, by shape:
    #: `disagreements` (the file against itself), `drifts` (the file
    #: against a deal's model), `defects` (a model's own audit).
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


__all__ = [
    "Artifact",
    "ArtifactKind",
    "ArtifactStatus",
    "CheckKind",
    "CheckRun",
    "CheckStatus",
    "Correction",
    "CorrectionState",
    "CorrectionWhere",
    "Figure",
    "FigureLink",
    "Finding",
    "FindingKind",
    "FindingSeverity",
    "FindingState",
    "LinkState",
    "ModelCell",
    "OneOffCheck",
]
