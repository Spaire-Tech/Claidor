"""Every reported defect, with the numbers behind it, for hand-reading.

    cd server && uv run python -m scripts.e3c_handread MODEL [MODEL ...]

Criterion 2 of `docs/pierce/e3c-flow-stock.md` requires every defect to
be read at the cells before it is called anything. This prints what a
person needs to do that: the row's own pattern, the period it breaks
in, and the fine window beside the coarse value — so the reader can see
for themselves whether the coarse figure took one cell where it takes
the whole window everywhere else.

It also folds first, because one number published on several rows is
one authoring decision and reading it four times is reading it once.
"""

import sys
from pathlib import Path
from typing import Any

from polar.tieout.units.periods import PeriodFinding, fold
from polar.tieout.workbook import read_workbook
from scripts.e3c_flow_stock import patterns
from scripts.recalc_period_check import date_axes
from scripts.recalc_period_values import blocks_from_dates, series_by_label


def read_one(path: str) -> None:
    name = Path(path).name
    cells = read_workbook(path).cells
    blocks = blocks_from_dates(date_axes(cells))
    by_sheet = {b.sheet: b for b in blocks}
    rows = patterns(cells, blocks)
    broken = [r for r in rows if r["single_period"]]

    findings = fold(
        [
            (
                PeriodFinding(
                    label=r["label"],
                    fine=r["fine"],
                    coarse=r["coarse"],
                    ratio=r["ratio"],
                    kind=r["kind"],
                    kept=r["kept"],
                    single_period=tuple(r["single_period"]),
                ),
                r["coarse_values"],
            )
            for r in broken
        ]
    )
    print(f"\n{'#' * 72}\n# {name}: {len(broken)} reports -> {len(findings)} findings")

    for one in findings:
        source = next(
            r for r in broken if r["fine"] == one.fine and r["coarse"] == one.coarse
        )
        fine_sheet = one.fine.split("!")[0]
        coarse_sheet = one.coarse.split("!")[0]
        fine = series_by_label(cells, fine_sheet, by_sheet[fine_sheet].columns)[
            source["label"]
        ][1]
        coarse = series_by_label(cells, coarse_sheet, by_sheet[coarse_sheet].columns)[
            source["partner"]
        ][1]
        ratio = one.ratio

        print(f"\n--- {one.kind.upper()} {one.label[:56]!r}")
        print(
            f"    {one.fine} -> {one.coarse}  at {ratio}:1, "
            f"holds its pattern in {one.kept} periods"
        )
        if one.also:
            print(f"    also on: {', '.join(one.also)}")
        for index in one.single_period[:4]:
            window: Any = fine[index * ratio : (index + 1) * ratio]
            print(f"    BREAK period {index}: coarse = {coarse[index]:,.4f}")
            print(f"       window {[round(float(v), 3) for v in window]}")
            print(
                f"       sum = {sum(window):,.4f}   first = {window[0]:,.4f}   "
                f"last = {window[-1]:,.4f}"
            )
        shown = 0
        for index in range(len(coarse)):
            if index in one.single_period:
                continue
            window = fine[index * ratio : (index + 1) * ratio]
            if len(window) < ratio or not any(window):
                continue
            print(
                f"    (holds  period {index}: coarse = {coarse[index]:,.4f}  "
                f"sum = {sum(window):,.4f}  last = {window[-1]:,.4f})"
            )
            shown += 1
            if shown >= 2:
                break


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    for path in sys.argv[1:]:
        read_one(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
