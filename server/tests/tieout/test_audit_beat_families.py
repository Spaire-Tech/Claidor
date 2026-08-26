"""The beat-families check, against lattices whose defects are known.

Registered round: docs/pierce/a3-beat-families.md. The pass is
implemented and tested but NOT wired into the audit: the whole
corpus holds zero plantable beat lattices, so its catch rate is
unmeasurable there and the registered verdict keeps it out of the
report. These tests drive the pass directly, in the same order the
audit would run it, so the mechanism stays proven for the round
that can measure it.
"""

import tempfile
from pathlib import Path

from polar.tieout.audit import (
    Audit,
    _rows,
    _typed_beats,
    _typed_edges,
    _typed_islands,
)
from polar.tieout.workbook import read_workbook


def _run(build):
    from openpyxl import Workbook as Book

    book = Book()
    build(book.active)
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        loaded = read_workbook(str(path))
    result = Audit(examined=len(loaded.cells))
    #: The passes the beat pass dedups against, in the audit's order.
    _rows(loaded, result)
    _typed_islands(loaded, result)
    _typed_edges(loaded, result)
    before = len(result.findings)
    _typed_beats(loaded, result)
    return result, result.findings[before:]


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
    _, found = _run(lambda s: _pairs(s, "CEGIK", deviant="G"))
    assert len(found) == 1
    assert found[0].ref == "Sheet!G15"
    assert "every 2 columns" in found[0].detail
    assert found[0].severity == "error"


def test_a_typed_stride_three_beat_is_caught() -> None:
    _, found = _run(lambda s: _pairs(s, "CFILO", deviant="I"))
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

    result, found = _run(build)
    assert not found
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

    result, found = _run(build)
    assert not found
    assert any(
        f.rule == "typed-over-formula" and f.ref == "Sheet!E15" for f in result.findings
    )


def test_a_typed_one_on_a_beat_is_a_base_value() -> None:
    _, found = _run(lambda s: _pairs(s, "CEGIK", deviant="G", value=1.0))
    assert not found


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

    _, found = _run(build)
    assert not found
