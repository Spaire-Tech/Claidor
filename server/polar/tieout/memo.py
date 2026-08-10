"""Reading a `.docx` for the figures it quotes.

A memo is where a deck's numbers go to be repeated in sentences, and it is
the document most likely to have been written first and updated last. « The
business generated $228.9mm of revenue in FY2025A » is the same claim the
deck's metric tile makes, against the same cell, and it goes stale the same
way — except that nobody re-reads a memo when the model moves.

The reading itself is borrowed rather than built. :mod:`polar.redline.ooxml`
already opens a `.docx` and produces its text with a map back into the runs
that made it, because the redline engine needs to *edit* those runs. Here
only the text is wanted, and reusing that reader means one implementation
of « what does this document say » rather than two that disagree by a
character and put every finding one word out.

**Naming works exactly as it does in a slide's body text.** Same module,
:mod:`polar.tieout.prose`, same rule: a line is cut at its figures and each
is named by the clause before it. A memo sentence and a slide sentence pose
the identical problem.

Three things a memo does not have, said plainly because each one costs
something:

*No page numbers.* Pagination is a rendering decision Word makes at print
time; the file does not carry it. So a memo figure is located by its
paragraph, and `page` stays zero rather than being invented.

*No table structure, yet.* The reader flattens a table's cells into
paragraphs, so a figure in a memo table gets a prose label instead of a row
and a column. Those mostly go unlinked, which is the safe direction and a
real gap.

*No reliable headings.* What is used instead is a conservative rule (see
:func:`_is_heading`), and being wrong about it is cheap: a section only
ever *supports* a link in the scorer and can never carry one on its own.
"""

from pathlib import Path

from polar.redline.ooxml import PARAGRAPH_BREAK, NotADocx, Package

from .figures import Extraction, Figure
from .prose import name_figures

#: A heading is short. Anything longer is a sentence that happens to lack
#: a full stop, and treating it as a heading would put a paragraph of prose
#: into the context of every figure below it.
HEADING_LENGTH = 60


def read_memo(path: str) -> Extraction:
    """Every figure in a memo, with the words that name it."""
    package = Package.open(Path(path).read_bytes())
    return read_memo_text(package.read().text)


def read_memo_text(text: str) -> Extraction:
    """The same, from text already extracted.

    Split out so the panel can check the memo *open in Word* — where the
    text comes from `body.paragraphs` over Office.js and there is no file
    to open — against the same reader the upload used. Two extractions
    that differ by one character put every finding in the wrong place.
    """
    extraction = Extraction()
    section = ""
    #: How many times each printed figure has been seen. A memo quoting
    #: « $48.9mm » three times needs the panel to select the right one,
    #: and « the second occurrence » is the only durable way to say which
    #: in a document somebody is editing.
    seen: dict[str, int] = {}

    for index, raw in enumerate(text.split(PARAGRAPH_BREAK)):
        line = raw.strip()
        if not line:
            continue

        named = name_figures(line)
        if not named:
            if _is_heading(line):
                section = line
            continue

        for item in named:
            found = item.item
            printed = found.printed
            seen[printed] = seen.get(printed, 0) + 1
            extraction.figures.append(
                Figure(
                    printed=printed,
                    value=found.value,
                    decimals=found.decimals,
                    kind=found.kind,
                    parenthesised=found.parenthesised,
                    # A memo has no pages. Zero says so; a made-up number
                    # would send the panel to a slide that does not exist.
                    slide=0,
                    label=item.label,
                    location=f"paragraph {index + 1}",
                    context=line,
                    section=section,
                    range_endpoint=item.range_endpoint,
                    anchor={
                        "kind": "paragraph",
                        "paragraph": index,
                        "start": found.start,
                        "end": found.end,
                        # What the Word host searches for, and which hit
                        # to take. Offsets into a document being edited go
                        # stale; the printed figure does not.
                        "text": printed,
                        "occurrence": seen[printed],
                    },
                )
            )

    return extraction


def _is_heading(line: str) -> bool:
    """A conservative guess at « this names the section below it ».

    Short, no terminal punctuation, and either in capitals or numbered —
    « SECURITY MEASURES », « 2 Basis of preparation ». A memo written in
    any other style simply has no sections, which costs a little context
    on the scorer and nothing else.

    Being wrong here is deliberately cheap. A section is weighted below a
    label and can support a link without ever carrying one, so a sentence
    misread as a heading cannot on its own reconcile anything.
    """
    if len(line) > HEADING_LENGTH or line.endswith((".", ";", ",", ":")):
        return False
    letters = [character for character in line if character.isalpha()]
    if not letters:
        return False
    if all(character.isupper() for character in letters):
        return True
    return bool(line[0].isdigit() and line[1:2] in {" ", ".", ")"})


__all__ = ["HEADING_LENGTH", "NotADocx", "read_memo", "read_memo_text"]
