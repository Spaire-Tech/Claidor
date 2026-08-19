"""The golden-master corpus gate.

The observation that earned it: after the flood collapses, every corpus
file the change was not aimed at reported byte-identically. Promoted —
on the mentor's direction — from an observation to a permanent gate:
**any engine change runs the corpus, and the diff must be empty except
where intended.**

The protocol:

1. Rebuild the corpus from `docs/pierce/corpus-au-uk-manifest.md`
   (the files are public and not committed; the manifest is).
2. Sweep it:   python scripts/corpus_gate.py sweep  CORPUS_DIR OUT.json
3. Compare:    python scripts/corpus_gate.py diff   BASELINE.json OUT.json
   Exit 0 means every file reports identically, finding for finding —
   rule, severity, ref, figure and detail all equal, not just counts.
4. An engine change that *means* to change reports regenerates the
   baseline (`docs/pierce/corpus-golden-master.json`) and commits it
   with the change — the baseline's own git diff is the review
   artifact, file by file, finding by finding.

Run from `server/` so `polar` imports.
"""

import json
import sys
import time
import traceback
from collections import Counter
from pathlib import Path
from typing import Any


def sweep(root: Path, out: Path) -> None:
    from polar.tieout.audit import audit
    from polar.tieout.structure import read_structure
    from polar.tieout.workbook import read_workbook

    rows: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*.xls[xm]")):
        name = str(path.relative_to(root))
        started = time.time()
        try:
            book = read_workbook(str(path))
            result = audit(book, read_structure(book).axes)
            rows.append(
                {
                    "file": name,
                    "sheets": len(book.sheets),
                    "cells": len(book.cells),
                    "errors": len(result.errors),
                    "smells": len(result.smells),
                    "by_rule": dict(Counter(f.rule for f in result.findings)),
                    "findings": [
                        {
                            "rule": f.rule,
                            "severity": f.severity,
                            "ref": f.ref,
                            "figure": f.figure,
                            "detail": f.detail,
                        }
                        for f in result.findings
                    ],
                    "seconds": round(time.time() - started, 1),
                }
            )
            print(
                f"done {name}: {len(rows[-1]['findings'])} findings "
                f"in {rows[-1]['seconds']}s",
                flush=True,
            )
        except Exception as problem:
            rows.append({"file": name, "failed": str(problem)[:200]})
            print(f"FAIL {name}: {problem}", flush=True)
            traceback.print_exc()
        out.write_text(json.dumps(rows, indent=1))
    print("sweep complete:", len(rows), "files")


def _reports(rows: list[dict[str, Any]]) -> dict[str, list[tuple[Any, ...]]]:
    return {
        row["file"]: [
            (f["rule"], f["severity"], f["ref"], f["figure"], f["detail"])
            for f in row.get("findings", [])
        ]
        for row in rows
    }


def diff(baseline: Path, current: Path) -> int:
    before = _reports(json.loads(baseline.read_text()))
    after = _reports(json.loads(current.read_text()))
    clean = True
    for name in sorted(set(before) | set(after)):
        if name not in before:
            print(f"NEW FILE {name}: {len(after[name])} findings (not in baseline)")
            clean = False
            continue
        if name not in after:
            print(f"MISSING {name}: in baseline, not swept")
            clean = False
            continue
        old, new = before[name], after[name]
        if old == new:
            continue
        clean = False
        gone = [f for f in old if f not in new]
        came = [f for f in new if f not in old]
        print(f"CHANGED {name}: {len(old)} -> {len(new)} findings")
        for f in gone:
            print(f"  - {f[0]} {f[2]} | {str(f[4])[:90]}")
        for f in came:
            print(f"  + {f[0]} {f[2]} | {str(f[4])[:90]}")
    if clean:
        print("gate clean: every file reports identically, finding for finding")
    return 0 if clean else 1


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "sweep":
        sweep(Path(sys.argv[2]), Path(sys.argv[3]))
    elif len(sys.argv) == 4 and sys.argv[1] == "diff":
        raise SystemExit(diff(Path(sys.argv[2]), Path(sys.argv[3])))
    else:
        print(__doc__)
        raise SystemExit(2)
