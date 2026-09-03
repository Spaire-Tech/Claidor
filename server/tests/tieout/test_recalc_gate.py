"""B2: the fidelity gate's tolerance rules, against synthetic fixtures.

Every stored-vs-computed pair here is synthetic — invented to pin one
rule of the gate. No number in this file is, or resembles, a machine
recalculation result; the registered rules are `ambre-toolbox.md` §2's
(relative ~1e-9 on plain chains, the file's own convergence delta
inside iterative cycles, denylist refusal before comparison).
"""

from decimal import Decimal

from polar.tieout.recalc.denylist import Category, DenylistHit, Route
from polar.tieout.recalc.gate import (
    CalcSettings,
    gate_file,
    iterative_cells,
    tolerance_for,
)
from polar.tieout.workbook import Cell


def _cell(
    ref: str,
    value: str | None,
    formula: str | None,
    precedents: tuple[str, ...] = (),
) -> Cell:
    sheet, at = ref.split("!")
    column = 0
    row_text = ""
    for ch in at:
        if ch.isdigit():
            row_text += ch
        else:
            column = column * 26 + ord(ch) - 64
    return Cell(
        ref=ref,
        sheet=sheet,
        row=int(row_text),
        column=column,
        value=Decimal(str(value)) if value is not None else None,
        formula=formula,
        row_label="",
        column_label="",
        precedents=precedents,
    )


# --- the tolerance rules themselves ---


def test_plain_chain_forgives_float_dust() -> None:
    stored, computed = 412300.0, 412300.0000001
    assert abs(stored - computed) <= tolerance_for(
        stored, computed, in_cycle=False, settings=CalcSettings()
    )


def test_plain_chain_rejects_a_real_difference() -> None:
    stored, computed = 412300.0, 412301.0
    assert abs(stored - computed) > tolerance_for(
        stored, computed, in_cycle=False, settings=CalcSettings()
    )


def test_zero_needs_the_absolute_floor() -> None:
    # Relative tolerance alone admits nothing at zero; the floor does.
    assert abs(0.0 - 1e-15) <= tolerance_for(
        0.0, 1e-15, in_cycle=False, settings=CalcSettings()
    )
    assert abs(0.0 - 1e-6) > tolerance_for(
        0.0, 1e-6, in_cycle=False, settings=CalcSettings()
    )


def test_cycle_cells_get_the_files_own_delta_only_when_iterating() -> None:
    iterating = CalcSettings(iterative=True, iterate_delta=0.001)
    assert 0.0005 <= tolerance_for(100.0, 100.0005, in_cycle=True, settings=iterating)
    # Not in a cycle: the plain rule holds even when the file iterates.
    assert 0.0005 > tolerance_for(100.0, 100.0005, in_cycle=False, settings=iterating)
    # In a cycle but iteration off: plain rule.
    assert 0.0005 > tolerance_for(
        100.0, 100.0005, in_cycle=True, settings=CalcSettings()
    )


# --- cycle membership from the precedent graph ---


def test_mutual_references_form_a_cycle() -> None:
    graph = {
        "M!A1": ("M!B1",),
        "M!B1": ("M!A1",),
        "M!C1": ("M!A1",),
    }
    assert iterative_cells(graph) == {"M!A1", "M!B1"}


def test_self_reference_is_a_cycle() -> None:
    assert iterative_cells({"M!A1": ("M!A1",)}) == {"M!A1"}


def test_acyclic_chain_has_no_cycle_cells() -> None:
    graph = {"M!A1": ("M!B1",), "M!B1": ("M!C1",), "M!C1": ()}
    assert iterative_cells(graph) == frozenset()


def test_precedents_outside_the_mapping_do_not_close_cycles() -> None:
    # A precedent that is not itself a formula cell (an input) cannot cycle.
    assert iterative_cells({"M!A1": ("M!Z9",)}) == frozenset()


# --- the file-level gate ---


def test_matching_file_passes_with_full_rate() -> None:
    cells = {
        "M!B2": _cell("M!B2", "100.5", "=B1*2"),
        "M!B3": _cell("M!B3", "201.0", "=B2*2"),
        "M!B1": _cell("M!B1", "50.25", None),  # input: not gated
    }
    report = gate_file(cells, {"M!B2": 100.5, "M!B3": 201.0000000001})
    assert report.verdict == "pass"
    assert report.compared == 2
    assert report.match_rate == 1.0


def test_mismatch_names_the_cell_and_both_values() -> None:
    cells = {"M!B2": _cell("M!B2", "100.0", "=B1*2")}
    report = gate_file(cells, {"M!B2": 99.0})
    assert report.verdict == "fail"
    (diff,) = report.mismatches
    assert diff.ref == "M!B2"
    assert diff.stored is not None
    assert float(diff.stored) == 100.0
    assert diff.computed == 99.0
    assert diff.tolerance is not None


