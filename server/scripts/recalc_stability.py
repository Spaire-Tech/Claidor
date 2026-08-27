"""B5's two stability preconditions — the gates C6 waits on.

    cd server && uv run python -m scripts.recalc_stability MODEL OUT.json [RUNS]

The plan's third amendment (27 Aug) makes these **binding before any
C6 diff code exists anywhere**, and cheap enough to run first:

1. **Seed stability** — mine one unmodified model five times under
   five seeds. The rule sets must agree, or « v12 broke a rule » is
   seed noise rather than a finding.
2. **Cosmetic invariance** — insert blank rows, rename a sheet,
   reformat a block; the mined rule sets must be **identical**, or
   the claimed advantage over positional diff is unproven.

The comparison is **by label, never by cell reference**. That is not
a convenience: inserting rows moves every downstream cell, so a
reference-keyed comparison would report total disagreement for a
model that behaves identically — which is precisely the failure of
positional diffing that behavioural mining is supposed to escape. A
rule is identified by the (sign, row label, column label) triples of
its terms.

Cosmetic edits are made **by the engine** (`UnoCalculator.cosmetic`),
so inserted rows carry their formulas; a file library that shifted
cells without rewriting references would produce a broken model and
a meaningless test.
"""

import json
import random
import sys
import time
from dataclasses import replace
from pathlib import Path
from typing import Any

from polar.tieout.recalc.mine import (
    Rule,
    cleanse,
    mine_signed_sums,
    sample,
)
from polar.tieout.recalc.uno_calc import UnoCalculator, find_install
from polar.tieout.workbook import read_workbook
from scripts.recalc_mine import MODELS


def signature(
    rule: Rule, labels: dict[str, tuple[str, str]]
) -> tuple[tuple[Any, ...], ...]:
    """A rule's identity in the model's own words, not its geometry."""
    return tuple(
        sorted(
            (coefficient, *labels.get(ref, (ref, "")))
            for ref, coefficient in rule.terms
        )
    )


def mine_once(
    calculator: UnoCalculator,
    path: Path,
    sheet: str,
    typing: Any,
    runs: int,
    seed: int,
    typed_override: Any = None,
) -> tuple[list[Rule], dict[str, tuple[str, str]], dict[str, int], Any]:
    book = read_workbook(str(path))
    cells = book.cells
    constants = {
        ref: float(cell.value)
        for ref, cell in cells.items()
        if cell.formula is None and cell.value is not None
    }
    typed = typed_override if typed_override is not None else typing(constants)
    watched = sorted(
        ref for ref, cell in cells.items() if cell.sheet == sheet and cell.formula
    )
    labels = {
        ref: ((cells[ref].row_label or ""), (cells[ref].column_label or ""))
        for ref in watched
    }
    rng = random.Random(seed)
    kept: list[dict[str, float]] = []
    drops = {"engine-error": 0, "failed": 0}
    calculator.open(str(path))
    try:
        for _ in range(runs):
            try:
                values = calculator.set_and_recalculate(
                    sample(typed, rng), sheets=[sheet]
                ).values
            except Exception:
                drops["failed"] += 1
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
    finally:
        calculator.close()
    return cleanse(mine_signed_sums(kept, watched)), labels, drops, typed


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    key, out = sys.argv[1], Path(sys.argv[2])
    runs = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    if find_install() is None:
        print("no LibreOffice >= 25.8 here — refusing")
        return 1
    path_str, sheet, typing = MODELS[key]
    source = Path(path_str)
    work = out.parent / f"{out.stem}-work"
    work.mkdir(parents=True, exist_ok=True)

    calculator = UnoCalculator(document_timeout=1800)
    calculator.start()
    record: dict[str, Any] = {"model": source.name, "runs": runs}
    started = time.monotonic()
    try:
        # --- 1. seed stability -------------------------------------
        seeds = [11, 22, 33, 44, 55]
        sets = []
        for seed in seeds:
            rules, labels, drops, _ = mine_once(
                calculator, source, sheet, typing, runs, seed
            )
            sets.append({signature(rule, labels) for rule in rules})
            print(f"seed {seed}: {len(rules)} rules, drops {drops}", flush=True)
        common = set.intersection(*sets) if sets else set()
        union = set.union(*sets) if sets else set()
        record["seed_stability"] = {
            "seeds": seeds,
            "counts": [len(s) for s in sets],
            "in_all_five": len(common),
            "in_any": len(union),
            "identical": all(s == sets[0] for s in sets),
        }
        print(
            f"seed stability: {[len(s) for s in sets]} rules, "
            f"{len(common)} in all five, identical={record['seed_stability']['identical']}",
            flush=True,
        )

        # --- 2. cosmetic invariance --------------------------------
        variant = work / f"{source.stem}-cosmetic.xlsx"
        calculator.cosmetic(
            str(source),
            {
                # Rows inserted *above* the modelled block, so every
                # watched cell moves — the whole point of the test.
                "insert_rows": [{"sheet": sheet, "at": 0, "count": 3}],
                "rename": [{"from": sheet, "to": f"{sheet} (renamed)"}],
            },
            str(variant),
        )
        renamed = f"{sheet} (renamed)"
        base_rules, base_labels, _, base_typed = mine_once(
            calculator, source, sheet, typing, runs, seed=11
        )
        # The typing is done once on the original and *translated* to
        # the variant's coordinates — three rows down, on the renamed
        # sheet. Re-deriving it from the variant would ask the typing
        # to recognise cells that have moved, which is a different
        # (and later) question than whether the mining is invariant.
        shifted = []
        for item in base_typed:
            _, _, at = item.ref.partition("!")
            column = "".join(c for c in at if c.isalpha())
            row = int("".join(c for c in at if c.isdigit())) + 3
            shifted.append(replace(item, ref=f"{renamed}!{column}{row}"))
        var_rules, var_labels, var_drops, _ = mine_once(
            calculator, variant, renamed, typing, runs, seed=11, typed_override=shifted
        )
        base_set = {signature(r, base_labels) for r in base_rules}
        var_set = {signature(r, var_labels) for r in var_rules}
        record["cosmetic_invariance"] = {
            "variant": variant.name,
            "edits": "3 blank rows inserted at the top, sheet renamed",
            "rules_original": len(base_set),
            "rules_variant": len(var_set),
            "identical_by_label": base_set == var_set,
            "only_in_original": len(base_set - var_set),
            "only_in_variant": len(var_set - base_set),
            "drops": var_drops,
        }
        print(
            f"cosmetic invariance: {len(base_set)} vs {len(var_set)} rules, "
            f"identical={base_set == var_set}",
            flush=True,
        )
    finally:
        calculator.stop()

    record["seconds"] = round(time.monotonic() - started, 1)
    out.write_text(json.dumps(record, indent=1))
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
