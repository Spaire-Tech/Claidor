"""The native `.xls` route, measured against the records.

For every file: the BIFF census (witness) and what `read_workbook`
— which routes `.xls` to `legacy.py` — actually reports. Formula
recall is the second over the first.

    uv run python -m scripts.a6_native_recall <files.txt> <out.json>
"""

import json
import struct
import sys
import traceback
import warnings
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")


def census(path: Path) -> dict[str, int]:
    import olefile

    ole = olefile.OleFileIO(str(path))
    stream = "Workbook" if ole.exists("Workbook") else "Book"
    data = ole.openstream(stream).read()
    ole.close()
    counts = {"formula": 0, "shrfmla": 0, "array": 0}
    pos, end = 0, len(data)
    while pos + 4 <= end:
        code, size = struct.unpack("<HH", data[pos:pos + 4])
        pos += 4
        if pos + size > end:
            break
        if code == 0x0006:
            counts["formula"] += 1
        elif code == 0x04BC:
            counts["shrfmla"] += 1
        elif code == 0x0221:
            counts["array"] += 1
        pos += size
    return counts


def native(path: Path) -> dict[str, Any]:
    from polar.tieout.workbook import read_workbook

    book = read_workbook(str(path))
    return {
        "cells": len(book.cells),
        "formulas": sum(1 for c in book.cells.values() if c.formula),
        "sheets": len(book.sheets),
    }


def main() -> None:
    listing, out = Path(sys.argv[1]), Path(sys.argv[2])
    results: list[dict[str, Any]] = []
    for line in listing.read_text().splitlines():
        path = Path(line.strip())
        if not path.exists():
            continue
        row: dict[str, Any] = {"file": path.name, "path": str(path)}
        try:
            row["census"] = census(path)
        except Exception as problem:
            row["census_error"] = f"{type(problem).__name__}: {str(problem)[:150]}"
        try:
            row["native"] = native(path)
        except Exception as problem:
            row["native_refused"] = f"{type(problem).__name__}: {str(problem)[:150]}"
        c = row.get("census", {}).get("formula")
        n = row.get("native", {}).get("formulas")
        if c is not None and n is not None:
            row["recall"] = round(n / c, 6) if c else None
        results.append(row)
        out.write_text(json.dumps(results, indent=1))
        print(
            f"{path.name[:52]:<52} census {c if c is not None else '-':>7} "
            f"native {n if n is not None else 'REFUSED':>7} "
            f"recall {row.get('recall')}",
            flush=True,
        )


if __name__ == "__main__":
    main()
