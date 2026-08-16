"""Seeded-break recall test for the analytical checks.

Per the protocol: recall is proven on a copy of a clean model with one
defect introduced programmatically. Two seeded copies of the Dumfries
close model, one break each:

1. `balance`: the « Net assets » cell at BS!L45 moved by +1000 — the
   balance check must report that period.
2. `own-check`: the Audit sheet's own check row given 42 in a zero
   cell — the own-check reader must report it.

Targets are located with the engine's own reader, then edited with
openpyxl on a copy. Seeded files live under `scripts/seeded/`
(gitignored) and are never counted in any precision number.

Usage:  uv run python scripts/seed_break.py
"""

import sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).parent.parent))

from polar.tieout.analytics import run_analytics
from polar.tieout.structure import read_structure
from polar.tieout.workbook import read_workbook

HERE = Path(__file__).parent
SOURCE = HERE / 'corpus_sft' / 'dumfries_model.xlsm'
SEEDED = HERE / 'seeded'


def pick(book, sheet: str, label: str, want_zero: bool) -> str:
    """A coordinate to break, found with the same reader the checks use."""
    for cell in sorted(book.cells.values(), key=lambda c: (c.row, c.column)):
        if cell.sheet != sheet or cell.value is None:
            continue
        if label.lower() not in cell.row_label.strip().lower():
            continue
        value = float(cell.value)
        if want_zero and value != 0:
            continue
        if not want_zero and abs(value) < 1:
            continue
        return cell.ref.split('!', 1)[1]
    raise SystemExit(f'no seedable cell for « {label} » on {sheet}')


def seed(name: str, sheet: str, coordinate: str, value) -> Path:
    SEEDED.mkdir(exist_ok=True)
    out = SEEDED / f'dumfries_{name}.xlsx'
    workbook = openpyxl.load_workbook(str(SOURCE), data_only=True, keep_vba=False)
    cell = workbook[sheet][coordinate]
    before = cell.value
    cell.value = value if not isinstance(before, (int, float)) else value
    print(f'{name}: seeded {sheet}!{coordinate}  {before} -> {cell.value}')
    workbook.save(str(out))
    return out


def expect(path: Path, rule: str, at: str) -> bool:
    """The finding must name the seeded cell — pre-existing findings on
    the same rule do not count as recall."""
    book = read_workbook(str(path))
    analytics = run_analytics(book, read_structure(book))
    fired = [f for f in analytics.findings if f.rule == rule and at in f.ref]
    for finding in fired:
        print(f'  caught [{finding.rule}] {finding.ref}: {finding.detail}')
    return bool(fired)


