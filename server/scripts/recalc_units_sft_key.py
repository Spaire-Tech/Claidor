"""E2 blind against the closed-deal corpus's own authors.

    cd server && uv run python -m scripts.recalc_units_sft_key OUT.json

The non-circular measurement the verdict was missing. The units come
from the models' own units columns, found by the detector (build item
b); **E2's blind pass never reads them**, which is what keeps this
honest.

The point of the round, registered first: today's verdict ARMs `kind`
on 3,662 rows that are **all continuous by construction**. This key
carries `Flag`, `Factor` and `Date` beside `£m`, so it is the first
time `kind` faces rows an author declared non-continuous.

Reported per dimension: right, wrong, abstained — and, kept apart
because they are answers rather than gaps, the count of declarations
that are **not units** and the count this parser **cannot read**.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from polar.tieout.units.columns import cells_with_text, find_units_columns
from polar.tieout.units.declarations import parse_declaration
from polar.tieout.units.inference import (
    DIMENSIONS,
    Orientation,
    classify_columns,
    classify_sheet,
    columns_from_cells,
    rate_form_from_usage,
    rows_from_cells,
    sheet_reading,
    with_usage,
)
from polar.tieout.workbook import read_workbook

CORPUS = Path("scripts/corpus_sft")


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("units-sft-key.json")
    report: dict[str, object] = {}
    grand = {d: Counter() for d in DIMENSIONS}
    totals = Counter()
    for path in sorted(CORPUS.glob("*.xlsm")):
        texts = cells_with_text(str(path))
        declared: dict[tuple[str, int], str] = {}
        for sheet in sorted({c.sheet for c in texts.values()}):
            for found in find_units_columns(texts, sheet):
                declared[(found.sheet, found.row)] = found.text
        if not declared:
            report[path.name] = {"declarations": 0}
            print(f"{path.name}: no units column found", flush=True)
            continue

        cells = read_workbook(str(path)).cells
        usage = rate_form_from_usage(cells)
        by_ref: dict[tuple[str, int], list[str]] = {}
        for ref, cell in cells.items():
            if cell.formula is None and cell.value is not None:
                by_ref.setdefault((cell.sheet, cell.row), []).append(ref)

        tallies = {d: Counter() for d in DIMENSIONS}
        counts = Counter()
        unreadable: Counter = Counter()
        for sheet in sorted({cell.sheet for cell in cells.values()}):
            rows = rows_from_cells(cells, sheet)
            if not rows:
                continue
            facing = sheet_reading(cells, sheet)
            if facing is Orientation.COLUMN_WISE:
                by_column = classify_columns(columns_from_cells(cells, sheet))
                inferred = {}
                for row in rows:
                    refs = by_ref.get((sheet, row.row), [])
                    first = next((cells[r] for r in refs if r in cells), None)
                    if first is not None and first.column in by_column:
                        inferred[(sheet, row.row)] = by_column[first.column]
            else:
                inferred = classify_sheet(rows)
            for key, label in inferred.items():
                text = declared.get(key)
                if not text:
                    continue
                refs = by_ref.get(key, [])
                formats = tuple(
                    sorted(
                        {
                            cells[r].number_format or "General"
                            for r in refs
                            if r in cells
                        }
                    )
                )
                truth = parse_declaration(text, formats)
                if truth.not_a_unit:
                    counts["not_a_unit"] += 1
                    # `kind` is still gradeable: the author said this
                    # row is a switch, so it is categorical.
                    said = with_usage(label, usage.get(refs[0]) if refs else None).kind
                    if said in ("unknown", "untyped"):
                        tallies["kind"]["abstained"] += 1
                    elif said == "categorical":
                        tallies["kind"]["right"] += 1
                    else:
                        tallies["kind"]["wrong"] += 1
                    continue
                if truth.unparseable:
                    counts["unparseable"] += 1
                    unreadable[text] += 1
                    continue
                counts["scored"] += 1
                label = with_usage(label, usage.get(refs[0]) if refs else None)
                for dimension in DIMENSIONS:
                    got = label.get(dimension)
                    want = getattr(truth, dimension)
                    if want in ("unknown", "untyped"):
                        continue  # the key does not say; nothing to score
                    if got in ("unknown", "untyped", "unknown-quantity"):
                        tallies[dimension]["abstained"] += 1
                    elif got == want:
                        tallies[dimension]["right"] += 1
                    else:
                        tallies[dimension]["wrong"] += 1
        for dimension in DIMENSIONS:
            grand[dimension] += tallies[dimension]
        totals += counts
        report[path.name] = {
            "declarations": len(declared),
            **counts,
            "per_dimension": {d: dict(tallies[d]) for d in DIMENSIONS},
            "top_unreadable": unreadable.most_common(6),
        }
        print(
            f"{path.name}: {len(declared)} declarations — "
            f"{counts['scored']} scored, {counts['not_a_unit']} not a unit, "
            f"{counts['unparseable']} unreadable",
            flush=True,
        )
    report["_totals"] = {
        **totals,
        "per_dimension": {d: dict(grand[d]) for d in DIMENSIONS},
    }
    print(
        f"\n{'dimension':<12} {'right':>7} {'wrong':>7} {'abstained':>10}  wrong of decided"
    )
    for dimension in DIMENSIONS:
        t = grand[dimension]
        decided = t["right"] + t["wrong"]
        share = f"{100 * t['wrong'] / decided:.2f}%" if decided else "—"
        print(
            f"{dimension:<12} {t['right']:>7} {t['wrong']:>7} {t['abstained']:>10}"
            f"  {share} of {decided}"
        )
    out.write_text(json.dumps(report, indent=1))
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
