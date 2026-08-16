"""The analytical checks: does the model make sense as statements?

Phase 2 of `docs/pierce/analytical-checks-protocol.md`, built on the
structure layer. The mechanical audit asks whether each cell is built
the way it claims; these ask whether the answer holds together — and
they run on cached values, so they still speak on the values-pasted
copies that close models are issued as, where the mechanical audit is
nearly blind.

**The instrument is the model's own checks.** The design was settled by
measurement, not preference: pairing « Net assets » with « Total
equity » by label produced a 0.86 discrepancy on a published
determination model whose own balance check reads zero — imposed
identities lie even when they look obvious. So the primary check reads
the rows the model itself declares as checks, gated to the ones that
actually hold a zero convention, and the independent identity is only
reported when it does not contradict the model's own verdict — the
protocol's agreement rule, verbatim.

Verified against hands-on reads before anything shipped:
- AFW (published): 226 zero-convention check rows, none firing. The
  gate silences the 875 nonzero flag/counter cells that would have
  been noise.
- Dumfries (issued close copy): its own « check » rows report 329.15
  and 50.92 — real magnitudes in the file a deal closed on.
- Bertha: « MRA first period check » holds a single 1.0 beside a
  « meets target? » flag row — deliberate, and excluded by the
  all-ones rule below.
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal

from .structure import Structure, _canon
from .workbook import Cell, Workbook

#: The tolerance floor, in the model's own working units. The protocol
#: registered 1e-6; the first Dumfries run moved it, under the
#: protocol's own amendment rule (worklog, 15 August): a values-pasted
#: close model carries accumulated rounding walk of ~3e-4 in £000
#: units — about 29 pence on a £779m model — and the old floor
#: measured float noise, not money. 0.01 working units silences
#: rounding residue at any common unit scale while every genuine
#: firing seen to date (0.86, 50.92, 329.15) clears it by orders of
#: magnitude.
FLOOR = 0.01

#: A check row participates only when it holds a zero convention: at
#: least this share of its numeric cells exactly zero. Measured before
#: chosen — flag and counter rows (mostly 1s) fall out here.
ZERO_SHARE = 0.75

#: At least this many numeric cells before a row can claim a
#: convention at all.
ZERO_CELLS = 4

_CHECKISH = re.compile(r"\bcheck\b|\bchk\b|\bchecks\b", re.IGNORECASE)

#: The statement-check catalogue, in the settings screen's own words —
#: the same contract as `audit.RULE_NAMES`: the one place this list
#: lives, so a screen can never invent a check the engine does not run
#: or miss one it does. Keys are the rule strings the findings carry.
ANALYTIC_RULE_NAMES: dict[str, str] = {
    "balance-sheet": "Balance sheet does not balance",
    "cash-continuity": "Cash does not carry forward between periods",
    "debt-terminal": "Debt does not repay to zero at maturity",
    #: The design names only this check's passing sentence; the failure
    #: name is composed in its siblings' shape and flagged as such.
    "interest-consistency": "Interest does not follow the opening balance",
    "model-own-check": "The model's own check rows are firing",
    "time-axis": "Period columns out of order",
}

#: The same checks with their passing sentence — what the « Checks
#: that pass » row says, from the design's own pass list. A check named
#: for its failure (« Cash does not carry forward ») must never appear
#: under a pass heading wearing those words.
ANALYTIC_PASS_NAMES: dict[str, str] = {
    "balance-sheet": "Balance sheet balances every period",
    "cash-continuity": "Cash carries forward",
    "debt-terminal": "Debt schedule repays to zero at maturity",
    "interest-consistency": "Interest accrues on the opening balance",
    "model-own-check": "The model's own checks",
    "time-axis": "Time axis consistent across sheets",
}

#: The answer to « says who », per rule — the short citation the
#: finding's `standard` column carries, in the design's own printing.
ANALYTIC_STANDARDS: dict[str, str] = {
    "balance-sheet": "ICAEW 8",
    "cash-continuity": "ICAEW 8",
    "debt-terminal": "FAST C4",
    "interest-consistency": "FAST C4",
    "model-own-check": "Own checks",
    "time-axis": "FAST B1",
}

#: The same answer spelled out — the sentence the finding's modal
#: shows under the claim. Rides in the finding's evidence.
ANALYTIC_STANDARD_SENTENCES: dict[str, str] = {
    "balance-sheet": (
        "ICAEW Twenty Principles, 8: the statements must reconcile "
        "to each other in every period."
    ),
    "cash-continuity": (
        "ICAEW Twenty Principles, 8: a balance carried between periods "
        "must be the same number on both sides of the join."
    ),
    "debt-terminal": (
        "FAST Standard C4: a debt schedule repays in full by its "
        "maturity date."
    ),
    "interest-consistency": (
        "FAST Standard C4: interest accrues on the balance it is "
        "charged on, at the schedule's own rate."
    ),
    "model-own-check": (
        "The model's own convention: a check row shows zero when the "
        "model agrees with itself."
    ),
    "time-axis": (
        "FAST Standard B1: one time axis, running in order, shared by "
        "every sheet."
    ),
}


@dataclass(frozen=True)
class AnalyticFinding:
    """One analytical finding, in the protocol's own sentence shape."""

    rule: str  # 'model-own-check' | 'balance-sheet' | 'time-axis'
    sheet: str
    ref: str
    row_label: str
    #: The period the cell sits in, in the sheet's own printing —
    #: empty when the sheet has no axis.
    period: str
    value: float
    #: The claim, ready for a screen.
    detail: str
    #: The headline number, printed — the one figure the card leads
    #: with — and the phrase that says what it is. Both composed here,
    #: where the measured values are in scope, never on a screen.
    figure: str = ""
    figure_unit: str = ""


