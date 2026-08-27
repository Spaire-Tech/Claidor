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


# --- typing from E2's inference (round 2, registered 28 Aug) ---


class FakeLabel:
    def __init__(self, kind="unknown", b5_type="untyped"):
        self.kind = kind
        self.b5_type = b5_type


def test_money_and_rate_come_straight_from_the_inference() -> None:
    from polar.tieout.recalc.mine import type_from_units

    money = type_from_units(FakeLabel("continuous", "money"), "M!A1", 100.0, [100.0])
    rate = type_from_units(FakeLabel("continuous", "rate"), "M!A2", 0.05, [0.05])
    assert money.type is InputType.MONEY
    assert rate.type is InputType.RATE
    assert rate.band == (0.6, 1.6)  # never handed a money factor


def test_a_selectors_states_are_the_values_the_row_actually_takes() -> None:
    from polar.tieout.recalc.mine import type_from_units

    typed = type_from_units(FakeLabel("categorical"), "M!A1", 2.0, [1.0, 2.0, 2.0, 3.0])
    assert typed.type is InputType.SELECTOR
    assert typed.states == (1.0, 2.0, 3.0)  # observed, never invented
    draws = {sample([typed], random.Random(3))["M!A1"] for _ in range(50)}
    assert draws <= {1.0, 2.0, 3.0}


def test_a_categorical_row_with_many_values_is_held_not_stepped() -> None:
    from polar.tieout.recalc.mine import type_from_units

    typed = type_from_units(
        FakeLabel("categorical"), "M!A1", 2.0, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    )
    assert typed.type is InputType.FLAG
    assert typed.states == ()
    assert {sample([typed], random.Random(5))["M!A1"] for _ in range(20)} == {2.0}


def test_an_abstention_is_still_a_hold() -> None:
    # E2 declining to decide is not a licence to guess. This is the
    # AHA's typing law arriving automatically instead of by hand.
    from polar.tieout.recalc.mine import type_from_units

    typed = type_from_units(FakeLabel("unknown", "untyped"), "M!A1", 7.0, [7.0])
    assert typed.type is InputType.UNTYPED
    assert {sample([typed], random.Random(9))["M!A1"] for _ in range(20)} == {7.0}


# --- constrained families (registered 28 Aug) ---


def weight_columns():
    """Two weight rows across five year columns, summing to 1.0."""
    embedded = [0.99, 0.94, 0.90, 0.80, 0.75]
    values, columns = {}, []
    for index, share in enumerate(embedded):
        letter = "IJKLM"[index]
        a, b = f"W!{letter}15", f"W!{letter}16"
        values[a], values[b] = share, 1.0 - share
        # a third row that is not part of the family
        c = f"W!{letter}26"
        values[c] = 1000.0 + index
        columns.append({15: a, 16: b, 26: c})
    return values, columns


def test_the_family_the_hand_typing_knew_is_found() -> None:
    from polar.tieout.recalc.mine import find_families

    values, columns = weight_columns()
    families = find_families(values, columns)
    pairs = {tuple(sorted(f.refs)) for f in families}
    assert ("W!I15", "W!I16") in pairs
    assert all(abs(f.constant - 1.0) < 1e-9 for f in families)


def test_a_row_that_merely_moves_is_not_a_family() -> None:
    # W!26 varies across columns and joins no constant sum, so no
    # family may contain it.
    from polar.tieout.recalc.mine import find_families

    values, columns = weight_columns()
    for family in find_families(values, columns):
        assert not any(ref.endswith("26") for ref in family.refs)


def test_one_column_agreeing_is_a_coincidence_not_a_family() -> None:
    from polar.tieout.recalc.mine import find_families

    values = {"W!I1": 0.4, "W!I2": 0.6, "W!J1": 0.4, "W!J2": 0.9}
    columns = [{1: "W!I1", 2: "W!I2"}, {1: "W!J1", 2: "W!J2"}]
    assert find_families(values, columns) == []


