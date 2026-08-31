"""Reading a `.xlsb` by converting it, and not believing the converter.

The unit tests run always. The test against a real binary workbook runs
only when the closed-deal corpus has been fetched
(`scripts.corpus_sft_models`) and LibreOffice is installed, and it skips
rather than passing quietly, so an empty cache reads as « not run ».
"""

from pathlib import Path

import pytest
from openpyxl import Workbook as NewWorkbook

from polar.models.tieout import ArtifactKind
from polar.tieout.binary import (
    ARTIFACTS,
    BinaryUnreadable,
    converter,
    is_artifact,
    to_xlsx,
    unartifact,
)
from polar.tieout.ingest import SUFFIXES
from polar.tieout.legacy import _whole_numbers
from polar.tieout.workbook import _grid_of, read_workbook

CORPUS = Path(__file__).resolve().parents[2] / "scripts" / "corpus_sft"
REAL = CORPUS / "barrhead_model.xlsb"

needs_real = pytest.mark.skipif(
    not REAL.exists() or converter() is None,
    reason="run scripts.corpus_sft_models and dev/setup-libreoffice",
)


class TestArtifacts:
    """LibreOffice writes booleans as formulas. Nothing downstream may
    see them, because the audit's whole subject is formulas: one real
    closed-deal model with no formulas at all converts into a file
    carrying 10,417."""

    def test_booleans_are_undone(self) -> None:
        assert unartifact("=TRUE()") is True
        assert unartifact("=FALSE()") is False

    def test_everything_else_is_left_alone(self) -> None:
        for value in ("=SUM(A1:A9)", "=IF(A1,TRUE(),FALSE())", 12, None, "TRUE"):
            assert unartifact(value) == value

    def test_the_match_is_exact_not_a_pattern(self) -> None:
        # A rule loose enough to catch these would delete real work.
        assert not is_artifact("=TRUE()+1")
        assert not is_artifact("=IF(X,TRUE(),0)")
        assert not is_artifact("=NOT(TRUE())")
        assert is_artifact("=TRUE()")

    def test_both_artifacts_are_covered(self) -> None:
        assert set(ARTIFACTS) == {"=TRUE()", "=FALSE()"}


class TestGridSuppression:
    """The suppression happens where the grid is built, which is the one
    place every cell value passes through."""

    @staticmethod
    def _sheet(value: str) -> object:
        book = NewWorkbook()
        sheet = book.active
        sheet["A1"] = "Debt service reserve"
        sheet["B1"] = value
        return sheet

    def test_converted_workbook_loses_the_manufactured_formula(self) -> None:
        sheet = self._sheet("=TRUE()")
        grid = _grid_of(sheet, sheet, converted=True)
        assert grid.written[(1, 2)] is True

    def test_an_ordinary_workbook_is_never_touched(self) -> None:
        # The same string in a file nobody converted is the author's, and
        # rewriting it would be us editing somebody's model.
        sheet = self._sheet("=TRUE()")
        grid = _grid_of(sheet, sheet, converted=False)
        assert grid.written[(1, 2)] == "=TRUE()"

    def test_a_real_formula_survives_conversion(self) -> None:
        sheet = self._sheet("=SUM(C1:C9)")
        grid = _grid_of(sheet, sheet, converted=True)
        assert grid.written[(1, 2)] == "=SUM(C1:C9)"


class TestWithoutLibreOffice:
    def test_the_message_names_both_ways_out(self, monkeypatch, tmp_path) -> None:
        monkeypatch.setattr("polar.tieout.binary.CANDIDATES", ())
        with pytest.raises(BinaryUnreadable) as raised:
            to_xlsx("anything.xlsb", str(tmp_path))
        said = str(raised.value)
        assert "LibreOffice" in said
        assert ".xlsx" in said

    def test_a_file_that_does_not_convert_says_so(self, tmp_path) -> None:
        if converter() is None:
            pytest.skip("no converter installed")
        broken = tmp_path / "broken.xlsb"
        broken.write_bytes(b"this is not a workbook")
        with pytest.raises(BinaryUnreadable):
            to_xlsx(str(broken), str(tmp_path))


class TestIngestAcceptsIt:
    def test_xlsb_is_a_model(self) -> None:
        assert ".xlsb" in SUFFIXES[ArtifactKind.model]


@needs_real
class TestRealBinaryWorkbook:
    def test_it_reads_and_carries_no_artifacts(self) -> None:
        book = read_workbook(str(REAL))
        assert len(book.cells) > 100_000
        assert len(book.sheets) > 10
        # The file has no formulas of its own; the converter offered
        # 10,417 and none of them may reach a check.
        assert not [c for c in book.cells.values() if is_artifact(c.formula)]

    def test_the_labels_survive(self) -> None:
        book = read_workbook(str(REAL))
        assert any(cell.row_label for cell in book.cells.values())


class TestWholeNumbersInLegacyFormulas:
    """BIFF stores every numeric literal as a double, so the decompiler
    prints `=1/(1+r)` as `=1.0/(1.0+r)`. Cosmetic to a person and not to
    the version comparison, which keys on formula text: the same
    untouched row would read as a methodology change on a model saved
    once in each format."""

    def test_a_whole_number_loses_its_decimal(self) -> None:
        assert _whole_numbers("1.0/(1.0+B1)^2.0") == "1/(1+B1)^2"

    def test_a_real_decimal_is_kept(self) -> None:
        for kept in ("1.05", "0.5", "1.01", "10.25"):
            assert _whole_numbers(kept) == kept

    def test_references_and_names_are_untouched(self) -> None:
        for kept in ("SUM(A1:A9)", "Sheet1.0!B2", "rate_1.0"):
            assert _whole_numbers(kept) == kept

    def test_words_inside_quotes_are_the_authors(self) -> None:
        # Rewriting somebody's label to tidy our own formatting would be
        # the worse bug.
        assert _whole_numbers('IF(A1,"Phase 1.0",2.0)') == 'IF(A1,"Phase 1.0",2)'
