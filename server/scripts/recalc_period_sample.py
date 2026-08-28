"""Draw the `period` answer key's sample — unlabelled, by a fixed rule.

    cd server && uv run python -m scripts.recalc_period_sample OUT.json

Per the registration (lane log, 28 Aug): I wrote the inference, so I
must not write its key. This draws the sample **mechanically** and
commits it with **no E2 output of any kind**, for the lead or the
founder to label. The seed is fixed and the rule is here, so a draw
made to flatter the instrument would be visible in the code.

Stratified by corpus dialect because the orders require accuracy per
dialect rather than blended — and Kelso's monthly sheets are their
own stratum, because one model carries the entire monthly capability
we hold and 40 uniform rows would drown it.

Each row carries what a human needs to judge its period and nothing
else: the sheet, the row label, the column headers above its values,
the number formats, and the first few values.
"""

import json
import random
import sys
from pathlib import Path

from polar.tieout.units.columns import cells_with_text, find_units_columns
from polar.tieout.units.declarations import parse_declaration
from polar.tieout.units.inference import rows_from_cells
from polar.tieout.workbook import read_workbook

SEED = 11
PER_STRATUM = 40

#: dialect -> the files that speak it. Kelso's monthly sheets are
#: split out below rather than listed here.
DIALECTS: dict[str, list[str]] = {
    "ofgem-regulator": [
        "scripts/corpus_au_uk/ofgem_ed2/v5_2026-06.xlsx",
        "scripts/corpus_au_uk/ofgem_riio3/draft/DRAFT_GD3 PCFM_Jun25.xlsx",
    ],
    "caa-h7": [
        "scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fds.xlsx",
        "scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fp.xlsx",
    ],
    "rate-models": [
        "scripts/corpus_au_uk/ofgem_riio3/draft/"
        "RIIO GDT3 Allowed Return on Equity Summary File_Draft Determinations_Jun25.xlsx",
    ],
    "closed-deal": [
        "scripts/corpus_sft/baldragon_model.xlsm",
        "scripts/corpus_sft/forfar_model.xlsm",
        "scripts/corpus_sft/levenmouth_model.xlsm",
    ],
    "closed-deal-monthly": ["scripts/corpus_sft/kelso_model.xlsm"],
}

#: The sheets whose columns are months, from the file's own naming
#: and verified by reading their headers (lane log, 28 Aug).
KELSO_MONTHLY = (
    "sysTimeline",
    "inputCapexM",
    "inputOpexM",
    "calcFundingM",
    "Interface Constn",
    "Interf Constn Ops costs",
)


def eligible(path: str, only_sheets: tuple[str, ...] | None = None) -> list[dict]:
    """Rows a human could label: numbers, under headers, not a switch."""
    cells = read_workbook(path).cells
    declared: dict[tuple[str, int], str] = {}
    try:
        texts = cells_with_text(path)
        for sheet in sorted({c.sheet for c in texts.values()}):
            for found in find_units_columns(texts, sheet):
                declared[(found.sheet, found.row)] = found.text
    except Exception:
        declared = {}
    out = []
    for sheet in sorted({cell.sheet for cell in cells.values()}):
        if only_sheets and sheet not in only_sheets:
            continue
        for evidence in rows_from_cells(cells, sheet):
            headers = [h for h in evidence.column_labels if h.strip()]
            if not headers or not evidence.values:
                continue
            text = declared.get((sheet, evidence.row))
            if text and parse_declaration(text).not_a_unit:
                continue
            out.append(
                {
                    "file": Path(path).name,
                    "sheet": sheet,
                    "row": evidence.row,
                    "row_label": evidence.row_label,
                    "column_headers": headers[:8],
                    "number_formats": list(evidence.number_formats)[:3],
                    "values": [round(float(v), 4) for v in evidence.values[:5]],
                    "declared_units": text,
                }
            )
    return out


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("e3-period-sample.json")
    rng = random.Random(SEED)
    sample: list[dict] = []
    counts = {}
    for dialect, paths in DIALECTS.items():
        pool: list[dict] = []
        for path in paths:
            sheets = KELSO_MONTHLY if dialect == "closed-deal-monthly" else None
            pool.extend(eligible(path, sheets))
        drawn = rng.sample(pool, min(PER_STRATUM, len(pool)))
        for row in drawn:
            row["dialect"] = dialect
            row["period"] = None  # for the labeller; never filled here
        counts[dialect] = {"eligible": len(pool), "drawn": len(drawn)}
        sample.extend(drawn)
        print(f"{dialect}: {len(pool)} eligible, {len(drawn)} drawn", flush=True)
    payload = {
        "seed": SEED,
        "per_stratum": PER_STRATUM,
        "drawn_by": "scripts/recalc_period_sample.py",
        "labelled_by": "NOT YET LABELLED — for the lead or the founder",
        "instructions": (
            'For each row, set "period" to one of: annual, monthly, '
            "quarterly, half-yearly, point-in-time, none (the row is not a "
            "flow through time), or unknown (the evidence does not say). "
            "Judge from the row label, the column headers and the values. "
            "Do not consult E2; its answers are deliberately absent."
        ),
        "counts": counts,
        "rows": sample,
    }
    out.write_text(json.dumps(payload, indent=1))
    print(f"\nwrote {out} — {len(sample)} rows, unlabelled")
    return 0


if __name__ == "__main__":
    sys.exit(main())
