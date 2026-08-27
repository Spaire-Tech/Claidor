"""B5 — mining a model's own laws from its behaviour under perturbation.

Clean-room: this derives from `swens-plan.md` B5, `swens-aha.md`,
and standard published mathematics. The ICSME 2019 reference
implementation is LGPL-3.0; it has not been read and will not be.

The idea in one line: **run the model many times under typed input
perturbations and keep the equations that never stop holding.**
Those equations are the model's own accounting laws — nobody wrote
them down, and the model obeys them anyway. A law that held at v8
and breaks at v12 is a behavioural change stated in review language
(that is C6's use), and a law broken inside one version is a defect
with an explanation attached (that is B6's).

What lives here is everything that does not need the calculator:
the **input typing policy** (`InputType`, `sample`), the **candidate
search** over run matrices (`mine_signed_sums`, the pure-Python
baseline PSLQ must beat), and the **cleansing and stability** rules
(`cleanse`, `stable_rules`). The runner that drives LibreOffice is
`scripts/recalc_mine.py`.

The registered discipline this module enforces, and why:

- **Flags are held, selectors are stepped, nothing categorical is
  scaled.** The AHA's first law, paid for by a confident false rule
  mined from a model running in a mode it never occupies.
- **Constant columns are not laws.** A relation among cells that
  never moved across the runs is arithmetic about frozen numbers.
- **A rule counts only if two independent minings both find it.**
"""

import random
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import StrEnum
from itertools import combinations
from typing import Any

#: Same-engine tolerance, as everywhere in this lane.
RELATIVE = 1e-9
FLOOR = 1e-12

#: A relation is only interesting if its terms actually vary; this
#: is the relative spread below which a cell counts as frozen.
FROZEN_SPREAD = 1e-12


class InputType(StrEnum):
    """How an input may be perturbed. The typing is the engineering."""

    MONEY = "money"
    RATE = "rate"
    COUNT = "count"
    #: Held or stepped through real states — never scaled.
    FLAG = "flag"
    SELECTOR = "selector"
    DATE = "date"
    #: Type undecided: never perturbed, recorded as a gap.
    UNTYPED = "untyped"


@dataclass(frozen=True)
class TypedInput:
    """One input cell, its type, and the states it may legally take."""

    ref: str
    type: InputType
    base: float
    #: For FLAG/SELECTOR: the real states to step through. Empty
    #: means « hold at base ».
    states: tuple[float, ...] = ()
    #: For MONEY/COUNT/RATE: the multiplicative band sampled within.
    band: tuple[float, float] = (0.5, 2.0)


#: How many distinct values a categorical row may take and still be
#: a selector whose states B5 will step through. Above it the row is
#: held: a categorical row with many values is not a selector this
#: lane understands, and stepping it would run the model in states
#: it may never occupy.
SELECTOR_STATES = 4


def type_from_units(
    label: Any, ref: str, value: float, row_values: Sequence[float]
) -> TypedInput:
    """One input cell, typed from E2's inference rather than by hand.

    The map is registered in the lane log (28 Aug, B5 round 2), and
    the two load-bearing rules are the AHA's: a selector's states are
    **the values the row actually takes in the file**, never
    invented; and an abstention (`unknown`) is still a hold, because
    E2 declining to decide is not a licence to guess.
    """
    b5_type = getattr(label, "b5_type", "untyped")
    kind = getattr(label, "kind", "unknown")
    if b5_type == "money":
        return TypedInput(ref, InputType.MONEY, value)
    if b5_type == "rate":
        return TypedInput(ref, InputType.RATE, value, band=(0.6, 1.6))
    if b5_type == "date":
        return TypedInput(ref, InputType.DATE, value)
    if kind == "categorical":
        states = sorted(set(row_values))
        if 0 < len(states) <= SELECTOR_STATES:
            return TypedInput(
                ref, InputType.SELECTOR, value, states=tuple(float(s) for s in states)
            )
        return TypedInput(ref, InputType.FLAG, value)
    return TypedInput(ref, InputType.UNTYPED, value)


