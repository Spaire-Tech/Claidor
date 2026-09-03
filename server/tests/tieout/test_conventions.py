"""The convention check (`docs/pierce/convention-check.md`): a line
computed unlike every model we hold is a reviewer's question, in
words; a line that agrees is silence; a model whose line names we
hold nothing for is an abstention that says so."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

from openpyxl import Workbook as XlsxWorkbook

from polar.tieout.meaning.conventions import Convention, Conventions, load, reach, words
from polar.tieout.workbook import read_workbook


def _model(path: Path, revenue_formula: str) -> Path:
    book = XlsxWorkbook()
    sheet = book.active
    sheet.title = "Ops"
    sheet["A1"], sheet["B1"], sheet["C1"], sheet["D1"] = (
        "Line",
        "FY2024",
        "FY2025",
        "FY2026",
    )
    sheet["A2"], sheet["B2"], sheet["C2"], sheet["D2"] = "Volume", 10, 11, 12
    sheet["A3"], sheet["B3"], sheet["C3"], sheet["D3"] = "Tariff", 2, 2, 2
    sheet["A4"] = "Revenue"
    for column in "BCD":
        sheet[f"{column}4"] = revenue_formula.replace("X", column)
    book.save(path)
    return path


def _held(pattern: tuple[str, str, str]) -> Conventions:
    return Conventions(
        {"revenue": Convention("revenue", pattern, files=7, agreeing=6, families=3)},
        pool_files=40,
        pool_families=5,
    )


VOLUME_TIMES_TARIFF = ("f:", "o:*", "r:tariff | volume")


def test_a_line_computed_the_held_way_agrees(tmp_path: Path) -> None:
    book = read_workbook(str(_model(tmp_path / "m.xlsx", "=X2*X3")))
    reached = reach(book, _held(VOLUME_TIMES_TARIFF))
    assert [one.row.label for one in reached] == ["revenue"]
    assert reached[0].agrees


def test_a_line_computed_otherwise_is_a_departure(tmp_path: Path) -> None:
    book = read_workbook(str(_model(tmp_path / "m.xlsx", "=X2+X3")))
    reached = reach(book, _held(VOLUME_TIMES_TARIFF))
    assert len(reached) == 1
    assert not reached[0].agrees
    assert words(reached[0].row.pattern) == "« tariff » and « volume », added"
    assert words(VOLUME_TIMES_TARIFF) == "« tariff » and « volume », multiplied"


def test_a_model_with_no_held_line_name_reaches_nothing(tmp_path: Path) -> None:
    book = read_workbook(str(_model(tmp_path / "m.xlsx", "=X2*X3")))
    held = Conventions({"opex": Convention("opex", VOLUME_TIMES_TARIFF, 3, 3, 2)}, 3, 2)
    assert reach(book, held) == []


def test_a_time_axis_row_is_a_header_not_a_line() -> None:
    from polar.tieout.meaning.conventions import is_axis_label

    assert is_axis_label("financial year ending")
    assert is_axis_label("period")
    assert is_axis_label("model year")
    assert not is_axis_label("taxable profit")
    assert not is_axis_label("years to maturity")


def test_the_committed_data_loads_and_holds_conventions() -> None:
    held = load()
    assert held.pool_files > 50
    assert held.pool_families >= 5
    assert len(held.labels) > 500
    for one in held.labels.values():
        assert one.agreeing * 2 > one.files
        assert one.families >= 2


def test_the_data_file_is_labels_and_shapes_only(tmp_path: Path) -> None:
    """Nothing from any model's numbers: every value is a pattern
    string or a count."""
    from polar.tieout.meaning.conventions import DATA

    with gzip.open(DATA, "rt", encoding="utf-8") as handle:
        raw = json.load(handle)
    assert set(raw) == {"pool", "labels"}
    for label, one in raw["labels"].items():
        assert isinstance(label, str)
        assert set(one) == {"pattern", "files", "agreeing", "families"}
        assert len(one["pattern"]) == 3


def test_the_analytics_layer_carries_the_check(tmp_path: Path) -> None:
    from polar.tieout.analytics import (
        ANALYTIC_PASS_NAMES,
        ANALYTIC_RULE_NAMES,
        run_analytics,
    )
    from polar.tieout.structure import read_structure

    assert "convention" in ANALYTIC_RULE_NAMES
    assert "convention" in ANALYTIC_PASS_NAMES
    book = read_workbook(str(_model(tmp_path / "m.xlsx", "=X2*X3")))
    result = run_analytics(book, read_structure(book))
    # « revenue » is held by the committed data or it is not; either
    # way the check speaks: a tally, or an abstention that says why.
    spoke = "convention" in result.tallies or any(
        one.rule == "convention" for one in result.abstentions
    )
    assert spoke
