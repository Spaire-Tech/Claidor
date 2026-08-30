"""Did the flagship check actually look? — the denominator, per model.

    cd server && uv run python -m scripts.e3c_coverage CORPUS_DIR OUT.json

Zero findings is two different sentences. « It read 400 rows across
this model's dated blocks and none of them breaks its own pattern » is
a result. « It found nothing to read » is a silence, and on the
closed-deal corpus that was the answer for 6 of 22 models.

The gate sweep records findings, not denominators, and its output
format is compared byte-for-byte against the golden master — so this
asks the same engine the separate question, and prints per model:

- the dated blocks the model lays out, and their granularities;
- the rows that **declared a kind** across a comparable pair, which is
  the population the rule judges;
- the findings raised;
- the abstention, in the engine's own words, when there is one.

One JSON per model as it goes, so a restart costs the remainder and
not the run.
"""

import json
import sys
import time
from pathlib import Path
from typing import Any

from polar.tieout.audit import audit
from polar.tieout.structure import read_structure
from polar.tieout.units.periods import blocks_from_dates, date_axes
from polar.tieout.workbook import read_workbook

RULE = "broken-aggregation"


def _one(path: Path, root: Path) -> dict[str, Any]:
    started = time.time()
    book = read_workbook(str(path))
    blocks = blocks_from_dates(date_axes(book.cells))
    result = audit(book, read_structure(book).axes)
    tally = result.tallies.get(RULE)
    why = next((a.why for a in result.abstentions if a.rule == RULE), "")
    return {
        "file": str(path.relative_to(root)),
        "cells": len(book.cells),
        "blocks": {b.sheet: b.granularity for b in blocks},
        "patterned_rows": tally["total"] if tally else 0,
        "raised": tally["raised"] if tally else 0,
        "abstained": why,
        "seconds": round(time.time() - started, 1),
    }


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    rows: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*.xls[xm]")):
        try:
            row = _one(path, root)
        except Exception as error:
            row = {"file": str(path.relative_to(root)), "error": repr(error)[:200]}
        rows.append(row)
        out.write_text(json.dumps(rows, indent=1))
        print(
            f"done {row['file']}: "
            + (
                row["error"]
                if "error" in row
                else (
                    f"{len(row['blocks'])} dated blocks, "
                    f"{row['patterned_rows']} patterned rows, "
                    f"{row['raised']} raised"
                    + (f" — abstained: {row['abstained']}" if row["abstained"] else "")
                )
            ),
            flush=True,
        )

    spoke = [r for r in rows if r.get("patterned_rows")]
    print(
        f"\ncoverage: the check spoke on {len(spoke)} of {len(rows)} models, "
        f"reading {sum(r['patterned_rows'] for r in spoke)} patterned rows "
        f"and raising {sum(r['raised'] for r in spoke)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
