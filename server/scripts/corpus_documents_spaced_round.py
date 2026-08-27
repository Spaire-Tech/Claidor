"""D1 round P's hand-check: twenty refused lines, drawn by a fixed seed.

Registered in the Scribe log before the rule was written. The rule
declines to tokenize a line the PDF drew glyph by glyph; its
kill-criterion is that the hand-check must show no line that is not in
fact character-spaced, because a false refusal is a lost fact and this
rule must not eat ordinary tables.

    uv run python -m scripts.corpus_documents_spaced_round check
    uv run python -m scripts.corpus_documents_spaced_round survey

``check`` prints the twenty drawn lines for a person to read.
``survey`` prints what the rule costs and keeps, per document.

Attribution, CC BY 3.0, travels with any number this produces:
FinWorkBench/Finch, arXiv:2512.13168.
"""

import importlib.util
import random
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

SEED = 173205
SAMPLE = 20

HERE = Path(__file__).parent
_CHAIN = HERE.parent / "polar" / "tieout" / "chain"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, _CHAIN / f"{name}.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


extract = _load("extract")


def _documents() -> list[Path]:
    return sorted(HERE.glob("corpus_finch/files/*/*_src_*.pdf")) + sorted(
        (HERE / "corpus_documents" / "ed2").glob("*.pdf")
    )


def _refused_lines() -> list[tuple[str, int, str]]:
    """Every distinct line the rule declines, as (document, page, text)."""
    import pdfplumber

    out: list[tuple[str, int, str]] = []
    for pdf in _documents():
        with pdfplumber.open(pdf) as opened:
            for index, page in enumerate(opened.pages, start=1):
                words = page.extract_words()
                if extract._scan_refusal(index, page, words) is not None:
                    continue
                lines = extract._lines(words)
                spaced = extract._spaced_positions(lines)
                for text in dict.fromkeys(lines[p] for p in spaced):
                    out.append((pdf.stem, index, text))
    return out


def check() -> int:
    lines = _refused_lines()
    print(f"{len(lines)} distinct lines refused across {len(_documents())} documents")
    for n, (stem, page, text) in enumerate(
        random.Random(SEED).sample(lines, min(SAMPLE, len(lines))), start=1
    ):
        tokens = text.split()
        single = sum(1 for t in tokens if len(t) == 1)
        print(f"\n[{n:02d}] {stem} p{page}  {len(tokens)} tokens, {single} single")
        print(f"     {text[:300]}")
    return 0


def survey() -> int:
    print(f"{'document':36} {'kept':>7} {'refused lines':>14}")
    kept_all = 0
    for pdf in _documents():
        extraction = extract.extract_pdf(pdf)
        refused = sum(
            1 for r in extraction.refusals if "one glyph at a time" in r.reason
        )
        kept_all += len(extraction.numbers)
        print(f"{pdf.stem:36} {len(extraction.numbers):>7} {refused:>14}")
    print(f"\nfacts kept in total: {kept_all}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "check":
        raise SystemExit(check())
    if len(sys.argv) >= 2 and sys.argv[1] == "survey":
        raise SystemExit(survey())
    print(__doc__)
    raise SystemExit(1)
