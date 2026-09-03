"""Checking a model against itself, with no deck involved.

The tie-out asks whether the deck agrees with the model. This asks whether
the model agrees with itself, and it is the cheaper and more immediately
useful of the two: it needs no deliverable, no linking, no judgement about
what a figure is called, and it finds errors in a banker's own work rather
than in their colleague's.

Every rule here is mechanical. Nothing is asked of a model, nothing
depends on a threshold anybody tuned, and each one is stated in at least
two of the published standards — the FAST Standard (CC-BY-4.0), the ICAEW
*Twenty Principles for Good Spreadsheet Practice*, SMART and Operis's
audit method. Where those standards prescribe something a machine cannot
see — whether an assumption is commercially reasonable, whether a
normalisation is justified — it is deliberately absent.

**The false-positive problem here is different from the tie-out's, and
sharper.** The tie-out could stay silent about a figure it did not
understand. An audit that flags every constant in a model flags the
inputs, which is every model. So each rule below carries an exception that
was not obvious until it was measured against real models:

- Historical actuals are constants and are supposed to be. The boundary
  between the typed past and the calculated future is found per sheet, and
  nothing to the left of it is a hardcode.
- Circular references are deliberate in most valuation models — every one
  of the four Damodaran models tested has iterative calculation switched
  on, which is the workbook saying so in the file format. Circularity is
  reported only when the workbook has not.
- `#N/A` and `#DIV/0!` are routine in a template with empty inputs.
  `#REF!` and `#NAME?` never are.

What survives is graded. An **error** is wrong however the model is used.
A **smell** is a departure from the standards that is often deliberate,
and the two are never added into one number.
"""

import gc
import math
import re
from collections import Counter
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from functools import cache
from typing import Any

from openpyxl.utils import get_column_letter

from .regularity import bump_for
from .regularity import islands as _islands
from .workbook import REFERENCE, Cell, Workbook, tokens_of

#: Error values that are always a defect: a deleted row, a mistyped
#: function name, a reference into a range that no longer exists.
BROKEN = frozenset({"#REF!", "#NAME?"})

#: How many interior designed-error runs make a column's gaps routine
#: rather than breaks. Measured on the RIIO-3 WACC model's daily-rates
#: sheets: a market-calendar column carries thousands of weekend gaps;
#: a genuinely interrupted series carries one or two. Ten is far above
#: any break and far below any calendar.
ROUTINE_GAPS = 10

#: Functions that recalculate on every change or address cells by string.
#: Discouraged by FAST and SMART because they make a model slow and its
#: dependency graph unreadable — including to this package.
VOLATILE = frozenset({"OFFSET", "INDIRECT", "NOW", "TODAY", "RAND", "RANDBETWEEN"})

#: Numbers that carry no assumption. A sign flip, a percentage conversion,
#: a count of months or days, the two in a mean. Flagging these is how a
#: hardcode check earns a reputation for noise and stops being read.
#: 9999 is the conventional « never happens » sentinel year, and
#: 365.25 / 365.2425 are the Julian and Gregorian year lengths — date
#: arithmetic, not assumptions, wherever they appear.
INNOCENT = frozenset(
    {0, 1, 2, -1, 10, 12, 24, 52, 100, 360, 365, 1000, 1000000}
    | {9999, 365.25, 365.2425}
)

