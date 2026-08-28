"""The serious-error mining classifier — the registered instrument.

Implements `docs/pierce/serious-mining.md` exactly as written: the
Tasi serious-error cells our engine does not cover, bucketed by the
first mining round's buckets in the same precedence, cross-tabbed
against the other seven tools, and sampled for hand reading by a
rule fixed before any cell was read.

    uv run python -m scripts.custodes_serious

Reuses `scripts.custodes_tasi` so the universe is computed by the
committed scorer's own machinery rather than re-derived, and reads
subject workbooks directly as legacy `.xls` per that round's 27
August amendment.
"""

import re
import warnings
from collections import Counter, defaultdict
from typing import Any

warnings.filterwarnings("ignore")

import xlrd

from scripts.custodes_score import WORK, _unpack
from scripts.custodes_tasi import (
    TOOLS,
    _clone,
    _fresh_sweep,
    _sheet_index,
    _subjects,
    _tasi_labels,
)

#: The first mining round's shape: references to offsets, numbers to #.
A1 = re.compile(r"(?<![A-Za-z0-9_$!:])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![0-9(])")
NUMBER = re.compile(r"(?<![A-Za-z_$])\d+(?:\.\d+)?")

#: The general misses' shares, from custodes-mining.md, for the
#: comparison this round exists to make.
GENERAL = {
    "row-context-weak": 30.8,
    "no-formula-context": 23.9,
    "row-family-gap": 13.0,
    "column-family-gap": 12.1,
    "column-context-weak": 6.8,
    "formula-matches-context": 5.5,
    "differs-from-column-family": 3.1,
    "differs-from-row-family": 2.5,
    "unresolvable": 2.1,
    "formula-no-context": 0.1,
}


def _shape(formula: str, row: int, col: int) -> str:
    def relative(m: re.Match[str]) -> str:
        c_dollar, letters, r_dollar, digits = m.groups()
        c = 0
        for letter in letters:
            c = c * 26 + ord(letter) - 64
        left = f"${letters}" if c_dollar else f"C[{c - col}]"
        right = f"${digits}" if r_dollar else f"R[{int(digits) - row}]"
        return left + right

    return NUMBER.sub("#", A1.sub(relative, formula.upper()))


def _grid(path: Any) -> dict[str, dict[tuple[int, int], Any]]:
    """sheet -> {(row, col): raw value}, 0-based, straight from the .xls."""
    out: dict[str, dict[tuple[int, int], Any]] = {}
    book = xlrd.open_workbook(str(path), formatting_info=False)
    for sheet in book.sheets():
        cells: dict[tuple[int, int], Any] = {}
        for r in range(sheet.nrows):
            for c in range(sheet.ncols):
                value = sheet.cell_value(r, c)
                if value != "":
                    cells[(r, c)] = value
        out[sheet.name] = cells
    return out


def _classify(cells: dict[tuple[int, int], Any], row: int, col: int) -> str:
    """The first mining round's buckets, same precedence, first match."""
    here = cells.get((row, col))
    if here is None or here == "":
        return "unresolvable"
    is_formula = isinstance(here, str) and here.startswith("=")

    def window(along_row: bool) -> list[tuple[int, int]]:
        spots = []
        for step in (-3, -2, -1, 1, 2, 3):
            key = (row, col + step) if along_row else (row + step, col)
            if key in cells:
                spots.append(key)
        return spots

    def shapes(spots: list[tuple[int, int]]) -> list[str]:
        out = []
        for r, c in spots:
            value = cells[(r, c)]
            if isinstance(value, str) and value.startswith("="):
                out.append(_shape(value, r + 1, c + 1))
        return out

    row_shapes, col_shapes = shapes(window(True)), shapes(window(False))

    def repeated(found: list[str]) -> str | None:
        counted = Counter(found)
        top = counted.most_common(1)
        return top[0][0] if top and top[0][1] >= 2 else None

    if not is_formula:
        if repeated(row_shapes):
            return "row-family-gap"
        if repeated(col_shapes):
            return "column-family-gap"
        if row_shapes:
            return "row-context-weak"
        if col_shapes:
            return "column-context-weak"
        return "no-formula-context"

    mine = _shape(here, row + 1, col + 1)
    family = repeated(row_shapes)
    if family and family != mine:
        return "differs-from-row-family"
    family = repeated(col_shapes)
    if family and family != mine:
        return "differs-from-column-family"
    if row_shapes or col_shapes:
        return "formula-matches-context"
    return "formula-no-context"


