"""Tier 1's coverage denominator, measured without the solver.

    uv run python -m scripts.watch_fragment model FILE.xlsx OUT.json
    uv run python -m scripts.watch_fragment rung OLD.xlsx NEW.xlsx OUT.json

`model` classifies every formula cell of one file against tier 1's
registered fragment: how much of a real model the tier could ever
speak about, and what puts the rest outside, by name.

`rung` does the same for the cells that actually reach tier 1's rung
on a version pair — the suspects tier 0 could not prove and raw
evidence did not decide — and additionally reports how many of those
pairs carry **identical formulas on both sides**, which tier 1 would
prove equivalent trivially and learn nothing from.

Registered in `docs/pierce/logs/prism.md` (« Tier 1, part A — the
boundary without the solver ») with its predictions, before it ran.
No z3 anywhere: the dependency is still the lead's to approve.
"""

import json
import sys
import time
from collections import Counter
from pathlib import Path

from polar.tieout.watch import read_raw
from polar.tieout.watch.fragment import classify, eligible_pair
from polar.tieout.watch.trace import proved_unchanged
from polar.tieout.workbook import read_workbook


def _census(counter: Counter[str]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda pair: -pair[1]))


def run_model(path: str, out_path: str) -> int:
    started = time.monotonic()
    book = read_workbook(path)
    formulas = [cell for cell in book.cells.values() if cell.formula is not None]
    eligible, refused = 0, Counter[str]()
    examples: dict[str, str] = {}
    for cell in formulas:
        verdict = classify(cell.formula)
        if verdict.eligible:
            eligible += 1
            continue
        refused[verdict.construct] += 1
        examples.setdefault(verdict.construct, f"{cell.ref}: {verdict.detail}")
    payload = {
        "file": path,
        "seconds": round(time.monotonic() - started, 1),
        "cells": len(book.cells),
        "formula_cells": len(formulas),
        "eligible": eligible,
        "eligible_share": round(eligible / len(formulas), 4) if formulas else 0.0,
        "refused_by_construct": _census(refused),
        "examples": examples,
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    print(json.dumps(payload, indent=1))
    return 0


def run_rung(old_path: str, new_path: str, out_path: str) -> int:
    started = time.monotonic()
    old_book = read_workbook(old_path)
    new_book = read_workbook(new_path)
    old_raw, _ = read_raw(old_path)
    new_raw, _ = read_raw(new_path)
    proof = proved_unchanged(old_book, new_book)

    rung: list[str] = []
    for ref, cell in new_book.cells.items():
        if ref in proof.proved:
            continue
        old_ref = proof.pairing.get(ref)
        if old_ref is None:
            continue
        before, after = old_raw.get(old_ref), new_raw.get(ref)
        if before is None or after is None:
            continue
        #: The ladder's own rung: raw evidence decided nothing here.
        if before[0] != after[0] or before[1] != after[1]:
            continue
        rung.append(ref)

    eligible, refused = 0, Counter[str]()
    identical = 0
    for ref in rung:
        old_ref = proof.pairing[ref]
        old_formula = old_book.cells[old_ref].formula
        new_formula = new_book.cells[ref].formula
        if old_formula == new_formula:
            identical += 1
        verdict = eligible_pair(old_formula, new_formula)
        if verdict.eligible:
            eligible += 1
        else:
            refused[verdict.construct] += 1
    payload = {
        "old": old_path,
        "new": new_path,
        "seconds": round(time.monotonic() - started, 1),
        "at_tier1_rung": len(rung),
        "eligible": eligible,
        "eligible_share": round(eligible / len(rung), 4) if rung else 0.0,
        "identical_formulas_both_sides": identical,
        "refused_by_construct": _census(refused),
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    print(json.dumps(payload, indent=1))
    return 0


def main() -> int:
    mode = sys.argv[1]
    if mode == "model":
        return run_model(*sys.argv[2:4])
    if mode == "rung":
        return run_rung(*sys.argv[2:5])
    raise SystemExit(f"unknown mode {mode!r}")


if __name__ == "__main__":
    raise SystemExit(main())
