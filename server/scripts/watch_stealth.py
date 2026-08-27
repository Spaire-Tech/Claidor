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
import re
import sys
import tempfile
import time
from collections.abc import Mapping
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
#: Round 2 (registered): an integer-valued literal of small
#: magnitude is a flag, a switch, a month or a licensee index —
#: scaling it deadens the path it selects in *both* files, which is
#: how round 1 lost its stealth instances. Declared crude on
#: purpose; the counts under each class are reported.
CATEGORICAL_LIMIT = 12


#: `CHOOSE($B$3, ENWL!X, NPgN!X, …)` — the shape that decides which
#: licensee branch an ED2-style model is currently about. Group 1 is
#: the index cell, group 2 the argument list.
_CHOOSE = re.compile(
    r"CHOOSE\(\s*(\$?[A-Z]{1,3}\$?\d{1,7})\s*,(.+)\)\s*$",
    re.IGNORECASE | re.DOTALL,
)


def _selector_index(cells: Mapping[str, object], sheet: str) -> tuple[str, int] | None:
    """(index cell ref, 1-based argument position) for the sheet under
    edit, or None when no selector names it. Round D: a dead branch is
    an *unselected* one, and one cell says which."""
    for ref, cell in cells.items():
        formula = getattr(cell, "formula", None)
        if not formula or "CHOOSE" not in formula.upper():
            continue
        found = _CHOOSE.search(formula)
        if not found:
            continue
        arguments = [piece.strip() for piece in found.group(2).split(",")]
        for position, argument in enumerate(arguments, start=1):
            name = argument.split("!")[0].strip().strip("'")
            if name == sheet:
                index_sheet = ref.split("!")[0]
                index_cell = found.group(1).replace("$", "")
                return f"{index_sheet}!{index_cell}", position
    return None


class _NoTarget(Exception):
    """No cell on this sheet can host this instance — a refusal, in
    the report, never a silent substitution or a zero."""


def _is_categorical(value: float) -> bool:
    return float(value).is_integer() and abs(value) <= CATEGORICAL_LIMIT


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


#: Environment-reading functions: their values reflect the file's own
#: path or the machine, not the model's behaviour — Cover!G4 prints
#: the workbook's filename through CELL("filename") and diverged in
#: every round-1 comparison because the harness's scratch files have
#: different names.
ENVIRONMENT_FUNCTIONS = frozenset({"CELL", "INFO"})


