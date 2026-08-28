"""The oracle upper bound on D3's matcher, for both of its scored corpora.

D3 abstains on two rules: a coverage floor and an exact tie. Its lifetime
record is 0 correct proposals. This script separates the two explanations
for that zero, because they lead to opposite decisions:

  * If the truth is never the top-scoring candidate, the **evidence**
    cannot identify the answer and no tie-breaker will ever reach it.
  * If the truth *is* top-scoring but tied, the **rules** are what cost
    the recall, and a better-than-chance tie-breaker would win it back.

Both bounds are reported, with the blind-pick expectation beside them so
the headroom is priced rather than asserted: a tie-breaker that does no
better than chance returns more wrong answers than right ones and fails
this lane's own kill criterion.

Never-by-value holds throughout. Scoring uses ``propose.label_tokens``,
which drops purely numeric tokens from both sides. Values appear here
only to validate a recorded truth key, never to find or score anything.

    uv run python scripts/corpus_d3_oracle.py finch
    uv run python scripts/corpus_d3_oracle.py ferc <corpus-dir>

``<corpus-dir>`` is where ``corpus_ferc_fetch.py`` put the RMU pair.
"""

import json
import re
import sys
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")

DOCS = Path(__file__).parent.parent.parent / "docs" / "pierce"
FINCH = Path(__file__).parent / "corpus_finch" / "files"

#: The FERC Form 1 page mark is the one in the page **footer**. It is not
#: any occurrence of "Page NNN": the body cross-references ("recorded in
#: Page 117, Line 78") make ten printed numbers ambiguous, and the footer
#: rule is unique across all 103 pages of the RMU filing.
FOOTER = re.compile(r"FERC\s+FORM\s+NO\.\s*1.*?Page\s+(\d{3})\b", re.IGNORECASE)

#: A schedule prints its line number on the **left** of a left-hand page
#: and on the **right** of its continuation ("$ 218,200 48"). A finder
#: anchored only at the start misses every right-hand page.
LINE_LEAD = re.compile(r"^\s*(\d{1,3})(?![0-9])")
LINE_TAIL = re.compile(r"(?:^|\s)(\d{1,3})\s*$")


@dataclass(frozen=True)
class Bound:
    """What a perfect tie-breaker could reach, and what chance reaches."""

    rows: int
    #: Rows where the truth is among the top-scoring candidates. A perfect
    #: tie-breaker reaches exactly these and no more.
    reachable: int
    #: Rows where the truth line shares no label words at all with the
    #: cell's name. Not thin evidence — none.
    wordless: int
    #: Expected correct answers from picking uniformly among the tied.
    blind: float

    def report(self, name: str) -> None:
        print(f"\n=== {name} ===")
        print(f"  rows judged                            {self.rows}")
        print(
            f"  truth is top-scoring (ORACLE BOUND)    {self.reachable} of {self.rows}"
        )
        print(
            f"  truth shares no words with the label   {self.wordless} of {self.rows}"
        )
        print(f"  expected correct from a BLIND pick     {self.blind:.2f}")


def _chain() -> tuple[Any, Any]:
    import importlib.util

    chain = Path(__file__).parent.parent / "polar" / "tieout" / "chain"
    out = []
    for name in ("extract", "propose"):
        spec = importlib.util.spec_from_file_location(name, chain / f"{name}.py")
        assert spec is not None
        assert spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
        out.append(module)
    return out[0], out[1]


extract, propose = _chain()


def _bound(cases: list[tuple[frozenset[str], list[tuple[float, bool]]]]) -> Bound:
    """Fold scored candidate lists into the bound. One place, so the three
    numbers cannot drift apart at three call sites."""
    rows = reachable = wordless = 0
    blind = 0.0
    for _, scored in cases:
        if not any(is_truth for _, is_truth in scored):
            continue
        rows += 1
        best = max(score for score, _ in scored)
        truth_best = max(score for score, is_truth in scored if is_truth)
        if truth_best == 0:
            wordless += 1
        if truth_best == best and best > 0:
            reachable += 1
            tied = sum(1 for score, _ in scored if score == best)
            hits = sum(1 for score, is_truth in scored if score == best and is_truth)
            blind += hits / tied
    return Bound(rows, reachable, wordless, blind)


