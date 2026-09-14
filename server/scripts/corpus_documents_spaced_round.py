"""The hand-check that killed two rules: twenty refused lines, one seed.

D1 stores thousands of single digits torn out of character-spaced text
— a PDF that places glyphs one at a time turns « 19,842 » into five
facts reading 1, 9, 8, 4 and 2, each with a citation box round one
glyph. Part B measured it at 56% of the Finch corpus. This harness is
how a candidate fix is judged, and both candidates so far have failed
here rather than in production:

- **round P** refused a line where ≥60% of tokens were one character
  long. Nine of twenty drawn lines were ordinary financial rows whose
  single characters are *nils* — « Base Gas - - - - - - - - - - ».
- **round Q** refused a line standing ≥3 lone *letters*, since nils and
  figures never do. Four of twenty were ordinary English prose
  (« … calculate a tax allowance on a ») and regulator formula legends
  (« … 3.90% 3.93% D D = A * C + B * »), which stand letters alone all
  the time.

Both died by the criterion registered before they ran: **any** drawn
line that is not in fact character-spaced kills the rule. Neither is in
the extractor. The reading this harness now supports is that assembled
line text is the wrong instrument — the signal is in the PDF's own
character geometry — and round R is registered on that basis.

    uv run python -m scripts.corpus_documents_spaced_round check
    uv run python -m scripts.corpus_documents_spaced_round survey

``check`` prints the twenty drawn lines for a person to read; ``survey``
prints what a candidate rule costs and keeps, per document. Both need a
``_spaced_positions`` in ``extract.py`` to judge; with no rule in the
extractor they report nothing, which is the current state.

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
    assert spec is not None
    assert spec.loader is not None
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
                if not hasattr(extract, "_spaced_positions"):
                    return []
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
    print(f"{'document':36} {'kept':>7} {'refused pages':>14}")
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
