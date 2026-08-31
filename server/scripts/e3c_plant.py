"""Criterion 3 — planted recall, reported against its scope.

    cd server && uv run python -m scripts.e3c_plant MODEL [MODEL ...]

The registration: « one year of a flow row's coarse value is overwritten
with one month's value; the check must name that row and that year. The
number of plantable sites is reported alongside the ratio — a recall of
1/1 on a scope of 1 shows the mechanism connects and nothing more. »

Planting happens **in the cells the reader produced**, not in the file,
and the whole detection path is re-run afterwards — so this measures
the pipeline rather than the classifier it wraps.
"""

import sys
from dataclasses import replace
from decimal import Decimal
from pathlib import Path
from typing import Any

from polar.tieout.workbook import read_workbook
from scripts.e3c_flow_stock import patterns
from scripts.recalc_period_check import date_axes
from scripts.recalc_period_values import blocks_from_dates, series_by_label

#: A site must hold its pattern in at least this many periods before a
#: break in it means anything.
MIN_KEPT = 8


def _coarse_cell(
    cells: dict[str, Any], sheet: str, row: int, column: int
) -> str | None:
    ref = f"{sheet}!{chr(ord('A') + column - 1)}{row}" if column <= 26 else None
    if ref and ref in cells:
        return ref
    for candidate, cell in cells.items():
        if cell.sheet == sheet and cell.row == row and cell.column == column:
            return candidate
    return None


def run(path: str) -> tuple[int, int, list[str]]:
    name = Path(path).name
    cells = read_workbook(path).cells
    blocks = blocks_from_dates(date_axes(cells))
    by_sheet = {b.sheet: b for b in blocks}
    baseline = patterns(cells, blocks)

    sites = [
        row
        for row in baseline
        if row["kind"] == "flow"
        and not row["single_period"]
        and row["kept"] >= MIN_KEPT
    ]
    print(f"\n{name}: {len(sites)} plantable sites (clean flow rows)")

    caught = 0
    missed: list[str] = []
    for site in sites:
        coarse_sheet, coarse_row = site["coarse"].split("!")
        coarse_row_number = int(coarse_row)
        block = by_sheet[coarse_sheet]
        fine_sheet = site["fine"].split("!")[0]
        fine_values = series_by_label(cells, fine_sheet, by_sheet[fine_sheet].columns)[
            site["label"]
        ][1]
        ratio = site["ratio"]

        #: Plant in the middle of the run, where the pattern is
        #: established on both sides.
        target = len(block.columns) // 2
        window = fine_values[target * ratio : (target + 1) * ratio]
        if len(window) < ratio or not any(window):
            continue
        #: One period's figure, where the whole window belongs.
        planted_value = next((v for v in window if v), 0.0)

        column = block.columns[target]
        ref = _coarse_cell(cells, coarse_sheet, coarse_row_number, column)
        if ref is None:
            continue
        original = cells[ref]
        cells[ref] = replace(original, value=Decimal(str(planted_value)))
        try:
            after = patterns(cells, blocks)
            found = [
                row
                for row in after
                if row["coarse"] == site["coarse"]
                and row["fine"] == site["fine"]
                and target in row["single_period"]
            ]
            if found:
                caught += 1
            else:
                missed.append(f"{site['label'][:34]} at period {target}")
        finally:
            cells[ref] = original

    return caught, len(sites), missed


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    total_caught = total_sites = 0
    for path in sys.argv[1:]:
        caught, sites, missed = run(path)
        total_caught += caught
        total_sites += sites
        if sites:
            print(f"   caught {caught} of {sites}")
        for one in missed[:6]:
            print(f"     MISSED {one}")
    print(f"\nCRITERION 3 — planted recall: {total_caught} of {total_sites} sites")
    if total_sites:
        print(f"   {total_caught / total_sites * 100:.1f}%, scope {total_sites}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
