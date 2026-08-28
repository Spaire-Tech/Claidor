"""The analytical half of the gate: findings, tallies and abstentions.

`corpus_gate.py` calls `audit()` only, so a change to what the reader
elects can move an *analytical* finding with the gate staying green.
This sweeps the same corpus through the structure and analytics
layers and records everything a later diff might need.

**Tallies and abstentions are recorded, not just findings.** The
own-check round captured findings alone, and when a coverage
question arose afterwards its artifacts could not answer it and the
measurement had to be retaken.

    uv run python -m scripts.analytics_gate <corpus-dir> <out.json>
    uv run python -m scripts.analytics_gate --diff <before.json> <after.json>
"""

import json
import sys
import time
import warnings
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")


def one(path: Path) -> dict[str, Any]:
    from polar.tieout.analytics import run_analytics
    from polar.tieout.structure import read_structure
    from polar.tieout.workbook import read_workbook

    started = time.time()
    book = read_workbook(str(path))
    structure = read_structure(book)
    told = run_analytics(book, structure)
    return {
        "file": path.name,
        "cells": len(book.cells),
        "findings": sorted(
            (
                {
                    "rule": f.rule,
                    "sheet": getattr(f, "sheet", ""),
                    "ref": getattr(f, "ref", ""),
                    "detail": getattr(f, "detail", ""),
                }
                for f in told.findings
            ),
            key=lambda f: (f["rule"], f["ref"]),
        ),
        "abstentions": sorted(
            ({"rule": a.rule, "why": a.why} for a in told.abstentions),
            key=lambda a: (a["rule"], a["why"]),
        ),
        "tallies": told.tallies,
        "seconds": round(time.time() - started, 1),
    }


def diff(before: Path, after: Path) -> int:
    was = {r["file"]: r for r in json.loads(before.read_text())}
    now = {r["file"]: r for r in json.loads(after.read_text())}
    moved = 0
    for name in sorted(set(was) | set(now)):
        a, b = was.get(name), now.get(name)
        if a is None or b is None:
            print(f"{name}: present in only one sweep")
            moved += 1
            continue
        old = {(f["rule"], f["ref"], f["detail"]) for f in a["findings"]}
        new = {(f["rule"], f["ref"], f["detail"]) for f in b["findings"]}
        for gone in sorted(old - new):
            print(f"{name}: GONE    {gone[0]} {gone[1]} :: {gone[2][:90]}")
            moved += 1
        for came in sorted(new - old):
            print(f"{name}: NEW     {came[0]} {came[1]} :: {came[2][:90]}")
        if a["tallies"] != b["tallies"]:
            print(f"{name}: tallies {a['tallies']} -> {b['tallies']}")
        if a["abstentions"] != b["abstentions"]:
            print(f"{name}: abstentions moved")
    total_old = sum(len(r["findings"]) for r in was.values())
    total_new = sum(len(r["findings"]) for r in now.values())
    print(f"--- analytical findings {total_old} -> {total_new}; "
          f"{moved} existing findings moved or lost ---")
    return moved


def main() -> None:
    if sys.argv[1] == "--diff":
        raise SystemExit(1 if diff(Path(sys.argv[2]), Path(sys.argv[3])) else 0)
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    results: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*.xls[xm]")):
        if path.name.startswith("._"):
            continue
        try:
            results.append(one(path))
        except Exception as problem:
            results.append({"file": path.name,
                            "refused": f"{type(problem).__name__}: {str(problem)[:150]}"})
        row = results[-1]
        print(f"done {row['file']}: {len(row.get('findings', []))} analytical"
              f"{' REFUSED' if 'refused' in row else ''} "
              f"in {row.get('seconds', 0)}s", flush=True)
        out.write_text(json.dumps(results, indent=1))
    print(f"analytics sweep complete: {len(results)} files", flush=True)


if __name__ == "__main__":
    main()
