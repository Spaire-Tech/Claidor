"""The beat-families check, against lattices whose defects are known.

Registered round: docs/pierce/a3-beat-families.md. The first half
plants the mining round's evidence shapes — a typed value on a
stride-2 and a stride-3 beat position, including the value/% pair
layout where percentage formulas of another shape sit between — and
expects exactly one finding each; the second half builds what the
guards exist for — a dense run wearing a stride, an index-base 1, a
lattice left of a boundary — and expects silence or the plain
pass's rightful claim.
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


def _beats(result):
    return [f for f in result.findings if f.rule == "typed-over-beat"]


def _pairs(sheet, formula_columns, deviant=None, value=7.5, between_value=2.0):
    """Formulas on row 15 at the given columns, data values between
    and beneath — the value/% pair layout with typed data columns."""
    first, last = formula_columns[0], formula_columns[-1]
    for at in range(ord(first), ord(last) + 1):
        col = chr(at)
        sheet[f"{col}6"] = 1.0
        if col in formula_columns:
            sheet[f"{col}15"] = value if col == deviant else f"={col}6*2"
        else:
            sheet[f"{col}15"] = between_value


def test_a_typed_stride_two_beat_is_caught() -> None:
    result = _audit(lambda s: _pairs(s, "CEGIK", deviant="G"))
    found = _beats(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!G15"
    assert "every 2 columns" in found[0].detail
    assert found[0].severity == "error"


def test_a_typed_stride_three_beat_is_caught() -> None:
    result = _audit(lambda s: _pairs(s, "CFILO", deviant="I"))
    found = _beats(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!I15"
    assert "every 3 columns" in found[0].detail


def test_percentage_flanks_are_the_interior_pass_and_not_a_beat() -> None:
    """The value/% pair layout with formulas in every column: the
    typed cell sits between two % formulas whose shape repeats, so
    the *interior* pass rightly claims it — the dedup keeps this rule
    silent, one claim per cell. The beat rule's own territory is the
    lattice whose between-columns hold data, not formulas."""

    def build(sheet) -> None:
        for col in "CDEFGHIJK":
            sheet[f"{col}6"] = 1.0
            sheet[f"{col}7"] = 4.0
        for col in "CEGIK":
            sheet[f"{col}15"] = 7.5 if col == "G" else f"={col}6*2"
        for col in "DFHJ":
            sheet[f"{col}15"] = f"={col}6/{col}7"

    result = _audit(build)
    assert not _beats(result)
    assert any(
        f.rule == "typed-over-formula" and f.ref == "Sheet!G15" for f in result.findings
    )


def test_a_dense_run_is_the_plain_pass_and_not_a_beat() -> None:
    """A same-shape dense run with a typed interior cell is the
    interior pass's catch; the stride the lattice carves out of it is
    an artifact, and the real-lattice guard plus the dedup keep this
    rule silent."""

    def build(sheet) -> None:
        for col in "CDEFG":
            sheet[f"{col}6"] = 1.0
            sheet[f"{col}15"] = 7.5 if col == "E" else f"={col}6*2"

    result = _audit(build)
    assert not _beats(result)
    assert any(
        f.rule == "typed-over-formula" and f.ref == "Sheet!E15" for f in result.findings
    )


def test_a_typed_one_on_a_beat_is_a_base_value() -> None:
    result = _audit(lambda s: _pairs(s, "CEGIK", deviant="G", value=1.0))
    assert not _beats(result)


def test_a_beat_left_of_the_boundary_is_history() -> None:
    def build(sheet) -> None:
        #: Three rows of typed history in B-E then formulas F-K give
        #: the sheet a boundary at column F.
        for row in (2, 3, 4):
            for col in "BCDE":
                sheet[f"{col}{row}"] = 1.0
            for col in "FGHIJK":
                sheet[f"{col}{row}"] = f"=E{row}+1"
        #: A stride-2 lattice B-D-F-H-J with the typed cell at D,
        #: left of the boundary: typed history, not a beat.
        for col in "BDFHJ":
            sheet[f"{col}6"] = 1.0
            sheet[f"{col}16"] = 7.5 if col == "D" else f"={col}6*2"
        for col in "CEGI":
            sheet[f"{col}16"] = 2.0

    assert not _beats(_audit(build))
