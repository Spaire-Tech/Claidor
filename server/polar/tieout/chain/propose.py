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

_WORD = re.compile(r"[a-z0-9]+")


def label_tokens(text: str) -> frozenset[str]:
    """The comparable words of a label or a printed line.

    Lowercased alphanumeric runs, with purely numeric runs dropped —
    the never-by-value rule enforced at the token level, so no caller
    can leak a value into scoring by formatting it into a string.
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
    cell_labels: str, candidates: Sequence[tuple[UUID, str]]
) -> Proposed | Abstained:
    """One cell's label text against every candidate fact's line.

    ``cell_labels`` is the label text the workbook gives the cell (its
    name — row and column labels joined). ``candidates`` are
    ``(fact id, printed line)`` pairs. Returns either the single
    proposed candidate with the full ranking behind it, or an
    abstention that says why in words.
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
                fact_id=fact_id,
                score=len(shared) / len(wanted),
                shared=tuple(sorted(shared)),
            )
            for fact_id, line in candidates
            for shared in [wanted & label_tokens(line)]
        ),
        key=lambda candidate: (-candidate.score, str(candidate.fact_id)),
    )
    ranked = tuple(scored)

    if not ranked or ranked[0].score < FLOOR:
        found = f"{ranked[0].score:.0%}" if ranked else "none"
        return Abstained(
            reason=(
                f"No candidate line covers at least half of the cell's "
                f"label words (best coverage: {found}), so nothing is "
                "proposed. The cell may simply have no source in the "
                "documents — that is a finding, not a failure."
            ),
            ranked=ranked,
        )

    if len(ranked) > 1 and ranked[1].score == ranked[0].score:
        return Abstained(
            reason=(
                "Two or more candidates tie at the top score — the labels "
                "alone cannot tell them apart, and choosing between them "
                "would be a guess. A person can; this matcher will not."
            ),
            ranked=ranked,
        )

    return Proposed(candidate=ranked[0], ranked=ranked)
