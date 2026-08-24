"""Compare two saved workbooks, cell by cell, and count honestly.

The Compare tab in the design has two drop zones and no result. To
draw the result, the result has to exist — so this reads both H7
versions twice: once for what each cell says, once for the value
Excel last cached in it. That gives two different and equally real
numbers, and keeps them apart:

  · a cell *changed* when its formula or its typed content changed;
  · a number *moved* when the cached value differs.

What this cannot say is whether a change caused a move — that needs a
recalculation, not a read. The screen says so rather than implying a
causal chain the files cannot support.

    python docs/pierce/workspace/diff_versions.py OLD.xlsm NEW.xlsm OUT.json
"""

import json
import sys
import time
from pathlib import Path

import openpyxl


def read(path: Path, *, values: bool) -> dict:
    book = openpyxl.load_workbook(
        path, read_only=True, data_only=values, keep_links=False
    )
    out: dict[str, dict[str, object]] = {}
    for sheet in book.worksheets:
        cells = {}
        for row in sheet.iter_rows():
            for cell in row:
                if cell.value is not None:
                    cells[cell.coordinate] = cell.value
        out[sheet.title] = cells
    book.close()
    return out


def kind(before, after) -> str:
    was_formula = isinstance(before, str) and before.startswith("=")
    now_formula = isinstance(after, str) and after.startswith("=")
    if before is None:
        return "added"
    if after is None:
        return "removed"
    if was_formula and now_formula:
        return "formula rewritten"
    if was_formula and not now_formula:
        return "formula replaced by a typed value"
    if now_formula and not was_formula:
        return "typed value replaced by a formula"
    return "typed value changed"


def moved(before, after) -> bool:
    """A number moved. Text and blanks are not numbers; a difference
    below a millionth is float noise, not a movement."""
    if not isinstance(before, (int, float)) or not isinstance(after, (int, float)):
        return False
    if isinstance(before, bool) or isinstance(after, bool):
        return False
    if before == after:
        return False
    scale = max(abs(before), abs(after), 1.0)
    return abs(before - after) / scale > 1e-9


def main() -> None:
    old_path, new_path, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    started = time.time()

    old_text, new_text = read(old_path, values=False), read(new_path, values=False)
    old_val, new_val = read(old_path, values=True), read(new_path, values=True)

    sheets = list(dict.fromkeys([*old_text, *new_text]))
    changed: dict[str, int] = {}
    per_sheet: dict[str, dict[str, int]] = {}
    examples: list[dict] = []
    compared = moves = 0

    for sheet in sheets:
        a, b = old_text.get(sheet, {}), new_text.get(sheet, {})
        av, bv = old_val.get(sheet, {}), new_val.get(sheet, {})
        refs = set(a) | set(b)
        compared += len(refs)
        touched = {"changed": 0, "moved": 0}
        for ref in refs:
            before, after = a.get(ref), b.get(ref)
            if before != after:
                what = kind(before, after)
                changed[what] = changed.get(what, 0) + 1
                touched["changed"] += 1
                if len(examples) < 400:
                    examples.append(
                        {
                            "sheet": sheet,
                            "ref": ref,
                            "kind": what,
                            "before": str(before)[:180],
                            "after": str(after)[:180],
                        }
                    )
            if moved(av.get(ref), bv.get(ref)):
                moves += 1
                touched["moved"] += 1
        if touched["changed"] or touched["moved"]:
            per_sheet[sheet] = touched

    result = {
        "old": old_path.name,
        "new": new_path.name,
        "sheets": len(sheets),
        "compared": compared,
        "changed": sum(changed.values()),
        "by_kind": changed,
        "moved": moves,
        "per_sheet": per_sheet,
        "examples": examples,
        "seconds": round(time.time() - started, 1),
    }
    out.write_text(json.dumps(result, indent=1, default=str))
    print(json.dumps({k: v for k, v in result.items() if k not in ("examples", "per_sheet")}, indent=1))


if __name__ == "__main__":
    main()
