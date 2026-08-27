"""B5's mining, on a synthetic model whose laws are known in advance.

The fixture is a hand-built accounting model: revenue less costs is
profit, segments sum to a total, and a margin is a ratio. Its laws
are written down here, so the mining can be judged against truth
rather than against its own output. Nothing here touches the
calculator; the machine rounds are the runner's.
"""

import random

from polar.tieout.recalc.mine import (
    InputType,
    Rule,
    TypedInput,
    agreement,
    cleanse,
    mine_signed_sums,
    sample,
    stable_rules,
    varying,
)

# The model, worked by hand:
#   rev  = price * volume
#   cost = unit_cost * volume
#   prof = rev - cost                   ← a law: prof - rev + cost = 0
#   segA + segB = total                 ← a law: total - segA - segB = 0
#   margin = prof / rev                 (a ratio; no signed-sum law)
#   frozen = 1000 (never moves)         (constant: must not enter a law)


def run_model(price: float, volume: float, unit_cost: float, split: float) -> dict:
    rev = price * volume
    cost = unit_cost * volume
    prof = rev - cost
    seg_a = rev * split
    seg_b = rev - seg_a
    return {
        "M!REV": rev,
        "M!COST": cost,
        "M!PROF": prof,
        "M!SEGA": seg_a,
        "M!SEGB": seg_b,
        "M!TOTAL": seg_a + seg_b,
        "M!MARGIN": prof / rev,
        "M!FROZEN": 1000.0,
    }


