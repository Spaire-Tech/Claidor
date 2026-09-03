"""A row anchored on a sibling row's switch (`docs/pierce/wrong-switch.md`):
found when the row owns a switch it does not read and a like-shaped
sibling reads its own; silent on a shared global switch, on a lookup
without a switch of its own, and on a row with no sibling."""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook as XlsxWorkbook

from polar.tieout.audit import audit
from polar.tieout.workbook import read_workbook


def _model(path: Path, second_row_reads: str, own_switch: bool = True) -> Path:
    """Two phasing rows, each with a switch in column C and five years
    of formulas from column E; the first reads its own switch."""
    book = XlsxWorkbook()
    sheet = book.active
    sheet.title = "Inputs"
    sheet["A1"] = "Line"
    sheet["C1"] = "Switch"
    for index, column in enumerate("EFGHI"):
        sheet[f"{column}1"] = f"FY202{index + 4}"
    sheet["A2"], sheet["C2"] = "Adjustment factor", 100
    sheet["A3"], sheet["C3"] = "Adjustment factor phasing", 1
    sheet["A4"], sheet["C4"] = "Correction factor", 250
    sheet["A5"] = "Correction factor phasing"
    if own_switch:
        sheet["C5"] = 0
    for column in "EFGHI":
        sheet[f"{column}2"] = 20
        sheet[f"{column}4"] = 50
        sheet[f"{column}3"] = f"=IF($C$3=1,$C$2/5,{column}2*0.1)"
        sheet[f"{column}5"] = f"=IF({second_row_reads}=1,$C$4/5,{column}4*0.1)"
    book.save(path)
    return path


def _found(path: Path) -> list:
    return [
        one
        for one in audit(read_workbook(str(path))).findings
        if one.rule == "anchored-elsewhere"
    ]


def test_a_row_reading_its_siblings_switch_is_found(tmp_path: Path) -> None:
    found = _found(_model(tmp_path / "m.xlsx", "$C$3"))
    assert len(found) == 1
    one = found[0]
    assert one.ref == "Inputs!E5"
    assert one.severity == "error"
    assert "reads the switch at C3" in one.detail
    assert "« Adjustment factor phasing »" in one.detail
    assert "its own switch at C5 is populated and unread" in one.detail
    assert one.figure == "5"


def test_a_row_reading_its_own_switch_is_silent(tmp_path: Path) -> None:
    assert _found(_model(tmp_path / "m.xlsx", "$C$5")) == []


def test_a_row_with_no_switch_of_its_own_is_a_lookup_not_a_defect(
    tmp_path: Path,
) -> None:
    assert _found(_model(tmp_path / "m.xlsx", "$C$3", own_switch=False)) == []


def test_a_global_switch_shared_by_every_row_is_silent(tmp_path: Path) -> None:
    book = XlsxWorkbook()
    sheet = book.active
    sheet.title = "Inputs"
    sheet["A1"], sheet["C1"] = "Line", "Switch"
    sheet["A2"], sheet["C2"] = "Global switch", 1
    for row, label in ((3, "First phasing"), (4, "Second phasing")):
        sheet[f"A{row}"] = label
        sheet[f"C{row}"] = 5
        for column in "EFGHI":
            sheet[f"{column}{row}"] = f"=IF($C$2=1,$C${row}/5,0)"
    book.save(tmp_path / "g.xlsx")
    assert _found(tmp_path / "g.xlsx") == []
