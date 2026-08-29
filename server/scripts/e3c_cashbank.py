"""Resolve Kelso's `cash bank` against the model, not against arithmetic.

    cd server && uv run python -m scripts.e3c_cashbank MODEL

E3c's one surviving finding says `ReportFinStatsAnnual!82` took the
second half-year alone in year 3, where it sums both halves in 25 other
periods. **Arithmetic cannot tell whether that is a defect or a
convention**, so the round is held rather than decided.

This asks the model instead, and prints the four kinds of evidence that
could settle it without a judgement call:

1. **The formula, if there is one.** Kelso holds 814 formulas in
   470,594 cells. If the annual cell carries one, it says outright
   whether it sums or takes — and if its neighbours in the same row
   carry a different one, that is the defect visible in the authoring.
2. **The row's neighbours.** A sheet publishes a block of lines the
   same way. If every other line in the block sums and this one takes,
   the block's own pattern is the evidence.
3. **The same figure elsewhere.** Kelso publishes cash on several
   sheets. A third view that disagrees with the annual one is decisive.
4. **The model's own check rows.** If a balance check fires in year 3
   and nowhere else, the model has already told us.

Nothing here decides anything. It prints what a person needs to.
"""

import sys
from pathlib import Path
from typing import Any

from polar.tieout.workbook import read_workbook

#: The finding under examination, as E3c reported it.
FINE = ("ReportFinStatsSA", 83)
COARSE = ("ReportFinStatsAnnual", 82)
BREAK_PERIOD = 3


def _cells_on(cells: dict[str, Any], sheet: str, row: int) -> list[Any]:
    return sorted(
        (c for c in cells.values() if c.sheet == sheet and c.row == row),
        key=lambda c: c.column,
    )


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    cells = read_workbook(sys.argv[1]).cells
    print(f"{Path(sys.argv[1]).name}: {len(cells)} cells")

    print("\n=== 1. The coarse row, cell by cell — formula if any")
    coarse = _cells_on(cells, *COARSE)
    for cell in coarse[:14]:
        formula = cell.formula or "(typed value)"
        print(f"   {cell.ref:34s} {str(cell.value)[:16]:18s} {formula[:60]}")

    print("\n=== 2. The rows around it on the same sheet")
    for row in range(COARSE[1] - 3, COARSE[1] + 4):
        found = _cells_on(cells, COARSE[0], row)
        if not found:
            continue
        label = next((c.row_label for c in found if c.row_label), "")
        formulas = {c.formula for c in found if c.formula}
        print(
            f"   row {row:4d} {label[:38]:40s} "
            f"{len(formulas)} distinct formulas"
            + (f"  e.g. {next(iter(formulas))[:40]}" if formulas else "  (values)")
        )

    print("\n=== 3. Every sheet publishing a row labelled like this one")
    label = next(
        (c.row_label for c in _cells_on(cells, *FINE) if c.row_label), "cash bank"
    )
    wanted = label.strip().lower()
    seen: dict[tuple[str, int], str] = {}
    for cell in cells.values():
        if cell.row_label and cell.row_label.strip().lower() == wanted:
            seen.setdefault((cell.sheet, cell.row), cell.row_label)
    for (sheet, row), text in sorted(seen.items()):
        formulas = {c.formula for c in _cells_on(cells, sheet, row) if c.formula}
        print(
            f"   {sheet:30s} row {row:5d}  {text[:26]:28s} "
            + (f"{len(formulas)} formulas" if formulas else "values only")
        )

    print("\n=== 4. The model's own check rows, and whether any fires")
    for cell in cells.values():
        if not cell.row_label or "check" not in cell.row_label.lower():
            continue
        row_cells = _cells_on(cells, cell.sheet, cell.row)
        values = [float(c.value) for c in row_cells if c.value is not None]
        if len(values) < 6:
            continue
        fired = [v for v in values if abs(v) > 0.01]
        if fired:
            print(
                f"   {cell.sheet}!{cell.row} {cell.row_label[:34]!r}: "
                f"{len(fired)} nonzero of {len(values)}, largest {max(map(abs, fired)):,.2f}"
            )
        break
    return 0


if __name__ == "__main__":
    sys.exit(main())
