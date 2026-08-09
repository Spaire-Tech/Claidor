"""Defined terms, and the five ways they go wrong.

A defined term is the one thing in a contract that is unambiguously
mechanical. « "Closing Date" means … » creates an object; every later
« Closing Date » refers to it.

The defect names and severities are **Vesence's own**, taken from the
screenshot published on their Word page, because this is a clone and a
finding should be comparable to theirs without translation:

- **Undefined term** *(critical)*. A phrase used as a defined term that the
  document never defines. A hole in the agreement.
- **Unused definition** *(warning)*. The definition is dead — usually the
  clause it served was deleted and the definition survived.
- **Multiple definitions** *(warning)*. Two definitions of one term, and
  nothing says which governs. This is what assembling from precedents does.
- **Unordered definitions** *(to review)*. The definitions list is not
  alphabetical.
- **Wrong case** *(warning)*. Ours, not theirs; it probably sits under
  their « language » heading. « Closing date » where « Closing Date » was
  defined turns a defined term into ordinary prose.

Nothing here asks a model. A model that is wrong about a defined term is
wrong in a way the reader cannot see, and a reader who has to check the
checker is doing the work twice. Four of the five checks are *certain* —
true of the text as arithmetic. Only **undefined term** is *probable*, and
it says so, because a contract capitalises Delaware and Tuesday as well as
Purchase Price.

Findings carry a character span and an occurrence index. The span is for
anything reading the text; the index is for Word, where locating a phrase
means ``Range.search()`` and then choosing the nth hit.

**Known limits, stated rather than discovered later.**

- Only double quotes are read as definitional — straight ``"`` and curly
  ``“ ”``. UK drafting that defines with single quotes is not seen, because
  admitting apostrophes as quotes makes every possessive a candidate.
- Nested parentheses are not parsed.
- **Case is only checked on terms of two words or more.** « Company » and
  « Shares » are ordinary English, and « a Washington limited liability
  company » is not a miscased defined term. Single-word miscasings are
  therefore missed. A check that is right every time on a subset is worth
  more than one right half the time on everything, because the second
  teaches a reader to skim.
- **An undefined-term candidate must follow a definite determiner.** « the
  Long Stop Date » is reported; « in Seattle, Washington » and « means Acme
  Operating Co. » are not. So a term used without a determiner —
  « Consideration shall be paid » — is missed.
- **There is no « used before defined » check.** It was built, and it
  reported every term named in the recitals of a correctly drafted
  contract, because recitals precede clause 1 in every agreement ever
  written. Vesence does not have this check either. Removed rather than
  patched.

Every limit above produces a *missed* finding rather than a false one,
which is the right direction to fail.
"""

import bisect
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

#: What a naming aside contains, and nothing else. Legal prose is full of
#: parentheticals that quote a term without defining it — « (as defined in
#: the "Credit Agreement") », « (other than the "Excluded Subsidiaries") »,
#: « (each as defined in the "Indenture") ». Treating those as definitions
#: produced a hundred « multiple definitions » per document on real credit
#: agreements, because the same term is quoted that way over and over.
_ASIDE = re.compile(
    r"\A[\s,;]*(?:(?:the|a|an|this|these|those|such|each|any|collectively|"
    r"together|with|and|or|individually|severally|jointly|being|referred|to|"
    r"as|herein|hereinafter|hereto|hereof|called|known|respectively)\b"
    r"[\s,;]*)*\Z",
    re.IGNORECASE,
)


def _is_naming_aside(body: str, term: str) -> bool:
    """Whether a parenthetical names the term rather than mentioning it."""
    if len(body) > 120 or "." in body:
        return False
    # Everything outside the quoted terms must be connective tissue.
    remainder = re.sub(rf"[{_OPEN}][^{_OPEN}{_CLOSE}]*[{_CLOSE}]", " ", body)
    if term in remainder:
        remainder = remainder.replace(term, " ")
    return bool(_ASIDE.match(remainder))


#: How far after a quoted phrase to look for « means ».
_REACH = 64