@dataclass(frozen=True)
class Family:
    """Inputs that sum to a constant the model never lets them leave.

    « Weight on embedded debt » plus « weight on new debt » is 1.0 in
    every year of the H7 file. Perturbed apart, one draw gave
    1.1333 + 0.0058 — a capital structure that cannot exist — and a
    law that holds only on the simplex is then broken in every run
    and can never be found. So a family is drawn as **one object**.
    """

    refs: tuple[str, ...]
    constant: float

    def draw(self, base: Mapping[str, float], rng: random.Random) -> dict[str, float]:
        """One point on the family's own simplex, its constant exact.

        Shares are drawn from an exponential and normalised — the
        standard uniform draw on a simplex — then scaled to the
        family's constant. The last member takes the remainder so the
        sum is exact rather than nearly exact.
        """
        weights = [rng.expovariate(1.0) or 1e-12 for _ in self.refs]
        total = sum(weights)
        drawn: dict[str, float] = {}
        running = 0.0
        for ref, weight in zip(self.refs[:-1], weights[:-1], strict=True):
            share = self.constant * weight / total
            drawn[ref] = share
            running += share
        drawn[self.refs[-1]] = self.constant - running
        return drawn


def find_families(
    values: Mapping[str, float],
    columns: Sequence[Mapping[int, str]],
    *,
    max_size: int = 3,
    min_columns: int = 2,
) -> list[Family]:
    """Sets of rows that sum to the same constant in every column.

    `columns` is one `{row: ref}` map per period column of the sheet.
    A candidate is a set of **rows**, tested in every column that
    holds all of them; it counts only if at least `min_columns`
    columns have it and the sum is the same constant in all of them.
    One column agreeing is a coincidence, which is the same
    anti-coincidence rule the mining uses on rules.

    A member that never moves across the columns is excluded: a
    frozen row joins any family for free and says nothing about the
    model, exactly as a frozen cell may not enter a rule.

    Rows are the unit, not positions: the H7 sheet's columns hold
    different row sets — `G` carries two scattered inputs, the year
    columns carry the weights — and lining them up by position found
    nothing at all.
    """
    present: dict[int, list[float]] = {}
    for column in columns:
        for row, ref in column.items():
            if ref in values:
                present.setdefault(row, []).append(values[ref])
    # A row that holds the same number in every column can join any
    # family without changing whether the sum is constant. Measured:
    # the first version reported « iBoxx benchmark + the two weights
    # = 1.041419 », which is the weights' own 1.0 plus a frozen rate,
    # and « iBoxx + historic RPI = 0.068705 », two frozen rows added
    # together. Both are arithmetic about constants — the same
    # triviality `varying()` keeps out of the rules, now kept out of
    # the families (lane log, 28 Aug).
    candidates = sorted(
        row
        for row, seen in present.items()
        if len(seen) >= min_columns
        and (max(seen) - min(seen)) / (max(abs(v) for v in seen) or 1.0) > FROZEN_SPREAD
    )
    found: list[Family] = []
    for size in range(2, max_size + 1):
        for rows in combinations(candidates, size):
            sums: list[float] = []
            members: list[tuple[str, ...]] = []
            for column in columns:
                refs = tuple(column.get(row, "") for row in rows)
                if any(not ref or ref not in values for ref in refs):
                    continue
                sums.append(sum(values[ref] for ref in refs))
                members.append(refs)
            if len(sums) < min_columns:
                continue
            constant = sums[0]
            if abs(constant) <= FLOOR:
                continue
            if any(
                abs(total - constant) > max(FLOOR, RELATIVE * abs(constant))
                for total in sums
            ):
                continue
            found.extend(Family(refs=refs, constant=constant) for refs in members)
    return found


def components(families: Sequence[Family]) -> list[list[Family]]:
    """Families grouped by the cells they share.

    Two families that share a cell are one constraint system: drawing
    them one after the other would satisfy the second and break the
    first. On `h7-fds` both `{embedded, new} = 1` and
    `{embedded, new fixed, new index-linked} = 1` contain the
    embedded weight, which is exactly this case.
    """
    parent: dict[str, str] = {}

    def find(ref: str) -> str:
        while parent.setdefault(ref, ref) != ref:
            parent[ref] = parent[parent[ref]]
            ref = parent[ref]
        return ref

    for family in families:
        first = family.refs[0]
        for ref in family.refs[1:]:
            parent[find(ref)] = find(first)
    grouped: dict[str, list[Family]] = {}
    for family in families:
        grouped.setdefault(find(family.refs[0]), []).append(family)
    return list(grouped.values())


