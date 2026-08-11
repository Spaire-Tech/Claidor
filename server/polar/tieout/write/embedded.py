"""Writing one number into the workbook embedded inside a chart.

A `.pptx` chart carries a whole `.xlsx` as a part of the package — the one
that opens when somebody clicks « Edit data ». It has to agree with the
cache in the chart XML, and keeping them in step is the second of the two
real problems in `docs/pierce/writing-pptx.md`.

**This splices bytes rather than loading the workbook.** Reading an
embedded workbook through a spreadsheet library and writing it back
rewrites every part of it: styles are re-emitted, tables and defined names
are dropped by some libraries, and the file that comes out is a different
file that happens to hold the same numbers. These workbooks are three
columns of data that PowerPoint generated and nobody has ever opened, and
the least this can do to one is replace the digits between one `<v>` and
its closing tag. Every other byte stays where it was, by construction.
"""

import re
import zipfile
from decimal import Decimal
from io import BytesIO

from .edit import CannotWrite

WORKBOOK = "xl/workbook.xml"
RELATIONSHIPS = "xl/_rels/workbook.xml.rels"

#: `Sheet1!$B$2:$B$4`, `'Q1 data'!$B$2`. The quoted form is what Excel
#: writes whenever a sheet name has a space in it.
_REFERENCE = re.compile(
    r"^(?:'(?P<quoted>[^']*)'|(?P<plain>[^!]+))!"
    r"\$?(?P<column>[A-Z]{1,3})\$?(?P<row>\d+)"
    r"(?::\$?(?P<column_to>[A-Z]{1,3})\$?(?P<row_to>\d+))?$"
)

_SHEET = re.compile(
    rb'<sheet\b[^>]*\bname="(?P<name>[^"]*)"[^>]*\br:id="(?P<rid>[^"]*)"[^>]*/?>'
)
_RELATIONSHIP = re.compile(
    rb'<Relationship\b[^>]*\bId="(?P<rid>[^"]*)"[^>]*\bTarget="(?P<target>[^"]*)"'
)


def write_cell(blob: bytes, formula: str, point: int, value: Decimal) -> bytes:
    """The workbook, with the cell behind `point` holding `value`."""
    sheet_name, reference = _cell_reference(formula, point)

    try:
        archive = zipfile.ZipFile(BytesIO(blob))
    except zipfile.BadZipFile as problem:
        raise CannotWrite(
            "The workbook embedded in this chart cannot be opened, so the "
            "chart's own data cannot be corrected with it."
        ) from problem

    names = [info.filename for info in archive.infolist()]
    compression = {info.filename: info.compress_type for info in archive.infolist()}
    parts = {name: archive.read(name) for name in names}

    part = _sheet_part(parts, sheet_name)
    if part not in parts:
        raise CannotWrite(f"The chart's workbook has no sheet called « {sheet_name} ».")
    parts[part] = _replace_value(parts[part], reference, value, sheet_name)

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as rebuilt:
        for name in names:
            rebuilt.writestr(
                name,
                parts[name],
                compress_type=compression.get(name, zipfile.ZIP_DEFLATED),
            )
    return buffer.getvalue()


def _cell_reference(formula: str, point: int) -> tuple[str, str]:
    """« Sheet1!$B$2:$B$4 » and point 1 are Sheet1 and B3."""
    found = _REFERENCE.match(formula.strip())
    if found is None:
        raise CannotWrite(
            f"This chart series is plotted from « {formula} », which is not "
            "a range this can follow back into the workbook."
        )
    sheet = found.group("quoted") or found.group("plain")
    column = _column_index(found.group("column"))
    row = int(found.group("row"))

    column_to = found.group("column_to")
    row_to = found.group("row_to")
    if column_to is None:
        # A single cell plotted as a one-point series.
        if point != 0:
            raise CannotWrite(
                f"This series is plotted from the single cell « {formula} », "
                f"so it has no point {point + 1}."
            )
        return sheet, f"{_column_letters(column)}{row}"

    if _column_index(column_to) == column:
        return sheet, f"{_column_letters(column)}{row + point}"
    if int(row_to) == row:
        return sheet, f"{_column_letters(column + point)}{row}"
    raise CannotWrite(
        f"This chart series is plotted from « {formula} », which covers "
        "more than one row and more than one column."
    )


def _column_index(letters: str) -> int:
    index = 0
    for letter in letters:
        index = index * 26 + (ord(letter) - ord("A") + 1)
    return index


def _column_letters(index: int) -> str:
    letters = ""
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        letters = chr(ord("A") + remainder) + letters
    return letters


def _sheet_part(parts: dict[str, bytes], name: str) -> str:
    """Which part holds a sheet, by the name the chart's formula used."""
    workbook = parts.get(WORKBOOK, b"")
    relationship_id: str | None = None
    for found in _SHEET.finditer(workbook):
        if found.group("name").decode() == name:
            relationship_id = found.group("rid").decode()
            break
    if relationship_id is None:
        raise CannotWrite(f"The chart's workbook has no sheet called « {name} ».")

    for found in _RELATIONSHIP.finditer(parts.get(RELATIONSHIPS, b"")):
        if found.group("rid").decode() == relationship_id:
            target = found.group("target").decode().lstrip("/")
            return target if target.startswith("xl/") else f"xl/{target}"
    raise CannotWrite(f"The chart's workbook does not say where « {name} » is.")


def _replace_value(sheet: bytes, reference: str, value: Decimal, name: str) -> bytes:
    """Swap the digits inside one `<c r="B3"><v>…</v></c>` and nothing else."""
    cell = re.compile(
        rb'<c\b[^>]*\br="' + re.escape(reference.encode()) + rb'"(?P<attrs>[^>]*)'
        rb"(?:/>|>(?P<body>.*?)</c>)",
        re.DOTALL,
    )
    found = cell.search(sheet)
    if found is None:
        raise CannotWrite(
            f"{name}!{reference} is empty in the chart's own workbook, so "
            "there is nothing there to correct."
        )
    body = found.group("body")
    if body is None:
        raise CannotWrite(
            f"{name}!{reference} is empty in the chart's own workbook, so "
            "there is nothing there to correct."
        )
    if b"<f" in body:
        raise CannotWrite(
            f"{name}!{reference} is a formula in the chart's own workbook. "
            "Correcting the chart would mean overwriting it, which is a "
            "decision for whoever built the chart."
        )
    if b't="s"' in found.group("attrs"):
        raise CannotWrite(
            f"{name}!{reference} holds text in the chart's own workbook, not a number."
        )

    held = re.compile(rb"<v>(?P<value>.*?)</v>", re.DOTALL).search(body)
    if held is None:
        raise CannotWrite(
            f"{name}!{reference} holds no value in the chart's own workbook."
        )

    start = found.start("body") + held.start("value")
    end = found.start("body") + held.end("value")
    return sheet[:start] + _plain(value).encode() + sheet[end:]


def _plain(value: Decimal) -> str:
    """A number the way a spreadsheet writes one: 43, not 43.0 or 4.3E+1."""
    text = f"{value:f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


__all__ = ["write_cell"]
