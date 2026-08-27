"""Plant range-versus-block defects — the A3 candidate-5 recall test.

Protocol: docs/pierce/a3-range-block.md, registered before any
result. Two classes, both made rather than simulated by rewriting
one aggregation's range through XML surgery on the xlsx zip, so
every untouched cell keeps its cached value:

  * **double-count** — an own-column aggregation's range is widened
    to swallow a sibling subtotal that already covers part of it;
  * **over-label** — an own-column aggregation's range is extended
    by one row so that it spans a cell holding text.

One plant per aggregation, no two plants sharing a row or a column
on one sheet, sites drawn with the registered seed, truth written
before the engine sees the planted file, one run per host.

    uv run python -m scripts.planting.range_block --scan CORPUS_DIR
    uv run python -m scripts.planting.range_block HOST.xlsx OUT.xlsx TRUTH.json 20260829
"""

import json
import random
import re
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Any

from openpyxl.utils import get_column_letter

from scripts.planting.sibling_totals import rewrite_formula, sheet_files

CLASSES = ("double-count", "over-label")
SITES_PER_CLASS = 5

#: One bare aggregation over a single own-column range, nothing else.
BARE = re.compile(
    r"^=\s*\+?\s*(?P<fn>SUM|AVERAGE|COUNT|COUNTA|MIN|MAX|PRODUCT)\("
    r"\s*(?P<c1>\$?[A-Z]{1,3})\$?(?P<r1>\d+)\s*:\s*(?P<c2>\$?[A-Z]{1,3})\$?(?P<r2>\d+)\s*\)\s*$",
    re.IGNORECASE,
)


def _span(cell: Any) -> tuple[str, int, int] | None:
    """(column letters, first row, last row) of a bare own-column
    aggregation entirely above its own cell — or None."""
    m = BARE.match(cell.formula or "")
    if m is None:
        return None
    c1 = m.group("c1").lstrip("$").upper()
    c2 = m.group("c2").lstrip("$").upper()
    if c1 != c2:
        return None
    first, last = sorted((int(m.group("r1")), int(m.group("r2"))))
    if last - first < 1 or last >= cell.row:
        return None
    if get_column_letter(cell.column) != c1:
        return None
    return c1, first, last


def eligible(book: Any) -> list[dict[str, Any]]:
    """Sites for both classes, each with the rewrite already decided."""
    spans: dict[tuple[str, str], list[tuple[Any, int, int]]] = {}
    for cell in book.cells.values():
        got = _span(cell)
        if got is not None:
            spans.setdefault((cell.sheet, got[0]), []).append((cell, got[1], got[2]))

    sites: list[dict[str, Any]] = []
    for (sheet, column), members in sorted(spans.items(), key=lambda kv: kv[0]):
        for cell, first, last in members:
            #: double-count: a *sibling* aggregation in the same column
            #: whose whole range sits above this one — widening this
            #: range to reach over it swallows the subtotal and its
            #: own members together.
            for other, o_first, o_last in members:
                if other.ref == cell.ref or other.row >= cell.row:
                    continue
                if not (o_last < first and o_first < o_last):
                    continue
                sites.append(
                    {
                        "sheet": sheet,
                        "row": cell.row,
                        "column": cell.column,
                        "ref": cell.ref,
                        "class": "double-count",
                        "before": cell.formula,
                        "after": (cell.formula or "").replace(
                            f"{column}{first}", f"{column}{o_first}", 1
                        ),
                        "note": f"swallows {other.ref} which sums {o_first}:{o_last}",
                    }
                )
                break
            #: over-label: the row just above the range holds text.
            above = book.cells.get(f"{sheet}!{column}{first - 1}")
            label_row = first - 1
            has_text = above is None and any(
                c.row == label_row and isinstance(c.value, str)
                for c in book.cells.values()
                if c.sheet == sheet
            )
            if (
                above is not None
                and above.formula is None
                and isinstance(above.value, str)
            ):
                has_text = True
            if has_text and label_row > 0:
                sites.append(
                    {
                        "sheet": sheet,
                        "row": cell.row,
                        "column": cell.column,
                        "ref": cell.ref,
                        "class": "over-label",
                        "before": cell.formula,
                        "after": (cell.formula or "").replace(
                            f"{column}{first}", f"{column}{label_row}", 1
                        ),
                        "note": f"extends over {column}{label_row} (text)",
                    }
                )
    return [s for s in sites if s["after"] != s["before"]]


def scan(corpus: Path) -> None:
    from polar.tieout.workbook import read_workbook

    ranked = []
    for path in sorted(corpus.rglob("*.xls[xm]")):
        name = str(path.relative_to(corpus))
        try:
            book = read_workbook(str(path))
        except Exception as problem:
            print(f"unreadable {name}: {problem}")
            continue
        sites = eligible(book)
        counts = {k: sum(1 for s in sites if s["class"] == k) for k in CLASSES}
        print(f"{name}: {len(sites)} sites {counts}", flush=True)
        if sites:
            ranked.append((-len(sites), name))
    ranked.sort()
    print("\nhosts (top 3 by eligible sites, ties by name):")
    for minus_n, name in ranked[:3]:
        print(f"  {name}  ({-minus_n} sites)")


def plant(host: Path, out: Path, truth_path: Path, seed: int) -> None:
    from polar.tieout.workbook import read_workbook

    book = read_workbook(str(host))
    sites = eligible(book)
    rng = random.Random(seed)
    used_rows: set[tuple[str, int]] = set()
    used_cols: set[tuple[str, int]] = set()
    plants: list[dict[str, Any]] = []
    for kind in CLASSES:
        pool = [s for s in sites if s["class"] == kind]
        rng.shuffle(pool)
        made = 0
        for site in pool:
            key_r = (site["sheet"], site["row"])
            key_c = (site["sheet"], site["column"])
            if made >= SITES_PER_CLASS or key_r in used_rows or key_c in used_cols:
                continue
            plants.append({"host": host.name, **site})
            used_rows.add(key_r)
            used_cols.add(key_c)
            made += 1
        if made < SITES_PER_CLASS:
            print(f"{host.name}: {kind} only {made} eligible sites used")

    #: Truth on disk before the engine ever sees the planted file.
    truth_path.write_text(json.dumps(plants, indent=1))

    shutil.copy(host, out)
    with zipfile.ZipFile(host) as zf:
        targets = sheet_files(zf)
        contents = {name: zf.read(name) for name in zf.namelist()}
    planted = 0
    for one in plants:
        target = targets.get(one["sheet"])
        if target is None:
            one["planted"] = False
            continue
        xml = contents[target].decode("utf-8")
        new_xml = rewrite_formula(xml, one["ref"].rsplit("!", 1)[-1], one["after"])
        if new_xml is None:
            one["planted"] = False
            continue
        contents[target] = new_xml.encode("utf-8")
        one["planted"] = True
        planted += 1
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in contents.items():
            zf.writestr(name, data)
    truth_path.write_text(json.dumps(plants, indent=1))
    print(f"{host.name}: {planted} planted of {len(plants)} drawn")


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--scan":
        scan(Path(sys.argv[2]))
    elif len(sys.argv) == 5:
        plant(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), int(sys.argv[4]))
    else:
        print(__doc__)
        raise SystemExit(2)
