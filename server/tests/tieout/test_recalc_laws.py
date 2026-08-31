"""B4: the laws' arithmetic, on hand-built value maps.

The value maps below are worked by hand from tiny synthetic models —
no calculator, fake or real, produced them. They pin the pass/fail
arithmetic of each registered law: a clean model obeys, a model with
the planted defect class violates, and the violation names its cell.
Catch *rates* belong to the machine and do not exist yet.
"""

from polar.tieout.recalc.laws import (
    consolidation_violations,
    proportionality_violations,
    scale_invariance_violations,
    zero_input_violations,
)

# The tiny model, worked by hand:
#   revenue      = price * volume            (clean)
#   bad_revenue  = price * volume + 3120     (hardcode in the tail —
#                                             invisible to static reading)
# Baseline: price=10, volume=100.
BASELINE = {"M!Rev": 1000.0, "M!BadRev": 4120.0}
VOLUME_ZERO = {"M!Rev": 0.0, "M!BadRev": 3120.0}
PRICE_DOUBLED = {"M!Rev": 2000.0, "M!BadRev": 5120.0}


def test_zero_input_passes_the_clean_revenue() -> None:
    assert zero_input_violations(VOLUME_ZERO, ["M!Rev"]) == []


def test_zero_input_catches_the_hardcoded_tail() -> None:
    (violation,) = zero_input_violations(VOLUME_ZERO, ["M!Rev", "M!BadRev"])
    assert violation.ref == "M!BadRev"
    assert violation.expected == 0.0
    assert violation.actual == 3120.0


def test_zero_input_is_exact_not_tolerant() -> None:
    # The plan's word is « exactly 0 » — even dust violates.
    assert zero_input_violations({"M!Rev": 1e-13}, ["M!Rev"]) != []


def test_proportionality_passes_clean_and_catches_the_tail() -> None:
    assert proportionality_violations(BASELINE, PRICE_DOUBLED, 2.0, ["M!Rev"]) == []
    (violation,) = proportionality_violations(
        BASELINE, PRICE_DOUBLED, 2.0, ["M!Rev", "M!BadRev"]
    )
    assert violation.ref == "M!BadRev"
    assert violation.expected == 8240.0  # 2 × baseline
    assert violation.actual == 5120.0  # what the constant actually does


def test_proportionality_forgives_same_engine_dust() -> None:
    perturbed = {"M!Rev": 2000.0000000001}
    assert proportionality_violations(BASELINE, perturbed, 2.0, ["M!Rev"]) == []


def test_scale_invariance_catches_a_ratio_with_a_hardcoded_leg() -> None:
    # margin = profit/revenue survives cents-for-pounds; a ratio whose
    # denominator is a pasted 1000 does not.
    baseline = {"M!Margin": 0.25, "M!BadMargin": 0.25}
    rescaled = {"M!Margin": 0.25, "M!BadMargin": 25.0}
    assert scale_invariance_violations(baseline, rescaled, ["M!Margin"]) == []
    (violation,) = scale_invariance_violations(
        baseline, rescaled, ["M!Margin", "M!BadMargin"]
    )
    assert violation.ref == "M!BadMargin"


def test_consolidation_catches_the_omitted_segment() -> None:
    values = {
        "M!SegA": 100.0,
        "M!SegB": 200.0,
        "M!SegC": 50.0,
        "M!Total": 300.0,  # authored before SegC was added
        "M!GoodTotal": 350.0,
    }
    assert (
        consolidation_violations(
            values, {"M!GoodTotal": ["M!SegA", "M!SegB", "M!SegC"]}
        )
        == []
    )
    (violation,) = consolidation_violations(
        values, {"M!Total": ["M!SegA", "M!SegB", "M!SegC"]}
    )
    assert violation.ref == "M!Total"
    assert violation.expected == 350.0
    assert violation.actual == 300.0
