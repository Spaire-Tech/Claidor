"""What a header-free units-column detector finds, and where.

    cd server && uv run python -m scripts.recalc_units_columns OUT.json

Measured on **recall of declarations**, never against a units column
— my 3,796-row answer key *is* ED2's and GD3's units column, and
scoring E2 against something it now reads would be circular
(registration, lane log 28 Aug).

Two questions only:

1. On ED2 and GD3, does it find what the header-based finder finds?
   If it disagrees where I know the answer it is not ready for files
   where I do not.
2. On the eight closed-deal models, where the header-based finder
   found **zero**, does it find anything? That zero is what made the
   generalisation round unmeasurable, and it may have been my
   finder's fault rather than the corpus's.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from polar.tieout.units.columns import cells_with_text, find_units_columns
from scripts.recalc_units_score import MODELS, units_column

SFT = Path("scripts/corpus_sft")


def report_on(path: str, header_based: bool) -> dict:
    cells = cells_with_text(path)
    sheets = sorted({cell.sheet for cell in cells.values()})
    found = []
    for sheet in sheets:
        found.extend(find_units_columns(cells, sheet))
    by_header = units_column(path) if header_based else {}
    detected = {(d.sheet, d.row) for d in found}
    header_rows = set(by_header)
    return {
        "sheets": len(sheets),
        "declarations_found": len(found),
        "columns_used": len({(d.sheet, d.column) for d in found}),
        "header_based_rows": len(header_rows),
        "found_and_header": len(detected & header_rows),
        "found_only": len(detected - header_rows),
        "header_only": len(header_rows - detected),
        "top_texts": Counter(d.text for d in found).most_common(8),
        "sample": [
            {"sheet": d.sheet, "row": d.row, "text": d.text, "column": d.column}
            for d in found[:6]
        ],
    }


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("units-columns.json")
    report = {}
    for key, path in MODELS.items():
        report[key] = report_on(path, header_based=True)
        r = report[key]
        print(
            f"{key}: {r['declarations_found']} declarations from "
            f"{r['columns_used']} columns | header-based {r['header_based_rows']}, "
            f"both {r['found_and_header']}, detector-only {r['found_only']}, "
            f"header-only {r['header_only']}",
            flush=True,
        )
    for path in sorted(SFT.glob("*.xlsm")):
        report[path.name] = report_on(str(path), header_based=False)
        r = report[path.name]
        print(
            f"{path.name}: {r['declarations_found']} declarations from "
            f"{r['columns_used']} columns  {r['top_texts'][:4]}",
            flush=True,
        )
    out.write_text(json.dumps(report, indent=1))
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