@dataclass(frozen=True)
class Abstention:
    """A check that chose not to claim, with the sentence saying why."""

    rule: str
    why: str


@dataclass
class Analytics:
    findings: list[AnalyticFinding]
    abstentions: list[Abstention]
    #: What each check examined and how much of it was clean — real
    #: counters from the walks below, so a pass row can say « 223 of
    #: 226 rows clean » and mean it. Keyed by rule; absent means the
    #: check examined nothing it could count.
    tallies: dict[str, dict[str, int]] = field(default_factory=dict)


def run_analytics(book: Workbook, structure: Structure) -> Analytics:
    result = Analytics(findings=[], abstentions=[])
    _own_checks(book, structure, result)
    _balance(book, structure, result)
    _time_axis(structure, result)
    _cash_continuity(book, structure, result)
    _debt_terminal(book, structure, result)
    _interest_consistency(book, structure, result)
    return result


# --- the model's own checks ----------------------------------------------


def _own_checks(book: Workbook, structure: Structure, result: Analytics) -> None:
    """Rows the model itself declares as checks, evaluated on their own
    zero convention.

    A row joins when its label says check, it has at least ZERO_CELLS
    numeric cells, at least ZERO_SHARE of them are exactly zero, and
    its nonzero cells are not all ±1 — a row of zeros with a single 1
    is a period flag, not a failed check (Bertha's « MRA first period
    check », read by hand, sits beside its « meets target? » flag row).
    Every surviving nonzero cell above the floor is the model's own
    verdict, quoted: the row's label, the cell, the value.
    """
    rows: dict[tuple[str, int], list[tuple[Cell, float]]] = {}
    labels: dict[tuple[str, int], str] = {}
    for cell in book.cells.values():
        label = cell.row_label.strip()
        if not label or not _CHECKISH.search(label):
            continue
        if cell.value is None or not isinstance(cell.value, Decimal):
            continue
        key = (cell.sheet, cell.row)
        rows.setdefault(key, []).append((cell, float(cell.value)))
        labels.setdefault(key, label)

    examined = clean = 0
    for key, valued in sorted(rows.items()):
        if len(valued) < ZERO_CELLS:
            continue
        zeros = sum(1 for _, value in valued if value == 0)
        if zeros / len(valued) < ZERO_SHARE:
            continue
        examined += 1
        #: ±1 in a zero row is a flag wherever it sits — Bertha's first-
        #: period marker, Ayrshire's counter column beside real
        #: magnitudes. Excluded per cell, not per row: a £1 check
        #: difference is floor-adjacent and worth losing for the
        #: flag-noise it removes.
        fired = [
            (cell, value)
            for cell, value in valued
            if abs(value) > FLOOR and abs(abs(value) - 1.0) > 1e-12
        ]
        if not fired:
            clean += 1
            continue
        sheet, _ = key
        axis = structure.axes.get(sheet)
        for cell, value in fired:
            period = ''
            if axis is not None:
                for column, printed in axis.columns:
                    if column == cell.column:
                        period = printed
                        break
            result.findings.append(
                AnalyticFinding(
                    rule='model-own-check',
                    sheet=sheet,
                    ref=cell.ref,
                    row_label=labels[key],
                    period=period,
                    value=value,
                    detail=(
                        f"The model's own check row « {labels[key]} » reports "
                        f"{value:,.4g}"
                        + (f' in {period}' if period else '')
                        + ' — a row that is zero everywhere else.'
                    ),
                    figure=f'{value:,.4g}',
                    figure_unit=(
                        f"on the model's own « {labels[key]} » row, "
                        'built to read zero'
                    ),
                )
            )
    if examined:
        result.tallies['model-own-check'] = {'total': examined, 'clean': clean}