def sample_with_families(
    inputs: Sequence[TypedInput],
    families: Sequence[Family],
    rng: random.Random,
) -> dict[str, float]:
    """A draw in which every constrained family stays on its simplex.

    A component holding **one** family is drawn jointly on that
    family's simplex. A component holding several — overlapping
    constraints — is **held at its file values entirely**: satisfying
    one and breaking another is the failure this round exists to
    prevent, and a polytope sampler for the general case is a later
    round, registered when it comes. Holding costs coverage on those
    rows and costs no legality, which is the right way round.

    Everything else follows its own type's policy, exactly as before.
    """
    joint: list[Family] = []
    held: set[str] = set()
    for component in components(families):
        if len(component) == 1:
            joint.append(component[0])
        else:
            held.update(ref for family in component for ref in family.refs)
    constrained = {ref for family in joint for ref in family.refs} | held
    draw = sample([typed for typed in inputs if typed.ref not in constrained], rng)
    for family in joint:
        draw.update(family.draw(draw, rng))
    return draw


def sample(inputs: Sequence[TypedInput], rng: random.Random) -> dict[str, float]:
    """One perturbation draw, obeying every type's policy.

    Money and counts move multiplicatively inside their band (counts
    stay integral); rates move inside their own band and are never
    handed a money factor; flags and selectors take one of their
    declared states, or hold; dates and untyped inputs hold.
    """
    draw: dict[str, float] = {}
    for typed in inputs:
        if typed.type in (InputType.FLAG, InputType.SELECTOR):
            draw[typed.ref] = rng.choice(typed.states) if typed.states else typed.base
        elif typed.type in (InputType.MONEY, InputType.RATE, InputType.COUNT):
            low, high = typed.band
            value = typed.base * rng.uniform(low, high)
            draw[typed.ref] = round(value) if typed.type is InputType.COUNT else value
        else:
            draw[typed.ref] = typed.base
    return draw


@dataclass(frozen=True)
class Rule:
    """One mined law: a signed sum over cells that never left zero.

    `terms` pairs a cell with its coefficient (+1 or −1 in round
    one). The rule reads « these added, those subtracted, come to
    nothing » — which is what an accounting identity is.
    """

    terms: tuple[tuple[str, int], ...]

    @property
    def refs(self) -> frozenset[str]:
        return frozenset(ref for ref, _ in self.terms)

    def residual(self, values: Mapping[str, float]) -> float | None:
        total = 0.0
        for ref, coefficient in self.terms:
            value = values.get(ref)
            if value is None:
                return None
            total += coefficient * value
        return total

    def holds(self, values: Mapping[str, float]) -> bool:
        residual = self.residual(values)
        if residual is None:
            return False
        scale = max((abs(values[ref]) for ref, _ in self.terms), default=0.0)
        return abs(residual) <= max(FLOOR, RELATIVE * scale)

    def render(self, name: Mapping[str, str] | None = None) -> str:
        """The rule in the model's own words, when labels are known."""
        parts = []
        for i, (ref, coefficient) in enumerate(self.terms):
            label = (name or {}).get(ref, ref)
            sign = "−" if coefficient < 0 else ("+" if i else "")
            parts.append(f"{sign} {label}".strip())
        return " ".join(parts) + " = 0"


def varying(runs: Sequence[Mapping[str, float]], refs: Sequence[str]) -> list[str]:
    """Cells that actually moved across the runs.

    A relation among frozen cells is arithmetic about constants, not
    a law of the model — the registered triviality rule.
    """
    moved = []
    for ref in refs:
        values = [run[ref] for run in runs if ref in run]
        if len(values) < len(runs):
            continue
        spread = max(values) - min(values)
        scale = max(abs(v) for v in values) or 1.0
        if spread / scale > FROZEN_SPREAD:
            moved.append(ref)
    return moved


def coverage(
    runs: Sequence[Mapping[str, float]], refs: Sequence[str]
) -> tuple[int, int]:
    """(cells that moved, cells watched) — the number that gates a round.

    Round 1b's lesson, measured: a rule set is an artifact of which
    inputs were allowed to move. On a model where the typing reached
    10 of 193 watched cells, « no laws found » says nothing about the
    model and everything about the perturbation. Coverage is
    therefore reported beside every rule set, and a round with low
    coverage is **reported as uninformative rather than as a
    result**.
    """
    return len(varying(runs, refs)), len(refs)


