"""A4 — the audit's own denominator.

Registered round: docs/pierce/a4-coverage.md. « No findings » and
« nothing to look at » are different sentences, and these tests pin
the difference: a tally is the real population the rule draws from,
an abstention names a fact about the file, and a rule with a
non-empty population never abstains.
"""

import tempfile
from pathlib import Path

from polar.tieout.audit import COVERAGE_OF, audit
from polar.tieout.workbook import read_workbook


def _audit(build):
    from openpyxl import Workbook as Book

    book = Book()
    build(book.active)
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        loaded = read_workbook(str(path))
        return loaded, audit(loaded)


def _model(sheet) -> None:
    for row in range(2, 8):
        sheet[f"A{row}"] = f"Item {row}"
        sheet[f"B{row}"] = float(row)
        sheet[f"C{row}"] = f"=B{row}*2"
    sheet["C9"] = "=SUM(C2:C7)"


def test_a_formula_tally_equals_the_files_formula_cells() -> None:
    """The arithmetic-consistency check the registration demands: the
    tally is counted from the file, not estimated."""
    book, result = _audit(_model)
    formulas = sum(1 for c in book.cells.values() if c.formula)
    assert result.tallies["long-formula"]["total"] == formulas
    assert formulas > 0


def test_a_rule_that_looked_and_found_nothing_does_not_abstain() -> None:
    """Silence with a non-empty population means clean, and must never
    be reported as « did not run »."""
    _, result = _audit(_model)
    abstained = {a.rule for a in result.abstentions}
    assert "long-formula" not in abstained
    assert result.tallies["long-formula"]["raised"] == 0


def test_a_values_pasted_copy_abstains_by_name() -> None:
    """Every formula-denominated rule says why it had nothing to do."""

    def build(sheet) -> None:
        for row in range(2, 8):
            sheet[f"A{row}"] = f"Item {row}"
            sheet[f"B{row}"] = float(row)

    _, result = _audit(build)
    why = {a.rule: a.why for a in result.abstentions}
    assert "long-formula" in why
    assert "values-pasted" in why["long-formula"]
    assert "long-formula" not in result.tallies


def test_a_single_sheet_book_tallies_rather_than_abstains() -> None:
    """The correction the tests forced: one sheet is one examination,
    so `hidden-sheet` looked and says so. The registered « this
    workbook has one sheet » reason was unreachable and was removed
    rather than have the denominator bent to reach it."""
    _, result = _audit(_model)
    assert result.tallies["hidden-sheet"]["total"] == 1
    assert "hidden-sheet" not in {a.rule for a in result.abstentions}


def test_every_rule_either_tallies_or_abstains_exactly_once() -> None:
    """No rule may be silently absent from both, and none may be in
    both — the report must be able to say something about each."""
    _, result = _audit(_model)
    abstained = {a.rule for a in result.abstentions}
    tallied = set(result.tallies)
    assert tallied | abstained == set(COVERAGE_OF)
    assert not (tallied & abstained)


def test_broken_name_is_deliberately_absent() -> None:
    """Per the round's amendment: the reader exposes no count of
    declared names, so a tally there would be a numerator wearing a
    hat. Pinned so its absence stays a decision, not a slip."""
    _, result = _audit(_model)
    assert "broken-name" not in COVERAGE_OF
    assert "broken-name" not in result.tallies
    assert "broken-name" not in {a.rule for a in result.abstentions}


def test_the_raised_count_matches_the_findings_it_explains() -> None:
    """A tally's « raised » is the report as it leaves the engine."""

    def build(sheet) -> None:
        for row in range(2, 8):
            sheet[f"A{row}"] = f"Item {row}"
            sheet[f"B{row}"] = float(row)
            sheet[f"C{row}"] = f"=B{row}*2"
        sheet["C5"] = 99.0

    _, result = _audit(build)
    for rule, tally in result.tallies.items():
        actual = sum(1 for f in result.findings if f.rule == rule)
        assert tally["raised"] == actual, rule
