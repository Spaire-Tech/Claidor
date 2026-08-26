"""Plant column-direction typed cells — the A3 candidate-4 verification.

Protocol: docs/pierce/a3-column-typed.md, registered before any
result. Round 1 verifies the engine's orientation: three classes —
col-interior, col-top, col-bottom — planted into strictly-adjacent
vertical all-formula same-shape runs by the same strip surgery as
the family-edge round, each site recording whether its row holds a
formula to the left (the guard under examination keys on that).
One plant per run, no two plants sharing a row or a column on one
sheet, seeded draw, truth before the engine, one run per host.

    uv run python -m scripts.planting.column_typed --scan CORPUS_DIR
    uv run python -m scripts.planting.column_typed HOST.xlsx OUT.xlsx TRUTH.json 20260828
"""

import json
import random
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Any

from scripts.planting.family_edge import _shape, strip_formula
from scripts.planting.sibling_totals import sheet_files

CLASSES = ("col-interior", "col-top", "col-bottom")
SITES_PER_CLASS = 5
MIN_RUN = 5


def eligible_columns(book: Any) -> list[dict[str, Any]]:
    """Interior and edge members of vertical all-formula same-shape
    runs, each with its left-formula stratum recorded."""
    columns: dict[tuple[str, int], list[Any]] = {}
    leftmost: dict[tuple[str, int], int] = {}
    for cell in book.cells.values():
        columns.setdefault((cell.sheet, cell.column), []).append(cell)
        if cell.formula:
            at = (cell.sheet, cell.row)
            if cell.column < leftmost.get(at, 1 << 20):
                leftmost[at] = cell.column
    sites: list[dict[str, Any]] = []
    for (sheet, column), cells in sorted(columns.items()):
        cells.sort(key=lambda c: c.row)
        runs: list[list[Any]] = [[cells[0]]]
        for one in cells[1:]:
            if one.row - runs[-1][-1].row == 1:
                runs[-1].append(one)
            else:
                runs.append([one])
        for run in runs:
            if len(run) < MIN_RUN or any(not c.formula for c in run):
                continue
            shapes = {_shape(c.formula, c.row, c.column) for c in run}
            if len(shapes) != 1:
                continue
            for kind, member in (
                ("col-top", run[0]),
                ("col-bottom", run[-1]),
                *(("col-interior", one) for one in run[1:-1]),
            ):
                value = member.value
                if value is None:
                    continue
                v = float(value)
                if v == 0 or abs(v) == 1:
                    continue
                sites.append(
                    {
                        "sheet": sheet,
                        "row": member.row,
                        "column": member.column,
                        "ref": member.ref,
                        "class": kind,
                        "before": member.formula,
                        "value": v,
                        "left_formula": leftmost.get((sheet, member.row), 1 << 20)
                        < member.column,
                    }
                )
    return sites


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
        sites = eligible_columns(book)
        strata = sum(1 for s in sites if not s["left_formula"])
        print(
            f"{name}: {len(sites)} eligible sites, {strata} without a left formula",
            flush=True,
        )
        if sites:
            ranked.append((-len(sites), name))
    ranked.sort()
    print("\nhosts (top 3 by eligible sites, ties by name):")
    for minus_n, name in ranked[:3]:
        print(f"  {name}  ({-minus_n} sites)")


def plant(host: Path, out: Path, truth_path: Path, seed: int) -> None:
    from polar.tieout.workbook import read_workbook

    book = read_workbook(str(host))
    sites = eligible_columns(book)
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
            plants.append(
                {
                    "host": host.name,
                    "class": kind,
                    "ref": site["ref"],
                    "sheet": site["sheet"],
                    "before": site["before"],
                    "value": site["value"],
                    "left_formula": site["left_formula"],
                }
            )
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
        new_xml = strip_formula(xml, one["ref"].rsplit("!", 1)[-1])
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
