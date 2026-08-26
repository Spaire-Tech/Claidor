"""The registered D3 round: 30 typed cells, judged blind, then scored.

Two subcommands, and the order between them is the protocol:

    uv run python -m scripts.corpus_documents_link_round sheet
    uv run python -m scripts.corpus_documents_link_round score TRUTH.json

``sheet`` draws the registered sample (seed 314159, 30 typed cells of
the paired workbook), extracts every number from the paired documents,
and prints a judging sheet: for each drawn cell, its labels and value,
and every document line whose numbers include the cell's value in a
plausible printed form (raw, thousands-separated, rounded to one or
two places, percent-scaled). Those value-based hits are **judging
aids** — the judge may use values; only the matcher may not — and the
sheet deliberately runs no matcher and prints no scores, so the truth
is recorded blind.

The judge writes TRUTH.json: for each cell, the list of fact keys
where the document genuinely states that number (empty when it does
not), plus ``"ambiguous": true`` when several candidates are
indistinguishable by their labels. Then ``score`` runs the frozen
matcher over the same candidates and prints the registered table:
true proposals, false proposals, true abstentions, missed — each with
its denominator.

Absence of a statement is bounded by the variant search above; the
limit is registered in the Scribe log next to the round.
"""

import importlib.util
import json
import random
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

SEED = 314159
SAMPLE = 30

MODELS = Path(__file__).parent / "corpus_models"
DOCUMENTS = Path(__file__).parent / "corpus_documents" / "ed2"
WORKBOOK = MODELS / "ofgem_ed2_pcfm_v5.xlsx"

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


def _typed_cells():
    """Every typed cell of the paired workbook, through the real reader."""
    from polar.models.tieout import ArtifactKind
    from polar.tieout.ingest import read_artifact

    got = read_artifact(WORKBOOK.read_bytes(), WORKBOOK.name, ArtifactKind.model)
    return [c for c in got.cells if c.formula is None and c.value is not None]


def _facts():
    """Every number in the paired documents, keyed doc|page|ordinal."""
    out = []
    for pdf in sorted(DOCUMENTS.glob("*.pdf")):
        extraction = extract.extract_pdf(pdf)
        for ordinal, number in enumerate(extraction.numbers):
            key = f"{pdf.stem}|p{number.page}|{ordinal}"
            out.append((key, number))
    return out


def _variants(value) -> set[str]:
    """The printed forms a judge searches for. Judge-only: values."""
    forms: set[str] = set()
    for scaled in {value, value * 100}:
        for digits in (0, 1, 2, 3):
            quantum = round(float(scaled), digits)
            text = f"{quantum:.{digits}f}"
            forms.add(text)
            forms.add(f"{quantum:,.{digits}f}")
    return {f.rstrip("0").rstrip(".") if "." in f else f for f in forms if f != "0"}


def sheet() -> int:
    cells = _typed_cells()
    print(f"population: {len(cells)} typed cells in {WORKBOOK.name}", file=sys.stderr)
    drawn = random.Random(SEED).sample(cells, SAMPLE)
    facts = _facts()
    print(f"candidates: {len(facts)} numbers in {DOCUMENTS}", file=sys.stderr)

    record = []
    for index, cell in enumerate(drawn, start=1):
        labels = f"{cell.row_label} {cell.column_label}".strip()
        wanted = _variants(cell.value)
        hits = [
            {"key": key, "text": number.text, "line": number.line[:160]}
            for key, number in facts
            if number.text.strip("£$€%(),.").replace(",", "") in wanted
            or number.text in wanted
        ]
        record.append(
            {
                "n": index,
                "ref": cell.ref,
                "labels": labels,
                "value": str(cell.value),
                "value_hits": hits[:25],
                "truth": None,  # the judge fills: list of keys, [] for none
                "ambiguous": False,
            }
        )
        print(f"\n[{index:02d}] {cell.ref}  value={cell.value}")
        print(f"     labels: {labels!r}")
        if not hits:
            print("     no document line prints this value in any variant")
        for hit in hits[:8]:
            print(f"     ? {hit['key']}: {hit['text']!r} in {hit['line'][:90]!r}")
        if len(hits) > 8:
            print(f"     … and {len(hits) - 8} more (see the sheet file)")

    out = DOCUMENTS / "link-round-sheet.json"
    out.write_text(json.dumps(record, indent=1))
    print(
        f"\nsheet written: {out} — judge, fill 'truth', then run score", file=sys.stderr
    )
    return 0