# --- the balance sheet ---------------------------------------------------

_NET_ASSETS = re.compile(r"^net assets\b", re.IGNORECASE)
_EQUITY = re.compile(
    r"^(?:total equity|shareholders'? funds?)\b", re.IGNORECASE
)


def _balance(book: Workbook, structure: Structure, result: Analytics) -> None:
    """Assets against equity, in the model's own presentation — and
    only where the model's own verdict does not contradict ours.

    The identity is computed per located balance sheet, from exactly
    one net-assets row and one equity row; two candidates for either
    side is an abstention, not a coin toss. Where the model carries a
    zero-convention check row on the same sheet, its verdict wins: our
    difference above tolerance against their zero is the protocol's
    named abstention, because a model that passes its own check while
    failing our pairing means our pairing measured the wrong two rows
    (seen on AFW: 0.86 apart on rows whose own check reads zero).
    """
    located = [one for one in structure.located if one.kind == 'balance-sheet']
    if not located:
        result.abstentions.append(
            Abstention('balance-sheet', 'No balance sheet was located.')
        )
        return

    compared = agreeing = 0
    for block in located:
        cells = [c for c in book.cells.values() if c.sheet == block.sheet]
        net_rows = sorted(
            {c.row for c in cells if _NET_ASSETS.match(c.row_label.strip())}
        )
        equity_rows = sorted(
            {c.row for c in cells if _EQUITY.match(c.row_label.strip())}
        )
        if len(net_rows) != 1 or len(equity_rows) != 1:
            result.abstentions.append(
                Abstention(
                    'balance-sheet',
                    f'{block.sheet}: the net-assets and equity rows are not '
                    f'unique ({len(net_rows)} and {len(equity_rows)} candidates) '
                    '— not paired, not guessed.',
                )
            )
            continue

        net = {c.column: float(c.value) for c in cells
               if c.row == net_rows[0] and isinstance(c.value, Decimal)}
        equity = {c.column: float(c.value) for c in cells
                  if c.row == equity_rows[0] and isinstance(c.value, Decimal)}
        axis = structure.axes.get(block.sheet)
        shared = sorted(set(net) & set(equity))
        if not shared:
            result.abstentions.append(
                Abstention(
                    'balance-sheet',
                    f'{block.sheet}: the paired rows share no valued periods.',
                )
            )
            continue

        #: The model's own verdict — anywhere in the workbook. AFW and
        #: WSX keep « FinStat - BS - <statement> - check overall » on a
        #: checks sheet, reading zero, while their retail statements
        #: sit a constant off our pairing from FY2031 on: the protocol's
        #: agreement rule says their check wins and we abstain by name.
        own_zero = _sheet_has_passing_check(book, block.sheet) or (
            _workbook_balance_check_passes(book)
        )

        for column in shared:
            difference = net[column] - equity[column]
            scale = max(abs(net[column]), abs(equity[column]), 1.0)
            compared += 1
            if abs(difference) <= max(FLOOR, scale * 1e-6):
                agreeing += 1
                continue
            if own_zero:
                result.abstentions.append(
                    Abstention(
                        'balance-sheet',
                        f'{block.sheet}: our arithmetic and the model\'s own '
                        'check row disagree — not reported.',
                    )
                )
                break
            period = ''
            if axis is not None:
                for at, printed in axis.columns:
                    if at == column:
                        period = printed
                        break
            from openpyxl.utils import get_column_letter

            result.findings.append(
                AnalyticFinding(
                    rule='balance-sheet',
                    sheet=block.sheet,
                    ref=f'{block.sheet}!{get_column_letter(column)}{net_rows[0]}',
                    row_label='Net assets against equity',
                    period=period,
                    value=difference,
                    detail=(
                        'The balance sheet does not balance'
                        + (f' in {period}' if period else '')
                        + f': net assets and equity differ by {difference:,.6g}.'
                    ),
                    figure=f'{abs(difference):,.6g}',
                    figure_unit=(
                        'between net assets and equity'
                        + (f' in {period}' if period else '')
                    ),
                )
            )
    if compared:
        result.tallies['balance-sheet'] = {
            'total': compared,
            'clean': agreeing,
        }


