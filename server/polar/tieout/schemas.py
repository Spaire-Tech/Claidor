"""The shapes the screens receive.

These were written down in ``docs/pierce/ui-work-order.md`` before any of
them existed, so the founder could build against them as mock data while
the backend caught up. **They are a contract.** Where this file and that
document disagree, this file is wrong.

Two conventions run through all of it.

*Never add an error and a smell into one number.* A model that fails one
mechanical check and has one habit worth a second look is not « two
problems », and a screen that says so trains a banker to ignore the
number.

*What was not checked is part of the answer.* Coverage carries the
unlinked count and the reasons behind it, and the figure map carries every
figure the tool never reconciled. An engine that hides its own misses is
an engine nobody can calibrate against.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from polar.kit.schemas import Schema
from polar.models import (
    ArtifactKind,
    ArtifactStatus,
    CheckKind,
    CheckStatus,
    CorrectionState,
    CorrectionWhere,
    FindingKind,
    FindingSeverity,
    FindingState,
    LinkState,
)

# --- artifacts -----------------------------------------------------------


class Uploader(Schema):
    id: UUID
    name: str
    avatar_url: str | None


class ArtifactRead(Schema):
    id: UUID
    kind: ArtifactKind
    filename: str
    #: Per lineage, not per deal. Two models in one deal each count from one.
    version: int
    lineage_id: UUID
    status: ArtifactStatus
    #: Present on `failed`, and phrased so a person can act on it: « this
    #: .xls is password protected », not « extraction failed ».
    error: str | None
    #: Whatever this kind of file has. A deck reports slides and figures, a
    #: model reports sheets, cells, formulas and named cells. Deliberately
    #: loose: the screen shows what it finds rather than a fixed set.
    counts: dict[str, Any]
    uploaded_by: Uploader | None
    uploaded_at: datetime


# --- coverage ------------------------------------------------------------


class CoverageReason(Schema):
    """Why some figures were not reconciled, and how many."""

    reason: str
    count: int


class Coverage(Schema):
    """The line that keeps the product honest.

    « 102 of 128 figures reconciled · 26 not checked » — and the 26 are
    clickable through to the reasons. An unmatched figure is never a
    finding, which is what lets the findings list be trusted, and it is
    also never hidden.
    """

    reconciled: int
    agreeing: int
    drifting: int
    unlinked: int
    #: How many links a person has settled. Every one of these is arithmetic
    #: from now on rather than a guess, which is the whole mechanism.
    confirmed: int
    reasons: list[CoverageReason] = Field(default_factory=list)


class FindingCounts(Schema):
    open: int
    accepted: int
    dismissed: int
    fixed: int


class CheckRunRead(Schema):
    id: UUID
    kind: CheckKind
    status: CheckStatus
    summary: dict[str, Any]
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None


class ArtifactPage(Schema):
    """One page of the data room, and how big the room is.

    `total` rides with the page deliberately. A list that draws a hundred
    rows and says nothing about the rest reads as « that is all of them »,
    which is the same lie as hiding a finding.
    """

    items: list[ArtifactRead]
    total: int
    limit: int
    offset: int


class DealPage(Schema):
    """The deal's spine, in one request.

    **Not the data room.** This used to inline every artifact, which is
    1.07 MB at three thousand files and grows in a straight line — every
    screen paying for the one that browses files. The room has its own
    paged route now; what is here is the handful of documents the deal is
    *built on*, which is bounded by how many models and decks a deal has
    rather than by how much material was dropped into it.
    """

    id: UUID
    name: str
    client: str | None
    #: Whose deal it is. On screen only for the connector: a connection is
    #: made once per organization and per person, not per deal, so the
    #: SharePoint screen has to ask about the organization rather than the
    #: deal it happens to be open on.
    organization_id: UUID
    coverage: Coverage
    #: The current version of each model, deck and memo — the documents
    #: every other screen opens. Tens, not thousands.
    documents: list[ArtifactRead]
    #: How many artifacts the deal holds altogether, and how many
    #: documents that is once versions are folded together. The data room's
    #: own line, without its rows.
    files: int
    lineages: int
    findings: FindingCounts
    #: The last tie-out and the last audit, so the screen can say when this
    #: was last true and whether a run failed.
    last_tieout: CheckRunRead | None
    last_audit: CheckRunRead | None
    #: A current document arrived after the last tie-out finished, so its
    #: results — including the counts above — describe a deal that no
    #: longer exists. Same fact and same fields as the deals list.
    stale: bool = False
    stale_kind: str | None = None
    stale_at: datetime | None = None
    #: What the stale banner's second line counts: the deliverables the
    #: last run actually read, and the figures it read in them — real
    #: sums from the run's own artifacts, not an estimate.
    stale_documents: int = 0
    stale_figures: int = 0
    #: What the team decided, newest first. **Derived, never authored** —
    #: assembled from findings that were ruled on and corrections that
    #: were decided, so it can never disagree with them.
    decisions: list["DecisionRead"] = []


class DecisionRead(Schema):
    """One judgement somebody made about a number.

    Only judgements. Plumbing — connecting a folder, uploading a file —
    is not a decision, and one such entry is how a decision log turns
    into an activity feed and drowns.
    """

    id: UUID
    who: Uploader | None
    at: datetime
    #: `accepted` · `kept` · `reversed` · `dismissed` — the correction
    #: states plus dismissal, in the words the screen uses.
    action: str
    #: The server's own factual sentence — « Accepted the model's $48.2mm
    #: over $48.9mm — slide 4, FY2025A adjusted EBITDA. »
    text: str
    #: The person's reason, verbatim, when they gave one. Shown in place
    #: of `text` when present — their words beat ours.
    note: str = ""


# --- findings ------------------------------------------------------------


class FindingWhere(Schema):
    artifact_id: UUID | None
    filename: str | None
    #: « slide 2 ». For an audit finding, the cell reference.
    label: str
    #: « metric tile, "FY2025A adjusted EBITDA" ».
    detail: str
    #: The same position for a machine: `shape_id`, and then whatever
    #: identifies a spot in that kind of shape — `row`/`column` for a
    #: table, `series`/`point` for a chart, `paragraph`/`start`/`end` for
    #: a sentence, `ref`/`sheet` for a cell. Empty when the reader could
    #: not pin it down, and a panel should stay put rather than guess.
    anchor: dict[str, Any] = Field(default_factory=dict)


class FindingSource(Schema):
    """The model side of a drift. Absent on an audit finding."""

    ref: str | None
    name: str | None
    basis: str | None
    artifact_id: UUID | None


class CorrectionRead(Schema):
    """A change to a document: proposed, decided, and reversible.

    Both sides travel on it. `before` is what the document says today and
    `after` is what it would say, which is what makes « Undo » a write
    rather than a revision format the `.pptx` specification does not have.
    """

    id: UUID
    #: The finding's durable identity, so a screen can put a correction
    #: against the row it belongs to after a re-run has rebuilt every
    #: finding with a new id.
    fingerprint: str
    state: CorrectionState
    #: `file` — the deal's own copy, now one version further on — or
    #: `document`, meaning somebody accepted it in the copy open in Office
    #: and this deal has not seen those bytes.
    where: CorrectionWhere
    before: str
    after: str
    #: The cell the figure ties to once this is applied — `Model!D26`. It
    #: is on the correction rather than looked up, because the finding it
    #: came from is deleted by the run that proves the correction worked.
    source: str
    page: int
    location: str
    artifact_id: UUID
    #: The version applying produced, when there is one.
    wrote_artifact_id: UUID | None
    #: Why a write was refused, in the writer's own words. Kept on the
    #: record: a banker who pressed Accept has to be able to find out
    #: whether the deck changed.
    error: str | None
    decided_by: Uploader | None
    decided_at: datetime | None
    created_at: datetime


class CorrectionDecision(Schema):
    """What to do with a proposal.

    `accept` writes it into the deal's copy and makes that a new version.
    `reject` leaves the document alone — and does **not** dismiss the
    finding, because « the deck is right » and « stop telling me » are
    different sentences. `reverse` writes the old figure back. `applied`
    is the panel reporting that it wrote the change into the document open
    in front of somebody, which is the one case where the bytes never come
    here.
    """

    action: Literal["accept", "reject", "reverse", "applied", "propose"]


class FindingRead(Schema):
    id: UUID
    kind: FindingKind
    severity: FindingSeverity
    state: FindingState
    #: How sure the *link* was, 0–1. A drift on a 0.56 link reads
    #: differently from one on a 1.00 link, and a confirmed link is 1.00
    #: because a person said so.
    confidence: float | None
    #: True when the deck and the model differ by exactly one unit at the
    #: printed precision. Almost always a rounding convention. Shown, and
    #: ranked below everything else.
    one_tick: bool
    page: int
    printed: str
    expected: str
    title: str
    where: FindingWhere
    source: FindingSource
    context: str
    #: For an audit finding, the rule's published source — « ICAEW P14 ».
    #: A banker asking « says who » gets an answer that is not « the tool ».
    standard: str | None
    rule: str | None
    created_at: datetime
    #: The reason a person gave when they ruled on it, in their own words.
    #: Empty until somebody writes one; the only field on a finding that
    #: is the user's rather than Pierce's.
    note: str = ""
    #: The change proposed for this finding, once anybody has looked at
    #: it. Null means nothing has been proposed — never « nothing can be ».
    correction: CorrectionRead | None = None
    #: Statement-check findings only: the headline number, the phrase
    #: saying what it is, the period it sits in, and the standard
    #: spelled out — all composed by the engine, never by a screen.
    figure: str = ""
    figure_unit: str = ""
    period: str = ""
    standard_sentence: str = ""
    #: Where the cell's value goes, in the model's own words —
    #: « Opex total » → « Cashflow » → « Equity IRR ». Empty when
    #: nothing downstream reads the cell.
    flow: str = ""
    #: The fix, where one is derivable rather than a choice: the row's
    #: own formula, re-anchored to this cell. Empty everywhere else.
    fix: str = ""
    #: What is wrong, in two or three words — « Incomplete total »,
    #: « Unexpected hardcode ». The line a reader scans first.
    headline: str = ""
    #: The design's little Excel grid — the finding's cell with its
    #: neighbours, composed when the check ran. None on findings that
    #: predate it or that do not sit at a cell.
    grid: dict[str, Any] | None = None


class FindingUpdate(Schema):
    """Accept, dismiss, mark fixed, or put it back.

    A dismissed finding that reappears is the fastest way to lose a user,
    so dismissal survives a re-run — and it is reversible from here.
    """

    state: FindingState
    #: The reason, required when dismissing and only then. Dismissal says
    #: the check is wrong about this one — the decision somebody questions
    #: three weeks later — and « ok » typed to get past a box is worse
    #: than nothing, so no other state asks.
    note: str = ""


# --- the chain -----------------------------------------------------------


class ChainInput(Schema):
    ref: str
    name: str
    value: str | None


class ChainStep(Schema):
    #: `figure` · `cell` · `input`. A chain ends at a typed input: that is
    #: the edge of the model and the beginning of the next question.
    kind: str
    label: str | None = None
    ref: str | None = None
    name: str | None = None
    printed: str | None = None
    value: str | None = None
    formula: str | None = None
    basis: str | None = None
    note: str | None = None
    inputs: list[ChainInput] = Field(default_factory=list)
    #: What this cell reads that could not be followed, each already
    #: phrased as a sentence — « in another workbook, which is not in this
    #: deal », « a defined name pointing at #REF! ».
    #:
    #: The reason this is on the wire at all: a chain that quietly omits an
    #: input looks exactly like a chain that had none, and this product's
    #: whole claim is the chain. Rule 3 — what was not checked is part of
    #: the answer.
    unresolved: list[str] = Field(default_factory=list)


class ChainRead(Schema):
    """Slide 2 says $49.6mm · the model says 48.9 at Model!D26 · which is
    reported EBITDA 41.2 plus adjustments 7.7.

    One sentence, read down the steps. Nothing else in this product is hard
    to copy; this is."""

    finding_id: UUID | None
    steps: list[ChainStep]
    #: A rendered one-line version, for the 320px panel where a diagram
    #: does not fit.
    summary: str


# --- links ---------------------------------------------------------------


class LinkFigure(Schema):
    id: UUID
    printed: str
    label: str
    location: str
    page: int
    artifact_id: UUID


class LinkCell(Schema):
    id: UUID
    ref: str
    name: str
    value: str | None
    basis: str | None
    artifact_id: UUID


class LinkAlternative(Schema):
    """Another cell this figure could be, with the score it scored."""

    cell_id: UUID | None
    ref: str
    name: str
    value: str | None
    confidence: float


class LinkRead(Schema):
    id: UUID
    state: LinkState
    confidence: float
    #: `identity` today; later `sum` · `margin` · `growth` · `cagr` ·
    #: `unit` · `currency`. Shown as words — « sum of Model!D20:D23 » —
    #: never as a formula.
    transformation: str
    figure: LinkFigure | None
    cell: LinkCell | None
    alternatives: list[LinkAlternative] = Field(default_factory=list)
    confirmed_by: Uploader | None
    confirmed_at: datetime | None


class LinkDecision(Schema):
    """Confirm, reject, or point it somewhere else.

    `cell_id` re-points the link before confirming it, which is the third
    action on the queue and the one that turns a wrong guess into a right
    fact instead of throwing it away.
    """

    state: LinkState
    cell_id: UUID | None = None


# --- the figure map ------------------------------------------------------


class FigureRead(Schema):
    id: UUID
    printed: str
    label: str
    location: str
    #: `agreeing` · `drifting` · `confirmed` · `unlinked`.
    state: str
    link_id: UUID | None
    #: Only on `unlinked`, and the point of the screen: what the tool did
    #: not check, said out loud.
    reason: str | None
    #: Where it sits, for a panel that has to select it.
    anchor: dict[str, Any] = Field(default_factory=dict)


class SlideFigures(Schema):
    page: int
    figures: list[FigureRead]


class FigureMap(Schema):
    artifact_id: UUID
    filename: str
    slides: list[SlideFigures]


# --- the panel -----------------------------------------------------------


class Identify(Schema):
    """What the panel knows about the document it is sitting in.

    The panel opens inside PowerPoint with a deck already on screen and has
    to answer *« which artifact is this »* before it can show anything. It
    has three things to go on, in descending order of how much they can be
    trusted, and it sends whatever it has.
    """

    #: The lineage the panel stamped into this document's own settings the
    #: first time somebody chose a deal for it. Definitive when present:
    #: it travels with the file, survives Save As, and does not care what
    #: the file is called today.
    lineage_id: UUID | None = None
    #: The file's name. What a banker means by « the model », and wrong
    #: exactly when two deals hold a file with the same name — which is
    #: why it is only consulted inside one deal.
    filename: str | None = None
    #: The deal the user has already picked in the panel, when they have.
    dossier_id: UUID | None = None


class Identified(Schema):
    """Which deal and which file this document is, or neither."""

    #: `stamp` · `filename` · `none` — how it was worked out, so the panel
    #: can offer « is this the right deal? » when the answer was a guess
    #: and stay quiet when it was not.
    matched_by: str
    dossier_id: UUID | None
    dossier_name: str | None
    artifact: ArtifactRead | None
    #: Set when the panel should write this into the document's settings,
    #: so the next open needs no guessing at all.
    stamp_lineage_id: UUID | None = None


class PanelToken(Schema):
    """A credential the panel can hold, minted from a browser session.

    Returned once and stored nowhere recoverable — only an HMAC of it is
    kept, so a lost token is replaced rather than looked up.
    """

    token: str
    #: Seconds. The panel stops using it at this point and signs in again
    #: rather than discovering the expiry as a 401 mid-click.
    expires_in: int
    scopes: list[str]


class DealListItem(Schema):
    """One deal in a list of them — the panel's picker, and Projects.

    `checked_at` is the field that keeps the list honest. « No open
    findings » on a deal nobody has ever checked reads exactly like « no
    open findings » on a deal that was checked this morning, and the whole
    product turns on those two never looking the same. Null means the check
    has not run, and the screen has to say so in those words.
    """

    id: UUID
    name: str
    client: str | None
    artifacts: int
    open_findings: int
    #: How many *checks* the open findings belong to — distinct rules, the
    #: tie-out counting as one. The Antford list states « 6 checks fail »,
    #: never a findings count, because one check can produce forty
    #: findings and the row would read like forty problems.
    failing_checks: int = 0
    #: When this deal was last reconciled. Null: never.
    checked_at: datetime | None = None
    #: When this person last opened the deal. Null: never. The two counts
    #: beneath derive from it — what arrived and what was found since,
    #: cleared by opening the deal. Zero for a first-time reader on
    #: purpose: the row's own counts already tell them everything.
    visited_at: datetime | None = None
    arrived_since_visit: int = 0
    findings_since_visit: int = 0
    #: A current document arrived after that check, so its results are out
    #: of date — including the findings count on this very row. The screen
    #: leads with this over any number, because the numbers are what went
    #: stale.
    stale: bool = False
    #: What arrived — an :class:`ArtifactKind` value — and when. The
    #: sentence (« The model changed at 11:40 today ») is the client's to
    #: build, because only the reader's browser knows their clock.
    stale_kind: str | None = None
    stale_at: datetime | None = None


# --- the model page ------------------------------------------------------


class CellRead(Schema):
    id: UUID
    ref: str
    sheet: str
    name: str
    value: str | None
    formula: str | None


class ChangedCell(Schema):
    ref: str
    name: str
    was: str | None
    now: str | None
    #: How many deck figures were linked to this cell and now disagree with
    #: it. The realistic failure is not one typo — it is a model revision
    #: the deck never caught up with.
    stale_figures: int


class ModelDiff(Schema):
    artifact_id: UUID
    from_version: int
    to_version: int
    changed: list[ChangedCell]
    added: int
    removed: int


class AskedStep(Schema):
    """One tool call, as the chat shows it under « Used N tools »."""

    ordinal: int
    tool: str
    ok: bool
    #: One line: « Read 12 of 16 findings ».
    summary: str
    milliseconds: int


class Asked(Schema):
    """An answer, and every step it took to get there.

    The trace is not logging. It is most of why an answer reads as looked
    up rather than composed, and it is the only way a reader can tell the
    difference — so it comes back with the answer rather than to a log.
    """

    id: UUID
    prompt: str
    answer: str
    #: `answered` · `step_limit` · `failed`. Anything but the first means
    #: the answer is partial or absent, and the screen has to say so.
    stopped: str
    error: str | None
    steps: list[AskedStep]


class AskTurn(Schema):
    """One earlier exchange in the conversation, replayed to the agent.

    The loop takes a single prompt, so the transcript is folded into it,
    labelled — the person's own words and the agent's earlier answers,
    never anything invented between them.
    """

    who: Literal["you", "pierce"]
    text: str = Field(max_length=2_000)


class Ask(Schema):
    prompt: str = Field(min_length=1, max_length=4_000)
    #: The conversation so far, oldest first. Only the last few turns are
    #: replayed — a chat is context, not a second corpus.
    history: list[AskTurn] = Field(default_factory=list, max_length=12)
    #: When the chat was opened from one finding, its id — the question
    #: is answered about that finding first.
    finding_id: UUID | None = None


class GridCell(Schema):
    """One cell of a sheet, at the row and column a banker would name it by."""

    ref: str
    #: Exactly as Excel computed it, to every digit it holds. The number,
    #: never rounded, so nothing downstream has to trust a rendering.
    value: str | None
    #: The same number as the *model itself draws it* — « 12.2% », « $1,235 »,
    #: « 9.9x » — from the format code the workbook carries on that cell.
    #: `null` when the workbook says nothing this understands, and a screen
    #: that gets `null` shows `value`: an unformatted number is honest and a
    #: guessed one is not.
    display: str | None
    #: True when a published figure points at this cell. This is the reason
    #: the grid is worth drawing at all: it is the difference between « the
    #: model says 228.9 » and « a deliverable is standing on this ».
    linked: bool


class GridRow(Schema):
    label: str
    #: One entry per column of the sheet, in the sheet's own order, with
    #: `null` where that row has nothing in that column. Aligned rather
    #: than sparse, so a client draws a table without doing arithmetic.
    cells: list[GridCell | None]


class SheetGrid(Schema):
    name: str
    #: The column headings the workbook itself carries — « FY2024A ». One
    #: empty string for a sheet laid out as a list rather than a table,
    #: which is normal for assumptions.
    columns: list[str]
    rows: list[GridRow]
    #: How many named rows the sheet has, against how many are in `rows`.
    #: A model can run to tens of thousands of cells, so this is capped;
    #: a screen that quietly drew the first two hundred would be claiming
    #: the model is smaller than it is.
    rows_total: int


class HiddenFinding(Schema):
    """One thing in the file that is not on its screen."""

    rule: str
    #: `leak` — content a recipient can read that the sender did not put
    #: on the page. `trace` — who, when, how it was filed. Never added.
    severity: str
    where: str
    detail: str
    evidence: str = ""


class HiddenReport(Schema):
    """What travels with this file — the metadata checker, on the wire.

    Computed on request from the stored bytes rather than persisted: the
    answer is a second's work, it is always about the current version,
    and a stored copy would be one more thing that can silently disagree
    with the file it describes.
    """

    kind: str
    parts: int
    findings: list[HiddenFinding]
    #: The refusal sentence, when the file is not one the checker reads —
    #: a PDF, a legacy .doc, a password-protected workbook. A valid
    #: answer about the file, not an error: the screen shows it in place
    #: of the list.
    refused: str | None = None


class VersionRead(Schema):
    """One upload of a document, oldest last."""

    id: UUID
    version: int
    uploaded_by: Uploader | None
    uploaded_at: datetime
    #: Figures, cells, slides — whatever this kind of file has, so the
    #: row can say what each version brought without a diff engine.
    counts: dict[str, Any]


class ModelGrid(Schema):
    """A model as it is laid out, rather than as a search box.

    Only cells with a row label are here. A number with no words beside it
    cannot be recognised, cannot be linked, and is not what a person opens
    a model to read — it is scaffolding.
    """

    artifact_id: UUID
    filename: str
    version: int
    uploaded_at: datetime
    sheets: list[SheetGrid]


# --- settings ------------------------------------------------------------


class AuditRuleRead(Schema):
    """One audit rule, as the settings screen shows it."""

    key: str
    label: str
    on: bool
    #: True for the statement checks — whether the accounts hold
    #: together — so the screens can group the two families without
    #: keeping a list of their own.
    analytical: bool = False
    #: The check's passing sentence, where its name states the failure
    #: — a « Checks that pass » row must never read « Cash does not
    #: carry forward ». Empty when the label already serves.
    pass_label: str = ""


class HouseRulesRead(Schema):
    """How the firm wants Pierce to behave.

    `rules` is the audit's own catalogue with the firm's switches on it —
    sent whole so the screen can never invent a rule the audit does not
    run or miss one it does.
    """

    #: `together` — rounding differences sit with everything else;
    #: `separate` — the screens group them under their own head. Found
    #: either way, never hidden.
    rounding: Literal["together", "separate"]
    #: Ranges, fiscal years, units, negatives — as the firm writes them.
    writing: dict[str, str]
    #: Whether the grounding pass runs with the others.
    grounding: bool
    rules: list[AuditRuleRead]


class HouseRulesUpdate(Schema):
    """Only what changed. Left-out fields keep their value."""

    rounding: Literal["together", "separate"] | None = None
    writing: dict[str, str] | None = None
    grounding: bool | None = None
    #: Rule keys to switch off, replacing the previous set whole.
    audit_rules_off: list[str] | None = None


class TeamMember(Schema):
    """One person on the team, and where they are."""

    id: UUID
    name: str
    email: str
    avatar_url: str | None
    you: bool
    #: The deals they are on, in this organization only.
    deals: list[str]


class TeamRead(Schema):
    members: list[TeamMember]
    #: How many deals the organization has, so the screen can say
    #: « All six deals » only when it is true.
    total_deals: int


# --- one-off checks ------------------------------------------------------


class SoloStatement(Schema):
    """One place a file states a figure, for the check-a-file card."""

    printed: str
    location: str
    page: int
    #: The slide's title or the heading over the block — what the card
    #: prints under the value so a reader knows where they are being sent.
    section: str = ""
    #: The sentence around the figure, when there is one, so the evidence
    #: card can quote the file rather than paraphrase it.
    context: str = ""


class SoloFindingRead(Schema):
    """One name carrying two figures in the same file.

    Which one is *right* is not knowable from the file alone, and the
    shape deliberately does not guess — `first` and `other` are the two
    statements in reading order, and the finding is that the file says
    both.
    """

    label: str
    #: How many times the file states this name in total, counting the
    #: agreeing ones.
    statements: int
    first: SoloStatement
    other: SoloStatement


class OneOffDrift(Schema):
    """A printed figure that disagrees with the picked deal's model.

    The model is a real artifact in that deal, so `model_artifact_id`
    reaches the same grid endpoint the document panel uses for its
    four-rows-around-the-cell evidence.
    """

    printed: str
    expected: str
    label: str
    page: int
    location: str
    context: str
    ref: str
    name: str
    basis: str
    confidence: float
    one_tick: bool
    model_artifact_id: UUID | None = None


class OneOffDefect(Schema):
    """One defect from a model's own audit — mechanical or statement."""

    rule: str
    #: `error` or `smell` — never added into one number.
    severity: str
    ref: str
    sheet: str
    name: str
    detail: str
    #: The standard the rule comes from, so a banker asking « says who »
    #: has an answer.
    standard: str = ""
    #: True for a statement check — the family the screens group under
    #: « Whether the accounts add up ».
    analytical: bool = False
    #: The headline number and its phrase, composed by the engine where
    #: the measured values live. Empty for mechanical defects.
    figure: str = ""
    figure_unit: str = ""
    period: str = ""
    #: Where the cell's value goes, in the model's own words —
    #: « Opex total » → « Cashflow » → « Equity IRR ». Empty when
    #: nothing downstream reads the cell.
    flow: str = ""
    #: The fix, where one is derivable rather than a choice: the row's
    #: own formula, re-anchored to this cell — what the panel writes on
    #: « Fix the cell ». `fix_before` is the typed value it replaces,
    #: which the writer checks is still there before touching anything.
    fix: str = ""
    fix_before: str = ""
    #: What is wrong, in two or three words — « Incomplete total »,
    #: « Unexpected hardcode ». The line a reader scans first.
    headline: str = ""
    #: The finding as a person hears it — shown first, with `detail`
    #: as the evidence beneath.
    plain: str = ""
    #: The design's little Excel grid: the cell with its neighbours,
    #: composed at check time. None where the coordinate is not a cell.
    grid: dict[str, Any] | None = None


