"""Link proposal — D3: typed model number → candidate document facts.

The rule this file lives and dies by, registered in the Scribe log
before it was written: **matched by labels near both — never by
value.** The cell brings the labels the workbook printed beside it;
the fact brings the printed line it sits in. Scoring is label affinity
between those two strings and nothing else. The numeric value never
enters — not as a feature, not as a tiebreak, not as a filter — and to
keep even accidental leakage out, purely numeric tokens are dropped
from both sides before comparison (« 2025 » alone matches nothing;
« FY2025 » is a word and survives). A matcher that peeked at values
would score brilliantly on every measurement and be circular in every
one: the whole point of a confirmed link is that the two values may
later *disagree*.

**Abstention is a first-class outcome, not a failure.** No proposal
when no candidate covers at least half the cell's label words
(:data:`FLOOR`), and no proposal when the top two candidates tie —
two facts the labels cannot tell apart is a question for a person,
and guessing between them is exactly the kind of confident wrongness
this product exists to stop. Every abstention says why, in words.

The scoring is deliberately plain — what share of the cell's label
words appear in the fact's line — because plain is measurable: the
registered 30-draw protocol in the log judges this exact function,
and any cleverness added later has to beat it on that harness first.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

#: A proposal needs at least this share of the cell's label words
#: found in the candidate's line. Below it, the matcher abstains.
FLOOR = 0.5

#: Round 2's frozen defense (registered in the Scribe log before this
#: code existed). A number immediately preceded on its line by one of
#: these words names a *place* — « SpC 3.2 », « Table 14 », « para
#: 2.47 » — not a quantity, and round 1 measured what happens without
#: this rule: seven of eight false proposals were exactly that shape.
#: Such a candidate is ineligible for proposal and cannot block one by
#: tying; it stays in the ranking, marked, so a reviewer sees what was
#: set aside.
REFERENCE_WORDS = frozenset(
    """spc crc section sections sec para paragraph paragraphs table
    tables figure figures fig page pages appendix appendices annex
    chapter condition conditions footnote footnotes box volume part
    step fq question clause schedule article no""".split()
)

_WORD = re.compile(r"[a-z0-9]+")

#: **Tried in round 7 and removed by its own criterion.** Kept as a
#: record, not as behaviour. In a financial table the column identity
#: is very often a *symbol* — « $ Total Direct Expense » against « HC
#: Total Direct Expense », a `%` column beside a `$` one — and round 6
#: measured what dropping them costs: the column anchor read « $ » and
#: « % » correctly off the page and the tokenizer deleted both, so the
#: tie survived and a perfect label match stayed silent. These are
#: labels, not values: the value is the digits, and the digits stay
#: dropped exactly as before. Keeping them separated the `%` column
#: from the `$` one exactly as intended — and changed no verdict,
#: because the residual tie is on the *model* side: two different
#: money columns of one workbook share the single name « $ Total
#: Direct Expense », since `Cell.column_label` reads only the nearest
#: header row. That gap is the engine's, and the case is in the
#: Scribe log for the lead to route.
_SYMBOLS = frozenset("$%£€#")

#: Round 3's frozen addition: the bare paragraph-number shape. Digits
#: and dots only, optionally ending « . » or « : » — « 10.246 »,
#: « 2.6 », « 1: » match; « £48.9mm », « 45% », « (2,340) » never do.
_PARAGRAPH = re.compile(r"^\d+(?:\.\d+)*[.:]?$")


def is_reference(token: str, line: str) -> bool:
    """True when the token appears in the line as a document reference.

    Two frozen shapes, each registered in the Scribe log before its
    code and each bought with a measured round:

    - **Reference-worded** (round 2): any occurrence of the exact
      printed token immediately preceded by a reference word
      (« SpC 3.2 », « Table 14 »). Over-exclusion when one line prints
      the same token both as a reference and as a value is possible,
      rare, and an accepted registered limit.
    - **Leading paragraph number** (round 3): the token opens the
      line, has the bare paragraph shape, and prose follows —
      « 10.246 Ofgem's decision is… » numbers the paragraph, not a
      quantity. A line of numbers keeps its leading value eligible;
      a table that prints a bare value *before* its label is
      over-excluded, the registered cost.
    """
    words = line.split()
    if (
        len(words) >= 2
        and words[0] == token
        and _PARAGRAPH.match(token)
        and words[1][:1].isalpha()
    ):
        return True
    for position, word in enumerate(words[1:], start=1):
        if word != token:
            continue
        before = _WORD.findall(words[position - 1].lower())
        if before and before[-1] in REFERENCE_WORDS:
            return True
    return False


def label_tokens(text: str) -> frozenset[str]:
    """The comparable words of a label or a printed line.

    Lowercased alphanumeric runs, with purely numeric runs dropped —
    the never-by-value rule enforced at the token level, so no caller
    can leak a value into scoring by formatting it into a string —
    Round 7 tried keeping the currency and percent symbols as tokens
    and its own criterion sent them back out; :data:`_SYMBOLS` records
    what was tried and why it is not here.
    """
    return frozenset(
        token for token in _WORD.findall(text.lower()) if not token.isdigit()
    )


@dataclass(frozen=True)
class Candidate:
    """One fact, scored against one cell's labels."""

    fact_id: UUID
    score: float
    shared: tuple[str, ...]
    #: The token reads as a document reference (« SpC 3.2 »): visible
    #: in the ranking, never proposed, never blocking a proposal.
    reference: bool = False