def _workbook_balance_check_passes(book: Workbook) -> bool:
    """Does the workbook keep its own balance-flavoured check rows, all
    clean? Zero-convention rows whose label says balance (or BS), read
    anywhere — the checks sheet included. One firing row returns False:
    a fired balance check is the own-check rule's finding, and the
    independent identity stays out of its way either way.
    """
    balanceish = re.compile(r"\bbalance\b|\bbs\b", re.IGNORECASE)
    rows: dict[tuple[str, int], list[float]] = {}
    for cell in book.cells.values():
        if cell.value is None or not isinstance(cell.value, Decimal):
            continue
        label = cell.row_label
        if not _CHECKISH.search(label) or not balanceish.search(label):
            continue
        rows.setdefault((cell.sheet, cell.row), []).append(float(cell.value))
    found = False
    for values in rows.values():
        if len(values) < ZERO_CELLS:
            continue
        zeros = sum(1 for value in values if value == 0)
        if zeros / len(values) < ZERO_SHARE:
            continue
        if all(abs(value) <= FLOOR for value in values):
            found = True
        else:
            return False
    return found


def _sheet_has_passing_check(book: Workbook, sheet: str) -> bool:
    """Does this sheet carry its own zero-convention check row, and is
    it clean? Used as the agreement gate, never as a finding."""
    rows: dict[int, list[float]] = {}
    for cell in book.cells.values():
        if cell.sheet != sheet or cell.value is None:
            continue
        if not isinstance(cell.value, Decimal):
            continue
        if not _CHECKISH.search(cell.row_label):
            continue
        rows.setdefault(cell.row, []).append(float(cell.value))
    for values in rows.values():
        if len(values) < ZERO_CELLS:
            continue
        zeros = sum(1 for value in values if value == 0)
        if zeros / len(values) < ZERO_SHARE:
            continue
        if all(abs(value) <= FLOOR for value in values):
            return True
    return False


# --- the time axis -------------------------------------------------------


def _time_axis(structure: Structure, result: Analytics) -> None:
    """A period column that dips out of order inside its own run.

    In-sheet only, deliberately: cross-sheet column alignment needs
    anchor dates, a later round. And a step *backwards that stays
    down* is not a defect either — Dumfries' Initial Budget carries
    two period blocks side by side, FY2019… then FY2019… again, which
    is layout (hand-read, 15 August). What the check claims is the
    narrow thing that cannot be layout: a single column out of order
    inside an otherwise monotone run — FY2026, FY2027, FY2025,
    FY2028 — where the run resumes as if the dip were not there.
    """
    year = re.compile(r"^(?:19|20)\d{2}$")
    examined = clean = 0
    for sheet, axis in structure.axes.items():
        canon = [(column, _canon(label), label) for column, label in axis.columns]
        years = [(column, int(text), label) for column, text, label in canon
                 if year.match(text)]
        if len(years) >= 3:
            examined += 1
        fired = False
        for at in range(1, len(years) - 1):
            before, here, after = years[at - 1], years[at], years[at + 1]
            if here[1] < before[1] and after[1] >= before[1]:
                fired = True
                result.findings.append(
                    AnalyticFinding(
                        rule='time-axis',
                        sheet=sheet,
                        ref=f'{sheet}!{here[0]}',
                        row_label='Period order',
                        period=here[2],
                        value=float(here[1] - before[1]),
                        detail=(
                            f'{sheet}\'s period columns dip out of order: '
                            f'« {here[2]} » sits between « {before[2]} » and '
                            f'« {after[2]} ».'
                        ),
                        figure=here[2],
                        figure_unit=(
                            f'between « {before[2]} » and « {after[2]} »'
                        ),
                    )
                )
                break
        if len(years) >= 3 and not fired:
            clean += 1
    if examined:
        result.tallies['time-axis'] = {'total': examined, 'clean': clean}


