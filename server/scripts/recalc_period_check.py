"""Period from aggregation, measured — with its plant.

    cd server && uv run python -m scripts.recalc_period_check MODEL.xlsx [OUT.json]

Predictions registered before this ran (lane log, 28 Aug):

1. Kelso's monthly-to-annual aggregations are **detectable** — at
   least one annual row takes exactly twelve monthly cells. If none
   is, the structural signal is not there and the design fails at
   step one, which is worth one afternoon rather than a check built
   on top of it.
2. **Zero defects on Kelso.** It is a published financial-close
   model that banks lent against; a check that finds real defects in
   it is far likelier to be finding mine. Every reported defect is
   hand-read before it is called anything.
3. **A planted break is caught by name** — `--plant` drops all but
   one precedent of a correct aggregation and the check must name
   that cell. Without this, « nothing found on a clean file » and
   « finds nothing ever » are the same measurement.

The date axis is read from the sheet itself: a row whose cells are
date serials marching across the columns is the axis, and the block's
granularity is `columns ÷ years`. No header word is consulted.
"""

import json
import sys
from collections import Counter
from dataclasses import replace
from pathlib import Path

from polar.tieout.units.periods import aggregations, blocks_from_dates
from polar.tieout.workbook import read_workbook

#: Excel serials for 1950 and 2100 — a date axis lives in between.
EARLIEST, LATEST = 18264.0, 73050.0

#: How many date cells a row needs before it counts as an axis.
MIN_AXIS = 6


def date_axes(cells: dict) -> dict[str, dict[int, float]]:
    """The best date axis per sheet: `{sheet: {column: serial}}`.

    A row of date serials across many columns is a period axis. The
    longest such row on a sheet wins, because a model may carry a
    short date row (« as at ») beside its real axis.
    """
    rows: dict[tuple[str, int], dict[int, float]] = {}
    for _ref, cell in cells.items():
        value = cell.value
        try:
            serial = float(value)
        except (TypeError, ValueError):
            continue
        if not EARLIEST <= serial <= LATEST:
            continue
        if not (cell.number_format or "").lower().count("y"):
            continue  # a date *format*, not a number that looks like one
        rows.setdefault((cell.sheet, cell.row), {})[cell.column] = serial
    best: dict[str, dict[int, float]] = {}
    for (sheet, _row), axis in rows.items():
        if len(axis) < MIN_AXIS:
            continue
        if sheet not in best or len(axis) > len(best[sheet]):
            best[sheet] = axis
    return best


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    plant = "--plant" in sys.argv

    cells = read_workbook(path).cells
    formulas = sum(1 for c in cells.values() if c.formula is not None)
    print(f"{Path(path).name}: {len(cells)} cells, {formulas} with formulas")
    if not formulas:
        print("no formulas — this design reads arithmetic, so it cannot run here")
        return 1

    blocks = blocks_from_dates(date_axes(cells))
    by_granularity = Counter(b.granularity for b in blocks)
    print(f"blocks: {dict(by_granularity)} across {len(blocks)} sheets")
    for block in blocks[:6]:
        print(f"   {block.sheet}: {block.why}")

    found = aggregations(cells, blocks)
    correct = [a for a in found if not a.is_broken]
    broken = [a for a in found if a.is_broken]
    print(
        f"\naggregations: {len(found)} found — "
        f"{len(correct)} correct, {len(broken)} broken"
    )
    for a in correct[:4]:
        print(
            f"   ok  {a.ref}: {a.cells_taken} {a.from_granularity} "
            f"cells into {a.to_granularity}"
        )
    for a in broken[:8]:
        print(
            f"   ** {a.ref}: {a.cells_taken} of {a.cells_expected} "
            f"{a.from_granularity} cells into {a.to_granularity}"
        )

    planted = None
    if plant and correct:
        target = correct[0]
        cell = cells[target.ref]
        keep = (cell.precedents or ())[:1]
        cells[target.ref] = (
            replace(cell, precedents=keep)
            if hasattr(cell, "__dataclass_fields__")
            else cell
        )
        if not hasattr(cell, "__dataclass_fields__"):
            cell.precedents = keep
        after = aggregations(cells, blocks)
        caught = [a for a in after if a.is_broken and a.ref == target.ref]
        planted = {"ref": target.ref, "caught": bool(caught)}
        print(
            f"\nplant at {target.ref}: twelve cells cut to one — "
            + ("CAUGHT by name" if caught else "MISSED")
        )

    report = {
        "model": Path(path).name,
        "cells": len(cells),
        "formula_cells": formulas,
        "blocks": {b.sheet: b.granularity for b in blocks},
        "aggregations_found": len(found),
        "correct": len(correct),
        "broken": [
            {
                "ref": a.ref,
                "taken": a.cells_taken,
                "expected": a.cells_expected,
                "from": a.from_granularity,
                "to": a.to_granularity,
            }
            for a in broken[:50]
        ],
        "plant": planted,
    }
    if out:
        out.write_text(json.dumps(report, indent=1))
        print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