def finch() -> Bound:
    """Round 6's Finch verdicts against today's extractor.

    The recorded truth keys are ``<stem>|p<page>|<ordinal>`` — the *old*
    key format, an index into the page's facts. Ordinals are fragile by
    construction (an extractor that adds facts shifts every one), which is
    why the round harness later moved to x/y. They are still usable here,
    and the caller is told how many survive rather than being asked to
    assume it: 17 of 18 still address a fact with the recorded magnitude.
    """
    verdicts = json.loads((DOCS / "scribe-d3-round6-finch-verdicts.json").read_text())
    pools: dict[str, list[tuple[str, Any]]] = {}

    def facts(task: str) -> list[tuple[str, Any]]:
        if task not in pools:
            got: list[tuple[str, Any]] = []
            for pdf in sorted((FINCH / task).glob(f"{task}_src_*.pdf")):
                per_page: dict[int, list[Any]] = {}
                for number in extract.extract_pdf(pdf).numbers:
                    per_page.setdefault(number.page, []).append(number)
                for page, numbers in per_page.items():
                    for index, number in enumerate(numbers):
                        got.append((f"{pdf.stem}|p{page}|{index}", number))
            pools[task] = got
        return pools[task]

    stale = 0
    cases = []
    for entry in verdicts:
        stated = set(entry.get("stated") or [])
        wanted = propose.label_tokens(entry["name"] or "")
        if not stated or not wanted:
            continue
        pool = facts(entry["task"])
        # Validate the key before trusting it. The value is used here and
        # only here, to check that an ordinal still addresses the fact it
        # was recorded against — never to find or score a match.
        recorded = abs(float(entry["value"]))
        addressed = [n for key, n in pool if key in stated]
        if addressed and not any(
            abs(abs(n.value) - recorded) <= 0.005 * max(recorded, abs(n.value), 1.0)
            for n in addressed
        ):
            stale += 1
            continue
        cases.append(
            (
                wanted,
                [
                    (
                        len(wanted & propose.label_tokens(n.line)) / len(wanted),
                        key in stated,
                    )
                    for key, n in pool
                ],
            )
        )
    if stale:
        print(
            f"  (excluded {stale} row(s) whose recorded ordinal no longer addresses its fact)"
        )
    return _bound(cases)


def _anchors(text: str) -> set[int]:
    lead, tail = LINE_LEAD.match(text), LINE_TAIL.search(text)
    return {int(m.group(1)) for m in (lead, tail) if m}


def ferc(corpus: Path) -> Bound:
    """Round 8's FERC sample against the RMU Form 1."""
    import pdfplumber

    document = corpus / "rmu-2015-form1.pdf"
    scorable = {10, 12, 13, 19, 21, 36, 41, 44, 57, 59, 88, 119, 121, 179, 187}
    sample = [
        s
        for s in json.loads((DOCS / "scribe-d3-round8-sample.json").read_text())
        if s["row"] in scorable
    ]
    printed: dict[int, int] = {}
    with pdfplumber.open(document) as pdf:
        for index, page in enumerate(pdf.pages):
            found = FOOTER.findall(page.extract_text() or "")
            if found:
                printed[int(found[0])] = index + 1

    numbers = extract.extract_pdf(document).numbers
    cases = []
    for entry in sample:
        wanted = propose.label_tokens(entry["label"] or "")
        if not wanted:
            continue
        truth_page = printed[entry["page"]]
        cases.append(
            (
                wanted,
                [
                    (
                        len(wanted & propose.label_tokens(n.line)) / len(wanted),
                        n.page == truth_page and entry["line"] in _anchors(n.line),
                    )
                    for n in numbers
                ],
            )
        )
    return _bound(cases)


def main(argv: list[str]) -> int:
    if not argv or argv[0] not in ("finch", "ferc"):
        print(__doc__)
        return 2
    if argv[0] == "finch":
        finch().report("Finch — D3 round 6")
    else:
        if len(argv) < 2:
            print("ferc needs the corpus directory from corpus_ferc_fetch.py")
            return 2
        ferc(Path(argv[1])).report("FERC — D3 round 8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
