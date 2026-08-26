"""Run C3's delta report on two versions of one model.

    uv run python -m scripts.watch_delta OLD.xlsx NEW.xlsx OUT.json [--parity]

`--parity` is V1 of the C3 registration: the same pair is run again,
independently, under the revision-defect study's own matching logic,
and the defect-delta numbers must agree exactly.

An honesty note on what parity can mean on this container.
`scripts.revision_diff` cannot even be *imported* here: it reads
findings through `scripts.regulator_eval` → `polar.tieout.ingest`,
and importing the ingest module trips the container's known
Python 3.14.0rc2 + pydantic breakage (the same one that forces
`--noconftest` on the tieout tests). So V1 splits into two halves:

- **Read-path equivalence, by source:** ingest's `_read_model`
  computes findings as exactly `read_workbook(path)` then
  `audit(book, axes=period_axes(book))` — the chain this script
  uses — and its only other book-touching step, `repair_outputs`,
  builds new Output objects and never mutates the workbook. Checked
  in the source and recorded in the lane log.
- **Matcher parity, by execution:** `_study_keyed` below is the
  study matcher's `keyed()` logic, kept verbatim (from
  `scripts.revision_diff`, its docstring cited), applied to a
  freshly re-read, re-audited pair — so a defect in how the delta
  report collects or counts findings cannot hide.
"""

import json
import sys
import time
from collections import Counter
from dataclasses import asdict
from pathlib import Path

from polar.tieout.audit import _shape_of, audit
from polar.tieout.structure import period_axes
from polar.tieout.watch import delta_report
from polar.tieout.workbook import read_workbook, tokens_of


def _study_keyed(defects: list) -> tuple[Counter, int]:
    """Verbatim from `scripts.revision_diff.keyed` (unimportable here —
    see the module docstring): « Multiset of matchable keys, and the
    count that could not be keyed. »"""
    keys: Counter = Counter()
    unmatched = 0
    for finding in defects:
        name = (finding.name or "").strip()
        if not name:
            unmatched += 1
            continue
        keys[(finding.rule, finding.sheet, name)] += 1
    return keys, unmatched


def _study_diff(old_path: str, new_path: str) -> dict:
    """The study's diff semantics on a freshly re-read, re-audited
    pair — the findings chain ingest's `_read_model` uses, minus the
    outputs step that never touches findings."""
    draft_book = read_workbook(old_path)
    draft = audit(draft_book, axes=period_axes(draft_book)).findings
    final_book = read_workbook(new_path)
    final = audit(final_book, axes=period_axes(final_book)).findings
    draft_keys, draft_unmatched = _study_keyed(draft)
    final_keys, final_unmatched = _study_keyed(final)
    return {
        "new": sum((final_keys - draft_keys).values()),
        "fixed": sum((draft_keys - final_keys).values()),
        "persistent": sum((draft_keys & final_keys).values()),
        "unmatched_draft": draft_unmatched,
        "unmatched_final": final_unmatched,
    }


def main() -> int:
    arguments = [a for a in sys.argv[1:] if a != "--parity"]
    parity = "--parity" in sys.argv
    old_path, new_path, out_path = arguments[:3]

    started = time.monotonic()
    report = delta_report(old_path, new_path)
    seconds = round(time.monotonic() - started, 1)
    tokens_of.cache_clear()
    _shape_of.cache_clear()

    payload = {
        "old": report.old,
        "new": report.new,
        "seconds": seconds,
        "summary": report.summary,
        "sheets_added": list(report.sheets_added),
        "sheets_removed": list(report.sheets_removed),
        "items": [asdict(item) for item in report.items[:400]],
    }
    print(json.dumps(report.summary, indent=1))
    for item in report.items[:25]:
        rows = f" rows {item.first_row}–{item.last_row}" if item.first_row else ""
        columns = f" [{','.join(item.columns)}]" if item.columns else ""
        print(f"  {item.kind}: {item.sheet}{rows}{columns}  {item.detail[:80]}")

    if parity:
        theirs = _study_diff(old_path, new_path)
        comparison = {
            "new": (report.new_defects, theirs["new"]),
            "fixed": (report.repaired_defects, theirs["fixed"]),
            "persistent": (report.persistent_defects, theirs["persistent"]),
            "unmatched_old": (report.unmatched_old, theirs["unmatched_draft"]),
            "unmatched_new": (report.unmatched_new, theirs["unmatched_final"]),
        }
        agree = all(mine == other for mine, other in comparison.values())
        payload["parity"] = {
            name: {"delta_report": mine, "revision_diff": other}
            for name, (mine, other) in comparison.items()
        }
        payload["parity_agrees"] = agree
        print(f"parity with scripts.revision_diff: {'EXACT' if agree else 'MISMATCH'}")
        for name, (mine, other) in comparison.items():
            marker = "==" if mine == other else "!="
            print(f"  {name}: {mine} {marker} {other}")

    Path(out_path).write_text(json.dumps(payload, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
