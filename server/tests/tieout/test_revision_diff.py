"""The revision pipeline's matcher (`scripts/revision_diff.py`): findings
match on rule + sheet + cell name; a column fold that kept only its
row label in `flow` matches on that label; a finding with neither is
UNMATCHED, never guessed."""

from __future__ import annotations

from dataclasses import dataclass

from scripts.revision_diff import keyed, name_of


@dataclass
class _Finding:
    rule: str
    sheet: str
    name: str
    flow: str = ""
    ref: str = ""


def test_a_named_finding_keys_on_its_name() -> None:
    one = _Finding("typed-over-formula", "InpS", "FY2025 Base revenue", "Base revenue")
    assert name_of(one) == "FY2025 Base revenue"


def test_a_column_fold_keys_on_its_row_label() -> None:
    fold = _Finding("typed-over-formula", "InpS", "", flow="Base revenue for 2024-25")
    keys, unmatched = keyed([fold])
    assert unmatched == 0
    assert keys == {("typed-over-formula", "InpS", "Base revenue for 2024-25"): 1}


def test_a_finding_with_no_name_and_no_label_is_unmatched() -> None:
    bare = _Finding("broken-name", "", "", flow="")
    keys, unmatched = keyed([bare])
    assert unmatched == 1
    assert not keys
