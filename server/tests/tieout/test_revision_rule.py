"""The previous-version rule (`docs/pierce/overwritten-since.md`): a
typed value where the version before held a formula, matched by
meaning rather than address."""

import tempfile
from pathlib import Path

from openpyxl import Workbook as Book

from polar.tieout.audit import audit
from polar.tieout.revision import FIRST_VERSION, NO_MATCH, RULE
from polar.tieout.workbook import read_workbook


def _read(build):
    book = Book()
    build(book)
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        return read_workbook(str(path))


def _draft(book: Book) -> None:
    inputs = book.active
    inputs.title = "Inputs"
    inputs["A1"], inputs["B1"] = "Item", "Value"
    inputs["A2"], inputs["B2"] = "QAA input", 2
    inputs["A3"], inputs["B3"] = "Opening balance", 100
    calc = book.create_sheet("Calc")
    calc["A1"] = "Line"
    for column in "BCDE":
        calc[f"{column}1"] = f"FY{ord(column) - 64 + 2024}"
    calc["A2"], calc["B2"] = "Switch - QAA reward", "=Inputs!B2"
    calc["A3"] = "Revenue"
    calc["B3"] = 10
    for prev, column in zip("BCD", "CDE", strict=True):
        calc[f"{column}3"] = f"={prev}3*1.05"
    calc["A4"], calc["B4"] = "Opening balance", "=Inputs!B3"
    calc["A5"], calc["B5"] = "Growth", 0.05


def _final(book: Book) -> None:
    """The draft with a note row inserted above everything, the QAA
    link typed over while its input moved, and the balance link typed
    over with the same number the input still holds."""
    inputs = book.active
    inputs.title = "Inputs"
    inputs["A1"] = "Note: final determination"
    inputs["A2"], inputs["B2"] = "Item", "Value"
    inputs["A3"], inputs["B3"] = "QAA input", 1
    inputs["A4"], inputs["B4"] = "Opening balance", 100
    calc = book.create_sheet("Calc")
    calc["A1"] = "Note: final determination"
    calc["A2"] = "Line"
    for column in "BCDE":
        calc[f"{column}2"] = f"FY{ord(column) - 64 + 2024}"
    calc["A3"], calc["B3"] = "Switch - QAA reward", 2
    calc["A4"] = "Revenue"
    calc["B4"] = 10
    for prev, column in zip("BCD", "CDE", strict=True):
        calc[f"{column}4"] = f"={prev}4*1.05"
    calc["A5"], calc["B5"] = "Opening balance", 100
    calc["A6"], calc["B6"] = "Growth", 0.05


def test_a_link_typed_over_is_found_across_an_inserted_row() -> None:
    draft, final = _read(_draft), _read(_final)
    result = audit(final, previous=draft)
    found = {f.ref: f for f in result.findings if f.rule == RULE}
    assert set(found) == {"Calc!B3", "Calc!B5"}
    switch = found["Calc!B3"]
    assert switch.severity == "error"
    assert "typed 2" in switch.detail
    assert "now holds 1" in switch.detail
    assert switch.against == "=Inputs!B2"
    balance = found["Calc!B5"]
    assert "still holds 100" in balance.detail
    assert result.tallies[RULE]["total"] >= 2
    assert RULE not in {a.rule for a in result.abstentions}


def test_the_series_and_the_constants_are_not_findings() -> None:
    draft, final = _read(_draft), _read(_final)
    result = audit(final, previous=draft)
    refs = {f.ref for f in result.findings if f.rule == RULE}
    assert "Calc!B4" not in refs
    assert "Calc!B6" not in refs
    assert "Inputs!B3" not in refs


def test_without_a_previous_version_the_rule_abstains_by_name() -> None:
    final = _read(_final)
    result = audit(final)
    assert not [f for f in result.findings if f.rule == RULE]
    whys = {a.rule: a.why for a in result.abstentions}
    assert whys[RULE] == FIRST_VERSION
    assert RULE not in result.tallies


def test_two_unrelated_models_abstain_rather_than_guess() -> None:
    def other(book: Book) -> None:
        sheet = book.active
        sheet.title = "Elsewhere"
        sheet["A1"], sheet["B1"] = "Something", 1

    final, previous = _read(_final), _read(other)
    result = audit(final, previous=previous)
    whys = {a.rule: a.why for a in result.abstentions}
    assert whys[RULE] == NO_MATCH


def test_a_formula_that_became_another_formula_is_not_this_rule() -> None:
    def changed(book: Book) -> None:
        _final(book)
        book["Calc"]["B3"] = "=Inputs!B3*1"

    draft, final = _read(_draft), _read(changed)
    result = audit(final, previous=draft)
    refs = {f.ref for f in result.findings if f.rule == RULE}
    assert "Calc!B3" not in refs
    assert refs == {"Calc!B5"}
