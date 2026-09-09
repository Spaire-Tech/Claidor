"""Measure the previous-version rule on one draft → final pair
(`docs/pierce/overwritten-since.md`).

    PYTHONPATH=. uv run python scripts/overwritten_measure.py DRAFT FINAL OUT.json

Reads both files, runs the rule alone (timed) and the whole audit of
the final with the draft as the version before, and writes every
`formula-overwritten` finding with its cells, both formulas and the
detail — nothing else, so the hand reading sees the rule's output as
the product would show it.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from polar.tieout.audit import Audit, audit
from polar.tieout.revision import RULE, overwritten_since
from polar.tieout.structure import period_axes
from polar.tieout.workbook import read_workbook


def main(argv: list[str]) -> None:
    draft_path, final_path, out = argv[1], argv[2], Path(argv[3])
    started = time.time()
    draft = read_workbook(draft_path)
    final = read_workbook(final_path)
    read_seconds = round(time.time() - started, 1)

    alone = Audit(examined=len(final.cells))
    started = time.time()
    overwritten_since(final, draft, alone)
    rule_seconds = round(time.time() - started, 1)

    result = audit(final, axes=period_axes(final), previous=draft)
    findings = [f for f in result.findings if f.rule == RULE]
    record = {
        "draft": draft_path,
        "final": final_path,
        "read_seconds": read_seconds,
        "rule_seconds": rule_seconds,
        "tally": result.tallies.get(RULE),
        "abstained": [a.why for a in result.abstentions if a.rule == RULE],
        "rows": len(findings),
        "cells": sum(len(f.cells.split(", ")) for f in findings),
        "findings": [
            {
                "ref": f.ref,
                "sheet": f.sheet,
                "label": f.name,
                "cells": f.cells,
                "typed": f.formula,
                "was": f.against,
                "detail": f.detail,
                "weight": f.weight,
            }
            for f in findings
        ],
    }
    out.write_text(json.dumps(record, indent=1, ensure_ascii=False))
    print(
        f"{Path(final_path).name}: {record['rows']} rows / {record['cells']} cells | "
        f"tally {record['tally']} | rule {rule_seconds}s | reads {read_seconds}s → {out}",
        flush=True,
    )


if __name__ == "__main__":
    main(sys.argv)
