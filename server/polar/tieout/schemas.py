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
    #: **The formulas, kept out of the prose.** `formula` is what this
    #: cell holds; `against` is what it is judged against — the rest of
    #: the row, the total beside it, the shape the series repeats.
    #: Both empty where the finding compares nothing. They exist so the
    #: sentences never have to carry a formula: the screen prints these
    #: as formulas instead.
    formula: str = ""
    against: str = ""
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
    #: The finding as a person hears it — the row's sentence.
    plain: str = ""
    #: The attention tier: 1 defect, 2 assumption at risk, 3 hygiene.
    #: Zero on findings stored before the elevation layer — the screen
    #: falls back on severity, the same rule as the deal list.
    tier: int = 0
    weight: float = 0.0
    basis: str = ""
    #: Every cell a folded finding stands for — the family's roster.
    cells: str = ""
    #: The typed value the fix replaces — the was of « was → should ».
    fix_before: str = ""
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
    #: tie-out counting as one. The Ances list states « 6 checks fail »,
    #: never a findings count, because one check can produce forty
    #: findings and the row would read like forty problems.
    failing_checks: int = 0
    #: When this deal was last **checked** — a tie-out or an audit,
    #: whichever finished last. Null: neither has ever run. It was the
    #: tie-out alone until a model-only deal (no deck to reconcile
    #: against) was seen reading « Not checked yet » beside eight
    #: findings of its own.
    checked_at: datetime | None = None
    #: The model this row names is a values-pasted copy — the published
    #: form most real models arrive in — so the construction rules read
    #: almost none of it. « Nothing failing » on such a row is true and
    #: misleading at once, and the row says so in two words.
    values_only: bool = False
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
    #: The current model, named for the row: filename and version of the
    #: latest ready workbook. Null when the deal has no model yet — the
    #: row says so instead of guessing.
    model_name: str | None = None
    model_version: int | None = None
    #: The worst attention tier among the open findings — 1 defect,
    #: 2 assumption at risk, 3 hygiene, 0 none open. Audit findings carry
    #: their tier; a finding stored before the elevation layer falls back
    #: on its severity (an error reads as a defect, a smell as hygiene).
    worst_tier: int = 0
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


class AskedRow(Schema):
    """One cell in an assistant answer — the tool's own row, verbatim.

    Rows never pass through the language model: the screen draws them
    from here, which is what keeps a listed figure a looked-up figure.
    """

    ref: str
    what: str
    value: str


class AskedClarify(Schema):
    """The chat asking one question back, before it does the work.

    The founder's pattern: the person asks, the chat asks **one**
    question, and a card names what it would do — so the person is
    choosing between things rather than answering a riddle. Nothing
    runs until they pick.

    Every field here is the tool's own payload, drawn verbatim. The
    prose never fills it: an option the model narrated but did not put
    in the tool call is an option the screen must not offer.
    """

    #: The question, in the assistant's own words.
    question: str
    #: Two or three words naming the work — « Targeted Check ».
    title: str
    #: One line saying what that work produces.
    blurb: str
    #: Two to four choices. **The last is the primary one** on the
    #: screen, which is why the wider and slower choice belongs there.
    options: list[str]


