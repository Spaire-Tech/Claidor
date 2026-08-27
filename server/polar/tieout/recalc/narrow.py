"""Narrowing a violated law to the one responsible cell (B4's amendment).

A violated law is a symptom, not a finding: proportionality says
« revenue did not double », and the model has four hundred cells
between the input and that revenue line. The plan's sentence is the
requirement — *delta debugging over the dependency slice between the
perturbed input and the broken output narrows it to the one
responsible cell* — because one authoring decision must produce one
finding, here as everywhere else.

Two methods, and they answer different questions:

**The frontier walk** (`frontier`) — the cheap one, no extra
recalculation. Every cell in the broken output's precedent cone is
classified against the law: under a law-perturbation a cell may
legitimately be *zeroed*, *unchanged*, or *scaled by the law's
factor*; anything else is **anomalous**. The culprit frontier is the
set of anomalous cells whose own in-cone precedents are all clean —
the shallowest place where the model stopped obeying its own law.
A hardcoded constant in a chain lands here exactly: its consumers
are anomalous only because it is.

**ddmin** (`ddmin`) — Zeller's minimizing delta debugging, with a
real oracle: pin a subset of candidate cells to the values the law
predicts for them, recalculate, and ask whether the law now holds.
It returns a **1-minimal** set: every proper subset fails to restore
the law. That is the verification the frontier walk cannot give
itself, and the reason the narrowing is an algorithm rather than an
artifact of simple plants. It costs one recalculation per test, so
it runs on registered subsamples, never on everything.

Consolidation is deliberately outside both: it is a one-run identity
(`total` vs its declared segments), there is no perturbation to walk
and pinning the total trivially « restores » it. Its narrowing is
structural — `missing_segments` compares the total's own formula
against the declared segment list, which is what an omitted segment
actually is.
"""

from collections.abc import Callable, Iterable, Mapping, Sequence
from enum import StrEnum

from openpyxl.formula.tokenizer import Token, Tokenizer

#: Same-engine tolerance: both sides come from one calculator on one
#: machine, so only float dust is forgiven (the B4 laws' constant).
RELATIVE = 1e-9
FLOOR = 1e-12


class State(StrEnum):
    """How one cell answered the perturbation."""

    ZERO = "zero"
    UNCHANGED = "unchanged"
    SCALED = "scaled"
    ANOMALOUS = "anomalous"
    #: Not comparable — missing from a run, or not a number.
    UNKNOWN = "unknown"


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= max(FLOOR, RELATIVE * max(abs(a), abs(b)))


def classify(
    baseline: float | None, perturbed: float | None, factor: float | None
) -> State:
    """One cell's answer, against the law's allowed relations.

    `factor` is the law's multiplier (2.0 for a doubling, 100.0 for
    a rescale, `None` for zero-input where the only scaled state is
    zero itself). A cell that is exactly zero after the perturbation,
    or that did not move, or that moved by exactly the factor, is
    obeying; anything else is anomalous and is why its consumers are.
    """
    if baseline is None or perturbed is None:
        return State.UNKNOWN
    if perturbed == 0.0:
        return State.ZERO
    if _close(baseline, perturbed):
        return State.UNCHANGED
    if factor is not None and _close(baseline * factor, perturbed):
        return State.SCALED
    return State.ANOMALOUS


def precedent_cone(
    cells: Mapping[str, object], root: str, limit: int = 200_000
) -> set[str]:
    """Every cell the root is computed from, transitively.

    The dependency slice the plan names. Bounded by `limit` because
    a whole-column reference in a 100k-cell model can drag most of
    the workbook in; the bound is recorded when it bites.
    """
    seen: set[str] = set()
    frontier = [root]
    while frontier and len(seen) < limit:
        ref = frontier.pop()
        cell = cells.get(ref)
        if cell is None:
            continue
        for precedent in getattr(cell, "precedents", ()) or ():
            if precedent not in seen:
                seen.add(precedent)
                frontier.append(precedent)
    return seen


