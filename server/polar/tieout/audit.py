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

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from openpyxl.formula.tokenizer import Tokenizer
from openpyxl.utils import get_column_letter

from .workbook import REFERENCE, Cell, Workbook

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
INNOCENT = frozenset({0, 1, 2, -1, 10, 12, 24, 52, 100, 360, 365, 1000, 1000000})

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


@dataclass
class Audit:
    findings: list[Finding] = field(default_factory=list)
    #: Cells examined, so silence can be told apart from not looking.
    examined: int = 0

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
    "volatile": "Volatile functions",
    "long-formula": "Formulas too long to follow",
    "hardcode-in-formula": "Hardcoded values inside formulas",
    "typed-over-formula": "Values typed over formulas",
    "inconsistent-anchoring": "Anchoring that changes along a row",
    "inconsistent-row": "Formulas inconsistent across a row",
    "circular": "Circular references",
    "skipped-cell": "Sum ranges that miss a cell",
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
    "volatile": "Volatile function",
    "long-formula": "Complex formula",
    "hardcode-in-formula": "Hardcoded assumption",
    "typed-over-formula": "Unexpected hardcode",
    "inconsistent-anchoring": "Inconsistent anchoring",
    "inconsistent-row": "Inconsistent formula",
    "circular": "Circular reference",
    "skipped-cell": "Incomplete total",
    "hidden-sheet": "Hidden sheet",
}


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


def replace_finding(finding: Finding, **changes: str) -> Finding:
    from dataclasses import replace

    return replace(finding, **changes)


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
        if finding.detail.startswith("the same value typed across"):
            #: The row fold: one value pasted across one row's columns.
            lead = f"{label} has" if label else "One row has"
            return (
                f"{lead} {finding.detail} — one paste. Check whether "
                "the override is intentional."
            )
        if finding.detail.startswith("typed over in "):
            #: The block collapse: one decision, made once per repeated
            #: block or once per row of a paste — said once, with every
            #: place in the sentence.
            coords = finding.detail.split(": ", 1)[-1]
            lead = f"{label} is" if label else "One column is"
            return (
                f"{lead} typed over in {len(coords.split(', '))} places — "
                f"{coords} — while the rest of each row is calculated. "
                "Check whether these are intentional overrides."
            )
        return (
            f"{subject} contains a fixed value while the rest of the row "
            "is calculated. Check whether this is an intentional override."
        )
    if finding.rule == "inconsistent-row":
        if finding.detail.startswith("tests "):
            #: The selector drift: same formula, different switch value.
            what = finding.detail.split(":", 1)[0]
            return (
                f"{subject} {what} — the same formula with a different "
                "switch setting. Check whether the exception is deliberate "
                "or a stale copy."
            )
        return (
            f"{subject} does not follow the formula the rest of the row "
            "uses. Check whether the departure is deliberate."
        )
    if finding.rule == "skipped-cell":
        leaving = (
            f", leaving {finding.figure} outside the total" if finding.figure else ""
        )
        opening = (
            f"{label} is incomplete: the formula at {at}"
            if label
            else f"The total at {at}"
        )
        return f"{opening} excludes rows immediately above it{leaving}."
    if finding.rule == "hardcode-in-formula":
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
        span = (
            f" across {finding.figure_unit.removeprefix('filled across ')}"
            if finding.figure_unit.startswith("filled")
            else f" in {period}"
            if period
            else ""
        )
        number = finding.figure or "a number"
        return (
            f"The formula at {at} has {number} typed directly into it"
            f"{span}. If the assumption moves, this cell will not."
        )

    if finding.rule == "error-value":
        if finding.figure_unit == "cells past the data's edge":
            #: The designed tail: the data ends and the lookups say so.
            return (
                f"« {finding.sheet} » {finding.detail}. A lookup's "
                "designed answer for missing data, not damage."
            )
        if finding.figure_unit == "breaks a live column":
            return (
                f"{finding.detail.split(' inside ')[0]} interrupts an "
                "otherwise live column — the cells beneath it calculate. "
                "Check what broke the series."
            )
        if finding.figure_unit == "cells sharing one broken formula":
            return (
                f"{finding.figure} cells on « {finding.sheet} » show "
                f"{finding.detail.split(' across ')[0].removeprefix('shows ')} "
                "from one formula whose target was deleted, then filled "
                "across the block. Repair the formula once and refill it."
            )
        return (
            f"{at} shows an error value instead of a number, and "
            "everything reading it calculates on top of the error."
        )
    if finding.rule == "circular" and finding.figure_unit.startswith("cells"):
        if "identical loops" in finding.figure_unit:
            loops = finding.figure_unit.split()[2]
            return (
                f"The same calculation loop repeats {loops} times — "
                f"{finding.figure} cells in all — and the workbook does "
                "not declare iterative calculation."
            )
        return (
            f"A loop of {finding.figure} cells runs through {at}, and "
            "the workbook does not declare iterative calculation."
        )

    if finding.rule == "volatile" and (
        finding.figure_unit.startswith("in ")
        or finding.figure_unit.startswith("repeated on")
    ):
        #: The idiom and sibling-sheet folds: one habit, said once.
        return (
            f"« {finding.sheet} » {finding.detail}. It recalculates on "
            "every change, and its targets cannot be traced by eye."
        )
    if finding.rule == "long-formula" and (
        finding.figure_unit.startswith("in ")
        or finding.figure_unit.startswith("repeated on")
    ):
        #: The row and sibling-sheet folds for long formulas.
        return (
            f"An unusually complex formula, {finding.detail}. Its logic "
            "is difficult to trace and verify by hand."
        )

    sentence = {
        "external-link": (
            f"{at} pulls its value from another workbook that is not "
            "here, so nothing about it can be traced or checked."
        ),
        "volatile": (
            f"{at} recalculates every time anything in the workbook "
            "changes, so its value never sits still."
        ),
        "long-formula": (
            f"{at} contains an unusually complex formula. Its logic is "
            "difficult to trace and verify by hand."
        ),
        "inconsistent-anchoring": (
            f"{at} anchors its references differently from the rest of "
            "its row, so filling the row again would change its result."
        ),
        "circular": (
            f"{at} feeds its own calculation, and the workbook does not "
            "declare iterative calculation."
        ),
    }.get(finding.rule)
    if sentence is None:
        #: Hidden sheets and the statement checks already write their
        #: detail as a sentence — it is the plain words.
        return finding.detail
    return sentence


