"""A row of 1, 2, 3 heads the periods, and a check that could not run
says what it looked for.

The founder's own model heads every statement with a year counter and
nothing else. The reader labelled no columns, no sheet had an axis, and
the summary said « No balance sheet was located » about a sheet called
Balance Sheet, under a line saying the findings sit in Balance Sheet.
"""

from decimal import Decimal

from polar.tieout.analytics import run_analytics
from polar.tieout.checks import checks_of
from polar.tieout.structure import period_axes, read_structure
from polar.tieout.workbook import Cell, Workbook, _counter_header


class _Grid:
    def __init__(self, values: dict[tuple[int, int], object]) -> None:
        self.values = values
        self.written: dict[tuple[int, int], object] = {}
        self.last_row = max((r for r, _ in values), default=0)


class TestTheCounterRow:
    def test_one_two_three_reads_as_years(self) -> None:
        grid = _Grid({(4, c): Decimal(c - 3) for c in range(4, 9)})
        found = _counter_header(grid, 8, 2)
        assert found is not None
        row, headers = found
        assert row == 4
        assert headers[4] == "Year 1"
        assert headers[8] == "Year 5"

    def test_calendar_years_read_as_themselves(self) -> None:
        grid = _Grid({(2, c): Decimal(2020 + c) for c in range(3, 8)})
        found = _counter_header(grid, 7, 2)
        assert found is not None
        assert found[1][3] == "2023"

    def test_a_row_with_a_gap_is_not_a_counter(self) -> None:
        grid = _Grid({(2, 3): Decimal(1), (2, 4): Decimal(2), (2, 5): Decimal(4)})
        assert _counter_header(grid, 5, 2) is None

    def test_two_columns_are_not_an_axis(self) -> None:
        grid = _Grid({(2, 3): Decimal(1), (2, 4): Decimal(2)})
        assert _counter_header(grid, 4, 2) is None

    def test_the_axis_follows(self) -> None:
        book = Workbook()
        for i in range(5):
            ref = f"BS!{chr(68 + i)}10"
            book.cells[ref] = Cell(
                sheet="BS",
                ref=ref,
                row=10,
                column=4 + i,
                value=Decimal(100),
                formula=None,
                row_label="Total assets",
                column_label=f"Year {i + 1}",
            )
        book.sheets = ["BS"]
        assert "BS" in period_axes(book)


def _statement(sheet: str, rows: dict[int, tuple[str, list[float]]]) -> list[Cell]:
    cells: list[Cell] = []
    for row, (label, values) in rows.items():
        for i, value in enumerate(values):
            column = 4 + i
            cells.append(
                Cell(
                    sheet=sheet,
                    ref=f"{sheet}!{chr(64 + column)}{row}",
                    row=row,
                    column=column,
                    value=Decimal(str(value)),
                    formula=None,
                    row_label=label,
                    column_label=f"Year {i + 1}",
                )
            )
    return cells


def _book(cells: list[Cell]) -> Workbook:
    book = Workbook()
    book.cells = {c.ref: c for c in cells}
    book.sheets = sorted({c.sheet for c in cells})
    return book


class TestTheAmericanBalanceSheet:
    def test_total_assets_against_liabilities_and_net_worth(self) -> None:
        #: The founder's spelling, « Liabilites », included.
        book = _book(
            _statement(
                "Balance Sheet",
                {
                    28: ("Total Assets", [10, 20, 30, 40]),
                    47: ("Total Liabilites and Net Worth", [10, 20, 30, 40]),
                },
            )
        )
        result = run_analytics(book, read_structure(book))
        assert result.tallies["balance-sheet"] == {"total": 4, "clean": 4}
        assert [a for a in result.abstentions if a.rule == "balance-sheet"] == []


class TestWhatACheckSaysWhenItCannotRun:
    def test_a_named_sheet_without_periods_is_named_not_denied(self) -> None:
        book = Workbook()
        book.cells["Balance Sheet!D10"] = Cell(
            sheet="Balance Sheet",
            ref="Balance Sheet!D10",
            row=10,
            column=4,
            value=Decimal(1),
            formula=None,
            row_label="Total assets",
            column_label="",
        )
        book.sheets = ["Balance Sheet"]
        result = run_analytics(book, read_structure(book))
        why = next(a.why for a in result.abstentions if a.rule == "balance-sheet")
        assert "« Balance Sheet »" in why
        assert "could not read its period columns" in why
        assert "was located" not in why

    def test_no_sheet_at_all_says_what_was_looked_for(self) -> None:
        book = _book(_statement("Ops", {5: ("Revenue", [1, 2, 3])}))
        result = run_analytics(book, read_structure(book))
        why = next(a.why for a in result.abstentions if a.rule == "balance-sheet")
        assert why.startswith("I could not find a balance sheet")


class TestTheChecksList:
    def test_every_rule_is_in_exactly_one_state(self) -> None:
        summary = {
            "rules_off": ["volatile"],
            "abstentions": [{"rule": "balance-sheet", "why": "I found « BS » but …"}],
            "tallies": {"cash-continuity": {"total": 3, "clean": 3}},
        }
        checks = checks_of(summary, {"skipped-cell": 2})
        by = {c.key: c for c in checks}
        assert by["volatile"].state == "off"
        assert by["balance-sheet"].state == "abstained"
        assert by["balance-sheet"].why.startswith("I found")
        assert by["skipped-cell"].state == "found"
        assert by["skipped-cell"].findings == 2
        assert by["cash-continuity"].state == "clean"
        assert by["cash-continuity"].total == 3
        assert {c.state for c in checks} <= {"off", "abstained", "found", "clean"}

    def test_an_empty_summary_claims_nothing_it_cannot(self) -> None:
        #: Old runs recorded no abstentions and no tallies. They still
        #: get a list — but a clean row carries no count it never made.
        checks = checks_of({}, {})
        assert all(c.state == "clean" and c.total == 0 for c in checks)