def mine_signed_sums(
    runs: Sequence[Mapping[str, float]],
    refs: Sequence[str],
    *,
    max_terms: int = 3,
) -> list[Rule]:
    """The pure-Python baseline: enumerate small signed sums that hold.

    Every subset up to `max_terms`, every sign assignment (fixing the
    first coefficient at +1 so a rule and its negation are one rule),
    kept when the sum stays at zero across **every** run. This is
    the engine PSLQ must beat on the same runs — deliberately
    unclever, so the comparison means something.
    """
    candidates = varying(runs, refs)
    found: list[Rule] = []
    for size in range(2, max_terms + 1):
        for subset in combinations(candidates, size):
            for signs in _sign_assignments(size):
                rule = Rule(terms=tuple(zip(subset, signs, strict=True)))
                if all(rule.holds(run) for run in runs):
                    found.append(rule)
                    break  # one sign pattern per subset is enough
    return found


def _sign_assignments(size: int) -> list[tuple[int, ...]]:
    assignments = []
    for mask in range(1 << (size - 1)):
        signs = [1]
        for bit in range(size - 1):
            signs.append(-1 if (mask >> bit) & 1 else 1)
        assignments.append(tuple(signs))
    return assignments


@dataclass(frozen=True)
class RatioRule:
    """« This is always the same multiple of that. »

    Signed sums cannot express a rate model's laws: « the index-linked
    share is always 30% of new debt » is a proportion, not a
    cancellation. A ratio rule holds when `numerator = k ×
    denominator` in every kept run, with one `k` for all of them.
    """

    numerator: str
    denominator: str
    k: float

    @property
    def refs(self) -> frozenset[str]:
        return frozenset({self.numerator, self.denominator})

    def holds(self, values: Mapping[str, float]) -> bool:
        top, bottom = values.get(self.numerator), values.get(self.denominator)
        if top is None or bottom is None or bottom == 0.0:
            return False
        return abs(top - self.k * bottom) <= max(FLOOR, RELATIVE * abs(top))

    def render(self, name: Mapping[str, str] | None = None) -> str:
        labels = name or {}
        top = labels.get(self.numerator, self.numerator)
        bottom = labels.get(self.denominator, self.denominator)
        if abs(self.k - 1.0) <= RELATIVE:
            return f"{top} = {bottom}"
        return f"{top} = {self.k:.10g} × {bottom}"


def mine_ratios(
    runs: Sequence[Mapping[str, float]], refs: Sequence[str]
) -> list[RatioRule]:
    """Pairs whose ratio never moves — the rate model's law shape.

    The ratio is taken from the first run and then **tested against
    every other run**, so a pair that merely happened to line up once
    is discarded. Pairs that are equal (k = 1) are kept: « these two
    are always the same number » is a real law, and often the
    interesting one.
    """
    candidates = varying(runs, refs)
    if not runs:
        return []
    found: list[RatioRule] = []
    first = runs[0]
    for numerator in candidates:
        for denominator in candidates:
            if numerator >= denominator:
                continue
            bottom = first.get(denominator)
            top = first.get(numerator)
            if not bottom or top is None:
                continue
            k = top / bottom
            if k == 0.0:
                continue
            rule = RatioRule(numerator, denominator, k)
            if all(rule.holds(run) for run in runs):
                found.append(rule)
    return found


def cleanse(rules: Sequence[Rule]) -> list[Rule]:
    """Drop duplicates and rules subsumed by a smaller one.

    A four-term identity whose cells are already covered by a
    three-term one says nothing new; the smaller rule is the law and
    the larger is its shadow.
    """
    unique: dict[frozenset[tuple[str, int]], Rule] = {}
    for rule in rules:
        unique.setdefault(frozenset(rule.terms), rule)
    ordered = sorted(unique.values(), key=lambda rule: (len(rule.terms), rule.terms))
    kept: list[Rule] = []
    for rule in ordered:
        if any(smaller.refs < rule.refs for smaller in kept):
            continue
        kept.append(rule)
    return kept


def stable_rules(first: Sequence[Rule], second: Sequence[Rule]) -> list[Rule]:
    """Rules two independent minings both found — the plan's DONE.

    A rule that appears in one sampling and not the other was luck,
    and luck is not a law.
    """
    other = {frozenset(rule.terms) for rule in second}
    return [rule for rule in first if frozenset(rule.terms) in other]


def agreement(first: Sequence[Rule], second: Sequence[Rule]) -> float:
    """How much two minings agreed, as a Jaccard index (0 when empty)."""
    a = {frozenset(rule.terms) for rule in first}
    b = {frozenset(rule.terms) for rule in second}
    if not a and not b:
        return 0.0
    return len(a & b) / len(a | b)
