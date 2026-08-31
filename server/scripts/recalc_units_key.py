"""Step 1 of the generalisation round: count the answer key, first.

    cd server && uv run python -m scripts.recalc_units_key OUT.json

The registration (lane log, 28 Aug) fixes the order: before any
accuracy number, count how many rows across the closed-deal corpus
carry a declared unit E2 could be graded against — a `Units` column,
or a currency in a cell's number format. **This number is reported
whatever it is**, and no per-dimension accuracy is quoted on fewer
than 100 keyed rows. « The corpus has no key » is a finding about
the corpus; inventing one would be grading myself.

One file at a time, per the heavy-job rule.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook

from scripts.recalc_units_score import truth_from_units, units_column

CORPUS = Path("scripts/corpus_sft")

#: What « a currency in the number format » means, same test the
#: inference uses.
CURRENCY_SIGNS = ("£", "$", "€")


def currency_formats(path: str) -> tuple[int, int, Counter]:
    """(cells with a currency-bearing format, cells seen, format tally)."""
    book = load_workbook(path, read_only=True, data_only=True)
    bearing, seen = 0, 0
    tally: Counter = Counter()
    try:
        for sheet in book.worksheets:
            for row in sheet.iter_rows():
                for cell in row:
                    if cell.value is None:
                        continue
                    seen += 1
                    fmt = cell.number_format or "General"
                    if any(sign in fmt for sign in CURRENCY_SIGNS):
                        bearing += 1
                        tally[fmt] += 1
    finally:
        book.close()
    return bearing, seen, tally


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("units-key.json")
    models = sorted(CORPUS.glob("*.xlsm"))
    if not models:
        print(f"no readable models under {CORPUS} — run scripts.corpus_sft_models")
        return 1
    report: dict[str, object] = {}
    total_keyed = 0
    for path in models:
        declared = units_column(str(path))
        gradeable = {
            key: text for key, text in declared.items() if truth_from_units(text)
        }
        bearing, seen, tally = currency_formats(str(path))
        total_keyed += len(gradeable)
        report[path.name] = {
            "rows_with_units_text": len(declared),
            "rows_gradeable": len(gradeable),
            "cells_with_currency_format": bearing,
            "cells_seen": seen,
            "top_currency_formats": dict(tally.most_common(3)),
            "sample_units_text": sorted({t for t in declared.values()})[:8],
        }
        print(
            f"{path.name}: {len(declared)} rows carry Units text, "
            f"{len(gradeable)} of them gradeable; "
            f"{bearing} of {seen} cells have a currency-bearing format",
            flush=True,
        )
    report["_total_gradeable_rows"] = total_keyed
    verdict = (
        "measurable" if total_keyed >= 100 else "UNMEASURABLE — no key worth grading"
    )
    report["_verdict"] = verdict
    print(
        f"\ntotal gradeable rows across {len(models)} models: {total_keyed} — {verdict}"
    )
    out.write_text(json.dumps(report, indent=1))
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
