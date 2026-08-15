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

    print('\nrecall:', 'PASS' if passes else 'FAIL')
    sys.exit(0 if passes else 1)
