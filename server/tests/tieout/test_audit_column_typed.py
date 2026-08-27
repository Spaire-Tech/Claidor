"""The column-orientation round's waiver, pinned on both sides.

Registered round: docs/pierce/a3-column-typed.md. The left-formula
history test is waived for interior islands — a typed cell with the
run's formulas above and below is vertically sandwiched by the
calculation it interrupts — while the run's edges keep the guard,
because column-major models genuinely put typed history at the top
of a column.
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


def _typed(result):
    return [f for f in result.findings if f.rule == "typed-over-formula"]


def test_an_interior_island_needs_no_left_formula() -> None:
    """The round-1 misses C_Capex!F294 and Inflation!B151, distilled:
    a typed cell inside a leftmost formula column, sandwiched by the
    family above and below."""

    def build(sheet) -> None:
        for row in range(2, 11):
            sheet[f"A{row}"] = float(row)
            sheet[f"B{row}"] = 7.5 if row == 6 else f"=A{row}*2"

    result = _audit(build)
    found = [f for f in _typed(result) if f.ref == "Sheet!B6"]
    assert len(found) == 1
    assert "typed into a column" in found[0].detail


def test_a_top_island_without_a_left_formula_keeps_the_guard() -> None:
    """C_Performance!F167's class, the named limitation: a typed cell
    at a run's top with nothing to its left reads as column-major
    typed history and stays silent."""

    def build(sheet) -> None:
        for row in range(2, 11):
            sheet[f"A{row}"] = float(row)
            sheet[f"B{row}"] = 7.5 if row == 2 else f"=A{row}*2"

    result = _audit(build)
    assert not [f for f in _typed(result) if f.ref == "Sheet!B2"]


def test_a_typed_zero_admitted_only_by_the_waiver_is_scaffolding() -> None:
    """Round 3, from sixteen corpus cells: a zero row inside a formula
    band is a template's spare line, not a paste over a calculation."""

    def build(sheet) -> None:
        for row in range(2, 11):
            sheet[f"A{row}"] = float(row)
            sheet[f"B{row}"] = 0 if row == 6 else f"=A{row}*2"

    result = _audit(build)
    assert not [f for f in _typed(result) if f.ref == "Sheet!B6"]


def test_a_typed_zero_with_left_formulas_is_untouched_by_round_three() -> None:
    """The narrowing applies only to what the waiver added: an island
    that passes the left-formula test on its own keeps reporting,
    zero or not — the round can never take away a pre-existing
    finding."""

    def build(sheet) -> None:
        for row in range(2, 11):
            sheet[f"A{row}"] = f"Item {row}"
            sheet[f"B{row}"] = f"=D{row}+1"
            sheet[f"D{row}"] = float(row)
            sheet[f"F{row}"] = 0 if row == 6 else f"=B{row}*2"

    result = _audit(build)
    assert [f for f in _typed(result) if f.ref == "Sheet!F6"]


def test_an_interior_island_with_left_formulas_still_reports() -> None:
    """The pre-round behaviour, unchanged: the waiver widens, never
    narrows."""

    def build(sheet) -> None:
        for row in range(2, 11):
            sheet[f"A{row}"] = f"=C{row}+1"
            sheet[f"C{row}"] = float(row)
            sheet[f"E{row}"] = 7.5 if row == 6 else f"=A{row}*2"

    result = _audit(build)
    assert [f for f in _typed(result) if f.ref == "Sheet!E6"]
