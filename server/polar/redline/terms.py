"""Defined terms, and the four ways they go wrong.

A defined term is the one thing in a contract that is unambiguously
mechanical. « "Closing Date" means … » creates an object; every later
« Closing Date » refers to it. So the defects are decidable:

- **Defined and never used.** The definition is dead. Usually the clause it
  served was deleted, and the definition survived — which means a reader
  looking for the deleted obligation finds evidence it once existed.
- **Defined twice.** Two definitions of one term, and the document does not
  say which governs. This is what assembling from precedents produces.
- **Used before defined.** The reader meets the term before its meaning.
- **Wrong case.** « Closing date » where « Closing Date » was defined. In a
  document where capitals carry meaning, this silently turns a defined term
  into ordinary prose, and the difference has been litigated.

Each of those is true of the text or it is not. Nothing here asks a model,
because a model that is wrong about a defined term is wrong in a way the
reader cannot see, and a reader who has to check the checker is doing the
work twice.

Findings carry both a character span and an occurrence index. The span is
for anything reading the text; the occurrence index is for Word, where
locating a phrase means ``Range.search()`` and then choosing the nth hit.

**Known limits, stated rather than discovered later.**

- Only double quotes are read as definitional — straight ``"`` and curly
  ``“ ”``. UK drafting that defines with single quotes (« 'the Company'
  means ») is not seen, because admitting apostrophes as quotes turns every
  possessive into a candidate.
- Nested parentheses are not parsed.
- **Case is only checked on terms of two words or more.** « Company »,
  « Closing » and « Shares » are also ordinary English words, and « a
  Washington limited liability company » is not a miscased defined term.
  There is no mechanical way to tell those apart, so single-word terms are
  not case-checked at all. Real single-word miscasings are therefore
  missed. That is the deliberate trade: a check that is right every time on
  a subset is worth more than one that is right half the time on
  everything, because the second teaches a reader to skim.
- **« Used before defined » is suppressed for terms defined inside a
  definitions block.** A contract with a « 1. DEFINITIONS » clause is meant
  to be read with the recitals first; reporting every recital would put
  findings on every well-drafted document.

Every one of those produces a *missed* finding rather than a false one,
which is the right direction to fail.
"""

import re
from dataclasses import dataclass
from enum import StrEnum

#: Opening and closing double quotes as they actually appear in documents
#: that have been through Word's autocorrect.
_OPEN = '“‟"'
_CLOSE = '”„"'

#: A quoted phrase that could be a defined term: opens with a capital,
#: stays on one line, and is short enough to be a term rather than a quoted
#: sentence from a statute.
_QUOTED = re.compile(rf"[{_OPEN}]\s*([A-Z][^{_OPEN}{_CLOSE}\n]{{0,78}}?)\s*[{_CLOSE}]")

#: What turns a quoted phrase into a definition when it follows one.
#: « "Affiliate" means », « "Closing" shall have the meaning given in ».
_MEANS = re.compile(
    r"\A\s*(?:\([^)]{0,40}\)\s*)?"
    r"(?:shall\s+mean|means|shall\s+have\s+the\s+meanings?|has\s+the\s+meanings?"
    r"|shall\s+refer\s+to|refers\s+to|shall\s+be\s+defined|is\s+defined)\b",
    re.IGNORECASE,
)

#: A parenthetical short enough to be a naming aside rather than a sentence:
#: « (the "Company") », « (each a "Party" and together the "Parties") ».
_PAREN = re.compile(r"\(([^()]{0,200})\)")

#: How far after a quoted phrase to look for « means ».
_REACH = 64

#: Characters of surrounding text carried with each finding, so a reader
#: can judge it without opening the document.
CONTEXT = 120

#: An all-capitals occurrence is a heading, not a miscased defined term.
#: « CLOSING DATE » as a section title is correct drafting.
_ALL_CAPS = re.compile(r"\A[^a-z]+\Z")

