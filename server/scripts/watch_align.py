"""Run the Watch's C2 alignment on two saved versions, with the meter on.

This is also the registered cost measurement's instrument: per
sheet it times signature build, row alignment and column alignment,
and reports sheet sizes so the O(n⁴) term can be seen against real
dimensions. Self-alignment (`OLD == NEW`) is the identity-shortcut
best case; a real adjacent pair is the honest one.

    uv run python -m scripts.watch_align OLD.xlsx NEW.xlsx OUT.json
"""

import json
import resource
import sys
import time
from pathlib import Path
from typing import Any

from polar.tieout.audit import _shape_of
from polar.tieout.watch import align_sheet, sheet_grids, structural_changes
from polar.tieout.workbook import Workbook, read_workbook, tokens_of


def _read(path: str) -> tuple[Workbook, float]:
    started = time.monotonic()
    book = read_workbook(path)
    return book, time.monotonic() - started


def main() -> int:
    old_path, new_path, out_path = sys.argv[1:4]
    old_book, old_read = _read(old_path)
    new_book, new_read = (old_book, 0.0) if new_path == old_path else _read(new_path)

    started = time.monotonic()
    old_grids = sheet_grids(old_book)
    new_grids = sheet_grids(new_book)
    signature_seconds = time.monotonic() - started

    sheets: list[dict[str, Any]] = []
    total_changes = 0
    for sheet in new_grids:
        if sheet not in old_grids:
            sheets.append({"sheet": sheet, "state": "added"})
            continue
        old_grid, new_grid = old_grids[sheet], new_grids[sheet]
        started = time.monotonic()
        alignment = align_sheet(old_grid, new_grid)
        seconds = time.monotonic() - started
        changes = structural_changes(alignment)
        total_changes += len(changes)
        sheets.append(
            {
                "sheet": sheet,
                "rows_old": len(old_grid.rows),
                "rows_new": len(new_grid.rows),
                "columns_old": len(old_grid.columns),
                "columns_new": len(new_grid.columns),
                "align_seconds": round(seconds, 3),
                "rows_inserted": list(alignment.rows.inserted),
                "rows_deleted": list(alignment.rows.deleted),
                "columns_inserted": list(alignment.columns.inserted),
                "columns_deleted": list(alignment.columns.deleted),
                "changes": changes,
            }
        )
    for sheet in old_grids:
        if sheet not in new_grids:
            sheets.append({"sheet": sheet, "state": "removed"})

    # Engine caches are content-keyed; dropping them here keeps a
    # sweep's memory flat, exactly as the audit does after each file.
    tokens_of.cache_clear()
    _shape_of.cache_clear()

    result: dict[str, Any] = {
        "old": old_path,
        "new": new_path,
        "read_seconds": [round(old_read, 3), round(new_read, 3)],
        "signature_seconds": round(signature_seconds, 3),
        "align_seconds": round(sum(s.get("align_seconds", 0.0) for s in sheets), 3),
        "structural_changes": total_changes,
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024),
        "sheets": sorted(
            sheets,
            key=lambda s: -float(s.get("align_seconds", 0.0)),
        ),
    }
    Path(out_path).write_text(json.dumps(result, indent=1))
    summary = {k: v for k, v in result.items() if k != "sheets"}
    slowest = [s for s in result["sheets"] if "align_seconds" in s][:5]
    summary["slowest_sheets"] = [
        {
            "sheet": s["sheet"],
            "align_seconds": s["align_seconds"],
            "rows": s["rows_new"],
            "columns": s["columns_new"],
        }
        for s in slowest
    ]
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
