"""Cross-references and numbering.

The second family of mechanical defects, and the more decidable of the
two. « Clause 7.3 » either exists in this document or it does not. A
numbering sequence either skips a number or it does not. There is no
judgement anywhere in here and so, unlike an undefined term, every finding
should be *certain*.

That is only true if the reading of the document's own structure is right,
which is where the difficulty actually lives:

- **A reference can point somewhere else.** « Section 1.1 of the Credit
  Agreement » is a reference to another instrument, and this document
  cannot say whether it exists. Those are skipped, and getting that wrong
  would put a critical finding on every well-drafted contract that cites
  anything.
- **Text extracted from a filing is full of debris.** Page numbers, table
  of contents entries, and stray digits from tables all look like clause
  numbers. A number is only structure when it opens a line and is followed
  by real words.
- **A table of contents lists every clause before the document does.**
  Counting it doubles every number and invents duplicates.
"""

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .terms import Finding

#: A clause number opening a line: « 4 », « 4.1 », « 4.1.2 », optionally
#: with a trailing full stop, and followed by real text rather than more
#: digits. Requiring the text is what keeps page numbers and table cells
#: out of the document's structure.
_CLAUSE = re.compile(
    r"^[ \t]*(\d{1,2}(?:\.\d{1,3}){0,3})\.?[ \t]+(?=[A-Za-z(\"“])", re.MULTILINE
)

#: « Schedule 1 », « Exhibit A », « Annex B-2 ». Attachments are numbered
#: separately from clauses and referenced the same way.
_ATTACHMENT = re.compile(
    r"^[ \t]*(SCHEDULE|EXHIBIT|ANNEX|APPENDIX)\s+([A-Z0-9][-A-Z0-9.]{0,6})\b",
    re.MULTILINE | re.IGNORECASE,
)

#: A reference in the body: « clause 4.2 », « Section 7.3(a) »,
#: « Schedule 1 ».
_REFERENCE = re.compile(
    r"\b(clause|section|article|paragraph|schedule|exhibit|annex|appendix)s?\s+"
    r"(\d{1,2}(?:\.\d{1,3}){0,3}|[A-Z](?:-\d{1,2})?)\b",
    re.IGNORECASE,
)

#: What tells you a reference points at a *different* instrument. « of the
#: Credit Agreement », « thereof », « of the Indenture ». Without this every
#: contract that cites another one collects critical findings.
_ELSEWHERE = re.compile(
    r"\A\s*(?:\([^)]{0,30}\)\s*)?(?:thereof|therein|thereto|of\s+(?:the|that|"
    r"such|any|each)\s+(?!Agreement\b|this\b)[A-Z])",
    re.IGNORECASE,
)

#: How far past a reference to look for that signal.
_REACH = 44

#: Table-of-contents lines end in a page number, often after dot leaders.
_TOC_LINE = re.compile(r"\.{3,}\s*\d{1,4}\s*$|\t+\d{1,4}\s*$")

#: A heading written with its own word: « Section 1.01 Termination »,
#: « Article I. Definitions », « Clause 4.2 No Leakage ». Most real
#: agreements number this way, and text extracted from a filing rarely
#: keeps the line breaks that would otherwise mark a heading.
_NAMED_HEADING = re.compile(
    r"\b(?:Section|Article|Clause|Paragraph)\s+"
    r"(\d{1,2}(?:\.\d{1,3}){0,3}|[IVXL]{1,6})\.?\s+"
    r"(?=[A-Z][a-z]|[A-Z]{2,})"
)

#: What turns the same words into a *reference* rather than a heading.
#: « as set out in Section 5.01 » points at a heading; « Section 5.01
#: Termination » is one.
_POINTS_AT = re.compile(
    r"(?:\b(?:in|of|under|to|see|by|per|with|pursuant\s+to|accordance\s+with|"
    r"described\s+in|set\s+(?:out|forth)\s+in|referred\s+to\s+in|"
    r"subject\s+to|and|or|through|,)\s*)$",
    re.IGNORECASE,
)

#: Roman numerals to arabic, so « Article IV » and « Article 4 » are the
#: same clause.
_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50}


def _arabic(number: str) -> str:
    """« IV » becomes « 4 »; anything already arabic is returned as is."""
    if not number or not set(number) <= set(_ROMAN):
        return number
    total = 0
    previous = 0
    for glyph in reversed(number):
        value = _ROMAN[glyph]
        total += -value if value < previous else value
        previous = max(previous, value)
    return str(total)