#: Definitions this close together, this many in a row, are a definitions
#: clause rather than terms defined where they are first needed.
BLOCK_RUN = 3
BLOCK_SPAN = 4000

#: How far a definition's own explanatory text can run. Inside it the
#: drafter is describing the term in ordinary words — « "Conditions" means
#: the conditions set out in Schedule 1 » — and those words are not
#: miscased uses of the term.
BODY_REACH = 800

#: A full stop that ends a sentence rather than an abbreviation: « Co., »
#: keeps going, « 2025. » does not.
_SENTENCE_END = re.compile(r"\.(?:\s|\Z)")


class Defect(StrEnum):
    defined_never_used = "defined_never_used"
    defined_twice = "defined_twice"
    used_before_defined = "used_before_defined"
    case_mismatch = "case_mismatch"
    quoted_but_undefined = "quoted_but_undefined"


class Certainty(StrEnum):
    #: True of the text as a matter of arithmetic. If one of these is wrong,
    #: the code is wrong, and that is a bug to fix rather than a judgement
    #: call to defend.
    certain = "certain"
    #: Very likely a defect, but a legitimate reading exists — a quoted
    #: phrase may be the title of another document rather than a term the
    #: drafter believed was defined.
    probable = "probable"


@dataclass(frozen=True)
class Definition:
    """A term as the document defines it, and where."""

    term: str
    #: Span of the quoted term itself, not of the whole definition.
    start: int
    end: int


@dataclass(frozen=True)
class Finding:
    defect: Defect
    term: str
    start: int
    end: int
    certainty: Certainty
    #: One sentence, checkable against the span. No adjectives.
    note: str
    context: str
    #: 1-based index of this literal among its own occurrences in the
    #: document. Word finds text by searching; this says which hit is meant.
    occurrence: int
    #: Exactly as written at this span, which for a case mismatch is the
    #: whole point.
    literal: str


def _context(text: str, start: int, end: int) -> str:
    left = max(0, start - CONTEXT)
    right = min(len(text), end + CONTEXT)
    piece = text[left:right].strip()
    return re.sub(r"\s+", " ", piece)


def _flexible(term: str) -> str:
    """A pattern matching the term across whatever whitespace separates it.

    Extracted document text wraps. « Escrow Amount » routinely arrives as
    « Escrow\\nAmount », and a literal-space pattern reports the term as
    never used while it sits in plain sight two lines down. This was a real
    false positive before it was a docstring.
    """
    return r"\s+".join(re.escape(word) for word in term.split())


def _definitions_block(definitions: list["Definition"]) -> int | None:
    """Where the document's definitions clause starts, if it has one.

    A contract with « 1. DEFINITIONS » is written to be read with the
    recitals first: every operative term is used in the recitals before the
    clause that defines it, and that is correct drafting rather than a
    defect. So a run of definitions close together marks a block, and terms
    defined inside it are exempt from « used before defined ».
    """
    for index in range(len(definitions) - BLOCK_RUN + 1):
        run = definitions[index : index + BLOCK_RUN]
        if run[-1].start - run[0].start <= BLOCK_SPAN:
            return run[0].start
    return None


def _body_end(text: str, definition: "Definition") -> int:
    """End of the definition's own explanatory text.

    One sentence, or one paragraph, whichever ends first. The cap matters:
    reaching further would swallow the rest of a document that has no
    paragraph breaks, and every later use of the term with it.
    """
    limit = min(len(text), definition.end + BODY_REACH)
    ends = [limit]
    paragraph = text.find("\n\n", definition.end, limit)
    if paragraph != -1:
        ends.append(paragraph)
    sentence = _SENTENCE_END.search(text, definition.end, limit)
    if sentence is not None:
        ends.append(sentence.end())
    return min(ends)