# --- cash tie-through -----------------------------------------------------

#: A pair is only walked when it behaves like a carry: at least this
#: share of its adjacent-column comparisons agree. A genuinely broken
#: link breaks in one or a few periods; a pair that disagrees half the
#: time is a mispairing, and flagging it would be our error published
#: as the model's.
CARRY_AGREEMENT = 0.8

#: And at least this many comparable adjacent columns before the pair
#: can claim anything.
CARRY_COLUMNS = 4


def _cash_continuity(book: Workbook, structure: Structure, result: Analytics) -> None:
    """Closing balance in one period must be opening in the next.

    Walks every pair the structure layer found — vocabulary and formula
    alike — column by column along the sheet's own axis, comparing the
    previous column's closing value with this column's opening value.
    Values, not formulas, so it speaks on values-pasted files, and it
    is exactly the check that catches the error nothing mechanical can
    see: a healthy-looking formula pointing at the wrong place shows up
    only as cash that does not carry.

    Three gates, all structural:
    - Comparisons stay inside one monotone segment of the axis — the
      side-by-side blocks of a budget sheet never compare across.
    - A pair claims nothing until CARRY_AGREEMENT of its comparisons
      agree: broken links are isolated; wholesale disagreement means
      the pairing itself is wrong, which is our abstention, not the
      model's finding.
    - The protocol tolerance, floor and relative part both.
    """
    if not structure.pairs:
        result.abstentions.append(
            Abstention('cash-continuity', 'No opening/closing pairs were found.')
        )
        return

    year = re.compile(r"^(?:19|20)\d{2}$")
    walked = carried = 0
    for pair in structure.pairs:
        axis = structure.axes.get(pair.sheet)
        if axis is None:
            continue
        opening: dict[int, float] = {}
        closing: dict[int, float] = {}
        for cell in book.cells.values():
            if cell.sheet != pair.sheet or not isinstance(cell.value, Decimal):
                continue
            if cell.row == pair.opening_row:
                opening[cell.column] = float(cell.value)
            elif cell.row == pair.closing_row:
                closing[cell.column] = float(cell.value)

        #: Adjacent axis columns, never across a backwards step — the
        #: segment boundary of a side-by-side layout.
        steps: list[tuple[int, int, str]] = []
        columns = list(axis.columns)
        for at in range(1, len(columns)):
            previous_column, previous_label = columns[at - 1]
            column, label = columns[at]
            canon_prev, canon_here = _canon(previous_label), _canon(label)
            if (
                year.match(canon_prev)
                and year.match(canon_here)
                and int(canon_here) < int(canon_prev)
            ):
                continue
            steps.append((previous_column, column, label))

        breaks: list[tuple[int, int, str, float, float]] = []
        agreed = 0
        live_agreements: list[int] = []
        for previous_column, column, label in steps:
            was = closing.get(previous_column)
            now = opening.get(column)
            if was is None or now is None:
                continue
            scale = max(abs(was), abs(now), 1.0)
            if abs(now - was) <= max(FLOOR, scale * 1e-6):
                agreed += 1
                #: An agreement between zeros is dormancy, not a carry.
                if abs(was) > FLOOR or abs(now) > FLOOR:
                    live_agreements.append(column)
            else:
                breaks.append((previous_column, column, label, was, now))

        #: A real broken link is a gap the carry *resumes after* — a
        #: live agreement beyond the break. An account that never
        #: carries again is winding down: Anderson's construction cash
        #: agrees for years, sweeps out over two settlement periods and
        #: goes dormant (hand-read, 15 August); nothing there is a
        #: defect, and zero-against-zero tails do not count as life.
        breaks = [
            one
            for one in breaks
            if any(later > one[1] for later in live_agreements)
        ]

        compared = agreed + len(breaks)
        if compared < CARRY_COLUMNS:
            continue
        if not breaks:
            walked += 1
            carried += 1
            continue
        if agreed / compared < CARRY_AGREEMENT:
            #: Wholesale disagreement is a mispairing — ours, not the
            #: model's. One abstention per pair, named.
            result.abstentions.append(
                Abstention(
                    'cash-continuity',
                    f'{pair.sheet} rows {pair.opening_row}/{pair.closing_row} '
                    f'(« {pair.label} »): {len(breaks)} of {compared} periods '
                    'disagree — treated as a mispairing, not reported.',
                )
            )
            continue
        walked += 1
        from openpyxl.utils import get_column_letter

        for previous_column, column, label, was, now in breaks:
            result.findings.append(
                AnalyticFinding(
                    rule='cash-continuity',
                    sheet=pair.sheet,
                    ref=f'{pair.sheet}!{get_column_letter(column)}{pair.opening_row}',
                    row_label=pair.label or 'balance',
                    period=label,
                    value=now - was,
                    detail=(
                        f'« {pair.label or "This account"} » does not carry '
                        f'forward into {label}: closing {was:,.6g} against '
                        f'opening {now:,.6g}.'
                    ),
                    figure=f'{was:,.6g}',
                    figure_unit=(
                        f'closing, while {label} opens at {now:,.6g}'
                    ),
                )
            )
    if walked:
        result.tallies['cash-continuity'] = {
            'total': walked,
            'clean': carried,
        }


