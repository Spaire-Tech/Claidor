"""Plant typed cells onto beat positions — the A3 candidate-3 recall test.

Protocol: docs/pierce/a3-beat-families.md, registered before any
result. Two classes — beat-2 and beat-3 — planted by the same XML
surgery as the family-edge round: an interior lattice member's
formula element is removed and its cached value kept. One plant per
lattice, no two plants sharing a row or a column on one sheet,
sites drawn with the registered seed; the truth is written before
the engine sees the planted file. One planting run per host.

    uv run python -m scripts.planting.beat_families --scan CORPUS_DIR
    uv run python -m scripts.planting.beat_families HOST.xlsx OUT.xlsx TRUTH.json 20260827

Site eligibility deliberately avoids cached values of 0 or ±1 — the
registered identity guard would eat the plant's own witness, and
choosing sites that pass the guards is site eligibility, per the
registration.
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

STRIDES = (2, 3)
SITES_PER_CLASS = 5
MIN_LATTICE = 4


def eligible_beats(book: Any) -> list[dict[str, Any]]:
    """Interior members of all-formula same-shape beat lattices whose
    between-columns hold no formula of that shape."""
    rows: dict[tuple[str, int], dict[int, Any]] = {}
    for cell in book.cells.values():
        rows.setdefault((cell.sheet, cell.row), {})[cell.column] = cell
    sites: list[dict[str, Any]] = []
    for (sheet, row), by_column in sorted(rows.items()):
        columns = sorted(by_column)
        for stride in STRIDES:
            taken: set[int] = set()
            for start in columns:
                if start in taken:
                    continue
                chain = [start]
                while chain[-1] + stride in by_column:
                    chain.append(chain[-1] + stride)
                taken.update(chain)
                if len(chain) < MIN_LATTICE:
                    continue
                cells = [by_column[c] for c in chain]
                if any(not c.formula for c in cells):
                    continue
                shapes = {_shape(c.formula, c.row, c.column) for c in cells}
                if len(shapes) != 1:
                    continue
                family_shape = next(iter(shapes))
                between = [
                    by_column[c]
                    for c in columns
                    if chain[0] < c < chain[-1] and c not in chain
                ]
                if any(
                    b.formula and _shape(b.formula, b.row, b.column) == family_shape
                    for b in between
                ):
                    continue
                for member in cells[1:-1]:
                    value = member.value
                    if value is None:
                        continue
                    v = float(value)
                    if v == 0 or abs(v) == 1:
                        continue
                    sites.append(
                        {
                            "sheet": sheet,
                            "row": row,
                            "column": member.column,
                            "ref": member.ref,
                            "class": f"beat-{stride}",
                            "before": member.formula,
                            "value": v,
                        }
                    )
    return sites


def scan(corpus: Path) -> None:
    """Eligible sites per corpus file — the amendment's host scan; it
    counts sites and reads no finding."""
    from polar.tieout.workbook import read_workbook

    ranked = []
    for path in sorted(corpus.rglob("*.xls[xm]")):
        name = str(path.relative_to(corpus))
        try:
            book = read_workbook(str(path))
        except Exception as problem:
            print(f"unreadable {name}: {problem}")
            continue
        sites = eligible_beats(book)
        by_class = {s["class"] for s in sites}
        print(
            f"{name}: {len(sites)} eligible sites ({', '.join(sorted(by_class)) or 'none'})",
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
    sites = eligible_beats(book)
    rng = random.Random(seed)
    used_rows: set[tuple[str, int]] = set()
    used_cols: set[tuple[str, int]] = set()
    used_lattices: set[tuple[str, int, str]] = set()
    plants: list[dict[str, Any]] = []
    for stride in STRIDES:
        pool = [s for s in sites if s["class"] == f"beat-{stride}"]
        rng.shuffle(pool)
        made = 0
        for site in pool:
            key_r = (site["sheet"], site["row"])
            key_c = (site["sheet"], site["column"])
            key_l = (site["sheet"], site["row"], site["class"])
            if (
                made >= SITES_PER_CLASS
                or key_r in used_rows
                or key_c in used_cols
                or key_l in used_lattices
            ):
                continue
            plants.append(
                {
                    "host": host.name,
                    "class": site["class"],
                    "ref": site["ref"],
                    "sheet": site["sheet"],
                    "before": site["before"],
                    "value": site["value"],
                }
            )
            used_rows.add(key_r)
            used_cols.add(key_c)
            used_lattices.add(key_l)
            made += 1
        if made < SITES_PER_CLASS:
            print(f"{host.name}: beat-{stride} only {made} eligible sites used")

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
