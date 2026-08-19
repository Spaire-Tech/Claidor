"""Plant known defects into legitimate models — Round 4's recall test.

Protocol: docs/pierce/round4-stress-test.md. Six defect classes, up
to five sites per class per host, chosen with a registered seed. The
planting is XML surgery on the xlsx zip so that every cell the plant
does not touch keeps its cached value — resaving through a library
would strip the cached values the engine reads.

    python server/scripts/plant_defects.py HOST.xlsx OUT.xlsx TRUTH.json 20260823

The ground truth (host, class, ref, before, after) is written before
the engine ever sees the planted file. One planting run per host —
no re-rolls.
"""

import json
import random
import re
import shutil
import sys
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.sax.saxutils import escape

from openpyxl.utils import column_index_from_string, get_column_letter

A1 = re.compile(r"(?<![A-Za-z0-9_$!])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![0-9(])")
SUM_RANGE = re.compile(r"SUM\(\s*(\$?[A-Z]{1,3}\$?\d+)\s*:\s*(\$?[A-Z]{1,3}\$?\d+)\s*\)")


def sheet_files(zf: zipfile.ZipFile) -> dict[str, str]:
    """Sheet name -> archive path, via workbook.xml and its rels."""
    book = zf.read("xl/workbook.xml").decode("utf-8")
    rels = zf.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    rel_to_target = dict(
        re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels)
    )
    out = {}
    for name, rid in re.findall(
        r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', book
    ):
        target = rel_to_target.get(rid, "")
        if target.startswith("/"):
            target = target[1:]
        elif not target.startswith("xl/"):
            target = "xl/" + target
        out[name.replace("&amp;", "&")] = target
    return out


CELL = re.compile(r'<c r="([A-Z]+\d+)"[^>]*?(?:/>|>.*?</c>)', re.DOTALL)


def cells_of(xml: str) -> dict[str, str]:
    return {m.group(1): m.group(0) for m in CELL.finditer(xml)}


def formula_of(cell_xml: str) -> str | None:
    """The cell's plain formula — None for shared/array followers."""
    m = re.search(r"<f(?:\s([^>]*))?>(.*?)</f>", cell_xml, re.DOTALL)
    if not m:
        return None
    attrs = m.group(1) or ""
    if "t=" in attrs:  # shared or array — surgery would corrupt siblings
        return None
    return m.group(2)


def value_of(cell_xml: str) -> str | None:
    m = re.search(r"<v>(.*?)</v>", cell_xml, re.DOTALL)
    return m.group(1) if m else None


def replace_cell(xml: str, ref: str, old_cell: str, new_cell: str) -> str:
    assert old_cell in xml, ref
    return xml.replace(old_cell, new_cell, 1)


def rewrite(cell_xml: str, formula: str | None, value: str, error: bool = False) -> str:
    """The same <c> element with a new formula and cached value.

    `formula=None` turns the cell into a typed number. `error=True`
    stores the value as an error literal (t="e"). Otherwise the cell
    keeps its original type attribute — a formula whose cached value
    is a string must stay t="str" or readers parse the text as a
    number and die."""
    head = re.match(r'<c r="[A-Z]+\d+"[^>]*?(?=/>|>)', cell_xml).group(0)
    original_type = re.search(r'\st="[^"]*"', head)
    head = re.sub(r'\s+t="[^"]*"', "", head)
    if error:
        head += ' t="e"'
    elif formula is not None and original_type:
        head += original_type.group(0)
    body = (f"<f>{escape(formula)}</f>" if formula else "") + f"<v>{escape(value)}</v>"
    return f"{head}>{body}</c>"


def eligible(sheets: dict[str, dict[str, str]]) -> dict[str, list[tuple[str, str]]]:
    """Per defect class, every (sheet, ref) the plant could target."""
    sites: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for sheet, cells in sheets.items():
        by_row: dict[int, list[str]] = defaultdict(list)
        formulas: dict[str, str] = {}
        for ref, cell_xml in cells.items():
            formula = formula_of(cell_xml)
            if formula and value_of(cell_xml) is not None:
                formulas[ref] = formula
                by_row[int(re.search(r"\d+", ref).group(0))].append(ref)
        for ref, formula in formulas.items():
            row = int(re.search(r"\d+", ref).group(0))
            #: A filled-row member: at least two same-row siblings also
            #: hold formulas — the row's pattern is the witness every
            #: in-row defect class needs.
            in_run = len([r for r in by_row[row] if r in formulas]) >= 3
            has_ref = bool(A1.search(formula))
            if has_ref:
                sites["broken-reference"].append((sheet, ref))
            if in_run:
                sites["overwritten-formula"].append((sheet, ref))
                if has_ref:
                    sites["bad-reference"].append((sheet, ref))
                    sites["incorrect-assumption"].append((sheet, ref))
                if "+" in formula:
                    sites["inconsistent-formula"].append((sheet, ref))
            m = SUM_RANGE.search(formula)
            if m:
                a, b = m.group(1).replace("$", ""), m.group(2).replace("$", "")
                ca, ra = re.match(r"([A-Z]+)(\d+)", a).groups()
                cb, rb = re.match(r"([A-Z]+)(\d+)", b).groups()
                #: A vertical range of three or more, whose end cell
                #: holds a real cached number to subtract from the total.
                if ca == cb and int(rb) - int(ra) >= 2:
                    end = f"{cb}{rb}"
                    if end in cells and value_of(cells[end]) not in (None, "0"):
                        try:
                            float(value_of(cells[end]))
                            sites["skipped-total"].append((sheet, ref))
                        except ValueError:
                            pass
    return sites


