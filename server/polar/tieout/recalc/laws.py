"""The behavioural laws (B4) — registered before any machine exists to run them.

A behavioural check perturbs a copy of the model's inputs, recalculates,
and holds the outputs to a law any sane model obeys. The laws and their
pass/fail rules are written and committed here, **before** any result
has been produced or looked at — that is the registration discipline.
No catch rate, no violation count, no « it works » exists for any of
these until a gated machine (LibreOffice ≥ 25.8 with Calc, per this
lane's log) has actually recalculated a real file, and none is claimed.

The four laws, from `swens-plan.md` B4:

- **Zero input**: volume set to 0 ⇒ revenue is exactly 0. Exactly —
  the plan's word. A model that shows £3,120 of revenue on zero volume
  has a constant pasted into its tail, which is precisely the class
  static reading cannot see.
- **Proportionality**: price ×2 ⇒ revenue ×2, within the same-engine
  tolerance (both numbers come from the same calculator on the same
  machine, so only float dust is forgiven).
- **Scale invariance**: all monetary inputs ×100 (cents for pounds) ⇒
  every ratio output unchanged.
- **Consolidation**: the segments sum to the total, within the
  same-engine tolerance — a law over one run, no perturbation at all.

A violated law is a symptom, not a finding. Narrowing it to the one
responsible cell (delta debugging over the dependency slice) comes
after the laws themselves have run on a real machine; it is named
here so its absence is a recorded gap, not an oversight.

What selects « volume », « price », « revenue », « ratio » cells is the
engine's own labelled reading (`Cell.row_label`, `column_label`) plus
per-model configuration; the laws below take the refs as given, so the
selectors can be argued about without touching the arithmetic of the
rules.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

#: Two values computed by the same engine on the same machine may
#: differ only by float dust; anything more is a violation. Registered
#: identical to the fidelity gate's plain-chain rule.
SAME_ENGINE_RELATIVE = 1e-9
SAME_ENGINE_FLOOR = 1e-12


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= max(
        SAME_ENGINE_FLOOR, SAME_ENGINE_RELATIVE * max(abs(a), abs(b))
    )


@dataclass(frozen=True)
class Violation:
    """One output cell breaking one law: the symptom, exactly stated."""

    law: str
    ref: str
    expected: float
    actual: float


def zero_input_violations(
    perturbed: Mapping[str, float], must_be_zero: Iterable[str]
) -> list[Violation]:
    """Volume went to 0; every revenue output must read exactly 0.

    Exact, per the plan — not a tolerance. A revenue formula whose
    every term is volume-driven produces IEEE zero when volume is
    zero; only a constant in the chain survives, and the constant is
    the defect.
    """
    return [
        Violation(law="zero-input", ref=ref, expected=0.0, actual=perturbed[ref])
        for ref in must_be_zero
        if ref in perturbed and perturbed[ref] != 0.0
    ]


def proportionality_violations(
    baseline: Mapping[str, float],
    perturbed: Mapping[str, float],
    factor: float,
    outputs: Iterable[str],
) -> list[Violation]:
    """Price ×`factor`; each named output must scale by exactly `factor`."""
    violations = []
    for ref in outputs:
        if ref not in baseline or ref not in perturbed:
            continue
        expected = baseline[ref] * factor
        if not _close(expected, perturbed[ref]):
            violations.append(
                Violation(
                    law="proportionality",
                    ref=ref,
                    expected=expected,
                    actual=perturbed[ref],
                )
            )
    return violations


def scale_invariance_violations(
    baseline: Mapping[str, float],
    perturbed: Mapping[str, float],
    ratios: Iterable[str],
) -> list[Violation]:
    """Inputs rescaled (cents for pounds); every ratio must not move."""
    violations = []
    for ref in ratios:
        if ref not in baseline or ref not in perturbed:
            continue
        if not _close(baseline[ref], perturbed[ref]):
            violations.append(
                Violation(
                    law="scale-invariance",
                    ref=ref,
                    expected=baseline[ref],
                    actual=perturbed[ref],
                )
            )
    return violations


def consolidation_violations(
    values: Mapping[str, float],
    totals: Mapping[str, Iterable[str]],
) -> list[Violation]:
    """Each total must equal the sum of its segments, in one single run."""
    violations = []
    for total_ref, segment_refs in totals.items():
        if total_ref not in values:
            continue
        segments = [values[ref] for ref in segment_refs if ref in values]
        expected = sum(segments)
        if not _close(expected, values[total_ref]):
            violations.append(
                Violation(
                    law="consolidation",
                    ref=total_ref,
                    expected=expected,
                    actual=values[total_ref],
                )
            )
    return violations
