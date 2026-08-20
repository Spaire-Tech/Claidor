"""Track A1: the write path's first promises, tested.

The writer's contract is surgical: everything an edit does not touch
keeps its exact bytes, and everything it does touch reads back
correctly in an independent library.
"""

import tempfile
import zipfile
from pathlib import Path

import pytest
from openpyxl import Workbook as Book
from openpyxl import load_workbook

from polar.tieout.workbook import read_workbook
from polar.tieout.writer import WorkbookWriter, WriteRefused


def _host(folder: str) -> Path:
    book = Book()
    sheet = book.active
    sheet.title = "Model"
    sheet["A1"] = "Rate"
    sheet["B1"] = 0.08
    sheet["A2"] = "Base"
    sheet["B2"] = 100
    sheet["A3"] = "Grown"
    sheet["B3"] = "=B2*(1+B1)"
    other = book.create_sheet("Notes")
    other["A1"] = "untouched"
    path = Path(folder) / "host.xlsx"
    book.save(path)
    return path


def _member_bytes(path: Path) -> dict[str, bytes]:
    with zipfile.ZipFile(path) as archive:
        return {i.filename: archive.read(i.filename) for i in archive.infolist()}


def test_a_no_op_save_keeps_every_members_exact_bytes() -> None:
    with tempfile.TemporaryDirectory() as folder:
        host = _host(folder)
        out = WorkbookWriter(host).save(Path(folder) / "out.xlsx")
        assert _member_bytes(host) == _member_bytes(out)


def test_a_value_edit_changes_only_its_own_sheet() -> None:
    with tempfile.TemporaryDirectory() as folder:
        host = _host(folder)
        writer = WorkbookWriter(host)
        edit = writer.set_cell("Model", "B2", formula=None, value="250")
        out = writer.save(Path(folder) / "out.xlsx")

        assert edit.before_value == "100"
        before, after = _member_bytes(host), _member_bytes(out)
        changed = {name for name in before if before[name] != after.get(name)}
        assert changed == {"xl/worksheets/sheet1.xml"}

        seen = load_workbook(out)
        assert seen["Model"]["B2"].value == 250
        assert seen["Notes"]["A1"].value == "untouched"


def test_a_formula_edit_reads_back_and_drops_the_calc_chain() -> None:
    with tempfile.TemporaryDirectory() as folder:
        host = _host(folder)
        writer = WorkbookWriter(host)
        writer.set_cell("Model", "B3", formula="=B2*(1+B1*2)", value="116")
        out = writer.save(Path(folder) / "out.xlsx")

        seen = load_workbook(out)
        assert seen["Model"]["B3"].value == "=B2*(1+B1*2)"
        with zipfile.ZipFile(out) as archive:
            names = archive.namelist()
            assert "xl/calcChain.xml" not in names
            kinds = archive.read("[Content_Types].xml").decode("utf-8")
            assert "calcChain" not in kinds

        book = read_workbook(str(out))
        cell = book.cells["Model!B3"]
        assert cell.formula == "=B2*(1+B1*2)"
        assert str(cell.value) == "116"


def test_a_the_writer_refuses_what_it_cannot_do_safely() -> None:
    with tempfile.TemporaryDirectory() as folder:
        host = _host(folder)
        writer = WorkbookWriter(host)
        with pytest.raises(WriteRefused, match="A2"):
            writer.set_cell("Model", "Z99", formula=None, value="1")
        with pytest.raises(WriteRefused, match="no sheet"):
            writer.set_cell("Missing", "A1", formula=None, value="1")


def test_a_edits_record_before_and_after_for_the_changeset() -> None:
    with tempfile.TemporaryDirectory() as folder:
        writer = WorkbookWriter(_host(folder))
        edit = writer.set_cell("Model", "B3", formula="=B2*2", value="200")
        assert edit.before_formula == "=B2*(1+B1)"
        assert edit.formula == "=B2*2"
        assert [e.ref for e in writer.edits] == ["B3"]
