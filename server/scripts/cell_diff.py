"""A cell-level diff of two versions of one model, matched by meaning
(`docs/pierce/cell-diff-labels.md`).

    PYTHONPATH=. uv run python scripts/cell_diff.py DRAFT FINAL OUT.json [--sample N --seed S]

Cells match on (sheet, row label, occurrence of that label in the
sheet, column header or letter). A change is a different audit shape
— references made relative, numbers erased — or a formula on one
side and a constant on the other. Rows whose label exists on one side
only are unmatched and counted apart. The output holds every changed
cell grouped by row, both formulas and both cached values, and a
row sample for the hand grading — with no engine finding in it, so
the reader grades from the cells alone.
"""

from __future__ import annotations

import json
import random
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openpyxl.utils import get_column_letter

from polar.tieout.audit import _shape
from polar.tieout.workbook import Cell, Workbook, read_workbook

Key = tuple[str, str, int, str]


def keyed(book: Workbook) -> tuple[dict[Key, Cell], dict[tuple[str, str, int], int]]:
    """Every numeric cell by its meaning key; and each labelled row's
    (sheet, label, occurrence) → row number."""
    occurrence: dict[tuple[str, str], list[int]] = defaultdict(list)
    for sheet, rows in book.row_words.items():
        for row in sorted(rows):
            label = rows[row].strip().lower()
            if label:
                occurrence[(sheet, label)].append(row)
    index_of: dict[tuple[str, int], tuple[str, int]] = {}
    for (sheet, label), rows in occurrence.items():
        for position, row in enumerate(rows):
            index_of[(sheet, row)] = (label, position)
    cells: dict[Key, Cell] = {}
    rows_by_key: dict[tuple[str, str, int], int] = {}
    for cell in book.cells.values():
        named = index_of.get((cell.sheet, cell.row))
        if named is None:
            continue
        label, position = named
        column = cell.column_label.strip().lower() or get_column_letter(cell.column)
        cells[(cell.sheet, label, position, column)] = cell
        rows_by_key[(cell.sheet, label, position)] = cell.row
    return cells, rows_by_key


def diff(draft: Workbook, final: Workbook) -> dict[str, Any]:
    d_cells, d_rows = keyed(draft)
    f_cells, f_rows = keyed(final)
    matched_rows = set(d_rows) & set(f_rows)
    changed: dict[str, list[dict[str, Any]]] = defaultdict(list)
    compared = 0
    for key, before in d_cells.items():
        after = f_cells.get(key)
        if after is None or key[:3] not in matched_rows:
            continue
        compared += 1
        was_formula = before.formula is not None
        is_formula = after.formula is not None
        same = (
            was_formula == is_formula
            and (not was_formula or _shape(before) == _shape(after))
            and (was_formula or before.value == after.value)
        )
        if same:
            continue
        row_key = f"{key[0]}|{key[1]}|{key[2]}"
        changed[row_key].append(
            {
                "column": key[3],
                "draft_ref": before.ref,
                "final_ref": after.ref,
                "draft_formula": before.formula,
                "draft_value": str(before.value) if before.value is not None else None,
                "final_formula": after.formula,
                "final_value": str(after.value) if after.value is not None else None,
                "kind": (
                    "formula→constant"
                    if was_formula and not is_formula
                    else "constant→formula"
                    if is_formula and not was_formula
                    else "formula changed"
                    if is_formula
                    else "constant changed"
                ),
            }
        )
    return {
        "matched_rows": len(matched_rows),
        "unmatched_draft_rows": len(set(d_rows) - set(f_rows)),
        "unmatched_final_rows": len(set(f_rows) - set(d_rows)),
        "compared_cells": compared,
        "changed_cells": sum(len(v) for v in changed.values()),
        "changed_rows": len(changed),
        "rows": {
            key: {
                "sheet": key.split("|")[0],
                "label": key.split("|")[1],
                "draft_row": d_rows[
                    (key.split("|")[0], key.split("|")[1], int(key.split("|")[2]))
                ],
                "final_row": f_rows[
                    (key.split("|")[0], key.split("|")[1], int(key.split("|")[2]))
                ],
                "cells": sorted(cells, key=lambda one: one["column"]),
            }
            for key, cells in changed.items()
        },
    }


def main(argv: list[str]) -> None:
    draft_path, final_path, out = argv[1], argv[2], Path(argv[3])
    sample_n = int(argv[argv.index("--sample") + 1]) if "--sample" in argv else 30
    seed = int(argv[argv.index("--seed") + 1]) if "--seed" in argv else 20260903
    draft = read_workbook(draft_path)
    final = read_workbook(final_path)
    started = time.time()
    result = diff(draft, final)
    result["diff_seconds"] = round(time.time() - started, 1)
    keys = sorted(result["rows"])
    rng = random.Random(seed)
    result["sample"] = [
        {**result["rows"][key], "key": key, "grade": "", "note": ""}
        for key in rng.sample(keys, min(sample_n, len(keys)))
    ]
    out.write_text(json.dumps(result, indent=1, ensure_ascii=False))
    print(
        f"matched rows {result['matched_rows']} | unmatched draft/final "
        f"{result['unmatched_draft_rows']}/{result['unmatched_final_rows']} | compared cells "
        f"{result['compared_cells']} | changed cells {result['changed_cells']} in "
        f"{result['changed_rows']} rows | diff {result['diff_seconds']}s | sample {len(result['sample'])} → {out}"
    )


if __name__ == "__main__":
    main(sys.argv)