#: Characters of surrounding text carried with each finding, so a reader
#: can judge it without opening the document.
CONTEXT = 120

#: An all-capitals occurrence is a heading, not a miscased defined term.
#: « CLOSING DATE » as a section title is correct drafting.
_ALL_CAPS = re.compile(r"\A[^a-z]+\Z")

#: Fewer entries than this is not a definitions list, and calling it
#: unordered would be pedantry.
MIN_LIST = 3

#: How far a definition's own explanatory text can run. Inside it the
#: drafter is describing the term in ordinary words — « "Conditions" means
#: the conditions set out in Schedule 1 » — and those words are not
#: miscased uses of the term.
BODY_REACH = 800

#: A full stop that ends a sentence rather than an abbreviation: « Co., »
#: keeps going, « 2025. » does not.
_SENTENCE_END = re.compile(r"\.(?:\s|\Z)")


class Defect(StrEnum):
    """The defect names are theirs, deliberately.

    Vesence publishes its own taxonomy in a screenshot on the Word page —
    *Undefined term*, *Unused definition*, *Multiple definitions*,
    *Unordered definitions* — and this is a clone. Matching the vocabulary
    means a finding can be compared against theirs directly instead of
    translated first.

    ``case_mismatch`` is ours and has no counterpart there; it most likely
    sits under their « language » category.
    """

    undefined_term = "undefined_term"
    unused_definition = "unused_definition"
    multiple_definitions = "multiple_definitions"
    unordered_definitions = "unordered_definitions"
    case_mismatch = "case_mismatch"
    broken_reference = "broken_reference"
    numbering_gap = "numbering_gap"
    duplicate_number = "duplicate_number"


class Severity(StrEnum):
    """Their four buckets, in their order.

    *Ignored* is a state a reader puts a finding into, not one the engine
    assigns, so it is stored per document rather than computed here.
    """

    critical = "critical"
    warning = "warning"
    to_review = "to_review"
    ignored = "ignored"


#: Which bucket each defect falls in. Undefined terms are critical because
#: a term with no meaning is a hole in the agreement; an unused definition
#: is untidy but harmless.
SEVERITY: dict[Defect, Severity] = {
    Defect.undefined_term: Severity.critical,
    Defect.unused_definition: Severity.warning,
    Defect.multiple_definitions: Severity.warning,
    Defect.case_mismatch: Severity.warning,
    Defect.unordered_definitions: Severity.to_review,
    # A reference to a clause that is not there is as serious as a term
    # with no meaning: the obligation it points at cannot be read.
    Defect.broken_reference: Severity.critical,
    Defect.numbering_gap: Severity.warning,
    Defect.duplicate_number: Severity.warning,
}


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
    #: ``means`` for « "Closing Date" means … », the entries of a
    #: definitions clause. ``aside`` for « Acme Holdings Inc. (the
    #: "Seller") », which names a party where it first appears. Only the
    #: first kind belongs to a definitions list, which is why the
    #: alphabetical-order check must be able to tell them apart.
    kind: str = "means"


@dataclass(frozen=True)
class Finding:
    defect: Defect
    term: str
    start: int
    end: int
    certainty: Certainty
    severity: Severity
    #: One sentence, checkable against the span. No adjectives.
    note: str
    context: str
    #: 1-based index of this literal among its own occurrences in the
    #: document. Word finds text by searching; this says which hit is meant.
    occurrence: int
    #: Exactly as written at this span, which for a case mismatch is the
    #: whole point.
    literal: str


class _Spans:
    """Regions of the document, answering « is this offset inside one? ».

    A linear scan here cost sixteen of twenty seconds on a 186-page
    document — their own example size — because every candidate match was
    compared against every definition. Sorted starts with a running
    maximum end give the same answer in a binary search, and the running
    maximum is what makes it correct when two regions overlap.
    """

    __slots__ = ("_reach", "_starts")

    def __init__(self, spans: list[tuple[int, int]]) -> None:
        ordered = sorted(spans)
        self._starts = [start for start, _ in ordered]
        self._reach: list[int] = []
        furthest = -1
        for _, end in ordered:
            furthest = max(furthest, end)
            self._reach.append(furthest)

    def contains(self, at: int) -> bool:
        index = bisect.bisect_right(self._starts, at) - 1
        return index >= 0 and at < self._reach[index]


