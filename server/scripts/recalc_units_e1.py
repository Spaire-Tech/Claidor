"""E2 against E1's hundred hand-labelled rows — the regression gate.

    cd server && uv run python -m scripts.recalc_units_e1 [OUT.json]

The registration for the rate-form-from-usage round says the change
**must not make any dimension worse** against E1, or it comes out.
E1 and E2 share an author, so this is not independent validation; it
is a check that a change to the inference does not quietly overturn
answers a careful reading already got right.

Usage evidence needs the workbook, not just the row, so each E1 row
is scored twice: once from its recorded evidence alone, and once
with the model's consumer formulas read. The two columns are the
before and after of the change.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from polar.tieout.units.inference import (
    DIMENSIONS,
    RowEvidence,
    classify_row,
    orientation,
    rate_form_from_usage,
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


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("units-e1.json")
    rows = json.loads(TRUTH.read_text())
    usage_by_model: dict[str, dict] = {}
    tallies = {
        stage: {d: Counter() for d in DIMENSIONS} for stage in ("before", "after")
    }
    changed: list[dict] = []
    for row in rows:
        model = row["model"]
        evidence = RowEvidence(
            sheet=row["sheet"],
            row=row["row"],
            row_label=row.get("row_label", ""),
            column_labels=row.get("column_labels", ()),
            number_formats=row.get("number_formats", ()),
            values=row.get("values", ()),
        )
        before = classify_row(evidence, orientation([evidence]))
        usage = None
        path = MODEL_PATHS.get(model)
        if path and Path(path).exists():
            if model not in usage_by_model:
                usage_by_model[model] = rate_form_from_usage(read_workbook(path).cells)
            first = (row.get("refs") or [None])[0]
            if first:
                usage = usage_by_model[model].get(f"{row['sheet']}!{first}")
        after = with_usage(before, usage)
        truth = row["labels"]
        for dimension in DIMENSIONS:
            for stage, label in (("before", before), ("after", after)):
                said, real = label.get(dimension), truth.get(dimension)
                if said in ("unknown", "untyped"):
                    tallies[stage][dimension]["abstained"] += 1
                elif said == real:
                    tallies[stage][dimension]["right"] += 1
                else:
                    tallies[stage][dimension]["wrong"] += 1
        if before != after:
            changed.append(
                {
                    "model": model,
                    "sheet": row["sheet"],
                    "row": row["row"],
                    "row_label": row.get("row_label", "")[:60],
                    "truth_rate_form": truth.get("rate_form"),
                    "truth_b5_type": truth.get("b5_type"),
                    "before": [before.b5_type, before.rate_form],
                    "after": [after.b5_type, after.rate_form],
                    "why": after.why,
                }
            )
    report = {
        "rows": len(rows),
        "before": {d: dict(tallies["before"][d]) for d in DIMENSIONS},
        "after": {d: dict(tallies["after"][d]) for d in DIMENSIONS},
        "rows_changed": changed,
    }
    print(f"{len(rows)} E1 rows, {len(changed)} changed by usage evidence\n")
    print(f"{'dimension':<12} {'before (r/w/a)':<20} {'after (r/w/a)':<20} verdict")
    worse = []
    for d in DIMENSIONS:
        b, a = tallies["before"][d], tallies["after"][d]
        verdict = "same"
        if a["wrong"] > b["wrong"]:
            verdict = "WORSE — the change must come out"
            worse.append(d)
        elif a["right"] > b["right"]:
            verdict = "better"
        print(
            f"{d:<12} "
            f"{f'{b[chr(39)] if False else b["right"]}/{b["wrong"]}/{b["abstained"]}':<20} "
            f"{f'{a["right"]}/{a["wrong"]}/{a["abstained"]}':<20} {verdict}"
        )
    report["worse_dimensions"] = worse
    for row in changed[:8]:
        print(
            f"  {row['model']} {row['sheet']}!{row['row']} "
            f"{row['before']} -> {row['after']} | truth "
            f"[{row['truth_b5_type']}, {row['truth_rate_form']}] | {row['row_label']}"
        )
    out.write_text(json.dumps(report, indent=1))
    print(f"\nwrote {out}")
    return 1 if worse else 0


if __name__ == "__main__":
    sys.exit(main())