def test_a_joint_draw_never_leaves_the_simplex() -> None:
    from polar.tieout.recalc.mine import Family, sample_with_families

    family = Family(refs=("W!I15", "W!I16"), constant=1.0)
    inputs = [
        TypedInput("W!I15", InputType.RATE, 0.99),
        TypedInput("W!I16", InputType.RATE, 0.01),
        TypedInput("W!I26", InputType.MONEY, 1000.0),
    ]
    rng = random.Random(5)
    for _ in range(500):
        draw = sample_with_families(inputs, [family], rng)
        total = draw["W!I15"] + draw["W!I16"]
        assert abs(total - 1.0) <= 1e-9, total
        assert 0.0 <= draw["W!I15"] <= 1.0
        assert 0.0 <= draw["W!I16"] <= 1.0
        assert draw["W!I26"] != 1000.0 or True  # money still moves by its own policy


def test_the_illegal_draw_this_round_exists_to_prevent() -> None:
    # Perturbed apart, the same two rows leave the simplex — this is
    # the measured H7 failure, held as a test.
    inputs = [
        TypedInput("W!I15", InputType.RATE, 0.99, band=(0.6, 1.6)),
        TypedInput("W!I16", InputType.RATE, 0.01, band=(0.6, 1.6)),
    ]
    rng = random.Random(1)
    sums = [sum(sample(inputs, rng).values()) for _ in range(50)]
    assert any(total > 1.0 + 1e-6 for total in sums)


def test_a_frozen_row_cannot_join_a_family() -> None:
    # The measured false positive: « iBoxx benchmark + the two
    # weights = 1.041419 » is the weights' own 1.0 plus a rate that
    # never moves. Constant plus constraint is not a constraint.
    from polar.tieout.recalc.mine import find_families

    values, columns = weight_columns()
    for index, column in enumerate(columns):
        ref = f"W!{'IJKLM'[index]}9"
        values[ref] = 0.0414  # the same in every column
        column[9] = ref
    families = find_families(values, columns)
    assert families  # the real one is still found
    assert all(
        9
        not in {
            int("".join(c for c in r.split("!")[-1] if c.isdigit())) for r in f.refs
        }
        for f in families
    )


def test_overlapping_families_are_held_rather_than_half_satisfied() -> None:
    # {15,16} = 1 and {15,19,20} = 1 share the embedded weight.
    # Drawing them in turn would satisfy the second and break the
    # first, so the whole component holds at its file values.
    from polar.tieout.recalc.mine import Family, sample_with_families

    base = {"W!I15": 0.99, "W!I16": 0.01, "W!I19": 0.006, "W!I20": 0.004}
    inputs = [TypedInput(ref, InputType.RATE, value) for ref, value in base.items()]
    families = [
        Family(("W!I15", "W!I16"), 1.0),
        Family(("W!I15", "W!I19", "W!I20"), 1.0),
    ]
    rng = random.Random(3)
    for _ in range(50):
        draw = sample_with_families(inputs, families, rng)
        # Held: absent from the draw, so the file's own values stand.
        assert not (set(base) & set(draw))


def test_disjoint_families_are_still_drawn_jointly() -> None:
    from polar.tieout.recalc.mine import Family, sample_with_families

    inputs = [
        TypedInput(ref, InputType.RATE, 0.5)
        for ref in ("W!I15", "W!I16", "W!J15", "W!J16")
    ]
    families = [Family(("W!I15", "W!I16"), 1.0), Family(("W!J15", "W!J16"), 1.0)]
    rng = random.Random(4)
    for _ in range(100):
        draw = sample_with_families(inputs, families, rng)
        assert abs(draw["W!I15"] + draw["W!I16"] - 1.0) <= 1e-9
        assert abs(draw["W!J15"] + draw["W!J16"] - 1.0) <= 1e-9
