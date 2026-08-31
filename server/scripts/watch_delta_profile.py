"""Piece 9 — where the delta report's time actually goes, and the
full-fidelity report for the differential.

    uv run python -m scripts.watch_delta_profile OLD.xlsx NEW.xlsx OUT.json

Runs the delta pipeline's phases in the product's own order (reads,
both audits, grids, alignment, then `delta_of` with the findings
handed in) with a timer around each, so the phase budget is measured
rather than remembered. Then serializes the **entire** report — every
field of every item, no truncation — with a digest, so an optimisation
round can prove byte-identity before/after (`scripts.watch_delta`
truncates its payload at 400 items, which is right for reading and
wrong for a differential).

Timing on this container swings ±30% (`docs/pierce/a1-performance.md`);
a single number here is a shape, not a result. Only back-to-back A/B
runs of this script count.
"""

import hashlib
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path

from polar.tieout.audit import audit
from polar.tieout.structure import period_axes
from polar.tieout.watch import delta_of
from polar.tieout.watch.align import align_sheet
from polar.tieout.watch.delta import DeltaReport
from polar.tieout.watch.signature import sheet_grids
from polar.tieout.workbook import read_workbook


def report_payload(report: DeltaReport) -> dict:
    """The whole report, deterministically — the differential's subject."""
    return {
        "old": report.old,
        "new": report.new,
        "summary": report.summary,
        "sheets_added": list(report.sheets_added),
        "sheets_removed": list(report.sheets_removed),
        "changed_cells": report.changed_cells,
        "items": [asdict(item) for item in report.items],
    }


def main() -> int:
    old_path, new_path, out_path = sys.argv[1:4]
    phases: dict[str, float] = {}

    def timed(name: str, work):  # type: ignore[no-untyped-def]
        started = time.monotonic()
        result = work()
        phases[name] = round(time.monotonic() - started, 1)
        print(f"{name:<28} {phases[name]:>8.1f}s", flush=True)
        return result

    old_book = timed("read old", lambda: read_workbook(old_path))
    new_book = timed("read new", lambda: read_workbook(new_path))
    old_findings = timed(
        "audit old", lambda: audit(old_book, axes=period_axes(old_book)).findings
    )
    new_findings = timed(
        "audit new", lambda: audit(new_book, axes=period_axes(new_book)).findings
    )
    #: Cold after the audits under today's engine (each audit clears the
    #: parse caches when it finishes); the warm re-run directly after
    #: says how much of « grids » is really the shape pass.
    old_grids = timed("grids old (cold)", lambda: sheet_grids(old_book))
    new_grids = timed("grids new", lambda: sheet_grids(new_book))
    timed("grids old (warm rerun)", lambda: sheet_grids(old_book))
    timed(
        "align common sheets",
        lambda: [
            align_sheet(old_grids[sheet], new_grids[sheet])
            for sheet in old_grids
            if sheet in new_grids
        ],
    )
    report = timed(
        "delta_of (findings in hand)",
        lambda: delta_of(
            old_book,
            new_book,
            old_name=old_path,
            new_name=new_path,
            old_findings=old_findings,
            new_findings=new_findings,
        ),
    )

    payload = report_payload(report)
    body = json.dumps(payload, indent=1, sort_keys=True)
    digest = hashlib.sha256(body.encode()).hexdigest()
    Path(out_path).write_text(
        json.dumps({"digest": digest, "phases": phases, "report": payload}, indent=1)
    )
    print(f"report digest {digest[:16]}  items {len(payload['items'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