class _Occurrences:
    """Where each literal appears, computed once per literal.

    Word locates a phrase by searching and taking the nth hit, so every
    finding needs its index among its own occurrences. Computing that by
    walking from the start of the document per finding is quadratic, and
    it showed: 2.6 million string searches on one document.
    """

    __slots__ = ("_cache", "_text")

    def __init__(self, text: str) -> None:
        self._text = text
        self._cache: dict[str, list[int]] = {}

    def _positions(self, literal: str) -> list[int]:
        known = self._cache.get(literal)
        if known is None:
            known = []
            at = self._text.find(literal)
            while at != -1:
                known.append(at)
                at = self._text.find(literal, at + 1)
            self._cache[literal] = known
        return known

    def index_of(self, literal: str, start: int) -> int:
        """1-based index of the occurrence at ``start``."""
        if not literal:
            return 1
        positions = self._positions(literal)
        at = bisect.bisect_left(positions, start)
        if at < len(positions) and positions[at] == start:
            return at + 1
        return max(1, at)


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


def definitions_list(definitions: list["Definition"]) -> list["Definition"]:
    """The document's definitions list, in the order it is written.

    Two exclusions, both of which were false positives first:

    - **Parenthetical asides.** « Acme Holdings Inc. (the "Seller") » names
      a party in the parties clause. It is not an entry in a definitions
      list, and counting it made a correctly alphabetised contract look
      unordered because Seller and Buyer come before Accounts.
    - **Repeat definitions.** A term defined twice appears twice in the
      sequence and breaks the ordering. That is already reported as
      :data:`Defect.multiple_definitions`; reporting it again here would
      be the same defect twice under two names.
    """
    seen: set[str] = set()
    entries: list[Definition] = []
    for definition in definitions:
        if definition.kind != "means" or definition.term in seen:
            continue
        seen.add(definition.term)
        entries.append(definition)
    return entries


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
        if inside is not None and _is_naming_aside(inside, term):
            definitions.append(
                Definition(term=term, start=start, end=end, kind="aside")
            )
            continue

        quoted_uses.append(Definition(term=term, start=start, end=end))

    return definitions, quoted_uses


def _wording(text: str, definition: Definition) -> str:
    """A definition's own words, normalised, for comparing two of them."""
    return re.sub(
        r"\s+", " ", text[definition.end : _body_end(text, definition)]
    ).strip()


def _finding(
    text: str,
    located: "_Occurrences",
    *,
    defect: Defect,
    term: str,
    start: int,
    end: int,
    certainty: Certainty,
    note: str,
) -> Finding:
    """Build a finding, deriving everything derivable.

    Severity comes from the defect, context and occurrence index from the
    span. Passing them in by hand at eleven call sites is how a finding
    ends up with a severity that contradicts its own defect.
    """
    literal = text[start:end]
    return Finding(
        defect=defect,
        term=term,
        start=start,
        end=end,
        certainty=certainty,
        severity=SEVERITY[defect],
        note=note,
        context=_context(text, start, end),
        occurrence=located.index_of(literal, start),
        literal=literal,
    )


#: A run of Title-Case words — how a defined term is written when it is
#: used. Four words is the practical ceiling; longer runs are headings.
_TITLE_RUN = re.compile(r"\b[A-Z][a-z]{1,}(?:[ \t]+[A-Z][a-z]{1,}){0,3}\b")

#: Determiners that ride in front of a term and are not part of it.
#: « The Purchase Price » is a use of « Purchase Price ».
_LEADING = ("The ", "Any ", "Each ", "Such ", "This ", "That ", "No ", "All ", "Its ")

#: An indefinite article in front of a capitalised phrase means it is not a
#: defined term. A defined term names one specific thing, so it takes
#: « the »; « a Delaware corporation » and « a Washington limited liability
#: company » are descriptions, and both were false positives before this
#: rule existed. The cost is missing « on a Business Day », which is a
#: missed finding rather than a wrong one.
_INDEFINITE = re.compile(r"\b(?:a|an)\s+$", re.IGNORECASE)

