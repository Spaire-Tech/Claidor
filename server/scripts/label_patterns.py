"""Volume times price — mine what formula sits under each row label
(`docs/pierce/label-patterns.md`).

    PYTHONPATH=. uv run python scripts/label_patterns.py OUT.json FOLDER_OR_FILE [...]

For every labelled formula row of every workbook, the semantic shape
from `polar.tieout.meaning.patterns`: sorted function names, sorted
operators, sorted labels of the rows the formula reads. One pattern
per formula row, the commonest along the row. The output holds every
row so the aggregate, the sample and the held-out preview
(`label_patterns_report.py`) run without reading the corpora again.
Files are de-duplicated by content hash across folders.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

from polar.tieout.meaning.patterns import row_patterns
from polar.tieout.workbook import read_workbook


def mine(path: Path, folder: str) -> dict[str, Any]:
    started = time.time()
    book = read_workbook(str(path))
    read_seconds = round(time.time() - started, 1)
    started = time.time()
    rows = [
        {
            "sheet": one.sheet,
            "row": one.row,
            "label": one.label,
            "pattern": list(one.pattern),
            "cells": one.cells,
        }
        for one in row_patterns(book)
    ]
    return {
        "file": path.name,
        "folder": folder,
        "sha": hashlib.sha256(path.read_bytes()).hexdigest()[:16],
        "read_seconds": read_seconds,
        "mine_seconds": round(time.time() - started, 2),
        "rows": rows,
    }


def main(argv: list[str]) -> None:
    out = Path(argv[1])
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for root in argv[2:]:
        base = Path(root)
        files = [base] if base.is_file() else sorted(base.rglob("*.xls*"))
        for path in files:
            if path.suffix.lower() not in (".xlsx", ".xlsm", ".xls"):
                continue
            digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
            if digest in seen:
                print("skip duplicate", path.name, flush=True)
                continue
            seen.add(digest)
            try:
                one = mine(path, base.name if base.is_dir() else "held-out")
            except Exception as problem:
                print(
                    "FAIL",
                    path.name,
                    type(problem).__name__,
                    str(problem)[:120],
                    flush=True,
                )
                continue
            results.append(one)
            print(
                f"done {path.name}: {len(one['rows'])} labelled formula rows "
                f"(read {one['read_seconds']}s, mine {one['mine_seconds']}s)",
                flush=True,
            )
            out.write_text(json.dumps(results))
    print("mine complete:", len(results), "files")


if __name__ == "__main__":
    main(sys.argv)
