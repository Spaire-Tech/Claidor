"""E2 against E1's hundred hand-labelled rows, through the real path.

    cd server && uv run python -m scripts.recalc_units_e1 [OUT.json]

The registration for the rate-form-from-usage round says the change
**must not make any dimension worse** against E1, or it comes out.
E1 and E2 share an author, so this is not independent validation; it
is a check that a change to the inference does not quietly overturn
answers a careful reading already got right.

Two readings are reported side by side:

- **isolated** — the row's own recorded evidence, classified
  row-wise. This is what every earlier number in the log measured,
  and it is *not* how the caller uses E2.
- **as used** — the model is opened, `sheet_reading` decides which
  way the sheet is read, a column-wise sheet is classified down its
  columns, and usage evidence from the consumer formulas is applied.
  This is the path `inferred_inputs` runs, so it is the one a
  verdict may be built on.

E1 and E2 share an author, so neither column is independent
validation; the author key (`recalc_units_score.py`) decides and
this informs.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from polar.tieout.units.inference import (
    DIMENSIONS,
    Orientation,
    RowEvidence,
    UnitLabel,
    classify_columns,
    classify_row,
    classify_sheet,
    columns_from_cells,
    orientation,
    rate_form_from_usage,
    rows_from_cells,
    sheet_reading,
    with_usage,
)
from polar.tieout.workbook import read_workbook

TRUTH = Path("../docs/pierce/logs/dynamo/e1-ground-truth.json")

#: E1 drew from these; the keys are the model names it recorded.
MODEL_PATHS = {
    "ed2-v5": "scripts/corpus_au_uk/ofgem_ed2/v5_2026-06.xlsx",
    "gd3-pcfm": "scripts/corpus_au_uk/ofgem_riio3/draft/DRAFT_GD3 PCFM_Jun25.xlsx",
    "h7-fds": "scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fds.xlsx",
    "h7-fp": "scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fp.xlsx",
    "roe": (
        "scripts/corpus_au_uk/ofgem_riio3/draft/"
        "RIIO GDT3 Allowed Return on Equity Summary File_Draft Determinations_Jun25.xlsx"
    ),
}


def as_used(row: dict, cache: dict) -> UnitLabel | None:
    """E2's answer for this row through the path the caller runs."""
    path = MODEL_PATHS.get(row["model"])
    if not path or not Path(path).exists():
        return None
    model = row["model"]
    if model not in cache:
        cells = read_workbook(path).cells
        cache[model] = (cells, rate_form_from_usage(cells), {})
    cells, usage, sheets = cache[model]
    sheet = row["sheet"]
    if sheet not in sheets:
        facing = sheet_reading(cells, sheet)
        if facing is Orientation.COLUMN_WISE:
            sheets[sheet] = (facing, classify_columns(columns_from_cells(cells, sheet)))
        else:
            sheets[sheet] = (facing, classify_sheet(rows_from_cells(cells, sheet)))
    facing, labels = sheets[sheet]
    refs = [f"{sheet}!{ref}" for ref in (row.get("refs") or [])]
    if facing is Orientation.COLUMN_WISE:
        first = next((cells[r] for r in refs if r in cells), None)
        label = labels.get(first.column) if first else None
    else:
        label = labels.get((sheet, row["row"]))
    if label is None:
        return None
    return with_usage(label, usage.get(refs[0]) if refs else None)


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("units-e1.json")
    rows = json.loads(TRUTH.read_text())
    cache: dict = {}
    tallies = {
        stage: {d: Counter() for d in DIMENSIONS} for stage in ("isolated", "as_used")
    }
    missing = 0
    for row in rows:
        evidence = RowEvidence(
            sheet=row["sheet"],
            row=row["row"],
            row_label=row.get("row_label", ""),
            column_labels=row.get("column_labels", ()),
            number_formats=row.get("number_formats", ()),
            values=row.get("values", ()),
        )
        isolated = classify_row(evidence, orientation([evidence]))
        used = as_used(row, cache)
        if used is None:
            missing += 1
            used = isolated
        truth = row["labels"]
        for dimension in DIMENSIONS:
            for stage, label in (("isolated", isolated), ("as_used", used)):
                said, real = label.get(dimension), truth.get(dimension)
                if said in ("unknown", "untyped"):
                    tallies[stage][dimension]["abstained"] += 1
                elif said == real:
                    tallies[stage][dimension]["right"] += 1
                else:
                    tallies[stage][dimension]["wrong"] += 1
    report = {
        "rows": len(rows),
        "rows_without_a_workbook": missing,
        "isolated": {d: dict(tallies["isolated"][d]) for d in DIMENSIONS},
        "as_used": {d: dict(tallies["as_used"][d]) for d in DIMENSIONS},
    }
    print(f"{len(rows)} E1 rows ({missing} with no workbook to hand)\n")
    print(
        f"{'dimension':<12} {'isolated r/w/a':<18} {'as used r/w/a':<18} wrong of decided"
    )
    for d in DIMENSIONS:
        i, u = tallies["isolated"][d], tallies["as_used"][d]
        decided = u["right"] + u["wrong"]
        share = f"{100 * u['wrong'] / decided:.1f}%" if decided else "—"
        print(
            f"{d:<12} {f'{i[chr(114) + chr(105) + chr(103) + chr(104) + chr(116)]}/{i["wrong"]}/{i["abstained"]}':<18} "
            f"{f'{u["right"]}/{u["wrong"]}/{u["abstained"]}':<18} {share} of {decided}"
        )
    out.write_text(json.dumps(report, indent=1))
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