def audit(book: Workbook, axes: "PeriodAxes | None" = None) -> Audit:
    """Every mechanical defect in a model, graded.

    `axes` — each sheet's period axis, from the structure layer — lets
    the findings speak the model's own time vocabulary (« FY2032 »
    instead of a column letter) and lets a typed cell say what the row
    would calculate there. Absent, every sentence falls back to
    coordinates; nothing is guessed.
    """
    result = Audit(examined=len(book.cells))

    _error_values(book, result)
    _external_links(book, result)
    _volatile(book, result)
    _long_formulas(book, result)
    _literals(book, result)
    _rows(book, result)
    _selector_drift(book, result)
    _typed_islands(book, result)
    _circularity(book, result)
    _skipped_cells(book, result)
    _hidden_sheets(book, result)

    _quantified(book, result, axes)
    result.findings = _collapsed(book, result.findings, axes)
    _flows(book, result)
    result.findings.sort(key=lambda f: (f.severity != "error", f.sheet, f.rule, f.ref))
    return result


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
        first = group[0]
        if len(group) == 1:
            keep.append(first)
            continue
        #: The span in the model's own time vocabulary when the axis
        #: knows these columns — « FY2014–FY2033 » beats « E17 to X17 ».
        edges = sorted(one.ref for one in group)
        start = _period(axes, first.sheet, edges[0])
        end = _period(axes, first.sheet, edges[-1])
        span = f"{start}–{end}" if start and end else f"{edges[0]} to {edges[-1]}"
        keep.append(
            Finding(
                rule=first.rule,
                severity=first.severity,
                ref=first.ref,
                sheet=first.sheet,
                name=first.name,
                detail=(
                    f"{first.detail} — one formula filled across "
                    f"{len(group)} cells ({span})"
                ),
                source=first.source,
                figure=first.figure,
                figure_unit=f"filled across {span}",
            )
        )
    return _cross_folds(book, _typed_blocks(book, keep))


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
    #: data, not damage — and are dropped. Short runs stay per cell:
    #: the confirmed Yorkshire paste is five columns wide, and it must
    #: keep reporting exactly as the regulator's queries document
    #: confirms it.
    by_row: dict[tuple[str, int], list[Finding]] = {}
    for finding in typed:
        by_row.setdefault((finding.sheet, _at(finding)[1]), []).append(finding)
    survivors: list[Finding] = []
    for group in by_row.values():
        if len(group) < 6:
            survivors.extend(group)
            continue
        held = {
            str(cell.value) if (cell := book.cells.get(one.ref)) else one.ref
            for one in group
        }
        group.sort(key=lambda one: (len(_at(one)[0]), _at(one)[0]))
        if len(held) == 1:
            first = group[0]
            coords = [one.ref.rsplit("!", 1)[-1] for one in group]
            survivors.append(
                Finding(
                    rule=first.rule,
                    severity=first.severity,
                    ref=first.ref,
                    sheet=first.sheet,
                    name=first.name,
                    detail=(
                        f"the same value typed across {len(group)} cells "
                        f"of one row ({coords[0]} to {coords[-1]})"
                    ),
                    source=first.source,
                    figure_unit=f"typed across {len(group)} cells",
                )
            )
        elif len(group) >= TYPED_BLOCK:
            continue
        else:
            survivors.extend(group)
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
            detail=(
                f"typed over in {len(group)} places down one column: "
                f"{', '.join(coords)}"
            ),
            source=first.source,
            figure_unit=f"typed over in {len(group)} places",
        )

    for group in by_column.values():
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
                keep.append(_fold(same))
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
            keep.append(_fold(rest))
        else:
            keep.extend(rest)
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
    keep = [one for one in findings if one.rule not in SIBLING_RULES]
    pool = [one for one in findings if one.rule in SIBLING_RULES]

    def base_detail(finding: Finding) -> str:
        return finding.detail.split(" — one formula filled")[0]

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
                detail=f"{base_detail(first)}, in {len(line)} cells of one row",
                source=first.source,
                figure_unit=f"in {len(line)} cells of one row",
            )
        )
    folded_away = {
        id(one) for line in by_line_key.values() if len(line) >= 3 for one in line
    }
    pool = [one for one in pool if id(one) not in folded_away] + folded_rows

    #: The same finding at the same address under the same label on
    #: three or more sheets: a per-company workbook's repeated
    #: decision, whichever smell rule saw it.
    by_address: dict[tuple[str, str, str, str], list[Finding]] = {}
    for finding in pool:
        coordinate = finding.ref.rsplit("!", 1)[-1]
        by_address.setdefault(
            (finding.rule, coordinate, finding.name, base_detail(finding)), []
        ).append(finding)
    solo: list[Finding] = []
    for group in by_address.values():
        sheets = sorted({one.sheet for one in group})
        if len(sheets) < 3 or len(sheets) != len(group):
            solo.extend(group)
            continue
        first = min(group, key=lambda one: one.sheet)
        shown = ", ".join(sheets[:4]) + (", …" if len(sheets) > 4 else "")
        keep.append(
            Finding(
                rule=first.rule,
                severity=first.severity,
                ref=first.ref,
                sheet=first.sheet,
                name=first.name,
                detail=(
                    f"{base_detail(first)} — the same formula at "
                    f"{first.ref.rsplit('!', 1)[-1]} on {len(sheets)} sheets "
                    f"({shown})"
                ),
                source=first.source,
                figure=first.figure,
                figure_unit=f"repeated on {len(sheets)} sheets",
            )
        )
    keep.extend(one for one in solo if one.rule == "long-formula")
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
                    f"{', '.join(numbers)} written into {len(group)} "
                    f"different formulas on this sheet — a convention typed "
                    f"everywhere rather than held in one cell"
                ),
                source=first.source,
                figure=first.figure,
                figure_unit=f"in {len(group)} formulas on one sheet",
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
                        f"{what} in {len(group)} places across {len(rows)} "
                        f"rows — the sheet is built on it"
                    ),
                    source=first.source,
                    figure_unit=f"in {len(group)} places on one sheet",
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
                    detail=f"{base_detail(first)} in {len(line)} cells of one row",
                    source=first.source,
                    figure_unit=f"in {len(line)} cells of one row",
                )
            )

    return keep


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
                    detail=f"shows {value}",
                    source="ICAEW P19",
                )
            )
            continue
        span = f"{refs[0]} to {refs[-1].rsplit('!', 1)[-1]}"
        what = (
            f"`{formula[:60]}` repeated over the block"
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
                detail=(
                    f"shows {value} across {len(refs):,} cells, {span} — "
                    f"one broken formula, {what}"
                ),
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
                        detail=(
                            f"{value} at {span} inside an otherwise live "
                            f"column — values resume at {column}{end + 1}"
                            f"{witness}"
                        ),
                        source="ICAEW P19",
                        figure_unit="breaks a live column",
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
                detail=(
                    f"carries {kinds} {' and '.join(where)} — "
                    f"{fold['cells']:,} cells across "
                    f"{len(fold['columns'])} columns"
                ),
                source="ICAEW P19",
                figure=f"{fold['cells']:,}",
                figure_unit="cells past the data's edge",
            )
        )


