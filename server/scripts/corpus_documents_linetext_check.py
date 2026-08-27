"""Round T's first criterion: ED2's line text, character for character.

Round S passed every check this lane had and broke 270 lines of the
ED2 handbook anyway — it cut subscripts off their base, and the ED2
30-of-30 sample could not see it because all thirty of its recorded
truths are empty, so an abstention stays correct however mangled the
line. `line` is what D3 matches on and D4 anchors by; a regression
suite that cannot see it damaged is not a safety net.

This is that net. It reads each document twice — once as pdfplumber
reads it with its own default tolerance, once through D1's `_words` —
and reports every line that differs.

    uv run python -m scripts.corpus_documents_linetext_check
"""

import importlib.util
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


def _rows(words, tolerance: float) -> list[str]:
    groups: dict[float, list] = {}
    for word in sorted(words, key=lambda w: float(w["top"])):
        top = float(word["top"])
        key = next((k for k in groups if abs(k - top) <= tolerance), top)
        groups.setdefault(key, []).append(word)
    return [
        " ".join(w["text"] for w in sorted(groups[k], key=lambda w: float(w["x0"])))
        for k in sorted(groups)
    ]


def main() -> int:
    import pdfplumber

    documents = sorted((HERE / "corpus_documents" / "ed2").glob("*.pdf"))
    failures = 0
    for pdf in documents:
        differing = 0
        with pdfplumber.open(pdf) as opened:
            for index, page in enumerate(opened.pages, start=1):
                before = _rows(page.extract_words(), 3.0)
                reader = getattr(extract, "_words", None)
                if reader is None:
                    print(
                        "no _words in the extractor: no candidate rule is in "
                        "place, so there is nothing to regress against."
                    )
                    return 0
                after = _rows(reader(page), extract._LINE_TOLERANCE)
                if before == after:
                    continue
                only_before = [line for line in before if line not in after]
                only_after = [line for line in after if line not in before]
                differing += max(len(only_before), len(only_after))
                if failures < 12:
                    for line in only_before[:2]:
                        print(f"  {pdf.stem} p{index}  was : {line[:104]}")
                    for line in only_after[:2]:
                        print(f"  {pdf.stem} p{index}  now : {line[:104]}")
                    failures += 1
        print(f"{pdf.stem:26} lines differing: {differing}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
