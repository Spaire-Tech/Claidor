"""D3 round 5: the first hit-rate measurement this track has ever had.

Registered in the Scribe log before this file existed. Finch's seven
document → spreadsheet workflows are the only corpus we hold that runs
the direction the product runs — a source document feeding typed cells
of a real workbook — and they carry expert-made reference outputs.

**Attribution, CC BY 3.0, travels with every number this produces:**
FinWorkBench/Finch, arXiv:2512.13168,
huggingface.co/datasets/FinWorkBench/Finch.

Two phases, the discipline of every round in this lane: `sheet`
produces the judging sheet with **no matcher output on it**, the truth
is recorded blind, and only then does `score` run the frozen matcher.

    uv run python -m scripts.corpus_documents_finch_round sheet
    uv run python -m scripts.corpus_documents_finch_round score TRUTH.json

Six typed cells per task, seed 271828, equal weight per task — tasks
72 and 81 hold 80% of the corpus's cells and a per-cell pool would be
a number about them. Per-task figures print beside the pooled one,
always.
"""

import importlib.util
import json
import random
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

SEED = 271828
PER_TASK = 6
TASKS = ["5", "52", "72", "81", "156", "160", "161"]

HERE = Path(__file__).parent / "corpus_finch" / "files"
_CHAIN = Path(__file__).parent.parent / "polar" / "tieout" / "chain"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, _CHAIN / f"{name}.py")
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


extract = _load("extract")
propose = _load("propose")


def typed_cells(task: str):
    """The document-fed candidates: no formula, a value present."""
    from polar.models.tieout import ArtifactKind
    from polar.tieout.ingest import read_artifact

    reference = HERE / task / f"{task}_ref_0.xlsx"
    got = read_artifact(reference.read_bytes(), reference.name, ArtifactKind.model)
    return [c for c in got.cells if c.formula is None and c.value is not None]


def facts(task: str):
    """Every number of the task's source PDFs, keyed and lined."""
    out = []
    refusals = []
    for pdf in sorted((HERE / task).glob(f"{task}_src_*.pdf")):
        extraction = extract.extract_pdf(pdf)
        refusals.extend(extraction.refusals)
        for ordinal, number in enumerate(extraction.numbers):
            out.append((f"{pdf.stem}|p{number.page}|{ordinal}", number))
    return out, refusals


def _close(a: float, b: float) -> bool:
    """Same number, allowing the sheet's extra precision. Judge-only."""
    if a == b:
        return True
    scale = max(abs(a), abs(b), 1.0)
    return abs(a - b) <= 0.005 * scale


def sheet() -> int:
    record = []
    for task in TASKS:
        cells = typed_cells(task)
        pool, refusals = facts(task)
        drawn = random.Random(SEED).sample(cells, min(PER_TASK, len(cells)))
        print(
            f"\n=== task {task}: {len(cells)} typed cells, {len(pool)} document "
            f"numbers, {len(refusals)} pages refused",
            file=sys.stderr,
        )
        for cell in drawn:
            hits = [
                {"key": key, "text": n.text, "line": n.line[:150]}
                for key, n in pool
                if _close(n.value, float(cell.value))
            ]
            record.append(
                {
                    "task": task,
                    "ref": cell.ref,
                    "labels": f"{cell.row_label} {cell.column_label}".strip(),
                    "name": cell.name,
                    "value": str(cell.value),
                    "value_hits": hits[:12],
                    "truth": None,  # the judge fills: fact keys, [] for none
                    "condition": None,  # ok | unreachable-ocr | no-cell-located
                }
            )
            print(f"\n[{task}] {cell.ref}  value={cell.value}")
            print(f"   name: {cell.name[:80]!r}")
            if not hits:
                print("   no document line prints this value")
            for hit in hits[:6]:
                print(f"   ? {hit['key']}: {hit['text']!r} in {hit['line'][:90]!r}")

    out = HERE.parent / "finch-round-sheet.json"
    out.write_text(json.dumps(record, indent=1))
    print(f"\nsheet written: {out} — judge, then run score", file=sys.stderr)
    return 0


def score(truth_path: str) -> int:
    entries = json.loads(Path(truth_path).read_text())
    by_task: dict[str, dict[str, int]] = {}
    verdicts = []
    pools = {task: facts(task)[0] for task in TASKS}

    for entry in entries:
        task = entry["task"]
        counts = by_task.setdefault(task, {})
        condition = entry.get("condition") or "unjudged"
        if condition != "ok":
            counts[condition] = counts.get(condition, 0) + 1
            continue
        candidates = [(key, n.line, n.text, n.column) for key, n in pools[task]]
        stated = entry.get("truth") or []
        answer = propose.propose(entry["name"] or entry["labels"], candidates)
        if isinstance(answer, propose.Proposed):
            picked = answer.candidate.fact_id
            verdict = "true proposal" if picked in stated else "false proposal"
        else:
            picked = None
            verdict = "true abstention" if not stated else "missed"
        counts[verdict] = counts.get(verdict, 0) + 1
        verdicts.append(
            {
                **{k: entry[k] for k in ("task", "ref", "name", "value")},
                "stated": stated,
                "proposed": picked,
                "verdict": verdict,
                "reason": answer.reason
                if isinstance(answer, propose.Abstained)
                else None,
            }
        )
        print(f"[{task}] {entry['ref']:14} {verdict:16} -> {picked}")

    names = ("true proposal", "false proposal", "true abstention", "missed")
    print("\n--- per task (equal weight, six cells each) ---")
    print(f"{'task':>5} {'true':>5} {'false':>6} {'abstain':>8} {'missed':>7}  other")
    pooled = dict.fromkeys(names, 0)
    for task in TASKS:
        counts = by_task.get(task, {})
        for name in names:
            pooled[name] += counts.get(name, 0)
        other = {k: v for k, v in counts.items() if k not in names}
        print(
            f"{task:>5} {counts.get(names[0], 0):>5} {counts.get(names[1], 0):>6} "
            f"{counts.get(names[2], 0):>8} {counts.get(names[3], 0):>7}  {other or ''}"
        )
    print("\n--- pooled (equal weight per task, NOT per cell) ---")
    for name in names:
        print(f"{name}: {pooled[name]}")
    proposals = pooled["true proposal"] + pooled["false proposal"]
    if proposals:
        print(
            f"proposal precision: {pooled['true proposal']}/{proposals} "
            f"= {pooled['true proposal'] / proposals:.0%}"
        )
    else:
        print("proposal precision: no proposals were made")
    judged = sum(pooled.values())
    print(f"abstention rate: {pooled['true abstention'] + pooled['missed']}/{judged}")
    stated_count = sum(1 for v in verdicts if v["stated"])
    print(f"cells the documents state at all: {stated_count}/{judged}")
    print(
        "\nCC BY 3.0 — FinWorkBench/Finch, arXiv:2512.13168. This attribution "
        "travels with these numbers."
    )

    out = HERE.parent / "finch-round-verdicts.json"
    out.write_text(json.dumps(verdicts, indent=1))
    print(f"verdicts written: {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "sheet":
        raise SystemExit(sheet())
    if len(sys.argv) >= 3 and sys.argv[1] == "score":
        raise SystemExit(score(sys.argv[2]))
    print(__doc__)
    raise SystemExit(1)
