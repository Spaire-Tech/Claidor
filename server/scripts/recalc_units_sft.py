"""E2 on the closed-deal corpus: what it says when there is no key.

    cd server && uv run python -m scripts.recalc_units_sft OUT.json

The answer key came back **zero** — not one of the eight readable
Scottish Futures Trust models carries a `Units` column
(`units-key-sft.json`). So per the registration no per-dimension
accuracy is quoted here, and the round is reported as unmeasurable
on accuracy.

Three things stay measurable without a key and are what this runs
for: **how often E2 declines** in an idiom it was not built on,
**what orientation it reads** each sheet as, and **what B5 would be
allowed to perturb** if it typed one of these models tomorrow. The
last is the number that decides whether Track B can leave the
regulator corpus at all.

One file at a time, per the heavy-job rule.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from polar.tieout.units.inference import (
    DIMENSIONS,
    Orientation,
    classify_sheet,
    orientation,
    rows_from_cells,
)
from polar.tieout.workbook import read_workbook

CORPUS = Path("scripts/corpus_sft")


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("units-sft.json")
    models = sorted(CORPUS.glob("*.xlsm"))
    if not models:
        print(f"no readable models under {CORPUS} — run scripts.corpus_sft_models")
        return 1
    report: dict[str, object] = {}
    totals: Counter = Counter()
    abstained: Counter = Counter()
    for path in models:
        try:
            cells = read_workbook(str(path)).cells
        except Exception as error:  # a refusal is a result
            report[path.name] = {"refused": str(error).splitlines()[-1]}
            print(f"{path.name}: REFUSED — {error}", flush=True)
            continue
        sheets = sorted({cell.sheet for cell in cells.values()})
        facings: Counter = Counter()
        kinds: Counter = Counter()
        b5_types: Counter = Counter()
        per_dimension: Counter = Counter()
        rows_seen = 0
        for sheet in sheets:
            rows = rows_from_cells(cells, sheet)
            if not rows:
                continue
            facings[str(orientation(rows))] += 1
            for label in classify_sheet(rows).values():
                rows_seen += 1
                kinds[label.kind] += 1
                b5_types[label.b5_type] += 1
                for dimension in DIMENSIONS:
                    if label.get(dimension) in ("unknown", "untyped"):
                        per_dimension[dimension] += 1
        perturbable = b5_types["money"] + b5_types["rate"]
        report[path.name] = {
            "sheets": len(sheets),
            "input_rows": rows_seen,
            "orientation": dict(facings),
            "kind": dict(kinds),
            "b5_type": dict(b5_types),
            "abstained": {d: per_dimension[d] for d in DIMENSIONS},
            "b5_perturbable_rows": perturbable,
            "b5_perturbable_percent": round(100 * perturbable / max(rows_seen, 1), 1),
        }
        totals["rows"] += rows_seen
        totals["perturbable"] += perturbable
        for dimension in DIMENSIONS:
            abstained[dimension] += per_dimension[dimension]
        print(
            f"{path.name}: {len(sheets)} sheets, {rows_seen} input rows, "
            f"{dict(facings)}, "
            f"B5 could perturb {perturbable} "
            f"({report[path.name]['b5_perturbable_percent']}%)",
            flush=True,
        )
    report["_totals"] = {
        "input_rows": totals["rows"],
        "b5_perturbable_rows": totals["perturbable"],
        "b5_perturbable_percent": round(
            100 * totals["perturbable"] / max(totals["rows"], 1), 1
        ),
        "abstained_percent": {
            d: round(100 * abstained[d] / max(totals["rows"], 1), 1) for d in DIMENSIONS
        },
    }
    print(f"\ntotals: {json.dumps(report['_totals'], indent=1)}")
    out.write_text(json.dumps(report, indent=1))
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