def test_cycle_cells_in_an_iterating_file_use_the_convergence_tolerance() -> None:
    cells = {
        "M!A1": _cell("M!A1", "100.0", "=B1+1", precedents=("M!B1",)),
        "M!B1": _cell("M!B1", "99.0", "=A1-1", precedents=("M!A1",)),
    }
    computed = {"M!A1": 100.0004, "M!B1": 98.9996}
    iterating = CalcSettings(iterative=True, iterate_delta=0.001)
    assert gate_file(cells, computed, settings=iterating).verdict == "pass"
    assert gate_file(cells, computed).verdict == "fail"


def test_never_computed_workbook_has_nothing_to_compare() -> None:
    cells = {"M!B2": _cell("M!B2", None, "=B1*2")}
    report = gate_file(cells, {"M!B2": 100.0})
    assert report.verdict == "nothing-compared"
    assert report.no_stored_value == ["M!B2"]
    assert report.match_rate is None


def test_a_hole_in_the_engines_answer_fails_the_gate() -> None:
    cells = {
        "M!B2": _cell("M!B2", "100.0", "=B1*2"),
        "M!B3": _cell("M!B3", "7.0", "=B2/2"),
    }
    report = gate_file(cells, {"M!B2": 100.0})
    assert report.verdict == "fail"
    assert report.not_computed == ["M!B3"]


def test_number_against_error_string_is_a_mismatch_of_kind() -> None:
    cells = {"M!B2": _cell("M!B2", "100.0", "=B1/B0")}
    report = gate_file(cells, {"M!B2": "#DIV/0!"})
    assert report.verdict == "fail"
    (diff,) = report.mismatches
    assert diff.tolerance is None


def test_engine_error_against_stored_number_gets_its_own_bucket() -> None:
    # LibreOffice erred where Excel stored a number (e.g. OFFSET with
    # a computed negative width): the engine's inability, named per
    # cell, still failing the gate — and marking the arbiter's case.
    cells = {
        "M!B2": _cell("M!B2", "8.29", "=AVERAGE(OFFSET(A1,0,0,C1,1))"),
        "M!B3": _cell("M!B3", "5.0", "=A1+1"),
    }
    report = gate_file(cells, {"M!B2": "#ERR:502", "M!B3": 5.0})
    assert report.verdict == "fail"
    assert report.mismatches == []
    (err,) = report.engine_errors
    assert err.ref == "M!B2"
    assert err.computed == "#ERR:502"
    assert report.compared == 2
    assert report.matched == 1


def test_refusal_short_circuits_before_any_comparison() -> None:
    cells = {"M!B2": _cell("M!B2", "100.0", '=RTD("x",,"y")')}
    hit = DenylistHit(ref="M!B2", category=Category.RTD, target="RTD")
    report = gate_file(cells, {"M!B2": 999.0}, refusals=[hit], route=Route.REFUSE)
    assert report.verdict == "refused"
    assert report.compared == 0
    assert report.route is Route.REFUSE


def test_the_speck_rule_forgives_rounding_dust_in_proportion_to_the_file() -> None:
    """The founder's decision, 2 September 2026: a balance check that
    Excel stored as 3e-7 and an engine computed as 0, in a model
    measured in billions, is the same number. A real imbalance of a
    penny is not."""
    from types import SimpleNamespace

    from polar.tieout.recalc.gate import SPECK_RELATIVE

    settings = CalcSettings()
    #: Without a scale the old floor stands.
    assert abs(0.0 - 3e-7) > tolerance_for(0.0, 3e-7, in_cycle=False, settings=settings)
    #: With the file's magnitude the speck is forgiven and a penny is not.
    big = 5e9
    assert abs(3e-7 - 0.0) <= tolerance_for(
        3e-7, 0.0, in_cycle=False, settings=settings, scale=big
    )
    assert abs(0.01 - 0.0) > tolerance_for(
        0.01, 0.0, in_cycle=False, settings=settings, scale=big
    )
    assert SPECK_RELATIVE * big < 0.01

    cells = {
        "Model!B1": SimpleNamespace(formula=None, value=big, precedents=()),
        "Model!B2": SimpleNamespace(formula=None, value=-big, precedents=()),
        "Model!B3": SimpleNamespace(
            formula="=B1+B2",
            value=2.980232238769531e-07,
            precedents=("Model!B1", "Model!B2"),
        ),
    }
    report = gate_file(cells, {"Model!B3": 0.0})
    assert report.verdict == "pass", report.mismatches
    report = gate_file(cells, {"Model!B3": 0.01})
    assert report.verdict == "fail"