#: Capitalised words that are never defined terms. Structural references,
#: dates, and the furniture of a contract's own prose.
_NOT_A_TERM = frozenset(
    {
        # Structure
        "clause",
        "clauses",
        "section",
        "sections",
        "schedule",
        "schedules",
        "exhibit",
        "exhibits",
        "annex",
        "annexes",
        "appendix",
        "appendices",
        "part",
        "parts",
        "article",
        "articles",
        "paragraph",
        "paragraphs",
        "recital",
        "recitals",
        "page",
        "pages",
        "chapter",
        "table",
        # Instrument furniture
        "whereas",
        "witnesseth",
        "now therefore",
        "in witness whereof",
        "definitions",
        "interpretation",
        "background",
        "between",
        "signed",
        # Time
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        # Places and bodies that recur in every US filing.
        "united states",
        "state",
        "states",
        "district",
        "commonwealth",
        "commission",
        "government",
    }
)

#: A phrase ending in one of these names a statute, a rule-book or an
#: institution — « Securities Exchange Act », « Internal Revenue Code »,
#: « American Arbitration Association ». Referring to one by name is not a
#: missing definition, and these were among the commonest false positives
#: on real filings.
_NAMED_INSTRUMENT = re.compile(
    r"\b(?:Act|Code|Rules?|Regulations?|Association|Commission|Exchange|"
    r"Treasury|Department|Bureau|Agency|Authority|Court)$"
)

#: Capitalised words that end a run without belonging to the term. A
#: signature block reads « Collateral Manager By: ___ »; a sentence reads
#: « the Employment Agreement Is hereby amended ». Both appeared as
#: undefined terms in real filings.
_TRAILING = re.compile(
    r"\s+(?:By|Is|Are|Was|Were|Shall|Will|Has|Have|Had|Its|And|Or|If|As|"
    r"The|A|An|In|On|Of|To|For|With)$"
)

#: A candidate must be preceded by one of these. A defined term names one
#: specific thing, so it is introduced by a definite determiner: « the Long
#: Stop Date », « such Material Adverse Change ». A proper noun is not:
#: « in Seattle, Washington », « means Acme Operating Co. ». This one rule
#: removed four false positives that no stoplist could have covered,
#: because states and company names cannot be enumerated.
_DETERMINER = re.compile(
    r"\b(?:the|this|that|these|those|such|each|any|all|its|said|both|every)\s+$",
    re.IGNORECASE,
)

#: Capitalised function words that open a sentence or a clause. « At
#: Closing, the Purchaser shall pay » is a use of « Closing », not of « At
#: Closing ».
_OPENER = re.compile(
    r"\A(?:At|In|On|For|By|To|From|With|If|Where|When|Upon|Subject|Save|"
    r"Notwithstanding|Following|During|Under|Pursuant)\s+"
)

#: A candidate must be seen this many times before it is reported.
#:
#: Measured, not chosen. On fifteen real agreements, reporting single
#: sightings gave 14 undefined terms per document; requiring two gave 8.8,
#: and both still reproduce Vesence's published example exactly. Three
#: would give 7.2 and lose their example, so two is where the evidence
#: stops.
#:
#: The cost is real: a term used once and never defined is missed. That is
#: the right direction — a capitalised phrase appearing once is far more
#: often a person, a place or an institution than a term somebody forgot
#: to define.
MIN_SIGHTINGS = 2

#: A document must define at least this many terms in a « "X" means … »
#: form before any phrase in it is judged as an undefined term.
#:
#: Six of fifteen real agreements had none at all — employment agreements
#: and bank documents that define inline or not at all. In a document with
#: no definitions convention, capitalisation says nothing about what is a
#: defined term, and every Title-Case phrase in it becomes noise. The
#: check needs a convention to measure against before it can measure
#: anything.
MIN_CONVENTION = 3