def _external_links(book: Workbook, result: Audit) -> None:
    for cell in book.cells.values():
        if cell.formula and EXTERNAL.search(cell.formula):
            result.findings.append(
                Finding(
                    rule="external-link",
                    severity="error",
                    ref=cell.ref,
                    sheet=cell.sheet,
                    name=cell.name,
                    detail=f"reads another workbook: {cell.formula[:70]}",
                    source="ICAEW P19",
                )
            )


def _volatile(book: Workbook, result: Audit) -> None:
    for cell in book.cells.values():
        if not cell.formula:
            continue
        used = {
            token.value.rstrip("(").upper()
            for token in Tokenizer(cell.formula).items
            if token.type == "FUNC"
        } & VOLATILE
        if used:
            result.findings.append(
                Finding(
                    rule="volatile",
                    severity="smell",
                    ref=cell.ref,
                    sheet=cell.sheet,
                    name=cell.name,
                    detail=f"uses {', '.join(sorted(used))}",
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
    for token in Tokenizer(formula).items:
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
                    detail=f"{len(cell.formula)} characters",
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
    for cell in book.cells.values():
        if not cell.formula:
            continue
        #: A number the row's own words state — « 70% Grid / 30% Water »
        #: over a `*0.7`, « must be 1 or 5 » over a `*5` — is documented
        #: where the reader is already looking, which is the entire
        #: complaint the hardcode rule makes. Judged per number: the
        #: documented ones drop out, any undocumented ones still report.
        buried = tuple(
            value for value in _buried(cell.formula) if not _documented(value, cell)
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
                    detail=f"{', '.join(distinct[:4])} inside {cell.formula[:60]}",
                    source="ICAEW P14, FAST",
                    figure=", ".join(distinct[:2]),
                )
            )


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
    """
    tokens = [
        token
        for token in Tokenizer(formula).items
        if token.type not in ("WHITE-SPACE", "WHITESPACE")
    ]
    found: list[str] = []
    selectors: list[str] = []
    #: One frame per open call or parenthesis: [function name, argument
    #: index] — the same walk `references_of` does in the reader.
    frames: list[list[Any]] = []
    tolerant = "ABS(" in formula.upper()

    def _operator(token: Any, values: tuple[str, ...]) -> bool:
        return (
            token is not None
            and token.type.startswith("OPERATOR")
            and token.value in values
        )

    for index, token in enumerate(tokens):
        if token.type == "FUNC" and token.subtype == "OPEN":
            frames.append([token.value.rstrip("(").upper(), 0])
            continue
        if token.type == "PAREN" and token.subtype == "OPEN":
            frames.append(["", 0])
            continue
        if token.type in ("FUNC", "PAREN") and token.subtype == "CLOSE":
            if frames:
                frames.pop()
            continue
        if token.type == "SEP" and token.subtype == "ARG" and frames:
            frames[-1][1] += 1
            continue
        if token.type != "OPERAND" or token.subtype != "NUMBER":
            continue
        try:
            number = float(token.value)
        except ValueError:
            continue
        prev = tokens[index - 1] if index else None
        after = tokens[index + 1] if index + 1 < len(tokens) else None
        if _operator(prev, ("=", "<>")) or _operator(after, ("=", "<>")):
            selectors.append(token.value)
            continue
        if any(name in DATE_FUNCS or name in TEXT_FUNCS for name, _ in frames):
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
        if number in INNOCENT or (number.is_integer() and abs(number) <= 4):
            continue
        found.append(token.value)
    return tuple(found), tuple(selectors)


def _buried(formula: str) -> tuple[str, ...]:
    """The assumption-shaped numbers typed inside a formula — the
    decision the hardcode rule is about, and therefore the identity the
    collapse groups by."""
    return _literal_scan(formula)[0]


def _documented(value: str, cell: Cell) -> bool:
    """True when the cell's own labels state the number.

    Checked in the number's own spelling, as a bare integer, and as the
    percentage it would print as — `0.7` is documented by a label that
    says « 70% ». Word-bounded, so a 70 in « 1970 » proves nothing.
    """
    words = " ".join(filter(None, (cell.name, cell.row_label, cell.column_label)))
    if not words:
        return False
    try:
        number = float(value)
    except ValueError:
        return False
    forms = {value}
    if number.is_integer():
        forms.add(f"{int(number)}")
    forms.add(f"{number * 100:g}%")
    return any(
        re.search(rf"(?<![\w.]){re.escape(form)}(?![\w.])", words) for form in forms
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
                            f"{shown_number(float(cell.value))} typed into "
                            "a series that is otherwise calculated: "
                            f"{_example(calculated, usual)}"
                        ),
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
                                f"{cell.formula} is anchored differently from "
                                f"{_example(calculated, usual)}"
                            ),
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
                                f"{cell.formula} where the series does "
                                f"{_example(calculated, usual)}"
                            ),
                            source="FAST, ICAEW P12",
                        )
                    )


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
    times beside exactly one dissenter, and rows whose columns name
    quantities rather than periods are left alone — their selectors
    are supposed to differ.
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
        labelled = [cell.column_label for cell, _ in members if cell.column_label]
        if labelled and sum(1 for one in labelled if PERIOD.match(one)) < (
            len(labelled) - 1
        ):
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
                    f"tests {', '.join(few_key)} where {len(many)} sister "
                    f"cells test {', '.join(many_key)}: {(odd.formula or '')[:70]}"
                ),
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
        for token in Tokenizer(cell.formula).items
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
        # formula; it must carry the column's repeating shape.
        edges = [run[at] for at in (index - 1, end) if 0 <= at < len(run)]
        if (
            len(island) <= TYPED_BLOCK
            and len(island) < len(run)
            and any(_shape(edge) == usual for edge in edges)
            #: A column whose repeating formula is one bare defined name
            #: — `=price_label` down a mnemonic column — is the sheet's
            #: text scaffolding, and a value typed between its rows is
            #: a heading, not a paste over a calculation.
            and not _mnemonic(usual)
            and all(
                leftmost.get((sheet, cell.row), 1 << 20) < cell.column
                for cell in island
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
                            f"{shown_number(float(cell.value))} typed into "
                            "a column that is otherwise calculated: "
                            f"{_example(calculated, usual)}"
                        ),
                        source="ICAEW P14, FAST",
                    )
                )
        index = end


#: One bare name and nothing else — what a defined-name mnemonic column
#: reduces to after :func:`_shape` (which leaves names it cannot offset
#: verbatim). A cell reference never fits: shapes render those in
#: R/C form, which the second test excludes.
MNEMONIC = re.compile(r"[A-Za-z_\\][A-Za-z0-9_.\\]*")


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
    """
    if cell.formula is None:
        return ""
    out = []
    for token in Tokenizer(cell.formula).items:
        if token.type == "OPERAND" and token.subtype == "RANGE":
            out.append(_offset(token.value, cell.row, cell.column, anchoring))
        elif token.type == "OPERAND" and token.subtype == "NUMBER":
            out.append("#")
        elif token.type == "OPERAND" and token.subtype == "TEXT":
            out.append('"..."')
        else:
            out.append(token.value)
    return "".join(out)


def _offset(reference: str, row: int, column: int, anchoring: bool = True) -> str:
    """`E6` seen from `F7` is `R[-1]C[-1]`; `$B$19` stays `$B$19`."""
    parts = []
    for piece in reference.split(":"):
        match = re.fullmatch(
            r"(?:(?P<sheet>'[^']+'|[A-Za-z0-9_.]+)!)?"
            r"(?P<ca>\$?)(?P<column>[A-Z]{1,3})(?P<ra>\$?)(?P<row>\d+)",
            piece.strip(),
        )
        if match is None:
            return reference
        sheet = f"{match.group('sheet')}!" if match.group("sheet") else ""
        target_column = 0
        for letter in match.group("column"):
            target_column = target_column * 26 + (ord(letter) - 64)
        text_column = (
            f"C{match.group('column')}"
            if match.group("ca") and anchoring
            else f"C[{target_column - column:+d}]"
        )
        text_row = (
            f"R{match.group('row')}"
            if match.group("ra") and anchoring
            else f"R[{int(match.group('row')) - row:+d}]"
        )
        parts.append(f"{sheet}{text_row}{text_column}")
    return ":".join(parts)


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
    mine = list(Tokenizer(cell.formula).items)
    theirs = list(Tokenizer(twin.formula).items)
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
    edges: dict[str, tuple[str, ...]] = {
        ref: tuple(one for one in (cell.precedents or ()) if one in book.cells)
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
    for token in Tokenizer(cell.formula or "").items:
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
                for part in Tokenizer(inside.formula).items:
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
                #: to the detail would double count.
                if any(
                    top <= at < cell.row and row in reads
                    for at, reads in partitions.get((cell.sheet, column), ())
                ):
                    continue
                missed.append(above)
            if missed:
                #: What the misses are worth, straight from the cells —
                #: the number the founder's design leads the card with.
                worth = sum(float(one.value or 0) for one in missed)
                result.findings.append(
                    Finding(
                        rule="skipped-cell",
                        severity="error",
                        ref=cell.ref,
                        sheet=cell.sheet,
                        name=cell.name,
                        detail=(
                            f"{cell.formula} leaves out "
                            f"{', '.join(one.ref for one in missed[:3])} above it"
                            + (
                                f" — worth {shown_number(worth)} together"
                                if abs(worth) > 1e-9
                                else ""
                            )
                        ),
                        source="ICAEW P19, EuSpRIG",
                        figure=shown_number(worth) if abs(worth) > 1e-9 else "",
                        figure_unit="left out of the total below it",
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
            detail = (
                f"« {sheet} » is very hidden — invisible in Excel's "
                "unhide menu — but it is empty and nothing in the model "
                "reads it. Most likely left over from an older file "
                "format, and worth deleting rather than fearing."
            )
        elif concealed:
            severity = "error"
            detail = (
                f"« {sheet} » is very hidden — it does not appear in "
                "Excel's unhide menu and can only be reached through "
                "the VBA editor. Whatever it holds feeds the model "
                "without being on any screen."
            )
        else:
            severity = "smell"
            detail = (
                f"« {sheet} » is hidden — it is in the workbook "
                "and one right-click away from visible."
            )
        result.findings.append(
            Finding(
                rule="hidden-sheet",
                severity=severity,
                ref=f"{sheet}!A1",
                sheet=sheet,
                name=sheet,
                detail=detail,
                source="EuSpRIG",
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
