"""B5 — mine a model's own laws under typed input perturbation.

    cd server && uv run python -m scripts.recalc_mine MODEL_KEY OUT.json [RUNS] [--hand]

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

**Round 2 (registered 28 Aug) types the inputs from E2's
inference** rather than from the hand tables below, which stay
reachable as `--hand` because the comparison between the two is the
point of the round. Coverage is printed beside every rule set and a
round below 50% is reported as uninformative.
"""

import json
import random
import sys
import time
from pathlib import Path
from typing import Any

from polar.tieout.recalc.mine import (
    Family,
    InputType,
    TypedInput,
    agreement,
    cleanse,
    coverage,
    find_families,
    mine_signed_sums,
    sample_with_families,
    stable_rules,
    type_from_units,
)
from polar.tieout.recalc.uno_calc import UnoCalculator, find_install
from polar.tieout.units.inference import (
    Orientation,
    classify_columns,
    classify_sheet,
    columns_from_cells,
    rows_from_cells,
    sheet_reading,
)
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


def inferred_inputs(
    cells: dict, sheets: list[str] | None = None
) -> tuple[list[TypedInput], dict[str, str]]:
    """Type every constant input cell from E2, per the registered map.

    E2 is run **blind** — it never reads a Units column here — so the
    typing is the same instrument measured in the E2 rounds, not a
    privileged version of it.

    The orientation decides *which way the sheet is read*, and that
    is not optional. A `row-wise` sheet is typed by row. A
    `column-wise` sheet is a record table whose units live in its
    columns, so it is typed by column. An `unknown` sheet is
    **refused, out loud** — E2's contract says the caller must not
    treat its rows as quantities, and freezing it by accident (which
    is what happened to the RoE model) is not the same thing as
    saying so.

    Returns the typed inputs and a per-sheet note of how each was
    read, so a run can report its refusals rather than hide them.
    """
    typed: list[TypedInput] = []
    how: dict[str, str] = {}
    for sheet in sorted(sheets or {cell.sheet for cell in cells.values()}):
        rows = rows_from_cells(cells, sheet)
        if not rows:
            continue
        facing = sheet_reading(cells, sheet)
        if facing is Orientation.UNKNOWN:
            how[sheet] = "refused: orientation unknown, so no row is a quantity"
            continue
        by_sheet = {
            ref: cell
            for ref, cell in cells.items()
            if cell.sheet == sheet and cell.formula is None and cell.value is not None
        }
        if facing is Orientation.COLUMN_WISE:
            how[sheet] = "read column-wise: a record table's units live in its columns"
            columns = columns_from_cells(cells, sheet)
            labels = classify_columns(columns)
            evidence = {column: row for column, row in columns}
            for ref, cell in by_sheet.items():
                label = labels.get(cell.column)
                if label is None:
                    continue
                _append(typed, label, ref, cell, evidence[cell.column].values)
            continue
        how[sheet] = "read row-wise"
        labels = classify_sheet(rows)
        by_row = {row.row: row for row in rows}
        for ref, cell in by_sheet.items():
            label = labels.get((sheet, cell.row))
            row_evidence = by_row.get(cell.row)
            if label is None or row_evidence is None:
                continue
            _append(typed, label, ref, cell, row_evidence.values)
    return typed, how


def _append(typed: list, label, ref: str, cell, values) -> None:
    try:
        value = float(cell.value)
    except (TypeError, ValueError):
        return
    typed.append(type_from_units(label, ref, value, values))


def families_of(cells: dict, typed: list[TypedInput], sheet: str) -> list[Family]:
    """Constrained families among the perturbable rows of one sheet.

    The sheet's period columns are its groups: the same rows seen in
    every year. A family must hold its constant in all of them.
    """
    perturbable = {
        t.ref
        for t in typed
        if t.type in (InputType.MONEY, InputType.RATE, InputType.COUNT)
    }
    by_column: dict[int, dict[int, str]] = {}
    values: dict[str, float] = {}
    for ref in perturbable:
        cell = cells.get(ref)
        if cell is None or cell.sheet != sheet or cell.value is None:
            continue
        try:
            values[ref] = float(cell.value)
        except (TypeError, ValueError):
            continue
        by_column.setdefault(cell.column, {})[cell.row] = ref
    columns = [rows for _column, rows in sorted(by_column.items()) if len(rows) >= 2]
    return find_families(values, columns)


