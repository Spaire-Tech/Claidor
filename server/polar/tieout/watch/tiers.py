"""C4's ladder — one verdict per cell, and the rungs never blurred.

The plan's C4 is four rungs, not one number: the cheap proof
(verifying-trace fingerprints), tier 2 (randomized differential
evaluation), tier 1 (a Z3 proof over the arithmetic/IF/SUM
fragment), and tier 3 — « always: named unsupported constructs,
honest refusal ». Each rung was measured on its own terms before
this module existed. What it adds is the assignment: every cell of
the new version gets **exactly one** verdict, reached at a named
rung, so « proved » and « supported » can never be read off the same
line and the cells in neither number cannot go missing.

Registered in `docs/pierce/logs/prism.md` (« The tier ladder — one
verdict per cell ») with its five gates and its predictions, before
any of it ran.

Tier 1 decides nothing here and says so: `z3-solver` is not a
dependency of this repository, so the ladder counts the cells that
reach tier 1's rung and reports the count. A declared hole is
visible in every run; an undeclared one is only visible in a log.

The rung order is raw evidence, then tier 0, then the rest — the
second amendment's, not the registration's, and the log says why:
the engine's shape erases numeric literals, so a coefficient edit in
a file that was never recalculated hashes identically. Tier 0's
claim (« the stored value did not move ») survives that; a report
that printed « proved unchanged » next to a rewritten formula would
not. Under this order the tiers only see cells the raw grid calls
byte-identical, and the count the reordering rescues —
`tier0_overruled_by_raw` — is reported rather than absorbed.

The module is pure — no calculation host, no file paths. Tier 2 is
an injected oracle and the environment/volatile cones are injected
facts, because the ladder's job is the assignment and the gates,
not the driving of LibreOffice (`scripts/watch_tiers.py` does that).
"""

from collections import Counter
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field

from polar.tieout.workbook import Workbook

from .trace import Proof, proved_unchanged

#: The four verdicts. They partition the new version's cells.
PROVED = "tier0_proved"
CHANGED = "changed"
SUPPORTED = "tier2_supported"
REFUSED = "tier3_refused"

VERDICTS = (PROVED, CHANGED, SUPPORTED, REFUSED)

#: Why tier 0 could not speak. Recorded for every cell it declines,
#: whatever happens further down the ladder (the amendment).
BLOCKED_NO_COUNTERPART = "no_aligned_counterpart"
BLOCKED_UNOBSERVABLE = "unobservable_value"
BLOCKED_TRACE_DIFFERS = "trace_differs"

TIER0_BLOCKAGES = frozenset(
    {BLOCKED_NO_COUNTERPART, BLOCKED_UNOBSERVABLE, BLOCKED_TRACE_DIFFERS}
)

#: Named sources of a `changed` verdict — evidence of difference,
#: never an absence of evidence.
SOURCE_ADDED = "added"
SOURCE_RAW_CONTENT = "raw_content"
SOURCE_RAW_VALUE = "raw_value"
SOURCE_TIER2_DIVERGENCE = "tier2_divergence"

CHANGE_SOURCES = frozenset(
    {SOURCE_ADDED, SOURCE_RAW_CONTENT, SOURCE_RAW_VALUE, SOURCE_TIER2_DIVERGENCE}
)

#: The closed refusal vocabulary. A reason outside it is a bug in the
#: ladder, not a refusal — gate G4.
REFUSAL_ENVIRONMENT = "environment_dependent"
REFUSAL_VOLATILE = "volatile"
REFUSAL_NO_INPUT = "no_perturbable_input"
REFUSAL_NOT_OFFERED = "not_offered_to_tier2"
REFUSAL_UNAVAILABLE = "tier2_unavailable"
#: The recalculation did not return the cell on one side or both.
#: Distinct from `not_offered_to_tier2` (the oracle never ran) and
#: from `no_perturbable_input` (it ran and nothing moved).
REFUSAL_NOT_READ = "not_read_by_driver"

REFUSALS = frozenset(
    {
        REFUSAL_ENVIRONMENT,
        REFUSAL_VOLATILE,
        REFUSAL_NO_INPUT,
        REFUSAL_NOT_OFFERED,
        REFUSAL_UNAVAILABLE,
        REFUSAL_NOT_READ,
    }
)

