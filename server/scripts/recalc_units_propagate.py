"""Measure how far declared units travel into a model's formulas.

    cd server && uv run python -m scripts.recalc_units_propagate OUT.json

Blind inference cannot know « £m »: neither ED2 nor GD3 has a single
currency-bearing number format, so there is no anchor to spread. But
where a model **declares** its units, propagation should carry them
from a few thousand input rows into the tens of thousands of formula
cells that use them — which is what E3 would need, and what B5 needs
to read its watched cells.

Reported: how many formula cells receive a unit, and how many sums
mix units that disagree. The second number is **evidence handed to
the lead**, not a finding — this module reports nothing to anyone.
"""

import json
import sys
from collections import Counter
from pathlib import Path

from polar.tieout.units.inference import (
    UnitLabel,
    propagate,
)
from polar.tieout.workbook import read_workbook
from scripts.recalc_units_score import MODELS, truth_from_units, units_column


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("propagate.json")
    report = {}
    for key, path in MODELS.items():
        declared = units_column(path)
        cells = read_workbook(path).cells
        seeds: dict[str, UnitLabel] = {}
        for ref, cell in cells.items():
            if cell.formula is not None:
                continue
            text = declared.get((cell.sheet, cell.row))
            truth = truth_from_units(text) if text else None
            if truth:
                seeds[ref] = UnitLabel(
                    **truth, why=f"declared « {text} »", declared=True
                )
        formulas = sum(1 for c in cells.values() if c.formula is not None)
        known, conflicts = propagate(cells, seeds)
        reached = {r for r in known if r not in seeds}
        currencies = Counter(known[r].currency for r in reached)
        report[key] = {
            "seed_cells": len(seeds),
            "formula_cells": formulas,
            "formula_cells_reached": len(reached),
            "reach_percent": round(100 * len(reached) / max(formulas, 1), 1),
            "unit_conflicts": len(conflicts),
            "conflict_sample": [
                {"ref": c.ref, "units": list(c.units)} for c in conflicts[:5]
            ],
            "currencies_reached": dict(currencies),
        }
        print(
            f"{key}: seeds {len(seeds)}, formula cells {formulas}, "
            f"reached {len(reached)} ({report[key]['reach_percent']}%), "
            f"unit conflicts {len(conflicts)}"
        )
        for c in conflicts[:4]:
            print(f"    conflict at {c.ref}: {c.units}")
    out.write_text(json.dumps(report, indent=1))
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
