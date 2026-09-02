"""The Enron sweep — every workbook in the SheetJS/enron_xls corpus
through the static engine, streamed so it fits on a small disk.

Registered in `docs/pierce/enron-sweep.md` before any result was
looked at. The corpus is never committed and is internal measurement
only (see the licensing note in `scripts/corpus_formulas.py`).

The clone is a partial one — tree only, no blobs — because the full
checkout is larger than this container's free disk. Files are checked
out in batches, hashed, audited, and deleted; only the JSONL of
results stays. Every file is hashed against `HELD` (the md5 set of
every workbook already held here) so a benchmark file cannot enter a
sample as « unseen ».

    cd server && uv run python -m scripts.corpus_enron REPO_DIR OUT.jsonl HELD.txt

One worker process per audit, killed at `TIMEOUT` seconds, so one
pathological file cannot stop the sweep. Resumable: files already in
OUT.jsonl are skipped.
"""

from __future__ import annotations

import hashlib
import json
import multiprocessing as mp
import os
import subprocess
import sys
import time
import traceback
from collections import Counter
from pathlib import Path
from typing import Any

BATCH = 40
WORKERS = 3
TIMEOUT = 600


def _audit_one(path: str) -> dict[str, Any]:
    from polar.tieout.audit import audit
    from polar.tieout.structure import read_structure
    from polar.tieout.workbook import read_workbook

    started = time.time()
    book = read_workbook(path)
    structure = read_structure(book)
    result = audit(book, structure.axes)
    formulas = sum(1 for c in book.cells.values() if c.formula is not None)
    return {
        "sheets": len(book.sheets),
        "cells": len(book.cells),
        "formulas": formulas,
        "axes": len(structure.axes),
        "errors": len(result.errors),
        "smells": len(result.smells),
        "by_rule": dict(Counter(f.rule for f in result.findings)),
        "by_tier": dict(Counter(str(f.tier) for f in result.findings)),
        "abstentions": [a.rule for a in result.abstentions],
        "findings": [
            {
                "rule": f.rule,
                "severity": f.severity,
                "ref": f.ref,
                "sheet": f.sheet,
                "name": f.name,
                "figure": f.figure,
                "figure_unit": f.figure_unit,
                "detail": f.detail,
                "kind": f.kind,
                "tier": f.tier,
                "weight": f.weight,
                "cells": f.cells,
                "formula": f.formula,
            }
            for f in result.findings
        ],
        "seconds": round(time.time() - started, 1),
    }


def _worker(path: str, queue: Any) -> None:
    try:
        queue.put(_audit_one(path))
    except Exception as problem:
        queue.put({"failed": f"{type(problem).__name__}: {str(problem)[:300]}"})


def _run_with_timeout(path: str) -> dict[str, Any]:
    ctx = mp.get_context("fork")
    queue: Any = ctx.Queue()
    proc = ctx.Process(target=_worker, args=(path, queue))
    proc.start()
    try:
        row = queue.get(timeout=TIMEOUT)
    except Exception:
        row = {"failed": "timeout" if proc.is_alive() else "worker died"}
    finally:
        if proc.is_alive():
            proc.kill()
        proc.join()
    return row


def _md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main(argv: list[str]) -> int:
    repo, out, held_path = Path(argv[1]), Path(argv[2]), Path(argv[3])
    held = set(held_path.read_text().split())
    done: set[str] = set()
    if out.exists():
        with out.open() as handle:
            for line in handle:
                try:
                    done.add(json.loads(line)["file"])
                except (ValueError, KeyError):
                    continue
    names = [
        line
        for line in subprocess.run(
            ["git", "ls-tree", "-r", "--name-only", "HEAD"],
            cwd=repo,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.splitlines()
        if line.lower().endswith((".xls", ".xlsx", ".xlsm", ".xlsb"))
    ]
    todo = [n for n in names if n not in done]
    print(f"{len(names)} workbooks, {len(done)} done, {len(todo)} to go", flush=True)

    with out.open("a") as sink:
        for start in range(0, len(todo), BATCH):
            batch = todo[start : start + BATCH]
            subprocess.run(
                ["git", "checkout", "-q", "HEAD", "--", *batch],
                cwd=repo,
                check=False,
                capture_output=True,
            )
            pending: list[tuple[str, Path]] = [
                (name, repo / name) for name in batch if (repo / name).exists()
            ]
            for name in batch:
                if not (repo / name).exists():
                    sink.write(
                        json.dumps({"file": name, "failed": "not fetched"}) + "\n"
                    )
            # A small pool: each audit is its own process already, so the
            # pool only bounds how many run at once.
            with mp.get_context("fork").Pool(WORKERS) as pool:
                results = pool.map(_sweep_one, [(n, str(p)) for n, p in pending])
            for row in results:
                row_hash = row.get("md5", "")
                row["held"] = row_hash in held
                sink.write(json.dumps(row) + "\n")
            sink.flush()
            for _name, path in pending:
                try:
                    path.unlink()
                except OSError:
                    pass
            print(
                f"batch {start // BATCH + 1}: {len(pending)} audited, "
                f"{sum(1 for r in results if 'failed' in r)} failed",
                flush=True,
            )
    return 0


def _sweep_one(item: tuple[str, str]) -> dict[str, Any]:
    name, path = item
    row: dict[str, Any] = {"file": name, "bytes": os.path.getsize(path)}
    try:
        row["md5"] = _md5(Path(path))
    except OSError as problem:
        row["failed"] = f"unreadable: {problem}"
        return row
    try:
        row.update(_run_with_timeout(path))
    except Exception as problem:
        row["failed"] = f"{type(problem).__name__}: {str(problem)[:300]}"
        traceback.print_exc()
    return row


if __name__ == "__main__":
    sys.exit(main(sys.argv))
