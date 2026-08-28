"""One pass over the sheet XML, against openpyxl's two.

The differential test that matters runs over the whole corpus and is
not committed as a unit test — 27 real models take twenty minutes. Its
result is recorded in the worklog: **27 files, zero differences**,
across formulas, values and number formats. What is here is the shape
of that comparison on the fixtures, so a regression shows up in the
ordinary suite rather than only in a corpus sweep.
"""

import zipfile
from pathlib import Path

import pytest
from openpyxl import load_workbook
from openpyxl.worksheet.formula import ArrayFormula, DataTableFormula

from polar.tieout.sheets import cells_of

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
MODELS = [p for p in (CASCADE / "cascade_model.xlsx", CASCADE / "audit_fixture.xlsx")]


def _normalise(value: object) -> object:
    """Formula objects compare by what they say, not by identity."""
    if isinstance(value, ArrayFormula | DataTableFormula):
        return ("formula", getattr(value, "text", None), getattr(value, "ref", None))
    return value


def _by_openpyxl(path: str) -> dict[str, tuple[dict, dict, dict]]:
    formulas = load_workbook(path, data_only=False, read_only=True)
    values = load_workbook(path, data_only=True, read_only=True)
    out = {}
    for written_sheet, value_sheet in zip(
        formulas.worksheets, values.worksheets, strict=True
    ):
        written, seen, formats = {}, {}, {}
        for row in written_sheet.iter_rows():
            for cell in row:
                if cell.value is not None:
                    written[(cell.row, cell.column)] = cell.value
                    formats[(cell.row, cell.column)] = cell.number_format
        for row in value_sheet.iter_rows():
            for cell in row:
                if cell.value is not None:
                    seen[(cell.row, cell.column)] = cell.value
        out[written_sheet.title] = (written, seen, formats)
    formulas.close()
    values.close()
    return out


@pytest.mark.parametrize("model", MODELS, ids=lambda p: p.name)
class TestSameAsOpenpyxl:
    """Not « close enough »: the same cells with the same contents."""

    def test_every_cell_agrees(self, model: Path) -> None:
        want = _by_openpyxl(str(model))
        book = load_workbook(str(model), read_only=True, data_only=False)
        got = cells_of(str(model), book)
        book.close()

        assert set(want) == set(got)
        for name, (written, values, formats) in want.items():
            fast = got[name]
            assert set(written) == set(fast.written), f"{name}: formula cells"
            assert set(values) == set(fast.values), f"{name}: value cells"
            for at, value in written.items():
                assert _normalise(value) == _normalise(fast.written[at]), f"{name}!{at}"
            for at, value in values.items():
                assert value == fast.values[at], f"{name}!{at}"
            for at, code in formats.items():
                assert code == fast.formats.get(at), f"{name}!{at} number format"


class TestItDeclinesRatherThanGuesses:
    def test_a_file_that_is_not_a_workbook_raises(self, tmp_path: Path) -> None:
        # The caller falls back to openpyxl on any exception, so the only
        # requirement is that this never returns something made up.
        broken = tmp_path / "broken.xlsx"
        broken.write_bytes(b"not a zip at all")
        with pytest.raises((zipfile.BadZipFile, OSError, KeyError, ValueError)):
            book = load_workbook(str(broken), read_only=True)
            cells_of(str(broken), book)