#: The rung a verdict was reached at.
RUNG_TIER0 = "tier0"
RUNG_RAW = "raw"
RUNG_TIER2 = "tier2"

#: What tier 2's oracle may answer about one cell.
TIER2_SUPPORTED = "supported"
TIER2_DIVERGED = "diverged"
TIER2_REFUSED = "refused"

#: A matched cell whose own content and cached value are identical in
#: both files but whose trace differs: an input moved underneath it.
#: Raw evidence has nothing to say; it is tier 2's question exactly.
DESCENDS_INPUTS_MOVED = "inputs_moved"


@dataclass(frozen=True)
class Tier2Answer:
    """One cell's answer from the differential oracle.

    `outcome` is `supported`, `diverged` or `refused`; `detail` is the
    refusal's reason (from `REFUSALS`) or a human line about the
    divergence. `perturbed` is gate G5: an oracle that never moved
    anything the cell reads may not call it supported.
    """

    outcome: str
    detail: str = ""
    perturbed: bool = True


#: Given the suspect refs, answer for whichever it can. A ref left out
#: of the mapping is `not_offered_to_tier2` — silence is never
#: support.
Tier2Oracle = Callable[[tuple[str, ...]], Mapping[str, Tier2Answer]]


@dataclass(frozen=True)
class Verdict:
    """One cell's single verdict, and how it was reached."""

    ref: str
    verdict: str
    #: The rung it stopped at.
    rung: str
    #: The change's source, or the refusal's reason. Empty for `PROVED`.
    reason: str = ""
    #: Why tier 0 declined, when it did.
    tier0_blockage: str = ""
    #: The matched old-version ref, when the alignment found one.
    old_ref: str = ""
    #: A line for the reader: what the evidence actually was.
    detail: str = ""


@dataclass
class Ladder:
    """The assignment over one version pair."""

    verdicts: dict[str, Verdict] = field(default_factory=dict)
    #: Cells that reached tier 1's rung — the declared hole's size.
    tier1_would_have_been_asked: int = 0
    #: Cells the fingerprints proved and the raw grid overruled — the
    #: shape's literal blind spot, measured on every pair (G2b).
    tier0_overruled_by_raw: int = 0
    #: Old-version cells with no counterpart. Counted, never verdicted.
    old_only: int = 0

    def by_verdict(self, verdict: str) -> set[str]:
        return {ref for ref, item in self.verdicts.items() if item.verdict == verdict}

    @property
    def counts(self) -> dict[str, int]:
        tally = Counter(item.verdict for item in self.verdicts.values())
        return {verdict: tally.get(verdict, 0) for verdict in VERDICTS}

    @property
    def blockage_census(self) -> dict[str, int]:
        tally = Counter(
            item.tier0_blockage
            for item in self.verdicts.values()
            if item.tier0_blockage
        )
        return dict(sorted(tally.items(), key=lambda pair: -pair[1]))

    @property
    def verdict_by_blockage(self) -> dict[str, dict[str, int]]:
        """Verdict against the reason tier 0 could not speak. It is
        the table that says *which* suspects the lower rungs could
        actually answer — « of the cells whose inputs moved, how many
        were testable » is not derivable from the totals."""
        table: dict[str, dict[str, int]] = {}
        for item in self.verdicts.values():
            if not item.tier0_blockage:
                continue
            row = table.setdefault(item.tier0_blockage, {})
            key = item.reason or item.verdict
            row[key] = row.get(key, 0) + 1
        return {
            blockage: dict(sorted(row.items(), key=lambda pair: -pair[1]))
            for blockage, row in sorted(table.items())
        }

    @property
    def reason_census(self) -> dict[str, int]:
        tally = Counter(item.reason for item in self.verdicts.values() if item.reason)
        return dict(sorted(tally.items(), key=lambda pair: -pair[1]))

    def fraction(self, verdict: str) -> float:
        return (
            len(self.by_verdict(verdict)) / len(self.verdicts) if self.verdicts else 0.0
        )


