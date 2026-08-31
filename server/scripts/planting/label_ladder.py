"""Plant typed cells into label-column series — the election round's recall.

Protocol: `docs/pierce/label-column-election.md`, registered before
any result. The cells under test are the ones the engine does not
elect today, so sites cannot be found through `book.cells`: they are
enumerated the way `label_column_sample.py` does it, from the grid
and `_label_column` directly.

Two classes, both real defects an auditor would want raised:

* **ladder-interior** — a typed value replacing a computed one inside
  a uniform label-column series (`=A11989+1`). The date ladder every
  lookup on the sheet keys against.
* **ladder-schedule** — the same, in a schedule column whose series
  carries more than one formula shape (`newbattle`'s Schedule 7).

The anchor cell of a ladder is **never** planted: the first cell of a
`=X+1` run is a legitimate hardcode by construction, and planting it
would manufacture a defect that is not one.

    uv run python -m scripts.planting.label_ladder --scan CORPUS_DIR
    uv run python -m scripts.planting.label_ladder HOST.xlsx OUT.xlsx TRUTH.json 20260828
"""

import json
import random
import shutil
import sys
import warnings
import zipfile
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")

from scripts.planting.family_edge import strip_formula
from scripts.planting.sibling_totals import sheet_files

SITES_PER_HOST = 6
MIN_RUN = 6


def _shape(formula: str) -> str:
    """A formula's shape, references reduced to their column letters."""
    import re

    return re.sub(r"\d+", "#", formula or "")


def ladders(path: Path) -> list[dict[str, Any]]:
    """Label-column formula runs whose values are numeric.

    A run is a maximal block of consecutive rows in the label column
    all carrying a formula with a numeric cached value. The first row
    of each run is recorded as its anchor and excluded from planting.
    """
    from openpyxl import load_workbook

    from polar.tieout.workbook import _decimal, _formula, _grid_of, _label_column

    formulas = load_workbook(path, data_only=False, read_only=True)
    values = load_workbook(path, data_only=True, read_only=True)
    found: list[dict[str, Any]] = []
    try:
        for name in formulas.sheetnames:
            sheet = formulas[name]
            if not hasattr(sheet, "max_row"):
                continue
            grid = _grid_of(sheet, values[name])
            last_row = max((r for r, _ in grid.written), default=0)
            last_column = max((c for _, c in grid.written), default=0)
            if not last_row or not last_column:
                continue
            column = _label_column(grid, last_row, last_column)
            rows = []
            for r in range(1, last_row + 1):
                text = _formula(grid.written.get((r, column)))
                number = _decimal(grid.values.get((r, column)))
                rows.append((r, text, number) if text and number is not None else None)
            run: list[Any] = []
            for entry in rows + [None]:
                if entry is None:
                    if len(run) >= MIN_RUN:
                        shapes = {_shape(t) for _, t, _ in run}
                        for r, text, number in run[1:]:
                            found.append(
                                {
                                    "sheet": name,
                                    "column": column,
                                    "row": r,
                                    "formula": text,
                                    "value": str(number),
                                    "run_length": len(run),
                                    "anchor_row": run[0][0],
                                    "shapes": len(shapes),
                                    "kind": "ladder-schedule"
                                    if len(shapes) > 1
                                    else "ladder-interior",
                                }
                            )
                    run = []
                else:
                    run.append(entry)
    finally:
        formulas.close()
        values.close()
    return found


def plant(host: Path, out: Path, truth_path: Path, seed: int) -> None:
    from openpyxl.utils import get_column_letter

    sites = ladders(host)
    if not sites:
        raise SystemExit(f"{host.name}: no label-column ladders to plant")
    rng = random.Random(seed)
    by_kind: dict[str, list[dict[str, Any]]] = {}
    for site in sites:
        by_kind.setdefault(site["kind"], []).append(site)
    chosen: list[dict[str, Any]] = []
    used_rows: set[tuple[str, int]] = set()
    for kind in sorted(by_kind):
        pool = sorted(by_kind[kind], key=lambda s: (s["sheet"], s["row"]))
        rng.shuffle(pool)
        taken = 0
        for site in pool:
            if (site["sheet"], site["row"]) in used_rows:
                continue
            chosen.append(site)
            used_rows.add((site["sheet"], site["row"]))
            taken += 1
            if taken >= SITES_PER_HOST:
                break

    shutil.copy(host, out)
    planted: list[dict[str, Any]] = []
    with zipfile.ZipFile(out) as archive:
        names = sheet_files(archive)
        parts = {n: archive.read(n).decode("utf-8") for n in set(names.values())}
    for site in chosen:
        part = names.get(site["sheet"])
        if part is None:
            continue
        ref = f"{get_column_letter(site['column'])}{site['row']}"
        after = strip_formula(parts[part], ref)
        if after is None:
            continue
        parts[part] = after
        planted.append({**site, "ref": f"{site['sheet']}!{ref}"})

    with zipfile.ZipFile(host) as source:
        items = source.infolist()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as target:
            for item in items:
                data = source.read(item.filename)
                if item.filename in parts:
                    data = parts[item.filename].encode("utf-8")
                target.writestr(item, data)

    truth_path.write_text(
        json.dumps(
            {
                "host": host.name,
                "seed": seed,
                "planted": planted,
                "sites_available": len(sites),
            },
            indent=1,
        )
    )
    print(
        f"{host.name}: planted {len(planted)} of {len(chosen)} chosen "
        f"({len(sites)} sites available) -> {out.name}"
    )


def main() -> None:
    if sys.argv[1] == "--scan":
        root = Path(sys.argv[2])
        for path in sorted(root.rglob("*.xls[xm]")):
            if path.name.startswith("._"):
                continue
            try:
                sites = ladders(path)
            except Exception as problem:
                print(f"{path.name[:44]:<44} {type(problem).__name__}")
                continue
            kinds: dict[str, int] = {}
            for site in sites:
                kinds[site["kind"]] = kinds.get(site["kind"], 0) + 1
            print(f"{path.name[:44]:<44} {len(sites):>6} sites  {kinds}", flush=True)
        return
    host, out, truth, seed = sys.argv[1:5]
    plant(Path(host), Path(out), Path(truth), int(seed))


if __name__ == "__main__":
    main()
