"""Severity is a word about the amount, judged against a line.

« 8.513bn and 12.5m both read Material. A number 680 times bigger gets
the same label. » Material used to mean « the rule said error ». Now a
money finding earns it against a threshold — the firm's own, or half a
percent of the model's largest total — and its basis sentence names
the line it was judged against.
"""

from decimal import Decimal

from polar.tieout.audit import (
    MATERIALITY_SHARE,
    Audit,
    Finding,
    _elevated,
    materiality_of,
)
from polar.tieout.workbook import Cell, Workbook


def _book(largest: float) -> Workbook:
    book = Workbook()
    book.cells["S!C4"] = Cell(
        sheet="S",
        ref="S!C4",
        row=4,
        column=3,
        value=Decimal(str(largest)),
        formula=None,
        row_label="Total assets",
        column_label="",
    )
    book.sheets = ["S"]
    return book


def _ranked(
    largest: float, figure: str, *, rule: str = "skipped-cell", **kw
) -> Finding:
    result = Audit(examined=1)
    result.findings.append(
        Finding(
            rule=rule,
            severity="error",
            ref="S!C9",
            sheet="S",
            name="Total debt service",
            detail="The sum starts below C7.",
            figure=figure,
        )
    )
    _elevated(_book(largest), result, **kw)
    return result.findings[0]


class TestTheModelsOwnLine:
    def test_half_a_percent_of_the_largest_total(self) -> None:
        assert materiality_of(_book(1e9)) == 1e9 * MATERIALITY_SHARE

    def test_money_under_the_line_is_significant_not_material(self) -> None:
        one = _ranked(1e9, "12,500")
        assert one.severity == "error"
        assert one.tier == 2
        assert "sits under the model's own materiality line of 5m" in one.basis

    def test_money_over_the_line_is_material_and_says_so(self) -> None:
        one = _ranked(1e9, "12.5m")
        assert one.tier == 1
        assert "at or above the model's own materiality line of 5m" in one.basis


class TestTheFirmsOwnLine:
    def test_the_firms_number_replaces_the_models(self) -> None:
        one = _ranked(1e9, "12.5m", materiality=50_000_000)
        assert one.tier == 2
        assert "the firm's materiality of 50m" in one.basis

    def test_a_defect_with_no_money_stays_material(self) -> None:
        #: A reference out of step carries no amount; the line has
        #: nothing to judge and the defect stays tier 1.
        one = _ranked(1e9, "", rule="inconsistent-row", materiality=1.0)
        assert one.tier == 1
