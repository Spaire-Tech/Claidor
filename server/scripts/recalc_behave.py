"""B4 — the behavioural laws, measured by planted defects (the pilot).

The registered protocol (lane log, 26 Aug): selector maps quoted per
file before its defects are planted; one defect per planted copy;
baseline and perturbed copies both recalculated by LibreOffice so
stored values never enter; the laws from `polar.tieout.recalc.laws`
applied verbatim; catch and false positive defined ahead of any
number. Heavy jobs alone — one recalculation at a time.

    cd server && uv run python -m scripts.recalc_behave PILE_DIR OUT.json

`PILE_DIR` is a working directory; the pilot file and its selector
map are named in `PILOTS` below — committed, and quoted in the lane
log, before any planting run.

Definitions, registered:

- **Catch**: the law reports a violation naming the planted target
  (for consolidation, the total whose segment list was broken).
- **False positive**: any violation the same laws report on the
  *unplanted* control pair of the same file.
- A planted copy whose baseline recalculation fails its own gate
  discipline (engine error on the planted cell, load failure) is
  recorded as `unmeasurable`, never counted either way.
"""

import json
import shutil
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from polar.tieout.recalc.laws import (
    consolidation_violations,
    proportionality_violations,
    scale_invariance_violations,
    zero_input_violations,
)
from polar.tieout.recalc.uno_calc import UnoCalculator, find_install


@dataclass(frozen=True)
class Selectors:
    """Which cells play which role, from the model's own labels.

    Refs are `Sheet!A1`. `volume` and `price` are input cells
    (constants in the file); `monetary` is the wider set rescaled by
    the scale-invariance law (volume and price included as
    applicable); `revenue` are the outputs the first two laws watch;
    `ratios` must survive rescaling; `totals` maps a total output to
    its segment outputs.
    """

    volume: tuple[str, ...] = ()
    price: tuple[str, ...] = ()
    monetary: tuple[str, ...] = ()
    revenue: tuple[str, ...] = ()
    ratios: tuple[str, ...] = ()
    totals: dict[str, tuple[str, ...]] = field(default_factory=dict)


@dataclass(frozen=True)
class Plant:
    """One planted defect: the class, the cell, and the rewrite."""

    kind: str
    target: str
    #: The new formula written at `target` (openpyxl spelling, with
    #: the leading `=`). Recorded verbatim in the run record.
    formula: str


#: file path (relative to server/) → (selectors, plants). Committed
#: before running; the lane log quotes each entry it measures.
PILOTS: dict[str, tuple[Selectors, tuple[Plant, ...]]] = {}


def _split(ref: str) -> tuple[str, str]:
    sheet, at = ref.split("!", 1)
    return sheet, at


def plant(source: Path, target: Path, defect: Plant) -> None:
    book = load_workbook(source)
    sheet, at = _split(defect.target)
    book[sheet][at] = defect.formula
    book.save(target)


def perturb(source: Path, target: Path, changes: dict[str, float]) -> None:
    """Write perturbed input values; every ref must hold a constant."""
    book = load_workbook(source)
    for ref, value in changes.items():
        sheet, at = _split(ref)
        cell = book[sheet][at]
        if isinstance(cell.value, str) and cell.value.startswith("="):
            raise ValueError(f"{ref} holds a formula; selectors name inputs only")
        cell.value = value
    book.save(target)


def _inputs_zero(book_path: Path, refs: tuple[str, ...]) -> dict[str, float]:
    return dict.fromkeys(refs, 0.0)


def _inputs_scaled(
    book_path: Path, refs: tuple[str, ...], factor: float
) -> dict[str, float]:
    book = load_workbook(book_path, read_only=True)
    changes = {}
    for ref in refs:
        sheet, at = _split(ref)
        value = book[sheet][at].value
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValueError(f"{ref} does not hold a number ({value!r})")
        changes[ref] = float(value) * factor
    book.close()
    return changes


def run_laws(
    calculator: UnoCalculator,
    work: Path,
    stem: str,
    base_file: Path,
    selectors: Selectors,
) -> dict[str, Any]:
    """All four laws over one (possibly planted) file. Violations out."""
    outcomes: dict[str, Any] = {}
    baseline = calculator.recalculate(str(base_file)).values
    numeric_baseline = {
        ref: value for ref, value in baseline.items() if isinstance(value, float)
    }

    def perturbed_values(tag: str, changes: dict[str, float]) -> dict[str, float]:
        copy = work / f"{stem}-{tag}.xlsx"
        perturb(base_file, copy, changes)
        values = calculator.recalculate(str(copy)).values
        return {ref: value for ref, value in values.items() if isinstance(value, float)}

    if selectors.volume:
        zeroed = perturbed_values("vol0", _inputs_zero(base_file, selectors.volume))
        outcomes["zero-input"] = [
            vars(v) for v in zero_input_violations(zeroed, selectors.revenue)
        ]
    if selectors.price:
        doubled = perturbed_values(
            "price2", _inputs_scaled(base_file, selectors.price, 2.0)
        )
        outcomes["proportionality"] = [
            vars(v)
            for v in proportionality_violations(
                numeric_baseline, doubled, 2.0, selectors.revenue
            )
        ]
    if selectors.monetary:
        scaled = perturbed_values(
            "cents", _inputs_scaled(base_file, selectors.monetary, 100.0)
        )
        outcomes["scale-invariance"] = [
            vars(v)
            for v in scale_invariance_violations(
                numeric_baseline, scaled, selectors.ratios
            )
        ]
    if selectors.totals:
        outcomes["consolidation"] = [
            vars(v)
            for v in consolidation_violations(
                numeric_baseline,
                {total: list(segments) for total, segments in selectors.totals.items()},
            )
        ]
    return outcomes


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    work, out = Path(sys.argv[1]), Path(sys.argv[2])
    if find_install() is None:
        print("no LibreOffice >= 25.8 here — refusing")
        return 1
    if not PILOTS:
        print("no pilot registered in PILOTS; nothing to measure")
        return 1
    work.mkdir(parents=True, exist_ok=True)
    records = []
    for rel_path, (selectors, plants) in PILOTS.items():
        source = Path(rel_path)
        calculator = UnoCalculator(document_timeout=3600)
        calculator.start()
        try:
            control = work / f"control-{source.stem}.xlsx"
            shutil.copyfile(source, control)
            started = time.monotonic()
            record: dict[str, Any] = {"file": source.name}
            record["control"] = run_laws(
                calculator, work, f"control-{source.stem}", control, selectors
            )
            for i, defect in enumerate(plants):
                planted = work / f"plant{i}-{source.stem}.xlsx"
                plant(source, planted, defect)
                record[f"plant-{i}"] = {
                    "kind": defect.kind,
                    "target": defect.target,
                    "formula": defect.formula,
                    "violations": run_laws(
                        calculator, work, f"plant{i}-{source.stem}", planted, selectors
                    ),
                }
            record["seconds_coarse"] = round(time.monotonic() - started, 1)
            records.append(record)
        except Exception as error:
            records.append(
                {
                    "file": source.name,
                    "unmeasurable": f"{type(error).__name__}: {error}",
                }
            )
        finally:
            calculator.stop()
    out.write_text(json.dumps(records, indent=1))
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
