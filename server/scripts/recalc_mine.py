"""B5 round 1 — the Monday experiment: mine a model's own laws.

    cd server && uv run python -m scripts.recalc_mine MODEL_KEY OUT.json [RUNS]

Per the registration (lane log, 27 Aug): only gate-clean files are
mined; inputs are **typed by hand** below and perturbed by their
type's policy (flags held, selectors stepped, weights held because
they are a constrained family, money and rates sampled in band);
runs that error are **dropped with their reason**, never data; the
whole mining is done twice with independent samples and only rules
both minings find are kept.

Round 1 prints the rule set. **It is read before anything is
scored** — the test of this round is whether a modeller recognises
the model in its own discovered laws, not a number.
"""

import json
import random
import sys
import time
from pathlib import Path
from typing import Any

from polar.tieout.recalc.mine import (
    InputType,
    TypedInput,
    agreement,
    cleanse,
    mine_signed_sums,
    sample,
    stable_rules,
)
from polar.tieout.recalc.uno_calc import UnoCalculator, find_install
from polar.tieout.workbook import read_workbook
from scripts.recalc_behave import perturb

H7_SHEET = "H7 Cost of debt indexation"
YEARS = ("I", "J", "K", "L", "M")

#: Hand-typing, 27 Aug, from the sheet's own row labels — the cost
#: of this step is itself a recorded result.
#:
#: - `Average RAB` (row 26) is the sheet's only money row.
#: - Every premium, benchmark, weight-free rate, tax rate, gearing,
#:   WACC and RPI row is a RATE: sampled in its own band, never
#:   handed a money factor.
#: - **The weight rows (15, 16, 17, 18, 19, 20) are HELD**: they are
#:   a constrained family (embedded + new = 1, fixed + index-linked
#:   = 1). Perturbing them independently would run the model in a
#:   capital structure it never occupies — precisely the failure the
#:   AHA's typing law exists to prevent. Sampling them jointly on
#:   their simplex is a later round, registered when it comes.
H7_MONEY_ROWS = (26,)
H7_RATE_ROWS = (6, 7, 9, 30, 33, 34)
H7_RATE_SINGLES = ("G10", "G11", "G12", "G13", "G22", "G23", "G24", "G27", "G31", "G32")
H7_HELD_ROWS = (15, 16, 17, 18, 19, 20)


def h7_inputs(values: dict[str, float]) -> list[TypedInput]:
    typed: list[TypedInput] = []
    for row in H7_MONEY_ROWS:
        for column in YEARS:
            ref = f"{H7_SHEET}!{column}{row}"
            if ref in values:
                typed.append(TypedInput(ref, InputType.MONEY, values[ref]))
    for row in H7_RATE_ROWS:
        for column in YEARS:
            ref = f"{H7_SHEET}!{column}{row}"
            if ref in values:
                typed.append(
                    TypedInput(ref, InputType.RATE, values[ref], band=(0.6, 1.6))
                )
    for at in H7_RATE_SINGLES:
        ref = f"{H7_SHEET}!{at}"
        if ref in values:
            typed.append(TypedInput(ref, InputType.RATE, values[ref], band=(0.6, 1.6)))
    for row in H7_HELD_ROWS:
        for column in YEARS:
            ref = f"{H7_SHEET}!{column}{row}"
            if ref in values:
                typed.append(TypedInput(ref, InputType.UNTYPED, values[ref]))
    return typed


ROE_PATH = (
    "scripts/corpus_au_uk/ofgem_riio3/draft/"
    "RIIO GDT3 Allowed Return on Equity Summary File_Draft Determinations_Jun25.xlsx"
)
ROE_SHEET = "One-Off Wedge"


def roe_inputs(values: dict[str, float]) -> list[TypedInput]:
    """Hand-typing, 27 Aug, from this sheet's own headers.

    The sheet is a rate model laid out plainly: years down column A,
    `RPI` and `CPI` across, and a « % of 'legacy' RPI » share. So:

    - **C6:C14 (RPI) and D6:D14 (CPI)** are RATE, sampled in band.
    - **E6:E13, the legacy share**, is RATE bounded at 1.0 — it is a
      proportion, and a run above 100% is a state the model never
      occupies (the typing law, again).
    - **Column A is the year index: HELD.** A date index is not a
      quantity, and stepping it would rewrite the model's periods.
    - **J3, K3, Q22, R22 and the P column carry no labels**, so they
      are UNTYPED and never perturbed — recorded as gaps rather than
      guessed at, which is the policy's whole point.
    """
    typed: list[TypedInput] = []
    for row in range(6, 15):
        for column, band in (("C", (0.4, 2.0)), ("D", (0.4, 2.0))):
            ref = f"{ROE_SHEET}!{column}{row}"
            if ref in values:
                typed.append(TypedInput(ref, InputType.RATE, values[ref], band=band))
    for row in range(6, 14):
        ref = f"{ROE_SHEET}!E{row}"
        if ref in values:
            typed.append(TypedInput(ref, InputType.RATE, values[ref], band=(0.5, 1.0)))
    for row in range(6, 37):
        ref = f"{ROE_SHEET}!A{row}"
        if ref in values:
            typed.append(TypedInput(ref, InputType.DATE, values[ref]))
    return typed