#: Functions that answer « which part of the calendar is this? ». A
#: literal compared against their result — `WEEKDAY(A2,2)<6` is the
#: business-day test — is calendar logic, not a model assumption.
CALENDAR_PARTS = frozenset({"WEEKDAY", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND"})

#: A formula writing the not-available value on purpose. The error it
#: produces is by construction — `IF(toggle, data, NA())` is chart
#: scaffolding saying « this series is off » — and an error the author
#: wrote is not an error finding.
NA_LITERAL = re.compile(r"\bNA\s*\(\s*\)", re.IGNORECASE)

#: Functions whose numeric arguments *are* the notation, not buried
#: assumptions. `DATE(2025,4,1)` is how a date is written in a formula —
#: there is no cell it could live in that would make it clearer — and
#: the usefulness audit found a fifth of all hardcode noise was exactly
#: this: date literals read as buried assumptions.
DATE_FUNCS = frozenset({"DATE", "EDATE", "EOMONTH"})

#: Functions that work on text. A count of characters in MID, a repeat
#: count in REPT, a position in FIND — none of these is a modelling
#: assumption, and every one read as a hardcode annoyed the reader.
TEXT_FUNCS = frozenset(
    {
        "REPT",
        "LEFT",
        "RIGHT",
        "MID",
        "FIND",
        "SEARCH",
        "SUBSTITUTE",
        "TEXT",
        "CHAR",
        "CONCATENATE",
        "CONCAT",
        "TEXTJOIN",
    }
)

#: Functions whose *last* argument is a precision, not an assumption.
#: `ROUND(x,8)=ROUND(y,8)` is a check row's tolerance idiom.
ROUND_FUNCS = frozenset({"ROUND", "ROUNDUP", "ROUNDDOWN", "MROUND", "FLOOR", "CEILING"})

#: How many rows must agree before a column counts as the boundary between
#: a model's typed history and its calculated forecast.
BOUNDARY_ROWS = 3

#: A column header that names a period. A row is one calculation repeated
#: *over time*, and that is what makes departure from its pattern a
#: defect. Where the columns name different quantities instead — a ratings
#: table whose columns are « min coverage », « rating », « cost of debt » —
#: the cells are supposed to differ, and Damodaran's APV model has five
#: such rows that looked like five defects.
PERIOD = re.compile(
    r"""^\s*(?:
        (?:FY|CY|LTM|NTM)?\s*(?:19|20)\d{2}\s*[AEPF]?
      | Q[1-4](?:\s*(?:19|20)\d{2})?
      | (?:Year|Yr|Period)\s*\d+
      | \d{1,2}
      | Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec
    )\s*$""",
    re.VERBOSE | re.IGNORECASE,
)

#: How wide a gap a series may bridge. One blank column between quarters
#: or before a total is a spacer; two is a different table.
GAP = 1

#: How many side-by-side cells make a series. Four, because the check only
#: looks at interior cells: three would leave exactly one cell to judge
#: against one neighbour on either side, which is not a pattern.
MIN_SERIES = 3

#: How long a formula may be before its length is itself the finding.
#: FAST and ICAEW both prescribe short formulas; this is set where a
#: formula stops being readable in a cell.
LONG_FORMULA = 180

#: A reference into another workbook: `[1]Sheet1!A1`, `'[2]Q3 data'!B7`.
EXTERNAL = re.compile(r"\[\d+\]|\[[^\]]+\.xl")


@dataclass(frozen=True)
class Finding:
    """One thing wrong with the model, or one departure from standard."""

    #: The check that fired, so findings can be counted by kind and a
    #: whole rule switched off by a firm that disagrees with it.
    rule: str
    #: `error` — wrong however the model is used. `smell` — a departure
    #: from the standards that is often deliberate. Never added together.
    severity: str
    ref: str
    sheet: str
    #: What the model calls the cell, when its labels say.
    name: str
    detail: str
    #: The standard the rule comes from, so a banker asking « says who »
    #: gets an answer that is not « the tool ».
    source: str = ""
    #: The headline number, printed, and the phrase saying what it is —
    #: « 19,100 » / « typed, where the row would calculate 19,605 ».
    #: Composed here, where the values are in scope, never on a screen.
    figure: str = ""
    figure_unit: str = ""
    #: Where the cell's value goes, in the model's own words —
    #: « Opex total » → « Cashflow » → « Equity IRR ». Empty when
    #: nothing downstream reads the cell, which is worth knowing too.
    flow: str = ""
    #: The fix, where one is derivable rather than a choice: the row's
    #: own formula, re-anchored to this column. Empty for every finding
    #: whose fix is a decision belonging to the model's author.
    fix: str = ""
    #: What the cell holds now, exactly as the reader recorded it — the
    #: writer refuses unless this is still there when it arrives.
    fix_before: str = ""
    #: Elevation — how much of an auditor's attention this deserves,
    #: computed once every fold has settled. `tier` is the attention
    #: class (1 defect / 2 assumption / 3 hygiene); `weight` orders
    #: findings inside and across tiers, 0–1; `basis` says in one
    #: sentence why the engine ranked it here, so the ranking is never
    #: an unexplained number.
    tier: int = 0
    weight: float = 0.0
    basis: str = ""
    #: Every cell a folded finding stands for, so « one finding » never
    #: hides its members: a family is the sentence, this is the roster.
    #: Empty on a finding that is its own single cell.
    cells: str = ""
    #: **The formulas, kept out of the prose.** A finding that compares
    #: two formulas used to splice both into `detail`, and what reached
    #: a person was « … they read 'Control Panel'!$C$51, it reads
    #: 'Control Panel'!$D$51: =(E45+E48)/2*'Control Panel'!$D$51 ».
    #: `findings-voice.md` allows two sentences and no formula in
    #: either; a reviewer still wants the formula, so it goes here and
    #: the screen shows it as a formula.
    #:
    #: `formula` is what this cell holds. `against` is what it is being
    #: judged against — the rest of the row, the sibling total, the
    #: shape the series repeats — empty when the finding compares the
    #: cell with nothing.
    formula: str = ""
    against: str = ""
    #: **Which branch of its rule this is**, as a fixed key the
    #: sentence builder switches on. It was `figure_unit` for a while,
    #: and `_quantified` overwrites that with the money phrase when it
    #: can price a cell — so a priced finding silently fell through to
    #: its rule's generic sentence. A key that doubles as prose is a
    #: key that gets rewritten. This one is never shown.
    kind: str = ""


@dataclass(frozen=True)
class Abstention:
    """A check that had nothing to look at, with the reason why.

    Deliberately the same shape and the same field names as the
    analytics layer's `Abstention`, so the product meets one
    vocabulary rather than two (A4, docs/pierce/a4-coverage.md).
    """

    rule: str
    why: str


@dataclass
class Audit:
    findings: list[Finding] = field(default_factory=list)
    #: Cells examined, so silence can be told apart from not looking.
    examined: int = 0
    #: A4 — what each rule actually walked, keyed by rule. « No
    #: findings » and « nothing to look at » are different sentences,
    #: and without this the report cannot tell them apart. Absent
    #: means the rule counted nothing.
    tallies: dict[str, dict[str, int]] = field(default_factory=dict)
    #: A4 — the rules whose denominator is zero for a nameable
    #: reason. A rule with a non-zero denominator never appears here:
    #: it looked, and silence means clean.
    abstentions: list[Abstention] = field(default_factory=list)

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "error"]

    @property
    def smells(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "smell"]

    def by_rule(self) -> dict[str, int]:
        return dict(Counter(finding.rule for finding in self.findings))


#: Every rule this audit runs, in the words a settings screen shows —
#: the one place the list lives, so a screen can never invent a rule the
#: audit does not run or miss one it does. Ordered as a reader meets
#: them: what a cell shows, what a formula reaches, how a row behaves.
RULE_NAMES: dict[str, str] = {
    "error-value": "Cells showing an error value",
    "external-link": "Links into other workbooks",
    #: The same defect one level up in the file — a defined name
    #: storing #REF! or pointing into a workbook that is not here.
    "broken-name": "Defined names that are broken",
    "volatile": "Volatile functions",
    "long-formula": "Formulas too long to follow",
    "hardcode-in-formula": "Numbers typed inside formulas",
    "typed-over-formula": "Values typed over formulas",
    "typed-over-edge": "Values typed over a series' edge",
    "inconsistent-anchoring": "Anchoring that changes along a row",
    "inconsistent-row": "Formulas inconsistent across a row",
    "circular": "Circular references",
    "skipped-cell": "Sum ranges that miss a cell",
    #: A check formula that walks cells one by one and skips a live
    #: block — the author's own test, not covering what it walks.
    "gapped-test": "Check formulas that skip live cells",
    "range-over-block": "Ranges that reach past their block",
    "inconsistent-total": "Totals that disagree with the ones beside them",
    "broken-aggregation": "Period totals that take one sub-period",
    "hidden-sheet": "Hidden sheets",
}


#: `dict[sheet, PeriodAxis]` from the structure layer — typed loosely
#: here so the audit does not import the structure module (the axes are
#: handed in by the callers that already have them).
PeriodAxes = dict[str, Any]

#: What is wrong, in two or three words — the line a reader scans
#: before deciding whether to read on. The catalogue names in
#: RULE_NAMES describe the *rule* for a settings screen; these name
#: the *defect* for a finding, which is a different sentence.
HEADLINES: dict[str, str] = {
    "error-value": "Error value",
    "external-link": "External link",
    "broken-name": "Broken name",
    "volatile": "Always recalculating",
    "long-formula": "Complex formula",
    "hardcode-in-formula": "Typed-in assumption",
    "typed-over-formula": "Typed over a formula",
    "typed-over-edge": "Typed series edge",
    "inconsistent-anchoring": "Inconsistent anchoring",
    "inconsistent-row": "Inconsistent formula",
    "circular": "Cells in a loop",
    "skipped-cell": "Incomplete total",
    "gapped-test": "Gapped test",
    "range-over-block": "Range past its block",
    "inconsistent-total": "Disagreeing totals",
    "broken-aggregation": "Broken aggregation",
    "hidden-sheet": "Hidden sheet",
}

#: A period's granularity in the noun a person says out loud. The
#: structure layer's own words — « monthly », « annual » — are
#: adjectives, and « one sub-period » is nobody's sentence.
PERIOD_WORDS: dict[str, str] = {
    "monthly": "month",
    "quarterly": "quarter",
    "half-yearly": "half-year",
    "annual": "year",
}


def _tokens(formula: str) -> list[Any]:
    """The formula's tokens, or nothing when the grammar rejects it.

    The reader already records rejected formulas on the workbook and
    the audit reports each once — every other pass just skips them.
    Delegates to the reader's shared `tokens_of` cache, so a formula
    the reader already parsed is never parsed again by the audit."""
    try:
        return tokens_of(formula)
    except Exception:
        return []


#: Rules whose `figure` is money rather than a count or a constant —
#: the findings a materiality line may judge, and the ones a fill
#: fold may sum. `inconsistent-row` carries the delta against what
#: the row would calculate, which is money too; it was left out, so a
#: 20m difference ranked on structure alone.
MONEY_RULES = frozenset({"skipped-cell", "typed-over-formula", "inconsistent-row"})


def money_of(figure: str) -> float:
    """A printed figure back as a number — « 12.5m » → 12,500,000. Zero
    when the figure is empty, a count, or a list."""
    first = (figure or "").split(", ")[0].replace(",", "").strip()
    if not first:
        return 0.0
    scale = {"bn": 1e9, "m": 1e6}.get(first[-2:].lstrip("0123456789.-"), 1.0)
    try:
        return abs(float(first.rstrip("bnm"))) * scale
    except ValueError:
        return 0.0


def shown_number(value: float) -> str:
    """A figure as a banker says it: 512.5m, 1.2bn, 19,100.

    Never scientific notation — « 5.125e+08 » in a sentence is the
    engine talking to itself. Python's `,` grouping silently stops
    applying once `g` falls back to an exponent, which is exactly how
    that string reached a founder's screen.
    """
    magnitude = abs(value)
    if magnitude >= 1e9:
        return f"{value / 1e9:.4g}bn"
    if magnitude >= 1e6:
        return f"{value / 1e6:.4g}m"
    if magnitude >= 1e4:
        return f"{value:,.0f}"
    return f"{value:,.6g}"


def _period(axes: "PeriodAxes | None", sheet: str, ref: str) -> str:
    """The model's own label for a finding's column, or nothing."""
    if not axes:
        return ""
    axis = axes.get(sheet)
    if axis is None:
        return ""
    match = re.search(r"([A-Z]{1,3})(\d+)$", ref)
    if match is None:
        return ""
    from openpyxl.utils import column_index_from_string

    column = column_index_from_string(match.group(1))
    for at, label in axis.columns:
        if at == column:
            return label
    return ""


def _quantified(book: Workbook, result: Audit, axes: "PeriodAxes | None") -> None:
    """Attach the headline numbers the founder's design leads with.

    For a typed value in a calculated row: what the row would
    calculate there — the nearest formula in the row, shifted to this
    column and evaluated one step against cached values (the
    registered evaluator; silence where it abstains). For a skipped
    total: the worth of the rows it leaves out, straight from their
    cached values.
    """
    from .evaluate import evaluate, shifted

    quantifiable = {"typed-over-formula", "inconsistent-row"}
    replaced: list[Finding] = []
    for finding in result.findings:
        if finding.rule not in quantifiable:
            replaced.append(finding)
            continue
        cell = book.cells.get(finding.ref)
        if cell is None or cell.value is None:
            replaced.append(finding)
            continue
        #: The donor: the nearest cell in the same row with a formula.
        donor = None
        for distance in range(1, 41):
            for direction in (-1, 1):
                at = cell.column + direction * distance
                if at < 1:
                    continue
                from openpyxl.utils import get_column_letter

                neighbour = book.cells.get(
                    f"{cell.sheet}!{get_column_letter(at)}{cell.row}"
                )
                if neighbour is not None and neighbour.formula:
                    donor = neighbour
                    break
            if donor is not None:
                break
        if donor is None:
            replaced.append(finding)
            continue
        moved = shifted(donor.formula or "", cell.column - donor.column)
        expected = evaluate(book, cell.sheet, moved)
        typed = float(cell.value)
        #: The fix rides on the donor alone: putting the row's formula
        #: back is right even where the evaluator abstains from saying
        #: what it will compute. Only for a *typed* cell — prescribing
        #: a formula over a different formula is the author's decision.
        changes: dict[str, str] = (
            {
                "fix": moved if moved.startswith("=") else f"={moved}",
                "fix_before": str(cell.value),
            }
            if finding.rule == "typed-over-formula" and cell.formula is None
            else {}
        )
        if expected is not None and abs(expected - typed) > 1e-9:
            changes["figure"] = shown_number(typed)
            changes["figure_unit"] = (
                f"typed, where the row would calculate {shown_number(expected)}"
            )
        replaced.append(replace_finding(finding, **changes))
    result.findings = replaced


def replace_finding(finding: Finding, **changes: Any) -> Finding:
    from dataclasses import replace

    return replace(finding, **changes)


#: The tier names as a screen says them, in one place like RULE_NAMES.
TIER_NAMES: dict[int, str] = {
    1: "Defect",
    2: "Assumption at risk",
    3: "Hygiene",
}


#: The engine's own materiality when the firm has set none: half a
#: percent of the largest absolute value in the model. Registered on
#: the founder's own objection — « 8.513bn and 12.5m both read
#: Material; a number 680 times bigger gets the same label » — so the
#: label is derived from the amount and the finding's basis sentence
#: says the threshold it was judged against. A firm's own number, from
#: its house rules, replaces this whole.
MATERIALITY_SHARE = 0.005


def materiality_of(book: Workbook) -> float:
    """The model's own materiality line: half a percent of its scale."""
    largest = max(
        (
            abs(float(cell.value))
            for cell in book.cells.values()
            if cell.value is not None
        ),
        default=0.0,
    )
    return largest * MATERIALITY_SHARE


def _elevated(book: Workbook, result: Audit, materiality: float | None = None) -> None:
    """Round 3 — Elevate. Rank every finding, and say why.

    The mentor's formula, adopted whole: attention = structural risk ×
    financial magnitude × confidence. Structural risk is the tier —
    a defect is wrong however the model is used, an assumption moves
    numbers when it is wrong, hygiene is a standards departure that is
    often deliberate. Confidence is how directly the engine observed
    the problem: a displayed error is certain; a structural read can
    misjudge a designed layout; an override can be deliberate.
    Magnitude only ever *raises* a finding, and only when the engine
    computed real money for it — a worth left out of a total, a delta
    against what the row would calculate. Nothing is guessed, and the
    `basis` sentence carries all three factors so the ranking is an
    argument, not a number.
    """
    seen_by_rule: dict[str, tuple[float, str]] = {
        "error-value": (1.0, "the file displays the error itself"),
        "skipped-cell": (
            0.9,
            "the gap is in the formula's own range arithmetic, though a "
            "designed layout can excuse one",
        ),
        "inconsistent-row": (0.9, "the row's own pattern shows the break"),
        "range-over-block": (
            0.9,
            "both formulas are in the file — the inner total's rows are "
            "inside the outer's range, so they are added twice",
        ),
        "inconsistent-total": (
            0.9,
            "the family's own agreement shows the break — a family can "
            "be wrong together",
        ),
        "inconsistent-anchoring": (0.9, "the row's own anchoring shows the break"),
        "typed-over-formula": (
            0.8,
            "a typed value sits where the series calculates — overrides "
            "are sometimes deliberate",
        ),
        "typed-over-edge": (
            0.7,
            "the series ends in a typed value — a one-sided witness, "
            "and overrides are sometimes deliberate",
        ),
        "circular": (
            0.9,
            "the loop is in the dependency graph and the workbook does "
            "not declare iteration",
        ),
        #: Below the row-pattern rules, and deliberately. The evidence is
        #: as direct as theirs — the row's own behaviour over twenty-five
        #: periods — but **arithmetic cannot tell a defect from a house
        #: convention**, and the one surviving finding of the round that
        #: built this check was held for a person rather than decided.
        "broken-aggregation": (
            0.85,
            "the row aggregates its sub-periods everywhere else, though "
            "a house convention can look like a break",
        ),
    }
    #: Rules whose figure is money rather than a count or a constant —
    #: the only findings magnitude may promote, and the only ones the
    #: materiality line may demote.
    money_figures = MONEY_RULES
    threshold = materiality if materiality and materiality > 0 else materiality_of(book)
    threshold_said = (
        f"the firm's materiality of {shown_number(threshold)}"
        if materiality and materiality > 0
        else f"the model's own materiality line of {shown_number(threshold)}"
    )

    replaced: list[Finding] = []
    for finding in result.findings:
        money = money_of(finding.figure) if finding.rule in money_figures else 0.0
        if finding.severity == "error" and money and money < threshold:
            #: A real defect whose money sits under the line. Still a
            #: defect — the basis says so — but « Material » is a word
            #: about the amount, and this amount does not earn it.
            tier, risk = 2, 0.8
            confidence, seen = seen_by_rule.get(
                finding.rule, (0.9, "the defect is structural")
            )
            seen = (
                f"{seen}; {shown_number(money)} sits under {threshold_said}, "
                "so it is significant rather than material"
            )
        elif finding.severity == "error":
            tier, risk = 1, 1.0
            confidence, seen = seen_by_rule.get(
                finding.rule, (0.9, "the defect is structural")
            )
            if money:
                seen = f"{seen}; {shown_number(money)} is at or above {threshold_said}"
            elif finding.rule in money_figures:
                seen = f"{seen}; no amount could be computed for it"
        elif finding.rule == "hardcode-in-formula":
            tier, risk = 2, 0.6
            confidence, seen = (
                0.8,
                ("an assumption typed where nobody will find it to change it"),
            )
        elif finding.rule == "external-link":
            tier, risk = 2, 0.6
            confidence, seen = (
                0.8,
                ("a value from a workbook that is not here, so it cannot be checked"),
            )
        else:
            tier, risk = 3, 0.3
            confidence, seen = 0.7, ("a departure from the standards, often deliberate")

        bonus = 0.0
        if money:
            bonus = min(0.1, 0.03 * math.log10(1 + money))

        weight = round(min(1.0, risk * confidence + bonus), 2)
        basis = f"{TIER_NAMES[tier].lower()}: {seen}"
        if bonus:
            basis += f"; carries real money ({finding.figure})"
        if finding.flow:
            basis += f"; feeds {finding.flow}"
        replaced.append(replace_finding(finding, tier=tier, weight=weight, basis=basis))
    result.findings = replaced


def plain_words(finding: Finding, axes: "PeriodAxes | None" = None) -> str:
    """The finding as a banker hears it: what is wrong, then why it matters.

    The structure is the mentor's, adopted whole: a finding answers
    **what is wrong → where → why it matters**, in that order. The
    headline (:data:`HEADLINES`) says what kind of wrong; the screens
    say where (« E41 — Total Senior Debt Service »); this sentence
    carries the diagnosis and the consequence, in words a person scans
    once. The engine's `detail` stays what it always was — evidence
    beneath the claim, never the claim.
    """
    #: « E41 », not « Term Sheet!E41 » — the screens put the sheet on
    #: the where-line, and a sentence that repeats it reads like a log.
    at = finding.ref.rsplit("!", 1)[-1]
    period = _period(axes, finding.sheet, finding.ref)
    #: The cell's own composed name already carries its column label —
    #: « FY2032 Opex » — so the period is taken back out rather than
    #: said twice.
    label = finding.name
    if period and period in label:
        label = " ".join(label.replace(period, "").split())
    subject = f"{label} {period}".strip() if label else at

    if finding.rule == "typed-over-formula":
        if finding.kind == "one value across a row":
            #: The row fold: one value pasted across one row's columns.
            lead = f"{label} has" if label else "One row has"
            return f"{lead} {finding.figure_unit} of one row."
        if finding.kind == "a run of values":
            #: The run fold: adjacent columns typed over in one gesture,
            #: each holding its own number.
            lead = f"{label} has" if label else "One row has"
            return f"{lead} {finding.figure_unit} of one row."
        if finding.kind == "typed over a block":
            #: The block fold: a two-dimensional paste, one rectangle.
            shape = finding.figure_unit.removeprefix("typed over a ").split(",")[0]
            return f"« {finding.sheet} » is typed over a {shape}."
        if finding.kind == "typed over down a column":
            #: The block collapse: one decision, made once per repeated
            #: block or once per row of a paste — said once. The places
            #: themselves are the roster, in `cells`.
            places = finding.figure_unit.split()[3]
            lead = f"{label} is" if label else "One column is"
            return f"{lead} typed in at {places} places."
        #: The founder's own swap, from the table in
        #: `findings-voice.md`: « contains a fixed value while the rest
        #: of the row is calculated » becomes « is typed in; every other
        #: year calculates ».
        return f"{subject} is typed in. Every other cell in the row calculates."
    if finding.rule == "inconsistent-row":
        #: The branch key is `figure_unit`, never the detail's opening
        #: words: the detail is prose that gets rewritten, and a
        #: sentence builder keyed on prose breaks silently when it is.
        if finding.kind == "one operator changed":
            return (
                f"{subject} runs its row's calculation with the sign "
                "flipped. That changes the answer everywhere this cell goes."
            )
        if finding.kind == "one reference out of step":
            #: « Subordinated Debt Interest is the same formula as its 19
            #: siblings with one pinned reference out of step — they read
            #: 'Control Panel'!$C$51, it reads $D$51: =(E45+E48)/2*… Check
            #: which row it should be reading. » Forty words, two banned
            #: terms, a formula dump and a « check which ». The founder
            #: read that on a live model and asked who could read it.
            return f"{subject} reads a different cell from the rest of its row."
        if finding.kind == "a different switch setting":
            #: The selector drift: same formula, different switch value.
            return (
                f"{subject} tests a different switch. It is the same "
                "formula as its row with one setting changed."
            )
        if finding.kind == "rows broken in one column":
            rows = finding.figure_unit.split()[0]
            return (
                f"One column breaks the pattern of {rows} rows. Each row "
                "reads one place and this column reads another."
            )
        return f"{subject} breaks the pattern of its row."
    if finding.rule == "typed-over-edge":
        lead = f"{label} is" if label else f"The cell at {at} is"
        return (
            f"{lead} typed in at the end of a row that calculates. "
            "The series runs out in a typed number."
        )
    if finding.rule == "range-over-block":
        if finding.severity == "error":
            lead = f"{label}'s total" if label else f"The total at {at}"
            return (
                f"{lead} reaches over a subtotal of its own rows. "
                "Those rows are counted twice."
            )
        lead = f"{label}" if label else f"The range at {at}"
        return (
            f"{lead} spans a label inside its own range, so it adds rows "
            "from beyond the block it should cover."
        )
    if finding.rule == "inconsistent-total":
        lead = (
            f"{label} disagrees with the totals beside it"
            if label
            else f"The total at {at} disagrees with the totals beside it"
        )
        return (
            f"{lead}. A line of totals is one formula dragged across, and "
            "this one breaks the pattern."
        )
    if finding.rule == "gapped-test":
        #: The author's own check formula, not covering what it walks.
        #: It had no branch here at all, so `plain_words` fell through
        #: to the raw `detail` — which used to carry sixty characters
        #: of the formula. A sentence, and the formula stays out of it.
        named = label or f"The check at {at}"
        return (
            f"{named} skips {finding.figure} cells that hold numbers. A "
            "wrong figure in any of them would pass the check."
        )

    if finding.rule == "broken-aggregation":
        #: The claim is written where both granularities are known —
        #: nothing downstream can recover « month » from a sheet name —
        #: and it rides in `figure_unit`, so the headline is built here
        #: and the detail stays the finding's own second sentence.
        named = subject if label else f"The {period} figure" if period else "One row"
        return f"{named} {finding.figure_unit}."
    if finding.rule == "typed-over-beat":
        #: The beat: a series that calculates every N columns and holds
        #: a typed number on one of them. The detail carries a worked
        #: example — a formula — so it may not reach the sentence.
        lead = f"{subject} has" if label else f"The cell at {at} has"
        stride = finding.figure_unit.removeprefix("typed into a beat of ").split()[0]
        return (
            f"{lead} {finding.figure} typed into it. The rest of that row "
            f"calculates every {stride} columns."
        )
    if finding.rule in ("currency-mismatch", "scale-mismatch"):
        #: The founder's own objection, on a different rule: the whole
        #: formula pasted at the head of the sentence. The formula is
        #: evidence and stays in `detail`; the claim names the sum and
        #: the two things it added together.
        noun = "currency" if finding.rule == "currency-mismatch" else "scale"
        lead = f"{subject} adds" if label else f"The sum at {at} adds"
        #: « GBP, EUR » is a list; « GBP and EUR » is a sentence.
        spread = " and ".join(finding.figure.rsplit(", ", 1))
        #: The second half: a sum of pounds and euros is in neither.
        return (
            f"{lead} {spread} together, so its answer is not in any one "
            f"{noun}. A sum may only carry one {noun}."
        )
    if finding.rule == "hidden-sheet":
        #: The claim is written where the sheet's state is known —
        #: `findings-voice.md` rule 5 turns on the difference between
        #: « has not been read » and « but empty », which only the
        #: reader can tell. The detail is the second sentence.
        return f"{finding.figure_unit}."
    if finding.rule == "broken-name":
        #: `ref` is empty — a name lives in the workbook, not in a
        #: cell — so the subject is the workbook, as it is for
        #: `external-link`.
        if finding.figure == "1":
            if finding.figure_unit.startswith("point into"):
                return (
                    "This workbook keeps one name that points into a file "
                    "that is not here. It asks to be updated every time the "
                    "file opens, and cannot be checked."
                )
            return (
                "This workbook keeps one name that points at a deleted "
                "cell. A new formula written against it breaks on arrival."
            )
        if finding.figure_unit.startswith("point into"):
            return (
                f"This workbook keeps {finding.figure} names that point "
                "into files that are not here. They ask to be updated every "
                "time the file opens, and cannot be checked."
            )
        return (
            f"This workbook keeps {finding.figure} names that point at "
            "deleted cells. A new formula written against one breaks on "
            "arrival."
        )
    if finding.rule == "skipped-cell":
        #: `findings-voice.md`, rule 2: « The amount is the most
        #: important word in the finding. It must not sit at the end of
        #: a trailing clause. » The founder's own worked example is this
        #: rule: « Total Operating Costs misses 512.5m. » — then the
        #: mechanism in its own sentence.
        named = label or f"The total at {at}"
        periods = len(finding.cells.split(", ")) if finding.cells else 1
        if finding.figure and periods > 1:
            return f"{named} misses {finding.figure} across {periods} periods."
        if finding.figure:
            return f"{named} misses {finding.figure}."
        return f"{named} leaves out rows it should cover."
    if finding.rule == "hardcode-in-formula":
        if finding.figure_unit.endswith("each with its own number"):
            #: The sibling-sheet fold over differing numbers: one
            #: layout decision, one value typed per company sheet.
            sheets = finding.figure_unit.removeprefix("repeated on ").split(" sheets")[
                0
            ]
            return (
                f"Each of {sheets} sheets has its own number typed into "
                f"the formula at {at}. None of them can be traced to an "
                "input."
            )
        if finding.figure_unit.startswith("repeated on"):
            #: The sibling-sheet fold: one decision, one sheet per company.
            return (
                f"The formula at {at} has {finding.figure or 'a number'} "
                f"typed into it, {finding.figure_unit} of this workbook. "
                "If the assumption moves, every sheet must be found by hand."
            )
        if finding.figure_unit.endswith("formulas on one sheet"):
            #: The convention fold: one constant, many different formulas.
            return (
                f"{finding.figure or 'A number'} is typed into "
                f"{finding.figure_unit.removeprefix('in ').removesuffix(' on one sheet')} "
                f"on « {finding.sheet} » instead of being held in one "
                "cell. If the convention changes, each one must be found "
                "by hand."
            )
        #: The fill's span used to ride in this sentence — « … across
        #: Assumptions Processing!E17 to Assumptions Processing!X17 »,
        #: the sheet name twice inside a 27-word headline. `cells` is
        #: the roster; the sentence says how many, once.
        number = finding.figure or "a number"
        #: The row's name leads, never the cell — rule 1 — and the
        #: consequence agrees in number with the claim: twenty cells,
        #: « these 20 cells will not ».
        lead = f"{label} has" if label else f"The formula at {at} has"
        if finding.figure_unit.startswith("filled"):
            filled = len(finding.cells.split(", ")) if finding.cells else 0
            if filled > 1:
                return (
                    f"{lead} {number} typed into its formula in {filled} "
                    f"cells. If the assumption changes, these {filled} cells "
                    "will not."
                )
        where = f" in {period}" if period else ""
        return (
            f"{lead} {number} typed into its formula{where}. If the "
            "assumption changes, this cell will not."
        )

    if finding.rule == "error-value":
        if finding.figure_unit.startswith("repeated on"):
            #: The sibling-sheet fold for designed tails: one pasted
            #: formula erroring identically on every copy.
            return (
                f"« {finding.sheet} » shows {finding.figure or 'an error'} "
                "on every copy of one pasted formula. Fix it once and "
                "refill the sheets."
            )
        if finding.figure_unit == "cells past the data's edge":
            #: The designed tail: the data ends and the lookups say so.
            return (
                f"« {finding.sheet} » shows errors past the end of its "
                "data. That is a lookup's designed answer for missing "
                "data, not damage."
            )
        if finding.kind == "breaks a live column":
            value = finding.figure_unit.split()[0]
            return (
                f"{value} breaks a column that is live above and below it. "
                f"The cells beneath {at} still calculate."
            )
        if finding.figure_unit == "cells sharing one broken formula":
            return (
                f"{finding.figure} cells on « {finding.sheet} » share one "
                "formula whose target was deleted, so every cell that reads "
                "them builds on that error. Repair it once and refill the "
                "block."
            )
        return (
            f"{label or f'The cell at {at}'} shows an error instead of a "
            "number. Every cell that reads it builds on that error."
        )
    if finding.rule == "circular" and finding.figure_unit.startswith("cells"):
        if "identical loops" in finding.figure_unit:
            loops = finding.figure_unit.split()[2]
            #: « iterative calculation » is Excel's own phrase and is
            #: on the founder's never-say list; the vocabulary table
            #: swaps it for words that carry their own meaning.
            return (
                f"The same loop repeats {loops} times, across "
                f"{finding.figure} cells. The workbook has not been set "
                "to allow that, so the numbers may be stale."
            )
        return (
            f"A loop of {finding.figure} cells runs through {at}. The "
            "workbook has not been set to allow that, so the number may "
            "be stale."
        )

    if finding.rule == "volatile" and (
        finding.figure_unit.startswith("in ")
        or finding.figure_unit.startswith("repeated on")
    ):
        #: The idiom and sibling-sheet folds: one habit, said once.
        return (
            f"« {finding.sheet} » repeats a formula that Excel works out "
            "again on every change. Its value never sits still."
        )
    if finding.rule == "long-formula" and finding.kind == "every long formula":
        count = finding.figure_unit.split()[0]
        return f"{count} formulas are too long to check by hand."
    if finding.rule == "long-formula" and (
        finding.figure_unit.startswith("in ")
        or finding.figure_unit.startswith("repeated on")
    ):
        #: The row and sibling-sheet folds for long formulas. The
        #: character count lives in `detail` as evidence; the sentence
        #: says where the same over-long formula was repeated.
        same = (
            f"is {finding.figure_unit}"
            if finding.figure_unit.startswith("repeated")
            else f"sits {finding.figure_unit}"
        )
        return f"The formula at {at} is too long to check by eye. The same one {same}."

    pulls = (
        "One cell pulls its values from there, and none of them can be checked here."
        if finding.figure == "1"
        else f"{finding.figure or 'Its'} cells pull their values from "
        "there, and none of them can be checked here."
    )
    sentence = {
        "external-link": (f"This workbook reads a file that is not here. {pulls}"),
        "volatile": (
            f"{label or f'The cell at {at}'} works itself out again on "
            "every change to the file. Its value never sits still."
        ),
        #: Never opens with a cell address — `findings-voice.md` rule 1,
        #: « `E42` means nothing until the file is open ». The address
        #: rides in the sentence, not at the head of it.
        "long-formula": (
            f"The formula at {at} is too long to check by eye, so a "
            "mistake inside it cannot be seen by hand."
        ),
        "inconsistent-anchoring": (
            f"{label or f'The cell at {at}'} locks its references "
            "differently from the rest of its row. Filling the row again "
            "would change its result."
        ),
        #: « iterative calculation » is Excel's phrase, not a
        #: banker's — the vocabulary table swaps it for « circular
        #: calculation », said in words that carry their own meaning.
        "circular": (
            f"{label or f'The cell at {at}'} feeds its own calculation. "
            "The workbook has not been set to allow that, so the number "
            "may be stale."
        ),
    }.get(finding.rule)
    if sentence is None:
        #: Hidden sheets and the statement checks already write their
        #: detail as a sentence — it is the plain words.
        return finding.detail
    return sentence


#: How many `retained_parse_caches` scopes are open. While any is,
#: `audit()` leaves the parse caches in place for the next phase.
_cache_retainers = 0
#: Whether the cyclic collector was on when the outermost scope
#: opened, so the exit restores exactly what it found.
_collector_was_enabled = True


def _clear_parse_caches() -> None:
    tokens_of.cache_clear()
    _shape_of.cache_clear()
    _literal_scan.cache_clear()
    _normal_form.cache_clear()


@contextmanager
def retained_parse_caches() -> Iterator[None]:
    """Keep the content-keyed parse caches warm across several engine
    passes, clearing once on the way out.

    The caches exist because one audit asks for the same parse
    millions of times; the clear at the end of `audit()` exists so a
    corpus sweep's memory stays flat file after file. A version
    comparison broke that trade: it runs two audits and then builds
    signature grids over the same cells, and the clear between phases
    made it pay the cold parse pass up to three times over
    (`docs/pierce/delta-speed.md`). Inside this scope the clear is
    deferred to the scope's exit — correctness is untouched either
    way, because every one of these caches is keyed on the full
    inputs of the thing it stores.

    The scope also holds the cyclic garbage collector. Measured on
    the GD3 pair (`docs/pierce/delta-speed.md`, « what the 94 s
    really was »): tokenizing the pair's 616k distinct formulas costs
    28 s discarded, 128.7 s kept with the collector on, 31.0 s kept
    with it off — the supposed parse floor was ~100 s of the
    collector re-scanning an ever-growing heap of cached lists. The
    collector frees memory and changes no value, so holding it is
    output-identical by definition; the outermost exit restores its
    prior state and runs one collect over what the scope accrued.

    Reentrant: nested scopes clear once, when the outermost closes.
    The cost is memory — both books' tokens and shapes held at once,
    and cycles uncollected until the exit — so the scope belongs
    around one comparison, never around a sweep.
    """
    global _cache_retainers, _collector_was_enabled
    if _cache_retainers == 0:
        _collector_was_enabled = gc.isenabled()
        if _collector_was_enabled:
            gc.disable()
    _cache_retainers += 1
    try:
        yield
    finally:
        _cache_retainers -= 1
        if _cache_retainers == 0:
            _clear_parse_caches()
            if _collector_was_enabled:
                gc.enable()
                gc.collect()


def audit(
    book: Workbook,
    axes: "PeriodAxes | None" = None,
    *,
    materiality: float | None = None,
) -> Audit:
    """Every mechanical defect in a model, graded.

    `axes` — each sheet's period axis, from the structure layer — lets
    the findings speak the model's own time vocabulary (« FY2032 »
    instead of a column letter) and lets a typed cell say what the row
    would calculate there. Absent, every sentence falls back to
    coordinates; nothing is guessed.
    """
    result = Audit(examined=len(book.cells))

    _unreadable_formulas(book, result)
    _error_values(book, result)
    _external_links(book, result)
    _volatile(book, result)
    _long_formulas(book, result)
    _literals(book, result)
    _rows(book, result)
    _selector_drift(book, result)
    _mutations(book, result)
    _typed_islands(book, result)
    _typed_edges(book, result)
    #: `_typed_beats` is implemented and unit-tested but NOT wired:
    #: the whole 27-file corpus holds zero plantable beat lattices,
    #: so its catch rate cannot be measured here, and an unmeasured
    #: check does not report to anyone. The registered verdict is in
    #: docs/pierce/a3-beat-families.md; wiring it is a new round on a
    #: corpus that can host the measurement.
    _circularity(book, result)
    _skipped_cells(book, result)
    _sibling_totals(book, result)
    _range_over_block(book, result)
    _gapped_tests(book, result)
    #: `_unit_mismatch` is implemented and unit-tested but NOT wired.
    #: Measured on the closed-deal corpus it raised 103 findings on
    #: one model and **every one was a false alarm** — each of the
    #: form « GBP, none », where `none` is the inference saying a
    #: quantity has no currency at all (a rate, a count), not that it
    #: is in a different one. A dimensionless term added to a money
    #: term is not a currency mismatch, and I had counted `none` as a
    #: currency that could disagree. The registered verdict is in
    #: docs/pierce/e3a-unit-mismatch.md; the correction is its own
    #: round, registered before it is measured again.
    _hidden_sheets(book, result)
    _names_table(book, result)
    _broken_aggregation(book, result)

    _quantified(book, result, axes)
    result.findings = _collapsed(book, result.findings, axes)
    _flows(book, result)
    _one_long_formula_line(result)
    _elevated(book, result, materiality)
    _regularity_weighted(book, result)
    #: Weight first — a defect leads, hygiene closes — with the old
    #: severity/sheet order breaking ties so equal weights stay stable.
    result.findings.sort(
        key=lambda f: (-f.weight, f.severity != "error", f.sheet, f.rule, f.ref)
    )
    #: The caches exist for the passes above; dropping them here keeps
    #: a corpus sweep's memory flat file after file. Content-keyed, so
    #: clearing is about memory only, never correctness.
    #: A4 last, so its « raised » counts describe the report as it
    #: actually leaves the engine — after every fold has settled.
    _coverage(book, result)
    if _cache_retainers == 0:
        _clear_parse_caches()
    return result


#: A4 — which population each rule walks. The right-hand names are
#: computed once in `_coverage`; a rule absent here is one whose
#: denominator the reader surface cannot supply (`broken-name`, per
#: the round's amendment).
COVERAGE_OF: dict[str, str] = {
    "long-formula": "formulas",
    "volatile": "formulas",
    "hardcode-in-formula": "formulas",
    "inconsistent-anchoring": "formulas",
    "inconsistent-row": "formulas",
    "external-link": "formulas",
    "error-value": "valued",
    "typed-over-formula": "typed",
    "typed-over-edge": "typed",
    "skipped-cell": "aggregations",
    "inconsistent-total": "aggregations",
    "range-over-block": "aggregations",
    "circular": "connected",
    "hidden-sheet": "sheets",
}

#: A4 — rules that supply their own denominator instead of drawing one
#: from `COVERAGE_OF`, because no count of cells is the population they
#: walk. `broken-aggregation` judges **rows that declared a kind across
#: a pair of dated blocks**; a cell count cannot say how many those
#: are, and a cell count standing in for one would be a number wearing
#: a denominator's hat — the same objection that keeps `broken-name`
#: out of `COVERAGE_OF` entirely.
#:
#: Such a rule records its tally where it computed it, or appends its
#: own abstention naming the reason in the file's own terms. The
#: obligation is unchanged and `test_audit_coverage.py` holds it:
#: **every rule here still lands in exactly one of tallies or
#: abstentions, never both and never neither.**
SELF_COUNTED: frozenset[str] = frozenset({"broken-aggregation"})


#: A4 — why a denominator is zero, in the file's own terms. Ordered:
#: the first matching reason wins, so the most informative sentence
#: is the one that reaches the report.
def _why_empty(population: str, formulas: int) -> str:
    if population == "formulas" or (population != "sheets" and formulas == 0):
        return "the workbook holds no formulas — a values-pasted copy"
    return "nothing of this kind is present in the file"


def _coverage(book: Workbook, result: Audit) -> None:
    """A4 — what each rule walked, so « no findings » and « nothing to
    look at » stop being the same sentence.

    Registered in docs/pierce/a4-coverage.md. The populations are
    counted from the reader's own cells, never estimated, and each is
    the set the rule draws from — so a tally can never be smaller
    than the findings it explains. A rule whose population is
    non-empty never abstains: it looked, and silence means clean.
    """
    #: The label column's formulas count as formulas: the text rules
    #: draw from them (reader-label-formulas.md).
    formulas = sum(1 for cell in book.label_cells.values() if cell.formula)
    typed = valued = connected = aggregations = 0
    for cell in book.cells.values():
        if cell.formula:
            formulas += 1
            if BARE_SUM.match(cell.formula) or BARE_RANGE.match(cell.formula):
                aggregations += 1
        elif cell.value is not None:
            typed += 1
        if cell.value is not None:
            valued += 1
        if cell.precedents:
            connected += 1
    sizes = {
        "formulas": formulas,
        "typed": typed,
        "valued": valued,
        "connected": connected,
        "aggregations": aggregations,
        "sheets": len(book.sheets),
    }
    raised = Counter(finding.rule for finding in result.findings)
    #: A rule that counts its own population — `broken-aggregation`
    #: walks rows across dated blocks, which no count of cells can
    #: supply — records the tally where it computed it and has its
    #: `raised` filled in here, once the folds have settled.
    for rule, tally in result.tallies.items():
        tally["raised"] = raised.get(rule, 0)
    for rule, population in COVERAGE_OF.items():
        total = sizes[population]
        if total:
            result.tallies[rule] = {"total": total, "raised": raised.get(rule, 0)}
        else:
            result.abstentions.append(
                Abstention(
                    rule=rule,
                    why=_why_empty(population, formulas),
                )
            )


def _flows(book: Workbook, result: Audit) -> None:
    """Attach where each finding's value goes — after the collapse, so
    the walk runs once per authoring decision rather than once per cell
    a formula was filled into."""
    from .flows import dependents_index, flow

    if not result.findings:
        return
    index = dependents_index(book)
    result.findings = [
        replace_finding(
            finding,
            flow=" → ".join(flow(book, index, finding.ref)),
        )
        for finding in result.findings
    ]


#: Rules where a fill-copied formula fires once per cell it was filled
#: into. On a real base-cost model from the 2024 water price review, one
#: 625-character formula filled across a grid produced 7,752 of the
#: file's 8,017 findings — one authoring decision reported 7,752 times,
#: which buries the 265 findings that are about anything else.
FILLED_RULES = frozenset(
    {
        "long-formula",
        "volatile",
        "hardcode-in-formula",
        #: Added after the founder's own file came back with 114
        #: inconsistent-row findings and 100 skipped-cell findings —
        #: six dragged counter columns and four dragged totals, each
        #: reported once per cell it was filled into. One authoring
        #: decision, one finding, with the span in the sentence.
        "inconsistent-row",
        "skipped-cell",
    }
)


def _column_of(book: Workbook, finding: Finding) -> int:
    cell = book.cells.get(finding.ref)
    return cell.column if cell is not None else 0


def _label_row(book: Workbook, finding: Finding) -> int:
    """The row a total is labelled on: its own when it carries a
    label, the row above when it sits one row under an otherwise
    empty label — the skipped-cell check's own naming rule."""
    cell = book.cells.get(finding.ref)
    if cell is None:
        return 0
    if cell.row_label.strip():
        return cell.row
    above = book.cells.get(
        f"{cell.sheet}!{get_column_letter(cell.column)}{cell.row - 1}"
    )
    above_label = book.row_words.get(cell.sheet, {}).get(cell.row - 1, "")
    if above_label and (above is None or above.value is None):
        return cell.row - 1
    return cell.row


def _missed_rows(finding: Finding) -> list[int]:
    """The rows a skipped-cell finding says its sum starts below, as
    row numbers, read off its own first clause (« The sum starts below
    E38, E40 »)."""
    return [
        int(row)
        for _column, row in re.findall(
            r"\b([A-Z]{1,3})(\d+)\b", finding.detail.split(", worth")[0]
        )
    ]


def _missed_rows_named(book: Workbook, finding: Finding) -> str:
    """The rows a skipped-cell finding says its sum starts below, by
    their labels — « Senior Debt Interest » — falling back to « the
    same row » when the sheet gives them no label."""
    cells = _missed_rows(finding)
    labels = [
        book.row_words.get(finding.sheet, {}).get(row, "").strip() for row in cells
    ]
    named = [f"« {label} »" for label in labels if label]
    if not named or len(named) != len(cells):
        return "the same row"
    return " and ".join(named)


def _collapsed(
    book: Workbook,
    findings: list[Finding],
    axes: "PeriodAxes | None" = None,
) -> list[Finding]:
    """One finding per authoring decision, not per cell it was filled to.

    Findings from :data:`FILLED_RULES` whose cells share a sheet and a
    formula shape (references made relative, numbers erased) are one
    formula somebody wrote once and dragged. For the hardcode rule the
    buried numbers themselves stay in the key — via the detail, which
    prints them — so a row of *different* hardcoded assumptions is still
    reported cell by cell: those are distinct decisions.
    """
    keep: list[Finding] = []
    groups: dict[tuple[str, ...], list[Finding]] = {}
    for finding in findings:
        if finding.rule not in FILLED_RULES:
            keep.append(finding)
            continue
        cell = book.cells.get(finding.ref)
        shape = _shape(cell) if cell is not None else finding.ref
        key: tuple[str, ...] = (finding.sheet, finding.rule, shape)
        if finding.rule == "skipped-cell":
            #: One total row dragged across is one decision; two total
            #: rows with the same shape — senior debt service at row
            #: 41, subordinated at row 51 — are two. Folding them
            #: together named the second row after the first. The key
            #: is the row the total is labelled on and the rows it
            #: leaves out — not the formula's shape — so a first-period
            #: total that slipped one row under its label (E42 summing
            #: from row 37, where F41 to X41 sum from row 37) still
            #: folds with the nineteen periods beside it. It is the
            #: same miss, on the same row, in every period.
            key = (
                finding.sheet,
                finding.rule,
                str(_label_row(book, finding)),
                ",".join(str(row) for row in _missed_rows(finding)),
            )
        if finding.rule == "hardcode-in-formula":
            #: Same buried numbers = same decision. Keying on the whole
            #: detail — which contains the formula text — made twenty
            #: findings out of one dragged `*240000`, because the cell
            #: references inside the formula differ by one letter per
            #: column. The founder read all twenty. The numbers are the
            #: decision; the key is the numbers.
            key = (
                *key,
                ",".join(_buried(cell.formula or "")) if cell else finding.detail,
            )
        groups.setdefault(key, []).append(finding)

    for group in groups.values():
        if len(group) == 1:
            keep.append(group[0])
            continue
        #: The first period leads — it is the one the sentence quotes
        #: — and it is the leftmost column, not the first cell read.
        group = sorted(group, key=lambda one: _column_of(book, one))
        first = group[0]
        #: The span in the model's own time vocabulary when the axis
        #: knows these columns — « FY2014–FY2033 » beats « E17 to X17 ».
        edges = sorted(one.ref for one in group)
        start = _period(axes, first.sheet, edges[0])
        end = _period(axes, first.sheet, edges[-1])
        span = f"{start}–{end}" if start and end else f"{edges[0]} to {edges[-1]}"
        #: **The money is the whole row's.** « Total Senior Debt
        #: Service misses 37.5m » with « +38 » beside it read as one
        #: year's miss against thirty-nine cells — the headline and
        #: the fold count contradicted each other. Where every member
        #: carries an amount, the fold carries their sum, and the
        #: sentence says how many periods it runs across.
        worths = [money_of(one.figure) for one in group]
        summed = first.rule == "skipped-cell" and any(worths)
        figure = shown_number(sum(worths)) if summed else first.figure
        first_period = _period(axes, first.sheet, first.ref) or "the first period"
        #: The row the sum leaves out, by its name — « Senior Debt
        #: Interest » — because the member's own detail names it by
        #: cell and a fold across twenty periods has no one cell.
        below = _missed_rows_named(book, first)
        #: A member that sits one row under its label keeps that fact
        #: through the fold: it is the one cell a reader would not
        #: find on the label's row.
        slipped = [
            _period(axes, one.sheet, one.ref) or one.ref.rsplit("!", 1)[-1]
            for one in group
            if "one row below its label" in one.detail
        ]
        detail = (
            f"The sum starts below {below} in every period; "
            f"{first.figure} of it is in {first_period} alone. One formula, "
            f"filled across {len(group)} cells, so every period's total is "
            "out by its own share."
            + (
                f" In {' and '.join(slipped)} the total also sits one row "
                "below its label."
                if slipped
                else ""
            )
            if summed and first.figure
            else f"{first.detail} One formula, filled across {len(group)} cells."
        )
        keep.append(
            Finding(
                rule=first.rule,
                severity=first.severity,
                ref=first.ref,
                sheet=first.sheet,
                name=first.name,
                #: The fill's own sentence, kept to one clause. The
                #: roster used to be welded onto the end of the
                #: member's detail with a dash — « … — one formula
                #: filled across 39 cells (E51 to X51) » — which put
                #: the finding at three clauses before anyone read it.
                #: `cells` is where a fold's membership belongs.
                detail=detail,
                source=first.source,
                figure=figure,
                figure_unit=f"filled across {span}",
                kind=first.kind,
                formula=first.formula,
                against=first.against,
                cells=_roster(sorted(one.ref for one in group)),
            )
        )
    return _cross_folds(book, _typed_blocks(book, keep))


def _roster(coords: list[str]) -> str:
    """A folded finding's full membership, bounded so a thousand-cell
    fold cannot turn the roster into the flood it exists to end."""
    return ", ".join(coords[:40]) + (", …" if len(coords) > 40 else "")


def _typed_blocks(book: Workbook, findings: list[Finding]) -> list[Finding]:
    """A value typed over the same line of a repeating block is one
    decision, not one finding per block.

    The founder's file: a depreciation schedule built as six identical
    asset blocks, 27 rows each, the same line typed over in every one —
    Z23, Z50, Z77, Z104, Z131, Z157. Six copies of the same sentence
    bury whatever else the report has to say. The fill collapse above
    cannot catch this — it compares formula shapes and a typed cell has
    no formula — so the evidence of repetition here is the layout
    itself: same sheet, same column, and either the same row label or
    at least three cells at a constant row spacing. Two typed cells
    that merely share a column stay two findings: two is coincidence,
    a drumbeat is a pattern.

    The collapsed finding drops the per-cell figure and fix — each
    place holds its own number, and the one-cell writer should not
    claim to fix six cells by fixing one.
    """
    keep = [one for one in findings if one.rule != "typed-over-formula"]
    typed = [one for one in findings if one.rule == "typed-over-formula"]

    def _at(finding: Finding) -> tuple[str, int]:
        coordinate = finding.ref.rsplit("!", 1)[-1]
        column = "".join(ch for ch in coordinate if ch.isalpha())
        row = int("".join(ch for ch in coordinate if ch.isdigit()) or 0)
        return column, row

    #: Row-wise first. The column pass sees a typed *row* crossing many
    #: calculated columns as one island per column — the judged sample
    #: had single input rows reported eight ways. Six or more typed
    #: cells across one row holding a single value are one paste
    #: decision, folded to one sentence. Eight or more holding
    #: *varying* values are an input series laid across the sheet —
    #: data, not damage — and are dropped. Between those, a run of
    #: four or more *adjacent* columns typed over in one row is one
    #: gesture even when every column holds its own number — the H7
    #: stress-cargo row is one authoring decision, reported once with
    #: every cell named, not five sentences. Shorter or scattered runs
    #: stay per cell: two or three is coincidence, and scatter is not
    #: a gesture. A run with typed company directly above or below is
    #: the top of a two-dimensional paste — the Yorkshire block — and
    #: is left for the column pass, whose folds the block pass below
    #: reunites into one finding naming the whole rectangle.
    by_row: dict[tuple[str, int], list[Finding]] = {}
    for finding in typed:
        by_row.setdefault((finding.sheet, _at(finding)[1]), []).append(finding)
    survivors: list[Finding] = []

    def _column_index(letters: str) -> int:
        index = 0
        for letter in letters:
            index = index * 26 + (ord(letter) - 64)
        return index

    spots = {(one.sheet, _column_index(_at(one)[0]), _at(one)[1]) for one in typed}

    def _alone_in_its_column(finding: Finding) -> bool:
        column, row = _at(finding)
        index = _column_index(column)
        return (finding.sheet, index, row - 1) not in spots and (
            finding.sheet,
            index,
            row + 1,
        ) not in spots

    def _row_fold(run: list[Finding]) -> Finding:
        first = run[0]
        coords = [one.ref.rsplit("!", 1)[-1] for one in run]
        held = {
            str(cell.value) if (cell := book.cells.get(one.ref)) else one.ref
            for one in run
        }
        #: The detail is the finding's **second sentence** and stands
        #: on its own — the headline is written in `plain_words` off
        #: `figure_unit`, so neither has to be spliced into the other.
        what = (
            "It was one paste."
            if len(held) == 1
            else "It was one paste, and each cell holds its own number."
        )
        return Finding(
            rule=first.rule,
            severity=first.severity,
            ref=first.ref,
            sheet=first.sheet,
            name=first.name,
            detail=what,
            source=first.source,
            figure_unit=(
                f"one value typed across {len(run)} cells"
                if len(held) == 1
                else f"{len(held)} values typed across {len(run)} cells"
            ),
            kind="one value across a row" if len(held) == 1 else "a run of values",
            cells=_roster(coords),
        )

    for group in by_row.values():
        group.sort(key=lambda one: (len(_at(one)[0]), _at(one)[0]))
        if len(group) >= 6:
            held = {
                str(cell.value) if (cell := book.cells.get(one.ref)) else one.ref
                for one in group
            }
            if len(held) == 1:
                survivors.append(_row_fold(group))
                continue
            if len(group) >= TYPED_BLOCK:
                continue
        runs: list[list[Finding]] = [[group[0]]]
        for one in group[1:]:
            if _column_index(_at(one)[0]) == _column_index(_at(runs[-1][-1])[0]) + 1:
                runs[-1].append(one)
            else:
                runs.append([one])
        for run in runs:
            if len(run) >= 4 and all(_alone_in_its_column(one) for one in run):
                survivors.append(_row_fold(run))
            else:
                survivors.extend(run)
    typed = survivors

    by_column: dict[tuple[str, str], list[Finding]] = {}
    for finding in typed:
        coordinate = finding.ref.rsplit("!", 1)[-1]
        column = "".join(ch for ch in coordinate if ch.isalpha())
        by_column.setdefault((finding.sheet, column), []).append(finding)

    def _row(finding: Finding) -> int:
        digits = "".join(ch for ch in finding.ref.rsplit("!", 1)[-1] if ch.isdigit())
        return int(digits or 0)

    def _fold(group: list[Finding]) -> Finding:
        group = sorted(group, key=_row)
        first = group[0]
        coords = [one.ref.rsplit("!", 1)[-1] for one in group]
        #: One shared label speaks for the fold; six different block
        #: labels do not — the sentence then leads with the column.
        labels = {one.name for one in group}
        return Finding(
            rule=first.rule,
            severity=first.severity,
            ref=first.ref,
            sheet=first.sheet,
            name=first.name if len(labels) == 1 else "",
            detail="Every other cell in those rows calculates.",
            source=first.source,
            figure_unit=f"typed over in {len(group)} places",
            kind="typed over down a column",
            cells=_roster(coords),
        )

    column_folds: list[tuple[Finding, str, tuple[int, ...]]] = []

    def _folded(members: list[Finding]) -> None:
        rows = tuple(sorted(_row(one) for one in members))
        column = _at(members[0])[0]
        column_folds.append((_fold(members), column, rows))

    for (_, column), group in by_column.items():
        #: The same named line typed over twice is already a pattern.
        named: dict[str, list[Finding]] = {}
        rest: list[Finding] = []
        for finding in group:
            if finding.name:
                named.setdefault(finding.name, []).append(finding)
            else:
                rest.append(finding)
        for same in named.values():
            if len(same) > 1:
                _folded(same)
            else:
                rest.extend(same)
        #: What remains — labelled differently or not at all — folds on
        #: the beat alone: at least three places at a near-constant
        #: spacing is a repeating block, whatever each block calls its
        #: line. Near-constant, because real blocks drift: the founder's
        #: depreciation schedule runs 27-row blocks with one of 26, and
        #: a strict beat heard that as no pattern at all.
        rest.sort(key=_row)
        deltas = {
            _row(after) - _row(before)
            for before, after in zip(rest, rest[1:], strict=False)
        }
        if len(rest) >= 3 and max(deltas) - min(deltas) <= 1:
            _folded(rest)
        else:
            keep.extend(rest)

    #: The block pass. A two-dimensional paste — Yorkshire's FM02
    #: types five year-columns over four adjacent rows — reaches here
    #: as one column fold per column, five copies of the same news.
    #: Column folds covering the *same contiguous rows* in *adjacent
    #: columns* are one gesture: one finding naming the rectangle.
    #: Same-name beats over scattered rows never merge — their rows
    #: are not a rectangle, and the sentence would lie.
    by_span: dict[tuple[str, tuple[int, ...]], list[tuple[Finding, str]]] = {}
    for fold, column, rows in column_folds:
        if rows[-1] - rows[0] == len(rows) - 1:
            by_span.setdefault((fold.sheet, rows), []).append((fold, column))
        else:
            keep.append(fold)
    for (_, rows), members in by_span.items():
        members.sort(key=lambda one: (len(one[1]), one[1]))
        stretches: list[list[tuple[Finding, str]]] = [[members[0]]]
        for member in members[1:]:
            if _column_index(member[1]) == _column_index(stretches[-1][-1][1]) + 1:
                stretches[-1].append(member)
            else:
                stretches.append([member])
        for stretch in stretches:
            if len(stretch) == 1:
                keep.append(stretch[0][0])
                continue
            first = stretch[0][0]
            corner = f"{stretch[-1][1]}{rows[-1]}"
            roster = [f"{column}{row}" for _, column in stretch for row in rows]
            keep.append(
                replace_finding(
                    first,
                    detail="One paste went over the block's formulas.",
                    figure_unit=(
                        f"typed over a block {len(stretch)} columns wide "
                        f"and {len(rows)} rows deep, "
                        f"{first.ref.rsplit('!', 1)[-1]} to {corner}"
                    ),
                    kind="typed over a block",
                    cells=_roster(roster),
                )
            )
    return keep


def _cross_folds(book: Workbook, findings: list[Finding]) -> list[Finding]:
    """Folds that reach across rows and across sheets.

    The fill collapse folds one dragged formula; the usefulness audit
    measured a third of the report as duplicates it cannot see, in
    three layouts. A workbook built as one sheet per company carries
    the same authoring decision at the same address on every sheet —
    Ofgem's ED2 model types the same pool balance into fourteen DNO
    sheets — and fourteen copies of one sentence is one finding.
    A sheet whose idiom is OFFSET carries it in row after row with
    the arguments varying, so the shapes differ and the fill collapse
    keeps them apart — but « this sheet is built on OFFSET » is one
    fact about one sheet. And a convention constant — the 0.5 of a
    half-period adjustment — appears in many rows' otherwise different
    formulas: one convention, one finding, whatever each row does
    around it.

    Every fold needs at least three members: two of anything is
    coincidence.
    """
    SIBLING_RULES = ("hardcode-in-formula", "long-formula", "volatile")

    def sibling_pool(one: Finding) -> bool:
        #: Designed error tails join the smells here: the BPFM files
        #: paste one filename-title formula into A1 of every F-sheet,
        #: and its cached error reports once per sheet. Loud errors
        #: (#REF!, a break in a live column) never enter a fold.
        return one.rule in SIBLING_RULES or (
            one.rule == "error-value" and one.severity == "smell"
        )

    keep = [one for one in findings if not sibling_pool(one)]
    pool = [one for one in findings if sibling_pool(one)]

    def base_detail(finding: Finding) -> str:
        #: The member's own claim, with the fill fold's added sentence
        #: taken back off — this is a grouping key, so it has to be the
        #: same string for two findings that say the same thing.
        for suffix in (
            " One formula, filled across",
            " The same formula sits on",
            " The same decision sits on",
            " The same error sits on",
            " The same one sits in",
        ):
            finding = replace_finding(finding, detail=finding.detail.split(suffix)[0])
        #: A sheet-level error fold opens with the sheet's own name
        #: (« F4 » carries #VALUE! past its data's edge). The name is
        #: where, not what: four sheets carrying the same stray error
        #: at the same address are one finding, as they were before
        #: the sentence named the sheet.
        prefix = f"« {finding.sheet} » "
        if finding.rule == "error-value" and finding.detail.startswith(prefix):
            return finding.detail[len(prefix) :]
        return finding.detail

    def row_of(finding: Finding) -> int:
        return int(
            "".join(ch for ch in finding.ref.rsplit("!", 1)[-1] if ch.isdigit()) or 0
        )

    #: A row of near-identical long formulas first — ED2's transpose
    #: rows array-enter the same 343-character formula seven times with
    #: one anchored index hand-walked per column, so no two shapes
    #: match and the fill collapse cannot see the fill. Same row, same
    #: length, three or more times is one authoring pattern.
    folded_rows: list[Finding] = []
    by_line_key: dict[tuple[str, int, str], list[Finding]] = {}
    for finding in pool:
        if finding.rule != "long-formula":
            continue
        by_line_key.setdefault(
            (finding.sheet, row_of(finding), base_detail(finding)), []
        ).append(finding)
    for line in by_line_key.values():
        if len(line) < 3:
            continue
        first = min(line, key=lambda one: one.ref)
        folded_rows.append(
            Finding(
                rule=first.rule,
                severity=first.severity,
                ref=first.ref,
                sheet=first.sheet,
                name=first.name,
                detail=(
                    f"{base_detail(first)} The same one sits in "
                    f"{len(line)} cells of this row."
                ),
                source=first.source,
                figure_unit=f"in {len(line)} cells of one row",
                kind=first.kind,
                cells=_roster(sorted(one.ref for one in line)),
            )
        )
    folded_away = {
        id(one) for line in by_line_key.values() if len(line) >= 3 for one in line
    }
    pool = [one for one in pool if id(one) not in folded_away] + folded_rows

    #: The same finding at the same address under the same label on
    #: three or more sheets: a per-company workbook's repeated
    #: decision, whichever smell rule saw it. For a *labelled* hardcode
    #: the identity is the shape and the label, not the numbers — ED2
    #: types each company's own opening balance into the same row of
    #: every DNO sheet, and fourteen different numbers are still one
    #: layout decision. An unlabelled cell keeps the stricter
    #: numbers-bearing key, because without the label the numbers are
    #: the only evidence the cells mean the same thing. Shapes made of
    #: literals alone — `=52.07`, `=876.7+21.46`, `=1354.5+-4.3E-12` —
    #: are one spelling family: every one of them is a typed number,
    #: however its author chose to write the arithmetic, so they key
    #: alike and the sheet that spells its balance without a `+`
    #: still joins its sisters.
    by_address: dict[tuple[str, str, str, str], list[Finding]] = {}
    for finding in pool:
        coordinate = finding.ref.rsplit("!", 1)[-1]
        if finding.rule == "hardcode-in-formula" and finding.name:
            cell = book.cells.get(finding.ref)
            identity = _shape(cell) if cell is not None else base_detail(finding)
            if re.fullmatch(r"[=#+\-() ]+", identity):
                identity = "=#"
        else:
            identity = base_detail(finding)
        by_address.setdefault(
            (finding.rule, coordinate, finding.name, identity), []
        ).append(finding)
    solo: list[Finding] = []
    for group in by_address.values():
        sheets = sorted({one.sheet for one in group})
        if len(sheets) < 3 or len(sheets) != len(group):
            solo.extend(group)
            continue
        first = min(group, key=lambda one: one.sheet)
        shown = ", ".join(sheets[:4]) + (", …" if len(sheets) > 4 else "")
        #: **A fold changes how many, never the sentence.** These used
        #: to weld « — the same decision at E12 on 5 sheets (A, B, C) »
        #: onto the member's own detail with a dash, which turned a
        #: two-sentence finding into a four-clause one nobody finished
        #: reading. The count and the sheets belong in `figure_unit` and
        #: `cells`, where the screen can lay them out.
        details = {base_detail(one) for one in group}
        if first.rule == "error-value" and first.detail.startswith("« "):
            #: The member's sentence keeps its own sheet's name; the
            #: fold says which other sheets carry the same error.
            what = (
                f"{first.detail} The same error sits on {len(sheets)} sheets: {shown}."
            )
        else:
            what = (
                f"{base_detail(first)} The same "
                + ("formula" if len(details) == 1 else "decision")
                + f" sits on {len(sheets)} sheets: {shown}."
            )
        unit = (
            f"repeated on {len(sheets)} sheets"
            if len(details) == 1
            else f"repeated on {len(sheets)} sheets, each with its own number"
        )
        keep.append(
            Finding(
                rule=first.rule,
                severity=first.severity,
                ref=first.ref,
                sheet=first.sheet,
                name=first.name,
                detail=what,
                source=first.source,
                figure=first.figure,
                figure_unit=unit,
                kind=first.kind,
                cells=_roster(sorted(one.ref for one in group)),
            )
        )
    keep.extend(one for one in solo if one.rule == "error-value")

    #: What survives the address fold and is still a long formula may
    #: yet be one template: the BPFM F1 sheet repeats its per-block
    #: 326-character check row every fifteen rows, and the PCFM files
    #: stamp one 325-character import-source formula into column D of
    #: sheet after sheet. Same column, same length, three or more
    #: times in one file is one authoring decision, wherever its
    #: copies sit.
    lengthy = [one for one in solo if one.rule == "long-formula"]
    by_template: dict[tuple[str, str], list[Finding]] = {}
    for finding in lengthy:
        coordinate = finding.ref.rsplit("!", 1)[-1]
        column = "".join(ch for ch in coordinate if ch.isalpha())
        by_template.setdefault((column, base_detail(finding)), []).append(finding)
    for (column, base), group in by_template.items():
        if len(group) < 3:
            keep.extend(group)
            continue
        sheets = sorted({one.sheet for one in group})
        first = min(group, key=lambda one: (one.sheet, row_of(one)))
        if len(sheets) > 1:
            shown = ", ".join(sheets[:4]) + (", …" if len(sheets) > 4 else "")
            what = (
                f"{base} — the same formula in {len(group)} places "
                f"across {len(sheets)} sheets ({shown})"
            )
        else:
            at_rows = sorted(row_of(one) for one in group)
            spots = ", ".join(f"{column}{row}" for row in at_rows[:5]) + (
                ", …" if len(at_rows) > 5 else ""
            )
            what = (
                f"{base} — the same formula in {len(group)} places "
                f"down column {column} ({spots})"
            )
        keep.append(
            Finding(
                rule=first.rule,
                severity=first.severity,
                ref=first.ref,
                sheet=first.sheet,
                name=first.name,
                detail=what,
                source=first.source,
                figure_unit=f"in {len(group)} places",
                kind=first.kind,
                cells=_roster(sorted(one.ref for one in group)),
            )
        )
    solo_hardcodes = [one for one in solo if one.rule == "hardcode-in-formula"]

    #: The same numbers in three or more rows' otherwise different
    #: formulas on one sheet: a convention typed everywhere rather
    #: than held in one named cell. Same-shape repeats were already
    #: folded by the fill collapse, so what reaches here differs in
    #: shape and agrees only on the constant — which is the decision.
    by_convention: dict[tuple[str, tuple[str, ...]], list[Finding]] = {}
    for finding in solo_hardcodes:
        cell = book.cells.get(finding.ref)
        numbers = tuple(sorted(set(_buried(cell.formula or "")))) if cell else ()
        by_convention.setdefault((finding.sheet, numbers), []).append(finding)
    for (_, numbers), group in by_convention.items():
        rows = {row_of(one) for one in group}
        if not numbers or len(rows) < 3:
            keep.extend(group)
            continue
        first = min(group, key=row_of)
        keep.append(
            Finding(
                rule=first.rule,
                severity=first.severity,
                ref=first.ref,
                sheet=first.sheet,
                name=first.name,
                detail=(
                    f"{', '.join(numbers)} is written into "
                    f"{len(group)} different formulas rather than held in "
                    "one cell."
                ),
                source=first.source,
                figure=first.figure,
                figure_unit=f"in {len(group)} formulas on one sheet",
                cells=_roster(sorted(one.ref for one in group)),
            )
        )

    #: A sheet's function idiom: the same volatile function in three
    #: or more rows is how the sheet is built, said once — and short
    #: of that, twice in one row is one authoring decision.
    volatile = [one for one in solo if one.rule == "volatile"]
    by_idiom: dict[tuple[str, str], list[Finding]] = {}
    for finding in volatile:
        by_idiom.setdefault((finding.sheet, base_detail(finding)), []).append(finding)
    for (_, what), group in by_idiom.items():
        rows = {row_of(one) for one in group}
        if len(rows) >= 3:
            first = min(group, key=row_of)
            keep.append(
                Finding(
                    rule=first.rule,
                    severity=first.severity,
                    ref=first.ref,
                    sheet=first.sheet,
                    name=first.name,
                    detail=(
                        f"The sheet is built on it: {len(group)} places "
                        f"across {len(rows)} rows."
                    ),
                    source=first.source,
                    figure_unit=f"in {len(group)} places on one sheet",
                    cells=_roster(sorted(one.ref for one in group)),
                )
            )
            continue
        by_line: dict[int, list[Finding]] = {}
        for finding in group:
            by_line.setdefault(row_of(finding), []).append(finding)
        for line in by_line.values():
            if len(line) == 1:
                keep.extend(line)
                continue
            first = min(line, key=lambda one: one.ref)
            keep.append(
                Finding(
                    rule=first.rule,
                    severity=first.severity,
                    ref=first.ref,
                    sheet=first.sheet,
                    name=first.name,
                    detail=(
                        f"{base_detail(first)} The same one sits in "
                        f"{len(line)} cells of this row."
                    ),
                    source=first.source,
                    figure_unit=f"in {len(line)} cells of one row",
                    cells=_roster(sorted(one.ref for one in line)),
                )
            )

    return keep


def _unreadable_formulas(book: Workbook, result: Audit) -> None:
    """One malformed formula is one finding, never a dead workbook.

    Round 4's planting run watched the reader die on a partial-range
    `#REF!` and take the whole file with it. The reader now records
    what the grammar rejected and moves on; this reports each rejected
    cell once, loud — a formula Excel's own grammar cannot parse is
    damage by definition."""
    for ref in book.unparseable:
        cell = book.cells.get(ref)
        shown = (cell.formula or "")[:60] if cell else ""
        result.findings.append(
            Finding(
                rule="error-value",
                severity="error",
                ref=ref,
                sheet=ref.rsplit("!", 1)[0],
                name=cell.name if cell else "",
                detail="Excel's own grammar cannot read this formula.",
                formula=shown,
                kind="a formula that cannot be read",
                source="ISO/IEC 29500 formula grammar",
            )
        )


def _error_values(book: Workbook, result: Audit) -> None:
    """Error values, by what kind of error they are.

    `#REF!` and `#NAME?` are always damage — a deleted row, a mistyped
    name — and each one is its own finding, exactly as before: that
    per-cell result is what made a real closed-deal file's frozen
    references land, and no collapse is allowed to soften it.

    `#N/A` and its designed siblings are a different kind of thing: a
    lookup's own answer for « not there », shipped with IFNA to catch
    it, propagating on purpose. The discriminator is not the count but
    the **shape of the region**. A contiguous block at the tail of a
    column whose data simply ends — a daily-rates sheet past its last
    date — is the sheet doing its job: folded to one quiet finding per
    sheet, counted honestly. A designed error *inside* an otherwise
    live column is a break, and a break is loud: its own finding, per
    run. (Rows-wise tails — time laid out horizontally — are not yet
    classified and fall into the same per-sheet fold; named here so
    the gap is a sentence, not a silence.)

    Measured on the founder's corpus: the RIIO-3 WACC model carried
    65,593 findings under the old per-cell rule — one per `#N/A` in
    half-million-cell daily-gilt columns.
    """
    designed: dict[tuple[str, str], list[tuple[int, int, str]]] = {}
    #: Broken cells, by the formula that broke. The RIIO-3 ET3 model
    #: carries 334 `#REF!` cells that are exactly two formulas — a
    #: block of `=InputSummary!#REF!` links and one CHOOSE whose three
    #: arms all lost their target — each pasted across its block. One
    #: deletion, one finding, however many cells it tore: the fold
    #: keeps the severity, so nothing broken ever goes quiet, and a
    #: lone broken cell reports exactly as it always did.
    torn: dict[tuple[str, str, str], list[str]] = {}
    for ref, value in book.errors.items():
        if value in BROKEN:
            sheet = ref.split("!")[0]
            cell = book.cells.get(ref)
            formula = (cell.formula if cell else None) or ""
            torn.setdefault((sheet, formula, value), []).append(ref)
            continue
        sheet, coordinate = ref.rsplit("!", 1)
        column = "".join(ch for ch in coordinate if ch.isalpha())
        row = int("".join(ch for ch in coordinate if ch.isdigit()) or 0)
        designed.setdefault((sheet, column), []).append((row, row, value))

    for (sheet, formula, value), refs in torn.items():
        if len(refs) == 1:
            result.findings.append(
                Finding(
                    rule="error-value",
                    severity="error",
                    ref=refs[0],
                    sheet=sheet,
                    name="",
                    detail=f"The cell shows {value}.",
                    source="ICAEW P19",
                )
            )
            continue
        span = f"{refs[0]} to {refs[-1].rsplit('!', 1)[-1]}"
        what = (
            "one formula repeated over the block"
            if formula
            else "the same value pasted over the block"
        )
        result.findings.append(
            Finding(
                rule="error-value",
                severity="error",
                ref=refs[0],
                sheet=sheet,
                name="",
                detail=f"One broken formula, {what}, from {span}.",
                formula=formula[:120],
                source="ICAEW P19",
                figure=f"{len(refs):,}",
                figure_unit="cells sharing one broken formula",
            )
        )

    #: The populated extent of each column, across values and errors —
    #: a run is a tail only if nothing live sits beneath it.
    extent: dict[tuple[str, str], int] = {}
    for cell in book.cells.values():
        key = (cell.sheet, get_column_letter(cell.column))
        if cell.row > extent.get(key, 0):
            extent[key] = cell.row
    for ref in book.errors:
        sheet, coordinate = ref.rsplit("!", 1)
        column = "".join(ch for ch in coordinate if ch.isalpha())
        row = int("".join(ch for ch in coordinate if ch.isdigit()) or 0)
        if row > extent.get((sheet, column), 0):
            extent[(sheet, column)] = row

    def live_witness(sheet: str, sisters: list[str], start: int, end: int) -> bool:
        """Whether any sister column holds a live value on these rows."""
        for row in range(start, end + 1):
            for other in sisters:
                if extent.get((sheet, other), 0) < row:
                    continue
                at = f"{sheet}!{other}{row}"
                if at in book.cells and at not in book.errors:
                    return True
        return False

    #: Each error-carrying column's gap rows, for the aloneness test.
    gap_rows: dict[tuple[str, str], set[int]] = {
        key: {row for row, _, _ in cells} for key, cells in designed.items()
    }

    def gap_witness(sheet: str, sisters: list[str], start: int, end: int) -> bool:
        """Whether any sister column gaps on any of these same rows."""
        return any(
            row in gap_rows[(sheet, other)]
            for other in sisters
            for row in range(start, end + 1)
        )

    quiet: dict[str, dict[str, Any]] = {}
    for (sheet, column), cells in designed.items():
        cells.sort()
        runs: list[tuple[int, int, str]] = []
        for row, _, value in cells:
            if runs and row == runs[-1][1] + 1:
                runs[-1] = (runs[-1][0], row, runs[-1][2])
            else:
                runs.append((row, row, value))
        interior = [run for run in runs if run[1] < extent[(sheet, column)]]
        #: The corpus's third shape, found on the first re-run: a daily
        #: gilt-yields column carries thousands of two-cell `#N/A` gaps
        #: at a seven-row rhythm — weekends, with the odd longer run for
        #: a bank holiday. Many short gaps down one column read as the
        #: series' calendar. But the stride is the weak signal — bank
        #: holidays keep no stride — and it fails both ways: it also
        #: folds a genuine break that hides in a gappy column. The
        #: strong signal is **cross-column agreement**, and the mentor's
        #: word « a break in one column » is meant literally: a run is a
        #: break only when the column gaps *alone*. A sister gapping on
        #: the same rows means the source had no data that day for a
        #: whole family of columns — calendar, whatever the stride: the
        #: RIIO-3 daily-gilt sheet carries one quartet and one eleven-
        #: column family on different calendars, and reading either
        #: family's shared gaps against the other's live days invented
        #: 620 breaks on a published file. Sisters all live where this
        #: one gaps — nobody missing with it — is the break, loud even
        #: if it is the only one in the file. The sisters are the
        #: sheet's other error-carrying columns; a column alone has no
        #: witnesses either way and falls back to the stride.
        routine_column = len(interior) >= ROUTINE_GAPS
        sisters = [
            other
            for peer_sheet, other in designed
            if peer_sheet == sheet and other != column
        ]
        #: Aloneness is only evidence when it is exceptional for the
        #: column. The RIIO-3 SONIA sheet holds forecast anchors every
        #: 182 daily rows with `#N/A` between them, beside sisters
        #: interpolated for every day — all of its gaps are « alone »,
        #: which is the column's design, not twenty-two breaks. A
        #: column that routinely gaps where its sisters are live keeps
        #: its own calendar; the break is the *rare* alone run in a
        #: column whose gaps otherwise move with its sisters.
        alone_runs = (
            sum(
                1
                for start, end, _ in interior
                if not gap_witness(sheet, sisters, start, end)
            )
            if sisters
            else 0
        )
        sparse_by_design = alone_runs >= ROUTINE_GAPS
        for start, end, value in runs:
            tail = end >= extent[(sheet, column)]
            alone = False
            if sisters and not tail:
                if gap_witness(sheet, sisters, start, end):
                    calendar = True
                elif sparse_by_design:
                    calendar = True
                elif live_witness(sheet, sisters, start, end):
                    calendar = False
                    alone = True
                else:
                    calendar = routine_column
            else:
                calendar = routine_column
            if tail or calendar:
                #: An error the author wrote on purpose is not an
                #: error finding: `IF(toggle, data, NA())` scaffolding
                #: says « this series is off », and reporting it —
                #: however quietly — tells a competent reader nothing.
                first_cell = book.cells.get(f"{sheet}!{column}{start}")
                if (
                    first_cell is not None
                    and first_cell.formula
                    and NA_LITERAL.search(first_cell.formula)
                ):
                    continue
                fold = quiet.setdefault(
                    sheet,
                    {
                        "cells": 0,
                        "columns": set(),
                        "kinds": set(),
                        "first": "",
                        "gaps": 0,
                        "tails": 0,
                    },
                )
                fold["cells"] += end - start + 1
                fold["columns"].add(column)
                fold["kinds"].add(value)
                fold["tails" if tail else "gaps"] += 1
                if not fold["first"]:
                    fold["first"] = f"{sheet}!{column}{start}"
            else:
                span = (
                    f"{column}{start}"
                    if start == end
                    else f"{column}{start}:{column}{end}"
                )
                #: When the sisters testified, say so — the evidence
                #: that keeps a solo break loud belongs in the sentence.
                witness = (
                    ", while every sister column holds live values there"
                    if alone
                    else ""
                )
                result.findings.append(
                    Finding(
                        rule="error-value",
                        severity="error",
                        ref=f"{sheet}!{column}{start}",
                        sheet=sheet,
                        name="",
                        detail=(f"Values resume at {column}{end + 1}{witness}."),
                        figure_unit=f"{value} breaks a live column",
                        kind="breaks a live column",
                        cells=span,
                        source="ICAEW P19",
                    )
                )

    for sheet, fold in quiet.items():
        kinds = ", ".join(sorted(fold["kinds"]))
        where = []
        if fold["gaps"]:
            where.append(f"in {fold['gaps']:,} routine gaps in its series")
        if fold["tails"]:
            where.append("past its data's edge")
        result.findings.append(
            Finding(
                rule="error-value",
                severity="smell",
                ref=fold["first"],
                sheet=sheet,
                name="",
                detail=f"« {sheet} » carries {kinds} {' and '.join(where)}.",
                source="ICAEW P19",
                figure=f"{fold['cells']:,}",
                figure_unit="cells past the data's edge",
            )
        )


def _external_links(book: Workbook, result: Audit) -> None:
    """One import decision per source workbook, however many cells ride on it.

    Round 4's exam: the NZ Commerce Commission builds a determination
    as a suite of workbooks that read each other, and per-cell
    reporting flooded two files with ~1,500 findings that a human
    reads as « this workbook imports from its six siblings ». The
    event is the *source*: workbook [2] → the import family → every
    cell that reads it as the roster. Excel numbers the sources
    (`[1]`, `[2]`, …) per file, so the number is the identity even
    when the path is not stored in the formula text.

    Severity: a smell, not an error — a link is provenance that
    cannot be checked here, which is an assumption at risk, not
    damage the model displays.
    """
    by_source: dict[str, list[Cell]] = {}
    #: A workbook read from a label formula is still a workbook that
    #: is not here (reader-label-formulas.md).
    for cell in (*book.cells.values(), *book.label_cells.values()):
        if cell.formula and (m := EXTERNAL.search(cell.formula)):
            by_source.setdefault(m.group(0), []).append(cell)
    for source, cells in sorted(by_source.items()):
        cells.sort(key=lambda one: one.ref)
        first = cells[0]
        sheets = sorted({one.sheet for one in cells})
        shown = ", ".join(sheets[:4]) + (", …" if len(sheets) > 4 else "")
        where = (
            f"in {len(cells)} cells across {len(sheets)} sheets ({shown})"
            if len(sheets) > 1
            else f"in {len(cells)} cells of « {sheets[0]} »"
            if len(cells) > 1
            else f"at {first.ref}"
        )
        result.findings.append(
            Finding(
                rule="external-link",
                severity="smell",
                ref=first.ref,
                sheet=first.sheet,
                name=first.name,
                detail=f"It reads another workbook, {source}, {where}.",
                formula=first.formula or "",
                source="ICAEW P19",
                figure=str(len(cells)),
                figure_unit=f"cells reading {source}",
                cells=_roster([one.ref for one in cells]),
            )
        )


def _volatile(book: Workbook, result: Audit) -> None:
    #: Everything any formula reads, once — so a timestamp can know
    #: whether its value flows anywhere.
    read: set[str] = set()
    for cell in (*book.cells.values(), *book.label_cells.values()):
        read.update(cell.precedents or ())
    for cell in (*book.cells.values(), *book.label_cells.values()):
        if not cell.formula:
            continue
        used = {
            token.value.rstrip("(").upper()
            for token in _tokens(cell.formula)
            if token.type == "FUNC"
        } & VOLATILE
        #: A TODAY() nothing reads is a « data valid from » stamp —
        #: documentation, not a value that never sits still. The
        #: structural volatiles (OFFSET, INDIRECT) stay findings even
        #: unread: they are about how the model is built.
        if used and used <= {"NOW", "TODAY"} and cell.ref not in read:
            continue
        if used:
            result.findings.append(
                Finding(
                    rule="volatile",
                    severity="smell",
                    ref=cell.ref,
                    sheet=cell.sheet,
                    name=cell.name,
                    detail=(
                        f"It uses {', '.join(sorted(used))}, which Excel "
                        "works out again on every change."
                    ),
                    figure_unit=f"uses {', '.join(sorted(used))}",
                    source="FAST, SMART",
                )
            )


def _enumeration(formula: str) -> bool:
    """True when a formula is long only because its list is long.

    `=C5+C9+C13+…` forty terms deep, or one SUM over a comma list of
    references: nothing is nested, nothing branches, and splitting it
    would not make it clearer — the length *is* the content. The long
    formula rule is about formulas a reader cannot hold in their head,
    and a plain enumeration is not one.
    """
    depth = 0
    deepest = 0
    for token in _tokens(formula):
        if token.type in ("FUNC", "PAREN"):
            if token.subtype == "OPEN":
                depth += 1
                deepest = max(deepest, depth)
            else:
                depth -= 1
            continue
        if token.type == "SEP" or token.type in ("WHITE-SPACE", "WHITESPACE"):
            continue
        if token.type == "OPERAND":
            if token.subtype == "RANGE":
                continue
            return False
        if token.type.startswith("OPERATOR") and token.value in ("+", "-"):
            continue
        return False
    return deepest <= 1


def _one_long_formula_line(result: Audit) -> None:
    """Every over-long formula in the workbook, as one sentence.

    « The formula at E23 is too long to check by eye » three times,
    with +40, +19 and +19 beside them, was eighty-two formulas flagged
    for being long. Nothing is wrong with any of them, and nobody opens
    a report to be told a formula is long. One line, at the bottom,
    with the roster — the founder's own instruction.
    """
    long = [one for one in result.findings if one.rule == "long-formula"]
    if len(long) <= 1:
        return
    rest = [one for one in result.findings if one.rule != "long-formula"]
    count = sum(len(one.cells.split(", ")) if one.cells else 1 for one in long)
    first = long[0]
    rest.append(
        Finding(
            rule="long-formula",
            severity="smell",
            ref=first.ref,
            sheet=first.sheet,
            name="",
            detail="Hand-checking them is impractical; nothing is known to be wrong.",
            source=first.source,
            figure_unit=f"{count} formulas across {len(long)} places",
            kind="every long formula",
            cells=_roster(sorted(one.ref for one in long)),
        )
    )
    result.findings = rest


def _long_formulas(book: Workbook, result: Audit) -> None:
    for cell in book.cells.values():
        if (
            cell.formula
            and len(cell.formula) > LONG_FORMULA
            and not _enumeration(cell.formula)
        ):
            result.findings.append(
                Finding(
                    rule="long-formula",
                    severity="smell",
                    ref=cell.ref,
                    sheet=cell.sheet,
                    name=cell.name,
                    detail=(f"The formula runs to {len(cell.formula)} characters."),
                    figure_unit=f"{len(cell.formula)} characters long",
                    kind="one long formula",
                    formula=cell.formula,
                    source="FAST 2.02, ICAEW P13",
                )
            )


def _literals(book: Workbook, result: Audit) -> None:
    """Numbers typed inside formulas.

    « No constants in formulas » is in every standard, and read literally
    it flags `=-D6` and `=B5/2`. What it is actually about is an
    *assumption* buried where nobody will find it to change it — a growth
    rate, a tax rate, a margin — so a number that could not be an
    assumption is not a finding.
    """
    #: A number the row's own words state — « 70% Grid / 30% Water »
    #: over a `*0.7`, « must be 1 or 5 » over a `*5` — is documented
    #: where the reader is already looking, which is the entire
    #: complaint the hardcode rule makes. The block header above
    #: counts as the row's words too: a section titled « Asset beta
    #: at 0.075 debt beta » documents every 0.075 beneath it.
    #: Judged per number: the documented ones drop out, any
    #: undocumented ones still report. A header is a row with words
    #: and no numbers of its own — a sibling data row's label
    #: documents only itself. A block runs from its header to the
    #: next header, however many rows that is — a fixed window read a
    #: four-row block as headerless, and a capped walk read one row
    #: of a block differently from its five siblings — so each row's
    #: context is the nearest header run above it, computed in one
    #: top-down pass per sheet: a run of header lines becomes the
    #: standing context, and the next run replaces it, because past
    #: a header is the previous block, whose words prove nothing
    #: about this one.
    occupied = {(cell.sheet, cell.row) for cell in book.cells.values()}
    context_above: dict[str, dict[int, str]] = {}
    for sheet, labels in book.row_words.items():
        data_rows = {row for (name, row) in occupied if name == sheet}
        top = max(data_rows | set(labels), default=0)
        standing, run = "", []
        at_rows: dict[int, str] = {}
        for row in range(1, top + 1):
            if row not in data_rows and labels.get(row):
                at_rows[row] = standing
                run.append(labels[row])
                continue
            if run:
                standing = " ".join(run)
                run = []
            at_rows[row] = standing
        context_above[sheet] = at_rows

    for cell in book.cells.values():
        if not cell.formula:
            continue
        context = context_above.get(cell.sheet, {}).get(cell.row, "")
        buried = tuple(
            value
            for value in _buried(cell.formula)
            if not _documented(value, cell, context)
        )
        if buried:
            #: Shown once each — « 20, 20 » for a bound tested twice
            #: read like a machine. The collapse still keys on the full
            #: tuple: how often a number appears is part of the identity,
            #: not part of the sentence.
            distinct = tuple(dict.fromkeys(buried))
            result.findings.append(
                Finding(
                    rule="hardcode-in-formula",
                    severity="smell",
                    ref=cell.ref,
                    sheet=cell.sheet,
                    name=cell.name,
                    #: The truncated formula used to sit in this
                    #: sentence and reached a person cut off mid-bracket.
                    detail=(
                        f"{', '.join(distinct[:4])} sits inside the formula "
                        "rather than in an input cell."
                    ),
                    formula=cell.formula,
                    source="ICAEW P14, FAST",
                    figure=", ".join(distinct[:2]),
                )
            )


@cache
def _literal_scan(formula: str) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Every number typed in a formula, sorted into what it is doing.

    The first tuple is the buried assumptions — the hardcode rule's
    subject. The second is the *selectors*: numbers a formula compares
    against with `=` or `<>` — `IF(N$5=2025,…)`, `$L130=6` — which are
    not assumptions buried in arithmetic but the formula's own switch
    settings, legitimate to vary and worth watching for drift instead
    (see :func:`_selector_drift`).

    What does not count as an assumption, each learned from a judged
    false positive on the corpus: arguments of the date constructors
    (`DATE(2025,4,1)` is how a date is written); anything inside a
    text function (a REPT count, a MID position); the precision
    argument of the rounding family (`ROUND(x,8)=ROUND(y,8)` is a
    check row's tolerance); the exponent of a power of ten (`10^6` is
    a unit conversion); and a tolerance beside an ABS comparison
    (`ABS(a-b)<0.001` is the model checking itself).

    Round 4's unseen corpus taught six more pieces of the grammar,
    each from judged noise: a lookup's index argument is a selector
    (`VLOOKUP(x,table,15)` picks column fifteen, it does not assume
    fifteen); a round power of ten standing bare in a branch is an
    infinity sentinel (`IF(F4>0,F3/F4,10000000)`); `^0.5` is the
    square root written as a power; a literal in a formula whose
    outputs are sentences is a diagnostic's threshold, not a number
    that moves the model; a literal both compared against and echoed
    bare (`IF(D14<5," ",5)`) is the cell's own index; and a divisor
    equal to the operand count of what it divides is the arithmetic
    mean written out (`(a+b+c+d+e)/5`, `SUM(B8:F8)/5`).
    """
    tokens = [
        token
        for token in _tokens(formula)
        if token.type not in ("WHITE-SPACE", "WHITESPACE")
    ]
    found: list[str] = []
    selectors: list[str] = []
    #: One frame per open call, parenthesis or array constant:
    #: [function name, argument index, top-level plus terms, range
    #: span] — the same walk `references_of` does in the reader. An
    #: array constant's frame is named « { ».
    frames: list[list[Any]] = []
    #: What each CLOSE token's group counted as addends — the mean's
    #: divisor check reads it: `(a+b+c)/3` and `SUM(B8:F8)/5`.
    closed_terms: dict[int, float] = {}
    #: Which function each CLOSE token ended, so a literal can know
    #: what it is being compared against: in `WEEKDAY(A2,2)<6` the
    #: token before the `<` closed WEEKDAY, and the 6 is a day of the
    #: week, not an assumption.
    closed_at: dict[int, str] = {}
    tolerant = "ABS(" in formula.upper()
    #: A formula that speaks sentences is a diagnostic — its numbers
    #: are the message's thresholds, not the model's.
    diagnostic = any(
        token.type == "OPERAND"
        and token.subtype == "TEXT"
        and " " in token.value.strip('"').strip()
        for token in tokens
    )
    #: Every literal that stands next to a comparison anywhere in the
    #: formula — the echo check reads it: a number compared against
    #: and then returned bare is the cell's own label.
    compared: set[str] = set()
    echoed: set[str] = set()
    for index, token in enumerate(tokens):
        if token.type == "OPERAND" and token.subtype == "NUMBER":
            before = tokens[index - 1] if index else None
            behind = tokens[index + 1] if index + 1 < len(tokens) else None
            if any(
                one is not None
                and one.type.startswith("OPERATOR")
                and one.value in ("<", "<=", ">", ">=", "=", "<>")
                for one in (before, behind)
            ):
                compared.add(token.value)
            elif (
                before is None
                or before.type == "SEP"
                or (before.type in ("FUNC", "PAREN") and before.subtype == "OPEN")
            ) and (
                behind is None
                or behind.type == "SEP"
                or (behind.type in ("FUNC", "PAREN") and behind.subtype == "CLOSE")
            ):
                echoed.add(token.value)

    #: A formula that joins text with `&` at its top level *is* a
    #: label — « £m 23/24 prices » built from a year cell — and every
    #: number in it is part of the wording, not of the model.
    depth = 0
    text_builder = False
    for token in tokens:
        if token.type in ("FUNC", "PAREN", "ARRAY"):
            depth += 1 if token.subtype == "OPEN" else -1
        elif token.type.startswith("OPERATOR") and token.value == "&" and depth == 0:
            text_builder = True

    def _operator(token: Any, values: tuple[str, ...]) -> bool:
        return (
            token is not None
            and token.type.startswith("OPERATOR")
            and token.value in values
        )

    for index, token in enumerate(tokens):
        if token.type == "FUNC" and token.subtype == "OPEN":
            frames.append([token.value.rstrip("(").upper(), 0, 0, 0.0])
            continue
        if token.type == "ARRAY" and token.subtype == "OPEN":
            frames.append(["{", 0, 0, 0.0])
            continue
        if token.type == "PAREN" and token.subtype == "OPEN":
            frames.append(["", 0, 0, 0.0])
            continue
        if token.type in ("FUNC", "PAREN", "ARRAY") and token.subtype == "CLOSE":
            if frames:
                name, _, plus, span = frames.pop()
                closed_at[index] = name
                #: What the group would count as addends: a run of
                #: `+` terms, or a SUM/AVERAGE over one plain range.
                closed_terms[index] = span if span else plus + 1 if plus else 0.0
            continue
        if token.type == "SEP" and token.subtype == "ARG" and frames:
            frames[-1][1] += 1
            continue
        if token.type.startswith("OPERATOR") and token.value == "+" and frames:
            frames[-1][2] += 1
            continue
        if token.type == "OPERAND" and token.subtype == "RANGE" and frames:
            span_match = re.fullmatch(
                r"\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)",
                token.value.strip(),
            )
            if span_match:
                c1, r1, c2, r2 = span_match.groups()
                if c1 == c2:
                    frames[-1][3] = abs(int(r2) - int(r1)) + 1
                elif r1 == r2:
                    wide = [0, 0]
                    for at, letters in enumerate((c1, c2)):
                        for ch in letters:
                            wide[at] = wide[at] * 26 + ord(ch) - 64
                    frames[-1][3] = abs(wide[1] - wide[0]) + 1
            continue
        if token.type != "OPERAND" or token.subtype != "NUMBER":
            continue
        try:
            number = float(token.value)
        except ValueError:
            continue
        spelled = token.value
        #: A trailing percent sign is part of the number: `+0.1%` is
        #: one-thousandth, and the innocence test, the selector key and
        #: the label documentation must all see it that way. The
        #: percent spelling also reads better in every sentence.
        if (
            index + 1 < len(tokens)
            and tokens[index + 1].type == "OPERATOR-POSTFIX"
            and tokens[index + 1].value == "%"
        ):
            number /= 100
            spelled = token.value + "%"
        if text_builder:
            continue
        prev = tokens[index - 1] if index else None
        after = tokens[index + 1] if index + 1 < len(tokens) else None
        if _operator(prev, ("=", "<>")) or _operator(after, ("=", "<>")):
            selectors.append(spelled)
            continue
        #: An array constant enumerating the cases a MATCH picks from
        #: — `MATCH(m_identity,{6,7,8},0)` — is a list of case labels,
        #: switch settings like any equality selector. An array
        #: constant anywhere else (SUMPRODUCT weights) stays a number.
        if any(frame[0] == "{" for frame in frames):
            at = max(i for i, frame in enumerate(frames) if frame[0] == "{")
            owner = next(
                ((frame[0], frame[1]) for frame in reversed(frames[:at]) if frame[0]),
                None,
            )
            if owner is not None and owner[0] == "MATCH" and owner[1] == 1:
                selectors.append(spelled)
                continue
        #: Compared against a calendar part: `WEEKDAY(A2,2)<6` asks
        #: « is it a weekday », and the 6 belongs to the calendar.
        if (
            _operator(prev, ("<", "<=", ">", ">=", "=", "<>"))
            and closed_at.get(index - 2) in CALENDAR_PARTS
        ):
            continue
        if any(frame[0] in DATE_FUNCS or frame[0] in TEXT_FUNCS for frame in frames):
            continue
        if frames and frames[-1][0] in ROUND_FUNCS and frames[-1][1] >= 1:
            continue
        #: The exponent of a power of ten, allowing `10^-6`.
        back = index - 1
        if back >= 0 and tokens[back].type == "OPERATOR-PREFIX":
            back -= 1
        if (
            back >= 1
            and _operator(tokens[back], ("^",))
            and tokens[back - 1].type == "OPERAND"
            and tokens[back - 1].subtype == "NUMBER"
            and tokens[back - 1].value in ("10", "10.")
        ):
            continue
        if tolerant and (_operator(prev, ("<", "<=")) or _operator(after, (">", ">="))):
            continue
        #: A lookup's index argument picks a column or a case — it is
        #: a selector, never an assumption. `VLOOKUP(x, table, 15)`
        #: reads column fifteen; conditionals wrapping the argument
        #: (`…IF(mode="US",2,3)…`) pass the position through.
        owner = next(
            (
                (name, arg)
                for name, arg, _, _ in reversed(frames)
                if name and name not in ("{", "IF", "IFS", "IFERROR", "IFNA")
            ),
            None,
        )
        if owner in SELECTOR_ARGS:
            selectors.append(spelled)
            continue
        comparator = _operator(prev, ("<", "<=", ">", ">=", "=", "<>")) or _operator(
            after, ("<", "<=", ">", ">=", "=", "<>")
        )
        bare = (
            prev is None
            or prev.type == "SEP"
            or (prev.type in ("FUNC", "PAREN") and prev.subtype == "OPEN")
            or prev.type == "OPERATOR-PREFIX"
        ) and (
            after is None
            or after.type == "SEP"
            or (after.type in ("FUNC", "PAREN") and after.subtype == "CLOSE")
        )
        #: A round power of ten standing bare in a branch is an
        #: infinity sentinel — `IF(F4>0,F3/F4,10000000)` says « no
        #: interest expense, coverage unbounded », not ten million.
        if bare and abs(number) >= 1e5 and math.log10(abs(number)).is_integer():
            continue
        #: In a formula that speaks sentences, a compared literal is
        #: the diagnostic's threshold — the message's bound, not the
        #: model's number.
        if diagnostic and comparator:
            continue
        #: Compared against somewhere in the formula and echoed bare
        #: elsewhere (or here): the cell's own index — `IF(D14<5," ",5)`
        #: is a year counter labelling itself, and both fives are the
        #: label.
        if token.value in compared and (bare or token.value in echoed):
            continue
        #: `^0.5` is the square root written as a power. `^(0.5)` too.
        if number == 0.5 and (
            _operator(prev, ("^",))
            or (
                prev is not None
                and prev.type == "PAREN"
                and prev.subtype == "OPEN"
                and index >= 2
                and _operator(tokens[index - 2], ("^",))
            )
        ):
            continue
        #: A divisor equal to the operand count of what it divides is
        #: the arithmetic mean written out — `(a+b+c+d+e)/5`,
        #: `SUM(B8:F8)/5`.
        if (
            _operator(prev, ("/",))
            and index >= 2
            and closed_terms.get(index - 2) == number
        ):
            continue
        if number in INNOCENT or (number.is_integer() and abs(number) <= 4):
            continue
        found.append(spelled)
    return tuple(found), tuple(selectors)


#: The argument positions (zero-based) that pick rather than assume:
#: a lookup's column or row index, a CHOOSE or SUBTOTAL case, MATCH's
#: match type. Learned whole from Round 4's unseen corpus, where they
#: were most of the judged noise.
SELECTOR_ARGS = frozenset(
    {
        ("VLOOKUP", 2),
        ("HLOOKUP", 2),
        ("MATCH", 2),
        ("INDEX", 1),
        ("INDEX", 2),
        ("CHOOSE", 0),
        ("SUBTOTAL", 0),
    }
)


def _buried(formula: str) -> tuple[str, ...]:
    """The assumption-shaped numbers typed inside a formula — the
    decision the hardcode rule is about, and therefore the identity the
    collapse groups by."""
    return _literal_scan(formula)[0]


#: The fraction words a financial label actually uses. Whole numbers
#: stay out — « one » and « two » appear in too many labels that are
#: not stating the constant.
NUMBER_WORDS = {
    "half": 0.5,
    "halves": 0.5,
    "quarter": 0.25,
    "quarters": 0.25,
    "third": 1 / 3,
    "thirds": 1 / 3,
}


def _documented(value: str, cell: Cell, context: str = "") -> bool:
    """True when the sheet's own words state the number.

    Checked in the number's own spelling, as a bare integer, as the
    percentage it would print as — `0.7` is documented by a label that
    says « 70% » — and as basis points, because a row named « 10 Bps
    Inc » has said everything about its `+0.1%`. Word-bounded, so a 70
    in « 1970 » proves nothing. `context` carries the block header's
    words: « Asset beta at 0.075 debt beta » two rows above the block
    documents the 0.075 as surely as the row's own label would.
    """
    words = " ".join(
        filter(None, (cell.name, cell.row_label, cell.column_label, context))
    )
    if not words:
        return False
    try:
        number = float(value)
    except ValueError:
        if not value.endswith("%"):
            return False
        try:
            number = float(value[:-1]) / 100
        except ValueError:
            return False
    forms = {value}
    if number.is_integer():
        forms.add(f"{int(number)}")
    forms.add(f"{number * 100:g}%")
    if any(
        re.search(rf"(?<![\w.]){re.escape(form)}(?![\w.])", words) for form in forms
    ):
        return True
    #: English states numbers in words as surely as in digits: a row
    #: named « Half year discount factor » has said everything about
    #: its `^0.5`.
    if any(
        abs(number - spoken) < 1e-9 and re.search(rf"\b{word}\b", words, re.IGNORECASE)
        for word, spoken in NUMBER_WORDS.items()
    ):
        return True
    bps = f"{number * 10000:g}"
    return bool(
        re.search(
            rf"(?<![\w.]){re.escape(bps)}\s*(?:bps|bp|basis\s+points?)\b",
            words,
            re.IGNORECASE,
        )
    )


def _rows(book: Workbook, result: Audit) -> None:
    """The canonical spreadsheet error: one cell in a row unlike the rest.

    A row of a model is one calculation repeated across time. A cell that
    breaks the pattern is either a deliberate exception nobody wrote down
    or a formula somebody typed over, and in a model there is no third
    thing it can be.

    Three exceptions, every one of them learned from a false positive on
    a real model rather than reasoned to in advance.

    **A row must be a series before it can break a pattern.** An inputs
    sheet has a row where B is a lookup and C is a cross-sheet reference,
    and they are supposed to differ; a summary table has a row of
    references to unrelated places. Only a *contiguous run* of calculated
    cells is a series, and only inside one is departure meaningful. This
    single condition removed most of the noise, and it is why published
    detectors that skip it report precision near twenty per cent.

    **The ends of a series are allowed to differ.** The first forecast
    period reaches back to the last actual and the last often stops
    compounding, so both ends legitimately do something the middle does
    not. Only an interior cell is flagged.

    **A row's typed history is constants on purpose**, so the boundary
    between the typed past and the calculated future is found per sheet
    and nothing to its left is a hardcode.
    """
    rows: dict[tuple[str, int], list[Cell]] = {}
    for cell in book.cells.values():
        rows.setdefault((cell.sheet, cell.row), []).append(cell)

    boundaries = _boundaries(rows)

    for (sheet, row), cells in rows.items():
        cells.sort(key=lambda c: c.column)
        boundary = boundaries.get(sheet)

        for run in _runs(cells):
            if len(run) < MIN_SERIES:
                continue
            calculated = [cell for cell in run if cell.formula]
            if len(calculated) < len(run) - len(calculated) + 1:
                # More typed than calculated: a block of inputs, not a
                # series that something was typed into.
                continue
            shapes = Counter(_shape(cell) for cell in calculated)
            usual, count = shapes.most_common(1)[0]
            majority = count >= len(calculated) - count + 1

            # A constant among formulas is a finding whether or not the
            # formulas agree with each other, so this runs before and
            # independently of the pattern check. Getting that wrong meant
            # a value typed over a formula in a *consistent* row — the
            # commonest way a model breaks — was never reported at all.
            for index, cell in enumerate(run[1:-1], start=1):
                if cell.formula is not None:
                    continue
                if boundary is not None and cell.column < boundary:
                    continue
                # A *lone* constant between two calculated cells. Somebody
                # pasting a value over a formula does it to one cell; a
                # block of adjacent constants is a region of typed data,
                # and `risk.xls` has fifty-nine rows of market prices
                # followed by the statistics computed from them. Requiring
                # a formula on both sides took that model from 99 findings
                # to none, and cost the fixture nothing.
                if run[index - 1].formula is None or run[index + 1].formula is None:
                    continue
                #: And there must be a series to be typed over: at
                #: least one flanking formula's shape must repeat in
                #: the run. A metadata row — `=price_label` on one
                #: side, a cross-sheet pick on the other, a typed 0
                #: for a spare line between — has no two cells alike,
                #: and is not a calculation interrupted. But the H7
                #: debt model's typed first-year rates sit between the
                #: row's own AVERAGE column and a live series, and the
                #: series flank testifies: the gate caught this rule's
                #: first draft (neighbours must agree with each other)
                #: silently deleting those two judged findings.
                flanks = (_shape(run[index - 1]), _shape(run[index + 1]))
                if all(shapes.get(flank, 0) < 2 for flank in flanks):
                    continue
                # And lone down the column too. A value pasted over a
                # formula is surrounded by formulas on all four sides; a
                # constant with another constant directly above or below
                # it belongs to a column of typed parameters, which is
                # what `CollarsAnalysisv3-1.XLS` has three of.
                if _stacked(book, cell):
                    continue
                #: The seed exemption the column pass has always had,
                #: needed here since the reader learned to see array
                #: formulas: the founder's counter seeds (`1` over
                #: `=Z23+1`) sit beside a TRANSPOSE block that used to
                #: read as typed values, and the moment it read as the
                #: formulas it is, the seeds became « lone constants
                #: between formulas » to this pass too.
                #: Narrower than the island pass's use of `_seed`: the
                #: formula below must not merely *read* the typed cell —
                #: `=F11/F6` under a paste does that — it must continue
                #: a vertical series from it, which is what a counter
                #: does and a paste never has under it.
                below = book.get(
                    f"{sheet}!{get_column_letter(cell.column)}{cell.row + 1}"
                )
                if (
                    below is not None
                    and _seed([cell], below)
                    and _column_series(book, below)
                ):
                    continue
                result.findings.append(
                    Finding(
                        rule="typed-over-formula",
                        severity="error",
                        ref=cell.ref,
                        sheet=sheet,
                        name=cell.name,
                        detail=(
                            "The cell holds a typed "
                            f"{shown_number(float(cell.value or 0))} where the "
                            "rest of the series calculates."
                        ),
                        against=_example(calculated, usual),
                        source="ICAEW P14, FAST",
                    )
                )

            if not majority or len(shapes) < 2:
                continue
            if count < len(calculated) - 1:
                # More than one cell departs from the pattern. Somebody
                # overwriting a formula does it to one cell; two or more
                # means the row changes meaning partway across — three
                # sums and then two ratios — and every cell in it is doing
                # what it was meant to.
                continue
            if not _over_time(run):
                # The columns name different quantities, so the cells under
                # them are supposed to differ. Only a row that repeats one
                # calculation across periods can break a pattern.
                continue

            for cell in calculated:
                if _shape(cell) == usual or cell.alias_of is not None:
                    continue
                if _same_calculation(cell, _twin(calculated, usual)):
                    # Same calculation, anchored differently:
                    # `Assumptions!B3` where the series says
                    # `Assumptions!$B$3`. It computes the right answer
                    # where it sits and breaks the moment it is copied,
                    # which is a defect that has not happened yet rather
                    # than one that has. Checked across the whole run,
                    # including its ends, because the first cell of a
                    # series is exactly where the missing `$` gets typed.
                    result.findings.append(
                        Finding(
                            rule="inconsistent-anchoring",
                            severity="smell",
                            ref=cell.ref,
                            sheet=sheet,
                            name=cell.name,
                            detail=(
                                "This cell locks its references "
                                "differently from the rest of the row."
                            ),
                            formula=cell.formula or "",
                            against=_example(calculated, usual),
                            source="FAST, ICAEW P12",
                        )
                    )
                elif (
                    cell is not run[0]
                    and cell is not run[-1]
                    #: A cell that continues a consistent *vertical*
                    #: series — a counter or cumulative helper column
                    #: crossing this row — belongs to the column's
                    #: structure, and the row has no claim on it. The
                    #: founder's file: `=Z23+1` flagged against a row
                    #: whose real series runs sideways.
                    and not _column_series(book, cell)
                    #: A bare SUM across its own row is the row's total
                    #: column — `Y64=SUM(AA64:BJ64)` beside the series it
                    #: adds up. It departs from the pattern because it is
                    #: *about* the pattern, and calling the total an
                    #: inconsistency annoyed every judge who saw it.
                    and not _row_total(cell)
                ):
                    result.findings.append(
                        Finding(
                            rule="inconsistent-row",
                            severity="error",
                            ref=cell.ref,
                            sheet=sheet,
                            name=cell.name,
                            detail=(
                                "This cell is built differently from the "
                                "rest of the series, so its number does not "
                                "follow the same rule as its neighbours."
                            ),
                            formula=cell.formula or "",
                            against=_example(calculated, usual),
                            source="FAST, ICAEW P12",
                        )
                    )


def _shape_list(cell: Cell) -> list[str]:
    """The cell's shape as a token list, for position-level comparison.

    Reference tokens carry an `@` mark. Without it a reference is
    recognised by « starts with R », which `ROUND(` also satisfies and
    `'Control Panel'!R51CC` does not — the sheet-qualified miss let a
    rate pinned to the wrong column pass unexamined in a judged model.
    """
    if cell.formula is None:
        return []
    out = []
    for token in _tokens(cell.formula):
        if token.type == "OPERAND" and token.subtype == "RANGE":
            out.append("@" + _offset(token.value, cell.row, cell.column))
        elif token.type == "OPERAND" and token.subtype == "NUMBER":
            out.append("#")
        elif token.type == "OPERAND" and token.subtype == "TEXT":
            out.append('"..."')
        elif token.type in ("WHITE-SPACE", "WHITESPACE"):
            continue
        else:
            out.append(token.value)
    return out


ARITHMETIC = ("+", "-", "*", "/")


def _mutations(book: Workbook, result: Audit) -> None:
    """One changed token inside an otherwise identical family.

    Round 4's planted mutations went unseen where the row pass's
    evidence gates never opened: an operator flipped in a short row,
    a reference shifted one row in a three-cell run. But a run whose
    members are token-for-token identical except one cell, where that
    cell differs in exactly one position, is not « a different
    formula » — it is the same calculation structure with one token
    changed, and a single changed token against a uniform family is
    the strongest witness a static reader gets. `=A1-B1` beside two
    `=A1+B1` siblings is a flipped sign; `=SUM(B11:B21)` beside
    `=SUM(B10:B20)` twins is a displaced window.

    Rows only: a row shares one label, so its cells are one family by
    the sheet's own words. Column runs cross differently-labelled line
    items, where a uniform shape is usually a chain and the deviant is
    a section seed — the unseen corpus judged every column deviation a
    structure, not a mutation. Three more exemptions from the same
    judging: the run's first cell displacing a reference is the row's
    seed (it reads the anchor the chain hangs from); a deviant whose
    shape repeats in its own column belongs to the crossing vertical
    family (a column total crossing a row of row totals); and both
    exemptions apply only to displaced references — a flipped operator
    is suspect wherever it sits.
    """
    #: One shape per cell, computed once — this pass walks every
    #: formula twice (column census, then runs), and the big BPFM
    #: files hold two hundred thousand of them.
    shaped: dict[str, tuple[str, ...]] = {
        cell.ref: tuple(_shape_list(cell))
        for cell in book.cells.values()
        if cell.formula
    }
    by_column_shape: dict[tuple[str, int], Counter[tuple[str, ...]]] = {}
    for cell in book.cells.values():
        if cell.formula:
            by_column_shape.setdefault((cell.sheet, cell.column), Counter())[
                shaped[cell.ref]
            ] += 1

    lines: dict[tuple[str, str, int], list[Cell]] = {}
    for cell in book.cells.values():
        if not cell.formula:
            continue
        lines.setdefault(("row", cell.sheet, cell.row), []).append(cell)

    already = {
        finding.ref
        for finding in result.findings
        if finding.rule in ("inconsistent-row", "inconsistent-anchoring")
    }
    caught: list[tuple[Cell, str, str]] = []

    for (axis, _, _), cells in sorted(lines.items()):
        cells.sort(key=lambda one: one.column if axis == "row" else one.row)
        #: Contiguous runs only — a gap is a block boundary.
        runs: list[list[Cell]] = [[cells[0]]]
        for one in cells[1:]:
            step = (
                one.column - runs[-1][-1].column
                if axis == "row"
                else one.row - runs[-1][-1].row
            )
            if step == 1:
                runs[-1].append(one)
            else:
                runs.append([one])
        for run in runs:
            if len(run) < 3:
                continue
            shapes = [shaped[one.ref] for one in run]
            counts = Counter(shapes)
            usual, votes = counts.most_common(1)[0]
            if votes != len(run) - 1 or not usual:
                continue
            deviant = run[shapes.index(next(s for s in shapes if s != usual))]
            if deviant.ref in already:
                continue
            theirs = shaped[deviant.ref]
            if len(theirs) != len(usual):
                continue
            changed = [at for at in range(len(usual)) if usual[at] != theirs[at]]
            if len(changed) != 1:
                continue
            at = changed[0]
            was, now = usual[at], theirs[at]
            n = len(run) - 1
            displaced = was.startswith("@") and now.startswith("@")
            if displaced:
                #: A run's edges are where designs live: the first cell
                #: reads the anchor its chain hangs from, the last cell
                #: reads the totals column (Thames' output rows walk
                #: five year-columns and end on the source's total —
                #: twelve judged parallels of one layout). An edge
                #: deviation stands only on strong evidence, and both
                #: kinds came from judged models. Both variants pinned
                #: (`$C$51` against `$D$51`) is a family disagreeing
                #: about the one cell it reads — a fill preserves
                #: pinned references, so no seed story explains it: a
                #: rate row dragged with the wrong anchor hid there.
                #: And a family whose walking reference lands on empty
                #: cells reads nothing — a pinned seed beside it is the
                #: one cell doing the row's job (the inventory-days
                #: drag). A family walking into live cells beside a
                #: pinned edge cell is a design, and stays quiet.
                if deviant is run[0] or deviant is run[-1]:
                    both_pinned = "[" not in was and "[" not in now
                    #: Fourth keep, from the gate itself: a family of
                    #: own-column windows whose edge cell reads its own
                    #: column through a displaced window (`SUM(R34:R38)`
                    #: closing fifteen `SUM(…78:…82)` siblings — judged
                    #: A in Round 5) is the family's own grammar broken,
                    #: not an edge design. Own-line means every column
                    #: offset is zero and no other sheet is involved.
                    own_line = _own_line(was) and _own_line(now)
                    if own_line and _window_grew(was, now, deviant, run, book):
                        continue
                    if not both_pinned and not own_line:
                        family = [one for one in run if one is not deviant]
                        walked = [
                            _token_target(usual[at], one)
                            for one in family
                            if "[" in usual[at]
                        ]
                        live = sum(
                            1
                            for target in walked
                            if target is None or target in book.cells
                        )
                        into_nothing = walked and live * 2 <= len(walked)
                        same_cell = "[" not in was and _token_target(
                            now, deviant
                        ) == _token_target(was, deviant)
                        if not into_nothing and not same_cell:
                            continue
                #: A shape that repeats down the deviant's own column
                #: is the crossing family — a column total crossing a
                #: row of row totals is two designs meeting, not a
                #: mutation.
                if (
                    by_column_shape.get((deviant.sheet, deviant.column), Counter())[
                        theirs
                    ]
                    >= 2
                ):
                    continue
            #: **The claim in words, the formulas in their own fields.**
            #: This is where « … the same formula as its 19 siblings with
            #: one pinned reference out of step — they read 'Control
            #: Panel'!$C$51, it reads $D$51: =(E45+E48)/2*… » was
            #: written. Two banned words, two cell refs and a formula in
            #: one clause. The row's own count goes in the sentence, and
            #: the formulas go where a screen can show them as formulas.
            if was in ARITHMETIC and now in ARITHMETIC:
                drift = "one operator changed"
                what = (
                    f"The other {n} cells in the row use {was} here. "
                    f"This one uses {now}, so its answer moves the wrong way."
                )
            elif displaced:
                drift = "one reference out of step"
                read_by_row = _token_target(was, deviant) or _unshaped(was)
                read_here = _token_target(now, deviant) or _unshaped(now)
                what = (
                    f"The other {n} cells in the row read {read_by_row}. "
                    f"This one reads {read_here}, so it is worked out on a "
                    "different input from the rest of its row."
                )
            else:
                continue
            already.add(deviant.ref)
            caught.append((deviant, what, drift))

    #: One column breaking many rows' families is one authoring event —
    #: H7's C_Tax reads pinned input rows in its first forecast column
    #: while every filled year reads three rows higher, twenty-four
    #: times in block rhythm. Twenty-four findings would bury the one
    #: decision; the fold says it once, with the roster.
    grouped: dict[tuple[str, int], list[tuple[Cell, str, str]]] = {}
    for deviant, what, drift in caught:
        grouped.setdefault((deviant.sheet, deviant.column), []).append(
            (deviant, what, drift)
        )
    for (sheet, _), members in sorted(grouped.items()):
        if len(members) >= 3:
            first, lead, _ = members[0]
            column = get_column_letter(first.column)
            roster = ", ".join(one.ref.rsplit("!", 1)[-1] for one, _, _ in members)
            result.findings.append(
                Finding(
                    rule="inconsistent-row",
                    severity="error",
                    ref=first.ref,
                    sheet=sheet,
                    name=first.name,
                    detail=(
                        f"Every row here reads one place and its column "
                        f"{column} cell another, so that column is worked "
                        "out on different inputs from every other. "
                        f"{lead}"
                    ),
                    figure_unit=(f"{len(members)} rows broken in column {column}"),
                    kind="rows broken in one column",
                    formula=first.formula or "",
                    source="EuSpRIG, ICAEW P11",
                    cells=roster[:400],
                )
            )
        else:
            for deviant, what, drift in members:
                result.findings.append(
                    Finding(
                        rule="inconsistent-row",
                        severity="error",
                        ref=deviant.ref,
                        sheet=deviant.sheet,
                        name=deviant.name,
                        detail=what,
                        kind=drift,
                        formula=deviant.formula or "",
                        source="EuSpRIG, ICAEW P11",
                    )
                )


def _regularity_weighted(book: Workbook, result: Audit) -> None:
    """The regularity check's weight term: a row or anchoring break
    inside a large tidy block outranks the same break beside a
    ragged run. Runs after `_elevated`, adds at most
    `REGULARITY_BUMP`, and says so in the basis."""
    by_ref = {
        island.ref: island for island in _islands(book, _shape) if island.region_area
    }
    replaced: list[Finding] = []
    for finding in result.findings:
        island = by_ref.get(finding.ref)
        if island is None or finding.rule not in (
            "inconsistent-row",
            "inconsistent-anchoring",
        ):
            replaced.append(finding)
            continue
        bump = bump_for(island)
        replaced.append(
            replace_finding(
                finding,
                weight=round(min(1.0, finding.weight + bump), 2),
                basis=(
                    f"{finding.basis}; breaks a block of {island.region_area} "
                    "cells of one shape"
                    if finding.basis
                    else f"breaks a block of {island.region_area} cells of one shape"
                ),
            )
        )
    result.findings = replaced


def _selector_drift(book: Workbook, result: Audit) -> None:
    """A filled row whose switch setting drifted.

    `IF(N$5=2025,…)` filled across a row keeps its shape when the 2025
    becomes 2022 in one cell — shapes erase numbers — so the row check
    reads the drifted cell as identical to its sisters. The literal is
    the whole point there: a fill that tests one year in fourteen
    columns and a different year in one is either a stale copy or an
    exception nobody wrote down, and the judged sample carried exactly
    this (a 2022 among 2025s in a live RIIO-3 model). Selectors come
    from :func:`_literal_scan`; the shape must repeat at least three
    times beside exactly one dissenter. No period-label test guards
    this pass — the corpus case that taught it sits under « RIIO-GD2 /
    RIIO-GD3 » band headers that name no period, and the structure
    itself (one dissenter against three or more identically shaped
    sisters, exactly two settings in play) is the signature; a row
    whose columns legitimately differ shows many settings, not two.
    """
    groups: dict[tuple[str, int, str], list[tuple[Cell, tuple[str, ...]]]] = {}
    for cell in book.cells.values():
        if not cell.formula:
            continue
        _, selectors = _literal_scan(cell.formula)
        if not selectors:
            continue
        key = (cell.sheet, cell.row, _shape(cell))
        groups.setdefault(key, []).append((cell, selectors))

    for (sheet, _, _), members in groups.items():
        if len(members) < MIN_SERIES + 1:
            continue
        variants: dict[tuple[str, ...], list[Cell]] = {}
        for cell, selectors in members:
            variants.setdefault(selectors, []).append(cell)
        if len(variants) != 2:
            continue
        (few_key, few), (many_key, many) = sorted(
            variants.items(), key=lambda pair: len(pair[1])
        )
        if len(few) != 1 or len(many) < MIN_SERIES:
            continue
        odd = few[0]
        result.findings.append(
            Finding(
                rule="inconsistent-row",
                severity="error",
                ref=odd.ref,
                sheet=sheet,
                name=odd.name,
                detail=(
                    f"The other {len(many)} cells in the row test "
                    f"{', '.join(many_key)}. This one tests "
                    f"{', '.join(few_key)}, so it switches on a different "
                    "case from the rest."
                ),
                kind="a different switch setting",
                formula=odd.formula or "",
                source="FAST, ICAEW P12",
            )
        )


def _column_series(book: Workbook, cell: Cell) -> bool:
    """True when the cell's formula continues a consistent vertical run.

    Measured, not guessed: at least two of the four column neighbours
    within two rows carry the same relative formula shape. A dragged
    horizontal error does not qualify — its vertical neighbours belong
    to their own rows' series and share nothing with it.
    """
    mine = _shape(cell)
    if not mine:
        return False
    matching = 0
    for step in (-2, -1, 1, 2):
        neighbour = book.get(
            f"{cell.sheet}!{get_column_letter(cell.column)}{cell.row + step}"
        )
        if neighbour is not None and neighbour.formula and _shape(neighbour) == mine:
            matching += 1
    return matching >= 2


def _row_total(cell: Cell) -> bool:
    """True when a cell is a bare SUM over cells of its own row."""
    if not cell.formula or not BARE_SUM.match(cell.formula):
        return False
    ranges = [
        REFERENCE.fullmatch(token.value.strip())
        for token in _tokens(cell.formula)
        if token.type == "OPERAND" and token.subtype == "RANGE"
    ]
    if not ranges or any(match is None for match in ranges):
        return False
    return all(
        match is not None
        and match.group("sheet") is None
        and int(match.group("row")) == cell.row
        and int(match.group("row2") or match.group("row")) == cell.row
        for match in ranges
    )


def _over_time(run: list[Cell]) -> bool:
    """True when this run's columns are periods rather than quantities.

    A header that is absent proves nothing either way, so a sheet with no
    header row is still checked — most models that lay a series out
    without labelling it still lay it out as a series.
    """
    labelled = [cell.column_label for cell in run if cell.column_label]
    if not labelled:
        return True
    periods = sum(1 for label in labelled if PERIOD.match(label))
    return periods >= len(labelled) - 1


def _runs(cells: list[Cell]) -> list[list[Cell]]:
    """Maximal runs of side-by-side cells.

    A gap in a row is a gap in the thought: `B` and `C` next to each other
    are one calculation over two periods, and `B` and `G` with four empty
    columns between them are two different things that happen to share a
    row.
    """
    runs: list[list[Cell]] = []
    for cell in cells:
        # A gap of one column is a spacer, not a change of subject. Real
        # sheets put a blank column between quarters and between a block
        # and its total, and requiring strict adjacency turned every such
        # row into a set of runs too short to be a series at all.
        if runs and cell.column - runs[-1][-1].column <= GAP + 1:
            runs[-1].append(cell)
        else:
            runs.append([cell])
    return runs


#: How tall a stack of typed cells can be and still read as one
#: paste-over rather than a column of parameters. Both ends measured on
#: real files: Ofwat's own queries document confirms a four-cell block
#: hard-keyed into the FM02 financial model (InpS!N1885-1888 — every row
#: a formula series, one year typed), and `CollarsAnalysisv3-1.XLS`
#: carries typed parameter columns fifty-nine cells tall that are data,
#: not damage. The line sits between four and fifty-nine with room on
#: the paste side, because a hand pastes a handful and a column runs the
#: length of its table.
TYPED_BLOCK = 8


def _stacked(book: Workbook, cell: Cell) -> bool:
    """True when a constant belongs to a column of typed values.

    A first version vetoed on *any* constant directly above or below —
    which also vetoed a block of values pasted over four adjacent rows
    of formulas, the exact defect Ofwat's queries document confirms in
    two published FM02 models, so the audit scored 0 of 4 on the one
    ground truth it had. Now the whole contiguous vertical run of
    constants is measured: a short stack is a paste, a long one is a
    parameter column.
    """
    tall = 1
    for step in (-1, 1):
        row = cell.row + step
        while tall <= TYPED_BLOCK:
            neighbour = book.get(f"{cell.sheet}!{get_column_letter(cell.column)}{row}")
            if neighbour is None or neighbour.formula is not None:
                break
            tall += 1
            row += step
    return tall > TYPED_BLOCK


def _seed(island: list[Cell], below: "Cell | None") -> bool:
    """True when a typed cell is a running column's starting value.

    The founder's file: a depreciation schedule with a year-counter
    helper column — `1` typed at each block's top, `=Z23+1` continuing
    beneath it. The audit called each `1` a value typed over a
    calculation; every one was the seed a counter cannot start without.
    The test is exact, not a guess about intent: the formula directly
    below *reads the typed cell itself*, so the typed cell is that
    formula's declared input. One cell only — a taller island is a
    paste, whatever sits under it.
    """
    if len(island) != 1 or below is None or below.formula is None:
        return False
    cell = island[0]
    at = re.compile(rf"\$?{get_column_letter(cell.column)}\$?{cell.row}(?![0-9])")
    return bool(at.search(below.formula))


def _typed_islands(book: Workbook, result: Audit) -> None:
    """Values pasted over a *block* of formulas, seen down the columns.

    The row pass catches one cell typed into a formula row. Yorkshire's
    FM02 — one of the two models Ofwat's queries document confirms
    hard-keyed — defeats it: five year-columns typed across four
    adjacent rows, so no row keeps a formula majority. The columns still
    show it plainly: each is a repeating calculation interrupted by a
    short island of constants, with the same formula resuming below.

    Two things keep this from flagging what is data on purpose. An
    input column with a total under it: the island only counts when the
    column's own formulas *repeat* (the same shape at least twice) and
    the cell at the island's edge carries that repeating shape — a
    `SUM` under typed inputs appears once, and repeats nothing. And a
    model's typed history: every island row must hold a formula to the
    *left* of the typed cell, because a paste over a forecast sits
    after the row's calculations begin, and history is the reverse —
    constants first, formulas after. (The sheet-wide history boundary
    is deliberately not used here: on Yorkshire's own InpS sheet it
    votes for column 19, which would skip the confirmed paste in
    column N.)
    """
    columns: dict[tuple[str, int], list[Cell]] = {}
    leftmost: dict[tuple[str, int], int] = {}
    for cell in book.cells.values():
        columns.setdefault((cell.sheet, cell.column), []).append(cell)
        if cell.formula:
            at = (cell.sheet, cell.row)
            if cell.column < leftmost.get(at, 1 << 20):
                leftmost[at] = cell.column

    already = {f.ref for f in result.findings if f.rule == "typed-over-formula"}

    for (sheet, column), cells in columns.items():
        cells.sort(key=lambda c: c.row)

        run: list[Cell] = []
        for cell in cells:
            # Strictly adjacent rows: a blank row is a section break, and
            # stitching across one would let two unrelated blocks lend
            # each other formulas.
            if run and cell.row - run[-1].row == 1:
                run.append(cell)
                continue
            _island_findings(sheet, run, leftmost, already, result)
            run = [cell]
        _island_findings(sheet, run, leftmost, already, result)


def _substantive(cell: Cell) -> bool:
    """False for the values that carry no override: 0 is a template's
    spare cell and ±1 is a base value or a switch. The edge pass has
    tested this since candidate 2's round 2; the column-orientation
    round carries it into the interior waiver on sixteen cells of
    evidence."""
    try:
        value = float(cell.value) if cell.value is not None else None
    except (TypeError, ValueError):
        return False
    return value is not None and value != 0 and abs(value) != 1


def _island_findings(
    sheet: str,
    run: list[Cell],
    leftmost: dict[tuple[str, int], int],
    already: set[str],
    result: Audit,
) -> None:
    """The typed islands of one vertical run, reported."""
    if len(run) < MIN_SERIES:
        return
    calculated = [cell for cell in run if cell.formula]
    shapes = Counter(_shape(cell) for cell in calculated)
    if not shapes:
        return
    usual, count = shapes.most_common(1)[0]
    if count < 2:
        return

    index = 0
    while index < len(run):
        if run[index].formula is not None:
            index += 1
            continue
        end = index
        while end < len(run) and run[end].formula is None:
            end += 1
        island = run[index:end]
        # Maximal by construction, so any neighbour inside the run is a
        # formula; it must carry a shape the column *repeats* — any
        # repeating family, not the single crowned majority, which the
        # A7 round showed can flip on a tie and lose the finding to
        # insertion order.
        edges = [run[at] for at in (index - 1, end) if 0 <= at < len(run)]
        witness = next(
            (shape for edge in edges if shapes.get(shape := _shape(edge), 0) >= 2),
            None,
        )
        if (
            len(island) <= TYPED_BLOCK
            and len(island) < len(run)
            and witness is not None
            #: A column whose repeating formula is one bare defined name
            #: — `=price_label` down a mnemonic column — is the sheet's
            #: text scaffolding, and a value typed between its rows is
            #: a heading, not a paste over a calculation.
            and not _mnemonic(witness)
            #: The left-formula history test, waived for *interior*
            #: islands by the column-orientation round
            #: (docs/pierce/a3-column-typed.md): a typed cell with the
            #: run's formulas above and below it is vertically
            #: sandwiched by the calculation it interrupts, which is
            #: not how typed history is laid out in any orientation —
            #: the sandwich is the anti-history evidence. The run's
            #: edges keep the guard: column-major models genuinely put
            #: typed history at the top of a column, and waiving it
            #: there is the flood the guard exists to prevent.
            #: The waiver carries candidate 2's identity guard inward
            #: with it (round 3): a typed 0 or ±1 admitted *only* by
            #: the waiver is template scaffolding or a base value —
            #: sixteen of the round's twenty-six new findings were
            #: zero rows inside formula bands, the « template of
            #: zeros » the mining round rejected by name. Islands that
            #: pass the left-formula test on their own are untouched,
            #: so this can only narrow what the waiver added.
            and (
                (
                    index > 0
                    and end < len(run)
                    and all(_substantive(cell) for cell in island)
                )
                or all(
                    leftmost.get((sheet, cell.row), 1 << 20) < cell.column
                    for cell in island
                )
            )
            and not _seed(island, run[end] if end < len(run) else None)
        ):
            for cell in island:
                if cell.ref in already:
                    continue
                result.findings.append(
                    Finding(
                        rule="typed-over-formula",
                        severity="error",
                        ref=cell.ref,
                        sheet=sheet,
                        name=cell.name,
                        detail=(
                            "The cell holds a typed "
                            f"{shown_number(float(cell.value or 0))} where the "
                            "rest of the column calculates."
                        ),
                        against=_example(calculated, witness),
                        source="ICAEW P14, FAST",
                    )
                )
        index = end


#: One bare name and nothing else — what a defined-name mnemonic column
#: reduces to after :func:`_shape` (which leaves names it cannot offset
#: verbatim). A cell reference never fits: shapes render those in
#: R/C form, which the second test excludes.
MNEMONIC = re.compile(r"[A-Za-z_\\][A-Za-z0-9_.\\]*")


def _typed_edges(book: Workbook, result: Audit) -> None:
    """A series that runs out in a typed number.

    The interior typed-over pass demands a formula on both sides, so
    a constant at a run's head or tail — the A3 mining round's
    family-edge class, the typed last period over a computed row — is
    invisible to it by construction. Here the witness is one-sided: a
    lone constant (or the evidence class's own pair) at the edge of a
    stretch of at least three same-shape formulas, with nothing
    beyond it.

    The guards, registered in docs/pierce/a3-family-edge.md before
    any measurement: head-side cells are flagged only on a sheet with
    a detected historical/forecast boundary and only at or right of
    it — typed actuals lead rows from the left, and flagging the
    typed-meets-computed boundary is the mining round's own rejected
    class; the run must read as over-time; a typed 0 is template
    scaffolding; the stacked and counter-seed exemptions apply as in
    the interior pass; and a cell the interior or island pass already
    reported keeps that finding. Runs after the island pass for
    exactly that dedup.
    """
    already = {
        finding.ref
        for finding in result.findings
        if finding.rule in ("typed-over-formula", "typed-over-edge")
    }
    rows: dict[tuple[str, int], list[Cell]] = {}
    for cell in book.cells.values():
        rows.setdefault((cell.sheet, cell.row), []).append(cell)
    boundaries = _boundaries(rows)

    def disqualified(sheet: str, cell: Cell, stretch: list[Cell]) -> bool:
        if cell.ref in already:
            return True
        try:
            #: Round 2's identity guard: 0 is template scaffolding and
            #: ±1 is how an index row spells its base period — ten of
            #: ten corpus findings in round 1 were typed 1s heading
            #: cumulative-index series, verified at the cells.
            if (
                cell.value is None
                or float(cell.value) == 0
                or abs(float(cell.value)) == 1
            ):
                return True
        except (TypeError, ValueError):
            return True
        #: Round 2's horizontal seed guard: a series whose adjacent
        #: formula *reads* the typed cell is continuing from its own
        #: starting value, whatever the number — the vertical
        #: counter-seed exemption, turned 90° (the deflator chain
        #: `=AU466/(1+AU530)` walking right from its typed base).
        if cell.ref in stretch[0].precedents:
            return True
        if _stacked(book, cell):
            return True
        below = book.get(f"{sheet}!{get_column_letter(cell.column)}{cell.row + 1}")
        return (
            below is not None and _seed([cell], below) and _column_series(book, below)
        )

    for (sheet, row), cells in sorted(rows.items()):
        cells.sort(key=lambda c: c.column)
        boundary = boundaries.get(sheet)
        for run in _runs(cells):
            if len(run) < MIN_SERIES + 1 or not _over_time(run):
                continue
            for side in ("head", "tail"):
                ordered = run if side == "head" else run[::-1]
                typed: list[Cell] = []
                for cell in ordered:
                    if cell.formula is not None:
                        break
                    typed.append(cell)
                #: One or two typed cells are an edge; three or more
                #: are a region of data meeting a calculation.
                if not 1 <= len(typed) <= 2:
                    continue
                stretch = ordered[len(typed) : len(typed) + 3]
                if len(stretch) < 3 or any(c.formula is None for c in stretch):
                    continue
                shapes = {_shape(c) for c in stretch}
                if len(shapes) != 1:
                    continue
                if side == "head" and (
                    boundary is None or any(c.column < boundary for c in typed)
                ):
                    continue
                if any(disqualified(sheet, cell, list(stretch)) for cell in typed):
                    continue
                usual = next(iter(shapes))
                where = "start" if side == "head" else "end"
                pair = sorted(typed, key=lambda c: c.column)
                values = " and ".join(
                    shown_number(float(one.value or 0)) for one in pair
                )
                result.findings.append(
                    Finding(
                        rule="typed-over-edge",
                        severity="error",
                        ref=typed[0].ref,
                        sheet=sheet,
                        name=typed[0].name,
                        detail=(
                            f"The series holds a typed {values} at its "
                            f"{where} where the rest of it calculates."
                        ),
                        against=_example(stretch, usual),
                        source="ICAEW P14, FAST",
                        cells=_roster([one.ref.rsplit("!", 1)[-1] for one in pair])
                        if len(pair) > 1
                        else "",
                    )
                )
                already.update(one.ref for one in typed)


def _typed_beats(book: Workbook, result: Audit) -> None:
    """A value typed into a series that computes on a stride.

    Financial models lay one calculation out every second or third
    column — value/% pairs, split-year layouts — and the row pass's
    runs bridge one spacer column and no more, so a stride-3 family
    is invisible to it and a stride-2 family over data columns is
    too. Here the lattice is the run: the columns of one residue
    class, each holding a cell, judged by the interior typed-over
    discipline transposed whole — calculated majority, a formula on
    both stride-neighbours, a flanking shape that repeats, the
    over-time test.

    Guards, registered in docs/pierce/a3-beat-families.md before any
    measurement: the lattice must be real (no formula of a flanking
    shape in the columns between the stride-neighbours — a dense run
    wearing a stride belongs to the plain row pass); nothing left of
    a detected historical/forecast boundary; a typed 0 or ±1 is
    scaffolding or a base value; the stacked and counter-seed
    exemptions apply as in the interior pass; and a cell any
    typed-over rule already reported keeps that finding — this pass
    runs after all three.
    """
    already = {
        finding.ref
        for finding in result.findings
        if finding.rule in ("typed-over-formula", "typed-over-edge", "typed-over-beat")
    }
    rows: dict[tuple[str, int], dict[int, Cell]] = {}
    for cell in book.cells.values():
        rows.setdefault((cell.sheet, cell.row), {})[cell.column] = cell
    listed = {
        key: sorted(cells.values(), key=lambda one: one.column)
        for key, cells in rows.items()
    }
    boundaries = _boundaries(listed)

    for (sheet, row), by_column in sorted(rows.items()):
        columns = sorted(by_column)
        boundary = boundaries.get(sheet)
        for stride in (2, 3):
            taken: set[int] = set()
            for start in columns:
                if start in taken:
                    continue
                chain = [start]
                while chain[-1] + stride in by_column:
                    chain.append(chain[-1] + stride)
                taken.update(chain)
                if len(chain) < MIN_SERIES + 1:
                    continue
                run = [by_column[c] for c in chain]
                calculated = [one for one in run if one.formula]
                if len(calculated) < len(run) - len(calculated) + 1:
                    continue
                if not _over_time(run):
                    continue
                shapes = Counter(_shape(one) for one in calculated)
                for index in range(1, len(run) - 1):
                    cell = run[index]
                    if cell.formula is not None or cell.ref in already:
                        continue
                    if boundary is not None and cell.column < boundary:
                        continue
                    left, right = run[index - 1], run[index + 1]
                    if left.formula is None or right.formula is None:
                        continue
                    flanks = (_shape(left), _shape(right))
                    if all(shapes.get(flank, 0) < 2 for flank in flanks):
                        continue
                    between = [
                        by_column.get(at)
                        for at in range(left.column + 1, right.column)
                        if at != cell.column
                    ]
                    if any(
                        one is not None and one.formula and _shape(one) in flanks
                        for one in between
                    ):
                        continue
                    try:
                        value = float(cell.value) if cell.value is not None else None
                    except (TypeError, ValueError):
                        value = None
                    if value is None or value == 0 or abs(value) == 1:
                        continue
                    if _stacked(book, cell):
                        continue
                    below = book.get(
                        f"{sheet}!{get_column_letter(cell.column)}{cell.row + 1}"
                    )
                    if (
                        below is not None
                        and _seed([cell], below)
                        and _column_series(book, below)
                    ):
                        continue
                    usual = flanks[0] if shapes.get(flanks[0], 0) >= 2 else flanks[1]
                    result.findings.append(
                        Finding(
                            rule="typed-over-beat",
                            severity="error",
                            ref=cell.ref,
                            sheet=sheet,
                            name=cell.name,
                            #: The worked example stays evidence; the
                            #: sentence a person reads is built in
                            #: `plain_words` off `figure` and the stride.
                            detail=(
                                "The rest of the row calculates on this "
                                "beat; this cell holds a typed number."
                            ),
                            formula=cell.formula or "",
                            against=_example(calculated, usual),
                            figure=shown_number(value),
                            figure_unit=f"typed into a beat of {stride} columns",
                            kind="typed into a beat",
                            source="ICAEW P14, FAST",
                        )
                    )
                    already.add(cell.ref)


def _mnemonic(usual: str) -> bool:
    """True when a column's usual shape is a single defined name."""
    return bool(MNEMONIC.fullmatch(usual)) and re.match(r"R(\d|\[)", usual) is None


def _boundaries(rows: dict[tuple[str, int], list[Cell]]) -> dict[str, int]:
    """Where each sheet stops being typed history and starts calculating.

    A model's actuals are constants and its forecast is formulas, and the
    column where that flips is the same for every row on the sheet. Found
    by agreement rather than by reading « FY2025A » — plenty of models
    label their columns differently and none of them lay this out
    differently.
    """
    votes: dict[str, Counter[int]] = {}
    for (sheet, _), cells in rows.items():
        cells = sorted(cells, key=lambda c: c.column)
        if len(cells) < 3:
            continue
        pattern = [cell.formula is not None for cell in cells]
        if pattern[0] or not pattern[-1]:
            continue
        if pattern != sorted(pattern):
            # Constants after formulas, or alternating: not a clean
            # history-then-forecast row, so it votes for nothing.
            continue
        first = next(index for index, has in enumerate(pattern) if has)
        votes.setdefault(sheet, Counter())[cells[first].column] += 1

    found = {}
    for sheet, counted in votes.items():
        column, agreed = counted.most_common(1)[0]
        if agreed >= BOUNDARY_ROWS:
            found[sheet] = column
    return found


def _shape(cell: Cell, anchoring: bool = True) -> str:
    """A formula with its references made relative and its numbers erased.

    `=D6*(1+E5)` in column E and `=E6*(1+F5)` in column F are the same
    calculation, and the point of the check is to notice when one of them
    is not. Numbers become `#` so that a buried assumption is reported once,
    by the rule that is about buried assumptions, rather than twice.

    On top of that, the A7 normalizations (registered in
    `docs/pierce/a7-normalization-protocol.md`): all-plus and
    all-times chains and symmetric-function arguments sort, constant
    shapes fold (`#*#` is `#`), the Lotus-era unary plus is erased,
    and the structural re-render carries no whitespace — so
    `=+C26+C31`, `=C31+C26` and `= C26 + C31` are one authoring
    decision with one shape. A formula the mini-parser cannot parse
    falls back to the plain token join, never to an error.

    Cached by (formula, row, column, anchoring) — the four inputs that
    fully determine the shape — because the A1 profile showed 1.7
    million calls per big-model audit for a few hundred thousand
    distinct cells. Cleared with the token cache at the end of each
    audit, for memory alone.
    """
    if cell.formula is None:
        return ""
    return _shape_of(cell.formula, cell.row, cell.column, anchoring)


@cache
def _shape_of(formula: str, row: int, column: int, anchoring: bool) -> str:
    out = []
    try:
        tokens = _tokens(formula)
    except Exception:
        return ""
    pieces: list[tuple[str, str]] = []
    for token in tokens:
        if token.type == "OPERAND" and token.subtype == "RANGE":
            text = _offset(token.value, row, column, anchoring)
            out.append(text)
            pieces.append(("atom", text))
        elif token.type == "OPERAND" and token.subtype == "NUMBER":
            out.append("#")
            pieces.append(("atom", "#"))
        elif token.type == "OPERAND" and token.subtype == "TEXT":
            out.append('"..."')
            pieces.append(("atom", '"..."'))
        else:
            out.append(token.value)
            if token.type == "OPERAND":
                pieces.append(("atom", token.value))
            elif token.type == "FUNC" and token.subtype == "OPEN":
                pieces.append(("func", token.value))
            elif token.type == "PAREN" and token.subtype == "OPEN":
                pieces.append(("open", token.value))
            elif token.subtype == "CLOSE":
                pieces.append(("close", token.value))
            elif token.type == "SEP" and token.subtype == "ARG":
                pieces.append(("sep", token.value))
            elif token.type == "OPERATOR-PREFIX":
                pieces.append(("pre", token.value))
            elif token.type == "OPERATOR-INFIX":
                pieces.append(("op", token.value))
            elif token.type == "OPERATOR-POSTFIX":
                pieces.append(("post", token.value))
            elif token.type == "WHITE-SPACE":
                continue
            else:
                pieces.append(("other", token.value))
    normalized = _normal_form(tuple(pieces))
    return normalized if normalized is not None else "".join(out)


#: Functions whose arguments carry no order — the only calls whose
#: argument lists the shape may sort.
_SYMMETRIC = frozenset({"SUM", "MIN", "MAX", "AVERAGE", "COUNT", "COUNTA", "PRODUCT"})


@cache
def _normal_form(pieces: tuple[tuple[str, str], ...]) -> str | None:
    """The shape re-rendered from a structural parse, or None.

    A tiny recursive-descent pass over the normalized tokens: sorts
    all-plus and all-times chains and symmetric-function arguments,
    folds constant shapes, drops unary plus. Anything the grammar
    does not expect — array literals, stray tokens — returns None and
    the caller keeps the plain join.

    Cached by the pieces themselves — the function's entire input, so
    equality is by construction. The pieces are already relative
    (`_offset` ran), which is what gives the cache its reuse: every
    row of a filled block renders the same pieces, where the formula
    *text* differs cell by cell. Cleared with the other parse caches.
    """
    position = 0

    def peek() -> tuple[str, str] | None:
        return pieces[position] if position < len(pieces) else None

    def take() -> tuple[str, str]:
        nonlocal position
        piece = pieces[position]
        position += 1
        return piece

    def compare() -> str:
        parts = [chain()]
        joins = []
        while (
            (p := peek())
            and p[0] == "op"
            and p[1] in {"=", "<", ">", "<=", ">=", "<>", "&"}
        ):
            joins.append(take()[1])
            parts.append(chain())
        return _interleave(parts, joins)

    def chain() -> str:
        parts = [term()]
        joins = []
        while (p := peek()) and p[0] == "op" and p[1] in {"+", "-"}:
            joins.append(take()[1])
            parts.append(term())
        if joins and all(j == "+" for j in joins):
            return "+".join(_folded(parts))
        return _interleave(parts, joins)

    def term() -> str:
        parts = [unary()]
        joins = []
        while (p := peek()) and p[0] == "op" and p[1] in {"*", "/"}:
            joins.append(take()[1])
            parts.append(unary())
        if joins and all(j == "*" for j in joins):
            return "*".join(_folded(parts))
        return _interleave(parts, joins)

    def unary() -> str:
        signs = ""
        while (p := peek()) and p[0] == "pre":
            sign = take()[1]
            if sign == "-":
                signs += "-"
            elif sign != "+":
                raise ValueError(sign)
        rendered = power()
        while (p := peek()) and p[0] == "post":
            rendered += take()[1]
        return signs + rendered

    def power() -> str:
        rendered = primary()
        while (p := peek()) and p[0] == "op" and p[1] == "^":
            take()
            rendered += "^" + primary()
        return rendered

    def primary() -> str:
        p = peek()
        if p is None:
            raise ValueError("end")
        kind, text = take()
        if kind == "atom":
            return text
        if kind == "open":
            inner = compare()
            if not (peek() and take() == ("close", ")")):
                raise ValueError("paren")
            return inner if inner == "#" else f"({inner})"
        if kind == "func":
            arguments = []
            if (q := peek()) and q[0] == "close":
                take()
                return f"{text})"
            arguments.append(compare())
            while (q := peek()) and q[0] == "sep":
                if take()[1] != ",":
                    raise ValueError("sep")
                arguments.append(compare())
            if not (peek() and take()[0] == "close"):
                raise ValueError("call")
            name = text[:-1].upper()
            if name in _SYMMETRIC:
                arguments = sorted(arguments)
            return f"{text}{','.join(arguments)})"
        raise ValueError(kind)

    try:
        rendered = compare()
    except (ValueError, IndexError):
        return None
    if position != len(pieces):
        return None
    return rendered


def _interleave(parts: list[str], joins: list[str]) -> str:
    rendered = parts[0]
    for join, part in zip(joins, parts[1:]):
        rendered += join + part
    return rendered


def _folded(parts: list[str]) -> list[str]:
    """Sorted chain operands with the constant shapes folded into one `#`."""
    kept = sorted(p for p in parts if p != "#")
    return (["#"] if len(kept) < len(parts) else []) + kept


#: `_offset`'s grammar, compiled once. It used to be handed to
#: `re.fullmatch` as a string on every call, and this function is the
#: hottest in the engine: **6,979,159 calls on one regulator model**,
#: 39.5 s of its own time inside an audit of 518 s. A pattern string
#: costs a cache lookup per call before any matching begins.
OFFSET_PIECE = re.compile(
    r"(?:(?P<sheet>'[^']+'|[A-Za-z0-9_.]+)!)?"
    r"(?P<ca>\$?)(?P<column>[A-Z]{1,3})(?P<ra>\$?)(?P<row>\d+)"
)

#: Column letters to their 1-based index, built once. The inner loop
#: computed this arithmetically per call, per piece, for every one of
#: those seven million calls; there are only 18,278 possible three-letter
#: columns and Excel stops at XFD, so the answer is worth remembering.
_COLUMN_INDEX: dict[str, int] = {}


def _column_number(letters: str) -> int:
    number = _COLUMN_INDEX.get(letters)
    if number is None:
        number = 0
        for letter in letters:
            number = number * 26 + (ord(letter) - 64)
        _COLUMN_INDEX[letters] = number
    return number


def _offset(reference: str, row: int, column: int, anchoring: bool = True) -> str:
    """`E6` seen from `F7` is `R[-1]C[-1]`; `$B$19` stays `$B$19`."""
    parts = []
    for piece in reference.split(":"):
        match = OFFSET_PIECE.fullmatch(piece.strip())
        if match is None:
            return reference
        # One unpack rather than six separate `.group()` calls: each is a
        # Python-level call, and at seven million invocations the count
        # is the cost.
        name, column_anchor, letters, row_anchor, digits = match.group(
            "sheet", "ca", "column", "ra", "row"
        )
        sheet = f"{name}!" if name else ""
        text_column = (
            f"C{letters}"
            if column_anchor and anchoring
            else f"C[{_column_number(letters) - column:+d}]"
        )
        text_row = (
            f"R{digits}" if row_anchor and anchoring else f"R[{int(digits) - row:+d}]"
        )
        parts.append(f"{sheet}{text_row}{text_column}")
    return ":".join(parts)


def _unshaped(token: str) -> str:
    """A shape token back in the reader's words, for finding text.

    `@'Control Panel'!R51CC` reads as `'Control Panel'!$C$51`; a
    relative piece keeps its offset form, which is honest — the family
    shares the offset, not any one address.
    """
    text = token.lstrip("@")

    def piece(m: re.Match[str]) -> str:
        row, column = m.group(1), m.group(2)
        out_column = f"${column}" if not column.startswith("[") else f"C{column}"
        out_row = f"${row}" if not row.startswith("[") else f"R{row}"
        if "[" in row or "[" in column:
            return f"{out_column}{out_row}" if "[" not in column else f"R{row}C{column}"
        return f"{out_column}{out_row}"

    return re.sub(r"R(\[[+-]?\d+\]|\d+)C(\[[+-]?\d+\]|[A-Z]{1,3})", piece, text)


def _own_line(token: str) -> bool:
    """True when a shape token reads its cell's own column — every
    column offset zero, no other sheet — the perpendicular work a
    totals row does. A displaced window there breaks the family's own
    grammar; a reference elsewhere at a run's edge is usually design."""
    text = token.lstrip("@")
    if "!" in text:
        return False
    piece = r"R(?:\[[+-]?\d+\]|\d+)C\[\+?0\]"
    return bool(re.fullmatch(f"{piece}(?::{piece})?", text))


def _window_grew(
    was: str, now: str, deviant: Cell, run: list[Cell], book: Workbook
) -> bool:
    """An edge window sized to the data only it has.

    The first column's extra line item — an acquisition that exists in
    year one alone — widens its own-column window by exactly that row;
    the siblings' windows skip a row that is empty for them (judged on
    a depreciation model's closing-RAB row). The mirror also holds: an
    edge window narrowed past rows that are empty in its own column.
    Either way the data explains the deviation, so it is design. A
    window displaced onto a different section entirely never passes
    here — its rows are not a superset or subset of the family's.
    """

    def rows_of(token: str) -> set[int] | None:
        pieces = token.lstrip("@").split(":")
        if len(pieces) != 2:
            return None
        ends = []
        for piece in pieces:
            target = _token_target("@" + piece, deviant)
            digits = re.search(r"(\d+)$", target) if target else None
            if digits is None:
                return None
            ends.append(int(digits.group(1)))
        return set(range(min(ends), max(ends) + 1))

    family_rows, deviant_rows = rows_of(was), rows_of(now)
    if family_rows is None or deviant_rows is None:
        return False
    family = [one for one in run if one is not deviant]

    def present(cell: Cell, rows: set[int]) -> list[bool]:
        return [
            f"{cell.sheet}!{get_column_letter(cell.column)}{row}" in book.cells
            for row in rows
        ]

    if deviant_rows > family_rows:
        extra = deviant_rows - family_rows
        return all(present(deviant, extra)) and not any(
            flag for one in family for flag in present(one, extra)
        )
    if family_rows > deviant_rows:
        dropped = family_rows - deviant_rows
        return not any(present(deviant, dropped)) and all(
            flag for one in family for flag in present(one, dropped)
        )
    return False


def _token_target(token: str, cell: Cell) -> str | None:
    """The actual cell a shape token reads, resolved from `cell`.

    None for ranges and anything past the simple grammar — callers
    treat None as « cannot show it is empty », which errs quiet.
    """
    text = token.lstrip("@")
    if ":" in text:
        return None
    sheet = cell.sheet
    if "!" in text:
        sheet, text = text.rsplit("!", 1)
        sheet = sheet.strip("'")
    m = re.fullmatch(r"R(\[[+-]?\d+\]|\d+)C(\[[+-]?\d+\]|[A-Z]{1,3})", text)
    if m is None:
        return None
    row_part, column_part = m.group(1), m.group(2)
    row = (
        cell.row + int(row_part.strip("[]"))
        if row_part.startswith("[")
        else int(row_part)
    )
    if column_part.startswith("["):
        column = cell.column + int(column_part.strip("[]"))
    else:
        column = 0
        for letter in column_part:
            column = column * 26 + ord(letter) - 64
    if row < 1 or column < 1:
        return None
    return f"{sheet}!{get_column_letter(column)}{row}"


def _twin(calculated: list[Cell], usual: str) -> Cell | None:
    for cell in calculated:
        if _shape(cell) == usual:
            return cell
    return None


def _same_calculation(cell: Cell, twin: Cell | None) -> bool:
    """True when two cells do the same thing and only their `$` differ.

    Anchoring cannot be compared by making everything relative. `$B$3` on
    a sheet of assumptions is the *same cell* from every column, and its
    relative offset is therefore different from each one — so relativising
    makes two identical references look unlike. It cannot be compared by
    resolving everything to absolute addresses either, because the
    references that are *supposed* to move do move.

    What is true of an anchoring-only difference is that every reference
    matches its twin on one of the two: either it sits at the same offset
    from its own cell, or it points at the same absolute address. Checked
    per reference, in lockstep, with every other token required to match
    exactly.
    """
    if twin is None or cell.formula is None or twin.formula is None:
        return False
    mine = list(_tokens(cell.formula))
    theirs = list(_tokens(twin.formula))
    if len(mine) != len(theirs):
        return False

    anchoring_differs = False
    for one, two in zip(mine, theirs, strict=True):
        if one.type != two.type or one.subtype != two.subtype:
            return False
        if one.type == "OPERAND" and one.subtype == "RANGE":
            relative = _offset(one.value, cell.row, cell.column) == _offset(
                two.value, twin.row, twin.column
            )
            absolute = _absolute(one.value, cell) == _absolute(two.value, twin)
            if not (relative or absolute):
                return False
            if one.value.count("$") != two.value.count("$"):
                anchoring_differs = True
        elif one.value != two.value:
            return False
    return anchoring_differs


def _absolute(reference: str, cell: Cell) -> str:
    """The address a reference resolves to, from where it sits."""
    sheet = cell.sheet
    if "!" in reference:
        sheet, reference = reference.rsplit("!", 1)
    return f"{sheet.strip(chr(39))}!{reference.replace('$', '')}"


def _example(formulas: list[Cell], usual: str) -> str:
    for cell in formulas:
        if _shape(cell) == usual and cell.formula:
            return cell.formula
    return usual


def _circularity(book: Workbook, result: Audit) -> None:
    """Cells that depend on themselves, when the model has not said so.

    Circularity is normal in a valuation model — interest on average debt,
    a fee on the amount raised to pay it — and every one of the four
    Damodaran models tested carries it deliberately. A model says so by
    switching on iterative calculation, which is recorded in the file, so
    that is the exception rather than a list of blessed patterns.
    """
    if book.iterative:
        return

    #: The unit is the loop, not the cell. The Heathrow H7 model put
    #: 22,519 cells into circular chains — reported per cell, that was
    #: 22,519 findings about what the graph resolves into a handful of
    #: strongly connected components. And a loop dragged across the
    #: time axis — the same small cycle once per period — folds further
    #: by its formula shapes: one decision, one finding.
    components = _loops(book)
    folded: dict[tuple[str, ...], dict[str, Any]] = {}
    for component in components:
        component.sort()
        first = component[0]
        shapes = sorted(
            {
                _shape(cell)
                for ref in component
                if (cell := book.get(ref)) is not None and cell.formula
            }
        )
        sheets = sorted({ref.rsplit("!", 1)[0] for ref in component})
        key = (*sheets, *shapes)
        fold = folded.setdefault(
            key, {"loops": 0, "cells": 0, "first": first, "sample": component}
        )
        fold["loops"] += 1
        fold["cells"] += len(component)
        if first < fold["first"]:
            fold["first"] = first
            fold["sample"] = component

    for fold in folded.values():
        sample = fold["sample"]
        path = " → ".join(sample[:5]) + (" → …" if len(sample) > 5 else "")
        first = fold["first"]
        if fold["loops"] == 1:
            detail = f"a loop of {fold['cells']:,} cells: {path}"
        else:
            detail = (
                f"the same loop repeated {fold['loops']:,} times — "
                f"{fold['cells']:,} cells in all — for example {path}"
            )
        result.findings.append(
            Finding(
                rule="circular",
                severity="error",
                ref=first,
                sheet=first.split("!")[0],
                name=(cell.name if (cell := book.get(first)) else ""),
                detail=detail,
                source="ICAEW P16, FAST",
                figure=f"{fold['cells']:,}",
                figure_unit=(
                    "cells in one loop"
                    if fold["loops"] == 1
                    else f"cells across {fold['loops']:,} identical loops"
                ),
            )
        )


def _true_self_loop(book: Workbook, ref: str) -> bool:
    """Whether a cell genuinely reads its own value.

    `=CELL("filename", $A$1)` written in A1 — the classic
    show-the-sheet-name header, on fifty sheets of the Heathrow H7
    model — anchors *metadata* at a location. Excel does not treat
    CELL's reference argument as a dependency, and a hundred false
    one-cell loops taught this audit not to either: the self-reference
    only counts if it survives outside every CELL(...) call.

    The real fix now lives where the mentor said it belonged — in the
    edge builder's per-function policy table (`references_of`), so the
    false edge is never built. This check stays as the second line: if
    a regression ever rebuilds such an edge, the loop still does not
    reach a person.
    """
    cell = book.get(ref)
    if cell is None or not cell.formula:
        return False
    outside = re.sub(r"CELL\s*\([^()]*\)", "", cell.formula, flags=re.IGNORECASE)
    coordinate = ref.rsplit("!", 1)[-1]
    column = "".join(ch for ch in coordinate if ch.isalpha())
    row = "".join(ch for ch in coordinate if ch.isdigit())
    return bool(re.search(rf"\$?{column}\$?{row}(?![0-9])", outside))


def _loops(book: Workbook) -> list[list[str]]:
    """Strongly connected components with a real cycle in them.

    Tarjan, iteratively — a half-million-cell model would blow the
    recursion limit — over the in-book precedent edges. A component of
    one cell counts only when the cell reads itself.
    """
    #: Edges the cycle hunter walks. A precedent read only through a
    #: lookup table (INDEX's first argument) is excluded here and only
    #: here: Excel resolves the pick before hunting circular
    #: references, and two shipped regulator models carry chains that
    #: close solely through such tables while calculating cleanly.
    edges: dict[str, tuple[str, ...]] = {
        ref: tuple(
            one
            for one in (cell.precedents or ())
            if one in book.cells and one not in (cell.lookup_reads or ())
        )
        for ref, cell in book.cells.items()
    }
    order: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    trail: list[str] = []
    counter = 0
    found: list[list[str]] = []

    for root in edges:
        if root in order:
            continue
        work: list[tuple[str, int]] = [(root, 0)]
        while work:
            node, child_at = work[-1]
            if child_at == 0:
                order[node] = low[node] = counter
                counter += 1
                trail.append(node)
                on_stack.add(node)
            descended = False
            children = edges[node]
            for index in range(child_at, len(children)):
                child = children[index]
                if child not in order:
                    work[-1] = (node, index + 1)
                    work.append((child, 0))
                    descended = True
                    break
                if child in on_stack:
                    low[node] = min(low[node], order[child])
            if descended:
                continue
            if low[node] == order[node]:
                component: list[str] = []
                while True:
                    leaf = trail.pop()
                    on_stack.discard(leaf)
                    component.append(leaf)
                    if leaf == node:
                        break
                if len(component) > 1 or (
                    node in edges[node] and _true_self_loop(book, node)
                ):
                    found.append(component)
            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
    return found


#: A formula that *is* a sum — the only shape that claims to be a total.
#: A SUM buried inside an IF or a MIN is a component of logic: the
#: founder's cashflow picks the repayment out of two loan rows fourteen
#: rows away with `=IF(SUM(D29:D30)<0,…)`, and reading that as a broken
#: total invented an 8.5bn miss that never existed.
BARE_SUM = re.compile(r"^=?\s*SUM\([^()]*\)\s*$", re.IGNORECASE)

#: A row label that names a running balance rather than a flow. A total
#: routinely and correctly skips « Outstanding Principal (End of Year) »
#: sitting between its components — a balance does not belong in a
#: service total, and counting it as « left out » overstated a real
#: 12.5m miss as 512.5m.
BALANCE_LABEL = re.compile(
    r"outstanding|balance|brought forward|carried forward|\bb/f\b|\bc/f\b"
    r"|opening|closing|beginning|end of (?:year|period)|cumulative",
    re.IGNORECASE,
)


def _sum_spans(cell: Cell) -> tuple[dict[str, set[int]], set[str]]:
    """The same-sheet rows a bare SUM reads, per column — and which
    columns it reads through a real range rather than a lone cell."""
    spans: dict[str, set[int]] = {}
    multi: set[str] = set()
    for token in _tokens(cell.formula or ""):
        if token.type != "OPERAND" or token.subtype != "RANGE":
            continue
        match = REFERENCE.fullmatch(token.value.strip())
        if match is None:
            continue
        sheet = (match.group("sheet") or cell.sheet).strip("'")
        if sheet != cell.sheet:
            continue
        column = match.group("column")
        if match.group("row2") is not None:
            if match.group("column2") != column:
                continue
            multi.add(column)
        first = int(match.group("row"))
        last = int(match.group("row2") or first)
        spans.setdefault(column, set()).update(
            range(min(first, last), max(first, last) + 1)
        )
    return spans, multi


def _skipped_cells(book: Workbook, result: Audit) -> None:
    """A total that leaves a row out.

    `=SUM(D20:D23)` under a block that runs to row 24 is the error every
    published catalogue of spreadsheet disasters opens with, and it is
    invisible: the total looks like a total. Checked by walking up from the
    summed range and asking whether the cell immediately above it holds a
    number that the range does not reach.

    Exemptions, each learned from a real false alarm — the first four
    from live models, the last three from the usefulness audit's judged
    sample: only a formula that *is* a sum is judged as a total; a
    skipped row already counted through an included subtotal is not
    skipped — « Total Revenue = Net Sales + Other Income » rightly
    excludes the two detail rows inside Other Income, and adding them
    again would double count; a running balance between the components
    is stepped over by every correct total ever written; a row that
    itself *reads the summed range* is a sibling view of the same
    inputs, not a forgotten one — hand-verified on the sum that
    survived eleven versions of Ofgem's ED2 model; a row that is
    itself a bare aggregate of this column is another view of rows
    the total already has — EBITDA above a decomposition excludes
    D&A by definition, it does not forget it; a row some *other*
    bare SUM's range in the block covers is a detail row inside a
    partition, and reaching around its subtotal would double count;
    and the walk up from the range stops at a section break — more
    than one blank row, the same spacer rule the row runs use —
    because a total's claim ends with its own block, and Ofgem's RoRE
    chart tables re-slice a data block from twenty-six rows below it.

    The SUM's same-column areas are judged *together*:
    `SUM(AA223:AA232,AA220:AA221,AA222)` is one total over one column
    in three pieces, and judging each piece alone accused the formula
    of leaving out rows its other pieces include — a bug the
    usefulness audit itself caught, because the sampled finding's
    sentence contradicted the formula it quoted.
    """
    totals: list[tuple[Cell, dict[str, set[int]], set[str]]] = []
    #: Every bare SUM's own-column range coverage, for the partition
    #: exemption: (sheet, column) → [(sum's row, rows its ranges read)].
    partitions: dict[tuple[str, str], list[tuple[int, set[int]]]] = {}
    for cell in book.cells.values():
        if not cell.formula or not BARE_SUM.match(cell.formula):
            continue
        spans, multi = _sum_spans(cell)
        totals.append((cell, spans, multi))
        for column in multi:
            partitions.setdefault((cell.sheet, column), []).append(
                (cell.row, spans[column])
            )

    for cell, spans, multi in totals:
        #: A column contributes a total only through a real range; a
        #: lone extra cell tacked onto a SUM claims nothing about the
        #: rows above it.
        for column in sorted(multi):
            rows_summed = spans[column]
            top, bottom = min(rows_summed), max(rows_summed)
            if not (top <= cell.row and bottom < cell.row):
                continue
            #: Rows the included cells already count: an included row
            #: whose own formula reads a same-column range or cell is a
            #: subtotal, and everything it reads is covered.
            covered: set[int] = set()
            for row in sorted(rows_summed):
                inside = book.cells.get(f"{cell.sheet}!{column}{row}")
                if inside is None or not inside.formula:
                    continue
                for part in _tokens(inside.formula):
                    if part.type != "OPERAND" or part.subtype != "RANGE":
                        continue
                    span = REFERENCE.fullmatch(part.value.strip())
                    if span is None:
                        continue
                    span_sheet = (span.group("sheet") or cell.sheet).strip("'")
                    if span_sheet != cell.sheet or span.group("column") != column:
                        continue
                    first = int(span.group("row"))
                    last = int(span.group("row2") or first)
                    covered.update(range(min(first, last), max(first, last) + 1))
            summed = {f"{cell.sheet}!{column}{row}" for row in rows_summed}
            missed: list[Cell] = []
            blanks = 0
            for row in range(bottom + 1, cell.row):
                above = book.cells.get(f"{cell.sheet}!{column}{row}")
                if above is None:
                    blanks += 1
                    if blanks > GAP:
                        #: A section break: the block this total is
                        #: about has ended, and whatever sits beyond
                        #: it belongs to other tables.
                        break
                    continue
                blanks = 0
                if row in covered:
                    continue
                if above.row_label and BALANCE_LABEL.search(above.row_label):
                    continue
                #: The sibling exemption: a row that reads the summed
                #: range holds another view of the same inputs, and a
                #: total is right to step over it.
                if summed & set(above.precedents):
                    continue
                #: A row that is itself a bare aggregate of this
                #: column summarises rows the total already reads —
                #: excluded by definition, not forgotten.
                if (
                    above.formula
                    and BARE_SUM.match(above.formula)
                    and column in _sum_spans(above)[0]
                ):
                    continue
                #: A row covered by another bare SUM's range in this
                #: block is a detail row inside a partition: the
                #: total adds the subtotals, and reaching around them
                #: to the detail would double count. A partition lists
                #: its members side by side, so the covering sibling
                #: may sit just *below* the total too — the TIM sheet
                #: stacks its three cap-rate totals on adjacent rows,
                #: each picking its own slice — but no further than
                #: the spacer allowance, because a grand total twenty
                #: rows down excuses nothing.
                if any(
                    top <= at <= cell.row + 3 and at != cell.row and row in reads
                    for at, reads in partitions.get((cell.sheet, column), ())
                ):
                    continue
                missed.append(above)
            #: A total whose own words state its window — « Total MAR,
            #: 5 years of DPP4 » summing exactly five year-rows — has
            #: declared what it excludes. The count must match the
            #: range and be tied to a period word; a bare number in a
            #: label proves nothing. Round 4, NZCC.
            if missed and re.search(
                rf"\b{len(rows_summed)}\s*(?:year|month|quarter|week|day)s?\b",
                f"{cell.name} {cell.row_label}",
                re.IGNORECASE,
            ):
                continue
            if missed:
                #: What the misses are worth, straight from the cells —
                #: the number the founder's design leads the card with.
                worth = sum(float(one.value or 0) for one in missed)
                #: A total sitting one row below its label — E42 under
                #: « Total Senior Debt Service » at row 41, with E41
                #: empty — has no label of its own. The label above is
                #: its name, and the misalignment is part of the story:
                #: every other column keeps the total on the label's row.
                name = cell.name
                misaligned = False
                if not cell.row_label.strip():
                    above = book.cells.get(f"{cell.sheet}!{column}{cell.row - 1}")
                    above_label = book.row_words.get(cell.sheet, {}).get(
                        cell.row - 1, ""
                    )
                    if above_label and (above is None or above.value is None):
                        name = above_label
                        misaligned = True
                result.findings.append(
                    Finding(
                        rule="skipped-cell",
                        severity="error",
                        ref=cell.ref,
                        sheet=cell.sheet,
                        name=name,
                        #: `findings-voice.md` rule 1's own worked
                        #: example for the second sentence: « The sum at
                        #: E42 starts below the rows it should cover. »
                        #: The formula it says that about goes in
                        #: `formula`, not into the sentence.
                        detail=(
                            "The sum starts below "
                            + ", ".join(
                                one.ref.rsplit("!", 1)[-1] for one in missed[:3]
                            )
                            #: The second half, mandatory: what the miss
                            #: does to every number built on this total.
                            + (
                                f", worth {shown_number(worth)} together, so "
                                "every number built on this total is out by "
                                "that amount."
                                if abs(worth) > 1e-9
                                else ", which it should cover, so nothing "
                                "built on this total counts that row."
                            )
                            + (
                                " It also sits one row below its label, "
                                "where every other column keeps the total "
                                "on the label's row."
                                if misaligned
                                else ""
                            )
                        ),
                        formula=cell.formula or "",
                        source="ICAEW P19, EuSpRIG",
                        figure=shown_number(worth) if abs(worth) > 1e-9 else "",
                        figure_unit="left out of the total below it",
                    )
                )


#: How many sibling totals must agree before their consensus can accuse
#: a deviant. Two agreeing cells are a coincidence; three are a dragged
#: design. Registered in docs/pierce/a3-sibling-totals.md.
TOTAL_CONSENSUS = 3

#: A totals cell the sibling check can compare: an optional sign, one
#: SUM call whose arguments are references, and an optional paren-free
#: surround — nothing else. A tail with its own call is a different
#: calculation and stays out of the family.
SIBLING_TOTAL = re.compile(
    r"^=\s*(?P<prefix>[+-]?)\s*SUM\((?P<args>[^()]+)\)(?P<tail>[^()]*)$",
    re.IGNORECASE,
)

#: A bare A1 reference inside a surround, for offset rewriting.
SURROUND_REF = re.compile(r"(?<![A-Za-z0-9_$!])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![0-9(])")


def _surround_shape(prefix: str, tail: str, row: int, column: int) -> str:
    """The formula outside the SUM call, comparable across siblings:
    uppercased, whitespace gone, the Lotus-era leading `+` dropped,
    relative references rewritten to offsets from the holding cell,
    absolute parts and numbers kept literal — a plug's value is the
    evidence, not noise to erase."""

    def rewrite(m: re.Match[str]) -> str:
        c_dollar, letters, r_dollar, digits = m.groups()
        c = 0
        for letter in letters:
            c = c * 26 + ord(letter) - 64
        c_part = f"${letters}" if c_dollar else f"C[{c - column}]"
        r_part = f"${digits}" if r_dollar else f"R[{int(digits) - row}]"
        return c_part + r_part

    text = SURROUND_REF.sub(rewrite, tail.upper())
    head = "" if prefix == "+" else prefix
    return "".join((head + "Σ" + text).split())


def _total_coverage(
    cell: Cell, across: str
) -> tuple[frozenset[tuple[int, int]], str] | None:
    """The cells a sibling total covers, as (own-axis offset, cross-axis
    position) pairs, plus its surround shape — or None when the formula
    is not a clean own-line total entirely before its cell."""
    m = SIBLING_TOTAL.match(cell.formula or "")
    if m is None:
        return None
    covered: set[tuple[int, int]] = set()
    multi = False
    for arg in m.group("args").split(","):
        span = REFERENCE.fullmatch(arg.strip())
        if span is None:
            return None
        sheet = (span.group("sheet") or cell.sheet).strip("'")
        if sheet != cell.sheet:
            return None
        c1 = 0
        for letter in span.group("column"):
            c1 = c1 * 26 + ord(letter) - 64
        c2 = c1
        if span.group("column2"):
            c2 = 0
            for letter in span.group("column2"):
                c2 = c2 * 26 + ord(letter) - 64
        r1 = int(span.group("row"))
        r2 = int(span.group("row2") or r1)
        c1, c2 = min(c1, c2), max(c1, c2)
        r1, r2 = min(r1, r2), max(r1, r2)
        if across == "row":
            #: A column total in a row of column totals: the argument
            #: columns include the cell's own, every row is above.
            if not (c1 <= cell.column <= c2) or r2 >= cell.row:
                return None
            if c1 <= cell.column <= c2 and r2 > r1:
                multi = True
            covered.update(
                (c - cell.column, r)
                for c in range(c1, c2 + 1)
                for r in range(r1, r2 + 1)
            )
        else:
            if not (r1 <= cell.row <= r2) or c2 >= cell.column:
                return None
            if r1 <= cell.row <= r2 and c2 > c1:
                multi = True
            covered.update(
                (r - cell.row, c) for r in range(r1, r2 + 1) for c in range(c1, c2 + 1)
            )
    if not multi:
        return None
    return frozenset(covered), _surround_shape(
        m.group("prefix"), m.group("tail"), cell.row, cell.column
    )


def _sibling_totals(book: Workbook, result: Audit) -> None:
    """A total that disagrees with the sibling totals beside it.

    A row of column totals is one authoring decision dragged across,
    and the siblings should agree with each other after translation.
    The A3 mining round's richest defect bucket is exactly the
    disagreements: an arithmetic plug (`=SUM(E10:E22)-1000` beside
    clean siblings), a range off-by-one (`=SUM(L8:L29)` beside
    `=SUM(I7:I29)`), a cross-column bleed (`=SUM(C6:D13)` beside
    `=SUM(E6:E13)`), a mis-dragged extra term. Within-column analysis
    structurally cannot see any of them — the witness is the family's
    own agreement, which is why the consensus must be wide (three
    siblings sharing one signature) and the deviants a strict
    minority. The same claim, turned 90°, for a column of row totals.

    Guards, registered before any measurement
    (docs/pierce/a3-sibling-totals.md): a deviant must overlap at
    least half the consensus's own-line range, or it is a total about
    a different block and stays silent; a deviant covering two or more
    sibling columns is a block total summarising the family, not a
    member disagreeing; a deviant already reported by the row passes
    or the skipped-cell check keeps that finding; and nothing here
    reads a cell's value — the only number quoted is a constant in
    the deviant's own formula text.
    """
    already = {
        finding.ref
        for finding in result.findings
        if finding.rule
        in ("inconsistent-row", "inconsistent-anchoring", "skipped-cell")
    }
    for across in ("row", "column"):
        lines: dict[
            tuple[str, int], list[tuple[Cell, frozenset[tuple[int, int]], str]]
        ] = {}
        for cell in book.cells.values():
            if not cell.formula:
                continue
            got = _total_coverage(cell, across)
            if got is None:
                continue
            key = (cell.sheet, cell.row if across == "row" else cell.column)
            lines.setdefault(key, []).append((cell, got[0], got[1]))
        for _, members in sorted(lines.items()):
            if len(members) <= TOTAL_CONSENSUS:
                continue
            tally = Counter((coverage, surround) for _, coverage, surround in members)
            (usual_cov, usual_sur), votes = tally.most_common(1)[0]
            if votes < TOTAL_CONSENSUS:
                continue
            family = [m for m in members if (m[1], m[2]) == (usual_cov, usual_sur)]
            deviants = [m for m in members if (m[1], m[2]) != (usual_cov, usual_sur)]
            if not deviants or len(deviants) >= votes:
                continue
            family.sort(key=lambda m: m[0].column if across == "row" else m[0].row)
            witness = family[0][0]
            usual_own = {at for off, at in usual_cov if off == 0}
            axis_of = (
                (lambda one: one.column) if across == "row" else (lambda one: one.row)
            )
            family_axis = {axis_of(m[0]) for m in family}
            #: Round 2's fold: deviants sharing one signature are one
            #: authoring decision, reported once with the roster.
            grouped: dict[tuple[frozenset[tuple[int, int]], str], list[Cell]] = {}
            for cell, coverage, surround in deviants:
                grouped.setdefault((coverage, surround), []).append(cell)
            for (coverage, surround), group in sorted(
                grouped.items(), key=lambda kv: min(axis_of(one) for one in kv[1])
            ):
                own = {at for off, at in coverage if off == 0}
                survivors: list[Cell] = []
                for cell in sorted(group, key=axis_of):
                    if cell.ref in already:
                        continue
                    if len(own & usual_own) * 2 < len(usual_own):
                        continue
                    reach = {axis_of(cell) + off for off, _ in coverage if off != 0}
                    if len(reach & family_axis) >= 2:
                        continue
                    if (
                        coverage != usual_cov
                        and surround == usual_sur
                        and not {off for off, _ in coverage}
                        - {off for off, _ in usual_cov}
                    ):
                        #: Round 2's consequence guard: a range
                        #: disagreement is reported only when the
                        #: deviant misses a live cell the consensus
                        #: spelling covers, in the deviant's own line.
                        #: A staircase total that merely over-reaches
                        #: empty rows — or covers *more* live rows, as
                        #: a designed depreciation triangle's later
                        #: columns must — computes what its siblings'
                        #: spelling would, and stays silent. Occupancy,
                        #: never values.
                        if across == "row":
                            missed_live = any(
                                f"{cell.sheet}!{get_column_letter(cell.column)}{at}"
                                in book.cells
                                for at in usual_own - own
                            )
                        else:
                            missed_live = any(
                                f"{cell.sheet}!{get_column_letter(at)}{cell.row}"
                                in book.cells
                                for at in usual_own - own
                            )
                        if not missed_live:
                            continue
                    survivors.append(cell)
                if not survivors:
                    continue
                first = survivors[0]
                n = votes
                where = witness.ref.rsplit("!", 1)[-1]
                figure = ""
                figure_unit = ""
                if coverage == usual_cov:
                    clause = (
                        "the arithmetic outside the shared SUM is this cell's alone"
                    )
                    plug = re.fullmatch(r"Σ([+-]\d+(?:\.\d+)?)", surround)
                    if plug and usual_sur == "Σ":
                        figure = shown_number(float(plug.group(1)))
                        figure_unit = "outside the family's shared range"
                elif surround == usual_sur and {off for off, _ in coverage} - {
                    off for off, _ in usual_cov
                }:
                    clause = (
                        "its range reaches a neighbouring "
                        + ("column" if across == "row" else "row")
                        + " where theirs each stay in their own"
                    )
                elif surround == usual_sur:
                    if across == "row":
                        reads = f"rows {min(own)}–{max(own)}"
                        theirs = f"{min(usual_own)}–{max(usual_own)}"
                    else:
                        reads = (
                            f"columns {get_column_letter(min(own))}–"
                            f"{get_column_letter(max(own))}"
                        )
                        theirs = (
                            f"{get_column_letter(min(usual_own))}–"
                            f"{get_column_letter(max(usual_own))}"
                        )
                    clause = f"it reads {reads} where they read {theirs}"
                else:
                    clause = "both its range and its arithmetic depart from theirs"
                roster = ""
                if len(survivors) > 1:
                    locals_ = [one.ref.rsplit("!", 1)[-1] for one in survivors]
                    clause += (
                        f" — the same disagreement in {len(survivors)} cells "
                        f"({', '.join(locals_[:6])}"
                        + (", …" if len(locals_) > 6 else "")
                        + ")"
                    )
                    roster = _roster([one.ref.rsplit("!", 1)[-1] for one in survivors])
                result.findings.append(
                    Finding(
                        rule="inconsistent-total",
                        severity="error",
                        ref=first.ref,
                        sheet=first.sheet,
                        name=first.name,
                        detail=(
                            f"The {n} totals beside it at {where} are built "
                            f"the same way as each other. {clause[0].upper()}"
                            f"{clause[1:]}."
                        ),
                        formula=first.formula or "",
                        against=witness.formula or "",
                        source="FAST, ICAEW P12",
                        figure=figure,
                        figure_unit=figure_unit,
                        cells=roster,
                    )
                )
                already.update(one.ref for one in survivors)


#: One bare aggregation over a single own-column range — the shape
#: this round judges. A tail, a second call or mixed arithmetic makes
#: a different claim and stays out.
BARE_RANGE = re.compile(
    r"^=\s*\+?\s*(?P<fn>SUM|AVERAGE|COUNT|COUNTA|MIN|MAX|PRODUCT)\("
    r"\s*\$?(?P<c1>[A-Z]{1,3})\$?(?P<r1>\d+)\s*:\s*"
    r"\$?(?P<c2>[A-Z]{1,3})\$?(?P<r2>\d+)\s*\)\s*$",
    re.IGNORECASE,
)


def _own_column_span(cell: Cell) -> tuple[int, int] | None:
    """(first row, last row) when the cell is a bare aggregation over a
    multi-row range in its own column, entirely above itself."""
    m = BARE_RANGE.match(cell.formula or "")
    if m is None:
        return None
    if m.group("c1").upper() != m.group("c2").upper():
        return None
    if m.group("c1").upper() != get_column_letter(cell.column):
        return None
    first, last = sorted((int(m.group("r1")), int(m.group("r2"))))
    #: A cell inside its own range is the circularity check's business.
    if last - first < 1 or first <= cell.row <= last:
        return None
    return first, last


def _range_over_block(book: Workbook, result: Audit) -> None:
    """A range that reaches past the block it is meant to cover.

    The skipped-cell check asks what a total left *out*; nothing asked
    what a range wrongly took *in*, and every mention of double
    counting in this module until now was an exemption protecting that
    check from accusing a correct total. This asks the other half,
    registered in docs/pierce/a3-range-block.md.

    **The double count** (error): the range contains a cell that is
    itself a bare aggregation over a strict subrange of the same
    range in the same column, so those rows are added twice — once
    directly and once through the subtotal. Wrong arithmetic however
    the model is used, and both formulas are in the file.

    The round's second class — a range spanning a *label* — was
    withdrawn before any result: the reader does not elect text
    cells, so a detector on that surface cannot tell a label from a
    blank, and blanks are ordinary layout. It needs a reader change,
    which is a frozen interface and its own round.
    """
    already = {
        finding.ref
        for finding in result.findings
        if finding.rule in ("skipped-cell", "inconsistent-total")
    }
    spans: dict[tuple[str, int], list[tuple[Cell, int, int]]] = {}
    for cell in book.cells.values():
        got = _own_column_span(cell)
        if got is not None:
            spans.setdefault((cell.sheet, cell.column), []).append(
                (cell, got[0], got[1])
            )

    for (sheet, column), members in sorted(spans.items()):
        letters = get_column_letter(column)
        for cell, first, last in sorted(members, key=lambda one: one[0].row):
            if cell.ref in already:
                continue
            inner = next(
                (
                    other
                    for other, o_first, o_last in members
                    if other.ref != cell.ref
                    and first <= other.row <= last
                    and first <= o_first
                    and o_last <= last
                    and (o_first, o_last) != (first, last)
                ),
                None,
            )
            if inner is not None:
                result.findings.append(
                    Finding(
                        rule="range-over-block",
                        severity="error",
                        ref=cell.ref,
                        sheet=sheet,
                        name=cell.name,
                        detail=(
                            "Those rows are already added by the total at "
                            f"{inner.ref.rsplit('!', 1)[-1]}, so they count "
                            "twice."
                        ),
                        formula=cell.formula or "",
                        against=inner.formula or "",
                        source="ICAEW P19, EuSpRIG",
                    )
                )
                already.add(cell.ref)


def _unit_mismatch(book: Workbook, result: Audit) -> None:
    """Adding pounds to dollars, or thousands to millions.

    E3a, registered in docs/pierce/e3a-unit-mismatch.md. The evidence
    is Dynamo's: `units.propagate` carries a row's inferred units into
    the formulas that read it and records a `Conflict` where a formula
    that only adds and subtracts has terms whose units disagree. This
    turns two of those into findings and **nothing else**.

    **Armed on the dimensions E2 measured, and only those.** Dynamo's
    verdict is per-dimension: `currency` and `scale` answer on 34.6%
    of rows and are wrong on none, so they are armed. `period` is
    wrong on a quarter to two thirds of rows and « is not to be
    quoted », so « a monthly figure in an annual line » — the finding
    a reader would most want — **is not raised at all**. That is E3b,
    blocked on measurement rather than on code.

    Four guards, each registered before any result:

    * a finding may rest only on a dimension E2 **answered**. One
      answered value against an `unknown` is an abstention, not a
      mismatch: `unknown` means the evidence did not decide, and a
      check resting on it would be inventing the disagreement.
    * **two distinct answered values** on the dimension, minimum.
    * **row-wise sheets only.** A data table's row is a record —
      `Date | Maturity | rate` — with no single unit, and Dynamo's
      `orientation` exists because typing one would be a lie.
    * `Conflict.units` merges currencies with scales into one tuple,
      so which dimension disagreed is derived here from the precedent
      labels, through the library's public surface. The `units`
      package is Dynamo's and is not edited from this lane.
    """
    from .units import Orientation, classify_sheet, orientation, propagate
    from .units.inference import rows_from_cells

    #: Indexed once. Seeding by scanning every cell per row is
    #: quadratic, and this runs on workbooks of half a million cells.
    inputs: dict[tuple[str, int], list[Cell]] = {}
    for cell in book.cells.values():
        if cell.formula is None:
            inputs.setdefault((cell.sheet, cell.row), []).append(cell)

    seeds: dict[str, Any] = {}
    row_wise: set[str] = set()
    for sheet in book.sheets:
        rows = rows_from_cells(book.cells, sheet)
        if not rows:
            continue
        if orientation(rows) is not Orientation.ROW_WISE:
            continue
        row_wise.add(sheet)
        for (_sheet, row), label in classify_sheet(rows).items():
            for cell in inputs.get((sheet, row), ()):
                seeds[cell.ref] = label

    if not seeds:
        for rule_name in ("currency-mismatch", "scale-mismatch"):
            result.abstentions.append(
                Abstention(
                    rule=rule_name,
                    why="no row-wise sheet carried rows the unit inference could read",
                )
            )
        return

    labels, conflicts = propagate(book.cells, seeds)

    examined = 0
    raised_by: dict[str, int] = {}
    for conflict in conflicts:
        found = book.cells.get(conflict.ref)
        if found is None or found.sheet not in row_wise:
            continue
        cell = found
        examined += 1
        terms = [labels[p] for p in (cell.precedents or ()) if p in labels]
        for dimension, rule_name, noun in (
            ("currency", "currency-mismatch", "currency"),
            ("scale", "scale-mismatch", "scale"),
        ):
            answered = {term.get(dimension) for term in terms}
            if "unknown" in answered:
                #: E2 declined on at least one term. The disagreement
                #: may well be real and we cannot say that it is.
                continue
            #: `none` and `unknown` are different abstentions, and
            #: conflating them cost this round its first measurement.
            #: `unknown` is « the evidence did not decide »; `none` is
            #: « decided: this quantity has no currency » — a rate, a
            #: count. A dimensionless term added to a money term is
            #: ordinary arithmetic, not a mismatch, and counting
            #: `none` as a competing currency made every cashflow on
            #: one model a finding: 103 raised of 103 examined, all
            #: « GBP, none », all wrong.
            answered.discard("none")
            if len(answered) < 2:
                continue
            spread = ", ".join(sorted(answered))
            raised_by[rule_name] = raised_by.get(rule_name, 0) + 1
            result.findings.append(
                Finding(
                    rule=rule_name,
                    severity="error",
                    ref=cell.ref,
                    sheet=cell.sheet,
                    name=cell.name,
                    #: The formula is evidence beneath the claim, never
                    #: the head of the sentence — it rides in `formula`.
                    detail=(f"The terms of this sum do not agree on their {noun}."),
                    formula=cell.formula or "",
                    source="Williams 2020, EuSpRIG",
                    figure=spread,
                    figure_unit=f"the {noun}s added together in one sum",
                )
            )

    #: A4's contract: each rule reports its coverage exactly once,
    #: as a tally or as an abstention, never both and never neither.
    _dimension_coverage(
        result,
        rule="currency-mismatch",
        examined=examined,
        answered=any(label.currency != "unknown" for label in labels.values()),
        raised=raised_by.get("currency-mismatch", 0),
        why=(
            "no row carried a currency the inference could read — the "
            "number formats name none and no Units column was supplied"
        ),
    )
    #: Scale is a *structural* abstention on today's inference, not a
    #: quiet zero. `classify_row` answers scale only from a declared
    #: Units column — the number-format branch says in as many words
    #: that « scale is not stated anywhere and is not guessed from
    #: magnitude » — and `rows_from_cells` does not carry declared
    #: units, so a blind read can never hold two different answered
    #: scales. Saying so is the difference between « clean » and
    #: « never looked », which is the whole of A4.
    _dimension_coverage(
        result,
        rule="scale-mismatch",
        examined=examined,
        answered=any(
            label.scale not in ("unknown", "units") for label in labels.values()
        ),
        raised=raised_by.get("scale-mismatch", 0),
        why=(
            "the unit inference answers scale only from a declared Units "
            "column, which this read does not carry — so a "
            "thousands-into-millions mix cannot be judged here"
        ),
    )


def _dimension_coverage(
    result: Audit,
    *,
    rule: str,
    examined: int,
    answered: bool,
    raised: int,
    why: str,
) -> None:
    """One coverage line for a unit rule — tally or abstention, never
    both, per A4's contract.

    A rule tallies when there was something it could have judged: sums
    whose terms disagree *and* a dimension the inference answered
    somewhere. Otherwise it abstains and says which of the two was
    missing, because « no mismatches » and « could not tell » are
    different sentences and the report must not merge them.
    """
    if examined and answered:
        result.tallies[rule] = {"total": examined, "raised": raised}
    else:
        result.abstentions.append(
            Abstention(
                rule=rule,
                why=(
                    "no formula added terms whose units disagree" if answered else why
                ),
            )
        )


def _hidden_sheets(book: Workbook, result: Audit) -> None:
    """Sheets the workbook is hiding — the document panel's fact,
    folded into the audit so it reaches the model page, the panel and
    the deals arithmetic.

    Two states, two weights. A *hidden* sheet is one right-click away
    from visible — everybody can see it exists — so it is a smell: a
    fact worth a look, often innocent. A *very hidden* sheet does not
    appear in Excel's own unhide menu and is reachable only through
    the VBA editor; concealment at that grade is a repeated cause in
    the published catalogues of spreadsheet disasters, and it is an
    error.
    """
    very = set(book.very_hidden_sheets)
    for sheet in book.hidden_sheets:
        concealed = sheet in very
        #: What the sheet actually is, before the sentence claims
        #: anything: « whatever it holds feeds the model » was said of a
        #: sheet holding nothing that nothing read — a conversion
        #: leftover, dressed as a threat. The raw populated count, where
        #: the reader recorded one — `cells` holds only what could be
        #: named, and a lone unlabelled number is still content.
        raw = book.populated.get(sheet)
        holds = (
            raw > 0
            if raw is not None
            else any(cell.sheet == sheet for cell in book.cells.values())
        )
        read = any(
            cell.formula
            and (f"'{sheet}'!" in cell.formula or f"{sheet}!" in cell.formula)
            for cell in book.cells.values()
            if cell.sheet != sheet
        )
        if concealed and not holds and not read:
            severity = "smell"
            #: `findings-voice.md` rule 5, and this is the founder's own
            #: worked example: « Module1 is very hidden but empty.
            #: Nothing in the model reads it — safe to delete. » What
            #: was here guessed at a cause (« most likely left over from
            #: an older file format ») that nothing had read.
            claim = f"« {sheet} » is very hidden but empty"
            detail = "Nothing in the model reads it — safe to delete."
        elif concealed:
            severity = "error"
            #: The other half of rule 5, and the sentence the founder
            #: quoted as *bad*: « Whatever it holds feeds the model
            #: without being on any screen » is a consequence nobody
            #: verified. Their replacement: « Module1 is very hidden and
            #: has not been read. It does not appear in Excel's unhide
            #: menu. »
            claim = f"« {sheet} » is very hidden and has not been read"
            detail = "It does not appear in Excel's unhide menu."
        else:
            severity = "smell"
            claim = f"« {sheet} » is hidden"
            detail = "It is in the workbook, one right-click away from visible."
        result.findings.append(
            Finding(
                rule="hidden-sheet",
                severity=severity,
                ref=f"{sheet}!A1",
                sheet=sheet,
                name=sheet,
                detail=detail,
                figure_unit=claim,
                kind="a hidden sheet",
                source="EuSpRIG",
            )
        )


#: A plain same-sheet reference, outside any `:` range — the pieces an
#: enumeration walks. The lookbehind bars sheet-qualified and defined
#: names; the lookahead bars range endpoints and function names.
BARE_REF = re.compile(r"(?<![A-Za-z0-9_$!.:])\$?([A-Z]{1,3})\$?(\d+)(?![0-9(:])")
RANGE_SPAN = re.compile(r"\$?[A-Z]{1,3}\$?\d+\s*:\s*\$?[A-Z]{1,3}\$?\d+")


def _gapped_tests(book: Workbook, result: Audit) -> None:
    """A formula that walks a line cell by cell and skips a stretch.

    `OR(D10<0,…,O10<0,W10<0)` names twelve consecutive cash cells and
    one more — P10:V10 are live cells the warning never reads, seven
    forecast years a negative balance could hide in, worn by a judged
    model's own alarm banner. The walk is the witness: five or more
    single steps along one line say the author meant to cover the
    line; the jump breaks the author's own pattern. Only populated
    skipped cells count — a hop over empty spacer columns is layout,
    not a gap.
    """
    for cell in book.cells.values():
        if not cell.formula:
            continue
        text = RANGE_SPAN.sub(" ", cell.formula)
        by_row: dict[int, dict[int, str | None]] = {}
        by_column: dict[int, dict[int, str | None]] = {}
        for m in BARE_REF.finditer(text):
            column = 0
            for letter in m.group(1):
                column = column * 26 + ord(letter) - 64
            #: The walk must be a *test* — every walked cell put to the
            #: same comparison (`D10<0`, `E10<0`, …). Adjacent line
            #: items in plain arithmetic walk too (a tax formula reads
            #: F18 through F22 and then F75), and skipping between
            #: them is composition, not coverage — a judged model's
            #: allowance row taught exactly that.
            test = re.match(
                r"\s*(<=|>=|<>|=|<|>)\s*(\"[^\"]*\"|[-+]?[\w.$]+)",
                text[m.end() :],
            )
            comparison = test.group(0).replace(" ", "") if test else None
            by_row.setdefault(int(m.group(2)), {})[column] = comparison
            by_column.setdefault(column, {})[int(m.group(2))] = comparison
        for across, lines in (("row", by_row), ("column", by_column)):
            for line, spots in lines.items():
                ordered = sorted(spots)
                if len(ordered) < 6:
                    continue
                run = 1
                for last, this in zip(ordered, ordered[1:], strict=False):
                    if this - last == 1:
                        run += 1
                        continue
                    skipped = list(range(last + 1, this))
                    walked = [spots[at] for at in ordered if last - run < at <= last]
                    same_test = (
                        len(set(walked)) == 1
                        and walked[0] is not None
                        and spots[this] == walked[0]
                    )
                    if run >= 5 and len(skipped) >= 2 and same_test:
                        if across == "row":
                            refs = [
                                f"{cell.sheet}!{get_column_letter(at)}{line}"
                                for at in skipped
                            ]
                        else:
                            refs = [
                                f"{cell.sheet}!{get_column_letter(line)}{at}"
                                for at in skipped
                            ]
                        live = [at for at in refs if at in book.cells]
                        if len(live) >= 2:
                            first, final = refs[0], refs[-1]
                            result.findings.append(
                                Finding(
                                    rule="gapped-test",
                                    severity="error",
                                    ref=cell.ref,
                                    sheet=cell.sheet,
                                    name=cell.name,
                                    #: Evidence. The claim — how many live
                                    #: cells the check walks past — is
                                    #: built in `plain_words` off `figure`.
                                    detail=(
                                        f"It tests {run} cells one at a "
                                        f"time and skips "
                                        f"{first.rsplit('!', 1)[-1]} to "
                                        f"{final.rsplit('!', 1)[-1]}."
                                    ),
                                    figure=str(len(live)),
                                    figure_unit="skipped cells hold numbers",
                                    cells=_roster(live),
                                    source="EuSpRIG, ICAEW P11",
                                )
                            )
                            break
                    run = 1
                else:
                    continue
                break


def _names_table(book: Workbook, result: Audit) -> None:
    """The names table, audited — the cells are not the whole file.

    Both findings come from a judged model that carried them: dozens
    of names storing `#REF!` where their targets used to be, and
    names pointing into workbooks on someone's OneDrive. No live
    formula has to read them — they still raise update prompts on
    open, and a new formula written against one breaks on arrival.
    """
    if book.broken_names:
        shown = ", ".join(book.broken_names[:6])
        more = len(book.broken_names) - 6
        result.findings.append(
            Finding(
                rule="broken-name",
                severity="smell",
                ref="",
                sheet="",
                name="defined names",
                #: Evidence, not the claim: the names themselves, and
                #: what Excel left in place of the cell they used to
                #: point at. The sentence a person reads is written in
                #: `plain_words` and says none of this.
                detail=(
                    f"Excel stores #REF! where their targets used to be "
                    f"({shown}{f' and {more} more' if more > 0 else ''}). "
                    f"Clearing them is done in the name manager."
                ),
                figure=str(len(book.broken_names)),
                figure_unit="point at deleted cells",
                source="EuSpRIG",
            )
        )
    if book.foreign_names:
        names_only = [name for name, _ in book.foreign_names]
        shown = ", ".join(names_only[:6])
        more = len(names_only) - 6
        example, target = book.foreign_names[0]
        result.findings.append(
            Finding(
                rule="broken-name",
                severity="smell",
                ref="",
                sheet="",
                name="defined names",
                detail=(
                    f"{shown}{f' and {more} more' if more > 0 else ''}. "
                    f"{example} reads {target[:50]}."
                ),
                figure=str(len(names_only)),
                figure_unit="point into files that are not here",
                source="EuSpRIG, ICAEW P16",
            )
        )


__all__ = [
    "BROKEN",
    "INNOCENT",
    "LONG_FORMULA",
    "RULE_NAMES",
    "VOLATILE",
    "Audit",
    "Finding",
    "audit",
]


def _broken_aggregation(book: Workbook, result: Audit) -> None:
    """E3c — a row that takes one period where it takes the whole window.

    The flagship finding of `swens.md` § 3a: « a formula that adds a
    monthly figure to an annual one is a perfectly valid formula. It is
    only wrong in meaning. » Nothing here reads a header word. A row's
    kind — flow, opening balance, closing balance — is read from what
    the row *does* across forty periods, and a defect is a break in the
    row's own established pattern.

    Measured before wiring (`docs/pierce/e3c-flow-stock.md`), on the
    22-model closed-deal corpus:

    - **planted recall 165 of 178 sites (92.7%)** — one coarse period
      of each clean flow row overwritten with a single fine cell's
      value, planted in the reader's own cells with the whole path
      re-run;
    - **zero false alarms** across 855 patterned rows;
    - **coincidence control 0.33%** at the exact 95% bound, on 10,827
      mismatched pairs, against 77% for the design before this one.

    Two limits travel with it and belong in any sentence quoting the
    numbers. **It is silent on 6 of the 22 models** — 27% of real close
    models lay out no two dated blocks sharing labels, and silence with
    a reason is the honest answer there. And **13 of the misses are
    unexplained**, clustered at one period index in one model, which is
    one blind spot rather than thirteen faults.
    """
    from .units.periods import (
        COARSENESS,
        FLOW,
        OPENING,
        RATIOS,
        Block,
        PeriodFinding,
        blocks_from_dates,
        classify_row,
        date_axes,
        fold,
        series_by_label,
    )

    blocks = blocks_from_dates(date_axes(book.cells))
    if len(blocks) < 2:
        #: **The 27% is said out loud, not hidden as silence.** Six of
        #: the twenty-two closed-deal models lay out no second dated
        #: block for the check to read a row against, and a report that
        #: printed nothing there would be claiming a clean bill it
        #: never earned.
        result.abstentions.append(
            Abstention(
                rule="broken-aggregation",
                why=(
                    "the file lays out no two sheets of dated columns to "
                    "read one row against the other"
                ),
            )
        )
        return
    by_sheet = {block.sheet: block for block in blocks}

    #: One block per sheet, so reading a block's rows once and keeping
    #: it is the same computation the measured scripts do per pair —
    #: only not repeated for every partner the sheet is compared with.
    rows_of: dict[str, dict[str, tuple[int, list[float]]]] = {}

    def _rows(block: Block) -> dict[str, tuple[int, list[float]]]:
        if block.sheet not in rows_of:
            rows_of[block.sheet] = series_by_label(
                book.cells, block.sheet, block.columns
            )
        return rows_of[block.sheet]

    #: A4's denominator: rows that **declared a kind**, which is the
    #: population this rule actually judges. A row whose two series
    #: never establish a pattern was not examined and must not inflate
    #: a coverage number.
    patterned = 0
    reports: list[tuple[PeriodFinding, list[float]]] = []
    for fine in blocks:
        for coarse in blocks:
            if fine.sheet == coarse.sheet:
                continue
            if COARSENESS[fine.granularity] >= COARSENESS[coarse.granularity]:
                continue
            ratio = RATIOS.get((fine.granularity, coarse.granularity))
            if ratio is None:
                continue
            fine_rows = _rows(fine)
            coarse_rows = _rows(coarse)
            for label in sorted(set(fine_rows) & set(coarse_rows)):
                fine_row, fine_values = fine_rows[label]
                coarse_row, coarse_values = coarse_rows[label]
                pattern = classify_row(fine_values, coarse_values, ratio)
                if pattern is None:
                    continue
                patterned += 1
                if not pattern.single_period:
                    continue
                reports.append(
                    (
                        PeriodFinding(
                            label=label,
                            fine=f"{fine.sheet}!{fine_row}",
                            coarse=f"{coarse.sheet}!{coarse_row}",
                            ratio=ratio,
                            kind=pattern.kind,
                            kept=len(pattern.kept),
                            single_period=pattern.single_period,
                        ),
                        list(coarse_values),
                    )
                )

    if not patterned:
        result.abstentions.append(
            Abstention(
                rule="broken-aggregation",
                why=(
                    "no row on the file's dated sheets holds still long "
                    "enough across its periods to establish a pattern"
                ),
            )
        )
        return
    #: `raised` is refreshed in `_coverage`, after every fold has
    #: settled, so this number can never disagree with the report.
    result.tallies["broken-aggregation"] = {"total": patterned, "raised": 0}

    #: One number published on several rows is one authoring decision.
    for one in fold(reports):
        sheet, row = one.coarse.split("!")
        block = by_sheet[sheet]
        #: `single_period` indexes the coarse series, which was read
        #: straight off `block.columns` — so the index names the cell,
        #: and the finding can point at it rather than at the row.
        broken = [
            f"{get_column_letter(block.columns[index])}{row}"
            for index in one.single_period
            if index < len(block.columns)
        ]
        if not broken:
            continue
        #: The other cells this one finding stands for. They used to be
        #: two extra sentences on the end of the claim — « It does the
        #: same at H41. The same figure is published at Summary!C5. » —
        #: which put the sentence a person reads at three and then four.
        #: `cells` is the field for a fold's membership, and the roster
        #: belongs in it.
        #: The period words, so the sentence can say « one month »
        #: rather than « one sub-period ». Both granularities are in
        #: hand here and nowhere downstream, so they are written into
        #: the claim at the point they are known.
        small = PERIOD_WORDS[by_sheet[one.fine.split("!")[0]].granularity]
        big = PERIOD_WORDS[block.granularity]
        if one.kind == FLOW:
            #: The flagship claim, in the founder's own terms: the year
            #: holds one month's figure. `_matches_one_cell` is what
            #: raised it, so the second sentence states what was
            #: measured rather than a consequence nobody verified.
            claim = f"adds up one {small} where the row adds all {one.ratio}"
            because = f"This {big} carries one {small}'s figure."
        else:
            edge = "first" if one.kind == OPENING else "last"
            claim = f"takes the wrong {small}"
            because = f"Everywhere else the row takes each {big}'s {edge} {small}."
        result.findings.append(
            Finding(
                rule="broken-aggregation",
                severity="error",
                ref=f"{sheet}!{broken[0]}",
                sheet=sheet,
                name=one.label,
                #: The detail stands alone as the finding's second
                #: sentence; `figure_unit` carries the claim so
                #: `plain_words` writes the headline without borrowing
                #: prose from here.
                detail=because,
                figure_unit=claim,
                kind="one period out of pattern",
                cells=_roster([f"{sheet}!{ref}" for ref in broken] + list(one.also)),
                source="the row's own behaviour across its time axis",
            )
        )
