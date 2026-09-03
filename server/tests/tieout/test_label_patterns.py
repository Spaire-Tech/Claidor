"""The semantic shape: a formula as the labels of the rows it reads.

Registered in `docs/pierce/label-patterns.md`: order and grouping are
dropped on purpose; the formula's own row is `self`; a range is
`range:` plus its first row's label; an unlabelled row is `?`; a
schedule word is never a row; a plain link is recorded but is not a
pattern.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from openpyxl import Workbook as Book

from polar.tieout.meaning.patterns import cell_pattern, is_link, row_patterns
from polar.tieout.workbook import read_workbook


def _model() -> str:
    book = Book()
    ops = book.active
    assert ops is not None
    ops.title = "Ops"
    ops["A5"], ops["C5"], ops["D5"] = "Volume", 100, 110
    ops["A6"], ops["C6"], ops["D6"] = "Tariff", 2.5, 2.6
    ops["A7"], ops["C7"], ops["D7"] = "Revenue", "=C5*C6", "=D6*D5"
    ops["A9"], ops["C9"], ops["D9"] = "Opening balance", 50, "=C10"
    ops["A10"], ops["C10"], ops["D10"] = "Closing balance", "=C9+C7", "=D9+D7"
    ops["A12"], ops["C12"], ops["D12"] = (
        "Interest",
        "=C9*Inputs!$B$3",
        "=D9*Inputs!$B$3",
    )
    ops["A13"], ops["C13"], ops["D13"] = "Total costs", "=SUM(C5:C6)", "=SUM(D5:D6)"
    ops["A14"], ops["C14"], ops["D14"] = "Growth", "=C7", "=D7/C7-1"
    pl = book.create_sheet("PL")
    pl["A3"], pl["C3"], pl["D3"] = "Revenue", "=Ops!C7", "=Ops!D7"
    pl["A4"], pl["C4"], pl["D4"] = "Tax", "=-C3*Inputs!$B$2", "=-D3*Inputs!$B$2"
    inputs = book.create_sheet("Inputs")
    inputs["A2"], inputs["B2"] = "Tax rate", 0.25
    inputs["A3"], inputs["B3"] = "Interest rate", 0.05
    path = Path(tempfile.mkdtemp()) / "patterns.xlsx"
    book.save(path)
    return str(path)


def test_the_shape_is_the_labels_of_the_rows_read_in_any_order() -> None:
    book = read_workbook(_model())
    assert cell_pattern(book, "Ops", 7, "=C5*C6") == ("f:", "o:*", "r:tariff | volume")
    assert cell_pattern(book, "Ops", 7, "=D6*D5") == ("f:", "o:*", "r:tariff | volume")


def test_a_rate_on_another_sheet_is_its_label_and_a_prefix_minus_is_an_operator() -> (
    None
):
    book = read_workbook(_model())
    assert cell_pattern(book, "PL", 4, "=-D3*Inputs!$B$2") == (
        "f:",
        "o:* -",
        "r:revenue | tax rate",
    )
    assert cell_pattern(book, "Ops", 12, "=D9*Inputs!$B$3") == (
        "f:",
        "o:*",
        "r:interest rate | opening balance",
    )


def test_a_range_is_its_first_row_and_a_function_is_kept() -> None:
    book = read_workbook(_model())
    assert cell_pattern(book, "Ops", 13, "=SUM(D5:D6)") == (
        "f:SUM",
        "o:",
        "r:range:volume",
    )


def test_the_own_row_is_self_on_any_sheet() -> None:
    book = read_workbook(_model())
    assert cell_pattern(book, "PL", 3, "=Ops!D7") == ("f:", "o:", "r:self")
    assert cell_pattern(book, "Ops", 14, "=D7/C7-1") == (
        "f:",
        "o:- /",
        "r:# | revenue | revenue",
    )


def test_a_plain_link_is_recorded_but_is_not_a_pattern() -> None:
    assert is_link(("f:", "o:", "r:self"))
    assert is_link(("f:", "o:", "r:revenue"))
    assert not is_link(("f:", "o:*", "r:tariff | volume"))
    assert not is_link(("f:SUM", "o:", "r:range:volume"))


def test_one_pattern_per_row_and_schedule_words_are_skipped() -> None:
    book = read_workbook(_model())
    rows = {(one.sheet, one.row): one for one in row_patterns(book)}
    assert rows[("Ops", 7)].pattern == ("f:", "o:*", "r:tariff | volume")
    assert rows[("Ops", 7)].cells == 2
    #: The growth row's two cells differ; the commoner one wins, and a
    #: tie falls to the first seen — recorded, not judged here.
    assert ("Ops", 14) in rows
    #: « Opening balance » and « Closing balance » are schedule words.
    assert ("Ops", 9) not in rows
    assert ("Ops", 10) not in rows