def plant(host: Path, out: Path, truth_path: Path, seed: int, per_class: int = 5) -> None:
    shutil.copy(host, out)
    with zipfile.ZipFile(host) as zf:
        names = sheet_files(zf)
        sheets = {
            name: zf.read(path).decode("utf-8")
            for name, path in names.items()
            if path in zf.namelist()
        }
    parsed = {name: cells_of(xml) for name, xml in sheets.items()}
    sites = eligible(parsed)

    rng = random.Random(seed)
    truth: list[dict[str, str]] = []
    taken: set[tuple[str, str]] = set()
    changed: dict[str, str] = dict(sheets)

    for kind in sorted(sites):
        pool = [s for s in sorted(sites[kind]) if s not in taken]
        for sheet, ref in rng.sample(pool, min(per_class, len(pool))):
            cells = cells_of(changed[sheet])
            if ref not in cells:
                continue
            cell_xml = cells[ref]
            formula = formula_of(cell_xml)
            value = value_of(cell_xml)
            if formula is None or value is None:
                continue
            new_cell = None
            if kind == "broken-reference":
                m = A1.search(formula)
                #: When the ref is one end of a range, Excel wrecks the
                #: whole range, not the endpoint — `SUM(#REF!)`, never
                #: `SUM(A1:#REF!)`. Widen the cut to match.
                start, end = m.start(), m.end()
                tail = re.match(r":\$?[A-Z]{1,3}\$?\d+", formula[end:])
                if tail:
                    end += tail.end()
                head = re.search(
                    r"(\$?[A-Z]{1,3}\$?\d+|'[^']+'!|[A-Za-z0-9_.]+!)+:$",
                    formula[:start],
                )
                if head:
                    start = head.start()
                wrecked = formula[:start] + "#REF!" + formula[end:]
                new_cell = rewrite(cell_xml, wrecked, "#REF!", error=True)
                after = wrecked
            elif kind == "overwritten-formula":
                try:
                    typed = f"{float(value) * 1.07:.6g}" if float(value) else "12345"
                except ValueError:
                    continue
                new_cell = rewrite(cell_xml, None, typed)
                after = typed
            elif kind == "skipped-total":
                m = SUM_RANGE.search(formula)
                b = m.group(2)
                cb, rb = re.match(r"\$?([A-Z]+)\$?(\d+)", b).groups()
                shorter = f"{cb}{int(rb) - 1}"
                narrowed = (
                    formula[: m.start()]
                    + f"SUM({m.group(1)}:{shorter})"
                    + formula[m.end() :]
                )
                end_val = float(value_of(cells_of(changed[sheet])[f"{cb}{rb}"]))
                try:
                    new_val = f"{float(value) - end_val:.10g}"
                except ValueError:
                    continue
                new_cell = rewrite(cell_xml, narrowed, new_val)
                after = narrowed
            elif kind == "bad-reference":
                m = A1.search(formula)
                shifted = (
                    formula[: m.start()]
                    + f"{m.group(1)}{m.group(2)}{m.group(3)}{int(m.group(4)) + 1}"
                    + formula[m.end() :]
                )
                new_cell = rewrite(cell_xml, shifted, value)
                after = shifted
            elif kind == "inconsistent-formula":
                swapped = formula.replace("+", "-", 1)
                new_cell = rewrite(cell_xml, swapped, value)
                after = swapped
            elif kind == "incorrect-assumption":
                #: A literal cannot stand as a range endpoint — pick a
                #: ref that is not part of a `:` range.
                m = next(
                    (
                        m
                        for m in A1.finditer(formula)
                        if not formula[m.end() : m.end() + 1] == ":"
                        and not formula[m.start() - 1 : m.start()] == ":"
                    ),
                    None,
                )
                if m is None:
                    continue
                literal = formula[: m.start()] + "0.05" + formula[m.end() :]
                new_cell = rewrite(cell_xml, literal, value)
                after = literal
            if new_cell is None:
                continue
            changed[sheet] = replace_cell(changed[sheet], ref, cell_xml, new_cell)
            taken.add((sheet, ref))
            truth.append(
                {
                    "host": host.name,
                    "class": kind,
                    "ref": f"{sheet}!{ref}",
                    "before": formula,
                    "after": after,
                }
            )

    truth_path.write_text(json.dumps(truth, indent=1))

    with zipfile.ZipFile(host) as zin, zipfile.ZipFile(
        out, "w", zipfile.ZIP_DEFLATED
    ) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            for name, path in names.items():
                if item.filename == path and changed[name] != sheets[name]:
                    data = changed[name].encode("utf-8")
                    break
            zout.writestr(item, data)
    print(f"{host.name}: planted {len(truth)} defects -> {out.name}")
    for kind in sorted({one["class"] for one in truth}):
        planted = [one["ref"] for one in truth if one["class"] == kind]
        print(f"  {kind}: {len(planted)} at {', '.join(planted[:5])}")


if __name__ == "__main__":
    plant(
        Path(sys.argv[1]),
        Path(sys.argv[2]),
        Path(sys.argv[3]),
        int(sys.argv[4]) if len(sys.argv) > 4 else 20260823,
    )
