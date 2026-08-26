"""C4's planted-stealth-edit harness, and the soundness gate.

Registered in `docs/pierce/logs/prism.md` (« C4 registration,
round 1 ») before this code existed. Two modes:

    uv run python -m scripts.watch_stealth planted BASE.xlsx SHEET OUT.json
    uv run python -m scripts.watch_stealth pair OLD.xlsx NEW.xlsx OUT.json

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


def run_planted(base_path: str, sheet_name: str, out_path: str) -> int:
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

    instances: list[tuple[str | None, int]] = [
        (None, position) for position in quartiles
    ]
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
            stealth_ref = _stealth_retype(book[sheet_name], stealth_row)
            book.save(target)
            _reinject_values(base, target, sheet_name, planted)

            new_book = read_workbook(str(target))
            new_raw, _ = read_raw(str(target))
            proof = proved_unchanged(base_book, new_book)
            violations = _soundness(proof, base_raw, new_raw)
            stealth_full = f"{sheet_name}!{stealth_ref}"
            stealth_suspect = stealth_full not in proof.proved
            #: The whole-file fraction is diluted by an instrument
            #: artifact — value re-injection restores cached values on
            #: the edited sheet only, so other sheets' formula cells
            #: are suspects for the planter's reasons, not the
            #: proof's. The edited sheet's own fraction is the number
            #: that means something; both are reported.
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
        "seconds": round(time.monotonic() - started, 1),
        "sound_total": sum(1 for r in results if r["sound"]),
        "instances_total": len(results),
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
        return run_planted(*sys.argv[2:5])
    if mode == "pair":
        return run_pair(*sys.argv[2:5])
    raise SystemExit(f"unknown mode {mode!r}")


if __name__ == "__main__":
    sys.exit(main())
