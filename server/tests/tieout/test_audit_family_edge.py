"""The family-edge check, against runs whose defects are known.

Registered round: docs/pierce/a3-family-edge.md. The first half
plants the mining round's evidence shapes — a typed tail, the
E17/F17 pair — and expects exactly one finding each; the second half
builds what the guards exist for — a boundary-less head, typed
history left of a real boundary, a zero, a stack, a data region —
and expects silence.
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


def _edges(result):
    return [f for f in result.findings if f.rule == "typed-over-edge"]


def _series(sheet, columns="CDEFG", row=15):
    """Data on rows 6-7, one formula per column on `row`."""
    for at in columns:
        sheet[f"{at}6"] = 1.0
        sheet[f"{at}7"] = 2.0
        sheet[f"{at}{row}"] = f"={at}6+{at}7"


def test_a_typed_tail_is_caught() -> None:
    def build(sheet) -> None:
        _series(sheet)
        sheet["G15"] = 7.5

    result = _audit(build)
    found = _edges(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!G15"
    assert "typed at the end of a series" in found[0].detail
    assert found[0].severity == "error"


def test_the_evidence_pair_folds_into_one_finding() -> None:
    """Table II.5!E17/F17 — two adjacent typed cells at the tail are
    one late adjustment, one finding, both cells in the roster."""

    def build(sheet) -> None:
        _series(sheet)
        sheet["F15"] = -0.556
        sheet["G15"] = -0.539

    result = _audit(build)
    found = _edges(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!G15"
    assert "F15" in found[0].cells
    assert "G15" in found[0].cells


def test_a_head_without_a_boundary_is_silent() -> None:
    """Typed actuals lead rows from the left; without a detected
    historical/forecast boundary the head side never fires."""

    def build(sheet) -> None:
        _series(sheet)
        sheet["C15"] = 7.5

    assert not _edges(_audit(build))


def _boundary_sheet(sheet) -> None:
    """Three rows of typed history in B-C then formulas D-G give the
    sheet a boundary at column D."""
    for row in (2, 3, 4):
        sheet[f"B{row}"] = 1.0
        sheet[f"C{row}"] = 2.0
        for at in "DEFG":
            sheet[f"{at}{row}"] = f"=C{row}+1"


def test_a_head_right_of_the_boundary_is_caught() -> None:
    def build(sheet) -> None:
        _boundary_sheet(sheet)
        #: The test row starts at the boundary itself: a typed cell
        #: at D with a calculated series to its right that computes
        #: on its own, reading nothing from the typed cell.
        sheet["D6"] = 9.5
        for at in "EFG":
            sheet[f"{at}6"] = f"={at}2*2"

    result = _audit(build)
    found = _edges(result)
    assert [f.ref for f in found] == ["Sheet!D6"]
    assert "typed at the start of a series" in found[0].detail


def test_a_series_reading_its_typed_head_is_a_seed() -> None:
    """Round 2's horizontal seed guard, from the deflator chain that
    walks right from its typed base: a stretch whose first formula
    reads the typed cell is continuing from its own starting value."""

    def build(sheet) -> None:
        _boundary_sheet(sheet)
        sheet["D6"] = 9.5
        for at in "EFG":
            sheet[f"{at}6"] = f"={chr(ord(at) - 1)}6+1"

    assert not _edges(_audit(build))


def test_a_typed_one_is_an_index_base() -> None:
    """Round 2's identity guard: ten of ten corpus findings were typed
    1s heading cumulative-index series — the base period, not a
    defect."""

    def build(sheet) -> None:
        _series(sheet)
        sheet["G15"] = 1.0

    assert not _edges(_audit(build))


def test_typed_history_left_of_the_boundary_is_silent() -> None:
    def build(sheet) -> None:
        for row in (2, 3, 4, 5):
            sheet[f"B{row}"] = 1.0
            sheet[f"C{row}"] = 2.0
            for at in "DEFG":
                sheet[f"{at}{row}"] = f"=C{row}+1"

    assert not _edges(_audit(build))


def test_a_zero_tail_is_scaffolding() -> None:
    def build(sheet) -> None:
        _series(sheet)
        sheet["G15"] = 0.0

    assert not _edges(_audit(build))


def test_three_typed_cells_are_a_region() -> None:
    def build(sheet) -> None:
        _series(sheet, columns="CDEFGHI")
        sheet["G15"] = 1.5
        sheet["H15"] = 2.5
        sheet["I15"] = 3.5

    assert not _edges(_audit(build))


def test_a_stacked_tail_is_a_parameter() -> None:
    """The registered guard is the engine's own stacked test: a run of
    constants taller than the typed-block line is a parameter column,
    not a paste — a two-tall stack stays a catchable paste."""

    def build(sheet) -> None:
        _series(sheet)
        for row in range(15, 25):
            sheet[f"G{row}"] = 7.5 + row

    assert not _edges(_audit(build))


def test_a_broken_stretch_has_no_family() -> None:
    def build(sheet) -> None:
        _series(sheet)
        sheet["E15"] = "=E6*2"
        sheet["G15"] = 7.5

    assert not _edges(_audit(build))
