"""B5 round 1b — three gate-clean models, both rule families, read aloud.

    cd server && uv run python -m scripts.recalc_round1b OUT.json [RUNS]

The AHA's Monday experiment asks for three gate-clean models with
hand-typed inputs, and round 1's reading asked for a second rule
family. This runs both families (`mine_signed_sums` and the
registered `mine_ratios`) over the RoE summary and the H7 pair,
twice per model under two seeds, and keeps only what both minings
found — then prints the surviving rules as sentences, because the
test of this round is whether a modeller recognises the model in
them, not a score.
"""

import json
import random
import sys
from pathlib import Path

from polar.tieout.recalc.mine import cleanse, mine_ratios, mine_signed_sums, sample
from polar.tieout.recalc.uno_calc import UnoCalculator
from polar.tieout.workbook import read_workbook
from scripts.recalc_mine import MODELS

OUT = Path(sys.argv[1])
RUNS = int(sys.argv[2]) if len(sys.argv) > 2 else 200
report = {}
for key in ("roe", "h7-fds", "h7-fp"):
    path, sheet, typing = MODELS[key]
    cells = read_workbook(path).cells
    constants = {
        r: float(c.value)
        for r, c in cells.items()
        if c.formula is None and c.value is not None
    }
    typed = typing(constants)
    watched = sorted(r for r, c in cells.items() if c.sheet == sheet and c.formula)

    def name(ref):
        c = cells[ref]
        row, col = (c.row_label or "").strip(), (c.column_label or "").strip()
        at = ref.split("!")[1]
        return f"{row or at}" + (f" [{col}]" if col else f" [{at}]")

    labels = {r: name(r) for r in watched}
    print(
        f"\n=== {key}: {len(typed)} typed inputs, {len(watched)} watched cells",
        flush=True,
    )
    calc = UnoCalculator(document_timeout=1800)
    calc.start()
    kept, drops = [], 0
    try:
        calc.open(path)
        for seed in (11, 22):
            rng = random.Random(seed)
            runs = []
            for _ in range(RUNS):
                try:
                    v = calc.set_and_recalculate(
                        sample(typed, rng), sheets=[sheet]
                    ).values
                except Exception:
                    drops += 1
                    continue
                runs.append(
                    {
                        r: x
                        for r, x in v.items()
                        if isinstance(x, float) and r in set(watched)
                    }
                )
            kept.append(runs)
        calc.close()
    finally:
        calc.stop()
    sums = [cleanse(mine_signed_sums(r, watched)) for r in kept]
    ratios = [mine_ratios(r, watched) for r in kept]
    sig_s = [
        {tuple(sorted((k, labels[ref]) for ref, k in ru.terms)) for ru in s}
        for s in sums
    ]
    sig_r = [
        {(labels[ru.numerator], labels[ru.denominator], round(ru.k, 9)) for ru in r}
        for r in ratios
    ]
    stable_s = sig_s[0] & sig_s[1]
    stable_r = sig_r[0] & sig_r[1]
    print(f"  signed sums: {[len(s) for s in sig_s]} -> {len(stable_s)} stable")
    print(
        f"  ratios     : {[len(s) for s in sig_r]} -> {len(stable_r)} stable   drops={drops}"
    )
    print("  --- stable ratio rules (first 18) ---")
    for top, bottom, k in sorted(stable_r)[:18]:
        print(
            f"    {top} = {k:.6g} × {bottom}"
            if abs(k - 1) > 1e-9
            else f"    {top} = {bottom}"
        )
    print("  --- stable signed sums (first 8) ---")
    for rule in sorted(stable_s)[:8]:
        print(
            "    "
            + " ".join(f"{'−' if k < 0 else '+'} {lab}" for k, lab in rule)
            + " = 0"
        )
    report[key] = {
        "typed": len(typed),
        "watched": len(watched),
        "drops": drops,
        "signed_sums_stable": len(stable_s),
        "ratios_stable": len(stable_r),
        "ratio_sentences": [
            f"{t} = {k:.6g} × {b}" if abs(k - 1) > 1e-9 else f"{t} = {b}"
            for t, b, k in sorted(stable_r)
        ][:60],
    }
OUT.write_text(json.dumps(report, indent=1))
print("\nwrote", OUT)
