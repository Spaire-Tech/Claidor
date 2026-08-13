"""A file checked against itself, with nothing else in the room.

Every other check in this package needs a counterparty — a model for the
deck, a source for the model. This one needs only the file, which makes
it the check that works on a loose attachment forwarded at 11pm, before
anybody has made a deal or connected anything.

**What it looks for: the same name carrying two figures.** A deck that
says FY2026E EBITDA is $48.9mm on slide 12 and $49.4mm on slide 21 is
wrong somewhere, and no outside information is needed to say so — the
file disagrees with itself. This is the drift error in its purest form:
one slide was updated when the number moved and the other was not.

**The match is the full label, and that strictness is the design.** Two
figures are compared only when every content word of their labels agrees
(`FY2026E EBITDA` never matches `FY2025A EBITDA` — the year is part of
the name, and a bare `2018` counts as a word here even though `tokens`
drops it). Loosening this to partial overlap would catch more real
drifts and would also match « revenue » against « revenue growth », and
a false positive here is a banker told their correct deck disagrees with
itself. The tie-out's rule holds: a miss is a figure nobody checked; a
false positive is the product ending.

**A label must also *be* a name** — at least two content words, ending
nowhere mid-thought — and the two statements must be two *places*: two
values inside one chart or one table are that shape's data, and two
charts never disagree with each other at all. Each of those rules is a
false-positive class found by reading the corpus output by hand; each
carries its evidence at its own code site below.

**What is deliberately not here, said plainly:**

- **Totals are not checked.** « The rows sum to the total row » needs
  real table reconstruction — which cells sit in one column of one table
  — and the figure list this reads from does not carry that reliably for
  every shape a deck takes. A totals check that guesses its columns
  reports correct tables as broken. It stays on the backlog until it can
  be measured, and no screen claims it happened.
- **A model alone is not this module's job.** A workbook checked by
  itself is the model audit, which exists, has its own rules, and cites
  its standards. The endpoint routes there.

Measured before shipping against 29 public decks from the document
corpus — real files by real authors — and the Cascade fixture. Numbers
and the misread that measurement caught are in
`docs/pierce/accuracy-backlog.md`.
"""

import re
from dataclasses import dataclass
from decimal import Decimal

from .figures import Extraction, Figure
from .link import tokens

#: How many figures may share one label before the label stops being a
#: name and starts being a heading. « Total » on every page of a memo's
#: tables is not eleven statements of one figure — it is a word the
#: document uses often, and comparing across them is how a self-check
#: fills with noise. Measured on the public corpus: real repeated
#: *statements* of one figure appear two or three times; a label carried
#: by more than four figures was a layout artefact every time it was
#: read by hand.
MOST_STATEMENTS = 4

#: A bare calendar year. `tokens` drops number-only words, which is right
#: for matching a deck against a model — the model's row carries the year
#: as `FY2023A` — and wrong here, where « 2018 Aldi » and « 2019 Aldi »
#: are two different figures that must never share a name. Measured on
#: the public corpus: eleven of the twenty-three false positives left
#: after the shape filter were chart categories differing only in a bare
#: year the key had thrown away.
_YEAR = re.compile(r"(?<!\d)(?:19|20)\d{2}(?!\d)")

#: A label that stops mid-thought — « Events = », « Mean mark difference
#: = - », a line break glued into it — is the front half of a sentence
#: whose figure was cut off, not a name. Prose says « Events = 6,080 »
#: about one exam board and « Events = 5,514 » about another, and only
#: the words *after* the number tell them apart. A name makes a claim on
#: its own; a fragment borrows the rest of its sentence.
_FRAGMENT = re.compile(r"[=:\-–—]\s*$|\n")


@dataclass(frozen=True)
class Statement:
    """One place the file states the figure."""

    printed: str
    location: str
    page: int


@dataclass(frozen=True)
class Disagreement:
    """One name, two figures, no outside information needed.

    `first` is the earliest statement in reading order and `other` the
    earliest statement that disagrees with it. Which one is *right* is
    not knowable from the file alone, and this deliberately does not
    guess — the finding is that the file says both.
    """

    #: The label as the file prints it, from the first statement.
    label: str
    first: Statement
    other: Statement
    #: How many times the file states this label in total, counting the
    #: agreeing ones — « stated three times, two ways » reads differently
    #: from « stated twice, two ways ».
    statements: int