def _environment_cone(
    raw: Mapping[str, tuple[str, str]], cells: Mapping[str, object]
) -> tuple[frozenset[str], frozenset[str]]:
    """Roots calling CELL/INFO plus every dependent, per the same
    tokenized discipline as Dynamo's volatile scan (recalc/ stays
    Dynamo's; this cone is the harness's own)."""
    from openpyxl.formula.tokenizer import Token, Tokenizer

    def calls_environment(formula: str) -> bool:
        try:
            tokens = Tokenizer(formula).items
        except Exception:
            return False
        for token in tokens:
            if token.type == Token.FUNC and token.subtype == Token.OPEN:
                name = token.value.rstrip("(").upper()
                name = name.removeprefix("_XLFN.").lstrip("@")
                if name in ENVIRONMENT_FUNCTIONS:
                    return True
        return False

    roots = {
        ref
        for ref, (content, _) in raw.items()
        if content.startswith("f:") and calls_environment(content[2:])
    }
    dependents: dict[str, list[str]] = {}
    for ref, cell in cells.items():
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
    return frozenset(roots), frozenset(cone)


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
    _, volatile = volatile_cone(book.cells)
    base_raw, _ = read_raw(base_path)
    environment_roots, environment = _environment_cone(base_raw, book.cells)
    raw_has_environment = any(
        content.startswith("f:")
        and ("CELL(" in content.upper() or "INFO(" in content.upper())
        for content, _ in base_raw.values()
    )
    if raw_has_environment and not environment_roots:
        raise SystemExit(
            "instrument error: the raw grid holds CELL()/INFO() formulas "
            "but the environment cone found no roots"
        )
    cone = frozenset(volatile | environment)

    on_sheet = sorted(
        (cell for cell in book.cells.values() if cell.sheet == sheet_name),
        key=lambda cell: (cell.row, cell.column),
    )
    rows = sorted({cell.row for cell in on_sheet})
    marks = (rows[len(rows) // 4], rows[3 * len(rows) // 4])

    def formula_target(mark: int) -> tuple[str, str]:
        for start in (mark, 0):
            for cell in on_sheet:
                if cell.row >= start and cell.formula and cell.value is not None:
                    return _coordinate(cell), cell.formula
        raise SystemExit("no numeric formula anywhere on the sheet")

    fed: set[str] = set()
    for engine_cell in book.cells.values():
        fed.update(engine_cell.precedents or ())

    def literal_target(
        mark: int, *, nonzero: bool, scaled: bool = False
    ) -> tuple[str, float]:
        """Round 3: the literal must feed at least one formula — a
        spare-row zero that nothing reads demonstrates nothing.
        Round A: `scaled` additionally demands a literal the trial
        assignment actually perturbs, because a threshold input the
        categorical rule freezes can never activate its condition."""
        for start in (mark, 0):
            for cell in on_sheet:
                if (
                    cell.row >= start
                    and cell.formula is None
                    and cell.value is not None
                ):
                    if nonzero and cell.value == 0:
                        continue
                    if scaled and _is_categorical(float(cell.value)):
                        continue
                    if cell.ref not in fed:
                        continue
                    return _coordinate(cell), float(cell.value)
        raise _NoTarget(
            "no feeding "
            + ("scaled " if scaled else "")
            + "literal anywhere on the sheet"
        )

    all_literals = {
        _coordinate(cell): float(cell.value)
        for cell in on_sheet
        if cell.formula is None and cell.value is not None
    }
    literals = {
        coordinate: value
        for coordinate, value in all_literals.items()
        if not _is_categorical(value)
    }
    categorical = len(all_literals) - len(literals)
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

    conditional_inputs: dict[int, tuple[str, float]] = {}

    def edited_formula(kind: str, body: str, mark: int) -> str:
        if kind == "tail_hardcode":
            return f"=({body})-0.490096707821704"
        if kind == "equivalent_rewrite":
            return f"=({body})*2/2"
        if kind == "conditional_divergence":
            input_coordinate, current = literal_target(mark, nonzero=True, scaled=True)
            conditional_inputs[mark] = (input_coordinate, current)
            threshold = 1.4 * current
            return f"=IF({input_coordinate}>{threshold!r},({body})*1.01,({body}))"
        raise ValueError(kind)

    selector = _selector_index(book.cells, sheet_name)

    def build(
        target: Path,
        edit: tuple[str, str | float] | None,
        assignment: dict[str, float],
        force: bool = False,
    ) -> None:
        working = openpyxl.load_workbook(base)
        #: Round D: force the model's own selector onto this sheet's
        #: branch. A declared intervention — it overwrites the index
        #: cell's formula with the literal — and every instance it
        #: touches says so in the report.
        if force and selector is not None:
            selector_ref, selector_index = selector
            selector_sheet, selector_cell = selector_ref.split("!")
            working[selector_sheet][selector_cell] = selector_index
        sheet = working[sheet_name]
        for coordinate, value in assignment.items():
            sheet[coordinate] = value
        #: Edit after assignment (round 2): a stealth retype adds its 7
        #: to the perturbed value instead of being overwritten by it.
        if edit is not None:
            coordinate, payload = edit
            if isinstance(payload, str):
                sheet[coordinate] = payload
            else:
                sheet[coordinate] = assignment.get(coordinate, payload) + 7.0
        working.save(target)

    refusals: list[dict[str, str]] = []
    instances: list[tuple[str, int, tuple[str, str | float]]] = []
    for kind in TIER2_CLASSES:
        for mark in marks:
            try:
                if kind == "stealth_literal":
                    coordinate, current = literal_target(mark, nonzero=False)
                    instances.append((kind, mark, (coordinate, current)))
                else:
                    coordinate, formula = formula_target(mark)
                    body = formula[1:] if formula.startswith("=") else formula
                    instances.append(
                        (kind, mark, (coordinate, edited_formula(kind, body, mark)))
                    )
            except _NoTarget as absent:
                refusals.append(
                    {"kind": kind, "mark": str(mark), "refused": str(absent)}
                )

    def probe_edit(coordinate: str) -> tuple[str, str | float]:
        """A generic perturbation of one cell — never a class edit, so
        the equivalent-rewrite control is never probed to death."""
        cell = next(c for c in on_sheet if _coordinate(c) == coordinate)
        if cell.formula:
            body = cell.formula[1:] if cell.formula.startswith("=") else cell.formula
            return coordinate, f"=({body})+1"
        return coordinate, float(cell.value) if cell.value is not None else 0.0

    started = time.monotonic()
    results = []
    calc = UnoCalculator()
    calc.start()
    try:
        with tempfile.TemporaryDirectory() as scratch:
            #: The registered liveness probe: a position is eligible
            #: only if perturbing it moves something the driver reads.
            #: Round 1 spent a whole grid on an unselected licensee
            #: branch; a probe is one recalculation against that.
            probe_base = Path(scratch) / "probe_base.xlsx"
            build(probe_base, None, {})
            probe_values = calc.recalculate(str(probe_base)).values
            probe_base.unlink()
            live: dict[str, bool] = {}
            forced: set[str] = set()
            for _kind, _mark, edit in instances:
                coordinate = edit[0]
                if coordinate in live:
                    continue
                target = Path(scratch) / f"probe_{coordinate}.xlsx"
                build(target, probe_edit(coordinate), {})
                probed = calc.recalculate(str(target)).values
                target.unlink()
                live[coordinate] = any(
                    ref not in cone and _diverges(probe_values[ref], probed[ref])
                    for ref in probed.keys() & probe_values.keys()
                )
                #: Round D: a dead position gets one more chance —
                #: with its own branch selected. Still dead then, and
                #: it is dead for a reason that is not the selector.
                if not live[coordinate] and selector is not None:
                    forced_base = Path(scratch) / "probe_base_forced.xlsx"
                    build(forced_base, None, {}, force=True)
                    forced_values = calc.recalculate(str(forced_base)).values
                    forced_base.unlink()
                    target = Path(scratch) / f"probe_forced_{coordinate}.xlsx"
                    build(target, probe_edit(coordinate), {}, force=True)
                    probed_forced = calc.recalculate(str(target)).values
                    target.unlink()
                    if any(
                        ref not in cone
                        and _diverges(forced_values[ref], probed_forced[ref])
                        for ref in probed_forced.keys() & forced_values.keys()
                    ):
                        live[coordinate] = True
                        forced.add(coordinate)
                print(
                    f"[probe] {sheet_name}!{coordinate}: "
                    f"{'live' if live[coordinate] else 'DEAD'}"
                    + (" (selector forced)" if coordinate in forced else "")
                )
            for _kind, _mark, edit in instances:
                if not live[edit[0]]:
                    refusals.append(
                        {
                            "kind": _kind,
                            "at": f"{sheet_name}!{edit[0]}",
                            "refused": "dead under the file's saved state "
                            "(liveness probe moved nothing the driver reads)",
                        }
                    )
            instances = [item for item in instances if live[item[2][0]]]
            old_values = []
            for index, assignment in enumerate(trials):
                target = Path(scratch) / f"old_{index}.xlsx"
                build(target, None, assignment)
                old_values.append(calc.recalculate(str(target)).values)
                target.unlink()
            #: A forced old side is a different old side, so it gets
            #: its own trials — computed only when forcing is in play.
            old_forced: list[Mapping[str, float | str | None]] = []
            if forced:
                for index, assignment in enumerate(trials):
                    target = Path(scratch) / f"old_forced_{index}.xlsx"
                    build(target, None, assignment, force=True)
                    old_forced.append(calc.recalculate(str(target)).values)
                    target.unlink()
            for kind, mark, edit in instances:
                per_trial = []
                sample: list[str] = []
                force = edit[0] in forced
                for index, assignment in enumerate(trials):
                    target = Path(scratch) / f"new_{kind}_{mark}_{index}.xlsx"
                    build(target, edit, assignment, force=force)
                    new_values = calc.recalculate(str(target)).values
                    target.unlink()
                    old_trial = old_forced[index] if force else old_values[index]
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
                factors = None
                if kind == "conditional_divergence" and mark in conditional_inputs:
                    input_coordinate, current = conditional_inputs[mark]
                    factors = [
                        round(trial_assignment[input_coordinate] / current, 3)
                        for trial_assignment in trials
                        if input_coordinate in trial_assignment and current
                    ]
                verdict = {
                    "kind": kind,
                    "mark": mark,
                    "input_factors": factors,
                    "selector_forced": (selector[1] if force and selector else None),
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
        "categorical_literals_left_alone": categorical,
        "refusals": refusals,
        "volatile_cone": len(volatile),
        "selector": ({"cell": selector[0], "index": selector[1]} if selector else None),
        "selector_forced_positions": sorted(forced),
        "environment_roots": sorted(environment_roots),
        "environment_cone": len(environment),
        "false_positives": len(false_positives),
        "eligible_instances": len(results),
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
