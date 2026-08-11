"""Reading an email for the figures it quotes.

A draft to a buyer is a deliverable. « FY24 Adjusted EBITDA is $42.6m »
sent on Wednesday morning is the same claim slide 14 makes, against the
same cell, and it goes stale the same way — except that a deck can be
recalled from a data room and a message cannot be recalled at all. That
asymmetry is the whole argument for reading mail: of everything this
product checks, an email is the one where being late is final.

**It is the memo reader, not a new one.** An email body is prose with
figures in it, which is exactly what a memo is, so the text goes through
:func:`polar.tieout.memo.read_memo_text` and every figure is named by
:mod:`polar.tieout.prose` under the same rule as a slide's body text.
What is here is only the part that is genuinely different: turning
Outlook's HTML into paragraphs, and knowing which parts of a message are
not the message.

**The quoted thread is not this message.** A reply carries the whole
conversation under it, and the figures in there were written by somebody
else, possibly weeks ago, possibly already corrected. Checking them would
report a drift against a sentence the writer did not write and cannot
edit — a false positive with no available fix, which is the worst kind.
So the quote is cut, and everything below it is not read.

**The signature is not the message either.** A block ending in a phone
number and an office address contributes numbers that are not figures,
and « 20 Finsbury Circus » is a plausible-looking « 20 » to anything
reading digits. It is cut on the same rule mail clients have used for
thirty years.
"""

import re

from polar.redline.ooxml import PARAGRAPH_BREAK

from .figures import Extraction
from .memo import read_memo_text

#: Where the quoted thread starts. Outlook's own separator first — it
#: writes a horizontal rule and a `From:` block — then the conventions
#: everything else uses. Matched at the start of a line only: « From: »
#: inside a sentence is a preposition.
QUOTE = re.compile(
    r"^(?:"
    r"From:\s|"
    r"On .{0,120}\bwrote:|"
    r"-{2,}\s*Original Message\s*-{2,}|"
    r"_{5,}|"
    r"Sent from my \w+"
    r")",
    re.IGNORECASE,
)

#: Where a signature starts. Only the standard delimiter and the two
#: sign-offs that reliably end a message; anything cleverer starts cutting
#: real sentences, and a figure lost to an over-eager rule is a figure
#: nobody checked.
SIGNATURE = re.compile(
    r"^(?:--\s*$|Kind regards[,.]?\s*$|Best regards[,.]?\s*$|Regards[,.]?\s*$)",
    re.IGNORECASE,
)


def read_message(subject: str, body: str, *, html: bool = True) -> Extraction:
    """Every figure a message asserts, with the words that name it.

    The subject is read as the first paragraph. « Northgate — FY24 EBITDA
    of $41.9m » is a claim, it is the one people read without opening
    anything, and a reader that skipped it would miss the figure most
    likely to be quoted back.
    """
    text = paragraphs_of(body, html=html)
    if subject.strip():
        text = subject.strip() + PARAGRAPH_BREAK + text
    return read_memo_text(text)


def paragraphs_of(body: str, *, html: bool = True) -> str:
    """The message's own words, as paragraphs the memo reader can read."""
    lines = _lines(body) if html else body.splitlines()
    return PARAGRAPH_BREAK.join(_own_words(lines))


def _own_words(lines: list[str]) -> list[str]:
    kept: list[str] = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if QUOTE.match(line) or SIGNATURE.match(line):
            break
        # A client that quotes with « > » rather than a header. Same
        # sentence, same reason not to read it.
        if line.startswith(">"):
            continue
        kept.append(line)
    return kept


#: Elements whose text is not prose the writer typed. `style` and `script`
#: are the dangerous ones — Outlook inlines a stylesheet in the body, and
#: CSS is full of numbers.
SILENT = {"style", "script", "head", "title", "meta"}

#: Elements that end a paragraph. A `<br>` inside a sentence is a wrap;
#: two of them are a break — but treating every one as a break is right
#: here, because a message wrapped mid-sentence is rare and a paragraph
#: swallowing the next one costs a figure its name.
BREAKS = {
    "p",
    "div",
    "br",
    "li",
    "tr",
    "td",
    "th",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
}


def _lines(body: str) -> list[str]:
    """Outlook's HTML, as lines.

    Written against `bs4`, which is already a dependency, rather than a
    regular expression: mail HTML is Word's HTML, and it is not the sort
    of markup a pattern survives contact with.
    """
    from bs4 import BeautifulSoup, Tag
    from bs4.element import NavigableString

    soup = BeautifulSoup(body, "html.parser")
    for element in soup.find_all(list(SILENT)):
        element.decompose()

    lines: list[str] = []
    current: list[str] = []

    def flush() -> None:
        joined = " ".join(current).strip()
        current.clear()
        if joined:
            lines.append(re.sub(r"\s+", " ", joined))

    def walk(node: Tag) -> None:
        for child in node.children:
            if isinstance(child, NavigableString):
                text = str(child)
                if text.strip():
                    current.append(text)
            elif isinstance(child, Tag):
                if child.name in BREAKS:
                    flush()
                    walk(child)
                    flush()
                else:
                    walk(child)

    walk(soup)
    flush()
    return lines


__all__ = ["paragraphs_of", "read_message"]
