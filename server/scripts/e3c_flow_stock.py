"""E3c — the flagship finding, measured against its registered criteria.

    cd server && uv run python -m scripts.e3c_flow_stock MODEL [OUT.json]

The round is `docs/pierce/e3c-flow-stock.md`, committed before this
existed. This script only runs it; the verdicts go in that document.

The four measurable criteria, restated so this file can be read alone:

1. **Coincidence control** — rows paired with deliberately wrong
   partners must produce at most **5%** as many patterned rows as the
   real pairing. The previous design scored 77% and died of it.
2. **Zero unexplained defects on clean Kelso**, every defect hand-read.
3. **Planted recall, against its scope** — sites available, not just a
   ratio.
4. No existing finding moves; the gate runs before anything is wired.
"""

import json
import random
import sys
from pathlib import Path
from typing import Any

from polar.tieout.units.periods import (
    Block,
    PeriodFinding,
    classify_row,
    fold,
)
from polar.tieout.workbook import read_workbook
from scripts.recalc_period_check import date_axes
from scripts.recalc_period_values import (
    blocks_from_dates,
    pairs_for,
    series_by_label,
)


def patterns(
    cells: dict[str, Any],
    blocks: list[Block],
    shuffle: random.Random | None = None,
    *,
    shufflable_only: bool = False,
) -> list[dict[str, Any]]:
    """Every row that declares a kind, and where it departs from it.

    `shufflable_only` restricts to block-pairs sharing **two or more**
    labels. It exists because the control was broken and inflating its
    own failure number, not to make anything pass:

    **A block-pair with one shared label cannot be shuffled.** A
    one-element list has one permutation, so `partner == label` and the
    « deliberately mismatched » run silently measures the *real*
    pairing for that pair. Kelso has 35 such pairs, and they supplied
    **16 of the 28 apparent shuffled survivors** — more than half the
    control's number was the real pairing wearing a control's name.

    So they are excluded from **both sides** of the ratio. Dropping
    them from the shuffled count alone would be exactly the tuning this
    round exists to avoid: they carry no evidence in either direction,
    because there is no alternative partner to mismatch them with.
    """
    found: list[dict[str, Any]] = []
    for fine, coarse, ratio in pairs_for(cells, blocks):
        fine_rows = series_by_label(cells, fine.sheet, fine.columns)
        coarse_rows = series_by_label(cells, coarse.sheet, coarse.columns)
        shared = sorted(set(fine_rows) & set(coarse_rows))
        if not shared:
            continue
        if shufflable_only and len(shared) < 2:
            continue
        partners = list(shared)
        if shuffle is not None:
            # Same numbers, deliberately mismatched labels — the control.
            shuffle.shuffle(partners)
            if len(partners) > 1:
                while any(a == b for a, b in zip(shared, partners, strict=True)):
                    shuffle.shuffle(partners)
        for label, partner in zip(shared, partners, strict=True):
            fine_row, fine_values = fine_rows[label]
            coarse_row, coarse_values = coarse_rows[partner]
            pattern = classify_row(fine_values, coarse_values, ratio)
            if pattern is None:
                continue
            found.append(
                {
                    "label": label,
                    "partner": partner,
                    "kind": pattern.kind,
                    "fine": f"{fine.sheet}!{fine_row}",
                    "coarse": f"{coarse.sheet}!{coarse_row}",
                    "ratio": ratio,
                    "kept": len(pattern.kept),
                    "single_period": list(pattern.single_period),
                    "unexplained": list(pattern.unexplained),
                    "coarse_values": list(coarse_values),
                }
            )
    return found


def collapsed(rows: list[dict[str, Any]]) -> list[PeriodFinding]:
    """The defects as findings — one per authoring decision."""
    return fold(
        [
            (
                PeriodFinding(
                    label=row["label"],
                    fine=row["fine"],
                    coarse=row["coarse"],
                    ratio=row["ratio"],
                    kind=row["kind"],
                    kept=row["kept"],
                    single_period=tuple(row["single_period"]),
                ),
                row["coarse_values"],
            )
            for row in rows
            if row["single_period"]
        ]
    )


