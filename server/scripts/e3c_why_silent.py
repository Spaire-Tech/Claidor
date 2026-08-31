"""Why did the flagship check say nothing here? — one model, at the cells.

    cd server && uv run python -m scripts.e3c_why_silent MODEL

Silence has several causes and they are not the same news. A model
laying out only annual grids can never be checked this way and that is
a structural limit. A model with a monthly sheet **and** an annual one
that still declares nothing is either a model whose sheets share no row
labels — the same honest silence — or a defect in the check.

This walks the exact path `_broken_aggregation` walks and prints where
it stops:

1. the dated blocks and their granularities;
2. the comparable pairs, which need **two different** granularities —
   `COARSENESS[fine] >= COARSENESS[coarse]` rejects the rest;
3. per pair, how many labelled rows each side offers and how many
   labels they share;
4. for the pairs that do share labels, how many rows declared a kind
   and why the others did not.

It decides nothing. It says which of the causes is the true one.
"""

import sys
from collections import Counter
from pathlib import Path

from polar.tieout.units.periods import (
    COARSENESS,
    RATIOS,
    blocks_from_dates,
    classify_row,
    date_axes,
    series_by_label,
    varies,
)
from polar.tieout.workbook import read_workbook


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1])
    cells = read_workbook(str(path)).cells
    blocks = blocks_from_dates(date_axes(cells))
    print(f"{path.name}: {len(cells)} cells, {len(blocks)} dated blocks")
    for block in blocks:
        print(f"   {block.sheet[:40]:42s} {block.granularity:12s} {block.why}")

    pairs = [
        (fine, coarse, RATIOS[(fine.granularity, coarse.granularity)])
        for fine in blocks
        for coarse in blocks
        if fine.sheet != coarse.sheet
        and COARSENESS[fine.granularity] < COARSENESS[coarse.granularity]
        and (fine.granularity, coarse.granularity) in RATIOS
    ]
    print(f"\ncomparable pairs: {len(pairs)}")
    if not pairs:
        print("   no two blocks of different granularity — nothing to compare")
        return 0

    rows_of: dict[str, dict] = {}
    for fine, coarse, ratio in pairs:
        for block in (fine, coarse):
            if block.sheet not in rows_of:
                rows_of[block.sheet] = series_by_label(
                    cells, block.sheet, block.columns
                )
        fine_rows, coarse_rows = rows_of[fine.sheet], rows_of[coarse.sheet]
        shared = sorted(set(fine_rows) & set(coarse_rows))
        print(
            f"\n   {fine.sheet[:28]:30s} -> {coarse.sheet[:28]:30s} at {ratio}:1\n"
            f"      {len(fine_rows)} labelled rows / {len(coarse_rows)} labelled rows"
            f" — {len(shared)} shared"
        )
        if not shared:
            continue
        why: Counter[str] = Counter()
        for label in shared:
            _, fine_values = fine_rows[label]
            _, coarse_values = coarse_rows[label]
            pattern = classify_row(fine_values, coarse_values, ratio)
            if pattern is not None:
                why[f"declared {pattern.kind}"] += 1
            elif not varies(fine_values) or not varies(coarse_values):
                why["frozen — one side never moves"] += 1
            else:
                why["no kind — too few deciding periods, or a tie"] += 1
        for reason, count in why.most_common():
            print(f"      {count:5d}  {reason}")
        for label in shared[:5]:
            print(f"      e.g. {label[:60]!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
