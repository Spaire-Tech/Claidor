"""E2 measured — blind — against the models' own Units column.

    cd server && uv run python -m scripts.recalc_units_score OUT.json

ED2 and GD3 declare a unit beside every input row (« £m 20/21
prices », « annual real % »). Those declarations were written by the
models' own authors, not by me, so they are the one truth set in
this lane that is not self-graded. **The inference never sees that
column**; the scorer parses it as the answer key.

Reported per dimension and per model: right, wrong, and abstained —
kept apart, because an inference that says « I don't know » is a
different instrument from one that says something false.
"""

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from polar.tieout.units.inference import classify_sheet, rows_from_cells
from polar.tieout.workbook import read_workbook

MODELS = {
    "ed2-v5": "scripts/corpus_au_uk/ofgem_ed2/v5_2026-06.xlsx",
    "gd3-pcfm": "scripts/corpus_au_uk/ofgem_riio3/draft/DRAFT_GD3 PCFM_Jun25.xlsx",
}

DIMENSIONS = ("kind", "b5_type", "currency", "scale", "period", "rate_form")


def truth_from_units(text: str) -> dict[str, str] | None:
    """The answer key, parsed from the model's own words."""
    lowered = text.strip().lower()
    if lowered.startswith("£m"):
        return {
            "kind": "continuous",
            "b5_type": "money",
            "currency": "GBP",
            "scale": "millions",
            "period": "annual",
            "rate_form": "not-a-rate",
        }
    if lowered.startswith("£"):
        return {
            "kind": "continuous",
            "b5_type": "money",
            "currency": "GBP",
            "scale": "units",
            "period": "annual",
            "rate_form": "not-a-rate",
        }
    if "%" in lowered:
        return {
            "kind": "continuous",
            "b5_type": "rate",
            "currency": "none",
            "scale": "units",
            "period": "annual" if "annual" in lowered else "none",
            "rate_form": "decimal",
        }
    return None


def units_column(path: str) -> dict[tuple[str, int], str]:
    """Every row's declared unit, keyed by (sheet, row)."""
    book = load_workbook(path, read_only=False, data_only=True)
    declared: dict[tuple[str, int], str] = {}
    try:
        for sheet in book.worksheets:
            column = None
            for row in sheet.iter_rows(min_row=1, max_row=12, max_col=12):
                for cell in row:
                    if (
                        isinstance(cell.value, str)
                        and cell.value.strip().lower() == "units"
                    ):
                        column = cell.column
            if column is None:
                continue
            for index in range(1, sheet.max_row + 1):
                value = sheet.cell(row=index, column=column).value
                if isinstance(value, str) and value.strip():
                    declared[(sheet.title, index)] = value.strip()
    finally:
        book.close()
    return declared


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("units-score.json")
    report: dict[str, Any] = {}
    for key, path in MODELS.items():
        declared = units_column(path)
        cells = read_workbook(path).cells
        sheets = {cell.sheet for cell in cells.values()}
        tallies = {d: Counter() for d in DIMENSIONS}
        scored = 0
        confusions: Counter = Counter()
        for sheet in sorted(sheets):
            rows = rows_from_cells(cells, sheet)
            if not rows:
                continue
            inferred = classify_sheet(rows)  # blind: never reads Units
            for (sheet_name, row_number), label in inferred.items():
                text = declared.get((sheet_name, row_number))
                if not text:
                    continue
                truth = truth_from_units(text)
                if truth is None:
                    continue
                scored += 1
                for dimension in DIMENSIONS:
                    got, want = label.get(dimension), truth[dimension]
                    if got in ("unknown", "untyped", "unknown-quantity"):
                        tallies[dimension]["abstained"] += 1
                    elif got == want:
                        tallies[dimension]["right"] += 1
                    else:
                        tallies[dimension]["wrong"] += 1
                        confusions[f"{dimension}: said {got}, was {want}"] += 1
        report[key] = {
            "rows_scored": scored,
            "per_dimension": {d: dict(tallies[d]) for d in DIMENSIONS},
            "top_confusions": confusions.most_common(8),
        }
        print(f"\n=== {key}: {scored} rows with a declared unit")
        for dimension in DIMENSIONS:
            t = tallies[dimension]
            total = sum(t.values()) or 1
            print(
                f"  {dimension:10s} right {t['right']:5d} ({100 * t['right'] / total:5.1f}%)"
                f"  wrong {t['wrong']:5d} ({100 * t['wrong'] / total:5.1f}%)"
                f"  abstained {t['abstained']:5d} ({100 * t['abstained'] / total:5.1f}%)"
            )
        for line, count in confusions.most_common(5):
            print(f"     {count:5d}  {line}")
    out.write_text(json.dumps(report, indent=1))
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
