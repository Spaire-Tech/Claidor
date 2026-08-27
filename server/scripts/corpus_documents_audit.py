"""Re-derive every headline number the Scribe log publishes.

Four self-checks in three turns found four errors of mine, all of the
same shape: the measurement was right and the sentence generalised
further than the run did. This turns the audit from something I
remembered to do into one command anybody can run before a sweep.

    uv run python -m scripts.corpus_documents_audit

Each row prints the value recorded in the log beside the value derived
from the committed harnesses and truths, and says whether they agree.
**A claim whose population is not named is not auditable**, so every
row here carries the population it was measured over.

Two of the log's tables are deliberately absent: D3 rounds 5, 6 and 7
were measured under extractor versions 2 and 3, and the round's truths
were re-keyed in the dash round, so they cannot be re-derived from this
tree. That is correct behaviour for a superseded measurement, and the
log says so.

Attribution, CC BY 3.0, travels with the Finch numbers:
FinWorkBench/Finch, arXiv:2512.13168.
"""

import collections
import importlib.util
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

HERE = Path(__file__).parent
_CHAIN = HERE.parent / "polar" / "tieout" / "chain"

_spec = importlib.util.spec_from_file_location("extract", _CHAIN / "extract.py")
assert _spec is not None and _spec.loader is not None
extract = importlib.util.module_from_spec(_spec)
sys.modules["extract"] = extract
_spec.loader.exec_module(extract)

FINCH = sorted((HERE / "corpus_finch" / "files").glob("*/*_src_*.pdf"))
ED2 = sorted((HERE / "corpus_documents" / "ed2").glob("*.pdf"))
ROUND_TASKS = ("5", "52", "72", "81", "156", "160", "161")

#: What the log says, with the population each was measured over.
RECORDED = {
    "facts, Finch corpus (17 PDFs)": 6842,
    "facts, ED2 corpus (3 PDFs)": 8015,
    "nils, both corpora": 750,
    "facts in character-spaced lines, Finch corpus": 3835,
    "colliding keys, one-coordinate scheme, round's 7 tasks": 562,
    "facts sharing an address, round's 7 tasks": 4456,
    "part B: rows settled of 18": 15,
    "part B: rows stated-but-unextracted": 3,
}


def _spaced(line: str) -> bool:
    tokens = line.split()
    return len(tokens) >= 12 and sum(
        1 for t in tokens if len(t) == 1
    ) / len(tokens) >= 0.6


def main() -> int:
    # A missing corpus must not read as a wrong number. Both are
    # git-ignored and re-fetchable; say which is absent and stop.
    missing = [
        name
        for name, found in (("Finch", FINCH), ("ED2", ED2))
        if not found
    ]
    if missing:
        print(
            f"corpus absent: {', '.join(missing)}. This is not a failed audit — "
            "the corpora are git-ignored and re-fetchable. Run "
            "scripts.corpus_documents_finch for Finch and "
            "scripts.corpus_documents for ED2, then run this again."
        )
        return 2

    derived: dict[str, int] = {}

    finch = ed2 = nils = spaced = 0
    for pdf in FINCH:
        numbers = extract.extract_pdf(pdf).numbers
        finch += len(numbers)
        nils += sum(1 for n in numbers if n.text in "-–—")
        spaced += sum(1 for n in numbers if _spaced(n.line))
    for pdf in ED2:
        numbers = extract.extract_pdf(pdf).numbers
        ed2 += len(numbers)
        nils += sum(1 for n in numbers if n.text in "-–—")
    derived["facts, Finch corpus (17 PDFs)"] = finch
    derived["facts, ED2 corpus (3 PDFs)"] = ed2
    derived["nils, both corpora"] = nils
    derived["facts in character-spaced lines, Finch corpus"] = spaced

    keys: collections.Counter[str] = collections.Counter()
    for task in ROUND_TASKS:
        for pdf in sorted((HERE / "corpus_finch" / "files" / task).glob("*_src_*.pdf")):
            for number in extract.extract_pdf(pdf).numbers:
                keys[f"{pdf.stem}|p{number.page}|x{number.box.x0:.0f}|{number.text}"] += 1
    colliding = {k: v for k, v in keys.items() if v > 1}
    derived["colliding keys, one-coordinate scheme, round's 7 tasks"] = len(colliding)
    derived["facts sharing an address, round's 7 tasks"] = sum(colliding.values())

    partb = json.loads((HERE / "corpus_finch" / "finch-partb-truth.json").read_text())
    conditions = collections.Counter(e.get("condition") for e in partb)
    derived["part B: rows settled of 18"] = conditions.get("ok", 0)
    derived["part B: rows stated-but-unextracted"] = conditions.get(
        "stated-but-unextracted", 0
    )

    failures = 0
    width = max(len(k) for k in RECORDED)
    print(f"{'claim (with its population)':{width}}  {'log':>7} {'derived':>8}  ")
    for claim, recorded in RECORDED.items():
        got = derived[claim]
        ok = got == recorded
        failures += not ok
        print(f"{claim:{width}}  {recorded:>7} {got:>8}  {'ok' if ok else 'MISMATCH'}")

    print(
        "\nNot audited here, and run separately because each needs its own "
        "harness:\n"
        "  ED2 30-of-30          scripts.corpus_documents_link_round score\n"
        "  ED2 run B             scripts.corpus_documents_link_round sourced-score\n"
        "  Finch part A + part B scripts.corpus_documents_finch_round partb-score\n"
        "  D5's flood            scripts.corpus_documents_unsourced\n"
        "  D4's eight of eight   pytest tests/tieout/test_chain_anchor.py"
    )
    print(
        "\nCC BY 3.0 — FinWorkBench/Finch, arXiv:2512.13168. This attribution "
        "travels with these numbers."
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