def frontier(
    cells: Mapping[str, object],
    baseline_values: Mapping[str, float | str | None],
    perturbed_values: Mapping[str, float | str | None],
    output: str,
    *,
    factor: float | None,
) -> list[str]:
    """The shallowest anomalous cells in the output's precedent cone.

    A cell is a culprit candidate when it is anomalous *and* every
    one of its in-cone precedents is clean — i.e. nothing upstream
    explains it. The output itself qualifies (a constant pasted into
    the output's own formula is the commonest real defect).
    """
    cone = precedent_cone(cells, output)
    cone.add(output)

    def numeric(values: Mapping[str, float | str | None], ref: str) -> float | None:
        value = values.get(ref)
        return float(value) if isinstance(value, (int, float)) else None

    states = {
        ref: classify(
            numeric(baseline_values, ref), numeric(perturbed_values, ref), factor
        )
        for ref in cone
    }
    culprits = []
    for ref in sorted(cone):
        if states.get(ref) is not State.ANOMALOUS:
            continue
        cell = cells.get(ref)
        precedents = [p for p in (getattr(cell, "precedents", ()) or ()) if p in cone]
        if all(states.get(p) is not State.ANOMALOUS for p in precedents):
            culprits.append(ref)
    return culprits


def ddmin(
    candidates: Sequence[str], holds: Callable[[Sequence[str]], bool]
) -> list[str]:
    """Zeller's minimizing delta debugging over a candidate set.

    `holds(subset)` answers « with these cells pinned to what the law
    predicts, does the law hold again? ». Returns a 1-minimal subset:
    it restores the law and no proper subset of it does. The caller
    supplies the oracle, which in practice means one recalculation
    per call — so keep the candidate set small (the frontier's).
    """
    if not holds(candidates):
        return list(candidates)
    working = list(candidates)
    granularity = 2
    while len(working) >= 2:
        chunk = max(1, len(working) // granularity)
        chunks = [working[i : i + chunk] for i in range(0, len(working), chunk)]
        reduced = False
        for piece in chunks:
            complement = [ref for ref in working if ref not in piece]
            if complement and holds(complement):
                working = complement
                granularity = max(granularity - 1, 2)
                reduced = True
                break
        if not reduced:
            if granularity >= len(working):
                break
            granularity = min(len(working), granularity * 2)
    return working


def formula_references(formula: str) -> set[str]:
    """The cell/range operands a formula names, as written (tokenized)."""
    try:
        tokens = Tokenizer(formula).items
    except Exception:
        return set()
    return {
        token.value.replace("$", "")
        for token in tokens
        if token.type == Token.OPERAND and token.subtype == Token.RANGE
    }


def missing_segments(
    total_formula: str, declared: Iterable[str], sheet: str
) -> list[str]:
    """Declared segments the total's own formula does not reach.

    Consolidation's structural narrowing: an omitted segment is
    visible in the total's text — `SUM(AR49:AR51)` against declared
    `AR49..AR52` leaves `AR52` unreferenced, and that omission *is*
    the authoring decision. Ranges are expanded so a summed block
    counts its members.
    """
    from openpyxl.utils import get_column_letter, range_boundaries

    reached: set[str] = set()
    for operand in formula_references(total_formula):
        ref = operand.split("!")[-1]
        try:
            c1, r1, c2, r2 = range_boundaries(ref if ":" in ref else f"{ref}:{ref}")
        except Exception:
            continue
        if None in (c1, r1, c2, r2):
            continue
        for row in range(int(r1), int(r2) + 1):
            for column in range(int(c1), int(c2) + 1):
                reached.add(f"{get_column_letter(column)}{row}")
    return [
        segment
        for segment in declared
        if segment.split("!")[-1] not in reached
        and segment.split("!")[0] in (sheet, segment)
    ]