def _raw_evidence(
    old_ref: str,
    ref: str,
    old_raw: Mapping[str, tuple[str, str]],
    new_raw: Mapping[str, tuple[str, str]],
) -> tuple[str, str]:
    """(source, detail) from the C1 reader, or ('', '') when the raw
    grid says the two cells are the same stored thing."""
    old_cell = old_raw.get(old_ref)
    new_cell = new_raw.get(ref)
    if old_cell is None or new_cell is None:
        #: The engine sees a cell the raw reader does not (or the
        #: reverse). Not evidence of a change — descend.
        return "", ""
    if old_cell[0] != new_cell[0]:
        return SOURCE_RAW_CONTENT, f"{old_cell[0]} -> {new_cell[0]}"[:200]
    if old_cell[1] != new_cell[1]:
        return SOURCE_RAW_VALUE, f"{old_cell[1]} -> {new_cell[1]}"[:200]
    return "", ""


def build_ladder(
    old_book: Workbook,
    new_book: Workbook,
    old_raw: Mapping[str, tuple[str, str]],
    new_raw: Mapping[str, tuple[str, str]],
    *,
    proof: Proof | None = None,
    oracle: Tier2Oracle | None = None,
    ineligible: Mapping[str, str] | None = None,
) -> Ladder:
    """Assign every new-version cell exactly one verdict.

    The order is the registration's and it is the point: tier 0, then
    raw evidence, then tier 1 (which decides nothing and is counted),
    then tier 2, then tier 3. `ineligible` carries the cones the
    caller owns — new refs mapped to `REFUSAL_ENVIRONMENT` or
    `REFUSAL_VOLATILE` — and refuses those cells before the oracle is
    troubled with them.
    """
    if proof is None:
        proof = proved_unchanged(old_book, new_book)
    ineligible = ineligible or {}

    ladder = Ladder()
    matched_old = set(proof.pairing.values())
    ladder.old_only = sum(1 for ref in old_book.cells if ref not in matched_old)

    descending: list[tuple[str, str, str, str]] = []
    for ref, cell in new_book.cells.items():
        old_ref = proof.pairing.get(ref, "")
        if not old_ref:
            ladder.verdicts[ref] = Verdict(
                ref=ref,
                verdict=CHANGED,
                rung=RUNG_RAW,
                reason=SOURCE_ADDED,
                tier0_blockage=BLOCKED_NO_COUNTERPART,
                detail="no aligned counterpart in the old version",
            )
            continue

        #: The raw rung first (second amendment). Evidence of
        #: difference outranks a hash that cannot see a coefficient.
        source, detail = _raw_evidence(old_ref, ref, old_raw, new_raw)
        if source:
            if ref in proof.proved:
                ladder.tier0_overruled_by_raw += 1
            ladder.verdicts[ref] = Verdict(
                ref=ref,
                verdict=CHANGED,
                rung=RUNG_RAW,
                reason=source,
                old_ref=old_ref,
                detail=detail,
            )
            continue

        if ref in proof.proved:
            ladder.verdicts[ref] = Verdict(
                ref=ref, verdict=PROVED, rung=RUNG_TIER0, old_ref=old_ref
            )
            continue

        observable = cell.formula is None or cell.value is not None
        old_cell = old_book.cells[old_ref]
        old_observable = old_cell.formula is None or old_cell.value is not None
        blockage = (
            BLOCKED_UNOBSERVABLE
            if not (observable and old_observable)
            else BLOCKED_TRACE_DIFFERS
        )
        descending.append((ref, old_ref, blockage, DESCENDS_INPUTS_MOVED))

    #: Tier 1's rung. It decides nothing — `z3-solver` is not a
    #: dependency — and the count is the hole, reported every run.
    ladder.tier1_would_have_been_asked = len(descending)

    refused_early = [item for item in descending if item[0] in ineligible]
    for ref, old_ref, blockage, _ in refused_early:
        ladder.verdicts[ref] = Verdict(
            ref=ref,
            verdict=REFUSED,
            rung=RUNG_TIER2,
            reason=ineligible[ref],
            tier0_blockage=blockage,
            old_ref=old_ref,
            detail="refused before the oracle: the cell's value is not the "
            "model's behaviour",
        )

    offered = tuple(
        ref for ref, _old, _blockage, _why in descending if ref not in ineligible
    )
    answers: Mapping[str, Tier2Answer] = oracle(offered) if oracle else {}

    for ref, old_ref, blockage, why in descending:
        if ref in ineligible:
            continue
        answer = answers.get(ref)
        if answer is None:
            ladder.verdicts[ref] = Verdict(
                ref=ref,
                verdict=REFUSED,
                rung=RUNG_TIER2,
                reason=REFUSAL_NOT_OFFERED,
                tier0_blockage=blockage,
                old_ref=old_ref,
                detail=why,
            )
            continue
        if answer.outcome == TIER2_DIVERGED:
            ladder.verdicts[ref] = Verdict(
                ref=ref,
                verdict=CHANGED,
                rung=RUNG_TIER2,
                reason=SOURCE_TIER2_DIVERGENCE,
                tier0_blockage=blockage,
                old_ref=old_ref,
                detail=answer.detail,
            )
        elif answer.outcome == TIER2_SUPPORTED and answer.perturbed:
            ladder.verdicts[ref] = Verdict(
                ref=ref,
                verdict=SUPPORTED,
                rung=RUNG_TIER2,
                reason="",
                tier0_blockage=blockage,
                old_ref=old_ref,
                detail=answer.detail,
            )
        elif answer.outcome == TIER2_SUPPORTED:
            #: G5: nothing moved, so nothing was tested.
            ladder.verdicts[ref] = Verdict(
                ref=ref,
                verdict=REFUSED,
                rung=RUNG_TIER2,
                reason=REFUSAL_NO_INPUT,
                tier0_blockage=blockage,
                old_ref=old_ref,
                detail="the trials never moved this cell's inputs",
            )
        else:
            reason = answer.detail if answer.detail in REFUSALS else REFUSAL_UNAVAILABLE
            ladder.verdicts[ref] = Verdict(
                ref=ref,
                verdict=REFUSED,
                rung=RUNG_TIER2,
                reason=reason,
                tier0_blockage=blockage,
                old_ref=old_ref,
                detail=answer.detail,
            )
    return ladder