#: A document whose readable structure is this much smaller than the
#: number of references into it has not been read correctly — its
#: numbering did not survive extraction, or the text is an extract.
#: Judging references against a structure we cannot see would report
#: nearly all of them.
UNREADABLE_RATIO = 3


@dataclass(frozen=True)
class Reference:
    kind: str
    number: str
    start: int
    end: int


@dataclass(frozen=True)
class Structure:
    """What the document actually contains, by number."""

    clauses: dict[str, list[int]]
    attachments: dict[str, list[int]]

    def has_clause(self, number: str) -> bool:
        if number in self.clauses:
            return True
        # A reference to « clause 4 » is satisfied by « 4.1 » existing:
        # some drafters number only the sub-clauses.
        prefix = number + "."
        return any(known.startswith(prefix) for known in self.clauses)

    def has_attachment(self, number: str) -> bool:
        return number.upper() in self.attachments


def _without_contents(text: str) -> str:
    """The document with table-of-contents lines blanked out.

    They are removed rather than dropped so every offset in the original
    text stays valid — a finding's span has to index the string the caller
    submitted.
    """
    lines = text.split("\n")
    kept = [" " * len(line) if _TOC_LINE.search(line) else line for line in lines]
    return "\n".join(kept)


def read_structure(text: str) -> Structure:
    """Every clause and attachment number the document defines."""
    body = _without_contents(text)

    clauses: dict[str, list[int]] = {}
    for match in _CLAUSE.finditer(body):
        clauses.setdefault(match.group(1), []).append(match.start(1))

    # Headings that carry their own word. Distinguished from references by
    # what comes before them: « in Section 5.01 » points at one, « Section
    # 5.01 Termination » is one.
    for match in _NAMED_HEADING.finditer(body):
        before = body[max(0, match.start() - 30) : match.start()]
        if _POINTS_AT.search(before):
            continue
        clauses.setdefault(_arabic(match.group(1)), []).append(match.start(1))

    attachments: dict[str, list[int]] = {}
    for match in _ATTACHMENT.finditer(body):
        attachments.setdefault(match.group(2).upper(), []).append(match.start(2))

    # « 0 » is never a clause number; it is a page marker or a stray digit
    # from a table.
    clauses = {n: o for n, o in clauses.items() if not n.startswith("0")}
    return Structure(clauses=clauses, attachments=attachments)


def find_references(text: str) -> list[Reference]:
    """References that point *into this document*.

    A reference followed by « of the Credit Agreement » or « thereof » is
    about another instrument and is left alone: nothing in this text can
    say whether it resolves.
    """
    body = _without_contents(text)
    found: list[Reference] = []
    for match in _REFERENCE.finditer(body):
        after = body[match.end() : match.end() + _REACH]
        if _ELSEWHERE.match(after):
            continue
        found.append(
            Reference(
                kind=match.group(1).lower(),
                number=match.group(2),
                start=match.start(),
                end=match.end(),
            )
        )
    return found


ATTACHMENT_KINDS = frozenset({"schedule", "exhibit", "annex", "appendix"})


def broken_references(text: str) -> list[Reference]:
    """References to something this document does not contain.

    Nothing is reported for a document that borrows from another
    instrument. An amendment says « Section 5.01 is amended » about the
    parent agreement's clause 5.01, which is not here — the same blind
    spot that made undefined terms unusable, in a different guise.
    """
    from .terms import defers_definitions

    if defers_definitions(text):
        return []

    structure = read_structure(text)
    if not structure.clauses and not structure.attachments:
        # No readable structure at all — an extract, or a document whose
        # numbering did not survive conversion. Judging references against
        # nothing would report every one of them.
        return []

    references = find_references(text)
    # See UNREADABLE_RATIO. A document with three readable clauses and
    # ninety references into itself has not been read, and every finding
    # would be an artefact of that.
    if len(references) > UNREADABLE_RATIO * max(
        1, len(structure.clauses) + len(structure.attachments)
    ):
        return []

    broken: list[Reference] = []
    for reference in references:
        if reference.kind in ATTACHMENT_KINDS:
            if structure.attachments and not structure.has_attachment(reference.number):
                broken.append(reference)
        elif structure.clauses and not structure.has_clause(_arabic(reference.number)):
            broken.append(reference)
    return broken


