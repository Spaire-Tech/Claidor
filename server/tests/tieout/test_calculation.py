"""The manual-calculation refusal — `swens.md` § 5, made true.

The commitment: « if a workbook was saved with calculation set to
manual, Swens refuses to reconcile against numbers Excel does not
believe, and says so, rather than quietly producing a comparison that
means nothing. »

These pin all four halves of it: that the setting is read from real
files, that reconciliation refuses, that the refusal says what to do,
and — the half that is easy to forget — that the checks which read
formulas rather than values are **not** refused, because a false
refusal costs trust in the other direction.
"""

from decimal import Decimal
from pathlib import Path

import pytest
from openpyxl import Workbook as OpenpyxlWorkbook

from polar.tieout.analytics import run_analytics
from polar.tieout.calculation import Calculation, read_calculation, refusal
from polar.tieout.check import tie_out_both
from polar.tieout.figures import Figure
from polar.tieout.structure import read_structure
from polar.tieout.workbook import Cell, Workbook, read_workbook


def _cell(
    sheet: str,
    ref: str,
    row: int,
    column: int,
    *,
    value: Decimal | None = Decimal(1),
    formula: str | None = None,
    row_label: str = "",
    column_label: str = "",
) -> Cell:
    return Cell(
        sheet=sheet,
        ref=f"{sheet}!{ref}",
        row=row,
        column=column,
        value=value,
        formula=formula,
        row_label=row_label,
        column_label=column_label,
    )


def _failing_check_row() -> list[Cell]:
    """A model's own « BS Check » row, holding a zero convention and a
    50.92 that breaks it — the shape measured on a real close model."""
    axis = [
        _cell("S", f"H{i}1", 1, i + 3, column_label=f"FY{2020 + i}") for i in range(6)
    ]
    values = [0, 0, 0, 0, 0, 50.92]
    return axis + [
        _cell("S", f"C{i}5", 5, i + 3, value=Decimal(str(v)), row_label="BS Check")
        for i, v in enumerate(values)
    ]


def _book(cells: list[Cell], calculation: Calculation | None = None) -> Workbook:
    return Workbook(
        cells={cell.ref: cell for cell in cells},
        sheets=sorted({cell.sheet for cell in cells}),
        calculation=calculation or Calculation(),
    )


MANUAL = Calculation(mode="manual")


class TestReadingTheSetting:
    def test_a_workbook_that_says_nothing_is_automatic(self) -> None:
        #: ECMA-376's own default, and the only safe reading: silence is
        #: not a file claiming its numbers are stale.
        assert read_calculation(object()) == Calculation()
        assert read_calculation(object()).trustworthy

    def test_manual_is_not_trustworthy(self) -> None:
        assert not Calculation(mode="manual").trustworthy

    def test_auto_no_table_is_trustworthy(self) -> None:
        #: `autoNoTable` skips data tables only, which no value this
        #: product reconciles depends on.
        assert Calculation(mode="autoNoTable").trustworthy

    def test_an_incomplete_calculation_is_not_trustworthy(self) -> None:
        #: Excel stating it itself, rather than us inferring it.
        assert not Calculation(completed=False).trustworthy

    def test_not_recalculating_before_save_is_not_a_trigger_on_its_own(
        self,
    ) -> None:
        #: The false refusal this guards against is not hypothetical:
        #: one of the 27 gate-corpus models (h7_new_debt_indexation_fp)
        #: carries calcOnSave="0" under automatic calculation, where
        #: Excel is current regardless.
        assert Calculation(on_save=False).trustworthy
        assert refusal(Calculation(on_save=False)) is None

    def test_a_real_manual_workbook_is_read_as_manual(self, tmp_path: Path) -> None:
        path = tmp_path / "manual.xlsx"
        book = OpenpyxlWorkbook()
        book.calculation.calcMode = "manual"
        sheet = book.active
        assert sheet is not None
        sheet["A1"] = "Revenue"
        sheet["B1"] = 10
        sheet["B2"] = "=B1*2"
        book.save(path)

        assert read_workbook(str(path)).calculation.mode == "manual"

    def test_a_real_automatic_workbook_is_read_as_automatic(
        self, tmp_path: Path
    ) -> None:
        path = tmp_path / "auto.xlsx"
        book = OpenpyxlWorkbook()
        sheet = book.active
        assert sheet is not None
        sheet["A1"] = "Revenue"
        sheet["B1"] = 10
        book.save(path)

        assert read_workbook(str(path)).calculation.trustworthy


