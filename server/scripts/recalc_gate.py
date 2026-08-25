"""B2 — the fidelity gate over a corpus, one file at a time, honestly.

The keystone question, per `swens-plan.md` B2: recalculate every
corpus file **unchanged** and diff against Excel's own stored values,
cell by cell, under the registered tolerance rules
(`polar/tieout/recalc/gate.py`). Files whose formulas carry denylisted
constructs (LAMBDA, CUBE*, RTD, UDFs, external links) are routed —
arbiter or refusal — and never gated by LibreOffice; « we did not
check this » is on the report, a silently wrong number never is.
**No behavioural check ever runs on a file that failed its gate.**

    cd server && uv run python -m scripts.recalc_gate CORPUS_DIR OUT.json [TIMEOUT_S]

`CORPUS_DIR` may also be a single spreadsheet, for a registered
re-run of one file; `TIMEOUT_S` overrides the per-document calculator
timeout (default 1800) for the corpus's slowest monsters.

Discipline encoded here, from the lane rules and the toolbox:

- Heavy workbook jobs run alone: files go strictly one at a time,
  and each file gets a **fresh** soffice (recycle N=1 — the leak
  lesson, taken at its most conservative). Timings on the shared box
  are noise and are recorded only as coarse context; match rates are
  the result.
- The output is written incrementally (one JSON line per file to
  `OUT.json.partial`, consolidated at the end), so an OOM-killed
  sweep still shows exactly how far it got and what it found.
- A reader failure or a calculator failure is a recorded per-file
  outcome, not a crash of the sweep.

The registered claim shape: per file — verdict, formula cells
compared, matched, match rate, every mismatching ref (first 25 spelled
out with both values and the allowed tolerance), unreturned and
uncached counts, denylist hits with their route, and the engine
string. Nothing else is claimed.
"""

import json
import sys
import time
from pathlib import Path
from typing import Any

from polar.tieout.recalc.denylist import prescan, route_for
from polar.tieout.recalc.gate import gate_file, read_calc_settings
from polar.tieout.recalc.uno_calc import UnoCalculator, find_install
from polar.tieout.workbook import read_workbook

SPREADSHEETS = (".xlsx", ".xlsm")
MISMATCH_SAMPLE = 25


def sweep_file(path: Path, document_timeout: float = 1800.0) -> dict[str, Any]:
    record: dict[str, Any] = {"file": path.name}
    started = time.monotonic()
    try:
        cells = read_workbook(str(path)).cells
    except Exception as error:
        record["outcome"] = "reader-failed"
        record["error"] = f"{type(error).__name__}: {error}"
        return record

    hits = prescan(cells)
    route = route_for(hits)
    if route is not None:
        report = gate_file(cells, {}, refusals=hits, route=route)
        record["outcome"] = report.verdict
        record["route"] = str(route)
        record["denylist"] = sorted({f"{hit.category}:{hit.target}" for hit in hits})[
            :25
        ]
        record["denylist_cells"] = len(hits)
        return record

    calculator = UnoCalculator(document_timeout=document_timeout)
    try:
        calculator.start()
        result = calculator.recalculate(str(path))
    except Exception as error:
        record["outcome"] = "recalc-failed"
        record["error"] = f"{type(error).__name__}: {error}"
        return record
    finally:
        calculator.stop()

    settings = read_calc_settings(str(path))
    report = gate_file(cells, result.values, settings=settings)
    record["outcome"] = report.verdict
    record["engine"] = result.engine
    record["iterative_file"] = settings.iterative
    record["compared"] = report.compared
    record["matched"] = report.matched
    record["match_rate"] = report.match_rate
    record["mismatched"] = len(report.mismatches)
    record["mismatches"] = [
        {
            "ref": diff.ref,
            "stored": str(diff.stored),
            "computed": diff.computed,
            "tolerance": diff.tolerance,
        }
        for diff in report.mismatches[:MISMATCH_SAMPLE]
    ]
    record["no_stored_value"] = len(report.no_stored_value)
    record["not_computed"] = len(report.not_computed)
    record["not_computed_sample"] = report.not_computed[:10]
    record["seconds_coarse"] = round(time.monotonic() - started, 1)
    return record


def main() -> int:
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        return 2
    corpus, out = Path(sys.argv[1]), Path(sys.argv[2])
    document_timeout = float(sys.argv[3]) if len(sys.argv) == 4 else 1800.0
    if find_install() is None:
        print("no LibreOffice >= 25.8 here — run dev/setup-libreoffice; refusing")
        return 1
    if corpus.is_file():
        files = [corpus]
    else:
        files = sorted(p for p in corpus.rglob("*") if p.suffix.lower() in SPREADSHEETS)
    if not files:
        print(f"no spreadsheets under {corpus}; nothing to claim")
        return 1

    partial = out.with_suffix(out.suffix + ".partial")
    records = []
    with partial.open("w") as journal:
        for i, path in enumerate(files, 1):
            print(f"[{i}/{len(files)}] {path.name}", flush=True)
            record = sweep_file(path, document_timeout)
            records.append(record)
            journal.write(json.dumps(record) + "\n")
            journal.flush()
            print(f"    -> {record['outcome']}", flush=True)

    gated = [r for r in records if r["outcome"] in ("pass", "fail")]
    summary = {
        "files": len(records),
        "pass": sum(1 for r in records if r["outcome"] == "pass"),
        "fail": sum(1 for r in records if r["outcome"] == "fail"),
        "refused": sum(1 for r in records if r["outcome"] == "refused"),
        "nothing_compared": sum(
            1 for r in records if r["outcome"] == "nothing-compared"
        ),
        "reader_failed": sum(1 for r in records if r["outcome"] == "reader-failed"),
        "recalc_failed": sum(1 for r in records if r["outcome"] == "recalc-failed"),
        "cells_compared": sum(r.get("compared", 0) for r in gated),
        "cells_matched": sum(r.get("matched", 0) for r in gated),
    }
    out.write_text(json.dumps({"summary": summary, "files": records}, indent=1))
    partial.unlink()
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
