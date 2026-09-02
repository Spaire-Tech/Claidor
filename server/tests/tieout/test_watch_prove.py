"""Tier 1's prover against the registration's own harness.

The hard gate, from `docs/pierce/logs/prism.md`: **zero false
proofs**. Every pair the registration lists as inequivalent must
come back refuted or unknown, never proved; every equivalent pair
should be proved, and the counterexamples must actually separate.
"""

from __future__ import annotations

import pytest

from polar.tieout.watch.prove import EQ, NEQ, REFUSED, prove

EQUIVALENT = [
    ("=A1*2/2", "=A1"),
    ("=(A1+B1)+C1", "=A1+(B1+C1)"),
    ("=IF(A1>0,B1,B1)", "=B1"),
    ("=SUM(A1:A3)", "=A1+A2+A3"),
    ("=A1*(1+B1)", "=A1+A1*B1"),
    ("=MAX(A1,B1)", "=IF(A1>B1,A1,B1)"),
    ("=ABS(A1)", "=IF(A1<0,-A1,A1)"),
    ("=SUMPRODUCT(A1:A2,B1:B2)", "=A1*B1+A2*B2"),
    ("=A1^2", "=A1*A1"),
    ("=10%*A1", "=A1/10"),
    ("=AND(A1>0,B1>0)", "=IF(A1>0,IF(B1>0,1,0),0)"),
    ("=Inputs!B2*C1", "=C1*Inputs!B2"),
]

INEQUIVALENT = [
    #: The study's hardcoded tail.
    ("=A1*B1", "=A1*B1-0.490096707821704"),
    #: An off-by-one range.
    ("=SUM(A1:A3)", "=SUM(A1:A4)"),
    #: A flipped comparison.
    ("=IF(A1>B1,1,0)", "=IF(A1<B1,1,0)"),
    #: A swapped operand of minus.
    ("=A1-B1", "=B1-A1"),
    ("=MIN(A1,B1)", "=MAX(A1,B1)"),
    ("=A1/B1", "=B1/A1"),
]


@pytest.mark.parametrize(("old", "new"), EQUIVALENT)
def test_equivalent_rewrites_are_proved(old: str, new: str) -> None:
    verdict = prove(old, new)
    assert verdict.verdict == EQ, (old, new, verdict)


@pytest.mark.parametrize(("old", "new"), INEQUIVALENT)
def test_inequivalent_rewrites_are_never_proved(old: str, new: str) -> None:
    verdict = prove(old, new)
    assert verdict.verdict != EQ, (old, new, verdict)
    assert verdict.verdict == NEQ, (old, new, verdict)
    assert verdict.counterexample, verdict


def test_the_counterexample_actually_separates_the_two() -> None:
    verdict = prove("=A1*B1", "=A1*B1-0.490096707821704")
    a, b = verdict.counterexample["Sheet!A1"], verdict.counterexample["Sheet!B1"]
    assert a * b != a * b - 0.490096707821704


def test_division_is_proved_under_a_named_side_condition() -> None:
    verdict = prove("=A1/B1*B1", "=A1")
    assert verdict.verdict == EQ
    assert verdict.conditions == ("Sheet!B1 is not zero",)


def test_the_fragment_boundary_refuses_by_construct() -> None:
    verdict = prove("=INDEX(A1:A5,2)", "=A2")
    assert verdict.verdict == REFUSED
    assert "lookup_or_selection" in verdict.reason
    verdict = prove("=SUM(A:A)", "=SUM(A1:A9)")
    assert verdict.verdict == REFUSED
    assert "whole_column" in verdict.reason
    verdict = prove('=A1&"x"', "=A1")
    assert verdict.verdict == REFUSED


def test_the_same_cell_is_the_same_variable_across_sheets() -> None:
    verdict = prove(
        "='Control Panel'!C51*E45", "=E45*'Control Panel'!C51", sheet="Model"
    )
    assert verdict.verdict == EQ
    assert verdict.variables == ("Control Panel!C51", "Model!E45")


def test_a_literal_side_is_a_constant() -> None:
    assert prove(None, "=0").verdict == EQ
    assert prove("=A1", None).verdict == NEQ