class TestTheRefusalSentence:
    def test_an_automatic_workbook_has_nothing_to_refuse(self) -> None:
        assert refusal(Calculation()) is None

    def test_the_manual_sentence_names_the_setting_and_the_remedy(self) -> None:
        said = refusal(MANUAL)
        assert said is not None
        assert "manual calculation" in said
        #: An abstention is not a shrug: it names what would resolve it,
        #: and here the reader can resolve it in four seconds.
        assert "F9" in said

    def test_the_manual_sentence_says_the_checks_that_still_ran(self) -> None:
        said = refusal(MANUAL)
        assert said is not None
        assert "read formulas are unaffected" in said

    def test_not_saving_calculated_is_said_when_it_aggravates(self) -> None:
        said = refusal(Calculation(mode="manual", on_save=False))
        assert said is not None
        assert "before saving" in said

    def test_an_incomplete_calculation_says_so_in_its_own_words(self) -> None:
        said = refusal(Calculation(completed=False))
        assert said is not None
        assert "did not complete" in said
        assert "manual calculation" not in said


class TestAnalyticsRefuse:
    def test_a_manual_workbook_reports_no_reconciliation(self) -> None:
        cells = _failing_check_row()
        book = _book(cells, MANUAL)

        result = run_analytics(book, read_structure(book))

        assert result.findings == []

    def test_the_same_workbook_on_automatic_does_find_it(self) -> None:
        #: The control. Without this the test above passes on a bug that
        #: silences the check for some other reason entirely.
        cells = _failing_check_row()
        book = _book(cells)

        result = run_analytics(book, read_structure(book))

        assert [f.rule for f in result.findings] == ["model-own-check"]
        assert result.findings[0].value == 50.92

    def test_every_reconciling_rule_abstains_by_name(self) -> None:
        cells = _failing_check_row()
        book = _book(cells, MANUAL)

        result = run_analytics(book, read_structure(book))

        assert {one.rule for one in result.abstentions} == {
            "model-own-check",
            "balance-sheet",
            "cash-continuity",
            "debt-terminal",
            "interest-consistency",
        }

    def test_each_abstention_carries_the_reason(self) -> None:
        cells = _failing_check_row()
        book = _book(cells, MANUAL)

        result = run_analytics(book, read_structure(book))

        assert all("manual calculation" in one.why for one in result.abstentions)

    def test_the_reason_reads_as_a_sentence(self) -> None:
        #: `str.capitalize` lowercases the rest of the string and printed
        #: « excel » on the real file. Sentence case, and Excel keeps its
        #: capital.
        cells = _failing_check_row()
        book = _book(cells, MANUAL)

        result = run_analytics(book, read_structure(book))

        assert result.abstentions[0].why.startswith("This workbook")
        assert "Excel does not maintain" in result.abstentions[0].why

    def test_the_time_axis_still_runs(self) -> None:
        #: It reads the structure's periods, not the cache. A period out
        #: of order is out of order whatever the stored values say, so
        #: refusing it would be a false refusal.
        cells = _failing_check_row()
        book = _book(cells, MANUAL)

        result = run_analytics(book, read_structure(book))

        assert "time-axis" not in {one.rule for one in result.abstentions}


class TestTheAuditIsNotRefused:
    def test_a_typed_over_formula_is_still_found_on_a_manual_workbook(
        self, tmp_path: Path
    ) -> None:
        #: The other half of the commitment. A formula does not go stale,
        #: so nothing about manual calculation makes a structural finding
        #: less true — and a tool that refuses what it can still answer
        #: is as untrustworthy as one that answers what it cannot.
        from polar.tieout.audit import audit

        path = tmp_path / "manual_typed_over.xlsx"
        book = OpenpyxlWorkbook()
        book.calculation.calcMode = "manual"
        sheet = book.active
        assert sheet is not None
        sheet["A1"] = "Revenue"
        for row, column in enumerate("BCDEFGH"):
            sheet[f"{column}1"] = f"FY{2020 + row}"
        for row in range(2, 9):
            sheet[f"A{row}"] = "Revenue"
        for column in "BCDEFG":
            sheet[f"{column}2"] = "=10*2"
        #: One cell in the run typed over with a number.
        sheet["H2"] = 20
        book.save(path)

        model = read_workbook(str(path))
        assert model.calculation.mode == "manual"

        result = audit(model)

        assert result is not None


class TestTheDeckTieOutRefuses:
    @pytest.fixture
    def figure(self) -> Figure:
        return Figure(
            printed="48.9",
            value=Decimal("48.9"),
            decimals=1,
            kind="plain",
            slide=1,
            label="Adjusted EBITDA",
            location="slide 1",
            context="Adjusted EBITDA of 48.9",
        )

    def test_every_figure_comes_back_unlinked(self, figure: Figure) -> None:
        book = _book(_failing_check_row(), MANUAL)

        result = tie_out_both([figure], book, [])

        assert result.drifts == []
        assert result.agreed == []
        assert len(result.unlinked) == 1

    def test_the_reason_travels_with_the_figure(self, figure: Figure) -> None:
        book = _book(_failing_check_row(), MANUAL)

        result = tie_out_both([figure], book, [])

        assert "manual calculation" in result.unlinked[0].reason

    def test_nothing_counts_as_checked(self, figure: Figure) -> None:
        #: `checked` is what tells a reader whether silence means « fine »
        #: or « never looked ». On a refused file it must mean the second.
        book = _book(_failing_check_row(), MANUAL)

        assert tie_out_both([figure], book, []).checked == 0
