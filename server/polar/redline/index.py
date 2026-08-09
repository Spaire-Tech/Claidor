"""Every defined term in the document, with its meaning and its uses.

Vesence's Word page shows this as a hover: *« Vesence reads every
definition in the document. Hover a defined term and its meaning, source,
and linked terms appear inline, without leaving the page. »*

It is the cheapest thing on their whole feature list to build well,
because :mod:`polar.redline.terms` already finds every definition and
every use in order to check them. This module does not compute anything
new; it stops throwing the work away.

For a reader it is the more useful half. A lawyer opening a 186-page
agreement somebody else drafted wants to know what « Permitted
Encumbrance » means and where it bites, and finding out today means
scrolling to clause 1 and then searching. Nothing here needs a model, so
nothing here can be wrong about what the document says.

**Linked terms** are definitions that appear inside another definition —
« "Group Company" means a Subsidiary of the Company » links to both. That
is how a reader discovers that one definition rests on three others, which
is exactly the thing that is hard to hold in your head at clause 140.
"""

import re
from dataclasses import dataclass

from .terms import (
    Definition,
    _body_end,
    _plurals,
    _scan,
    _Spans,
    find_definitions,
)

#: Characters of the definition's own words to carry. Long enough for the
#: operative part of most definitions, short enough for a hover.
MEANING = 400


@dataclass(frozen=True)
class Entry:
    """One defined term, as a reader needs it."""

    term: str
    #: The definition's own words, as written.
    meaning: str
    #: Span of the term inside its definition — where « go to definition »
    #: lands.
    start: int
    end: int
    #: How it was defined: ``means`` for a definitions-list entry, ``aside``
    #: for a party named in the preamble.
    kind: str
    #: Offsets of every use outside the definition itself, in order.
    uses: list[int]
    #: Other defined terms this definition relies on.
    linked: list[str]

    @property
    def use_count(self) -> int:
        return len(self.uses)


#: How far back to look for the name a parenthetical aside attaches to.
#: A party block runs to a few hundred characters — a name, a state of
#: incorporation and a full postal address — and the name is at the front
#: of it, so the window has to reach past the address to find it.
_BEHIND = 420

#: Where a party's address begins. Everything after it identifies a
#: building rather than a party.
_ADDRESS = re.compile(
    r",?\s+(?:with\s+(?:its\s+)?(?:offices?|principal)|having\s+its|"
    r"located\s+at|whose\s+(?:registered\s+)?(?:office|address)|"
    r"of\s+\d|at\s+\d)",
    re.IGNORECASE,
)

#: The marker opening an entry in a list of parties: « (1) », « and (b) ».
_PARTY_MARKER = re.compile(
    r"\A[\s,]*(?:by\s+and\s+)?(?:between|among|and)?[\s,]*"
    r"(?:\(?[0-9a-z]{1,3}\)[\s,]*)?",
    re.IGNORECASE,
)


def _trim(words: str) -> str:
    words = " ".join(words.split()).strip()
    if len(words) <= MEANING:
        return words
    return words[:MEANING].rsplit(" ", 1)[0] + "…"


def _meaning(text: str, definition: Definition) -> str:
    """What the term means, which is on a different side for each kind.

    « "Closing Date" means the third Business Day » puts the meaning
    *after* the term. « Acme Holdings Inc. (the "Seller") » puts it
    *before* — the meaning of Seller is Acme Holdings Inc., and reading
    forward from the quote gives the next party in the list instead. That
    was wrong in the first version and visible immediately on the fixture:
    Buyer's meaning came out as « ). ».
    """
    if definition.kind == "aside":
        opening = text.rfind("(", max(0, definition.start - _BEHIND), definition.start)
        cut = opening if opening != -1 else definition.start
        behind = text[max(0, cut - _BEHIND) : cut]
        # Back to the start of the clause. A list of parties is separated
        # by line breaks and semicolons, and each entry opens with its own
        # marker — « (2) », « and (2) ». Cutting at a comma as well was
        # wrong: it discarded the party's name and left « a Delaware
        # corporation », which is a description of nobody.
        # Not a single newline: a party block wraps mid-address in text
        # extracted from a filing, and cutting there returned « VISTA means
        # Avenue Penn, Santa Clarita, CA 91355 » — a meaning that is worse
        # than none, because it reads as an answer.
        for boundary in ("\n\n", ";", '")', "”)", " between ", " among "):
            at = behind.rfind(boundary)
            if at != -1:
                behind = behind[at + len(boundary) :]
        name = _PARTY_MARKER.sub("", behind, count=1)
        # The name and its state of incorporation are what identify a
        # party; the postal address that follows is not.
        address = _ADDRESS.search(name)
        if address:
            name = name[: address.start()]
        return _trim(name)

    return _trim(
        text[definition.end : _body_end(text, definition)].lstrip("\"”\u2019' ")
    )


def definitions_index(text: str) -> list[Entry]:
    """Every defined term, in the order the document defines them.

    A term defined more than once appears once, at its first definition,
    with every use attached. The duplicate itself is a defect and is
    reported by :func:`polar.redline.review_terms`; repeating it here would
    give a reader two entries for one term and no way to tell which
    governs.
    """
    if not text:
        return []

    definitions, _ = find_definitions(text)
    if not definitions:
        return []

    first: dict[str, Definition] = {}
    for definition in definitions:
        first.setdefault(definition.term, definition)

    inside_a_definition = _Spans([(d.start, d.end) for d in definitions])
    bodies = {
        term: (definition.start, _body_end(text, definition))
        for term, definition in first.items()
    }

    forms = {form: term for term in first for form in _plurals(term)}
    found = _scan(text, forms, ignore_case=False)

    entries: list[Entry] = []
    for term, definition in first.items():
        uses = [
            start
            for start, _ in found.get(term, ())
            if not inside_a_definition.contains(start)
        ]

        # Terms this definition leans on. A definition that mentions its own
        # term is not linked to itself, and the mention has to fall inside
        # this definition's body rather than anywhere in the document.
        body_start, body_end = bodies[term]
        linked = sorted(
            {
                other
                for other in first
                if other != term
                and any(
                    body_start <= start < body_end for start, _ in found.get(other, ())
                )
            }
        )

        entries.append(
            Entry(
                term=term,
                meaning=_meaning(text, definition),
                start=definition.start,
                end=definition.end,
                kind=definition.kind,
                uses=uses,
                linked=linked,
            )
        )

    entries.sort(key=lambda entry: entry.start)
    return entries