def one_mining(
    calculator: UnoCalculator,
    source: Path,
    work: Path,
    typed: list[TypedInput],
    watched: list[str],
    runs: int,
    seed: int,
    families: list[Family] | None = None,
) -> tuple[list[dict[str, float]], dict[str, int]]:
    """`runs` perturbed recalculations. Dropped runs are counted, not used."""
    rng = random.Random(seed)
    kept: list[dict[str, float]] = []
    drops = {"engine-error": 0, "failed": 0}
    for index in range(runs):
        copy = work / f"{source.stem}-s{seed}-r{index}.xlsx"
        perturb(source, copy, sample_with_families(typed, families or [], rng))
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
    argv = [a for a in sys.argv[1:] if a != "--hand"]
    hand = "--hand" in sys.argv
    key, out = argv[0], Path(argv[1])
    runs = int(argv[2]) if len(argv) > 2 else 200
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
    how: dict[str, str] = {}
    if hand:
        typed = typing(constants)
    else:
        typed, how = inferred_inputs(cells)
    refused = sorted(s for s, note in how.items() if note.startswith("refused"))
    column_wise = sorted(s for s, note in how.items() if "column-wise" in note)
    watched = sorted(
        ref
        for ref, cell in cells.items()
        if cell.sheet == sheet and cell.formula is not None
    )
    labels = {ref: (cells[ref].row_label or ref) for ref in watched}
    counts = {kind: sum(1 for t in typed if t.type is kind) for kind in InputType}
    print(
        f"{source.name}: typing={'hand' if hand else 'inferred'}, "
        f"{len(typed)} typed inputs ("
        + ", ".join(f"{n} {kind}" for kind, n in counts.items() if n)
        + f"), {len(watched)} watched formula cells",
        flush=True,
    )
    if how:
        print(
            f"sheets: {len(how)} read, {len(column_wise)} column-wise, "
            f"{len(refused)} refused for unknown orientation"
            + (f" — {', '.join(refused[:4])}" if refused else ""),
            flush=True,
        )

    families = [] if hand else families_of(cells, typed, sheet)
    if families:
        members = sorted({ref for f in families for ref in f.refs})
        shapes = sorted(
            {
                (
                    tuple(
                        r.split("!")[-1].lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
                        for r in f.refs
                    ),
                    round(f.constant, 9),
                )
                for f in families
            }
        )
        print(
            f"constrained families: {len(families)} across "
            f"{len(members)} cells — {shapes[:6]}",
            flush=True,
        )
    else:
        print("constrained families: none detected", flush=True)

    calculator = UnoCalculator(document_timeout=1800)
    calculator.start()
    started = time.monotonic()
    try:
        first, drops_a = one_mining(
            calculator, source, work, typed, watched, runs, seed=1, families=families
        )
        print(f"mining 1: {len(first)} kept, drops {drops_a}", flush=True)
        second, drops_b = one_mining(
            calculator, source, work, typed, watched, runs, seed=2, families=families
        )
        print(f"mining 2: {len(second)} kept, drops {drops_b}", flush=True)
    finally:
        calculator.stop()

    moved, watched_count = coverage(first, watched)
    reach = moved / watched_count if watched_count else 0.0
    verdict = "informative" if reach >= 0.5 else "UNINFORMATIVE — not a result"
    print(
        f"coverage: {moved} of {watched_count} watched cells moved "
        f"({100 * reach:.1f}%) — {verdict}",
        flush=True,
    )

    mine_started = time.monotonic()
    rules_a = cleanse(mine_signed_sums(first, watched))
    rules_b = cleanse(mine_signed_sums(second, watched))
    stable = stable_rules(rules_a, rules_b)
    mine_seconds = round(time.monotonic() - mine_started, 1)

    print(f"\n=== {source.name}: {len(stable)} stable rules ===", flush=True)
    # Row labels repeat across a model's year columns, so distinct
    # rules render as identical sentences. Printing the sentence with
    # its cells keeps « eleven rules » from reading as eleven facts.
    for rule in stable:
        cells_in = " ".join(ref.split("!")[-1] for ref, _ in rule.terms)
        print(f"  {rule.render(labels)}   [{cells_in}]", flush=True)
    sentences = {rule.render(labels) for rule in stable}
    print(f"  ({len(sentences)} distinct sentences)", flush=True)

    out.write_text(
        json.dumps(
            {
                "model": source.name,
                "typing": "hand" if hand else "inferred",
                "typed_inputs": {str(kind): n for kind, n in counts.items() if n},
                "coverage": [moved, watched_count],
                "families": [
                    {"refs": list(f.refs), "constant": f.constant} for f in families
                ],
                "sheets_refused": refused,
                "sheets_column_wise": column_wise,
                "coverage_verdict": verdict,
                "runs_requested": runs,
                "kept": [len(first), len(second)],
                "drops": [drops_a, drops_b],
                "rules_first": len(rules_a),
                "rules_second": len(rules_b),
                "agreement": round(agreement(rules_a, rules_b), 4),
                "distinct_sentences": len({rule.render(labels) for rule in stable}),
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
