"""The volatile rules (registered 26 Aug): the cone, and the gate around it.

Synthetic fixtures pin the registered arithmetic: a TODAY-class
disagreement is reported, never counted as fidelity loss; a mismatch
outside the cone still fails the file exactly as before.
"""

from decimal import Decimal

from polar.tieout.recalc.gate import gate_file
from polar.tieout.recalc.volatile import is_volatile, volatile_cone
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


def test_detection_is_tokenized_not_substring() -> None:
    assert is_volatile("=TODAY()")
    assert is_volatile("=YEAR(NOW())-1")
    assert is_volatile("=_xlfn.RANDARRAY(3)")
    assert not is_volatile("='Today s run'!A1")
    assert not is_volatile('=IF(B1,"TODAY","NOW")')
    assert not is_volatile("=SUM(B1:B9)")


def test_cone_is_roots_plus_transitive_dependents() -> None:
    cells = {
        "M!A1": _cell("M!A1", "45000", "=TODAY()"),
        "M!A2": _cell("M!A2", "45010", "=A1+10", precedents=("M!A1",)),
        "M!A3": _cell("M!A3", "90020", "=A2*2", precedents=("M!A2",)),
        "M!B1": _cell("M!B1", "7", "=SUM(C1:C3)", precedents=("M!C1",)),
    }
    roots, cone = volatile_cone(cells)
    assert roots == {"M!A1"}
    assert cone == {"M!A1", "M!A2", "M!A3"}


def test_volatile_disagreement_is_reported_not_fidelity_loss() -> None:
    cells = {
        "M!A1": _cell("M!A1", "44741", "=TODAY()"),
        "M!A2": _cell("M!A2", "44771", "=A1+30", precedents=("M!A1",)),
        "M!B1": _cell("M!B1", "100.0", "=SUM(C1:C3)"),
    }
    # The recalculation lands on a different day; the clean cell matches.
    computed = {"M!A1": 46259.0, "M!A2": 46289.0, "M!B1": 100.0}
    report = gate_file(cells, computed)
    assert report.verdict == "pass"
    assert report.compared == 1
    assert report.match_rate == 1.0
    assert report.volatile_roots == ["M!A1"]
    assert report.volatile_cone == 2


def test_a_mismatch_outside_the_cone_still_fails() -> None:
    cells = {
        "M!A1": _cell("M!A1", "44741", "=TODAY()"),
        "M!B1": _cell("M!B1", "100.0", "=SUM(C1:C3)"),
    }
    report = gate_file(cells, {"M!A1": 46259.0, "M!B1": 99.0})
    assert report.verdict == "fail"
    assert [diff.ref for diff in report.mismatches] == ["M!B1"]