class AskedStage(Schema):
    """One step of a run, in the shape the run screen draws.

    The same tool call as `AskedStep`, dressed for a different job.
    `AskedStep` is the trace — what was done, kept with the answer so a
    reader can check it. This is the *live* view: what is happening
    right now, named, while it is happening. They carry the same
    `ordinal` and the same `summary`, so a screen can hold both without
    them ever disagreeing about what took place.
    """

    ordinal: int
    tool: str
    ok: bool
    #: `model` or `source` — which file icon sits beside the step.
    kind: str
    #: The activity: « Reading the workbook ».
    title: str
    #: What is being done right now, naming the real object — the
    #: assistant's own status line where it wrote one, otherwise built
    #: from the arguments it actually passed.
    sub: str
    #: The tool's own line, shown once the step is finished.
    summary: str
    #: What the step produced, named. **Empty is meaningful**: the
    #: design draws a skeleton there, which is the honest shape of
    #: « something happened and there is no name for it yet ».
    art: str = ""


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
    #: Set when the assistant decided it needed one thing settled
    #: before working. The screen draws the card and waits; the
    #: person's pick comes back as the next message, so the model
    #: never guesses which way they went.
    clarify: AskedClarify | None = None
    #: The cells behind the answer, from the last tool that returned
    #: any — drawn under the prose, each one clickable.
    rows: list[AskedRow] = []
    #: **What those cells are**, in the tool's own words — « 308 typed
    #: inputs across 13 sheets (no size filter applied) ». The screen
    #: folds the table behind this line rather than pouring it out
    #: under the answer: a reader who wants the evidence opens it, and
    #: a reader who asked a general question is not handed a wall of
    #: refs they did not ask for.
    rows_label: str = ""
    #: **Which model this answer is about**, and what else the deal
    #: holds. A deal-scoped question narrows to one model, and the
    #: narrowing used to be silent: on a deal carrying two, a confident
    #: paragraph could describe the wrong workbook and nothing on the
    #: screen said which one it read. Null when the deal holds no model
    #: (the assistant refuses before this matters). These come off the
    #: artifacts, not the prose, so the screen can state them whatever
    #: the answer says.
    model: str | None = None
    model_version: int | None = None
    #: The deal's other models, named and versioned. Empty on the
    #: ordinary deal, which is why the screen only speaks when it is not.
    other_models: list[str] = []
    #: The run, step by step, for the screen that draws a run rather
    #: than a spinner. The streaming route sends these one at a time as
    #: they happen; the plain route sends them all at the end, so a
    #: caller that cannot stream still gets the same record.
    stages: list[AskedStage] = []


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


class VersionAuditSummary(Schema):
    """One version's audit record — the same shape a stored run keeps."""

    errors: int
    smells: int
    #: Attention tiers, « 1 » · « 2 » · « 3 », same fold as run history.
    tiers: dict[str, int]
    cells: int
    #: Rules the firm switched off, applied here exactly as in a real
    #: run — a decision on the record, never a silence.
    rules_off: list[str]
    values_only: bool
    abstentions: list[dict[str, str]]


class VersionAudit(Schema):
    """The audit re-run on one stored version, persisted nowhere.

    What the version dropdown re-scopes the page to. The findings carry
    no durable identity — nothing here can be accepted, dismissed or
    corrected, because rulings belong to the current version — and
    `checked_at` is the moment this answer was computed, not a stored
    run's date.
    """

    artifact_id: UUID
    version: int
    filename: str
    uploaded_by: Uploader | None
    uploaded_at: datetime
    checked_at: datetime
    summary: VersionAuditSummary
    findings: list[FindingRead]


class DeltaItemRead(Schema):
    """One reviewed change — one authoring decision where possible.

    The Watch's own item, on the wire: `kind` is one of its eight
    classes (`new_defect` · `class_change` · `relabelled_line` ·
    `methodology_change` · `moved_assumption` · `material_output` ·
    `structure` · `repaired_defect`), already ranked by the engine.
    A screen renders them in the order received and never re-ranks.
    """

    kind: str
    sheet: str
    #: Old-side row block for row-shaped items; 0 when the item is not
    #: row-shaped (a keyed finding with no aligned position).
    first_row: int = 0
    last_row: int = 0
    #: Column letters touched, old-side, in order.
    columns: list[str] = []
    #: The Watch's own sentence for the item, when it wrote one.
    detail: str = ""
    #: Orders items inside their kind; finding weight where the item is
    #: a finding, magnitude otherwise.
    weight: float = 0.0
    #: Finding keys folded into this item — the class-change join's
    #: roster (« new: typed-over-formula »).
    findings: list[str] = []


