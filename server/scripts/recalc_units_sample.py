"""E1 — draw the registered sample of input rows, unlabelled.

    cd server && uv run python -m scripts.recalc_units_sample OUT.json

The population, the five models, the twenty-per-model and the seed
are registered in `docs/pierce/logs/dynamo.md` before this ran. The
output is the sample **with its evidence and no labels**: model,
sheet, row, row label, the column headers over each cell, the number
formats, and the values. Labelling happens afterwards, by hand, on
exactly these rows.
"""

import json
import random
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from typing import Any

from polar.tieout.workbook import read_workbook

SEED = 1727
PER_MODEL = 20

MODELS = {
    "ed2-v5": "scripts/corpus_au_uk/ofgem_ed2/v5_2026-06.xlsx",
    "h7-fds": "scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fds.xlsx",
    "roe": (
        "scripts/corpus_au_uk/ofgem_riio3/draft/RIIO GDT3 Allowed Return on "
        "Equity Summary File_Draft Determinations_Jun25.xlsx"
    ),
    "gd3-pcfm": "scripts/corpus_au_uk/ofgem_riio3/draft/DRAFT_GD3 PCFM_Jun25.xlsx",
    "final-wacc": "scripts/corpus_au_uk/ofgem_riio3/final_wacc.xlsx",
}


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    out = Path(sys.argv[1])
    sample: list[dict[str, Any]] = []
    for key, path in MODELS.items():
        cells = read_workbook(path).cells
        rows: dict[tuple[str, int], list[Any]] = defaultdict(list)
        for ref, cell in cells.items():
            if cell.formula is None and isinstance(cell.value, (int, float, Decimal)):
                rows[(cell.sheet, cell.row)].append(cell)
        keys = sorted(rows)
        rng = random.Random(f"{SEED}-{key}")
        drawn = rng.sample(keys, min(PER_MODEL, len(keys)))
        print(f"{key}: {len(keys)} input rows in population, drew {len(drawn)}")
        for sheet, row in sorted(drawn):
            group = sorted(rows[(sheet, row)], key=lambda c: c.column)
            sample.append(
                {
                    "model": key,
                    "sheet": sheet,
                    "row": row,
                    "row_label": (group[0].row_label or "").strip(),
                    "column_labels": [
                        (c.column_label or "").strip() for c in group[:8]
                    ],
                    "number_formats": sorted(
                        {c.number_format or "General" for c in group}
                    )[:4],
                    "values": [float(c.value) for c in group[:8]],
                    "cells": len(group),
                    "refs": [c.ref.split("!")[1] for c in group[:8]],
                }
            )
    out.write_text(json.dumps(sample, indent=1))
    print(f"wrote {len(sample)} rows to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
