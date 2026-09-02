"""The fidelity gate's comparison rules (B2) — stored against recalculated.

The gate's question is narrow and absolute: *given this exact file,
unchanged, does our calculation engine reproduce the values Excel left
in it?* Cell by cell, formula cells only — a hardcoded input has
nothing to recalculate. No behavioural check ever runs on a file that
failed its gate, because a violated law on such a file indicts the
engine, not the model.

Two tolerance regimes, per the toolbox (`ambre-toolbox.md` §2):

- **Plain chains**: relative tolerance ~1e-9. Excel and LibreOffice
  both compute in IEEE-754 doubles, but summation order and library
  differences leave dust in the last bits; 1e-9 is nine orders of
  magnitude above honest disagreement and nine below anything a model
  would call a number.
- **Inside iterative cycles**: convergence-based. When a file enables
  iterative calculation, both engines stop when successive passes
  change by less than the file's own `calcPr` delta — so two correct
  engines legitimately land up to that delta apart. The bound is the
  file's own declared convergence threshold, never a number of ours.

Cycle membership is computed from the cells' own precedent lists
(strongly connected components), not guessed from sheet names.

The verdicts are four, and « pass » is the only one that unlocks
behavioural checks: a file with denylisted constructs is **refused**
before comparison (see `denylist`); a file whose formula cells carry
no stored values — written by a generator, never opened in Excel —
has **nothing to compare** and cannot be certified; anything else
either **passes** or **fails** with the differing cells named.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from .denylist import DenylistHit, Route

#: Relative tolerance on plain (acyclic) formula chains.
PLAIN_RELATIVE = 1e-9

#: Absolute floor under the relative rule, for values at or near zero,
#: where a relative tolerance admits nothing at all: a stored 0.0 and a
#: recalculated 1e-17 are the same number in any model on earth.
ABSOLUTE_FLOOR = 1e-12

#: Excel's default iteration delta when a file turns iteration on
#: without stating one (ECMA-376 `calcPr@iterateDelta`).
EXCEL_ITERATE_DELTA = 0.001


@dataclass(frozen=True)
class CalcSettings:
    """The file's own `calcPr` — pushed into the engine, and into the gate.

    The toolbox's hard-won rule: the engine must be given the file's
    iteration settings explicitly, not trusted to import them. The gate
    needs the same numbers to know which tolerance regime a cycle cell
    lives under.
    """

    iterative: bool = False
    iterate_count: int = 100
    iterate_delta: float = EXCEL_ITERATE_DELTA


def read_calc_settings(path: str) -> CalcSettings:
    """Read `calcPr` from an xlsx the same way the driver will push it."""
    from openpyxl import load_workbook

    book = load_workbook(path, read_only=True)
    try:
        calc = book.calculation
        if calc is None or not calc.iterate:
            return CalcSettings()
        return CalcSettings(
            iterative=True,
            iterate_count=calc.iterateCount if calc.iterateCount is not None else 100,
            iterate_delta=(
                calc.iterateDelta
                if calc.iterateDelta is not None
                else EXCEL_ITERATE_DELTA
            ),
        )
    finally:
        book.close()


def iterative_cells(precedents: Mapping[str, Iterable[str]]) -> frozenset[str]:
    """The refs that live inside a calculation cycle.

    Strongly connected components of the precedent graph, keeping
    components of two or more cells and genuine self-loops (`A1`
    referring to `A1`). Explicit-stack Tarjan — a 100k-cell model
    would blow the recursion limit long before it strained this loop.
    Edges pointing outside the mapping (a precedent that is not itself
    a formula cell) cannot close a cycle and are dropped.
    """
    graph = {
        node: [p for p in edges if p in precedents]
        for node, edges in precedents.items()
    }
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    counter = 0
    cyclic: set[str] = set()

    for root in graph:
        if root in index:
            continue
        work: list[tuple[str, int]] = [(root, 0)]
        while work:
            node, edge_i = work[-1]
            if edge_i == 0:
                index[node] = low[node] = counter
                counter += 1
                stack.append(node)
                on_stack.add(node)
            edges = graph[node]
            recursed = False
            while edge_i < len(edges):
                successor = edges[edge_i]
                edge_i += 1
                if successor not in index:
                    work[-1] = (node, edge_i)
                    work.append((successor, 0))
                    recursed = True
                    break
                if successor in on_stack:
                    low[node] = min(low[node], index[successor])
            if recursed:
                continue
            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
            if low[node] == index[node]:
                component: list[str] = []
                while True:
                    member = stack.pop()
                    on_stack.discard(member)
                    component.append(member)
                    if member == node:
                        break
                if len(component) > 1:
                    cyclic.update(component)
                elif node in graph[node]:
                    cyclic.add(node)
    return frozenset(cyclic)


def tolerance_for(
    stored: float, computed: float, *, in_cycle: bool, settings: CalcSettings
) -> float:
    """The permitted absolute difference for one cell."""
    plain = max(ABSOLUTE_FLOOR, PLAIN_RELATIVE * max(abs(stored), abs(computed)))
    if in_cycle and settings.iterative:
        return max(plain, settings.iterate_delta)
    return plain


@dataclass(frozen=True)
class CellDiff:
    """One cell the engine did not reproduce."""

    ref: str
    stored: Decimal | None
    computed: float | str | None
    #: The absolute difference that would have been allowed, when both
    #: sides were numbers; None when the mismatch is of kind (a number
    #: against an error, a value against nothing).
    tolerance: float | None


@dataclass
class FileFidelity:
    """The gate's answer for one file. Verdict, then the arithmetic behind it."""

    #: Formula cells with a stored value the engine also computed.
    compared: int = 0
    matched: int = 0
    mismatches: list[CellDiff] = field(default_factory=list)
    #: Formula cells with no stored value — a generator wrote the file
    #: and Excel never computed it; there is nothing to compare against.
    no_stored_value: list[str] = field(default_factory=list)
    #: Formula cells the engine returned nothing for. The engine's
    #: failure, not the file's — a gate cannot pass around a hole.
    not_computed: list[str] = field(default_factory=list)
    #: Cells where the engine produced an error against a stored
    #: number — the engine's measured inability on this construct
    #: (e.g. OFFSET with negative width, probed 26 Aug), never the
    #: model's defect. Counted in `compared`, fails the gate, and
    #: marks the file an arbiter candidate.
    engine_errors: list[CellDiff] = field(default_factory=list)
    #: Denylist hits that refused the file before any comparison.
    refusals: list[DenylistHit] = field(default_factory=list)
    #: Where a refused file goes: the arbiter, or an honest no.
    route: Route | None = None
    #: Formula cells calling TODAY/NOW/RAND-class functions — their
    #: stored value is the authoring moment's, so disagreement is not
    #: fidelity loss (the registered volatile rules, 26 Aug).
    volatile_roots: list[str] = field(default_factory=list)
    #: Size of the excluded cone: the roots plus every formula cell
    #: downstream of one. Reported, never counted as compared.
    volatile_cone: int = 0
    #: Every engine asked about this file, in order, with its verdict —
    #: the native engines run first behind this same gate, and the
    #: mark must be able to say who was asked and who was believed.
    attempts: list[dict[str, Any]] = field(default_factory=list)

    @property
    def verdict(self) -> str:
        if self.refusals:
            return "refused"
        if self.mismatches or self.engine_errors or self.not_computed:
            return "fail"
        if self.compared == 0:
            return "nothing-compared"
        return "pass"

    @property
    def match_rate(self) -> float | None:
        if self.compared == 0:
            return None
        return self.matched / self.compared