@dataclass(frozen=True)
class Proposed:
    """The matcher's answer when the labels single one fact out."""

    candidate: Candidate
    ranked: tuple[Candidate, ...]


@dataclass(frozen=True)
class Abstained:
    """No proposal, and the reason in words. Not an error."""

    reason: str
    ranked: tuple[Candidate, ...]


def propose(
    cell_labels: str,
    candidates: Sequence[tuple[UUID, str, str] | tuple[UUID, str, str, str]],
) -> Proposed | Abstained:
    """One cell's label text against every candidate fact's line.

    ``cell_labels`` is the label text the workbook gives the cell (its
    name — row and column labels joined). ``candidates`` are
    ``(fact id, printed line, printed token)`` triples; a 4-tuple's
    last element is the fact's column anchor, **accepted and ignored**.
    Round 6 scored it and its own criterion removed it: on prose the
    line above a figure is the previous sentence, not a header, and
    scoring it invented two confident wrong answers while fixing none.
    D1 still records the anchor — it is correct data, and the judge
    and the source viewer both want it — but the matcher does not
    score it.

    Returns either the single proposed candidate with the full ranking
    behind it, or an abstention that says why in words. The floor and
    the tie rule apply among eligible (non-reference) candidates only.
    """
    wanted = label_tokens(cell_labels)
    if not wanted:
        return Abstained(
            reason=(
                "The cell has no label words to match on — its labels are "
                "empty or purely numeric — so proposing any source would "
                "be a guess about values, which this matcher never makes."
            ),
            ranked=(),
        )

    scored = sorted(
        (
            Candidate(
                fact_id=candidate[0],
                score=len(shared) / len(wanted),
                shared=tuple(sorted(shared)),
                reference=is_reference(candidate[2], candidate[1]),
            )
            for candidate in candidates
            for shared in [wanted & label_tokens(candidate[1])]
        ),
        key=lambda candidate: (-candidate.score, str(candidate.fact_id)),
    )
    ranked = tuple(scored)
    eligible = [candidate for candidate in ranked if not candidate.reference]

    if not eligible or eligible[0].score < FLOOR:
        found = f"{eligible[0].score:.0%}" if eligible else "none"
        set_aside = sum(
            1
            for candidate in ranked
            if candidate.reference and candidate.score >= FLOOR
        )
        aside = (
            f" ({set_aside} candidate(s) covering the labels were set "
            "aside because their number is a document reference — a "
            "section, table or page pointer, not a quantity)"
            if set_aside
            else ""
        )
        return Abstained(
            reason=(
                f"No candidate line covers at least half of the cell's "
                f"label words (best eligible coverage: {found}){aside}, so "
                "nothing is proposed. The cell may simply have no source "
                "in the documents — that is a finding, not a failure."
            ),
            ranked=ranked,
        )

    if len(eligible) > 1 and eligible[1].score == eligible[0].score:
        return Abstained(
            reason=(
                "Two or more candidates tie at the top score — the labels "
                "alone cannot tell them apart, and choosing between them "
                "would be a guess. A person can; this matcher will not."
            ),
            ranked=ranked,
        )

    return Proposed(candidate=eligible[0], ranked=ranked)
