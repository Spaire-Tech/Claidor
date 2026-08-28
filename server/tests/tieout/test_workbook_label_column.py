"""Electing numeric-valued formulas in the label column.

Registered round: `docs/pierce/label-column-election.md`. One column
per sheet is chosen by `_label_column` and has never been elected as
content, so a formula written there is invisible to every rule. The
change elects such a cell **when its cached value is numeric**, and
leaves the ones resolving to text alone.

Two of these tests pin things the change must *not* do, which the
registration fixed in advance because neither is obvious from the
proposal: the `series` test must be computed on the data columns
alone, and the header row keeps today's behaviour.

openpyxl writes no cached value for a formula, so the helper injects
`<v>` by the same XML surgery the planting harnesses use — without a
cached value the case under test cannot exist.
"""

import re
import shutil
import tempfile
import zipfile
from pathlib import Path

from polar.tieout.workbook import read_workbook


def _inject(path: Path, values: dict[str, str]) -> Path:
    """Give named formula cells a cached `<v>`, as a real file has."""
    out = path.with_name("cached.xlsx")
    shutil.copy(path, out)
    with zipfile.ZipFile(out) as archive:
        names = [n for n in archive.namelist() if n.startswith("xl/worksheets/sheet")]
        parts = {n: archive.read(n).decode("utf-8") for n in names}
        others = {
            n: archive.read(n) for n in archive.namelist() if n not in parts
        }
        order = archive.infolist()
    for name, xml in parts.items():
        for ref, cached in values.items():
            pattern = re.compile(rf'(<c r="{re.escape(ref)}"[^>]*>)(.*?)(</c>)', re.DOTALL)
            match = pattern.search(xml)
            if match is None:
                continue
            body = match.group(2)
            if "<v>" in body:
                continue
            xml = (
                xml[: match.start()]
                + match.group(1) + body + f"<v>{cached}</v>" + match.group(3)
                + xml[match.end() :]
            )
        parts[name] = xml
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as target:
        for item in order:
            data = parts.get(item.filename)
            target.writestr(item, data.encode("utf-8") if data is not None
                            else others[item.filename])
    return out


def _read(build, cached: dict[str, str] | None = None):
    from openpyxl import Workbook as Book

    book = Book()
    build(book.active)
    folder = tempfile.mkdtemp()
    path = Path(folder) / "built.xlsx"
    book.save(path)
    if cached:
        path = _inject(path, cached)
    return read_workbook(str(path))


def _ladder(sheet) -> None:
    """Column A is the label column: distinct names down B is the
    only other text, and A carries a computed date ladder."""
    sheet["A1"] = "Date"
    sheet["B1"] = "Value"
    sheet["A2"] = 40000
    sheet["B2"] = 10.0
    for row in range(3, 12):
        sheet[f"A{row}"] = f"=A{row - 1}+1"
        sheet[f"B{row}"] = float(row)


def test_a_numeric_formula_in_the_label_column_is_elected() -> None:
    cached = {f"A{row}": str(39998 + row) for row in range(3, 12)}
    book = _read(_ladder, cached)
    assert "Sheet!A5" in book.cells, sorted(book.cells)[:12]
    cell = book.cells["Sheet!A5"]
    assert cell.formula == "=A4+1"
    assert cell.value is not None


def test_a_text_valued_formula_in_the_label_column_is_not_elected() -> None:
    def build(sheet) -> None:
        sheet["A1"] = "Name"
        sheet["B1"] = "Value"
        for row in range(2, 9):
            sheet[f"A{row}"] = f'="Row {row}"'
            sheet[f"B{row}"] = float(row)

    book = _read(build, {f"A{row}": "" for row in range(2, 9)})
    assert not [ref for ref in book.cells if ref.startswith("Sheet!A")]


def test_a_plain_number_in_the_label_column_is_still_not_elected() -> None:
    def build(sheet) -> None:
        sheet["A1"] = "Year"
        sheet["B1"] = "Value"
        for row in range(2, 9):
            sheet[f"A{row}"] = 2000 + row
            sheet[f"B{row}"] = float(row)

    book = _read(build)
    assert not [ref for ref in book.cells if ref.startswith("Sheet!A")]


def test_the_series_test_is_unchanged_by_the_new_election() -> None:
    """A row with one data value must not gain a column label.

    `series = len(numeric) > 1` decides whether a cell inherits its
    column header. If the label-column cell joined that count, this
    row would become a series and B would start claiming to be about
    whatever heads its column.
    """
    def build(sheet) -> None:
        sheet["A1"] = "Item"
        sheet["B1"] = "FY2026"
        sheet["A2"] = 40000
        sheet["B2"] = 1.0
        for row in range(3, 10):
            sheet[f"A{row}"] = f"=A{row - 1}+1"
            sheet[f"B{row}"] = float(row)
        sheet["A12"] = "=A11+1"
        sheet["B12"] = 99.0

    cached = {f"A{row}": str(39998 + row) for row in list(range(3, 10)) + [12]}
    book = _read(build, cached)
    lone = book.cells.get("Sheet!B12")
    assert lone is not None
    assert lone.column_label == "", lone.column_label


def test_the_header_row_keeps_todays_behaviour() -> None:
    """A numeric formula in the label column *on the header row* is
    part of the header apparatus, and stays unelected.

    The layout matters: header detection needs a real header row, so
    this builds a title, a period header and five data rows. A first
    attempt at this test used a three-cell sheet and asserted the
    header row was row 1 — it is not, on a book that small, and the
    test was pinning my assumption rather than the engine.
    """
    def build(sheet) -> None:
        sheet["A1"] = "Financial model"
        sheet["A2"] = "=1+1"
        for offset, column in enumerate("BCDEF"):
            sheet[f"{column}2"] = f"FY{2025 + offset}"
        for row, name in enumerate(
            ["Revenue", "Costs", "EBITDA", "Interest", "Tax"], start=3
        ):
            sheet[f"A{row}"] = name
            for offset, column in enumerate("BCDEF"):
                sheet[f"{column}{row}"] = float(row * 10 + offset)

    book = _read(build, {"A2": "2"})
    assert "Sheet!A2" not in book.cells
    #: and the header is still a header, so the layout really did
    #: exercise the branch under test
    assert book.cells["Sheet!B3"].column_label == "FY2025"