class AgainstModel(Schema):
    """One model the file was compared with — the « Compared with » card."""

    artifact_id: UUID
    filename: str
    version: int
    read_at: datetime


class OneOffResult(Schema):
    """One loose file, checked, with everything the screen draws.

    Three finding lists rather than one union: a solo disagreement, a
    drift against a model and an audit defect are different facts with
    different evidence, and a screen that receives them separately can
    never mistake one for another. Lists the check did not run are empty,
    not null — an empty list is « ran and found nothing ».
    """

    id: UUID
    filename: str
    kind: str
    checked_at: datetime
    #: The deal it was checked against, as named at check time. Empty for
    #: a check on the file's own. The name is a snapshot: deleting the
    #: deal later must not rewrite what this check was.
    against: str = ""
    dossier_id: UUID | None = None
    #: The models the file was compared with, for the « Compared with »
    #: card. Empty for a solo check.
    models: list[AgainstModel] = []
    #: What was read and compared — slides, figures, repeated names,
    #: differences. The tally row.
    counts: dict[str, Any]
    disagreements: list[SoloFindingRead] = []
    drifts: list[OneOffDrift] = []
    defects: list[OneOffDefect] = []
    #: The statement checks' own record for a model: whether this is a
    #: values-only copy, why a check stayed silent, and what each check
    #: examined — so a pass row can carry a real count.
    values_only: bool = False
    abstentions: list[dict[str, str]] = []
    tallies: dict[str, dict[str, int]] = {}