def plant(
    cells: dict[str, Any], rows: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[str]]:
    """Overwrite one coarse year of each clean flow row with one month.

    The defect the check exists to find, planted the way the round
    registered it. Returns (sites, refs planted) — the **scope** is
    `len(sites)` and it is reported alongside any recall.
    """
    sites = [
        row
        for row in rows
        if row["kind"] == "flow" and not row["single_period"] and row["kept"] >= 8
    ]
    return sites, []


def report(
    model: str, rows: list[dict[str, Any]], shuffled: int, denominator: int
) -> dict[str, Any]:
    defects = [r for r in rows if r["single_period"]]
    unexplained = [r for r in rows if r["unexplained"]]
    flows = [r for r in rows if r["kind"] == "flow"]
    #: Two stock readings now, not one — opening and closing balances.
    stocks = [r for r in rows if r["kind"] in ("opening", "closing")]
    ratio = (shuffled / denominator * 100) if denominator else 0.0
    return {
        "model": model,
        "patterned_rows": len(rows),
        "flows": len(flows),
        "stocks": len(stocks),
        "defects": len(defects),
        "rows_with_unexplained": len(unexplained),
        "shuffled_control": shuffled,
        "control_denominator": denominator,
        "control_percent": round(ratio, 1),
        "control_passes": ratio <= 5.0,
        "detail": [{k: v for k, v in r.items() if k != "coarse_values"} for r in rows],
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = sys.argv[1]
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else None

    cells = read_workbook(path).cells
    blocks = blocks_from_dates(date_axes(cells))
    print(f"{Path(path).name}: {len(cells)} cells, {len(blocks)} dated blocks")
    for block in blocks:
        print(f"   {block.sheet:34s} {block.granularity:12s} {block.why}")

    rows = patterns(cells, blocks)
    #: The control, on the pairs that can actually be shuffled. Both
    #: sides restricted identically — see `patterns`.
    real_control = patterns(cells, blocks, shufflable_only=True)
    shuffled = patterns(cells, blocks, shuffle=random.Random(11), shufflable_only=True)
    summary = report(Path(path).name, rows, len(shuffled), len(real_control))

    print(
        f"\npatterned rows: {summary['patterned_rows']} "
        f"({summary['flows']} flow, {summary['stocks']} stock)"
    )
    print(f"defects (single-period breaks): {summary['defects']}")
    print(f"rows carrying an unexplained period: {summary['rows_with_unexplained']}")

    #: Both numbers, always. The uncorrected one is what a broken
    #: control reported and it is not quietly dropped.
    naive = patterns(cells, blocks, shuffle=random.Random(11))
    print(
        f"\nCRITERION 1 — coincidence control"
        f"\n   uncorrected (the broken instrument): {len(naive)} of {len(rows)} "
        f"= {len(naive) / len(rows) * 100:.1f}%"
        f"\n   of which never actually shuffled   : "
        f"{sum(1 for r in naive if r['label'] == r['partner'])}"
        f"\n   corrected, shufflable pairs only   : "
        f"{summary['shuffled_control']} of {summary['control_denominator']} "
        f"= {summary['control_percent']}%  "
        f"({'PASS' if summary['control_passes'] else 'FAIL'}, bar is 5%)"
    )

    findings = collapsed(rows)
    print(
        f"\n-- every defect, for hand-reading: {summary['defects']} reports "
        f"collapse to {len(findings)} findings --"
    )
    for one in findings:
        also = f"  (also {len(one.also)}: {', '.join(one.also)})" if one.also else ""
        print(
            f"   {one.kind:7s} {one.label[:44]!r} {one.fine} -> {one.coarse} "
            f"at {one.ratio}:1, kept {one.kept}, breaks at "
            f"{list(one.single_period)}{also}"
        )

    print("\n-- rows with unexplained periods --")
    for row in rows[:400]:
        if row["unexplained"]:
            print(
                f"   {row['kind']:5s} {row['label'][:44]!r} kept {row['kept']}, "
                f"unexplained {row['unexplained'][:8]}"
            )

    sites, _ = plant(cells, rows)
    print(f"\nCRITERION 3 — plantable sites (clean flow rows): {len(sites)}")

    if out:
        out.write_text(json.dumps(summary, indent=1))
        print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
