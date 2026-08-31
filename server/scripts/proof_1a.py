"""Proof 1A — the analytical proof, run cold on the SFT corpus.

The registration is `docs/pierce/population-proof.md` § Proof 1A and
is **frozen**: the conditions, criteria and prediction were fixed
before any of these models was opened, and this script neither
restates nor softens them. It runs and reports.

    uv run python -m scripts.proof_1a            # every model
    uv run python -m scripts.proof_1a MODEL.xlsm # one, for the heavy ones

The cold-run conditions it honours: the engine frozen at the commit
named in the results, house rules at shipped defaults, one file at a
time, refusals counted in the denominator rather than dropped, and
`inverness_college_model.xlsm` reported separately because it is the
only file in the corpus with a live calculation layer.

Only the **analytical** checks run here. The structural checks are
statements about formulas and this corpus is published as values;
that is Proof 1B, which has no corpus yet.
"""

import json
import sys
import time
import traceback
import warnings
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")

HERE = Path(__file__).parent
CORPUS = HERE / "corpus_sft"
OUT = HERE / "proof_1a_results"

#: Reported separately — the one model with a live calculation layer.
SEPARATE = "inverness_college_model.xlsm"


def _run(path: Path) -> dict[str, Any]:
    from polar.tieout.analytics import run_analytics
    from polar.tieout.audit import audit
    from polar.tieout.structure import read_structure
    from polar.tieout.workbook import read_workbook

    started = time.time()
    row: dict[str, Any] = {"file": path.name, "bytes": path.stat().st_size}
    try:
        book = read_workbook(str(path))
        structure = read_structure(book)
        told = run_analytics(book, structure)
        result = audit(book, structure.axes)
    except Exception as problem:
        #: A refusal is a result: counted in the denominator, named.
        row["refused"] = f"{type(problem).__name__}: {str(problem)[:200]}"
        row["seconds"] = round(time.time() - started, 1)
        print(f"REFUSED {path.name}: {row['refused']}", flush=True)
        traceback.print_exc()
        return row

    row.update(
        cells=len(book.cells),
        sheets=len(book.sheets),
        formulas=sum(1 for c in book.cells.values() if c.formula),
        values_pasted=structure.values_pasted,
        analytical=[
            {
                "rule": f.rule,
                "severity": getattr(f, "severity", ""),
                "ref": getattr(f, "ref", ""),
                "sheet": getattr(f, "sheet", ""),
                "detail": getattr(f, "detail", ""),
            }
            for f in told.findings
        ],
        abstentions=[{"rule": a.rule, "why": a.why} for a in told.abstentions],
        tallies=told.tallies,
        structural_count=len(result.findings),
        audit_tallies=result.tallies,
        seconds=round(time.time() - started, 1),
    )
    print(
        f"done {path.name}: {len(told.findings)} analytical "
        f"({len(told.abstentions)} abstentions), "
        f"{len(result.findings)} structural, {row['formulas']} formulas, "
        f"{row['seconds']}s",
        flush=True,
    )
    return row


def main() -> None:
    OUT.mkdir(exist_ok=True)
    if len(sys.argv) == 2:
        wanted = [CORPUS / sys.argv[1]]
    else:
        wanted = sorted(p for p in CORPUS.iterdir() if p.suffix.lower() == ".xlsm")
    for path in wanted:
        target = OUT / f"{path.stem}.json"
        if target.exists():
            print(f"skip {path.name} (already run)", flush=True)
            continue
        target.write_text(json.dumps(_run(path), indent=1))


if __name__ == "__main__":
    main()
