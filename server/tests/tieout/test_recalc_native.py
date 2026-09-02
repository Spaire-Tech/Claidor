"""The two native calculators behind the gate.

Each engine's numbers are only believed when they match what Excel
saved, cell for cell; the chooser keeps the first engine that passes
and records every attempt, including the ones it did not believe.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from openpyxl import Workbook as Book

from polar.tieout.recalc import gate_file
from polar.tieout.recalc.native import (
    NATIVE_MAX_BYTES,
    FormualizerCalculator,
    IronCalcCalculator,
    _plain,
    native_recalc,
)
from polar.tieout.workbook import read_workbook


@pytest.fixture
def small_model(tmp_path: Path) -> str:
    """A model whose cached values are what Excel would store."""
    book = Book()
    sheet = book.active
    assert sheet is not None
    sheet.title = "Model"
    sheet["A1"] = "Revenue"
    sheet["B1"] = 100
    sheet["C1"] = 120
    sheet["A2"] = "Costs"
    sheet["B2"] = 40
    sheet["C2"] = 50
    sheet["A3"] = "Margin"
    sheet["B3"] = "=B1-B2"
    sheet["C3"] = "=C1-C2"
    sheet["A4"] = "Total"
    sheet["B4"] = "=SUM(B1:B3)"
    sheet["C4"] = "=SUM(C1:C3)"
    sheet["A5"] = "Ratio"
    sheet["B5"] = "=B3/B1"
    sheet["C5"] = "=C3/C1"
    other = book.create_sheet("Summary")
    other["A1"] = "Both"
    other["B1"] = "=Model!B4+Model!C4"
    path = tmp_path / "small.xlsx"
    book.save(path)
    return str(path)


def _with_cached_values(path: str) -> str:
    """LibreOffice-free: recalc through IronCalc and save, so the file
    carries cached values the gate can compare against."""
    import ironcalc

    model = ironcalc.load_from_xlsx(path, "en", "UTC")
    model.evaluate()
    target = str(Path(path).with_name("cached.xlsx"))
    model.save_to_xlsx(target)
    return target


def test_plain_maps_engine_values_into_the_gates_vocabulary() -> None:
    assert _plain(3) == 3.0
    assert _plain(True) == "TRUE"
    assert _plain(None) is None
    assert _plain("") == ""
    assert _plain({"type": "Error", "kind": "Value"}) == "#VALUE!"
    assert _plain({"type": "Error", "kind": "Spill"}) == "#SPILL!"
    assert _plain({"type": "Error", "kind": "Div0"}) == "#DIV/0!"


def test_both_engines_compute_the_small_model(small_model: str) -> None:
    path = _with_cached_values(small_model)
    cells = read_workbook(path).cells
    refs = [ref for ref, cell in cells.items() if cell.formula is not None]
    assert len(refs) == 7
    for calculator in (IronCalcCalculator(refs), FormualizerCalculator(refs)):
        result = calculator.recalculate(path)
        assert result.values["Model!B3"] == 60.0
        assert result.values["Model!C4"] == 240.0
        assert result.values["Summary!B1"] == 440.0
        assert result.engine.split()[0] in ("IronCalc", "Formualizer")
        report = gate_file(cells, result.values)
        assert report.verdict == "pass", (result.engine, report.mismatches)


def test_the_chooser_keeps_the_first_engine_the_gate_believes(small_model: str) -> None:
    path = _with_cached_values(small_model)
    cells = read_workbook(path).cells
    outcome = native_recalc(path, cells, isolate=False)
    assert outcome.engine is not None
    assert outcome.engine.startswith("IronCalc")
    assert outcome.fidelity is not None
    assert outcome.fidelity.verdict == "pass"
    assert [one.verdict for one in outcome.attempts] == ["pass"]


def test_a_failing_engine_is_recorded_and_the_next_one_is_tried(
    small_model: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = _with_cached_values(small_model)
    cells = read_workbook(path).cells

    def broken(self: IronCalcCalculator, _path: str) -> None:
        raise RuntimeError("engine fell over")

    monkeypatch.setattr(IronCalcCalculator, "recalculate", broken)
    outcome = native_recalc(path, cells, isolate=False)
    assert outcome.engine is not None
    assert outcome.engine.startswith("Formualizer")
    assert [one.verdict for one in outcome.attempts] == ["failed", "pass"]
    assert "engine fell over" in outcome.attempts[0].why


def test_an_engine_that_disagrees_with_excel_is_not_believed(
    small_model: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = _with_cached_values(small_model)
    cells = read_workbook(path).cells
    original = IronCalcCalculator.recalculate

    def wrong(self: IronCalcCalculator, _path: str):  # type: ignore[no-untyped-def]
        result = original(self, _path)
        values = dict(result.values)
        values["Model!B3"] = 61.0
        return type(result)(values=values, engine=result.engine)

    monkeypatch.setattr(IronCalcCalculator, "recalculate", wrong)
    outcome = native_recalc(path, cells, isolate=False)
    assert outcome.engine is not None
    assert outcome.engine.startswith("Formualizer")
    assert outcome.attempts[0].verdict == "fail"
    assert "1 cells disagree" in outcome.attempts[0].why


def test_files_above_the_native_limit_go_straight_to_libreoffice(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as handle:
        handle.write(b"0" * 16)
        path = handle.name
    monkeypatch.setattr("polar.tieout.recalc.native.NATIVE_MAX_BYTES", 8)
    outcome = native_recalc(path, {}, isolate=False)
    assert outcome.engine is None
    assert outcome.attempts[0].verdict == "skipped"
    assert "above the" in outcome.attempts[0].why
    Path(path).unlink(missing_ok=True)
    assert NATIVE_MAX_BYTES > 0