def _sentence_starts(text: str) -> set[int]:
    """Offsets where a capital is grammar rather than a defined term."""
    starts = {0}
    #: A clause number sits between the break and the first word:
    #: « 3.2 If the Conditions », « (a) The Seller ». Without consuming it
    #: the capital after it looks mid-sentence, and « If » and « In » get
    #: reported as undefined terms — both were false positives here.
    for match in re.finditer(r"(?:[.!?:;]|\n)\s*(?:\(?[0-9a-z]{1,4}[.)]\s*)*", text):
        starts.add(match.end())
    return starts


def has_definitions_convention(definitions: list["Definition"]) -> bool:
    """Whether the document defines terms explicitly enough to judge it.

    Parenthetical asides do not count. « Acme Inc. (the "Seller") » names a
    party; it is not evidence that the drafter marks defined terms by
    capitalising them. Only a real definitions list is.
    """
    return sum(1 for d in definitions if d.kind == "means") >= MIN_CONVENTION


def find_undefined(text: str, defined: set[str]) -> list[tuple[str, int, int]]:
    """Title-Case phrases used as terms that the document never defines.

    This is the check Vesence ranks *Critical*, and it is the only one here
    that cannot be made exact: a contract capitalises defined terms, but it
    also capitalises Delaware, Acme Holdings and Tuesday. So the rules
    below are all about *not* reporting, and the honest label on the result
    is « probable ».
    """
    known = {form for term in defined for form in _plurals(term)}
    sentence_starts = _sentence_starts(text)

    sightings: dict[str, list[tuple[int, int]]] = {}
    for match in _TITLE_RUN.finditer(text):
        start, end = match.start(), match.end()
        phrase = re.sub(r"\s+", " ", match.group(0))

        if _INDEFINITE.search(text[max(0, start - 6) : start]):
            continue

        # « The Purchase Price » is a use of « Purchase Price ».
        for article in _LEADING:
            if phrase.startswith(article):
                start += len(article)
                phrase = phrase[len(article) :]
                break

        trailing = _TRAILING.search(phrase)
        if trailing:
            phrase = phrase[: trailing.start()]
            if not phrase:
                continue

        if _NAMED_INSTRUMENT.search(phrase) or phrase.lower() in _NOT_A_TERM:
            continue

        # « At Closing, … » is a use of « Closing ».
        opener = _OPENER.match(phrase)
        if opener and start in sentence_starts:
            start += opener.end()
            phrase = phrase[opener.end() :]

        if not _DETERMINER.search(text[max(0, start - 12) : start]):
            continue

        if not phrase or phrase in known or phrase.lower() in _NOT_A_TERM:
            continue
        # A single capitalised word opening a sentence is grammar. If it is
        # really a defined term it will also appear mid-sentence, and it is
        # reported there.
        if " " not in phrase and start in sentence_starts:
            continue
        # Part of a longer term the document does define.
        if any(phrase in term for term in defined):
            continue

        sightings.setdefault(phrase, []).append((start, end))

    return [
        (phrase, spans[0][0], spans[0][1])
        for phrase, spans in sightings.items()
        if len(spans) >= MIN_SIGHTINGS
    ]


def _scan(
    text: str, forms: dict[str, str], *, ignore_case: bool
) -> dict[str, list[tuple[int, int]]]:
    """Find every surface form of every term in one pass.

    A regex per term costs one scan of the document per defined term. A
    real share purchase agreement has around 170 of them, and that was
    five seconds. One alternation is one scan.

    Longest form first, so « Closing Date » wins over « Closing » where
    both are defined — regex alternation takes the first branch that
    matches, so the order *is* the disambiguation rule.
    """
    if not forms:
        return {}
    ordered = sorted(forms, key=len, reverse=True)
    pattern = re.compile(
        r"\b(?:" + "|".join(_flexible(form) for form in ordered) + r")\b",
        re.IGNORECASE if ignore_case else 0,
    )
    lookup = {(k.lower() if ignore_case else k): v for k, v in forms.items()}

    hits: dict[str, list[tuple[int, int]]] = {}
    for match in pattern.finditer(text):
        written = re.sub(r"\s+", " ", match.group(0))
        term = lookup.get(written.lower() if ignore_case else written)
        if term is not None:
            hits.setdefault(term, []).append((match.start(), match.end()))
    return hits


