"""Terms table round 1, exactly as registered — run after the registration.

The criteria, bars and prediction live in
`docs/pierce/terms-table-round1.md`, committed before this ran. This
script is the measurement and nothing else: for each of D3 round 8's
15 scorable truth rows, locate the truth facts with the oracle's own
judge (footer page mark + printed line-number anchor — values locate
nothing), then classify the row for the terms table:

  PICKABLE      a truth fact's printed line carries label words — a
                person finds a named row to pick in the candidates
  NEEDS TYPING  truth facts exist and every one is label-less — the
                continuation-page case the typed route exists for
  INVISIBLE     no truth fact at all — an extraction gap

    uv run python -m scripts.terms_table_round1 <corpus-dir>

`<corpus-dir>` is where `corpus_ferc_fetch.py` put the RMU pair.
"""

import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

DOCS = Path(__file__).parent.parent.parent / "docs" / "pierce"

#: Round 8's scorable rows, exactly as the oracle scores them.
SCORABLE = {10, 12, 13, 19, 21, 36, 41, 44, 57, 59, 88, 119, 121, 179, 187}

PICKABLE = "PICKABLE"
NEEDS_TYPING = "NEEDS TYPING"
INVISIBLE = "INVISIBLE"


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print(__doc__)
        return 2
    corpus = Path(argv[0])
    document = corpus / "rmu-2015-form1.pdf"

    import pdfplumber

    #: The judge is the oracle's, reused not re-derived: its footer rule
    #: and its edge-anchored line numbers are the registered way to find
    #: a truth fact in this filing.
    from scripts.corpus_d3_oracle import FOOTER, _anchors

    from polar.tieout.chain.extract import extract_pdf
    from polar.tieout.chain.terms import signals_for

    sample = [
        s
        for s in json.loads((DOCS / "scribe-d3-round8-sample.json").read_text())
        if s["row"] in SCORABLE
    ]
    assert len(sample) == 15, f"expected 15 scorable rows, found {len(sample)}"

    printed: dict[int, int] = {}
    with pdfplumber.open(document) as pdf:
        for index, page in enumerate(pdf.pages):
            found = FOOTER.findall(page.extract_text() or "")
            if found:
                printed[int(found[0])] = index + 1

    numbers = extract_pdf(document).numbers

    tallies = {PICKABLE: 0, NEEDS_TYPING: 0, INVISIBLE: 0}
    tabular_truths = labelled_truths = 0
    print(f"{'row':>4}  {'cited':<10} {'truth facts':>11}  class")
    for entry in sample:
        truth_page = printed[entry["page"]]
        truths = [
            number
            for number in numbers
            if number.page == truth_page and entry["line"] in _anchors(number.line)
        ]
        signals = [signals_for(n.line, n.column, n.text) for n in truths]
        if not truths:
            verdict = INVISIBLE
        elif any(signal.labelled for signal in signals):
            verdict = PICKABLE
        else:
            verdict = NEEDS_TYPING
        tallies[verdict] += 1
        labelled_here = [s for s in signals if s.labelled]
        labelled_truths += len(labelled_here)
        tabular_truths += sum(1 for s in labelled_here if s.tabular)
        print(
            f"{entry['row']:>4}  p{entry['page']}.{entry['line']}.{entry['col']:<4}"
            f" {len(truths):>11}  {verdict}"
        )

    print()
    for verdict, count in tallies.items():
        print(f"  {verdict:<13} {count} of {len(sample)}")
    print(
        f"  of the labelled truth facts, {tabular_truths} of {labelled_truths} "
        "carry a column anchor (informative, no bar)"
    )
    carried = tallies[PICKABLE] + tallies[NEEDS_TYPING]
    print(f"\n  bar 1 (carried >= 14): {carried} of 15 — "
          + ("PASS" if carried >= 14 else "FAIL"))
    print(f"  bar 2 (all classified): {sum(tallies.values())} of 15 — "
          + ("PASS" if sum(tallies.values()) == 15 else "FAIL"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
