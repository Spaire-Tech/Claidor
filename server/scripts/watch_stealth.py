"""C4's planted-stealth-edit harness, and the soundness gate.

Registered in `docs/pierce/logs/prism.md` (« C4 registration,
round 1 ») before this code existed. Two modes:

    uv run python -m scripts.watch_stealth planted BASE.xlsx SHEET OUT.json [STEALTH_SHEET]
    uv run python -m scripts.watch_stealth pair OLD.xlsx NEW.xlsx OUT.json

Per the round-1 amendment: a sheet with no typed numeric literal
cannot host a stealth edit — its stealth-only instances are
recorded as refusals, and its declared+stealth instances put the
stealth on STEALTH_SHEET (the other registered sheet), hiding the
change outside the declared sheet entirely.

`planted` runs the registered instances on one sheet: stealth-only
(one literal retyped at each quartile position, no declared edit)
and declared+stealth (each C2 structural class at its median
position, plus one literal retyped at the farthest quartile — the
change hidden outside the declared cells). `pair` runs the proof
over a real version pair.

Both modes apply the same gate, fixed in the registration: **zero
cells whose stored cached value differs between the files (the C1
raw reader, mapped through the proof's own pairing) may appear in
the proved set — one violation fails the round.** The stealth cell
must be reported suspect; the proved fraction is reported, never
gated.
"""

import json
import sys
import tempfile
import time
from pathlib import Path

import openpyxl

from polar.tieout.audit import _shape_of
from polar.tieout.watch import read_raw
from polar.tieout.watch.trace import Proof, proved_unchanged
from polar.tieout.workbook import read_workbook, tokens_of
from scripts.watch_plant import CLASSES, Planted, _apply, _reinject_values

#: The declared classes for declared+stealth instances: the
#: structural ones, per the registration.
STRUCTURAL = [kind for kind in CLASSES if "row" in kind or "column" in kind]


def _clear_caches() -> None:
    tokens_of.cache_clear()
    _shape_of.cache_clear()


def _stealth_retype(
    sheet: openpyxl.worksheet.worksheet.Worksheet, from_row: int
) -> str:
    """Retype the first numeric literal at or below `from_row` — or,
    when the sheet keeps its typed inputs above that point (an
    InputSummary is pull-through formulas nearly everywhere), the
    first one from the top — +7; return its coordinate in the file's
    final geometry."""
    for start in (from_row, 1):
        for row in sheet.iter_rows(min_row=start):
            for cell in row:
                if isinstance(cell.value, (int, float)) and not isinstance(
                    cell.value, bool
                ):
                    cell.value = cell.value + 7
                    return str(cell.coordinate)
    raise SystemExit("no numeric literal anywhere on the sheet")


def _soundness(
    proof: Proof,
    base_raw: dict[str, tuple[str, str]],
    new_raw: dict[str, tuple[str, str]],
) -> list[dict[str, str]]:
    """The gate: every proved (new ← old) pairing must carry equal
    stored cached values in the raw grids. Violations, listed."""
    violations = []
    for new_ref, old_ref in proof.proved.items():
        before = base_raw.get(old_ref)
        after = new_raw.get(new_ref)
        before_value = before[1] if before else "(absent)"
        after_value = after[1] if after else "(absent)"
        if before_value != after_value:
            violations.append(
                {"new": new_ref, "old": old_ref, "was": before_value, "is": after_value}
            )
    return violations


