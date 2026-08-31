"""The control for propagation's « 0 conflicts »: plant unit mismatches.

    cd server && uv run python -m scripts.recalc_units_control OUT.json [PLANTS]

Zero conflicts on a real model is only worth reporting if the detector
can conflict at all. So: take the model's own declared units, corrupt
**one seed row's scale** at a time — the mistake a modeller actually
makes, a « £ » row summed into a « £m » column — and ask whether
propagation names the formula that adds them.

Registered before the run (lane log, 28 Aug): a plant is *caught*
only when a conflict is reported **at the planted formula's own
ref**; a conflict elsewhere is blast radius, counted separately and
never counted as a catch. Predicted catch rate ≥ 90%.
"""

import json
import random
import sys
from dataclasses import replace
from pathlib import Path

from polar.tieout.units.inference import UnitLabel, propagate
from polar.tieout.workbook import read_workbook
from scripts.recalc_units_score import MODELS, truth_from_units, units_column


def seeds_for(path: str) -> tuple[dict, dict[str, UnitLabel]]:
    declared = units_column(path)
    cells = read_workbook(path).cells
    seeds: dict[str, UnitLabel] = {}
    for ref, cell in cells.items():
        if cell.formula is not None:
            continue
        text = declared.get((cell.sheet, cell.row))
        truth = truth_from_units(text) if text else None
        if truth:
            seeds[ref] = UnitLabel(**truth, why=f"declared « {text} »", declared=True)
    return cells, seeds


def targets(cells: dict, known: dict[str, UnitLabel]) -> list[tuple[str, str]]:
    """(sum, one of its terms) where the clean pass agreed every term is £m.

    Such a formula gives a plant a clean chance: one term is made to
    disagree and nothing else about the model changes.
    """
    found = []
    for ref, cell in cells.items():
        if cell.formula is None or any(c in (cell.formula or "") for c in "*/^"):
            continue
        precedents = [p for p in (cell.precedents or ()) if p in cells]
        if len(precedents) < 2 or not all(p in known for p in precedents):
            continue
        if {(known[p].currency, known[p].scale) for p in precedents} != {
            ("GBP", "millions")
        }:
            continue
        found.append((ref, precedents[0]))
    return found


def declared_ancestor(
    cells: dict, seeds: dict[str, UnitLabel], start: str, limit: int = 400
) -> str | None:
    """The nearest declared input row the cell's value comes from."""
    queue, seen = [start], {start}
    while queue and len(seen) < limit:
        ref = queue.pop(0)
        if ref in seeds:
            return ref
        cell = cells.get(ref)
        for p in (getattr(cell, "precedents", ()) or ()) if cell else ():
            if p not in seen:
                seen.add(p)
                queue.append(p)
    return None


def descends_from(cells: dict, ref: str, ancestor: str, limit: int = 2000) -> bool:
    """Is `ancestor` upstream of `ref`? — the unobservable-plant test.

    A plant is unobservable when the sum's *other* terms are computed
    from the planted one: the corruption reaches both sides, they
    agree, and there is no disagreement left to see. That is not a
    miss by the detector, and it is counted apart rather than
    argued away in prose.
    """
    queue, seen = [ref], {ref}
    while queue and len(seen) < limit:
        cell = cells.get(queue.pop(0))
        for p in (getattr(cell, "precedents", ()) or ()) if cell else ():
            if p == ancestor:
                return True
            if p not in seen:
                seen.add(p)
                queue.append(p)
    return False


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("units-control.json")
    plants = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    report = {}
    for key, path in MODELS.items():
        cells, seeds = seeds_for(path)
        clean, clean_conflicts = propagate(cells, seeds)
        candidates = targets(cells, clean)
        rng = random.Random(4)
        chosen = rng.sample(candidates, min(plants, len(candidates)))
        near_caught, near_missed, unobservable = [], [], []
        far_planted, far_caught, far_missed, radius = 0, [], [], []
        for formula_ref, term_ref in chosen:
            # A — the rule itself: make one term disagree outright.
            corrupted = dict(seeds)
            corrupted[term_ref] = replace(
                clean[term_ref],
                scale="units",
                why="planted: « £ » where the sheet says « £m »",
            )
            _, conflicts = propagate(cells, corrupted)
            hits = {c.ref for c in conflicts}
            if formula_ref in hits:
                near_caught.append(formula_ref)
            elif all(
                p == term_ref or descends_from(cells, p, term_ref)
                for p in (cells[formula_ref].precedents or ())
                if p in cells
            ):
                unobservable.append(formula_ref)
            else:
                near_missed.append(formula_ref)

            # B — end to end: corrupt the declared input row the term
            # comes from, and let the mismatch travel on its own.
            ancestor = declared_ancestor(cells, seeds, term_ref)
            if ancestor is None:
                continue
            far_planted += 1
            corrupted = dict(seeds)
            corrupted[ancestor] = replace(
                seeds[ancestor],
                scale="units",
                why="planted: a declared « £m » row restated as « £ »",
            )
            _, conflicts = propagate(cells, corrupted)
            radius.append(len(conflicts))
            (far_caught if conflicts else far_missed).append(ancestor)
        report[key] = {
            "clean_conflicts": len(clean_conflicts),
            "candidate_formulas": len(candidates),
            "plants": len(chosen),
            "near_caught": len(near_caught),
            "near_missed": len(near_missed),
            "near_unobservable": len(unobservable),
            "near_missed_refs": near_missed[:10],
            "far_planted": far_planted,
            "far_caught": len(far_caught),
            "far_missed": len(far_missed),
            "conflicts_per_far_plant_median": sorted(radius)[len(radius) // 2]
            if radius
            else 0,
        }
        print(
            f"{key}: clean conflicts {len(clean_conflicts)}; "
            f"{len(chosen)} plants of {len(candidates)} candidate sums; "
            f"at the sum: caught {len(near_caught)}, "
            f"unobservable {len(unobservable)}, missed {len(near_missed)}; "
            f"from the declared row ({far_planted} reachable): "
            f"caught {len(far_caught)}, missed {len(far_missed)}, "
            f"median conflicts {report[key]['conflicts_per_far_plant_median']}"
        )
        for ref in near_missed[:5]:
            print(f"    missed at the sum: {ref}  {cells[ref].formula}")
    out.write_text(json.dumps(report, indent=1))
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
