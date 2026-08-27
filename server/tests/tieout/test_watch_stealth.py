"""Round D's selector detection, pinned.

The forcing intervention rests entirely on reading the model's own
`CHOOSE` correctly: pick the wrong index and the harness would
silently measure a different licensee's branch than the one it
names. These tests hold the reader to the shapes a real model
uses, and — as importantly — to staying silent where there is no
selector at all.
"""

from decimal import Decimal

from polar.tieout.workbook import Cell
from scripts.watch_stealth import _selector_index


def cell(ref: str, formula: str | None = None) -> Cell:
    sheet, coordinate = ref.split("!")
    return Cell(
        sheet=sheet,
        ref=ref,
        row=int("".join(c for c in coordinate if c.isdigit())),
        column=1,
        value=Decimal("1"),
        formula=formula,
        row_label="",
        column_label="",
    )


def book(cells: list[Cell]) -> dict[str, Cell]:
    return {one.ref: one for one in cells}


ED2_SHAPE = "=CHOOSE($B$3,ENWL!AM102,NPgN!AM102,SWEST!AM102,LPN!AM102)"


class TestSelectorIndex:
    def test_the_sheets_position_in_the_choose_is_its_index(self) -> None:
        cells = book([cell("SelectedInputs!AM102", ED2_SHAPE)])
        assert _selector_index(cells, "ENWL") == ("SelectedInputs!B3", 1)
        assert _selector_index(cells, "SWEST") == ("SelectedInputs!B3", 3)
        assert _selector_index(cells, "LPN") == ("SelectedInputs!B3", 4)

    def test_a_sheet_the_selector_does_not_name_has_no_index(self) -> None:
        cells = book([cell("SelectedInputs!AM102", ED2_SHAPE)])
        assert _selector_index(cells, "Depn") is None

    def test_a_model_with_no_choose_has_no_selector(self) -> None:
        """The CAA host: no branches, so nothing to force, and the
        harness must not invent one."""
        cells = book(
            [
                cell("Outturn!B263", "=B262*1.01"),
                cell("Outturn!B264", "=SUM(B1:B263)"),
                cell("Outturn!B265"),
            ]
        )
        assert _selector_index(cells, "Outturn") is None

    def test_a_quoted_sheet_name_is_read_whole(self) -> None:
        cells = book(
            [
                cell(
                    "SelectedInputs!C9",
                    "=CHOOSE($D$4,'Annual Inflation'!C9,'Monthly Inflation'!C9)",
                )
            ]
        )
        assert _selector_index(cells, "Monthly Inflation") == (
            "SelectedInputs!D4",
            2,
        )

    def test_the_index_cell_keeps_the_selecting_sheets_name(self) -> None:
        """The index lives on whichever sheet writes the CHOOSE — the
        harness writes the literal there, not on the edited sheet."""
        cells = book([cell("Router!Z9", "=CHOOSE(A1,One!B2,Two!B2)")])
        assert _selector_index(cells, "Two") == ("Router!A1", 2)
