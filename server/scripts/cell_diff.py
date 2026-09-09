"""A cell-level diff of two versions of one model, matched by meaning
(`docs/pierce/cell-diff-labels.md`).

    PYTHONPATH=. uv run python scripts/cell_diff.py DRAFT FINAL OUT.json [--sample N --seed S]

Cells match on (sheet, row label, occurrence of that label in the
sheet, column header or letter). A formula's **meaning** is its
token stream with every reference replaced by the meaning key of the
cell it reads on its own side — so a link that followed an inserted
row (`$M$246` → `$M$247`, the same line) is not a change, and a link
that failed to follow one (the same address, a different line) is. A
change is a different meaning, or a formula on one side and a
constant on the other, or a different constant. Rows whose label
exists on one side only are unmatched and counted apart. The output
holds every changed cell grouped by row, both formulas and both
cached values, and a row sample for the hand grading — with no
engine finding in it, so the reader grades from the cells alone.
"""

from __future__ import annotations

import json
import random
import re
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openpyxl.utils import column_index_from_string, get_column_letter

from polar.tieout.workbook import Cell, Workbook, read_workbook, tokens_of

Key = tuple[str, str, int, str]

_PIECE = re.compile(
    r"^(?:(?P<sheet>'[^']+'|[^'!]+)!)?\$?(?P<col>[A-Za-z]{1,3})\$?(?P<row>\d+)$"
)


class Meaning:
    """One version's cells by meaning key, and every address's meaning."""

    def __init__(self, book: Workbook) -> None:
        occurrence: dict[tuple[str, str], list[int]] = defaultdict(list)
        for sheet, rows in book.row_words.items():
            for row in sorted(rows):
                label = rows[row].strip().lower()
                if label:
                    occurrence[(sheet, label)].append(row)
        self.row_key: dict[tuple[str, int], tuple[str, int]] = {}
        for (sheet, label), rows in occurrence.items():
            for position, row in enumerate(rows):
                self.row_key[(sheet, row)] = (label, position)
        self.headers: dict[tuple[str, int], str] = {}
        self.cells: dict[Key, Cell] = {}
        self.rows: dict[tuple[str, str, int], int] = {}
        for cell in book.cells.values():
            if cell.column_label:
                self.headers[(cell.sheet, cell.column)] = (
                    cell.column_label.strip().lower()
                )
            named = self.row_key.get((cell.sheet, cell.row))
            if named is None:
                continue
            label, position = named
            column = self.column_key(cell.sheet, cell.column)
            self.cells[(cell.sheet, label, position, column)] = cell
            self.rows[(cell.sheet, label, position)] = cell.row

    def column_key(self, sheet: str, column: int) -> str:
        return self.headers.get((sheet, column)) or get_column_letter(column)

    def target(self, piece: str, sheet: str) -> str:
        """A reference piece as the meaning of what it reads: the row's
        label and occurrence and the column's header; an unlabelled
        row keeps its address, which is honest — nothing names it."""
        match = _PIECE.match(piece.strip())
        if match is None:
            return piece.strip()
        target_sheet = (match.group("sheet") or sheet).strip("'")
        row = int(match.group("row"))
        column = column_index_from_string(match.group("col").upper())
        named = self.row_key.get((target_sheet, row))
        where = f"{named[0]}#{named[1]}" if named else f"row{row}"
        return f"[{target_sheet}|{where}|{self.column_key(target_sheet, column)}]"

    def meaning(self, cell: Cell) -> str:
        if cell.formula is None:
            return ""
        try:
            tokens = tokens_of(cell.formula)
        except Exception:
            return cell.formula
        out = []
        for token in tokens:
            if token.type == "OPERAND" and token.subtype == "RANGE":
                out.append(
                    ":".join(
                        self.target(piece, cell.sheet)
                        for piece in token.value.split(":")
                    )
                )
            elif token.type == "OPERAND" and token.subtype == "NUMBER":
                out.append(token.value)
            else:
                out.append(token.value.replace(" ", ""))
        return "".join(out)


def diff(draft: Workbook, final: Workbook) -> dict[str, Any]:
    before_all, after_all = Meaning(draft), Meaning(final)
    matched_rows = set(before_all.rows) & set(after_all.rows)
    changed: dict[str, list[dict[str, Any]]] = defaultdict(list)
    compared = 0
    for key, before in before_all.cells.items():
        after = after_all.cells.get(key)
        if after is None or key[:3] not in matched_rows:
            continue
        compared += 1
        was_formula = before.formula is not None
        is_formula = after.formula is not None
        if was_formula and is_formula:
            same = before_all.meaning(before) == after_all.meaning(after)
        elif not was_formula and not is_formula:
            same = before.value == after.value
        else:
            same = False
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
                "draft_meaning": before_all.meaning(before)[:300],
                "final_meaning": after_all.meaning(after)[:300],
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

    def parts(key: str) -> tuple[str, str, int]:
        sheet, label, position = key.rsplit("|", 2)
        return sheet, label, int(position)

    return {
        "matched_rows": len(matched_rows),
        "unmatched_draft_rows": len(set(before_all.rows) - set(after_all.rows)),
        "unmatched_final_rows": len(set(after_all.rows) - set(before_all.rows)),
        "compared_cells": compared,
        "changed_cells": sum(len(v) for v in changed.values()),
        "changed_rows": len(changed),
        "rows": {
            key: {
                "sheet": parts(key)[0],
                "label": parts(key)[1],
                "draft_row": before_all.rows[parts(key)],
                "final_row": after_all.rows[parts(key)],
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