def score(truth_path: str) -> int:
    truths = {entry["ref"]: entry for entry in json.loads(Path(truth_path).read_text())}
    cells = _typed_cells()
    drawn = random.Random(SEED).sample(cells, SAMPLE)
    facts = _facts()
    candidates = [(key, number.line, number.text) for key, number in facts]

    verdicts = []
    for cell in drawn:
        labels = f"{cell.row_label} {cell.column_label}".strip()
        entry = truths[cell.ref]
        stated = entry["truth"] or []
        answer = propose.propose(labels, candidates)
        if isinstance(answer, propose.Proposed):
            picked = answer.candidate.fact_id
            verdict = "true proposal" if picked in stated else "false proposal"
        else:
            if not stated or entry.get("ambiguous"):
                verdict = "true abstention"
            else:
                verdict = "missed"
            picked = None
        verdicts.append(
            {
                "ref": cell.ref,
                "labels": labels,
                "value": str(cell.value),
                "stated": stated,
                "proposed": picked,
                "verdict": verdict,
                "reason": answer.reason
                if isinstance(answer, propose.Abstained)
                else None,
            }
        )
        print(f"{cell.ref:24} {verdict:16} proposed={picked}")

    counts = {}
    for verdict in verdicts:
        counts[verdict["verdict"]] = counts.get(verdict["verdict"], 0) + 1
    proposals = counts.get("true proposal", 0) + counts.get("false proposal", 0)
    print("\n--- the registered table ---")
    for name in ("true proposal", "false proposal", "true abstention", "missed"):
        print(f"{name}: {counts.get(name, 0)}")
    print(f"proposals made: {proposals} of {SAMPLE}")
    if proposals:
        print(
            f"proposal precision: {counts.get('true proposal', 0)}/{proposals} "
            f"= {counts.get('true proposal', 0) / proposals:.0%}"
        )
    print(f"abstention rate: {SAMPLE - proposals}/{SAMPLE}")
    stated_count = sum(1 for v in verdicts if v["stated"])
    print(f"cells the documents state at all: {stated_count}/{SAMPLE}")

    out = DOCUMENTS / "link-round-verdicts.json"
    out.write_text(json.dumps(verdicts, indent=1))
    print(f"verdicts written: {out}", file=sys.stderr)
    return 0


def sourced_sheet() -> int:
    """Run B's judging sheet: seeded order, value-prefiltered, 60 max.

    Sampling by value is legitimate exactly where scoring by value is
    not: the prefilter only decides which cells are worth a judge's
    time, never what the matcher sees or scores.
    """
    cells = _typed_cells()
    rng = random.Random(2718281)
    order = list(range(len(cells)))
    rng.shuffle(order)
    facts = _facts()
    record = []
    for position in order:
        if len(record) >= 60:
            break
        cell = cells[position]
        wanted = _variants(cell.value)
        hits = [
            {"key": key, "text": number.text, "line": number.line[:160]}
            for key, number in facts
            if number.text.strip("£$€%(),.").replace(",", "") in wanted
            or number.text in wanted
        ]
        if not hits:
            continue
        record.append(
            {
                "n": len(record) + 1,
                "ref": cell.ref,
                "labels": f"{cell.row_label} {cell.column_label}".strip(),
                "value": str(cell.value),
                "value_hits": hits[:25],
                "truth": None,
                "ambiguous": False,
            }
        )
    out = DOCUMENTS / "link-round2-sourced-sheet.json"
    out.write_text(json.dumps(record, indent=1))
    print(
        f"{len(record)} value-prefiltered candidates written to {out} — "
        "judge in order until 10 sourced found, then run sourced-score",
        file=sys.stderr,
    )
    return 0


def sourced_score(truth_path: str) -> int:
    """Score the sourced cells found under the registered stopping rule."""
    entries = json.loads(Path(truth_path).read_text())
    judged = [entry for entry in entries if entry["truth"] is not None]
    sourced = [entry for entry in judged if entry["truth"]]
    print(
        f"judged {len(judged)} candidates in registered order; "
        f"{len(sourced)} sourced cells found",
    )
    facts = _facts()
    candidates = [(key, number.line, number.text) for key, number in facts]
    cells = {cell.ref: cell for cell in _typed_cells()}

    verdicts = []
    for entry in sourced:
        cell = cells[entry["ref"]]
        labels = f"{cell.row_label} {cell.column_label}".strip()
        stated = entry["truth"] or []
        answer = propose.propose(labels, candidates)
        if isinstance(answer, propose.Proposed):
            picked = answer.candidate.fact_id
            verdict = "true proposal" if picked in stated else "false proposal"
        else:
            verdict = (
                "true abstention" if not stated or entry.get("ambiguous") else "missed"
            )
            picked = None
        verdicts.append(
            {
                "ref": cell.ref,
                "labels": labels,
                "value": str(cell.value),
                "stated": stated,
                "proposed": picked,
                "verdict": verdict,
                "reason": answer.reason
                if isinstance(answer, propose.Abstained)
                else None,
            }
        )
        print(f"{cell.ref:24} {verdict:16} proposed={picked}")

    counts = {}
    for verdict in verdicts:
        counts[verdict["verdict"]] = counts.get(verdict["verdict"], 0) + 1
    proposals = counts.get("true proposal", 0) + counts.get("false proposal", 0)
    print("\n--- run B, the registered table (sourced cells only) ---")
    for name in ("true proposal", "false proposal", "true abstention", "missed"):
        print(f"{name}: {counts.get(name, 0)}")
    if proposals:
        print(
            f"proposal precision: {counts.get('true proposal', 0)}/{proposals} "
            f"= {counts.get('true proposal', 0) / proposals:.0%}"
        )
    out = DOCUMENTS / "link-round2-sourced-verdicts.json"
    out.write_text(json.dumps(verdicts, indent=1))
    print(f"verdicts written: {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "sheet":
        raise SystemExit(sheet())
    if len(sys.argv) >= 2 and sys.argv[1] == "sourced-sheet":
        raise SystemExit(sourced_sheet())
    if len(sys.argv) >= 3 and sys.argv[1] == "sourced-score":
        raise SystemExit(sourced_score(sys.argv[2]))
    if len(sys.argv) >= 3 and sys.argv[1] == "score":
        raise SystemExit(score(sys.argv[2]))
    print(__doc__)
    raise SystemExit(1)