class RecentCheck(Schema):
    """One line of « Recent one-off checks »."""

    id: UUID
    filename: str
    kind: str
    #: The deal's name at check time, or empty — the sub-line is
    #: « Checked against {against} » or « Checked on its own ».
    against: str
    checked_at: datetime
    #: Enough for the row without the findings: the stored result comes
    #: back whole when the row is opened.
    counts: dict[str, Any]


__all__ = [
    "AgainstModel",
    "ArtifactPage",
    "ArtifactRead",
    "AuditRuleRead",
    "CellRead",
    "ChainInput",
    "ChainRead",
    "ChainStep",
    "ChangedCell",
    "CheckRunRead",
    "Coverage",
    "CoverageReason",
    "DealListItem",
    "DealPage",
    "FigureMap",
    "FigureRead",
    "FindingCounts",
    "FindingRead",
    "FindingSource",
    "FindingUpdate",
    "FindingWhere",
    "GridCell",
    "GridRow",
    "HouseRulesRead",
    "HouseRulesUpdate",
    "Identified",
    "Identify",
    "LinkAlternative",
    "LinkCell",
    "LinkDecision",
    "LinkFigure",
    "LinkRead",
    "ModelDiff",
    "ModelGrid",
    "OneOffDefect",
    "OneOffDrift",
    "OneOffResult",
    "PanelToken",
    "RecentCheck",
    "SheetGrid",
    "SlideFigures",
    "SoloFindingRead",
    "SoloStatement",
    "TeamMember",
    "TeamRead",
    "Uploader",
]