#: The boilerplate that says a document is not self-contained. Nearly every
#: amendment, exhibit, schedule and side letter carries some form of it.
_DEFERS = re.compile(
    r"capitali[sz]ed\s+terms[^.]{0,120}?not\s+(?:otherwise\s+)?defined"
    r"|terms\s+(?:used\s+)?(?:but\s+)?not\s+(?:otherwise\s+)?defined\s+herein"
    r"|shall\s+have\s+the\s+(?:respective\s+)?meanings?\s+"
    r"(?:ascribed|given|assigned|set\s+forth)[^.]{0,80}?"
    r"(?:in|to)\s+the\s+\w+\s+Agreement"
    r"|amendment\s+no\.?\s*\d"
    r"|is\s+hereby\s+amended",
    re.IGNORECASE | re.DOTALL,
)


def defers_definitions(text: str) -> bool:
    """Whether this document takes its defined terms from another one.

    An amendment, an exhibit, a schedule and a side letter all use terms
    the parent agreement defines, and none of them repeat those
    definitions. Reporting every one as « undefined » is correct about the
    text and wrong about the world.

    This was measured, not guessed: on fifteen real amendments pulled from
    SEC filings, the undefined-term check produced **47 findings per
    document**, nearly all of them terms defined in the parent agreement.
    The signal is boilerplate — « capitalised terms used but not defined
    herein shall have the meanings ascribed to them in the Credit
    Agreement » — and it is close to universal, because a drafter who
    borrows definitions says so.
    """
    return bool(_DEFERS.search(text))


