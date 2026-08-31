"""Aggregation read from values, with its coincidence control.

    cd server && uv run python -m scripts.recalc_period_values MODEL [OUT.json]

Kelso ships 470,594 values and 814 formulas, so the formula design
died on it. If an annual value equals the sum of twelve monthly
values, that **is** the aggregation.

Registered before this ran (lane log, 28 Aug):

1. At least one row aggregates 12:1 across six or more periods.
2. Zero defects on clean Kelso — it is a control, not a hunting
   ground, and every defect is hand-read before it is called
   anything.
3. A planted defect is caught by name: one year's annual value
   overwritten with one month's value.
4. **The coincidence control**: rows paired with the *wrong*
   partners must produce near-zero aggregations. If shuffled pairs
   match nearly as often as real ones, the evidence is coincidence.
"""

import json
import random
import sys
from pathlib import Path

from polar.tieout.units.periods import (
    COARSENESS,
    MIN_PERIODS,
    RATIOS,
    aggregate_by_value,
    blocks_from_dates,
    date_axes,
    normalise,
    series_by_label,
)
from polar.tieout.workbook import read_workbook

#: `series_by_label` and `normalise` moved into the product with the
#: check; re-exported so every E3c script still reads one definition.
__all__ = ["main", "normalise", "pairs_for", "run", "series_by_label"]


def pairs_for(cells: dict, blocks: list) -> list[tuple]:
    """(fine block, coarse block, ratio) for every comparable pair."""
    out = []
    for fine in blocks:
        for coarse in blocks:
            if fine.sheet == coarse.sheet:
                continue
            if COARSENESS[fine.granularity] >= COARSENESS[coarse.granularity]:
                continue
            ratio = RATIOS.get((fine.granularity, coarse.granularity))
            if ratio:
                out.append((fine, coarse, ratio))
    return out


def run(cells: dict, blocks: list, shuffle: random.Random | None = None) -> list[dict]:
    found = []
    for fine, coarse, ratio in pairs_for(cells, blocks):
        fine_rows = series_by_label(cells, fine.sheet, fine.columns)
        coarse_rows = series_by_label(cells, coarse.sheet, coarse.columns)
        shared = sorted(set(fine_rows) & set(coarse_rows))
        if not shared:
            continue
        partners = list(shared)
        if shuffle is not None:
            # Same numbers, deliberately mismatched labels.
            partners = partners[:]
            shuffle.shuffle(partners)
            if len(partners) > 1:
                while any(a == b for a, b in zip(shared, partners, strict=True)):
                    shuffle.shuffle(partners)
        for label, partner in zip(shared, partners, strict=True):
            fine_row, fine_values = fine_rows[label]
            coarse_row, coarse_values = coarse_rows[partner]
            matched, single, unexplained = aggregate_by_value(
                fine_values, coarse_values, ratio
            )
            if len(matched) < MIN_PERIODS:
                continue
            found.append(
                {
                    "label": label,
                    "fine": f"{fine.sheet}!{fine_row}",
                    "coarse": f"{coarse.sheet}!{coarse_row}",
                    "ratio": ratio,
                    "matched": len(matched),
                    "single_period": single,
                    "unexplained": len(unexplained),
                }
            )
    return found


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    cells = read_workbook(path).cells
    blocks = blocks_from_dates(date_axes(cells))
    print(f"{Path(path).name}: {len(cells)} cells, {len(blocks)} dated blocks")

    real = run(cells, blocks)
    defects = [f for f in real if f["single_period"]]
    print(
        f"\naggregating rows: {len(real)} | with a single-period year: {len(defects)}"
    )
    for f in real[:6]:
        print(
            f"   {f['label'][:38]!r}: {f['matched']} periods at {f['ratio']}:1  "
            f"{f['fine']} -> {f['coarse']}"
        )
    for f in defects[:6]:
        print(f"   ** {f['label'][:38]!r} breaks at coarse index {f['single_period']}")

    shuffled = run(cells, blocks, shuffle=random.Random(11))
    print(
        f"\ncoincidence control: {len(shuffled)} aggregating rows when labels "
        f"are deliberately mismatched (real: {len(real)})"
    )

    report = {
        "model": Path(path).name,
        "blocks": {b.sheet: b.granularity for b in blocks},
        "aggregating_rows": real,
        "defects": defects,
        "shuffled_control": len(shuffled),
    }
    if out:
        out.write_text(json.dumps(report, indent=1))
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
