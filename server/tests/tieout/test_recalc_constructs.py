"""Modern Excel — the construct scan and the routing it steers.

Registered in `docs/pierce/modern-excel.md`: what newer Excel puts in
a file is read from its bytes before any calculator is chosen; a
table keeps Formualizer out; a spill reference and a named LAMBDA go
to the arbiter as what they are, not as macros; and the engines'
measured behaviour on each construct is pinned so a future version
that changes it fails here and the routing is revisited on evidence.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from openpyxl import Workbook as Book
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.table import Table

from polar.tieout.recalc.constructs import scan_constructs
from polar.tieout.recalc.denylist import (
    Category,
    Route,
    prescan,
    route_for,
    scan_formula,
)
from polar.tieout.recalc.native import (
    FormualizerCalculator,
    IronCalcCalculator,
    native_recalc,
)
from polar.tieout.workbook import read_workbook


def _plain(tmp_path: Path) -> str:
    book = Book()
    sheet = book.active
    assert sheet is not None
    sheet.title = "S"
    sheet["A1"] = 10
    sheet["A2"] = 20
    sheet["B1"] = "=A1+A2"
    path = tmp_path / "plain.xlsx"
    book.save(path)
    return str(path)


def _with_table(tmp_path: Path) -> str:
    book = Book()
    sheet = book.active
    assert sheet is not None
    sheet.title = "S"
    sheet["A1"] = 10
    sheet["C8"] = "=SUM(T[Amt])"
    other = book.create_sheet("T")
    other.append(["Amt"])
    other.append([5])
    other.append([7])
    other.add_table(Table(displayName="T", ref="A1:A3"))
    path = tmp_path / "table.xlsx"
    book.save(path)
    return str(path)


def _with_spill(tmp_path: Path) -> str:
    """A real spill: the anchor stored as a dynamic array over `B1:B4`
    with the array metadata, and a `#` reference to it. openpyxl cannot
    write one (it stores a plain formula, and every engine then fails
    on a reference to a cell that never spilled — a builder artefact,
    not Excel's bytes); IronCalc writes the same parts Excel does.
    Column B, not A: the reader takes a sheet's leftmost filled column
    as its labels."""
    ironcalc = pytest.importorskip("ironcalc")
    model = ironcalc.create("Book1", "en", "UTC")
    model.set_user_input(0, 1, 2, "=SEQUENCE(4)")
    model.set_user_input(0, 1, 4, "=SUM(B1#)")
    model.evaluate()
    path = tmp_path / "spill.xlsx"
    model.save_to_xlsx(str(path))
    return str(path)


def _with_named_lambda(tmp_path: Path) -> str:
    book = Book()
    sheet = book.active
    assert sheet is not None
    sheet.title = "S"
    sheet["C9"] = "=DOUBLE(21)"
    book.defined_names["DOUBLE"] = DefinedName(
        "DOUBLE", attr_text="_xlfn.LAMBDA(_xlpm.x,_xlpm.x*2)"
    )
    path = tmp_path / "lambda.xlsx"
    book.save(path)
    return str(path)


def _with_modern_functions(tmp_path: Path) -> str:
    book = Book()
    sheet = book.active
    assert sheet is not None
    sheet.title = "S"
    sheet["A1"] = 10
    sheet["A2"] = 20
    sheet["A3"] = 30
    sheet["C1"] = "=_xlfn.LET(x,A1+A2,x*2)"
    sheet["C3"] = "=SUM(_xlfn._xlws.FILTER(A1:A3,A1:A3>15))"
    sheet["C5"] = "=_xlfn.IFS(A1>100,1,A1>5,2,TRUE,3)"
    path = tmp_path / "modern.xlsx"
    book.save(path)
    return str(path)


class TestTheScanReadsTheBytes:
    def test_a_plain_file_carries_nothing(self, tmp_path: Path) -> None:
        scan = scan_constructs(_plain(tmp_path))
        assert scan.constructs == []
        assert scan.words() == ""

    def test_a_table_is_seen_with_its_name_and_range(self, tmp_path: Path) -> None:
        scan = scan_constructs(_with_table(tmp_path))
        assert scan.has_tables
        assert scan.count("table") == 1
        (table,) = [one for one in scan.constructs if one.kind == "table"]
        assert table.examples == ("T (A1:A3)",)
        assert scan.words() == "1 table"

    def test_a_named_lambda_is_seen_from_the_defined_name(self, tmp_path: Path) -> None:
        scan = scan_constructs(_with_named_lambda(tmp_path))
        assert scan.named_lambdas == frozenset({"DOUBLE"})
        assert scan.count("named-lambda") == 1
        assert scan.words() == "1 named LAMBDA (DOUBLE)"

    def test_modern_functions_are_counted_by_name(self, tmp_path: Path) -> None:
        scan = scan_constructs(_with_modern_functions(tmp_path))
        (functions,) = [one for one in scan.constructs if one.kind == "function"]
        assert functions.count == 3
        assert set(functions.examples) == {"LET ×1", "FILTER ×1", "IFS ×1"}
        #: Functions are information, not a construct the sentence names.
        assert scan.words() == ""

    def test_an_unreadable_file_is_reported_not_raised(self, tmp_path: Path) -> None:
        path = tmp_path / "broken.xlsx"
        path.write_bytes(b"not a zip")
        scan = scan_constructs(str(path))
        assert [one.kind for one in scan.constructs] == ["unreadable"]


class TestThePrescanDefectsNamedBeforeTheFix:
    def test_filter_stored_with_the_double_prefix_is_a_known_function(self) -> None:
        """Until 2 September a file using FILTER was refused as if it
        called a macro: `_xlfn._xlws.FILTER(` lost only its first
        prefix and `_XLWS.FILTER` was not in the catalogue."""
        assert scan_formula("S!C3", "=SUM(_xlfn._xlws.FILTER(A1:A3,A1:A3>15))") == []
        assert scan_formula("S!C3", "=_xlfn._xlws.SORT(A1:A3)") == []

    def test_a_spill_reference_is_an_engine_gap_not_a_macro(self) -> None:
        hits = scan_formula("S!C7", "=SUM(_xlfn.ANCHORARRAY(E1))")
        assert [(one.category, one.target) for one in hits] == [
            (Category.ENGINE_GAP, "ANCHORARRAY")
        ]
        assert route_for(hits) is Route.ARBITER

    def test_a_named_lambda_call_is_a_lambda_not_a_macro(self, tmp_path: Path) -> None:
        path = _with_named_lambda(tmp_path)
        cells = read_workbook(path).cells
        #: Without the scan's names the bare call reads as a macro —
        #: which is the defect; with them it is the LAMBDA it is.
        assert {one.category for one in prescan(cells)} == {Category.UDF}
        hits = prescan(cells, scan_constructs(path).named_lambdas)
        assert [(one.category, one.target) for one in hits] == [
            (Category.LAMBDA, "DOUBLE")
        ]
        assert route_for(hits) is Route.ARBITER


class TestTheEnginesAsMeasured:
    """Pinned as measured 2 September 2026. A newer engine that changes
    one of these fails here on purpose: the routing was chosen on this
    evidence and must be revisited on new evidence, not drift."""

    def test_formualizer_refuses_a_workbook_with_a_table(self, tmp_path: Path) -> None:
        pytest.importorskip("formualizer")
        from polar.tieout.recalc.pool import CalculatorError

        with pytest.raises(CalculatorError, match="Undefined table"):
            FormualizerCalculator(["S!C8"]).recalculate(_with_table(tmp_path))

    def test_ironcalc_computes_a_table_reference(self, tmp_path: Path) -> None:
        pytest.importorskip("ironcalc")
        result = IronCalcCalculator(["S!C8"]).recalculate(_with_table(tmp_path))
        assert result.values["S!C8"] == 12.0

    def test_the_scan_sees_a_real_spill(self, tmp_path: Path) -> None:
        scan = scan_constructs(_with_spill(tmp_path))
        assert scan.has_spill
        (spill,) = [one for one in scan.constructs if one.kind == "spill"]
        assert spill.count == 1
        assert spill.examples == ("B1 → B1:B4",)
        assert scan.words() == "1 cell that spills"

    def test_ironcalc_computes_a_spill_and_its_reference(self, tmp_path: Path) -> None:
        """The measurement that changed the routing: the first draft of
        this round sent every spill reference to the arbiter unasked.
        IronCalc computes both the spill and the `#` reference, so the
        gate, not the prescan, decides."""
        refs = ["Sheet1!B1", "Sheet1!B4", "Sheet1!D1"]
        values = IronCalcCalculator(refs).recalculate(_with_spill(tmp_path)).values
        assert (values["Sheet1!B1"], values["Sheet1!B4"], values["Sheet1!D1"]) == (
            1.0,
            4.0,
            10.0,
        )

    def test_formualizer_cannot_do_a_spill_reference(self, tmp_path: Path) -> None:
        pytest.importorskip("formualizer")
        refs = ["Sheet1!B1", "Sheet1!B4", "Sheet1!D1"]
        values = FormualizerCalculator(refs).recalculate(_with_spill(tmp_path)).values
        assert values["Sheet1!B4"] == 4.0
        assert values["Sheet1!B1"] == "#SPILL!"
        assert values["Sheet1!D1"] == "#NAME?"

    def test_both_native_engines_compute_the_modern_functions(
        self, tmp_path: Path
    ) -> None:
        pytest.importorskip("ironcalc")
        pytest.importorskip("formualizer")
        path = _with_modern_functions(tmp_path)
        refs = ["S!C1", "S!C3", "S!C5"]
        for calculator in (IronCalcCalculator(refs), FormualizerCalculator(refs)):
            values = calculator.recalculate(path).values
            assert (values["S!C1"], values["S!C3"], values["S!C5"]) == (60.0, 50.0, 2.0)


class TestTheRouting:
    def test_formualizer_is_not_asked_about_a_file_with_tables(
        self, tmp_path: Path
    ) -> None:
        pytest.importorskip("ironcalc")
        path = _with_table(tmp_path)
        scan = scan_constructs(path)
        outcome = native_recalc(
            path,
            read_workbook(path).cells,
            engines=("Formualizer", "IronCalc"),
            isolate=False,
            constructs=scan,
        )
        skipped = [one for one in outcome.attempts if one.engine == "Formualizer"]
        assert len(skipped) == 1
        assert skipped[0].verdict == "skipped"
        assert skipped[0].why == (
            "skipped: the file has 1 table and Formualizer refuses a workbook "
            "that carries one"
        )
        #: IronCalc was still asked; the file has no stored values (a
        #: generator wrote it), so the gate compared nothing — the point
        #: here is who was asked, not the verdict.
        assert [one.engine for one in outcome.attempts][-1].startswith("IronCalc")

    def test_a_plain_file_asks_every_engine(self, tmp_path: Path) -> None:
        pytest.importorskip("ironcalc")
        pytest.importorskip("formualizer")
        path = _plain(tmp_path)
        outcome = native_recalc(
            path,
            read_workbook(path).cells,
            isolate=False,
            constructs=scan_constructs(path),
        )
        assert not any(one.verdict == "skipped" for one in outcome.attempts)


class TestTheWholeGateFlow:
    """`_gate_stored_model` end to end, without a database: the scan,
    the prescan, the native engines, and the mark's fields."""

    def test_a_spill_is_believed_when_the_fast_engine_passes_the_gate(
        self, tmp_path: Path
    ) -> None:
        from polar.tieout.service import TieOutService

        path = _with_spill(tmp_path)
        fidelity, engine = TieOutService._gate_stored_model(
            Path(path).read_bytes(), ".xlsx"
        )
        #: The prescan flagged the spill reference as an engine gap;
        #: IronCalc was asked anyway, matched every stored value, and
        #: is believed. No refusal, and the mark says what the file is
        #: made of.
        assert engine is not None
        assert engine.startswith("IronCalc")
        assert fidelity.verdict == "pass"
        assert fidelity.refusals == []
        assert [one["kind"] for one in fidelity.constructs] == [
            "spill",
            "dynamic-array",
            "function",
        ]
        assert fidelity.attempts[0]["engine"].startswith("IronCalc")

    def test_a_named_lambda_goes_to_the_arbiter_after_the_engines_fail(
        self, tmp_path: Path
    ) -> None:
        pytest.importorskip("formualizer")
        from polar.tieout.service import TieOutService

        path = _with_named_lambda(tmp_path)
        fidelity, engine = TieOutService._gate_stored_model(
            Path(path).read_bytes(), ".xlsx"
        )
        assert engine is None
        assert fidelity.verdict == "refused"
        assert fidelity.route is Route.ARBITER
        assert [(one.category, one.target) for one in fidelity.refusals] == [
            (Category.LAMBDA, "DOUBLE")
        ]
        #: Both native engines were asked before the file was sent on,
        #: and the mark says so.
        assert [one["engine"].split(" ")[0] for one in fidelity.attempts] == [
            "IronCalc",
            "Formualizer",
        ]
        assert [one["kind"] for one in fidelity.constructs] == ["named-lambda"]
