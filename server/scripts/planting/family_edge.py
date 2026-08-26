"""Plant family-edge typed cells — the A3 candidate-2 recall test.

Protocol: docs/pierce/a3-family-edge.md, registered before any
result. Two defect classes — edge-tail and edge-head — planted by
XML surgery: the edge cell's formula element is removed and its
cached value kept, so the cell becomes exactly what the defect is,
a value sitting where the formula was. One plant per family, no two
plants sharing a row or a column on one sheet, sites drawn with the
registered seed; the ground truth is written before the engine sees
the planted file. One planting run per host — no re-rolls.

    uv run python -m scripts.planting.family_edge HOST.xlsx OUT.xlsx TRUTH.json 20260826

The eligibility logic is harness-local on purpose: it mirrors the
detector's run-and-shape rule in spirit but is written against the
registration's text, not the detector's code.
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

from scripts.planting.sibling_totals import sheet_files

SIDES = ("edge-tail", "edge-head")
SITES_PER_CLASS = 5
MIN_FAMILY = 4

#: An A1 reference, for the harness-local shape.
A1 = re.compile(r"(?<![A-Za-z0-9_$!:])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![0-9(])")
NUMBER = re.compile(r"(?<![A-Za-z_$])\d+(?:\.\d+)?")


def _shape(formula: str, row: int, column: int) -> str:
    """References relativized to the holding cell, numbers erased —
    the engine's normalization in spirit, deciding nothing outside
    this harness."""

    def relative(m: re.Match[str]) -> str:
        c_dollar, letters, r_dollar, digits = m.groups()
        c = 0
        for letter in letters:
            c = c * 26 + ord(letter) - 64
        c_part = f"${letters}" if c_dollar else f"C[{c - column}]"
        r_part = f"${digits}" if r_dollar else f"R[{int(digits) - row}]"
        return c_part + r_part

    text = A1.sub(relative, formula.upper())
    return NUMBER.sub("#", text)


def eligible_edges(book: Any) -> list[dict[str, Any]]:
    """Runs of 4+ same-shape formulas whose head or tail formula cell
    has empty space beyond it and a cached, non-zero numeric value."""
    rows: dict[tuple[str, int], list[Any]] = {}
    for cell in book.cells.values():
        rows.setdefault((cell.sheet, cell.row), []).append(cell)
    sites: list[dict[str, Any]] = []
    for (sheet, row), cells in sorted(rows.items()):
        cells.sort(key=lambda c: c.column)
        runs: list[list[Any]] = [[cells[0]]]
        for one in cells[1:]:
            if one.column - runs[-1][-1].column == 1:
                runs[-1].append(one)
            else:
                runs.append([one])
        for run in runs:
            formulas = [c for c in run if c.formula]
            if len(formulas) < MIN_FAMILY or len(formulas) != len(run):
                #: Only all-formula runs: a run already holding typed
                #: cells is not a clean family to plant into.
                continue
            shapes = [_shape(c.formula, c.row, c.column) for c in run]
            if len(set(shapes)) != 1:
                continue
            for side, edge in (("edge-head", run[0]), ("edge-tail", run[-1])):
                beyond = edge.column + (1 if side == "edge-tail" else -1)
                if beyond >= 1 and f"{sheet}!{get_column_letter(beyond)}{row}" in book.cells:
                    continue
                if edge.value is None or float(edge.value) == 0:
                    continue
                sites.append(
                    {
                        "sheet": sheet,
                        "row": row,
                        "column": edge.column,
                        "ref": edge.ref,
                        "class": side,
                        "before": edge.formula,
                        "value": float(edge.value),
                    }
                )
    return sites


def strip_formula(sheet_xml: str, ref: str) -> str | None:
    """The cell's <f> removed, cached <v> kept — None when the cell is
    a shared master or an array formula (the strip would spread), or
    when the cell, its <f>, or its <v> cannot be found."""
    cell_pattern = re.compile(rf'(<c r="{re.escape(ref)}"[^>]*>)(.*?)(</c>)', re.DOTALL)
    m = cell_pattern.search(sheet_xml)
    if m is None:
        return None
    body = m.group(2)
    f = re.search(r"<f(?:\s[^>]*)?(?:/>|>.*?</f>)", body, re.DOTALL)
    if f is None or "<v>" not in body:
        return None
    attrs = re.match(r"<f\s([^>]*?)/?>", f.group(0))
    tag = attrs.group(1) if attrs else ""
    if 'ref="' in tag or 't="array"' in tag:
        return None
    new_body = body[: f.start()] + body[f.end() :]
    return (
        sheet_xml[: m.start()] + m.group(1) + new_body + m.group(3) + sheet_xml[m.end() :]
    )


def plant(host: Path, out: Path, truth_path: Path, seed: int) -> None:
    from polar.tieout.workbook import read_workbook

    book = read_workbook(str(host))
    sites = eligible_edges(book)
    rng = random.Random(seed)
    used_rows: set[tuple[str, int]] = set()
    used_cols: set[tuple[str, int]] = set()
    plants: list[dict[str, Any]] = []
    for side in SIDES:
        pool = [s for s in sites if s["class"] == side]
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
                    "class": side,
                    "ref": site["ref"],
                    "sheet": site["sheet"],
                    "before": site["before"],
                    "value": site["value"],
                }
            )
            used_rows.add(key_r)
            used_cols.add(key_c)
            made += 1

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
    if len(sys.argv) == 5:
        plant(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), int(sys.argv[4]))
    else:
        print(__doc__)
        raise SystemExit(2)
