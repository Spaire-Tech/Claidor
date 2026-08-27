"""C4's ladder over a real version pair — the runner.

    uv run python -m scripts.watch_tiers pair OLD.xlsx NEW.xlsx OUT.json
    uv run python -m scripts.watch_tiers cost FILE.xlsx

`pair` assigns every cell of the new version exactly one verdict and
checks the five registered gates (`docs/pierce/logs/prism.md`, « The
tier ladder — one verdict per cell », with its two amendments). It
runs **without a tier-2 oracle**: tiers 0 and 3 and the raw
evidence, which need no calculation host. Every cell that reaches
tier 2's rung comes back `not_offered_to_tier2` — the refusal that
stops a cheap run from reading like a complete one.

`cost` measures what the pair oracle will cost before anything
depends on it: one openpyxl load-and-save of the file, and one
LibreOffice recalculation of it. The oracle needs
`2 x (1 + TIER2_TRIALS)` of each.

The environment and volatile cones are computed here, not in the
ladder: they are facts about the file that the pure module takes as
given (`polar.tieout.watch.tiers` drives nothing).
"""

import json
import sys
import time
from pathlib import Path

from polar.tieout.watch import read_raw
from polar.tieout.watch.tiers import (
    CHANGED,
    PROVED,
    REFUSAL_ENVIRONMENT,
    REFUSAL_VOLATILE,
    REFUSED,
    SUPPORTED,
    build_ladder,
    gate_violations,
)
from polar.tieout.watch.trace import proved_unchanged
from polar.tieout.workbook import read_workbook
from scripts.watch_stealth import _environment_cone


def _ineligible(path: str) -> tuple[dict[str, str], dict[str, int]]:
    """New-version refs the differential oracle may not be asked
    about, each with its named reason."""
    from polar.tieout.recalc import volatile_cone

    book = read_workbook(path)
    raw, _ = read_raw(path)
    _, volatile = volatile_cone(book.cells)
    _, environment = _environment_cone(raw, book.cells)
    named = {ref: REFUSAL_VOLATILE for ref in volatile if ref in book.cells}
    for ref in environment:
        if ref in book.cells:
            named[ref] = REFUSAL_ENVIRONMENT
    return named, {"volatile": len(volatile), "environment": len(environment)}


def run_pair(old_path: str, new_path: str, out_path: str) -> int:
    started = time.monotonic()
    old_book = read_workbook(old_path)
    new_book = read_workbook(new_path)
    old_raw, _ = read_raw(old_path)
    new_raw, _ = read_raw(new_path)
    read_at = time.monotonic()

    ineligible, cone_sizes = _ineligible(new_path)
    proof = proved_unchanged(old_book, new_book)
    ladder = build_ladder(
        old_book,
        new_book,
        old_raw,
        new_raw,
        proof=proof,
        oracle=None,
        ineligible=ineligible,
    )
    violations = gate_violations(ladder, new_book, old_raw, new_raw, proof)

    total = len(ladder.verdicts)
    payload = {
        "old": old_path,
        "new": new_path,
        "cells": total,
        "old_only": ladder.old_only,
        "seconds": {
            "read": round(read_at - started, 1),
            "total": round(time.monotonic() - started, 1),
        },
        "counts": ladder.counts,
        "shares": {
            verdict: round(ladder.fraction(verdict), 4) for verdict in ladder.counts
        },
        "tier0_overruled_by_raw": ladder.tier0_overruled_by_raw,
        "tier1_would_have_been_asked": ladder.tier1_would_have_been_asked,
        "tier0_blockage_census": ladder.blockage_census,
        "reason_census": ladder.reason_census,
        "cone_sizes": cone_sizes,
        "proof_proved": len(proof.proved),
        "proof_fraction": round(proof.proved_fraction, 4),
        "gate_violations": violations[:20],
        "gate_violation_count": len(violations),
        "examples": {
            verdict: sorted(ladder.by_verdict(verdict))[:5]
            for verdict in (PROVED, CHANGED, SUPPORTED, REFUSED)
        },
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    print(json.dumps(payload, indent=1))
    return 0 if not violations else 1


def run_cost(path: str) -> int:
    """What one trial of the pair oracle costs on this file."""
    import tempfile

    import openpyxl

    from polar.tieout.recalc.uno_calc import UnoCalculator

    numbers: dict[str, float] = {}
    with tempfile.TemporaryDirectory() as scratch:
        target = Path(scratch) / "built.xlsx"
        started = time.monotonic()
        working = openpyxl.load_workbook(path)
        numbers["openpyxl_load"] = round(time.monotonic() - started, 1)
        started = time.monotonic()
        working.save(target)
        numbers["openpyxl_save"] = round(time.monotonic() - started, 1)

        calc = UnoCalculator()
        calc.start()
        try:
            started = time.monotonic()
            values = calc.recalculate(str(target))
            numbers["uno_recalculate"] = round(time.monotonic() - started, 1)
            numbers["cells_read"] = len(values.values)
        finally:
            calc.stop()

    one_trial = numbers["openpyxl_load"] + numbers["openpyxl_save"]
    one_trial += numbers["uno_recalculate"]
    numbers["one_build_and_recalculation"] = round(one_trial, 1)
    #: The pair oracle: both files, a baseline and TIER2_TRIALS trials.
    numbers["projected_oracle_minutes"] = round(one_trial * 2 * 6 / 60, 1)
    print(json.dumps(numbers, indent=1))
    return 0


def main() -> int:
    mode = sys.argv[1]
    if mode == "pair":
        return run_pair(*sys.argv[2:5])
    if mode == "cost":
        return run_cost(sys.argv[2])
    raise SystemExit(f"unknown mode {mode!r}")


if __name__ == "__main__":
    raise SystemExit(main())