def main() -> None:
    WORK.mkdir(exist_ok=True)
    _unpack()
    path = _clone()
    sheets = _sheet_index()
    truth, tools, _ = _tasi_labels(path, sheets)
    serious = truth["serious"]
    print(f"Tasi serious cells: {len(serious)}")

    print("sweeping with today's engine (the universe's other half)...")
    covered: set[tuple[str, str, str]] = set()
    for book, _rule, cell_set in _fresh_sweep():
        for sheet, cell in cell_set:
            key = (book.lower(), sheet, cell)
            if key in serious:
                covered.add(key)
    missed = sorted(serious - covered)
    print(f"covered {len(covered)} | UNIVERSE (missed) {len(missed)} (expected 1206)")

    grids: dict[str, dict[str, dict[tuple[int, int], Any]]] = {}
    for subject in _subjects():
        try:
            grids[subject.stem.lower()] = _grid(subject)
        except Exception as problem:
            print(f"  unreadable {subject.name}: {str(problem)[:50]}")

    buckets: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    caught_by: Counter[int] = Counter()
    per_bucket_tools: dict[str, list[int]] = defaultdict(list)
    for key in missed:
        book, sheet, ref = key
        m = re.match(r"^([A-Z]{1,3})(\d+)$", ref)
        grid = grids.get(book, {}).get(sheet)
        if grid is None or m is None:
            bucket = "unresolvable"
        else:
            col = 0
            for letter in m.group(1):
                col = col * 26 + ord(letter) - 64
            bucket = _classify(grid, int(m.group(2)) - 1, col - 1)
        buckets[bucket].append(key)
        n = sum(1 for name in TOOLS if key in tools[name])
        caught_by[n] += 1
        per_bucket_tools[bucket].append(n)

    total = len(missed)
    print(f"\nBUCKETS (serious misses = {total}), against the general misses")
    print(f"  {'bucket':<28} {'cells':>6} {'share':>7} {'general':>8} {'delta':>7}")
    for bucket, keys in sorted(buckets.items(), key=lambda kv: -len(kv[1])):
        share = 100 * len(keys) / max(total, 1)
        gen = GENERAL.get(bucket, 0.0)
        print(
            f"  {bucket:<28} {len(keys):>6} {share:>6.1f}% {gen:>7.1f}% "
            f"{share - gen:>+6.1f}"
        )

    print("\nTOOL CROSS-TAB — how many of the seven caught the cells we missed")
    for n in sorted(caught_by):
        print(f"  {n} of 7: {caught_by[n]} cells ({100 * caught_by[n] / total:.1f}%)")
    print("\n  mean tools-per-cell by bucket:")
    for bucket, counts in sorted(
        per_bucket_tools.items(), key=lambda kv: -sum(kv[1]) / max(len(kv[1]), 1)
    ):
        print(f"    {bucket:<28} {sum(counts) / max(len(counts), 1):.2f}")

    print("\nTHE HAND-READING SAMPLE — first 12 per bucket in sort order")
    for bucket, keys in sorted(buckets.items()):
        print(f"\n  [{bucket}]")
        for book, sheet, ref in keys[:12]:
            grid = grids.get(book, {}).get(sheet, {})
            m = re.match(r"^([A-Z]{1,3})(\d+)$", ref)
            content = ""
            if m:
                col = 0
                for letter in m.group(1):
                    col = col * 26 + ord(letter) - 64
                content = str(grid.get((int(m.group(2)) - 1, col - 1), ""))[:44]
            n = sum(1 for name in TOOLS if (book, sheet, ref) in tools[name])
            print(f"    {book}!{sheet}!{ref:<6} tools={n}/7  {content}")


if __name__ == "__main__":
    main()