def review_terms(text: str) -> list[Finding]:
    """Every defined-term defect in the document, in document order."""
    if not text:
        return []

    definitions, quoted_uses = find_definitions(text)
    findings: list[Finding] = []

    by_term: dict[str, list[Definition]] = {}
    for definition in definitions:
        by_term.setdefault(definition.term, []).append(definition)

    located = _Occurrences(text)
    defined_spans = _Spans([(d.start, d.end) for d in definitions])
    body_spans = _Spans([(d.start, _body_end(text, d)) for d in definitions])
    _in_a_definition = defined_spans.contains
    _in_a_definition_body = body_spans.contains

    # Every surface form of every term, found in two passes over the
    # document rather than two per term.
    use_forms = {form: term for term in by_term for form in _plurals(term)}
    used_at = _scan(text, use_forms, ignore_case=False)
    # Case is only checked on terms of two words or more — see the module
    # docstring for why single words cannot be checked at all.
    loose_forms = {
        term: term
        for term in by_term
        if len(term.split()) >= 2 and not _ALL_CAPS.match(term)
    }
    written_at = _scan(text, loose_forms, ignore_case=True)

    for term, defined_at in by_term.items():
        first = defined_at[0]

        # Defined twice. Reported on the second and any later definition,
        # because the first one is not the problem — and only when the
        # wording actually differs.
        #
        # The defect is « two definitions and nothing says which governs »,
        # which requires them to disagree. A document that repeats its own
        # preamble — a credit agreement with a signature page per lender
        # repeats « (the "Company") » fifty times — is not ambiguous, it is
        # long. Real filings produced 52 of these per document before this
        # check compared the definitions rather than counting them.
        wording = {_wording(text, first)}
        for repeat in defined_at[1:]:
            said = _wording(text, repeat)
            if said in wording:
                continue
            wording.add(said)
            findings.append(
                _finding(
                    text,
                    located,
                    defect=Defect.multiple_definitions,
                    term=term,
                    start=repeat.start,
                    end=repeat.end,
                    certainty=Certainty.certain,
                    note=(
                        f'"{term}" is defined here and also at character '
                        f"{first.start}. The document does not say which "
                        f"definition governs."
                    ),
                )
            )

        # Uses: the term or a plural of it, anywhere outside a definition's
        # own quoted span.
        uses = [
            start for start, _ in used_at.get(term, ()) if not _in_a_definition(start)
        ]

        if not uses:
            findings.append(
                _finding(
                    text,
                    located,
                    defect=Defect.unused_definition,
                    term=term,
                    start=first.start,
                    end=first.end,
                    certainty=Certainty.certain,
                    note=(
                        f'"{term}" is defined but never used. Either the '
                        f"clause it served was removed, or a use of it is "
                        f"miscased."
                    ),
                )
            )

        # Wrong case. Skipped when the definition itself is capitalised:
        # « "TRADE SECRET" means … » is a styling choice for the
        # definitions list, and the body writing « Trade Secret » is
        # correct drafting rather than a defect. Real filings produced 139
        # of these in one agreement for exactly this reason.
        for start, end in written_at.get(term, ()):
            literal = text[start:end]
            # « Escrow\nAmount » is the term, wrapped. Comparing raw would
            # report every multi-word term that crosses a line break.
            if re.sub(r"\s+", " ", literal) == term:
                continue
            if _in_a_definition(start) or _ALL_CAPS.match(literal):
                continue
            # Inside a definition's own explanatory text the drafter is
            # describing the term in ordinary words, not using it.
            if _in_a_definition_body(start):
                continue
            findings.append(
                _finding(
                    text,
                    located,
                    defect=Defect.case_mismatch,
                    term=term,
                    start=start,
                    end=end,
                    certainty=Certainty.certain,
                    note=(
                        f'Written "{literal}" where the defined term is '
                        f'"{term}". As written this is ordinary prose, not '
                        f"the defined term."
                    ),
                )
            )

    # Undefined terms — their « Critical » bucket. Two sources: a phrase
    # the drafter put in quotation marks, which is close to an admission
    # that they believed it was defined; and a Title-Case phrase used
    # repeatedly that the document never defines.
    #
    # Skipped entirely when the document says it borrows its definitions.
    # See :func:`defers_definitions`.
    reported: set[str] = set()
    # Two reasons not to judge undefined terms at all: the document says it
    # takes its definitions from elsewhere, or it has no definitions
    # convention to measure against.
    borrowed = defers_definitions(text) or not has_definitions_convention(definitions)
    for quoted in quoted_uses:
        if borrowed or quoted.term in by_term or quoted.term in reported:
            continue
        reported.add(quoted.term)
        findings.append(
            _finding(
                text,
                located,
                defect=Defect.undefined_term,
                term=quoted.term,
                start=quoted.start,
                end=quoted.end,
                certainty=Certainty.probable,
                note=(
                    f'"{quoted.term}" is written in quotation marks as a '
                    f"defined term, but no definition appears in this "
                    f"document."
                ),
            )
        )

    for phrase, start, end in find_undefined(text, set(by_term)):
        if borrowed or phrase in reported:
            continue
        reported.add(phrase)
        findings.append(
            _finding(
                text,
                located,
                defect=Defect.undefined_term,
                term=phrase,
                start=start,
                end=end,
                certainty=Certainty.probable,
                note=(
                    f'"{phrase}" is capitalised as a defined term throughout '
                    f"but no definition appears in this document."
                ),
            )
        )

    # Definitions out of alphabetical order — their « To review » bucket.
    entries = definitions_list(definitions)
    if len(entries) >= MIN_LIST:
        ordered = sorted(entries, key=lambda d: d.term.lower())
        if [d.term for d in entries] != [d.term for d in ordered]:
            first_wrong = next(
                (
                    later
                    for earlier, later in zip(entries, entries[1:], strict=False)
                    if later.term.lower() < earlier.term.lower()
                ),
                entries[0],
            )
            findings.append(
                _finding(
                    text,
                    located,
                    defect=Defect.unordered_definitions,
                    term=first_wrong.term,
                    start=first_wrong.start,
                    end=first_wrong.end,
                    certainty=Certainty.certain,
                    note=(
                        f"The definitions are not in alphabetical order; "
                        f'"{first_wrong.term}" is the first out of place.'
                    ),
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