# --- debt repays to zero --------------------------------------------------

_DEBTISH_LABEL = re.compile(
    r"\b(?:debt|loan|senior|sub[- ]?debt|bond|tranche|facilit|mezz)\b",
    re.IGNORECASE,
)

#: A tranche only claims « ends nonzero » when its balance was walking
#: down — at least this many strictly-declining closing values before
#: the end. A revolver fluctuates and is not a repayment profile.
DECLINE_STEPS = 3


def _debt_terminal(book: Workbook, structure: Structure, result: Analytics) -> None:
    """A repaying tranche whose balance does not reach zero.

    Scope: pairs on located debt-machinery sheets whose label reads as
    debt. The claim is narrow by construction — the balance must have
    been amortising (DECLINE_STEPS strictly-declining closings into the
    end of the axis) and still end above tolerance relative to its own
    peak. A tranche that reaches zero and stays there passes; one that
    fluctuates to the end is a revolver and abstains silently; one
    still amortising at the model's horizon may simply outlive the
    model, which the declining gate cannot tell apart from a broken
    repayment — so the finding quotes the peak, and the reader judges.
    """
    debt_sheets = {
        block.sheet for block in structure.located if block.kind == 'debt-schedule'
    }
    if not debt_sheets:
        result.abstentions.append(
            Abstention('debt-terminal', 'No debt schedule was located.')
        )
        return

    from openpyxl.utils import get_column_letter

    judged = repaid = 0
    for pair in structure.pairs:
        if pair.sheet not in debt_sheets:
            continue
        if pair.label and not _DEBTISH_LABEL.search(pair.label):
            continue
        axis = structure.axes.get(pair.sheet)
        if axis is None:
            continue
        closing = {
            cell.column: float(cell.value)
            for cell in book.cells.values()
            if cell.sheet == pair.sheet
            and cell.row == pair.closing_row
            and isinstance(cell.value, Decimal)
        }
        series = [
            closing[column] for column, _ in axis.columns if column in closing
        ]
        if len(series) < DECLINE_STEPS + 2:
            continue
        peak = max(abs(value) for value in series)
        if peak <= FLOOR:
            continue
        terminal = series[-1]
        if abs(terminal) <= max(FLOOR, peak * 1e-6):
            judged += 1
            repaid += 1
            continue
        #: Was it amortising into the end? Strictly-declining magnitudes
        #: over the last DECLINE_STEPS+1 values.
        tail = series[-(DECLINE_STEPS + 1):]
        declining = all(
            abs(tail[at]) > abs(tail[at + 1]) for at in range(len(tail) - 1)
        )
        if not declining:
            #: A revolver — fluctuating to the end. Not judged either
            #: way, so it joins neither count: the pass row must only
            #: claim tranches the check actually followed down.
            continue
        judged += 1
        last_column = [column for column, _ in axis.columns if column in closing][-1]
        last_label = dict(axis.columns).get(last_column, '')
        result.findings.append(
            AnalyticFinding(
                rule='debt-terminal',
                sheet=pair.sheet,
                ref=f'{pair.sheet}!{get_column_letter(last_column)}{pair.closing_row}',
                row_label=pair.label or 'debt balance',
                period=last_label,
                value=terminal,
                detail=(
                    f'« {pair.label or "This tranche"} » amortises to the end '
                    f'of the model but finishes at {terminal:,.6g}, not zero'
                    + (f' ({last_label})' if last_label else '')
                    + f' — against a peak of {peak:,.6g}.'
                ),
                figure=f'{abs(terminal):,.6g}',
                figure_unit=(
                    'still outstanding at '
                    + (last_label or 'the end of the model')
                    + f', against a peak of {peak:,.6g}'
                ),
            )
        )
    if judged:
        result.tallies['debt-terminal'] = {'total': judged, 'clean': repaid}


