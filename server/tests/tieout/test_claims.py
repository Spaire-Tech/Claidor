"""The prover behind the investigator loop (`docs/pierce/investigator-loop.md`)."""

import tempfile
from pathlib import Path

from openpyxl import Workbook as Book

from polar.tieout.claims import Claim, check
from polar.tieout.workbook import read_workbook


def _book():
    book = Book()
    s = book.active
    s.title = "Ops"
    s["A1"], s["B1"], s["C1"], s["D1"] = "Line", "FY1", "FY2", "FY3"
    s["A2"], s["B2"], s["C2"], s["D2"] = "Volume", 10, 11, 12
    s["A3"], s["B3"], s["C3"], s["D3"] = "Tariff", 2, 2, 2
    s["A4"], s["B4"], s["C4"], s["D4"] = "Revenue", "=B2*B3", "=C2*C3", "=D2*D2"
    s["A5"], s["B5"] = "Total", "=SUM(B2:B3)"
    s["A6"], s["B6"] = "Reads empty", "=B9*2"
    s["A7"], s["B7"] = "Compare", "=B2-1=SUM(B2:B3)"
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        return read_workbook(str(path))


def test_a_range_that_leaves_a_number_out_is_confirmed() -> None:
    book = _book()
    verdict = check(book, Claim("Ops", "B5", "range-omits", omits=("B4",)))
    assert verdict.status == "confirmed", verdict
    verdict = check(book, Claim("Ops", "B5", "range-omits", omits=("B3",)))
    assert verdict.status == "refuted"


def test_a_wrong_reference_is_confirmed_as_a_fact_with_the_judgment_left_open() -> None:
    book = _book()
    verdict = check(
        book, Claim("Ops", "D4", "wrong-reference", reads="D2", should_read="D3")
    )
    assert verdict.status == "confirmed"
    assert "reviewer" in verdict.note
    verdict = check(book, Claim("Ops", "D4", "wrong-reference", reads="C2"))
    assert verdict.status == "refuted"


def test_an_empty_reference_is_confirmed_only_when_the_cell_is_empty() -> None:
    book = _book()
    assert (
        check(book, Claim("Ops", "B6", "empty-reference", reads="B9")).status
        == "confirmed"
    )
    assert (
        check(book, Claim("Ops", "B4", "empty-reference", reads="B2")).status
        == "refuted"
    )


def test_a_cell_built_unlike_its_neighbours_is_confirmed() -> None:
    book = _book()
    verdict = check(
        book, Claim("Ops", "D4", "differs-from-neighbours", neighbours=("B4", "C4"))
    )
    assert verdict.status == "confirmed", verdict
    verdict = check(
        book, Claim("Ops", "C4", "differs-from-neighbours", neighbours=("B4",))
    )
    assert verdict.status == "refuted"


def test_a_top_level_comparison_is_malformed() -> None:
    book = _book()
    assert check(book, Claim("Ops", "B7", "malformed")).status == "confirmed"
    assert check(book, Claim("Ops", "B5", "malformed")).status == "refuted"


def test_arithmetic_evaluates_the_alternative_and_compares() -> None:
    book = _book()
    verdict = check(
        book,
        Claim(
            "Ops",
            "B5",
            "arithmetic",
            alternative_formula="=SUM(B2:B4)",
            expected_value="32",
        ),
    )
    assert verdict.status == "confirmed", verdict
    verdict = check(
        book,
        Claim(
            "Ops",
            "B5",
            "arithmetic",
            alternative_formula="=SUM(B2:B4)",
            expected_value="99",
        ),
    )
    assert verdict.status == "refuted"
    verdict = check(
        book,
        Claim("Ops", "B5", "arithmetic", alternative_formula="=VLOOKUP(1,B2:B4,1)"),
    )
    assert verdict.status == "unverifiable"


def test_other_is_unverifiable_and_says_so() -> None:
    book = _book()
    verdict = check(book, Claim("Ops", "B2", "other", reason="looks odd"))
    assert verdict.status == "unverifiable"
    assert verdict.note


def test_claims_parse_from_the_investigators_json() -> None:
    claim = Claim.from_json(
        "Ops",
        {"cell": "b5", "kind": "range-omits", "omits": "B4, b3", "confidence": "high"},
    )
    assert claim.cell == "B5"
    assert claim.omits == ("B4", "B3")
    assert Claim.from_json("Ops", {"cell": "B5", "kind": "nonsense"}).kind == "other"
