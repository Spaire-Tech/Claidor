"""The model audit, against a fixture whose defects are known.

Nine planted defects and eight structures that look like defects and are
not. The second half is the point: every one of those eight was a false
positive on a real Damodaran valuation model before the rule that exempts
it existed, and each would come back the moment a rule is loosened.
"""

import sys
from pathlib import Path

import pytest

from polar.tieout.audit import audit
from polar.tieout.workbook import read_workbook

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
sys.path.insert(0, str(CASCADE))

from build_audit_fixture import DEFECTS  # noqa: E402


@pytest.fixture(scope="module")
def found():
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    by_ref: dict[str, set[str]] = {}
    for finding in result.findings:
        by_ref.setdefault(finding.ref, set()).add(finding.rule)
    return by_ref


@pytest.mark.parametrize(("ref", "rule"), sorted(DEFECTS.items()))
def test_every_planted_defect_is_found(found, ref: str, rule: str) -> None:
    assert rule in found.get(ref, set()), f"{ref} should have raised {rule}"


def test_nothing_else_is_reported(found) -> None:
    """The half that matters. A rule loosened to catch one more defect
    brings these back, and there are far more of them in a real model than
    there are defects."""
    assert set(found) == set(DEFECTS)


def test_a_typed_history_is_not_a_hardcode() -> None:
    """Three years of actuals, typed, then a forecast. Every model on
    earth is built this way and a check that flags it flags every model."""
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    typed = {f.ref for f in result.findings if f.rule == "typed-over-formula"}
    assert typed == {"Model!F11"}
    assert not typed & {"Model!B6", "Model!C6", "Model!D6", "Model!C8", "Model!D8"}


def test_circularity_is_reported_only_when_the_model_has_not_declared_it() -> None:
    """Every Damodaran valuation model tested carries deliberate circular
    references and switches on iterative calculation to say so. The
    fixture does not, so its one loop is a defect."""
    book = read_workbook(str(CASCADE / "audit_fixture.xlsx"))
    assert book.iterative is False
    assert any(f.rule == "circular" for f in audit(book).findings)

    book.iterative = True
    assert not any(f.rule == "circular" for f in audit(book).findings)


def test_a_well_built_model_is_quiet() -> None:
    """The Cascade model: 313 cells, 228 formulas, no mechanical errors.
    An audit that cannot be quiet on a good model is not an audit."""
    result = audit(read_workbook(str(CASCADE / "cascade_model.xlsx")))
    assert result.errors == []
    assert result.examined > 300


def test_errors_and_smells_are_never_added_together() -> None:
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    assert {f.severity for f in result.errors} == {"error"}
    assert {f.severity for f in result.smells} == {"smell"}
    assert len(result.findings) == len(result.errors) + len(result.smells)


def test_every_finding_cites_the_standard_it_comes_from() -> None:
    """« Says who » has to have an answer that is not « the tool »."""
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    assert all(finding.source for finding in result.findings)


def _tmp_book(build) -> "Audit":  # noqa: F821
    """An audit over a workbook built in memory and read off disk."""
    import tempfile
    from pathlib import Path

    from openpyxl import Workbook as Book

    book = Book()
    build(book.active)
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        return audit(read_workbook(str(path)))


def test_a_pasted_block_is_still_typed_over_formula() -> None:
    """Ofwat's queries document confirms four cells hard-keyed into the
    FM02 financial model — a vertical block, every row otherwise a
    formula series. The old veto on any stacked constant scored 0 of 4
    on the one ground truth the audit had."""

    def build(sheet) -> None:
        for row in range(2, 8):
            for column in range(2, 9):
                at = sheet.cell(row=row, column=column)
                if column == 5 and row in (2, 3, 4, 5):
                    at.value = 0.89
                else:
                    at.value = f"=B{row}+1"

    result = _tmp_book(build)
    typed = {f.ref for f in result.findings if f.rule == "typed-over-formula"}
    assert {"Sheet!E2", "Sheet!E3", "Sheet!E4", "Sheet!E5"} <= typed


def test_a_parameter_column_is_not_typed_over_formula() -> None:
    """`CollarsAnalysisv3-1.XLS` carries typed parameter columns dozens
    of cells tall. A column is data, not damage."""

    def build(sheet) -> None:
        for row in range(2, 14):
            for column in range(2, 9):
                at = sheet.cell(row=row, column=column)
                if column == 5:
                    at.value = 0.89
                else:
                    at.value = f"=B{row}+1"

    result = _tmp_book(build)
    assert not any(f.rule == "typed-over-formula" for f in result.findings)


def test_a_filled_formula_is_one_finding_not_thousands() -> None:
    """One 625-character formula filled across a grid produced 7,752 of
    a real base-cost model's 8,017 findings. A fill is one decision."""
    long = "=" + "+".join(["INDIRECT(\"A1\")"] * 20)

    def build(sheet) -> None:
        sheet.cell(row=2, column=1).value = "Interest cover"
        for column in range(2, 12):
            sheet.cell(row=2, column=column).value = long

    result = _tmp_book(build)
    lengthy = [f for f in result.findings if f.rule == "long-formula"]
    assert len(lengthy) == 1
    assert "filled across 10 cells" in lengthy[0].detail
    noisy = [f for f in result.findings if f.rule == "volatile"]
    assert len(noisy) == 1


def test_a_block_pasted_over_several_columns_is_caught_down_the_columns() -> None:
    """Yorkshire's FM02 (per Ofwat's queries document): five year-columns
    typed across four adjacent rows, so no row keeps a formula majority
    and the row pass is blind. The columns still show the paste."""

    def build(sheet) -> None:
        for row in range(2, 10):
            for column in range(2, 11):
                at = sheet.cell(row=row, column=column)
                if column >= 6 and row in (3, 4, 5, 6):
                    at.value = 0.52
                else:
                    at.value = f"=B{row}+{column}"

    result = _tmp_book(build)
    typed = {f.ref for f in result.findings if f.rule == "typed-over-formula"}
    assert "Sheet!F3" in typed
    assert "Sheet!J6" in typed
    assert len([ref for ref in typed if ref.startswith("Sheet!")]) >= 20


def test_an_input_column_with_a_total_under_it_is_data_not_damage() -> None:
    """A column of typed inputs with one SUM below repeats nothing —
    the island rule requires the column's own formula to repeat."""

    def build(sheet) -> None:
        for row in range(2, 7):
            sheet.cell(row=row, column=2).value = f"=C{row}*2"
            sheet.cell(row=row, column=3).value = row * 1.1
        sheet.cell(row=7, column=3).value = "=SUM(C2:C6)"

    result = _tmp_book(build)
    assert not any(f.rule == "typed-over-formula" for f in result.findings)