def disagreements(extraction: Extraction) -> list[Disagreement]:
    """Every name in the file that carries more than one figure."""
    groups: dict[tuple[str, ...], list[Figure]] = {}
    for figure in extraction.figures:
        # One end of a printed range is half a claim, not a figure.
        if figure.range_endpoint:
            continue
        if _FRAGMENT.search(figure.label):
            continue
        key = tuple(tokens(figure.label)) + tuple(_YEAR.findall(figure.label))
        # A one-word name is a heading wearing a figure. « Average » names
        # a row in whatever table it sits in; only the words around it say
        # *average of what*, and those words are not in the label. Two
        # content words is where a label starts carrying its own meaning
        # — measured, every single-word match read by hand was two
        # different quantities that happened to share their noun.
        if len(key) < 2:
            continue
        groups.setdefault(key, []).append(figure)

    found: list[Disagreement] = []
    for group in groups.values():
        if len(group) < 2 or len(group) > MOST_STATEMENTS:
            continue
        # Percentages and multiples never disagree with plain amounts —
        # « 19.3% » beside « $39.6mm » under one label is two different
        # quantities the label happens to cover, not a contradiction.
        kinds = {figure.kind for figure in group}
        if len(kinds) > 1:
            continue
        pair = _first_conflict(group)
        if pair is None:
            continue
        first, later = pair
        found.append(
            Disagreement(
                label=first.label,
                first=Statement(
                    printed=first.printed,
                    location=first.location,
                    page=first.slide,
                ),
                other=Statement(
                    printed=later.printed,
                    location=later.location,
                    page=later.slide,
                ),
                statements=len(group),
            )
        )
    found.sort(key=lambda one: (one.first.page, one.label))
    return found


def _first_conflict(group: list[Figure]) -> tuple[Figure, Figure] | None:
    """The earliest pair of statements that genuinely disagree.

    One finding per name — three distinct values under one label is one
    fact about the file, not two findings — so this returns the first
    conflicting pair in reading order and stops.

    Pairs living inside one shape are never a conflict. Measured on the
    public corpus, nearly every false positive was two values from a
    single chart or a single table: points in one series whose category
    labels truncate identically, or cells in one row read under one
    name. A chart plotting « 2018 Belgium » at two dates is *data*, not
    the file restating a figure — a restatement needs a second place.
    The pair filter (rather than dropping whole groups) keeps the real
    cross-shape case alive: a chart and a table on one slide sharing a
    label but not a value is exactly the drift this module exists for.
    """
    for index, first in enumerate(group):
        for later in group[index + 1 :]:
            if _one_shape(first, later):
                continue
            # Two charts never disagree with each other. A plotted point
            # is data wherever it is plotted; a restatement needs at
            # least one side to *state* the figure — a table cell, a
            # tile, a sentence. Measured: every chart-against-chart pair
            # in the corpus was two different survey questions sharing
            # their answer labels. A chart against a table stays — that
            # is the Cascade drift, and the one this check is for.
            if (
                first.anchor.get("kind") == "chart"
                and later.anchor.get("kind") == "chart"
            ):
                continue
            if _same_value(first.value, later.value):
                continue
            return first, later
    return None


def _one_shape(first: Figure, second: Figure) -> bool:
    """Whether two figures are readings from within a single shape.

    Identity is the anchor's `kind` plus PowerPoint's own shape identity
    (`shape_id`, falling back to `shape_name`), never `shape_id` alone —
    charts and tables number their shapes independently, so a chart and
    a table on one slide can both carry `shape_id` 4 while being two
    shapes. That pair is the check's best real finding, and a filter
    keyed on the bare id would eat it.

    Figures whose anchors carry no shape identity — a memo's paragraphs —
    are never merged: two sentences of prose are two places even when
    they sit in one paragraph.
    """
    if first.slide != second.slide:
        return False
    mine, theirs = first.anchor, second.anchor
    if mine.get("kind") != theirs.get("kind"):
        return False
    for key in ("shape_id", "shape_name"):
        if mine.get(key) is not None and theirs.get(key) is not None:
            return bool(mine[key] == theirs[key])
    return False


def _same_value(first: Decimal | None, second: Decimal | None) -> bool:
    """Whether two statements of a figure agree.

    Compared at the coarser of the two precisions, the way a person ties
    out: « $48.9mm » and « $48.87mm » are one figure said twice, and
    flagging them as a disagreement would report every deck that rounds
    a summary page differently from its detail page.
    """
    if first is None or second is None:
        # A figure without a comparable value cannot disagree — refusing
        # to compare is the honest direction, same as everywhere else.
        return True
    if first == second:
        return True
    exponent = max(first.as_tuple().exponent, second.as_tuple().exponent)
    if not isinstance(exponent, int):
        return True
    quantum = Decimal(1).scaleb(exponent)
    return first.quantize(quantum) == second.quantize(quantum)


__all__ = ["MOST_STATEMENTS", "Disagreement", "Statement", "disagreements"]
