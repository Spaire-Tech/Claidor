"""Reading a source document — the beginning of the chain.

A model's typed input is the edge of everything this product can check.
`Assumptions!B4 = 182.4` is a number somebody entered, and every figure
computed from it inherits whatever it is. Until now the chain stopped
there and said so; a source document is what comes before it.

**The document is ink, not structure.** A workbook has cells and a deck
has shapes; audited accounts have a text layer and page numbers and
nothing else that can be relied on. So this reader is the memo reader's
shape rather than the workbook's: figures found in prose, each named by
the words in front of it, each carrying the page it was printed on.

**The page number is the point.** « Audited accounts FY24 · p.42 » is what
the design draws at the end of a chain, and a source figure that cannot say
which page it came from is worth very little — a banker cannot check it,
which makes it exactly the sort of claim this product is built to distrust.
So pages are read one at a time rather than joined, and `page` is the real
one.

**A scan is refused, in words.** A PDF with no text layer extracts as an
empty string, and an empty extraction that quietly becomes an empty
document is how a set of accounts ends up « containing no figures ». It
says what it is and what to do about it instead.
"""

import io
import re

from .figures import Extraction, Figure
from .memo import is_heading
from .prose import name_figures

#: A calendar year in prose. Accounts say « for the year ended 31 December
#: 2025 »; a model says « FY2025A ». Nothing else in this product needs
#: the translation, because nothing else reads a document written outside
#: the deal team.
CALENDAR_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")

#: Below this, a PDF is a scan of paper rather than a document with text
#: in it. A real page of accounts carries hundreds of characters; a page
#: of pure image extracts as a handful of stray marks, and treating those
#: as the document is how a scan silently becomes « no figures found ».
MIN_CHARACTERS = 200


class NotAPdf(Exception):
    """The bytes are not a PDF this can read, and the message says why."""


def read_source(path: str) -> Extraction:
    """Every figure in a source document, with the page it was printed on."""
    with open(path, "rb") as handle:
        return read_source_bytes(handle.read())


def read_source_bytes(payload: bytes) -> Extraction:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(payload))
    except PdfReadError as problem:
        raise NotAPdf(
            f"this PDF could not be opened ({problem}). If it opens in a "
            "reader, printing it to a new PDF usually fixes it"
        ) from problem

    if reader.is_encrypted:
        # `decrypt("")` succeeds on a PDF locked only against printing,
        # which is common on accounts and perfectly readable.
        try:
            reader.decrypt("")
        except Exception as problem:
            raise NotAPdf(
                "this PDF is password protected — open it once with the "
                "password and save an unprotected copy"
            ) from problem

    pages = [_text_of(page) for page in reader.pages]
    if sum(len(one) for one in pages) < MIN_CHARACTERS:
        raise NotAPdf(
            f"this PDF has no text layer — it is a scan of {len(pages)} "
            f"{'page' if len(pages) == 1 else 'pages'}. Run it through OCR "
            "and upload it again"
        )

    return read_pages(pages)


def _text_of(page: object) -> str:
    try:
        return getattr(page, "extract_text")() or ""
    except Exception:
        # One unreadable page in a hundred is not a reason to refuse the
        # other ninety-nine; a figure this misses is a figure nobody
        # checked, which is the safe direction everywhere in this module.
        return ""


def _sentences(text: str) -> list[str]:
    """A page's lines, with wrapped ones put back together.

    **A line break in a PDF is where the type ran out of room, not where
    the sentence ended.** « Selling, general and administrative expenses
    for the year ended » / « 31 December 2025 were $32.9m » is one claim
    printed on two lines, and read line by line the figure ends up named
    « general and administrative expenses … » — the words that would have
    identified it are on the line above.

    The join is deliberately narrow: the previous line must end without
    terminal punctuation *and* this one must begin in lower case. A
    statement's table rows, its headings and its notes all start with a
    capital or end with a stop, so none of them is swept into its
    neighbour — and a rule that guessed would put two line items' figures
    under one name, which is the false positive this product cannot pay
    for.

    Never across pages. A page break is a hard break here whatever the
    prose does, because the page number is what makes a source figure
    checkable at all.
    """
    joined: list[str] = []
    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if (
            joined
            and not joined[-1].endswith((".", ":", ";", "!", "?"))
            and line[:1].islower()
        ):
            joined[-1] = f"{joined[-1]} {line}"
            continue
        joined.append(line)
    return joined


def as_fiscal_year(label: str) -> str:
    """« year ended 31 December 2025 » → « year ended 31 December FY2025A ».

    **The one translation this reader does, and it is deliberately here
    rather than in the matcher.** The linker recognises `FY2025A` as a
    period and a bare `2025` as nothing at all — digits without a letter
    are not a word — so an accounts note naming its year in the ordinary
    way can match three years' revenue equally well and is refused as
    ambiguous. Which is the correct answer to give and the wrong question
    to have asked.

    Teaching the shared tokeniser about calendar years would change what
    every deck and every memo links to, on an engine whose recall is a
    measured number. The rule is measure before changing a rule; this
    changes nothing outside a source document, where accounts are actuals
    by definition and `A` is not a guess.
    """
    return CALENDAR_YEAR.sub(lambda found: f"FY{found.group(0)}A", label)


def read_pages(pages: list[str]) -> Extraction:
    """The same, from text already extracted, one string per page.

    Split out so a test can put known pages through the real naming rules,
    and so a future OCR path has somewhere to hand its output that is not
    a second implementation of « what does this document say ».
    """
    extraction = Extraction()
    #: A heading holds until the next one, across pages: a set of accounts
    #: puts « NOTES TO THE FINANCIAL STATEMENTS » on one page and the note
    #: it introduces on the next three.
    section = ""
    #: How many times each printed figure has been seen in the whole
    #: document, so that a figure quoted on three pages can be told apart.
    #: The same rule the memo reader uses, and for the same reason.
    seen: dict[str, int] = {}

    for number, text in enumerate(pages, start=1):
        for line in _sentences(text):
            named = name_figures(line)
            if not named:
                if is_heading(line):
                    section = line
                continue

            for item in named:
                found = item.item
                seen[found.printed] = seen.get(found.printed, 0) + 1
                extraction.figures.append(
                    Figure(
                        printed=found.printed,
                        value=found.value,
                        decimals=found.decimals,
                        kind=found.kind,
                        parenthesised=found.parenthesised,
                        #: A real page, and the reason this reader exists.
                        slide=number,
                        label=as_fiscal_year(item.label),
                        location=f"page {number}",
                        context=line,
                        section=as_fiscal_year(section),
                        range_endpoint=item.range_endpoint,
                        anchor={
                            "kind": "page",
                            "page": number,
                            "start": found.start,
                            "end": found.end,
                            # What a reader searches for once the page is
                            # open. A PDF has no shape to select, so the
                            # printed figure and which occurrence it is are
                            # the whole of the coordinate.
                            "text": found.printed,
                            "occurrence": seen[found.printed],
                        },
                    )
                )

    return extraction


__all__ = [
    "MIN_CHARACTERS",
    "NotAPdf",
    "as_fiscal_year",
    "read_pages",
    "read_source",
]
