"""Every check row the period restriction removes from the denominator.

One pass, at HEAD: for each file, admit check rows under today's rules
both before and after the period restriction, and name every row that
was examined before and is not examined after. This measures the
coverage effect directly rather than by differencing two sweeps.
"""

import gc
import json
import sys
import time
import warnings
from decimal import Decimal
from pathlib import Path

warnings.filterwarnings("ignore")
from openpyxl.utils import get_column_letter as L

from polar.tieout.analytics import _CHECKISH, ZERO_CELLS, ZERO_SHARE
from polar.tieout.structure import read_structure
from polar.tieout.workbook import read_workbook


def admitted(valued: list) -> bool:
    if len(valued) < ZERO_CELLS:
        return False
    zeros = sum(1 for _, v in valued if v == 0)
    return zeros / len(valued) >= ZERO_SHARE


def one(path: Path) -> dict:
    started = time.time()
    book = read_workbook(str(path))
    structure = read_structure(book)
    rows: dict = {}
    labels: dict = {}
    for cell in book.cells.values():
        label = cell.row_label.strip()
        if not label or not _CHECKISH.search(label):
            continue
        if cell.value is None or not isinstance(cell.value, Decimal):
            continue
        key = (cell.sheet, cell.row)
        rows.setdefault(key, []).append((cell, float(cell.value)))
        labels.setdefault(key, label)

    before = after = 0
    dropped = []
    for key, valued in sorted(rows.items()):
        was = admitted(valued)
        axis = structure.axes.get(key[0])
        kept = (
            valued
            if axis is None
            else [o for o in valued if o[0].column in {c for c, _ in axis.columns}]
        )
        now = admitted(kept)
        before += was
        after += now
        if was and not now:
            dropped.append(
                {
                    "sheet": key[0],
                    "row": key[1],
                    "label": labels[key],
                    "columns": [L(c) for c in sorted({o[0].column for o in valued})],
                    "kept": [L(c) for c in sorted({o[0].column for o in kept})],
                    "axis_from": (
                        L(axis.columns[0][0]) if axis and axis.columns else None
                    ),
                    "all_zero": all(v == 0 for _, v in valued),
                    "values": sorted({f"{v:,.6g}" for _, v in valued})[:6],
                }
            )
    del book, structure, rows
    gc.collect()
    return {
        "file": str(path),
        "examined_before": before,
        "examined_after": after,
        "dropped": dropped,
        "seconds": round(time.time() - started, 1),
    }


def main() -> None:
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    pattern = sys.argv[3] if len(sys.argv) > 3 else "*.xls[xm]"
    results = []
    for path in sorted(root.rglob(pattern)):
        row = one(path)
        results.append(row)
        print(
            f"done {path.name}: {row['examined_before']} -> "
            f"{row['examined_after']} examined, {len(row['dropped'])} dropped, "
            f"{row['seconds']}s",
            flush=True,
        )
        out.write_text(json.dumps(results, indent=1))
    tb = sum(r["examined_before"] for r in results)
    ta = sum(r["examined_after"] for r in results)
    print(
        f"corpus: {tb} -> {ta} check rows examined, "
        f"{sum(len(r['dropped']) for r in results)} dropped",
        flush=True,
    )


if __name__ == "__main__":
    main()