def make_runs(count: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    return [
        run_model(
            price=rng.uniform(5, 50),
            volume=rng.uniform(10, 500),
            unit_cost=rng.uniform(1, 20),
            split=rng.uniform(0.1, 0.9),
        )
        for _ in range(count)
    ]


REFS = [
    "M!REV",
    "M!COST",
    "M!PROF",
    "M!SEGA",
    "M!SEGB",
    "M!TOTAL",
    "M!MARGIN",
    "M!FROZEN",
]


# --- the typing policy ---


def test_flags_are_held_and_selectors_stepped_never_scaled() -> None:
    rng = random.Random(7)
    inputs = [
        TypedInput("M!FLAG", InputType.FLAG, base=1.0, states=(0.0, 1.0)),
        TypedInput("M!MODE", InputType.SELECTOR, base=2.0, states=(1.0, 2.0, 3.0)),
        TypedInput("M!HELD", InputType.FLAG, base=1.0),
        TypedInput("M!DATE", InputType.DATE, base=45000.0),
        TypedInput("M!GUESS", InputType.UNTYPED, base=3.0),
    ]
    draws = [sample(inputs, rng) for _ in range(50)]
    assert {d["M!FLAG"] for d in draws} <= {0.0, 1.0}
    assert {d["M!MODE"] for d in draws} <= {1.0, 2.0, 3.0}
    # No states declared, and non-perturbable types, hold at base.
    assert {d["M!HELD"] for d in draws} == {1.0}
    assert {d["M!DATE"] for d in draws} == {45000.0}
    assert {d["M!GUESS"] for d in draws} == {3.0}


def test_money_moves_in_band_and_counts_stay_integral() -> None:
    rng = random.Random(11)
    inputs = [
        TypedInput("M!CASH", InputType.MONEY, base=100.0, band=(0.5, 2.0)),
        TypedInput("M!UNITS", InputType.COUNT, base=40.0, band=(0.5, 2.0)),
    ]
    draws = [sample(inputs, rng) for _ in range(100)]
    assert all(50.0 <= d["M!CASH"] <= 200.0 for d in draws)
    assert all(float(d["M!UNITS"]).is_integer() for d in draws)
    assert len({d["M!CASH"] for d in draws}) > 50  # it really varies


# --- the candidate search ---


def test_mining_finds_the_models_own_laws() -> None:
    rules = cleanse(mine_signed_sums(make_runs(40, seed=1), REFS))
    found = {frozenset(rule.refs) for rule in rules}
    assert frozenset({"M!PROF", "M!REV", "M!COST"}) in found
    assert frozenset({"M!TOTAL", "M!SEGA", "M!SEGB"}) in found


def test_the_ratio_is_not_mined_as_a_signed_sum() -> None:
    # A margin is a real relation but not an additive one; round 1
    # must not pretend otherwise.
    rules = cleanse(mine_signed_sums(make_runs(40, seed=2), REFS))
    assert all("M!MARGIN" not in rule.refs for rule in rules)


def test_a_frozen_cell_never_enters_a_law() -> None:
    runs = make_runs(30, seed=3)
    assert "M!FROZEN" not in varying(runs, REFS)
    rules = mine_signed_sums(runs, REFS)
    assert all("M!FROZEN" not in rule.refs for rule in rules)


def test_every_mined_rule_holds_on_runs_it_never_saw() -> None:
    # The real anti-coincidence test: mine on one sample, check on
    # another. A rule that was luck fails here.
    mined = cleanse(mine_signed_sums(make_runs(40, seed=4), REFS))
    held_out = make_runs(25, seed=99)
    assert mined  # it found something to check
    for rule in mined:
        assert all(rule.holds(run) for run in held_out), rule.render()


def test_thin_evidence_admits_a_coincidence_that_more_runs_kill() -> None:
    # Two cells that happen to agree in a single run are not a law,
    # and the mining must stop believing it once the runs disagree.
    coincidence = [{"M!A1": 5.0, "M!B1": 5.0}, {"M!A1": 7.0, "M!B1": 9.0}]
    assert mine_signed_sums(coincidence[:1], ["M!A1", "M!B1"]) == []  # frozen: no law
    assert cleanse(mine_signed_sums(coincidence, ["M!A1", "M!B1"])) == []


# --- cleansing and stability ---


def test_subsumed_rules_are_dropped() -> None:
    small = Rule((("M!A1", 1), ("M!B1", -1)))
    shadow = Rule((("M!A1", 1), ("M!B1", -1), ("M!C1", 1)))
    kept = cleanse([shadow, small])
    assert kept == [small]


def test_stability_keeps_only_what_two_minings_both_found() -> None:
    first = cleanse(mine_signed_sums(make_runs(40, seed=5), REFS))
    second = cleanse(mine_signed_sums(make_runs(40, seed=6), REFS))
    stable = stable_rules(first, second)
    assert {frozenset(rule.refs) for rule in stable} >= {
        frozenset({"M!PROF", "M!REV", "M!COST"}),
        frozenset({"M!TOTAL", "M!SEGA", "M!SEGB"}),
    }
    assert agreement(first, second) > 0.5


def test_a_rule_reads_as_a_sentence() -> None:
    rule = Rule((("M!PROF", 1), ("M!REV", -1), ("M!COST", 1)))
    assert (
        rule.render({"M!PROF": "Profit", "M!REV": "Revenue", "M!COST": "Cost"})
        == "Profit − Revenue + Cost = 0"
    )


# --- the ratio family (registered before round 1b) ---


def test_ratio_rules_find_a_constant_proportion() -> None:
    from polar.tieout.recalc.mine import mine_ratios

    runs = make_runs(40, seed=21)
    rules = mine_ratios(runs, REFS)
    pairs = {(r.numerator, r.denominator, round(r.k, 9)) for r in rules}
    # REV and TOTAL are the same number in this model: k = 1.
    assert ("M!REV", "M!TOTAL", 1.0) in pairs


def test_a_ratio_that_only_held_once_is_discarded() -> None:
    from polar.tieout.recalc.mine import mine_ratios

    coincidence = [
        {"M!A1": 10.0, "M!B1": 5.0},
        {"M!A1": 11.0, "M!B1": 7.0},
        {"M!A1": 12.0, "M!B1": 3.0},
    ]
    assert mine_ratios(coincidence, ["M!A1", "M!B1"]) == []


def test_a_ratio_rule_reads_as_a_sentence() -> None:
    from polar.tieout.recalc.mine import RatioRule

    assert (
        RatioRule("M!A1", "M!B1", 0.3).render(
            {"M!A1": "Index-linked debt", "M!B1": "New debt"}
        )
        == "Index-linked debt = 0.3 × New debt"
    )
    assert (
        RatioRule("M!A1", "M!B1", 1.0).render({"M!A1": "Revenue", "M!B1": "Total"})
        == "Revenue = Total"
    )


def test_coverage_counts_what_the_perturbation_actually_reached() -> None:
    from polar.tieout.recalc.mine import coverage

    runs = make_runs(20, seed=31)
    frozen_only = [{"M!FROZEN": r["M!FROZEN"]} for r in runs]
    assert coverage(runs, REFS) == (7, 8)  # everything but M!FROZEN moved
    assert coverage(frozen_only, ["M!FROZEN"]) == (0, 1)
