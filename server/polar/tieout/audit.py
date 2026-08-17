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

#: Functions that recalculate on every change or address cells by string.
#: Discouraged by FAST and SMART because they make a model slow and its
#: dependency graph unreadable — including to this package.
VOLATILE = frozenset({"OFFSET", "INDIRECT", "NOW", "TODAY", "RAND", "RANDBETWEEN"})

#: Numbers that carry no assumption. A sign flip, a percentage conversion,
#: a count of months or days, the two in a mean. Flagging these is how a
#: hardcode check earns a reputation for noise and stops being read.
INNOCENT = frozenset({0, 1, 2, -1, 10, 12, 24, 52, 100, 360, 365, 1000, 1000000})

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

    sentence = {
        "error-value": (
            f"{at} shows an error value instead of a number, and "
            "everything reading it calculates on top of the error."
        ),
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
    return _typed_blocks(keep)


def _typed_blocks(findings: list[Finding]) -> list[Finding]:
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
        #: the beat alone: at least three places at a constant spacing
        #: is a repeating block, whatever each block calls its line.
        rest.sort(key=_row)
        deltas = {
            _row(after) - _row(before)
            for before, after in zip(rest, rest[1:], strict=False)
        }
        if len(rest) >= 3 and len(deltas) == 1:
            keep.append(_fold(rest))
        else:
            keep.extend(rest)
    return keep


def _error_values(book: Workbook, result: Audit) -> None:
    for ref, value in book.errors.items():
        broken = value in BROKEN
        result.findings.append(
            Finding(
                rule="error-value",
                severity="error" if broken else "smell",
                ref=ref,
                sheet=ref.split("!")[0],
                name="",
                detail=(
                    f"shows {value}"
                    + ("" if broken else " — routine in a template with empty inputs")
                ),
                source="ICAEW P19",
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


def _long_formulas(book: Workbook, result: Audit) -> None:
    for cell in book.cells.values():
        if cell.formula and len(cell.formula) > LONG_FORMULA:
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
        buried = _buried(cell.formula)
        if buried:
            result.findings.append(
                Finding(
                    rule="hardcode-in-formula",
                    severity="smell",
                    ref=cell.ref,
                    sheet=cell.sheet,
                    name=cell.name,
                    detail=f"{', '.join(buried[:4])} inside {cell.formula[:60]}",
                    source="ICAEW P14, FAST",
                    figure=", ".join(buried[:2]),
                )
            )


def _buried(formula: str) -> tuple[str, ...]:
    """The assumption-shaped numbers typed inside a formula — the
    decision the hardcode rule is about, and therefore the identity the
    collapse groups by."""
    found: list[str] = []
    for token in Tokenizer(formula).items:
        if token.type != "OPERAND" or token.subtype != "NUMBER":
            continue
        try:
            number = float(token.value)
        except ValueError:
            continue
        if number in INNOCENT or (number.is_integer() and abs(number) <= 4):
            continue
        found.append(token.value)
    return tuple(found)


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
                elif cell is not run[0] and cell is not run[-1]:
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
            and all(
                leftmost.get((sheet, cell.row), 1 << 20) < cell.column
                for cell in island
            )
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

    colour: dict[str, int] = {}
    for start in book.cells:
        if colour.get(start):
            continue
        stack: list[tuple[str, int]] = [(start, 0)]
        path: list[str] = []
        while stack:
            ref, index = stack.pop()
            if index == 0:
                if colour.get(ref) == 2:
                    continue
                if colour.get(ref) == 1:
                    cycle = path[path.index(ref) :] if ref in path else [ref]
                    result.findings.append(
                        Finding(
                            rule="circular",
                            severity="error",
                            ref=ref,
                            sheet=ref.split("!")[0],
                            name=(cell.name if (cell := book.get(ref)) else ""),
                            detail=" → ".join(cycle[:6]) + " → …",
                            source="ICAEW P16, FAST",
                        )
                    )
                    continue
                colour[ref] = 1
                path.append(ref)
            cell = book.get(ref)
            children = cell.precedents if cell else ()
            if index < len(children):
                stack.append((ref, index + 1))
                stack.append((children[index], 0))
            else:
                colour[ref] = 2
                if path and path[-1] == ref:
                    path.pop()


def _skipped_cells(book: Workbook, result: Audit) -> None:
    """A total that leaves a row out.

    `=SUM(D20:D23)` under a block that runs to row 24 is the error every
    published catalogue of spreadsheet disasters opens with, and it is
    invisible: the total looks like a total. Checked by walking up from the
    summed range and asking whether the cell immediately above it holds a
    number that the range does not reach.
    """
    for cell in book.cells.values():
        if not cell.formula or "SUM(" not in cell.formula.upper():
            continue
        for token in Tokenizer(cell.formula).items:
            if token.type != "OPERAND" or token.subtype != "RANGE":
                continue
            match = REFERENCE.fullmatch(token.value.strip())
            if match is None or match.group("row2") is None:
                continue
            if match.group("column") != match.group("column2"):
                continue
            sheet = (match.group("sheet") or cell.sheet).strip("'")
            top = min(int(match.group("row")), int(match.group("row2")))
            bottom = max(int(match.group("row")), int(match.group("row2")))
            if not (top <= cell.row and bottom < cell.row and sheet == cell.sheet):
                continue
            column = match.group("column")
            missed = [
                f"{sheet}!{column}{row}"
                for row in range(bottom + 1, cell.row)
                if f"{sheet}!{column}{row}" in book.cells
            ]
            if missed:
                #: What the misses are worth, straight from the cells —
                #: the number the founder's design leads the card with.
                worth = sum(float(book.cells[ref].value or 0) for ref in missed)
                result.findings.append(
                    Finding(
                        rule="skipped-cell",
                        severity="error",
                        ref=cell.ref,
                        sheet=cell.sheet,
                        name=cell.name,
                        detail=(
                            f"{cell.formula} leaves out "
                            f"{', '.join(missed[:3])} above it"
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
        result.findings.append(
            Finding(
                rule="hidden-sheet",
                severity="error" if concealed else "smell",
                ref=f"{sheet}!A1",
                sheet=sheet,
                name=sheet,
                detail=(
                    f"« {sheet} » is very hidden — it does not appear in "
                    "Excel's unhide menu and can only be reached through "
                    "the VBA editor. Whatever it holds feeds the model "
                    "without being on any screen."
                    if concealed
                    else f"« {sheet} » is hidden — it is in the workbook "
                    "and one right-click away from visible."
                ),
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
