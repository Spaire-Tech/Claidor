"""The C1 hand-check instrument — a second, independent reader.

Registered with the C1 protocol in `docs/pierce/logs/prism.md` before
the differ under test produced any number. The point of this script
is independence: it reads worksheet XML, shared strings and the
workbook part straight out of the zip with the standard library
alone — no openpyxl, no `polar.tieout` — so the only thing it can
share with the watch differ is the file itself. Where the two
disagree, a person reads the raw XML and says which one is wrong.

For every populated cell (a cell storing a formula, a value or an
inline string; a cell carrying only a style is not populated) it
records:

  content — the formula text where there is one (shared formulas
            translated to their own cell, as the spec says Excel
            reads them), otherwise the typed literal;
  value   — the cached value exactly as stored, tagged with its
            type so the number 1 and the text « 1 » never compare
            equal.

Statuses between two versions, per ref over the union of populated
refs: added / removed / else formula-changed when content differs
and value-changed when value differs (both at once allowed —
a retyped literal is both), else unchanged.

    uv run python -m scripts.watch_handcheck OLD.xlsx NEW.xlsx OUT.json
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _text(node: ET.Element | None) -> str:
    """Every piece of text under a node, joined — a shared string is
    one or more runs, each with its own <t>."""
    if node is None:
        return ""
    return "".join(t.text or "" for t in node.iter(f"{MAIN}t"))


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        payload = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(payload)
    return [_text(item) for item in root.findall(f"{MAIN}si")]


def _sheet_parts(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    """(sheet name, zip member) in workbook order, via the rels part —
    sheetN.xml file names are not promised to follow tab order."""
    book = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target_of = {}
    for rel in rels.findall(f"{PKG_REL}Relationship"):
        target = rel.get("Target", "")
        if target.startswith("/"):
            target = target.lstrip("/")
        else:
            target = "xl/" + target
        target_of[rel.get("Id")] = target
    out = []
    for sheet in book.find(f"{MAIN}sheets") or []:
        member = target_of.get(sheet.get(REL))
        if member and member in archive.namelist():
            out.append((sheet.get("name", ""), member))
    return out


_COLUMN = re.compile(r"^([A-Z]+)([0-9]+)$")

#: A1-style references inside a formula, with their $ anchors —
#: found only outside string literals and quoted sheet names, which
#: the translator walks past by hand.
_REF = re.compile(r"(\$?)([A-Z]{1,3})(\$?)([0-9]{1,7})(?![0-9A-Z_(])")


def _column_number(letters: str) -> int:
    number = 0
    for letter in letters:
        number = number * 26 + (ord(letter) - 64)
    return number


def _column_letters(number: int) -> str:
    letters = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def split_ref(ref: str) -> tuple[int, int]:
    """« D26 » -> (26, 4)."""
    match = _COLUMN.match(ref)
    if not match:
        raise ValueError(ref)
    return int(match.group(2)), _column_number(match.group(1))


def translate(formula: str, drow: int, dcol: int) -> str:
    """A shared formula, moved to its own cell: every relative part of
    every reference shifts by the offset; anchored parts hold still.
    String literals and quoted sheet names pass through untouched."""
    out: list[str] = []
    position = 0
    length = len(formula)
    while position < length:
        char = formula[position]
        if char == '"':
            end = position + 1
            while end < length:
                if formula[end] == '"':
                    if end + 1 < length and formula[end + 1] == '"':
                        end += 2
                        continue
                    break
                end += 1
            out.append(formula[position : end + 1])
            position = end + 1
            continue
        if char == "'":
            end = formula.find("'", position + 1)
            while end != -1 and end + 1 < length and formula[end + 1] == "'":
                end = formula.find("'", end + 2)
            end = length - 1 if end == -1 else end
            out.append(formula[position : end + 1])
            position = end + 1
            continue
        match = _REF.match(formula, position)
        if match:
            dollar_col, letters, dollar_row, digits = match.groups()
            column = _column_number(letters)
            row = int(digits)
            if not dollar_col:
                column += dcol
            if not dollar_row:
                row += drow
            if column < 1 or row < 1:
                out.append("#REF!")
            else:
                out.append(
                    f"{dollar_col}{_column_letters(column)}{dollar_row}{row}"
                )
            position = match.end()
            continue
        out.append(char)
        position += 1
    return "".join(out)


def read_cells(path: Path) -> dict[str, dict[str, str]]:
    """Every populated cell: « Sheet!D26 » -> {"c": content, "v": value}."""
    cells: dict[str, dict[str, str]] = {}
    with zipfile.ZipFile(path) as archive:
        strings = _shared_strings(archive)
        for sheet_name, member in _sheet_parts(archive):
            root = ET.fromstring(archive.read(member))
            shared: dict[str, tuple[str, str]] = {}
            for cell in root.iter(f"{MAIN}c"):
                ref = cell.get("r")
                if not ref:
                    continue
                kind = cell.get("t", "n")
                formula_node = cell.find(f"{MAIN}f")
                value_node = cell.find(f"{MAIN}v")
                inline = cell.find(f"{MAIN}is")

                formula = None
                if formula_node is not None:
                    formula = formula_node.text or ""
                    if formula_node.get("t") == "shared":
                        group = formula_node.get("si", "")
                        if formula_node.text:
                            shared[group] = (formula_node.text, ref)
                        else:
                            master_text, master_ref = shared[group]
                            row, column = split_ref(ref)
                            master_row, master_column = split_ref(master_ref)
                            formula = translate(
                                master_text, row - master_row, column - master_column
                            )

                if kind == "s" and value_node is not None:
                    value = "s:" + strings[int(value_node.text or "0")]
                elif kind == "inlineStr":
                    value = "s:" + _text(inline)
                elif value_node is not None and value_node.text is not None:
                    value = f"{kind}:{value_node.text}"
                elif inline is not None:
                    value = "s:" + _text(inline)
                else:
                    value = ""

                if formula is None and not value:
                    continue  # a style-only cell is not populated
                content = "f:=" + formula if formula is not None else value
                cells[f"{sheet_name}!{ref}"] = {"c": content, "v": value}
    return cells


def statuses(
    old: dict[str, dict[str, str]], new: dict[str, dict[str, str]]
) -> dict[str, list[str]]:
    added, removed, formula_changed, value_changed, unchanged = [], [], [], [], []
    for ref in sorted(old.keys() | new.keys()):
        before, after = old.get(ref), new.get(ref)
        if before is None:
            added.append(ref)
        elif after is None:
            removed.append(ref)
        else:
            touched = False
            if before["c"] != after["c"]:
                formula_changed.append(ref)
                touched = True
            if before["v"] != after["v"]:
                value_changed.append(ref)
                touched = True
            if not touched:
                unchanged.append(ref)
    return {
        "added": added,
        "removed": removed,
        "formula_changed": formula_changed,
        "value_changed": value_changed,
        "unchanged": unchanged,
    }


def main() -> int:
    old_path, new_path, out_path = (Path(p) for p in sys.argv[1:4])
    old, new = read_cells(old_path), read_cells(new_path)
    result = statuses(old, new)
    summary = {name: len(refs) for name, refs in result.items()}
    summary["populated_old"], summary["populated_new"] = len(old), len(new)
    Path(out_path).write_text(
        json.dumps({"summary": summary, **result}, indent=1)
    )
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