def _plurals(term: str) -> list[str]:
    """Forms of a term that count as using it.

    A document that defines « "Party" » and only ever writes « Parties »
    has not left a dead definition, and reporting one would be the kind of
    false positive that teaches a reader to skim the findings.
    """
    forms = [term]
    if term.endswith("y") and not term.endswith(("ay", "ey", "oy", "uy")):
        forms.append(term[:-1] + "ies")
    elif term.endswith(("s", "x", "z", "ch", "sh")):
        forms.append(term + "es")
    else:
        forms.append(term + "s")
    return forms


def _quoted_phrases(text: str) -> list[tuple[str, int, int]]:
    found: list[tuple[str, int, int]] = []
    for match in _QUOTED.finditer(text):
        term = match.group(1).strip()
        # A quoted sentence is not a term. Terminal punctuation is the
        # cheapest reliable way to tell them apart.
        if not term or term[-1] in ".!?;:":
            continue
        found.append((term, match.start(1), match.end(1)))
    return found


def _paren_spans(text: str) -> list[tuple[int, int, str]]:
    return [(m.start(1), m.end(1), m.group(1)) for m in _PAREN.finditer(text)]


def find_definitions(text: str) -> tuple[list[Definition], list[Definition]]:
    """Every defined term, and every quoted phrase that is not one.

    Returns ``(definitions, quoted_uses)``. The second list is what makes
    :data:`Defect.quoted_but_undefined` possible: a drafter who puts a
    phrase in quotes usually believes it is defined somewhere.
    """
    definitions: list[Definition] = []
    quoted_uses: list[Definition] = []
    parens = _paren_spans(text)

    for term, start, end in _quoted_phrases(text):
        after = text[end + 1 : end + 1 + _REACH]
        if _MEANS.match(after):
            definitions.append(Definition(term=term, start=start, end=end))
            continue

        # « (the "Company") » — a naming aside. The parenthetical must be
        # short, and must not itself be a sentence, or a quotation inside a
        # long parenthetical would be read as a definition.
        inside = next(
            (body for begin, close, body in parens if begin <= start and end <= close),
            None,
        )
        if inside is not None and len(inside) <= 120 and "." not in inside:
            definitions.append(Definition(term=term, start=start, end=end))
            continue

        quoted_uses.append(Definition(term=term, start=start, end=end))

    return definitions, quoted_uses


def _occurrence_index(text: str, literal: str, start: int) -> int:
    """Which hit this is, when Word searches the document for ``literal``."""
    if not literal:
        return 1
    count = 0
    at = text.find(literal)
    while at != -1 and at <= start:
        count += 1
        if at == start:
            return count
        at = text.find(literal, at + 1)
    return max(1, count)


