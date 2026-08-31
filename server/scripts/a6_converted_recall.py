"""The converted `.xls` route, measured against the same records.

Reads each converted file through `read_workbook` — the engine's own
path, openpyxl included — so the number is what the engine would
actually see, not what a bespoke counter reports.

    uv run python -m scripts.a6_converted_recall <manifest.json> <out.json>
"""

import json
import struct
import sys
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
    counts = {"formula": 0, "boolerr": 0, "shrfmla": 0}
    pos, end = 0, len(data)
    while pos + 4 <= end:
        code, size = struct.unpack("<HH", data[pos : pos + 4])
        pos += 4
        if pos + size > end:
            break
        if code == 0x0006:
            counts["formula"] += 1
        elif code == 0x0205:
            counts["boolerr"] += 1
        elif code == 0x04BC:
            counts["shrfmla"] += 1
        pos += size
    return counts


def through_engine(path: Path) -> dict[str, Any]:
    from polar.tieout.workbook import read_workbook

    book = read_workbook(str(path))
    formulas = [c for c in book.cells.values() if c.formula]
    fabricated = sum(
        1
        for c in formulas
        if str(c.formula).strip()
        in ("=TRUE()", "=FALSE()", "=", "TRUE()", "FALSE()", "")
    )
    return {
        "cells": len(book.cells),
        "formulas": len(formulas),
        "fabricated": fabricated,
        "real": len(formulas) - fabricated,
        "sheets": len(book.sheets),
    }


def main() -> None:
    manifest, out = Path(sys.argv[1]), Path(sys.argv[2])
    results: list[dict[str, Any]] = []
    for pair in json.loads(manifest.read_text()):
        original, converted = Path(pair["original"]), Path(pair["converted"])
        row: dict[str, Any] = {"file": original.name, "path": str(original)}
        if not converted.exists():
            row["error"] = "not converted"
            results.append(row)
            continue
        try:
            row["census"] = census(original)
        except Exception as problem:
            row["census_error"] = f"{type(problem).__name__}: {str(problem)[:120]}"
        try:
            row["converted"] = through_engine(converted)
        except Exception as problem:
            row["refused"] = f"{type(problem).__name__}: {str(problem)[:150]}"
        c = row.get("census", {}).get("formula")
        got = row.get("converted", {})
        if c is not None and got:
            row["recall"] = round(got["real"] / c, 6) if c else None
            row["recall_all"] = round(got["formulas"] / c, 6) if c else None
        results.append(row)
        out.write_text(json.dumps(results, indent=1))
        print(
            f"{original.name[:46]:<46} census {c if c is not None else '-':>6} "
            f"real {got.get('real', 'REFUSED'):>6} fab {got.get('fabricated', '-'):>5} "
            f"recall {row.get('recall')}",
            flush=True,
        )


if __name__ == "__main__":
    main()