def gate_violations(
    ladder: Ladder,
    new_book: Workbook,
    old_raw: Mapping[str, tuple[str, str]],
    new_raw: Mapping[str, tuple[str, str]],
    proof: Proof,
) -> list[str]:
    """The registered gates, in order. Empty means the round passes.

    G1 soundness · G2 no instrument drift · G3 partition · G4 named
    refusals · G5 tier-2 honesty (enforced at assignment; re-checked
    here so a future edit cannot quietly relax it).
    """
    violations: list[str] = []

    for verdict in (PROVED, SUPPORTED):
        for ref in sorted(ladder.by_verdict(verdict)):
            item = ladder.verdicts[ref]
            old = old_raw.get(item.old_ref)
            new = new_raw.get(ref)
            if old is None or new is None:
                continue
            if old[1] != new[1]:
                violations.append(
                    f"G1: {verdict} {ref} but the stored value moved "
                    f"({old[1]} -> {new[1]})"
                )

    over = ladder.by_verdict(PROVED) - set(proof.proved)
    if over:
        violations.append(
            f"G2a: the ladder proves {len(over)} cells the fingerprints do "
            f"not (e.g. {sorted(over)[:3]})"
        )
    for ref in sorted(set(proof.proved) - ladder.by_verdict(PROVED)):
        overruling = ladder.verdicts.get(ref)
        verdict = overruling.verdict if overruling else "nothing"
        reason = overruling.reason if overruling else ""
        if reason not in {SOURCE_RAW_CONTENT, SOURCE_RAW_VALUE}:
            violations.append(
                f"G2b: the fingerprints proved {ref} and the ladder calls it "
                f"{verdict} for the reason {reason!r} — only raw evidence "
                f"may overrule a proof"
            )

    assigned = set(ladder.verdicts)
    universe = set(new_book.cells)
    if assigned != universe:
        violations.append(
            f"G3: {len(universe - assigned)} cells unassigned, "
            f"{len(assigned - universe)} assigned outside the universe"
        )
    for ref, item in ladder.verdicts.items():
        if item.verdict not in VERDICTS:
            violations.append(f"G3: {ref} carries the unknown verdict {item.verdict!r}")

    for ref in sorted(ladder.by_verdict(REFUSED)):
        reason = ladder.verdicts[ref].reason
        if reason not in REFUSALS:
            violations.append(f"G4: {ref} refused with the unnamed reason {reason!r}")
    for ref in sorted(ladder.by_verdict(CHANGED)):
        reason = ladder.verdicts[ref].reason
        if reason not in CHANGE_SOURCES:
            violations.append(f"G4: {ref} changed with the unnamed source {reason!r}")

    return violations
