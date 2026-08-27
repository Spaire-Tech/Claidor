"""Narrowing a violated law to its responsible cell, on synthetic fixtures.

Every model here is hand-built and hand-checked. The cases pin the
registered rules: what counts as obeying a law, where the culprit
frontier sits, that ddmin returns a 1-minimal set, and that an
omitted segment is visible in the total's own formula.
"""

from decimal import Decimal

from polar.tieout.recalc.narrow import (
    State,
    classify,
    ddmin,
    frontier,
    missing_segments,
    precedent_cone,
)
from polar.tieout.workbook import Cell


def _cell(ref: str, formula: str | None, precedents: tuple[str, ...] = ()) -> Cell:
    sheet, at = ref.split("!")
    return Cell(
        ref=ref,
        sheet=sheet,
        row=int("".join(ch for ch in at if ch.isdigit())),
        column=1,
        value=Decimal("0"),
        formula=formula,
        row_label="",
        column_label="",
        precedents=precedents,
    )


# A hand-worked chain: volume → units → revenue, with a constant
# pasted into the tail of `revenue`.
#   M!V   input volume            10  → 0 when zeroed
#   M!U   = V * 3                 30  → 0
#   M!R   = U * 2 + 7             67  → 7   ← the defect
#   M!T   = R + 1                 68  → 8
CHAIN = {
    "M!V1": _cell("M!V1", None),
    "M!U1": _cell("M!U1", "=V1*3", ("M!V1",)),
    "M!R1": _cell("M!R1", "=U1*2+7", ("M!U1",)),
    "M!T1": _cell("M!T1", "=R1+1", ("M!R1",)),
}
CHAIN_BASE = {"M!V1": 10.0, "M!U1": 30.0, "M!R1": 67.0, "M!T1": 68.0}
CHAIN_ZEROED = {"M!V1": 0.0, "M!U1": 0.0, "M!R1": 7.0, "M!T1": 8.0}


def test_classify_reads_the_laws_allowed_relations() -> None:
    assert classify(30.0, 0.0, None) is State.ZERO
    assert classify(30.0, 30.0, 2.0) is State.UNCHANGED
    assert classify(30.0, 60.0, 2.0) is State.SCALED
    assert classify(30.0, 61.0, 2.0) is State.ANOMALOUS
    assert classify(None, 61.0, 2.0) is State.UNKNOWN
    # Float dust is not an anomaly.
    assert classify(30.0, 60.0000000001, 2.0) is State.SCALED


def test_the_cone_is_the_dependency_slice() -> None:
    assert precedent_cone(CHAIN, "M!T1") == {"M!R1", "M!U1", "M!V1"}
    assert precedent_cone(CHAIN, "M!U1") == {"M!V1"}


def test_frontier_names_the_hardcode_not_its_consumers() -> None:
    # Zero-input: the output T is non-zero, but R is why.
    assert frontier(CHAIN, CHAIN_BASE, CHAIN_ZEROED, "M!T1", factor=None) == ["M!R1"]


def test_frontier_finds_a_proportionality_break_at_its_source() -> None:
    # price ×2: U doubles honestly, R adds a constant so it cannot.
    doubled = {"M!V1": 20.0, "M!U1": 60.0, "M!R1": 127.0, "M!T1": 128.0}
    assert frontier(CHAIN, CHAIN_BASE, doubled, "M!T1", factor=2.0) == ["M!R1"]


def test_an_unchanged_rate_in_the_cone_is_not_a_culprit() -> None:
    # A legitimate rate that does not move must never be flagged.
    cells = {
        "M!A1": _cell("M!A1", None),
        "M!B1": _cell("M!B1", None),
        "M!C1": _cell("M!C1", "=B1*A1+4", ("M!B1", "M!A1")),
    }
    base = {"M!A1": 0.05, "M!B1": 100.0, "M!C1": 9.0}
    scaled = {"M!A1": 0.05, "M!B1": 200.0, "M!C1": 14.0}
    assert frontier(cells, base, scaled, "M!C1", factor=2.0) == ["M!C1"]


def test_a_clean_model_has_no_frontier() -> None:
    clean = {
        "M!V1": _cell("M!V1", None),
        "M!U1": _cell("M!U1", "=V1*3", ("M!V1",)),
        "M!R1": _cell("M!R1", "=U1*2", ("M!U1",)),
    }
    base = {"M!V1": 10.0, "M!U1": 30.0, "M!R1": 60.0}
    doubled = {"M!V1": 20.0, "M!U1": 60.0, "M!R1": 120.0}
    assert frontier(clean, base, doubled, "M!R1", factor=2.0) == []


# --- ddmin ---


def test_ddmin_finds_the_single_culprit() -> None:
    # Only pinning "c" restores the law; ddmin must strip the rest.
    calls = []

    def holds(subset):
        calls.append(tuple(subset))
        return "c" in subset

    assert ddmin(["a", "b", "c", "d", "e", "f"], holds) == ["c"]
    assert len(calls) < 20  # it searches, it does not enumerate


def test_ddmin_keeps_a_genuinely_joint_cause() -> None:
    # Two cells that only restore the law together stay together.
    def holds(subset):
        return "b" in subset and "e" in subset

    assert ddmin(["a", "b", "c", "d", "e"], holds) == ["b", "e"]


def test_ddmin_returns_everything_when_nothing_restores_the_law() -> None:
    assert ddmin(["a", "b"], lambda subset: False) == ["a", "b"]


# --- consolidation's structural narrowing ---


def test_missing_segment_is_visible_in_the_totals_own_formula() -> None:
    declared = ("AR!AR49", "AR!AR50", "AR!AR51", "AR!AR52")
    assert missing_segments("=SUM(AR49:AR51)", declared, "AR") == ["AR!AR52"]
    assert missing_segments("=SUM(AR49:AR52)", declared, "AR") == []
    assert missing_segments("=AR49+AR50+AR51+AR52", declared, "AR") == []


def test_a_total_that_reaches_every_segment_by_range_is_clean() -> None:
    declared = tuple(f"AR!AR{row}" for row in range(22, 45))
    assert missing_segments("=SUM(AR22:AR44)", declared, "AR") == []