def _numeric(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    return None


def gate_file(
    cells: Mapping[str, object],
    computed: Mapping[str, float | str | None],
    *,
    settings: CalcSettings | None = None,
    refusals: Iterable[DenylistHit] = (),
    route: Route | None = None,
) -> FileFidelity:
    """Diff a file's stored values against a recalculation of it, unchanged.

    `cells` is the frozen reader surface — `Workbook.cells`, ref to
    `Cell` (only `.formula`, `.value` and `.precedents` are read, so
    synthetic fixtures qualify by carrying those three). `computed` is
    the engine's answer, ref to value, from a `RecalcResult`. A
    non-empty `refusals` short-circuits: the file was never eligible.
    """
    settings = settings or CalcSettings()
    report = FileFidelity(refusals=list(refusals), route=route)
    if report.refusals:
        return report

    from .volatile import volatile_cone

    roots, cone = volatile_cone(cells)
    report.volatile_roots = sorted(roots)
    report.volatile_cone = len(cone)

    formula_cells = {
        ref: cell
        for ref, cell in cells.items()
        if getattr(cell, "formula", None) is not None
    }
    in_cycle = iterative_cells(
        {
            ref: tuple(getattr(cell, "precedents", ()) or ())
            for ref, cell in formula_cells.items()
        }
    )

    for ref, cell in formula_cells.items():
        if ref in cone:
            continue
        stored = getattr(cell, "value", None)
        if stored is None:
            report.no_stored_value.append(ref)
            continue
        if ref not in computed:
            report.not_computed.append(ref)
            continue
        result = computed[ref]
        report.compared += 1
        stored_n = _numeric(stored)
        result_n = _numeric(result)
        if stored_n is None or result_n is None:
            # A number against an error string, a None, a boolean —
            # equality of kind and spelling is the only honest test.
            if str(stored) == str(result):
                report.matched += 1
            elif (
                stored_n is not None
                and isinstance(result, str)
                and result.startswith("#ERR")
            ):
                # The engine erred where Excel stored a number: the
                # engine's inability, its own bucket, arbiter's case.
                report.engine_errors.append(
                    CellDiff(ref=ref, stored=stored, computed=result, tolerance=None)
                )
            else:
                report.mismatches.append(
                    CellDiff(ref=ref, stored=stored, computed=result, tolerance=None)
                )
            continue
        allowed = tolerance_for(
            stored_n, result_n, in_cycle=ref in in_cycle, settings=settings
        )
        if abs(stored_n - result_n) <= allowed:
            report.matched += 1
        else:
            report.mismatches.append(
                CellDiff(ref=ref, stored=stored, computed=result, tolerance=allowed)
            )
    return report