class VersionDeltaRead(Schema):
    """What one revision did, in review language — the Watch, served.

    Computed on request from the two versions' stored bytes and
    persisted nowhere. The counts are the revision-defect study's own
    semantics: findings matched on rule + sheet + name, never the
    address, and the ones with no name to match by are **counted
    apart, never guessed at** — a screen shows that count when it is
    not zero rather than folding it away.
    """

    old_artifact_id: UUID
    old_version: int
    old_uploaded_at: datetime
    old_uploaded_by: Uploader | None
    new_artifact_id: UUID
    new_version: int
    new_uploaded_at: datetime
    new_uploaded_by: Uploader | None
    #: When this answer was computed — the report is always fresh,
    #: never a stored run's date.
    computed_at: datetime
    new_defects: int
    repaired_defects: int
    persistent_defects: int
    unmatched_old: int
    unmatched_new: int
    sheets_added: list[str] = []
    sheets_removed: list[str] = []
    #: Ranked by the engine; rendered in order.
    items: list[DeltaItemRead] = []


class DeckDeltaItemRead(Schema):
    """One printed figure, and what the revision did to it."""

    slide: int
    #: What the deck prints, as printed.
    printed: str
    #: Where on the slide — the deck's own coordinate, so a reader can
    #: put a finger on it.
    location: str
    #: The model row this figure agreed with *before* the revision.
    #: Old-side on purpose: it is what makes the attribution exact.
    old_ref: str = ""
    #: What the new model says it should read now.
    expected: str = ""
    name: str = ""
    #: The disagreement is one unit at the printed precision — a
    #: rounding convention, reported as itself rather than as an error.
    one_tick: bool = False
    #: The model change underneath this break, in the Watch's own
    #: words. **Empty where it could not be attributed**, which the
    #: screen says in words rather than filling with the nearest
    #: change — a guess printed as a cause is the worst thing here.
    cause: str = ""


class DeckDeltaRead(Schema):
    """What a model revision did to the deliverables.

    The same deck tied out against both versions of the model, and the
    difference read in review language. The four lists are four
    different sentences and are never summed into one: only `broken`
    is the revision's doing, `still_drifting` is explicitly *not*, and
    `coverage_changed` is « I lost sight of it », which is not « it
    broke ».

    Computed on request from three stored files and persisted nowhere.
    """

    old_artifact_id: UUID
    old_version: int
    new_artifact_id: UUID
    new_version: int
    deck_artifact_id: UUID
    deck_filename: str
    computed_at: datetime
    #: How many of the deck's printed figures could be reconciled at
    #: all, each side. A fall between them is what `coverage_changed`
    #: is about, and a reader needs both numbers to judge the rest.
    checked_old: int
    checked_new: int
    #: Agreed before, drifts now — the revision did this.
    broken: list[DeckDeltaItemRead] = []
    #: Drifted before, agrees now — the revision came to the deck.
    repaired: list[DeckDeltaItemRead] = []
    #: Disagrees with both versions, so it is not this revision's
    #: fault. Kept off its account deliberately.
    still_drifting: list[DeckDeltaItemRead] = []
    #: Reconcilable against one version only.
    coverage_changed: list[DeckDeltaItemRead] = []


class RecalcDiff(Schema):
    """One cell the engine did not reproduce — both numbers, on the record."""

    ref: str
    #: The value Excel left in the file; None when the mismatch is of
    #: kind (a stored number against an engine error, say).
    stored: float | None
    #: What our engine computed — a number, an error string, or None.
    computed: float | str | None
    #: The absolute difference that *would* have been allowed, when
    #: both sides were numbers.
    tolerance: float | None


