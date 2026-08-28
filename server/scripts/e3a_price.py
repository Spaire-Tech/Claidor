"""E3a's false-positive price on our own corpora.

Registered in `docs/pierce/e3a-unit-mismatch.md`, criterion 2: every
new corpus finding is hand-read at the cells, and if the price is
anything but tiny it is **reported, not tuned away**.

Records the coverage lines too, so « no mismatches » and « could not
tell » stay distinguishable — and, for each finding, the number
formats the inference read its currencies from, because that is what
a hand-read has to judge.

    uv run python -m scripts.e3a_price <corpus-dir> <out.json> [pattern]
"""

import json
import sys
import time
import warnings
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")


def one(path: Path) -> dict[str, Any]:
    from polar.tieout.workbook import read_workbook

    started = time.time()
    book = read_workbook(str(path))
    #: `_unit_mismatch` is unwired pending this round, so it is run
    #: directly — measuring it through `audit()` would measure its
    #: absence.
    from polar.tieout.audit import Audit, _unit_mismatch

    result = Audit(examined=len(book.cells))
    _unit_mismatch(book, result)
    rows = []
    for finding in result.findings:
        if finding.rule not in ("currency-mismatch", "scale-mismatch"):
            continue
        cell = book.cells.get(finding.ref)
        formats: dict[str, str] = {}
        if cell is not None:
            for ref in (cell.precedents or ())[:8]:
                term = book.cells.get(ref)
                if term is not None:
                    formats[ref] = term.number_format or "General"
        rows.append({
            "rule": finding.rule,
            "ref": finding.ref,
            "detail": finding.detail[:160],
            "term_formats": formats,
        })
    return {
        "file": path.name,
        "findings": rows,
        "tallies": {
            k: v for k, v in result.tallies.items() if "mismatch" in k
        },
        "abstentions": [
            {"rule": a.rule, "why": a.why}
            for a in result.abstentions
            if "mismatch" in a.rule
        ],
        "total_findings": len(result.findings),
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
                            "refused": f"{type(problem).__name__}: {str(problem)[:140]}"})
        row = results[-1]
        print(f"done {row['file'][:44]:<44} unit findings "
              f"{len(row.get('findings', [])):>3}  in {row.get('seconds', 0)}s",
              flush=True)
        out.write_text(json.dumps(results, indent=2))
    total = sum(len(r.get("findings", [])) for r in results)
    print(f"corpus: {total} unit findings across {len(results)} files", flush=True)


if __name__ == "__main__":
    main()