#: model key → (path, sheet whose formula cells are watched, typing)
MODELS: dict[str, tuple[str, str, Any]] = {
    "h7-fds": (
        "scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fds.xlsx",
        H7_SHEET,
        h7_inputs,
    ),
    "h7-fp": (
        "scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fp.xlsx",
        H7_SHEET,
        h7_inputs,
    ),
    "roe": (ROE_PATH, ROE_SHEET, roe_inputs),
}


def one_mining(
    calculator: UnoCalculator,
    source: Path,
    work: Path,
    typed: list[TypedInput],
    watched: list[str],
    runs: int,
    seed: int,
) -> tuple[list[dict[str, float]], dict[str, int]]:
    """`runs` perturbed recalculations. Dropped runs are counted, not used."""
    rng = random.Random(seed)
    kept: list[dict[str, float]] = []
    drops = {"engine-error": 0, "failed": 0}
    for index in range(runs):
        copy = work / f"{source.stem}-s{seed}-r{index}.xlsx"
        perturb(source, copy, sample(typed, rng))
        try:
            values = calculator.recalculate(str(copy)).values
        except Exception:
            drops["failed"] += 1
            copy.unlink(missing_ok=True)
            continue
        numeric = {
            ref: value
            for ref, value in values.items()
            if isinstance(value, float) and ref in set(watched)
        }
        if len(numeric) < len(watched):
            drops["engine-error"] += 1
        else:
            kept.append(numeric)
        copy.unlink(missing_ok=True)
    return kept, drops


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    key, out = sys.argv[1], Path(sys.argv[2])
    runs = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    if find_install() is None:
        print("no LibreOffice >= 25.8 here — refusing")
        return 1
    if key not in MODELS:
        print(f"unknown model key {key!r}; known: {', '.join(MODELS)}")
        return 1

    path, sheet, typing = MODELS[key]
    source = Path(path)
    work = out.parent / f"{out.stem}-work"
    work.mkdir(parents=True, exist_ok=True)

    book = read_workbook(str(source))
    cells = book.cells
    constants = {
        ref: float(cell.value)
        for ref, cell in cells.items()
        if cell.formula is None and cell.value is not None
    }
    typed = typing(constants)
    watched = sorted(
        ref
        for ref, cell in cells.items()
        if cell.sheet == sheet and cell.formula is not None
    )
    labels = {ref: (cells[ref].row_label or ref) for ref in watched}
    print(
        f"{source.name}: {len(typed)} typed inputs "
        f"({sum(1 for t in typed if t.type is InputType.MONEY)} money, "
        f"{sum(1 for t in typed if t.type is InputType.RATE)} rate, "
        f"{sum(1 for t in typed if t.type is InputType.UNTYPED)} held), "
        f"{len(watched)} watched formula cells",
        flush=True,
    )

    calculator = UnoCalculator(document_timeout=1800)
    calculator.start()
    started = time.monotonic()
    try:
        first, drops_a = one_mining(
            calculator, source, work, typed, watched, runs, seed=1
        )
        print(f"mining 1: {len(first)} kept, drops {drops_a}", flush=True)
        second, drops_b = one_mining(
            calculator, source, work, typed, watched, runs, seed=2
        )
        print(f"mining 2: {len(second)} kept, drops {drops_b}", flush=True)
    finally:
        calculator.stop()

    mine_started = time.monotonic()
    rules_a = cleanse(mine_signed_sums(first, watched))
    rules_b = cleanse(mine_signed_sums(second, watched))
    stable = stable_rules(rules_a, rules_b)
    mine_seconds = round(time.monotonic() - mine_started, 1)

    print(f"\n=== {source.name}: {len(stable)} stable rules ===", flush=True)
    for rule in stable:
        print("  " + rule.render(labels), flush=True)

    out.write_text(
        json.dumps(
            {
                "model": source.name,
                "runs_requested": runs,
                "kept": [len(first), len(second)],
                "drops": [drops_a, drops_b],
                "rules_first": len(rules_a),
                "rules_second": len(rules_b),
                "agreement": round(agreement(rules_a, rules_b), 4),
                "stable": [
                    {
                        "terms": list(rule.terms),
                        "sentence": rule.render(labels),
                    }
                    for rule in stable
                ],
                "seconds_total": round(time.monotonic() - started, 1),
                "seconds_naive_engine": mine_seconds,
            },
            indent=1,
        )
    )
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
