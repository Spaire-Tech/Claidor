"""C1 — the raw version diff on workbooks built to test it.

The real-pair verification lives in the registered hand-check
(`docs/pierce/logs/prism.md`); these tests pin the semantics on
synthetic files where the right answer is known by construction.
"""

from pathlib import Path

import openpyxl
import pytest

from polar.tieout.watch import diff_paths
from scripts.watch_handcheck import read_cells, statuses, translate


def _write(path: Path, cells: dict[str, dict[str, object]]) -> str:
    book = openpyxl.Workbook()
    book.remove(book.active)
    for sheet_name, grid in cells.items():
        sheet = book.create_sheet(sheet_name)
        for ref, value in grid.items():
            sheet[ref] = value
    book.save(path)
    return str(path)


@pytest.fixture
def pair(tmp_path: Path) -> tuple[str, str]:
    old = _write(
        tmp_path / "old.xlsx",
        {
            "Model": {
                "A1": "Revenue",
                "B1": 100,
                "B2": "=B1*2",
                "B3": 7,
                "C1": "kept",
            },
            "Gone": {"A1": 1},
        },
    )
    new = _write(
        tmp_path / "new.xlsx",
        {
            "Model": {
                "A1": "Revenue",
                "B1": 120,  # a typed value changed
                "B2": "=B1*3",  # a formula rewritten
                # B3 removed
                "B4": "=B1-1",  # a formula added
                "C1": "kept",
            },
            "New": {"A1": 2},
        },
    )
    return old, new


def test_every_kind_lands_in_its_own_bucket(pair: tuple[str, str]) -> None:
    diff = diff_paths(*pair)
    assert diff.refs("added") == ["Model!B4", "New!A1"]
    assert diff.refs("removed") == ["Gone!A1", "Model!B3"]
    assert diff.refs("changed") == ["Model!B1", "Model!B2"]
    assert diff.sheets_added == ("New",)
    assert diff.sheets_removed == ("Gone",)
    assert diff.summary["unchanged"] == 2  # Model!A1 and Model!C1


def test_a_retyped_literal_moves_both_axes(pair: tuple[str, str]) -> None:
    diff = diff_paths(*pair)
    by_ref = {delta.ref: delta for delta in diff.deltas}
    b1 = by_ref["Model!B1"]
    assert b1.content_changed
    assert b1.value_changed
    assert b1.before_content == "n:100"
    assert b1.after_content == "n:120"


def test_a_rewritten_formula_with_no_cached_value_is_a_content_change(
    pair: tuple[str, str],
) -> None:
    """Files written by openpyxl and never opened in Excel cache no
    values at all — the engine's reader docstring calls this out — so
    the formula rewrite must be caught on content alone."""
    diff = diff_paths(*pair)
    by_ref = {delta.ref: delta for delta in diff.deltas}
    b2 = by_ref["Model!B2"]
    assert b2.content_changed
    assert b2.before_content == "f:=B1*2"
    assert b2.after_content == "f:=B1*3"


def test_the_number_one_true_and_the_text_one_are_three_things(
    tmp_path: Path,
) -> None:
    old = _write(tmp_path / "a.xlsx", {"S": {"A1": 1, "A2": 1}})
    new = _write(tmp_path / "b.xlsx", {"S": {"A1": True, "A2": "1"}})
    diff = diff_paths(old, new)
    assert diff.refs("changed") == ["S!A1", "S!A2"]


def test_identical_files_diff_to_nothing(pair: tuple[str, str]) -> None:
    old, _ = pair
    diff = diff_paths(old, old)
    assert not diff.deltas
    assert diff.unchanged == diff.populated_old == 6


def test_the_two_instruments_agree_on_the_synthetic_pair(
    pair: tuple[str, str],
) -> None:
    """The registered hand-check compares the differ against the
    stdlib instrument on a real pair; this is the same comparison
    where the truth is known by construction."""
    old, new = pair
    diff = diff_paths(old, new)
    hand = statuses(read_cells(Path(old)), read_cells(Path(new)))
    changed = [d for d in diff.deltas if d.kind == "changed"]
    assert hand["added"] == diff.refs("added")
    assert hand["removed"] == diff.refs("removed")
    assert hand["content_changed"] == [d.ref for d in changed if d.content_changed]
    assert hand["value_changed"] == [d.ref for d in changed if d.value_changed]
    assert len(hand["unchanged"]) == diff.summary["unchanged"]


class TestSharedFormulaTranslation:
    """The instrument's own hard part: a shared formula stored once
    and read at an offset, per the OOXML spec."""

    def test_relative_parts_shift_and_anchors_hold(self) -> None:
        assert translate("B1*$C$2+D3", 2, 1) == "C3*$C$2+E5"
        assert translate("SUM(A1:A10)", 0, 2) == "SUM(C1:C10)"
        assert translate("$B1+B$1", 1, 1) == "$B2+C$1"

    def test_strings_and_quoted_sheet_names_pass_untouched(self) -> None:
        assert translate('IF(A1>0,"A1 up","down")', 1, 0) == ('IF(A2>0,"A1 up","down")')
        assert translate("'My A1 Sheet'!B2+B2", 1, 0) == "'My A1 Sheet'!B3+B3"

    def test_a_shift_off_the_grid_is_a_ref_error(self) -> None:
        assert translate("A1", -1, 0) == "#REF!"
