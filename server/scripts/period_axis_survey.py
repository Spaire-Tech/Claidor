"""Does the structure layer already know a sheet's periodicity?

The units inference cannot express « monthly » at all — its whole
period vocabulary is annual / point-in-time / none / unknown, and
the word « month » does not occur in it. So the check the orders
name cannot rest on that dimension whatever its accuracy.

`PeriodAxis.per_year` is a different mechanism and it is in this
lane: columns per canonical year, read from the sheet's own printed
labels — 1 annual, 2 semi-annual, 4 quarterly, 12 monthly. This
measures what it actually reports before anything is built on it.

    uv run python -m scripts.period_axis_survey <corpus-dir> <out.json> [pattern]
"""

import json
import sys
import time
import warnings
from collections import Counter
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")


def one(path: Path) -> dict[str, Any]:
    from polar.tieout.structure import read_structure
    from polar.tieout.workbook import read_workbook

    started = time.time()
    book = read_workbook(str(path))
    structure = read_structure(book)
    axes = []
    for sheet, axis in structure.axes.items():
        axes.append({
            "sheet": sheet,
            "per_year": axis.per_year,
            "columns": len(axis.columns),
            "labels": list(axis.labels[:6]),
        })
    return {
        "file": path.name,
        "axes": axes,
        "by_per_year": dict(Counter(a["per_year"] for a in axes)),
        "seconds": round(time.time() - started, 1),
    }


def main() -> None:
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    pattern = sys.argv[3] if len(sys.argv) > 3 else "*.xls[xm]"
    results: list[dict[str, Any]] = []
    for path in sorted(root.rglob(pattern)):
        if path.name.startswith("._"):
            continue
        try:
            results.append(one(path))
        except Exception as problem:
            results.append({"file": path.name,
                            "refused": f"{type(problem).__name__}: {str(problem)[:120]}"})
        row = results[-1]
        print(f"done {row['file'][:42]:<42} axes {len(row.get('axes', [])):>3}  "
              f"per_year {row.get('by_per_year', {})}", flush=True)
        out.write_text(json.dumps(results, indent=1))
    every: Counter = Counter()
    for r in results:
        for a in r.get("axes", []):
            every[a["per_year"]] += 1
    print(f"corpus: {sum(every.values())} axes, per_year {dict(sorted(every.items()))}",
          flush=True)


if __name__ == "__main__":
    main()
