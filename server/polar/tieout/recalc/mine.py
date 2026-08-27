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