if __name__ == '__main__':
    source = read_workbook(str(SOURCE))
    passes = True

    where = pick(source, 'BS', 'net assets', want_zero=False)
    broken = float(source.cells[f'BS!{where}'].value) + 1000.0
    seeded = seed('balance', 'BS', where, broken)
    if not expect(seeded, 'balance-sheet', f'BS!{where}'):
        print('  MISSED: the balance check did not catch the seeded break')
        passes = False

    #: A zero cell of the row already proven to hold the zero
    #: convention — Audit row 156 — so the gate admits the seed.
    where = next(
        c.ref.split('!', 1)[1]
        for c in sorted(source.cells.values(), key=lambda c: c.column)
        if c.sheet == 'Audit' and c.row == 156
        and c.value is not None and float(c.value) == 0
    )
    seeded = seed('own-check', 'Audit', where, 42.0)
    if not expect(seeded, 'model-own-check', f'Audit!{where}'):
        print('  MISSED: the own-check reader did not catch the seeded value')
        passes = False

    #: Cash: break a carry mid-life — an opening cell that should
    #: read the previous closing gets 5000 added, in a period with
    #: live carries after it.
    from polar.tieout.structure import read_structure as _rs
    structure = _rs(source)
    seeded_cash = None
    for pair in structure.pairs:
        if pair.sheet != 'Ph2 Calcs' or 'sub debt' not in (pair.label or ''):
            continue
        axis = structure.axes[pair.sheet]
        columns = [c for c, _ in axis.columns]
        middle = columns[len(columns) // 2]
        from openpyxl.utils import get_column_letter
        coordinate = f'{get_column_letter(middle)}{pair.opening_row}'
        cell = source.cells.get(f'{pair.sheet}!{coordinate}')
        if cell is None or cell.value is None:
            continue
        seeded_cash = (pair.sheet, coordinate, float(cell.value) + 5000.0)
        break
    if seeded_cash is None:
        print('  no cash seed target found')
        passes = False
    else:
        seeded = seed('cash', seeded_cash[0], seeded_cash[1], seeded_cash[2])
        if not expect(seeded, 'cash-continuity', seeded_cash[1]):
            print('  MISSED: the cash check did not catch the seeded break')
            passes = False

    #: Debt: an amortising tranche left nonzero — find a closing row on
    #: a debt sheet that declines to zero, and lift its final decline
    #: step so it ends at 4200 instead.
    seeded_debt = None
    for pair in structure.pairs:
        if pair.sheet not in {b.sheet for b in structure.located if b.kind == 'debt-schedule'}:
            continue
        if not pair.label or 'sub debt' not in pair.label:
            continue
        axis = structure.axes[pair.sheet]
        closing = {}
        for c, _ in axis.columns:
            from openpyxl.utils import get_column_letter
            cell = source.cells.get(f'{pair.sheet}!{get_column_letter(c)}{pair.closing_row}')
            if cell is not None and cell.value is not None:
                closing[c] = float(cell.value)
        lived = [c for c in sorted(closing) if abs(closing[c]) > 1]
        if len(lived) < 5:
            continue
        #: The tranche's own last four closings must already decline.
        tail = [closing[c] for c in lived[-4:]]
        if not all(abs(tail[i]) > abs(tail[i + 1]) for i in range(3)):
            continue
        last = lived[-1]
        from openpyxl.utils import get_column_letter
        # every column after the last live one gets the nonzero remnant
        seeded_debt = (pair.sheet, pair.closing_row, last, axis)
        break
    if seeded_debt is None:
        print('  no debt seed target found')
        passes = False
    else:
        sheet, row, last, axis = seeded_debt
        from openpyxl.utils import get_column_letter
        SEEDED.mkdir(exist_ok=True)
        out = SEEDED / 'dumfries_debt.xlsx'
        workbook = openpyxl.load_workbook(str(SOURCE), data_only=True, keep_vba=False)
        page = workbook[sheet]
        #: The remnant must look like what the check exists for: a
        #: balance still amortising at the horizon — strictly declining
        #: and never reaching zero. A flat remnant is (correctly)
        #: rejected by the decline gate; the first seed proved that.
        step = 0
        for c, _ in axis.columns:
            if c >= last:
                cell = page[f'{get_column_letter(c)}{row}']
                if isinstance(cell.value, (int, float)):
                    cell.value = float(cell.value) + 4200.0 * (0.9 ** step)
                    step += 1
        print(f'debt: seeded {sheet} row {row}: +4200 from column {last} on')
        workbook.save(str(out))
        if not expect(out, 'debt-terminal', sheet):
            print('  MISSED: the debt check did not catch the seeded remnant')
            passes = False

    #: Interest: the corpus truth (worklog, 16 August) is that no live
    #: tranche keeps a usable interest row inside its own block —
    #: Dumfries's « Interest rolled up » rows exist but hold zeros. So
    #: the interest seeds carry a DECLARED ENABLING EDIT: sub debt 1's
    #: own empty « Interest rolled up, expensed » row (Ph2 Calcs 984)
    #: is populated at a steady 5% of the opening balance — the
    #: convention the row was built for — and then one defect is
    #: introduced per copy. The enabling edit is part of the seed and
    #: is printed, never hidden; recall is still the claim that the
    #: check catches the defect cell by name.
    sub = next(
        (p for p in structure.pairs
         if p.sheet == 'Ph2 Calcs' and (p.label or '') == 'sub debt 1'),
        None,
    )
    if sub is None:
        print('  no sub debt 1 pair found for the interest seeds')
        passes = False
    else:
        from openpyxl.utils import get_column_letter
        axis = structure.axes[sub.sheet]
        interest_row = 984
        opening_values = {
            c.column: float(c.value)
            for c in source.cells.values()
            if c.sheet == sub.sheet and c.row == sub.opening_row
            and c.value is not None
        }
        live = [c for c, _ in axis.columns if abs(opening_values.get(c, 0.0)) > 0.01]
        after = [c for c, _ in axis.columns if c > live[-1]]

        def enabled(name: str) -> tuple:
            SEEDED.mkdir(exist_ok=True)
            out = SEEDED / f'dumfries_{name}.xlsx'
            workbook = openpyxl.load_workbook(
                str(SOURCE), data_only=True, keep_vba=False
            )
            page = workbook[sub.sheet]
            for c in live:
                page[f'{get_column_letter(c)}{interest_row}'].value = (
                    opening_values[c] * 0.05
                )
            return out, workbook, page

        #: Seed A: one mid-life period charged at 20% against the 5%.
        target = live[len(live) // 2]
        out, workbook, page = enabled('interest-departure')
        coordinate = f'{get_column_letter(target)}{interest_row}'
        page[coordinate].value = opening_values[target] * 0.20
        print(f'interest-departure: enabled 5% on row {interest_row}, '
              f'seeded {sub.sheet}!{coordinate} at 20%')
        workbook.save(str(out))
        if not expect(out, 'interest-consistency', coordinate):
            print('  MISSED: the departure was not caught')
            passes = False

        #: Seed B: interest goes on being charged after the tranche
        #: was repaid.
        if not after:
            print('  no post-repayment column for the interest seed')
            passes = False
        else:
            target = after[min(1, len(after) - 1)]
            out, workbook, page = enabled('interest-after-repayment')
            coordinate = f'{get_column_letter(target)}{interest_row}'
            page[coordinate].value = 500.0
            print(f'interest-after-repayment: enabled 5% on row '
                  f'{interest_row}, seeded {sub.sheet}!{coordinate} = 500')
            workbook.save(str(out))
            if not expect(out, 'interest-consistency', coordinate):
                print('  MISSED: interest after repayment was not caught')
                passes = False

    print('\nrecall:', 'PASS' if passes else 'FAIL')
    sys.exit(0 if passes else 1)
