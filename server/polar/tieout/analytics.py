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
from dataclasses import dataclass
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


@dataclass(frozen=True)
class Abstention:
    """A check that chose not to claim, with the sentence saying why."""

    rule: str
    why: str


@dataclass
class Analytics:
    findings: list[AnalyticFinding]
    abstentions: list[Abstention]


def run_analytics(book: Workbook, structure: Structure) -> Analytics:
    result = Analytics(findings=[], abstentions=[])
    _own_checks(book, structure, result)
    _balance(book, structure, result)
    _time_axis(structure, result)
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

    for key, valued in sorted(rows.items()):
        if len(valued) < ZERO_CELLS:
            continue
        zeros = sum(1 for _, value in valued if value == 0)
        if zeros / len(valued) < ZERO_SHARE:
            continue
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
                )
            )


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
            if abs(difference) <= max(FLOOR, scale * 1e-6):
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
                )
            )


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
    for sheet, axis in structure.axes.items():
        canon = [(column, _canon(label), label) for column, label in axis.columns]
        years = [(column, int(text), label) for column, text, label in canon
                 if year.match(text)]
        for at in range(1, len(years) - 1):
            before, here, after = years[at - 1], years[at], years[at + 1]
            if here[1] < before[1] and after[1] >= before[1]:
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
                    )
                )
                break