class RecalcRefusal(Schema):
    """One construct the engine may not honestly compute, in words."""

    ref: str
    #: The denylist's category: `lambda`, `cube`, `rtd`, `udf`,
    #: `external-link`, `engine-gap`.
    category: str
    #: The function or reference that tripped the scan, as written.
    target: str
    #: Where this construct routes the file: `arbiter` (real Excel
    #: could settle it) or `refuse` (nothing we run honestly could).
    route: str


class RecalcMarkRead(Schema):
    """The fidelity gate's answer for one stored version — the mark.

    `verdict` is the gate's own, one of four: **pass** (the engine
    reproduced every compared cell — the only verdict that reads
    « validated by recalculation »), **fail** (differing cells, named
    below), **refused** (denylisted constructs; no comparison ran, and
    `refusals` says why in words), **nothing-compared** (the formula
    cells carry no stored values, so there was nothing to certify).
    Persisted on the artifact, so the mark always describes exactly the
    bytes of the version it sits on; a new upload starts unmarked.
    """

    verdict: str
    #: Which engine produced the numbers — named so a fake can never be
    #: mistaken for a machine result. None when the file was refused
    #: before any engine ran.
    engine: str | None
    computed_at: datetime
    #: Formula cells with a stored value the engine also computed.
    compared: int
    matched: int
    match_rate: float | None
    #: The worst differing cells, named; `mismatch_count` is the whole
    #: truth when the list is capped.
    mismatches: list[RecalcDiff] = []
    mismatch_count: int = 0
    #: Cells where the engine produced an error against a stored number
    #: — the engine's measured inability, never the model's defect.
    engine_errors: list[RecalcDiff] = []
    engine_error_count: int = 0
    #: Formula cells the engine returned nothing for.
    not_computed: int = 0
    #: Formula cells with no stored value to compare against.
    no_stored_value: int = 0
    refusals: list[RecalcRefusal] = []
    refusal_count: int = 0
    #: The refused file's route: `arbiter` or `refuse`; None otherwise.
    route: str | None = None
    #: TODAY/NOW/RAND-class cells and everything downstream of one —
    #: set aside, reported, never counted as compared.
    volatile_roots: int = 0
    volatile_cone: int = 0


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
    """One person on the team — never which deals they are on.

    The founder decided it (26 August, on the posture doc's § 3
    finding): deal names come off the team screen, so « being at the
    firm grants nothing » holds without an asterisk. Only the count
    travels; which deals stays behind membership, like everything
    else about them.
    """

    id: UUID
    name: str
    email: str
    avatar_url: str | None
    you: bool
    #: How many of this organization's deals they are on — a number,
    #: never a name.
    deal_count: int


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
    #: **The formulas, kept out of the prose.** `formula` is what this
    #: cell holds; `against` is what it is judged against — the rest of
    #: the row, the total beside it, the shape the series repeats.
    #: Both empty where the finding compares nothing. They exist so the
    #: sentences never have to carry a formula: the screen prints these
    #: as formulas instead.
    formula: str = ""
    against: str = ""
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
    #: Elevation: the attention tier (1 defect / 2 assumption at risk /
    #: 3 hygiene), the 0–1 weight that orders the report, and the
    #: sentence saying why the engine ranked it here. Zero and empty on
    #: results stored before the elevation layer existed.
    tier: int = 0
    weight: float = 0.0
    basis: str = ""
    #: Every cell a folded finding stands for — the family's roster.
    cells: str = ""
    #: The design's little Excel grid: the cell with its neighbours,
    #: composed at check time. None where the coordinate is not a cell.
    grid: dict[str, Any] | None = None
    #: Accepted on the bench, with the note that says why — kept in the
    #: stored answer, so a recent reopens with the ruling standing.
    accepted: bool = False
    accepted_note: str = ""


class AcceptCheck(Schema):
    """« Accept with a note » on a one-off check — one rule, one note."""

    rule: str
    #: Why this is acceptable. The server refuses a bare acceptance,
    #: same as a deal's dismissal: a ruling without a reason is not one.
    note: str


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
    "AcceptCheck",
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
