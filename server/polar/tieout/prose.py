"""Naming a figure that sits in a sentence rather than in a table.

Extracted from :mod:`polar.tieout.deck` without a change in behaviour, so
that a memo can be read the same way a slide's body text is. A `.docx`
paragraph and a `.pptx` text frame pose exactly the same problem, and it
is the hard one: a table cell is named by its row and column, and a
sentence is named by nothing until it is cut up.

**The rule that does the work.** « FY2025A reported EBITDA of $41.2mm
adjusts to $48.9mm » holds two figures on two different bases. A label
built from the whole sentence names both of them the same thing, which
means reconciling $41.2mm against the adjusted cell or $48.9mm against the
reported one — confidently wrong about a figure that is correct, which is
the one failure this product cannot afford. So the line is cut at its
figures and each is named by the words between it and the figure before.

The cost is a real one and it is the right way round: « adjusts to
$48.9mm » names nothing, so that figure goes unlinked and nobody checked
it. A miss is a figure nobody checked. A false positive is a banker told
their correct work is wrong, and after two of those nobody opens the tool
again.
"""

import re
from dataclasses import dataclass

from .figures import Found, figures_in

#: Where one clause ends and the next begins. A figure's name does not
#: reach across punctuation: in « ... management plan, 9.8% WACC, 2.5%
#: terminal growth », each figure is named inside its own comma-delimited
#: piece, and reading across the commas swaps the two names round.
CLAUSE_BREAK = re.compile(r"[,;:.]|\s—\s|\s--\s")

#: Text between two figures that makes them the ends of one range rather
#: than two independent claims. « $455mm to $528mm » is a reference range;
#: there is no single cell it reconciles to, so neither end is linked.
RANGE_JOIN = re.compile(r"^\s*(?:to|and|-|–|—|through|,)\s*$", re.IGNORECASE)

#: The one construction where the words *after* a figure name it and the
#: words before it do not: « generated $228.9mm **of revenue** ». Prose
#: puts the noun after the number often enough to matter — in the Cascade
#: memo, « The business generated » and « and there are » are the whole
#: label for two of seven figures without it, and neither names anything.
#:
#: Deliberately just « of », and deliberately requiring a word after it.
#: The obvious generalisation — append the following clause whenever there
#: is one — was tried and rejected on measurement, not taste: it costs the
#: clean Cascade deck a false positive and two reconciled figures (9 drifts
#: and 92 agreeing, against 8 and 94). « of » alone leaves both decks
#: exactly where they were and reaches one more figure in each memo.
BINDS_BACKWARD = re.compile(r"^of\s+\S", re.IGNORECASE)


@dataclass(frozen=True)
class Named:
    """One figure in a line, and the words that name it."""

    item: Found
    #: The clause naming this figure and no other. May be empty, which
    #: means the line said nothing about it and it will not be linked.
    label: str
    #: One end of a printed range — a claim about two cells at once.
    range_endpoint: bool


def has_words(text: str) -> bool:
    """True when a fragment carries something other than punctuation."""
    return any(character.isalpha() for character in text)


def last_clause(text: str) -> str:
    """What is left of a fragment after the last clause break in it."""
    return CLAUSE_BREAK.split(text)[-1].strip()


def first_clause(text: str) -> str:
    """What is left of a fragment before the first clause break in it."""
    return CLAUSE_BREAK.split(text)[0].strip()


def name_figures(line: str) -> list[Named]:
    """Every figure in one line of prose, each with its own clause.

    The words immediately before a figure name it, back as far as the
    nearest clause boundary and no further. « Five-year management plan,
    9.8% WACC, 2.5% terminal growth » puts the word WACC *after* the
    figure it names, so the words before 2.5% are the tail of its
    neighbour's name; a label built from them says 2.5% is the WACC, which
    it is not — and the WACC is 9.8%, which the deck got right.

    A figure with nothing before it is named by what follows instead: a
    metric tile's value has no preceding words at all, and its subtext
    « 11.8% year-on-year » is named by what comes after. So the words
    after are a fallback, never a first choice — except for « of », which
    binds a trailing noun to the number in front of it and is the reason
    « generated $228.9mm of revenue » is a figure this can name at all.
    """
    found = figures_in(line)
    named: list[Named] = []

    for position, item in enumerate(found):
        opens = found[position - 1].end if position else 0
        before = line[opens : item.start]
        after = (
            line[item.end : found[position + 1].start]
            if position + 1 < len(found)
            else line[item.end :]
        )

        head = last_clause(before)
        tail = first_clause(after)
        if not has_words(head):
            label = tail
        elif BINDS_BACKWARD.match(tail):
            label = f"{head} {tail}"
        else:
            label = head

        joined_before = position > 0 and RANGE_JOIN.match(before) is not None
        joined_after = position + 1 < len(found) and RANGE_JOIN.match(after) is not None

        named.append(
            Named(
                item=item,
                label=label,
                range_endpoint=joined_before or joined_after,
            )
        )
    return named


__all__ = [
    "CLAUSE_BREAK",
    "RANGE_JOIN",
    "Named",
    "first_clause",
    "has_words",
    "last_clause",
    "name_figures",
]