def _siblings(clauses: dict[str, list[int]]) -> dict[str, list[str]]:
    """Clause numbers grouped by their parent, each group sorted."""
    groups: dict[str, list[str]] = {}
    for number in clauses:
        parent, _, _ = number.rpartition(".")
        groups.setdefault(parent, []).append(number)
    for group in groups.values():
        group.sort(key=lambda n: [int(part) for part in n.split(".")])
    return groups


def numbering_gaps(text: str) -> list[tuple[str, str, int]]:
    """Missing numbers in a sequence, as ``(missing, after, offset)``.

    Only reported inside a run that is otherwise consecutive. A document
    numbered 2, 5, 9 is not a sequence with gaps — it is a document whose
    numbering did not survive extraction, and reporting six missing
    clauses would be noise.
    """
    structure = read_structure(text)
    gaps: list[tuple[str, str, int]] = []

    for group in _siblings(structure.clauses).values():
        if len(group) < 3:
            continue
        parts = [[int(p) for p in number.split(".")] for number in group]
        tails = [part[-1] for part in parts]
        # A run that skips more than one number at a time is not a
        # sequence we can read.
        if max(tails) - min(tails) > len(tails) + 2:
            continue
        for index in range(1, len(tails)):
            for missing in range(tails[index - 1] + 1, tails[index]):
                number = ".".join(str(p) for p in parts[index][:-1] + [missing])
                gaps.append(
                    (number, group[index - 1], structure.clauses[group[index]][0])
                )
    return gaps


#: A heading that starts a new numbering scope. A schedule, an annex or an
#: exhibit numbers its own clauses from 1, and so does a second instrument
#: bound into the same file — an exhibit to a filing routinely contains an
#: agreement and then a separate charter. Numbering that restarts after one
#: of these is correct drafting, not a duplicate.
_NEW_SCOPE = re.compile(
    r"^[ \t]*(?:SCHEDULE|EXHIBIT|ANNEX|APPENDIX|ATTACHMENT|PART)\b"
    r"|^[ \t]*[A-Z][A-Z ,'&-]{12,}$",
    re.MULTILINE,
)


def duplicate_numbers(text: str) -> list[tuple[str, int]]:
    """Numbers used more than once *within one numbering scope*.

    ``(number, offset of the repeat)``. A repeat with a schedule heading or
    a new instrument title between the two occurrences is a fresh scope
    rather than a defect — on real filings that accounted for every
    duplicate found, because an exhibit often binds two agreements into one
    file and each starts at clause 1.
    """
    structure = read_structure(text)
    found: list[tuple[str, int]] = []
    for number, offsets in sorted(structure.clauses.items()):
        for earlier, later in zip(offsets, offsets[1:], strict=False):
            if _NEW_SCOPE.search(text, earlier, later):
                continue
            found.append((number, later))
    return found


def review_structure(text: str) -> list["Finding"]:
    """Cross-reference and numbering defects, as findings.

    Imported lazily from :mod:`polar.redline.terms` to keep that module's
    vocabulary — severity, certainty, spans, occurrence index — in one
    place rather than duplicated here.
    """
    from .terms import Certainty, Defect, _finding, _Occurrences

    located = _Occurrences(text)
    findings: list[Finding] = []

    for reference in broken_references(text):
        findings.append(
            _finding(
                text,
                located,
                defect=Defect.broken_reference,
                term=f"{reference.kind} {reference.number}",
                start=reference.start,
                end=reference.end,
                certainty=Certainty.certain,
                note=(
                    f"This points at {reference.kind} {reference.number}, "
                    f"which does not appear in the document."
                ),
            )
        )

    for missing, after, offset in numbering_gaps(text):
        findings.append(
            _finding(
                text,
                located,
                defect=Defect.numbering_gap,
                term=missing,
                start=offset,
                end=offset + len(missing),
                certainty=Certainty.certain,
                note=(
                    f"Numbering goes from {after} to the number here; "
                    f"{missing} is missing."
                ),
            )
        )

    for number, offset in duplicate_numbers(text):
        findings.append(
            _finding(
                text,
                located,
                defect=Defect.duplicate_number,
                term=number,
                start=offset,
                end=offset + len(number),
                certainty=Certainty.certain,
                note=f"{number} is used twice in the same numbering sequence.",
            )
        )

    findings.sort(key=lambda finding: (finding.start, finding.defect))
    return findings
