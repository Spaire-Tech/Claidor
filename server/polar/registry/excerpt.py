"""Cutting an opinion down to the passages a screener needs to read.

An opinion in this corpus averages about 192,000 characters — roughly
50,000 tokens. Sending all of it to answer *did this case turn on whether
the clause was enforceable?* is both expensive and worse: the signal sits
in the paragraphs around the doctrine's own language, and everything else
is procedural history and unrelated points of appeal.

So we send the opening, which says what kind of decision this is, and
windows around each place the doctrine is actually discussed.

No network and no model here. What gets shown to a screener is a decision
about coverage, and coverage decisions should be testable on their own.
"""

import re
from dataclasses import dataclass

#: Characters either side of a match. Wide enough to carry the sentence
#: that states the holding and the one that qualifies it — a court rarely
#: decides a clause's fate in fewer words than this.
WINDOW = 1400

#: Opening characters. A caption plus the first lines of the disposition
#: tell you whether this is a merits judgment, a rehearing, or an order.
OPENING = 1200

#: Most windows kept. Beyond this the case is plainly *about* the doctrine
#: and more excerpts add cost without changing the answer.
MAX_WINDOWS = 6

#: Total budget. A screening call should stay small; anything approaching
#: the whole opinion means the excerpting has failed and we would be paying
#: full price for the illusion of a filter.
MAX_CHARS = 24_000

ELISION = "\n\n[…]\n\n"


@dataclass(frozen=True)
class Excerpt:
    """What a screener is shown, and how much of the opinion it covers."""

    text: str
    #: Number of passages found where the doctrine is discussed. Zero is a
    #: meaningful answer, not a failure: the case matched a search phrase
    #: somewhere the excerpter could not locate, or matched on metadata.
    windows: int
    #: Fraction of the opinion shown, for cost and coverage reporting.
    coverage: float


def _terms(queries: tuple[str, ...]) -> list[str]:
    """Bare phrases from the doctrine's search queries.

    The queries are written for a search engine — quoted phrases, several
    per query. What we want here is the phrases themselves, longest first,
    so the most specific match anchors a window before a looser one does.
    """
    found: list[str] = []
    for query in queries:
        quoted = re.findall(r'"([^"]+)"', query)
        found.extend(quoted if quoted else [query])
    unique = {phrase.strip().lower() for phrase in found if len(phrase.strip()) > 3}
    return sorted(unique, key=len, reverse=True)


def excerpt_for(text: str, queries: tuple[str, ...]) -> Excerpt:
    """The opening plus the passages where the doctrine is discussed."""
    if not text:
        return Excerpt(text="", windows=0, coverage=0.0)

    lowered = text.lower()
    spans: list[tuple[int, int]] = []
    for phrase in _terms(queries):
        start = 0
        while len(spans) < MAX_WINDOWS * 3:
            found = lowered.find(phrase, start)
            if found == -1:
                break
            spans.append((max(0, found - WINDOW), min(len(text), found + WINDOW)))
            start = found + len(phrase)

    # Merge overlapping windows so a densely-discussed passage is shown once
    # and reads continuously, rather than as repeated fragments.
    spans.sort()
    merged: list[list[int]] = []
    for begin, end in spans:
        if merged and begin <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([begin, end])

    windows = merged[:MAX_WINDOWS]

    parts = [text[:OPENING].strip()]
    for begin, end in windows:
        if begin < OPENING:
            # Already inside the opening; extend rather than repeat it.
            parts[0] = text[: max(OPENING, end)].strip()
            continue
        parts.append(text[begin:end].strip())

    body = ELISION.join(part for part in parts if part)
    if len(body) > MAX_CHARS:
        body = body[:MAX_CHARS] + "\n\n[…excerpt truncated…]"

    shown = sum(end - begin for begin, end in windows) + OPENING
    return Excerpt(
        text=body,
        windows=len(windows),
        coverage=round(min(1.0, shown / len(text)), 3),
    )
