"""The range-versus-block check, against ranges whose defects are known.

Registered round: docs/pierce/a3-range-block.md. The double count is
an error — the arithmetic is wrong however the model is used. The
round's second class (a range spanning a label) was withdrawn
before any result because the reader does not elect text cells; the
test below pins that fact. The silence half pins the boundaries the
registration drew: blanks are not judged, a subtotal reaching
outside the range is a different claim, and a correct total over a
partition of subtotals is the layout every model uses.
"""

import tempfile
from pathlib import Path

from polar.tieout.audit import audit
from polar.tieout.workbook import read_workbook


def _audit(build):
    from openpyxl import Workbook as Book

    book = Book()
    build(book.active)
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        return audit(read_workbook(str(path)))


def _found(result):
    return [f for f in result.findings if f.rule == "range-over-block"]


def test_a_total_swallowing_its_own_subtotal_is_an_error() -> None:
    def build(sheet) -> None:
        for row in range(2, 7):
            sheet[f"A{row}"] = f"Item {row}"
            sheet[f"B{row}"] = float(row)
        sheet["B7"] = "=SUM(B2:B6)"
        sheet["B8"] = "=SUM(B2:B7)"

    found = _found(_audit(build))
    assert len(found) == 1
    assert found[0].ref == "Sheet!B8"
    assert found[0].severity == "error"
    assert "counted twice" in found[0].detail
    assert "B7" in found[0].detail


def test_the_reader_does_not_elect_a_text_cell() -> None:
    """Why class 2 was withdrawn before any result, pinned so the fact
    cannot quietly change: a text cell mid-range is absent from the
    reader's cells entirely, so no detector on that surface can tell a
    label from a blank. If this test ever fails, the reader has
    changed and class 2 becomes registrable."""
    import tempfile as _t

    from openpyxl import Workbook as Book

    book = Book()
    sheet = book.active
    for row in (2, 3, 4):
        sheet[f"A{row}"] = f"Item {row}"
    sheet["B2"] = 2.0
    sheet["B3"] = "Second section"
    sheet["B4"] = 4.0
    with _t.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        loaded = read_workbook(str(path))
    assert loaded.cells.get("Sheet!B3") is None
    assert loaded.cells.get("Sheet!B2") is not None


def test_a_clean_total_is_silent() -> None:
    def build(sheet) -> None:
        for row in range(2, 7):
            sheet[f"A{row}"] = f"Item {row}"
            sheet[f"B{row}"] = float(row)
        sheet["B7"] = "=SUM(B2:B6)"

    assert not _found(_audit(build))


def test_a_grand_total_over_a_partition_is_silent() -> None:
    """Two subtotals added by a grand total that does not reach into
    their members — the layout every statement uses."""

    def build(sheet) -> None:
        for row in (2, 3, 4):
            sheet[f"A{row}"] = f"Item {row}"
            sheet[f"B{row}"] = float(row)
        sheet["B5"] = "=SUM(B2:B4)"
        for row in (6, 7, 8):
            sheet[f"A{row}"] = f"Item {row}"
            sheet[f"B{row}"] = float(row)
        sheet["B9"] = "=SUM(B6:B8)"
        sheet["B10"] = "=B5+B9"

    assert not _found(_audit(build))


def test_a_blank_inside_a_range_is_not_judged() -> None:
    """The registration's own boundary: a blank is ordinary layout,
    and flagging it is the flood the mining round warned of."""

    def build(sheet) -> None:
        for row in (2, 3, 4, 6, 7):
            sheet[f"A{row}"] = f"Item {row}"
            sheet[f"B{row}"] = float(row)
        sheet["B8"] = "=SUM(B2:B7)"

    assert not _found(_audit(build))


def test_a_subtotal_reaching_outside_the_range_is_silent() -> None:
    """The inner range must be a proper subset: one that reaches above
    the outer range makes a different claim."""

    def build(sheet) -> None:
        for row in range(2, 9):
            sheet[f"A{row}"] = f"Item {row}"
            sheet[f"B{row}"] = float(row)
        sheet["B9"] = "=SUM(B2:B8)"
        sheet["B10"] = "=SUM(B9:B9)"
        sheet["B11"] = "=SUM(B5:B10)"

    found = _found(_audit(build))
    assert all(f.ref != "Sheet!B11" for f in found)