def run_planted(
    base_path: str, sheet_name: str, out_path: str, stealth_fallback: str = ""
) -> int:
    base = Path(base_path)
    base_book = read_workbook(base_path)
    base_raw, _ = read_raw(base_path)
    _clear_caches()

    rows = sorted(
        {cell.row for cell in base_book.cells.values() if cell.sheet == sheet_name}
    )
    columns = sorted(
        {cell.column for cell in base_book.cells.values() if cell.sheet == sheet_name}
    )
    quartiles = sorted(
        {rows[len(rows) // 4], rows[len(rows) // 2], rows[3 * len(rows) // 4]}
    )
    median_row = rows[len(rows) // 2]
    median_column = columns[len(columns) // 2]
    farthest = max(quartiles, key=lambda q: abs(q - median_row))

    #: A literal the planter can retype is a raw numeric cell with no
    #: formula — content tag « n: » in the C1 reader's terms.
    def has_literal(sheet: str) -> bool:
        prefix = f"{sheet}!"
        return any(
            ref.startswith(prefix) and content.startswith("n:")
            for ref, (content, _) in base_raw.items()
        )

    stealth_sheet = sheet_name if has_literal(sheet_name) else stealth_fallback
    refusals = []
    instances: list[tuple[str | None, int]] = []
    if stealth_sheet == sheet_name:
        instances += [(None, position) for position in quartiles]
    else:
        refusals = [
            {
                "declared": "none",
                "position": position,
                "refused": f"{sheet_name} holds no typed numeric literal",
            }
            for position in quartiles
        ]
        if not stealth_sheet:
            raise SystemExit(
                f"{sheet_name} holds no typed numeric literal and no "
                "stealth fallback sheet was given"
            )
    instances += [
        (kind, farthest if "row" in kind else quartiles[-1]) for kind in STRUCTURAL
    ]

    results = []
    started = time.monotonic()
    with tempfile.TemporaryDirectory() as scratch:
        for kind, stealth_row in instances:
            target = Path(scratch) / f"{kind or 'stealth_only'}_{stealth_row}.xlsx"
            book = openpyxl.load_workbook(base)
            if kind is None:
                planted = Planted("stealth_only", "none", 0, 0)
            elif "column" in kind:
                planted = _apply(book, sheet_name, kind, rows[0], median_column)
            else:
                planted = _apply(book, sheet_name, kind, median_row, columns[0])
            stealth_ref = _stealth_retype(book[stealth_sheet], stealth_row)
            book.save(target)
            _reinject_values(base, target, sheet_name, planted)

            new_book = read_workbook(str(target))
            new_raw, _ = read_raw(str(target))
            proof = proved_unchanged(base_book, new_book)
            violations = _soundness(proof, base_raw, new_raw)
            stealth_full = f"{stealth_sheet}!{stealth_ref}"
            stealth_suspect = stealth_full not in proof.proved
            #: Re-injection covers every sheet (round-1 amendment),
            #: so the whole-file fraction is real; the declared
            #: sheet's own fraction is reported beside it.
            sheet_proved, sheet_cells = proof.per_sheet.get(sheet_name, (0, 0))
            verdict = {
                "declared": kind or "none",
                "stealth": stealth_full,
                "stealth_suspect": stealth_suspect,
                "violations": violations[:20],
                "violation_count": len(violations),
                "proved": len(proof.proved),
                "suspects": len(proof.suspects),
                "proved_fraction": round(proof.proved_fraction, 4),
                "sheet_proved_fraction": round(
                    sheet_proved / sheet_cells if sheet_cells else 0.0, 4
                ),
                "sound": not violations and stealth_suspect,
            }
            results.append(verdict)
            _clear_caches()
            print(
                f"[{'ok' if verdict['sound'] else 'FAIL'}] "
                f"{verdict['declared']} + stealth@{stealth_full}  "
                f"sheet_proved={verdict['sheet_proved_fraction']:.1%} "
                f"violations={verdict['violation_count']} "
                f"stealth_suspect={stealth_suspect}"
            )

    payload = {
        "base": base_path,
        "sheet": sheet_name,
        "stealth_sheet": stealth_sheet,
        "seconds": round(time.monotonic() - started, 1),
        "sound_total": sum(1 for r in results if r["sound"]),
        "instances_total": len(results),
        "refusals": refusals,
        "instances": results,
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    print(json.dumps({k: v for k, v in payload.items() if k != "instances"}, indent=1))
    return 0 if payload["sound_total"] == payload["instances_total"] else 1


def run_pair(old_path: str, new_path: str, out_path: str) -> int:
    started = time.monotonic()
    old_book = read_workbook(old_path)
    new_book = read_workbook(new_path)
    old_raw, _ = read_raw(old_path)
    new_raw, _ = read_raw(new_path)
    proof = proved_unchanged(old_book, new_book)
    violations = _soundness(proof, old_raw, new_raw)
    _clear_caches()

    payload = {
        "old": old_path,
        "new": new_path,
        "seconds": round(time.monotonic() - started, 1),
        "proved": len(proof.proved),
        "suspects": len(proof.suspects),
        "proved_fraction": round(proof.proved_fraction, 4),
        "violations": violations[:20],
        "violation_count": len(violations),
        "per_sheet": {
            sheet: {"proved": proved, "cells": total}
            for sheet, (proved, total) in sorted(proof.per_sheet.items())
        },
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    print(json.dumps({k: v for k, v in payload.items() if k != "per_sheet"}, indent=1))
    return 0 if not violations else 1


def main() -> int:
    mode = sys.argv[1]
    if mode == "planted":
        return run_planted(*sys.argv[2:6])
    if mode == "pair":
        return run_pair(*sys.argv[2:5])
    if mode == "tier2":
        return run_tier2(*sys.argv[2:5])
    raise SystemExit(f"unknown mode {mode!r}")


# --- C4 tier 2: randomized differential evaluation (registered in the
# --- lane log, « C4 tier 2 ») -----------------------------------------

TIER2_SEED = 20260826
TIER2_TRIALS = 5
TIER2_DIVERGENCE = 1e-9
TIER2_CLASSES = (
    "tail_hardcode",
    "conditional_divergence",
    "equivalent_rewrite",
    "stealth_literal",
)


def _coordinate(cell: object) -> str:
    from openpyxl.utils import get_column_letter

    return f"{get_column_letter(cell.column)}{cell.row}"  # type: ignore[attr-defined]


def _diverges(old: object, new: object) -> bool:
    numbers = (int, float)
    if (
        isinstance(old, numbers)
        and isinstance(new, numbers)
        and not isinstance(old, bool)
        and not isinstance(new, bool)
    ):
        if old == new:
            return False
        scale = max(abs(old), abs(new), 1e-300)
        return abs(new - old) / scale > TIER2_DIVERGENCE
    return str(old) != str(new)


def run_tier2(base_path: str, sheet_name: str, out_path: str) -> int:
    import random

    from polar.tieout.recalc import prescan, volatile_cone
    from polar.tieout.recalc.uno_calc import UnoCalculator

    base = Path(base_path)
    book = read_workbook(base_path)

    hits = prescan(book.cells)
    if hits:
        refusal = {
            "refused": f"denylist: {len(hits)} hits",
            "sample": [f"{h.ref}: {h.target}" for h in hits[:5]],
        }
        Path(out_path).write_text(json.dumps(refusal, indent=1))
        print(json.dumps(refusal, indent=1))
        return 1
    _, cone = volatile_cone(book.cells)

    on_sheet = sorted(
        (cell for cell in book.cells.values() if cell.sheet == sheet_name),
        key=lambda cell: (cell.row, cell.column),
    )
    rows = sorted({cell.row for cell in on_sheet})
    marks = (rows[len(rows) // 4], rows[3 * len(rows) // 4])

    def formula_target(mark: int) -> tuple[str, str]:
        for cell in on_sheet:
            if cell.row >= mark and cell.formula and cell.value is not None:
                return _coordinate(cell), cell.formula
        raise SystemExit(f"no numeric formula at or after row {mark}")

    def literal_target(mark: int, *, nonzero: bool) -> tuple[str, float]:
        for cell in on_sheet:
            if cell.row >= mark and cell.formula is None and cell.value is not None:
                if nonzero and cell.value == 0:
                    continue
                return _coordinate(cell), float(cell.value)
        raise SystemExit(f"no {'nonzero ' if nonzero else ''}literal after {mark}")

    literals = {
        _coordinate(cell): float(cell.value)
        for cell in on_sheet
        if cell.formula is None and cell.value is not None
    }
    rng = random.Random(TIER2_SEED)
    trials = []
    for _ in range(TIER2_TRIALS):
        assignment = {}
        for coordinate in sorted(literals):
            current = literals[coordinate]
            if current == 0:
                assignment[coordinate] = rng.uniform(-1.0, 1.0)
            else:
                assignment[coordinate] = current * rng.uniform(0.5, 1.5)
        trials.append(assignment)

    def edited_formula(kind: str, body: str, mark: int) -> str:
        if kind == "tail_hardcode":
            return f"=({body})-0.490096707821704"
        if kind == "equivalent_rewrite":
            return f"=({body})*2/2"
        if kind == "conditional_divergence":
            input_coordinate, current = literal_target(mark, nonzero=True)
            threshold = 1.4 * current
            return f"=IF({input_coordinate}>{threshold!r},({body})*1.01,({body}))"
        raise ValueError(kind)

    def build(
        target: Path,
        edit: tuple[str, str | float] | None,
        assignment: dict[str, float],
    ) -> None:
        working = openpyxl.load_workbook(base)
        sheet = working[sheet_name]
        if edit is not None:
            coordinate, formula = edit
            sheet[coordinate] = formula
        for coordinate, value in assignment.items():
            sheet[coordinate] = value
        working.save(target)

    instances: list[tuple[str, int, tuple[str, str | float]]] = []
    for kind in TIER2_CLASSES:
        for mark in marks:
            if kind == "stealth_literal":
                coordinate, current = literal_target(mark, nonzero=False)
                instances.append((kind, mark, (coordinate, current + 7)))
            else:
                coordinate, formula = formula_target(mark)
                body = formula[1:] if formula.startswith("=") else formula
                instances.append(
                    (kind, mark, (coordinate, edited_formula(kind, body, mark)))
                )

    started = time.monotonic()
    results = []
    calc = UnoCalculator()
    calc.start()
    try:
        with tempfile.TemporaryDirectory() as scratch:
            old_values = []
            for index, assignment in enumerate(trials):
                target = Path(scratch) / f"old_{index}.xlsx"
                build(target, None, assignment)
                old_values.append(calc.recalculate(str(target)).values)
                target.unlink()
            for kind, mark, edit in instances:
                per_trial = []
                sample: list[str] = []
                for index, assignment in enumerate(trials):
                    target = Path(scratch) / f"new_{kind}_{mark}_{index}.xlsx"
                    build(target, edit, assignment)
                    new_values = calc.recalculate(str(target)).values
                    target.unlink()
                    old_trial = old_values[index]
                    divergent = [
                        ref
                        for ref in new_values.keys() & old_trial.keys()
                        if ref not in cone
                        and _diverges(old_trial[ref], new_values[ref])
                    ]
                    per_trial.append(len(divergent))
                    if divergent and len(sample) < 6:
                        sample.extend(sorted(divergent)[:3])
                caught = sum(1 for n in per_trial if n)
                verdict = {
                    "kind": kind,
                    "mark": mark,
                    "edit_at": f"{sheet_name}!{edit[0]}",
                    "trials_diverged": caught,
                    "trials": TIER2_TRIALS,
                    "divergent_cells_per_trial": per_trial,
                    "caught": caught > 0,
                    "sample": sample[:6],
                }
                results.append(verdict)
                print(
                    f"[{'CAUGHT' if verdict['caught'] else 'silent'}] "
                    f"{kind} @ {verdict['edit_at']}  trials {caught}/{TIER2_TRIALS} "
                    f"cells/trial {per_trial}"
                )
    finally:
        calc.stop()

    false_positives = [
        r for r in results if r["kind"] == "equivalent_rewrite" and r["caught"]
    ]
    payload = {
        "base": base_path,
        "sheet": sheet_name,
        "engine": "LibreOffice 25.8 (UNO)",
        "seconds": round(time.monotonic() - started, 1),
        "trials": TIER2_TRIALS,
        "seed": TIER2_SEED,
        "perturbed_literals": len(literals),
        "volatile_cone": len(cone),
        "false_positives": len(false_positives),
        "by_class": {
            kind: [r["trials_diverged"] for r in results if r["kind"] == kind]
            for kind in TIER2_CLASSES
        },
        "instances": results,
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    print(json.dumps({k: v for k, v in payload.items() if k != "instances"}, indent=1))
    return 0 if not false_positives else 1


if __name__ == "__main__":
    sys.exit(main())