def review_terms(text: str) -> list[Finding]:
    """Every defined-term defect in the document, in document order."""
    if not text:
        return []

    definitions, quoted_uses = find_definitions(text)
    findings: list[Finding] = []

    by_term: dict[str, list[Definition]] = {}
    for definition in definitions:
        by_term.setdefault(definition.term, []).append(definition)

    defined_spans = [(d.start, d.end) for d in definitions]
    body_spans = [(d.start, _body_end(text, d)) for d in definitions]
    block_start = _definitions_block(definitions)

    def _in_a_definition(at: int) -> bool:
        return any(start <= at < end for start, end in defined_spans)

    def _in_a_definition_body(at: int) -> bool:
        return any(start <= at < end for start, end in body_spans)

    for term, occurrences in by_term.items():
        first = occurrences[0]

        # Defined twice. Reported on the second and any later definition,
        # because the first one is not the problem.
        for repeat in occurrences[1:]:
            findings.append(
                Finding(
                    defect=Defect.defined_twice,
                    term=term,
                    start=repeat.start,
                    end=repeat.end,
                    certainty=Certainty.certain,
                    note=(
                        f'"{term}" is defined here and also at character '
                        f"{first.start}. The document does not say which "
                        f"definition governs."
                    ),
                    context=_context(text, repeat.start, repeat.end),
                    occurrence=_occurrence_index(text, term, repeat.start),
                    literal=term,
                )
            )

        # Uses: the term or a plural of it, matched case-sensitively,
        # anywhere outside a definition's own quoted span.
        uses: list[int] = []
        for form in _plurals(term):
            pattern = re.compile(rf"\b{_flexible(form)}\b")
            uses.extend(
                match.start()
                for match in pattern.finditer(text)
                if not _in_a_definition(match.start())
            )
        uses.sort()

        if not uses:
            findings.append(
                Finding(
                    defect=Defect.defined_never_used,
                    term=term,
                    start=first.start,
                    end=first.end,
                    certainty=Certainty.certain,
                    note=(
                        f'"{term}" is defined but never used. Either the '
                        f"clause it served was removed, or a use of it is "
                        f"miscased."
                    ),
                    context=_context(text, first.start, first.end),
                    occurrence=_occurrence_index(text, term, first.start),
                    literal=term,
                )
            )
        elif uses[0] < first.start and not (
            block_start is not None and first.start >= block_start
        ):
            findings.append(
                Finding(
                    defect=Defect.used_before_defined,
                    term=term,
                    start=uses[0],
                    end=uses[0] + len(term),
                    certainty=Certainty.certain,
                    note=(
                        f'"{term}" is used here, before it is defined at '
                        f"character {first.start}."
                    ),
                    context=_context(text, uses[0], uses[0] + len(term)),
                    occurrence=_occurrence_index(text, term, uses[0]),
                    literal=text[uses[0] : uses[0] + len(term)],
                )
            )

        # Wrong case. Only for terms of two words or more: « company »,
        # « closing » and « shares » are ordinary English, and no rule
        # distinguishes « a Washington limited liability company » from a
        # miscased defined term. See the module docstring.
        if len(term.split()) < 2:
            continue

        loose = re.compile(rf"\b{_flexible(term)}\b", re.IGNORECASE)
        for match in loose.finditer(text):
            literal = match.group(0)
            # « Escrow\nAmount » is the term, wrapped. Comparing raw would
            # report every multi-word term that crosses a line break.
            if re.sub(r"\s+", " ", literal) == term:
                continue
            if _in_a_definition(match.start()):
                continue
            if _ALL_CAPS.match(literal):
                continue
            # Inside a definition's own explanatory text the drafter is
            # describing the term in ordinary words, not using it.
            if _in_a_definition_body(match.start()):
                continue
            findings.append(
                Finding(
                    defect=Defect.case_mismatch,
                    term=term,
                    start=match.start(),
                    end=match.end(),
                    certainty=Certainty.certain,
                    note=(
                        f'Written "{literal}" where the defined term is '
                        f'"{term}". As written this is ordinary prose, not '
                        f"the defined term."
                    ),
                    context=_context(text, match.start(), match.end()),
                    occurrence=_occurrence_index(text, literal, match.start()),
                    literal=literal,
                )
            )

    # A phrase the drafter put in quotes but never defined.
    for quoted in quoted_uses:
        if quoted.term in by_term:
            continue
        findings.append(
            Finding(
                defect=Defect.quoted_but_undefined,
                term=quoted.term,
                start=quoted.start,
                end=quoted.end,
                certainty=Certainty.probable,
                note=(
                    f'"{quoted.term}" is written as a defined term but no '
                    f"definition appears in this document."
                ),
                context=_context(text, quoted.start, quoted.end),
                occurrence=_occurrence_index(text, quoted.term, quoted.start),
                literal=quoted.term,
            )
        )

    # One miscased phrase is one defect. Where terms nest — « Adverse
    # Change » inside « Material Adverse Change » — the longer term is the
    # one the drafter meant, and reporting both reads as two problems.
    miscased = [f for f in findings if f.defect is Defect.case_mismatch]
    swallowed = {
        id(inner)
        for inner in miscased
        for outer in miscased
        if inner is not outer
        and outer.start <= inner.start
        and inner.end <= outer.end
        and len(outer.term) > len(inner.term)
    }
    findings = [f for f in findings if id(f) not in swallowed]

    findings.sort(key=lambda finding: (finding.start, finding.defect))
    return findings