# --- interest self-consistency --------------------------------------------

#: An interest *amount* row: says interest, and is not a rate row.
_INTERESTISH = re.compile(r"\binterest\b", re.IGNORECASE)
_RATE_ROW = re.compile(r"\brate\b|\bindex\b|%", re.IGNORECASE)

#: The registered gates (protocol, 16 August): a convention needs this
#: many rated periods to exist, stands when three quarters of them sit
#: inside the ±50% band around the median implied rate, and only a
#: factor-of-three departure from that median may be claimed — wide
#: enough that no real rate reset or floating drift can reach it.
RATED_PERIODS = 6
CONVENTION_BAND = 1.5
CONVENTION_SHARE = 0.75
DEPARTURE_FACTOR = 3.0


def _interest_consistency(
    book: Workbook, structure: Structure, result: Analytics
) -> None:
    """Interest against the model's own convention — never a textbook's.

    For each debt tranche, the implied per-period rate is
    |interest| / |opening|; the median of those rates *is* the model's
    convention, so floating rates, indexation and sub-annual periods
    all carry their own baseline. Two claims only, both registered
    before any survey ran: a rated period a factor of three off the
    tranche's own median, and interest charged after the tranche's
    last live balance. Zero-interest periods with a live balance are
    deliberately not claimed — semi-annual interest inside a monthly
    model produces them by convention.
    """
    debt_sheets = {
        block.sheet for block in structure.located if block.kind == 'debt-schedule'
    }
    if not debt_sheets:
        result.abstentions.append(
            Abstention('interest-consistency', 'No debt schedule was located.')
        )
        return

    from statistics import median

    from openpyxl.utils import get_column_letter

    judged = clean = 0
    for pair in structure.pairs:
        if pair.sheet not in debt_sheets:
            continue
        if pair.label and not _DEBTISH_LABEL.search(pair.label):
            continue
        axis = structure.axes.get(pair.sheet)
        if axis is None:
            continue

        #: The association gate: exactly one *live* interest-amount row
        #: strictly between the pair's own rows, or nothing is claimed.
        #: Live means at least one value above FLOOR — Dumfries's
        #: sub-debt corkscrew keeps two interest rows that are all
        #: zeros, and an empty row is presentation, not an interest row
        #: in use (amendment to the registration, worklog 16 August).
        #: A pair with no live interest row at all is silence, not an
        #: abstention: its interest simply lives elsewhere, and nothing
        #: was measured or declined (same amendment).
        low, high = sorted((pair.opening_row, pair.closing_row))
        opening: dict[int, float] = {}
        by_row: dict[int, dict[int, float]] = {}
        row_names: dict[int, str] = {}
        for cell in book.cells.values():
            if cell.sheet != pair.sheet or not isinstance(cell.value, Decimal):
                continue
            if cell.row == pair.opening_row:
                opening[cell.column] = float(cell.value)
            elif low < cell.row < high:
                label = cell.row_label.strip()
                if not label or not _INTERESTISH.search(label):
                    continue
                if _RATE_ROW.search(label):
                    continue
                by_row.setdefault(cell.row, {})[cell.column] = float(cell.value)
                row_names.setdefault(cell.row, label)
        live_rows = [
            row
            for row, cells_of in by_row.items()
            if any(abs(value) > FLOOR for value in cells_of.values())
        ]
        if len(live_rows) != 1:
            if len(live_rows) > 1:
                result.abstentions.append(
                    Abstention(
                        'interest-consistency',
                        f'{pair.sheet} « {pair.label} »: '
                        f'{len(live_rows)} interest rows inside the tranche '
                        '— no single row associates, not guessed.',
                    )
                )
            continue
        interest_row = live_rows[0]
        interest = by_row[interest_row]
        interest_label = row_names[interest_row]

        columns = [column for column, _ in axis.columns]
        labels = dict(axis.columns)
        rated: list[tuple[int, float]] = []
        for column in columns:
            balance = opening.get(column)
            charged = interest.get(column)
            if balance is None or charged is None:
                continue
            if abs(balance) > FLOOR and abs(charged) > FLOOR:
                rated.append((column, abs(charged) / abs(balance)))
        if len(rated) < RATED_PERIODS:
            #: An associated tranche too short to have a convention —
            #: the registration's named abstention, so the coverage
            #: list says why nothing was claimed about a row that does
            #: exist and does carry interest.
            result.abstentions.append(
                Abstention(
                    'interest-consistency',
                    f'{pair.sheet} « {pair.label} »: only {len(rated)} '
                    f'rated period{"s" if len(rated) != 1 else ""} — too '
                    'short to have a convention.',
                )
            )
            continue
        judged += 1
        convention = median(rate for _, rate in rated)
        agreeing = sum(
            1
            for _, rate in rated
            if convention / CONVENTION_BAND <= rate <= convention * CONVENTION_BAND
        )
        if agreeing / len(rated) < CONVENTION_SHARE:
            judged -= 1
            result.abstentions.append(
                Abstention(
                    'interest-consistency',
                    f'{pair.sheet} « {pair.label} »: no stable interest '
                    f'convention ({agreeing} of {len(rated)} periods agree) '
                    '— nothing measured against a convention that does '
                    'not exist.',
                )
            )
            continue

        fired = False
        for column, rate in rated:
            if (
                rate <= convention * DEPARTURE_FACTOR
                and rate >= convention / DEPARTURE_FACTOR
            ):
                continue
            fired = True
            period = labels.get(column, '')
            result.findings.append(
                AnalyticFinding(
                    rule='interest-consistency',
                    sheet=pair.sheet,
                    ref=f'{pair.sheet}!{get_column_letter(column)}{interest_row}',
                    row_label=interest_label,
                    period=period,
                    value=rate,
                    detail=(
                        f'« {interest_label} » implies a rate of '
                        f'{rate * 100:,.3g}%'
                        + (f' in {period}' if period else '')
                        + f" against the schedule's own "
                        f'{convention * 100:,.3g}% — a factor of '
                        f'{max(rate / convention, convention / rate):,.1f} off '
                        'its own convention.'
                    ),
                    figure=f'{rate * 100:,.3g}%',
                    figure_unit=(
                        'implied'
                        + (f' in {period}' if period else '')
                        + f", against the schedule's own "
                        f'{convention * 100:,.3g}%'
                    ),
                )
            )

        #: Interest on nothing: charged after the last live balance.
        live = [column for column in columns if abs(opening.get(column, 0.0)) > FLOOR]
        if live:
            last_live = live[-1]
            for column in columns:
                if column <= last_live:
                    continue
                charged = interest.get(column)
                if charged is None or abs(charged) <= FLOOR:
                    continue
                fired = True
                period = labels.get(column, '')
                result.findings.append(
                    AnalyticFinding(
                        rule='interest-consistency',
                        sheet=pair.sheet,
                        ref=(
                            f'{pair.sheet}!'
                            f'{get_column_letter(column)}{interest_row}'
                        ),
                        row_label=interest_label,
                        period=period,
                        value=charged,
                        detail=(
                            f'« {interest_label} » charges {abs(charged):,.6g}'
                            + (f' in {period}' if period else '')
                            + ' — after the tranche was repaid.'
                        ),
                        figure=f'{abs(charged):,.6g}',
                        figure_unit=(
                            'of interest'
                            + (f' in {period}' if period else '')
                            + ', after the tranche was repaid'
                        ),
                    )
                )
        if not fired:
            clean += 1
    if judged:
        result.tallies['interest-consistency'] = {
            'total': judged,
            'clean': clean,
        }
