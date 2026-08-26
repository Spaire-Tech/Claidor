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


#: The 14 ED2 licensee sheets, in the model's own CHOOSE order —
#: the true licence-fee inputs live at `<DNO>!AP384/AP385` (verified
#: constants, all 28), behind `SelectedInputs`' CHOOSE.
ED2_DNOS = (
    "ENWL",
    "NPgN",
    "NPgY",
    "WMID",
    "EMID",
    "SWALES",
    "SWEST",
    "LPN",
    "SPN",
    "EPN",
    "SPD",
    "SPMW",
    "SSEH",
    "SSES",
)

#: The ED2 v5 pilot (lane log, 26 Aug, quoted there before this ran).
#: The PCFM makes no volume-times-price promise, so proportionality
#: and scale invariance are NOT measured on it — mapping them here
#: would invent promises the model never made. What it does promise:
#: additive adjustments that vanish with their inputs (zero-input on
#: the licence-fee pair), and totals that equal their components
#: (three consolidation instances on the AR sheet, FY2024 column).
ED2_V5_SELECTORS = Selectors(
    volume=tuple(f"{dno}!{at}" for dno in ED2_DNOS for at in ("AP384", "AP385")),
    revenue=("Legacy!AR85", "AR!AR33"),
    totals={
        "AR!AR45": tuple(f"AR!AR{row}" for row in range(22, 45)),
        "AR!AR53": ("AR!AR49", "AR!AR50", "AR!AR51", "AR!AR52"),
        "AR!AR58": ("AR!AR57", "AR!AR53"),
    },
)

ED2_V5_PLANTS = (
    Plant(
        kind="omitted-segment",
        target="AR!AR53",
        formula="=SUM(AR49:AR51)",  # AR52 (Legacy AR, ~18.3) dropped
    ),
    Plant(
        kind="hardcode-in-the-tail",
        target="AR!AR58",
        formula="=AR57 + AR53 + 3.12",
    ),
    Plant(
        kind="hardcode-in-the-tail",
        target="AR!AR33",
        formula="=Legacy!AR85 + 1.2",
    ),
)

#: The H7 debt-indexation round (lane log, 26 Aug, quoted before any
#: run): the pair's whole money chain hangs off one input row —
#: `Average RAB` (I26:M26, verified inputs) feeds only
#: `Notional new debt` (row 72) → `Variance (£)` (row 73) →
#: compounded year variances → `Total adjustment` (F86) — so RAB ×2
#: must double every one of those outputs exactly (proportionality),
#: while the rate rows — `Variance (%)` (69) and `Nominal, pre-tax
#: WACC` (77) — must not move when money is restated in cents ×100
#: (scale invariance). Both files share the layout ref-for-ref.
H7_SHEET = "H7 Cost of debt indexation"
H7_YEARS = ("I", "J", "K", "L", "M")
H7_SELECTORS = Selectors(
    price=tuple(f"{H7_SHEET}!{col}26" for col in H7_YEARS),
    monetary=tuple(f"{H7_SHEET}!{col}26" for col in H7_YEARS),
    revenue=(
        *(f"{H7_SHEET}!{col}72" for col in H7_YEARS),
        *(f"{H7_SHEET}!{col}73" for col in H7_YEARS),
        f"{H7_SHEET}!F86",
    ),
    ratios=(
        *(f"{H7_SHEET}!{col}69" for col in H7_YEARS),
        *(f"{H7_SHEET}!{col}77" for col in H7_YEARS),
    ),
)

H7_PLANTS = (
    Plant(
        kind="hardcode-in-the-tail",
        target=f"{H7_SHEET}!J73",
        formula="=J69 * J72 + 0.5",
    ),
    Plant(
        kind="hardcoded-ratio-leg",
        target=f"{H7_SHEET}!J69",
        formula="=J65 - J7 + J72/20000",  # absolute money inside a rate
    ),
)

#: The rest of the ED2 family: every version verified against the v5
#: anchors before registration (lane log, 26 Aug, twelfth-sweep
#: round) — `AR!AR33 = Legacy!AR85`, `AR45 = SUM(AR22:AR44)`,
#: `AR53 = SUM(AR49:AR52)`, `AR58 = AR57+AR53`, `Legacy!AR85` on
#: AP83/AP84, all 28 licence-fee inputs constants. All ten MATCH, so
#: the v5 map and plants carry verbatim.
ED2_FAMILY = (
    "v1_2023-02.xlsx",
    "v2_2023-07-14.xlsx",
    "v2_2023-07-31.xlsx",
    "v3_2023-10.xlsx",
    "v3_2023-11.xlsx",
    "v3_2024-01.xlsm",
    "v4_2024-07.xlsx",
    "v4_2025-01.xlsx",
    "v4_2025-07.xlsx",
    "v4_2026-01.xlsx",
)

#: file path (relative to server/) → (selectors, plants). Committed
#: before running; the lane log quotes each entry it measures.
PILOTS: dict[str, tuple[Selectors, tuple[Plant, ...]]] = {
    "scripts/corpus_au_uk/ofgem_ed2/v5_2026-06.xlsx": (
        ED2_V5_SELECTORS,
        ED2_V5_PLANTS,
    ),
    **{
        f"scripts/corpus_au_uk/ofgem_ed2/{name}": (ED2_V5_SELECTORS, ED2_V5_PLANTS)
        for name in ED2_FAMILY
    },
    "scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fds.xlsx": (
        H7_SELECTORS,
        H7_PLANTS,
    ),
    "scripts/corpus_au_uk/caa_h7/h7_new_debt_indexation_fp.xlsx": (
        H7_SELECTORS,
        H7_PLANTS,
    ),
}


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
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        return 2
    work, out = Path(sys.argv[1]), Path(sys.argv[2])
    only = sys.argv[3] if len(sys.argv) == 4 else ""
    if find_install() is None:
        print("no LibreOffice >= 25.8 here — refusing")
        return 1
    chosen = {rel_path: entry for rel_path, entry in PILOTS.items() if only in rel_path}
    if not chosen:
        print("no registered pilot matches; nothing to measure")
        return 1
    work.mkdir(parents=True, exist_ok=True)
    records = []
    for rel_path, (selectors, plants) in chosen.items():
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
