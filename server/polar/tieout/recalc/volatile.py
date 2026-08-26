"""Volatile functions and their cone (the registered rules round, 26 Aug).

A stored `TODAY()` result is the authoring day's; a recalculation's
is today's. Both are right, so their disagreement is **not fidelity
loss** — and it is not silently dropped either: the gate reports the
volatile cone as its own bucket, roots named, and excludes it from
the match arithmetic. A mismatch outside the cone fails a file
exactly as before.

The volatile set is the ordered one — TODAY, NOW, RAND, RANDBETWEEN,
RANDARRAY — time- and randomness-dependent *values*. Excel's wider
recalc-scheduling volatility (OFFSET, INDIRECT) does not belong here:
those functions' values are stable given stable inputs.

Detection is tokenized, like the denylist — a sheet named
« Today's run » must never trip it. The cone is closed over the
reader's own precedent lists: a root, plus every formula cell whose
precedent chain reaches one.
"""

from collections.abc import Mapping

from openpyxl.formula.tokenizer import Token, Tokenizer

from .denylist import _canonical

VOLATILE_FUNCTIONS = frozenset({"TODAY", "NOW", "RAND", "RANDBETWEEN", "RANDARRAY"})


def is_volatile(formula: str) -> bool:
    """Does this formula call a volatile function, per the tokenizer?"""
    try:
        tokens = Tokenizer(formula).items
    except Exception:
        return False
    return any(
        token.type == Token.FUNC
        and token.subtype == Token.OPEN
        and _canonical(token.value) in VOLATILE_FUNCTIONS
        for token in tokens
    )


def volatile_cone(cells: Mapping[str, object]) -> tuple[frozenset[str], frozenset[str]]:
    """(roots, cone) over the frozen reader surface.

    Roots: formula cells calling a volatile function. Cone: roots plus
    every formula cell reaching a root through `precedents` —
    computed by inverting the precedent edges and walking dependents.
    """
    formulas = {
        ref: cell
        for ref, cell in cells.items()
        if getattr(cell, "formula", None) is not None
    }
    roots = frozenset(
        ref
        for ref, cell in formulas.items()
        if is_volatile(cell.formula)  # type: ignore[attr-defined]
    )
    if not roots:
        return roots, roots
    dependents: dict[str, list[str]] = {}
    for ref, cell in formulas.items():
        for precedent in getattr(cell, "precedents", ()) or ():
            dependents.setdefault(precedent, []).append(ref)
    cone = set(roots)
    frontier = list(roots)
    while frontier:
        node = frontier.pop()
        for dependent in dependents.get(node, ()):
            if dependent not in cone:
                cone.add(dependent)
                frontier.append(dependent)
    return roots, frozenset(cone)
