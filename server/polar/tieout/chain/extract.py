"""Citation-grade extraction: every number with a page and a box.

The Chain's first link (Track D1). A source document enters the product
here, and the contract is deliberately narrow: for a PDF that carries a
real text layer, every numeric token comes out with the page it sits on
and a bounding box tight enough that highlighting the box highlights the
figure. Nothing else is inferred — not units, not meaning, not which
model cell the number belongs to. Those are later links (Track E owns
units, D3 owns linking), and each one stands on this file being boring
and right.

Coordinates are PDF points with a **top-left origin** — pdfplumber's
convention, and the natural one for a viewer drawing highlights over a
rendered page. Every page's size ships with the extraction so a viewer
can scale boxes to pixels.

A page with no usable text layer is **refused in words**, never silently
skipped and never OCR'd: OCR output cannot carry a citation-grade
guarantee, and a wrong number with a confident box is worse than a
refusal. The plan routes scans to a paid fallback or a refusal; until
such a fallback exists, this is the refusal.

Known, accepted limits (each visible in the token pattern, not hidden):

- Numbers split across whitespace (``1 234 567``) are not reassembled.
- An accounting negative only carries its sign when the parentheses
  touch the digits (``(2,340)``); ``( 2,340 )`` loses the sign.
- Scale suffixes (``3.4m``, ``2bn``) stay in the raw text; the parsed
  value is the printed magnitude, unscaled — scale is a unit question.

pdfplumber is imported inside functions: the library is proposed to the
lead but not yet in the server environment, and importing this module
must stay free so the parsing helpers remain testable everywhere.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

#: A token qualifies as a number when, after shedding an optional
#: currency symbol, sign or accounting parentheses, and an optional
#: trailing percent or scale suffix, what remains is digits with
#: conventional thousands commas and at most one decimal point.
_NUMBER = re.compile(
    r"""^
    (?P<open>\()?                       # accounting negative, opening
    (?P<sign>[-–−])?                    # minus (ascii, en dash, unicode)
    (?P<currency>[£$€])?
    (?P<digits>\d{1,3}(?:,\d{3})+(?:\.\d+)?   # 1,234 / 12,345.67
       |\d+(?:\.\d+)?                          # 1234 / 3.4 / 0.75
    )
    (?P<suffix>%|bn|m|k)?               # kept in text, never applied
    (?P<close>\))?                      # accounting negative, closing
    [.,;:]?                             # trailing sentence punctuation
    $""",
    re.VERBOSE | re.IGNORECASE,
)

#: The extraction code's own version, carried on every persisted fact so
#: a fidelity question is answerable years later. Bumped whenever the
#: token pattern, the line grouping, or the refusal rule changes.
EXTRACTOR_NAME = "polar.tieout.chain.extract"
EXTRACTOR_VERSION = "4"

#: Round 6's frozen column anchor (registered in the Scribe log before
#: this code existed). Round 5 measured what a line-only anchor costs:
#: in a table a printed line is a *row*, so every number in it shares
#: the same labels, the matcher's tie rule fires, and a perfect label
#: match becomes silence — 12 of 17 misses, recall 0 of 18. The column
#: header above a figure is the missing half, and D1 can see it because
#: it already records every number's box.
_ANCHOR_LINES_UP = 12
_ANCHOR_OVERLAP = 1.0

#: The dash round's frozen rule (registered in the Scribe log before
#: this code existed). A financial table says nil with a dash far more
#: often than with a `0`, and a document that states a quantity should
#: produce a fact — round 5 found four drawn cells whose zeros the
#: documents state exactly this way, leaving the matcher silent for
#: the wrong reason. A lone dash becomes a zero when its line carries
#: a number and numbers stand at its x elsewhere on the page: the
#: first says « this is a data row, not prose », the second says
#: « this is a column ». The dashes inside a row's own name — « Demand
#: - FTS - 1 » — sit where no numbers stand, and that is what parts
#: them from the nils beside them.
_DASHES = frozenset("-–—")
_NIL_COLUMN_NUMBERS = 3

#: Below this many text characters a page has no usable text layer.
_SCANT_TEXT = 20

#: Words whose tops are within this many points sit on one printed line.
_LINE_TOLERANCE = 3.0

#: Images covering more than this share of the page mark it as a scan.
_IMAGE_SHARE = 0.5


@dataclass(frozen=True)
class Box:
    """A rectangle in PDF points, top-left origin, on one page."""

    x0: float
    top: float
    x1: float
    bottom: float


@dataclass(frozen=True)
class ExtractedNumber:
    """One printed number: where it is, what it says, what it parses to.

    ``text`` is the token exactly as printed — currency symbol, commas,
    percent and all — and is the authoritative record. ``value`` is the
    parsed magnitude with its sign, for matching; it carries no unit and
    no scale. ``line`` is the whole printed line the token sits in — the
    label neighborhood the fact store keeps for anchoring, with no
    opinion about which of its words are the label.
    """

    page: int  # 1-based
    text: str
    value: float
    box: Box
    line: str
    #: The column header standing above this figure — « FY2025A », « $ »,
    #: « HC ». Empty when the page offers none. The other half of a
    #: table cell's identity: the line names its row, this names its
    #: column, and without it every figure in a row looks alike.
    column: str = ""


@dataclass(frozen=True)
class RefusedPage:
    """A page the extractor will not pretend to read, and why, in words."""

    page: int
    reason: str


@dataclass(frozen=True)
class PageSize:
    page: int
    width: float
    height: float


@dataclass(frozen=True)
class Extraction:
    """Everything D1 promises for one document."""

    numbers: tuple[ExtractedNumber, ...]
    refusals: tuple[RefusedPage, ...]
    pages: tuple[PageSize, ...]


def parse_number(token: str) -> float | None:
    """The parsed value of one printed token, or None when it isn't one.

    A number in accounting parentheses or with a leading minus parses
    negative. Mixed alphanumerics (``COVID-19``), ranges (``2022/23``)
    and anything else that is not one conventional number are refused
    with None — extraction never guesses.
    """
    match = _NUMBER.match(token.strip())
    if match is None:
        return None
    # An unbalanced parenthesis is sentence punctuation, not a sign.
    if bool(match.group("open")) != bool(match.group("close")):
        return None
    value = float(match.group("digits").replace(",", ""))
    if match.group("open") or match.group("sign"):
        value = -value
    return value


def extract_pdf(source: str | Path | BytesIO) -> Extraction:
    """Every number in a PDF, each with its page and highlight box.

    Raises whatever pdfplumber raises on a file that is not a PDF; a
    readable PDF never raises — pages the extractor cannot honestly read
    come back as refusals in words.
    """
    import pdfplumber

    numbers: list[ExtractedNumber] = []
    refusals: list[RefusedPage] = []
    sizes: list[PageSize] = []

    with pdfplumber.open(source) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            sizes.append(PageSize(index, float(page.width), float(page.height)))
            words = page.extract_words()
            refusal = _scan_refusal(index, page, words)
            if refusal is not None:
                refusals.append(refusal)
                continue
            lines = _lines(words)
            columns = _columns(words, lines)
            nil = _nil_positions(words, lines)
            for position, word in enumerate(words):
                value = parse_number(word["text"])
                if value is None:
                    if position not in nil:
                        continue
                    value = 0.0
                numbers.append(
                    ExtractedNumber(
                        page=index,
                        text=word["text"],
                        value=value,
                        box=Box(
                            x0=float(word["x0"]),
                            top=float(word["top"]),
                            x1=float(word["x1"]),
                            bottom=float(word["bottom"]),
                        ),
                        line=lines[position],
                        column=columns[position],
                    )
                )

    return Extraction(tuple(numbers), tuple(refusals), tuple(sizes))


def _lines(words: list[dict[str, Any]]) -> list[str]:
    """For each word, the text of the printed line it sits on.

    Words whose tops are within :data:`_LINE_TOLERANCE` points of the
    line's first word share a line; each line reads left to right. This
    is layout, not meaning — a table row is one « line » here, and that
    is deliberate: the row's label is in it.
    """
    order = sorted(range(len(words)), key=lambda i: float(words[i]["top"]))
    line_of = [0] * len(words)
    groups: list[list[int]] = []
    for position in order:
        top = float(words[position]["top"])
        if groups and top - float(words[groups[-1][0]]["top"]) <= _LINE_TOLERANCE:
            groups[-1].append(position)
        else:
            groups.append([position])
    texts: list[str] = []
    for group in groups:
        group.sort(key=lambda i: float(words[i]["x0"]))
        text = " ".join(words[i]["text"] for i in group)
        for position in group:
            line_of[position] = len(texts)
        texts.append(text)
    return [texts[line_of[position]] for position in range(len(words))]


def _nil_positions(words: list[dict[str, Any]], lines: list[str]) -> set[int]:
    """Which lone dashes stand in a numeric column, and so mean zero.

    The three frozen conditions, in order of cheapness: the token is
    one dash character; its line carries at least one number; and at
    least :data:`_NIL_COLUMN_NUMBERS` numbers on the page stand at its
    x-position. Nothing here reads meaning — it reads alignment, which
    is the one thing page geometry says reliably.
    """
    dashes = [
        position
        for position, word in enumerate(words)
        if word["text"] in _DASHES or set(word["text"]) <= _DASHES and word["text"]
    ]
    if not dashes:
        return set()
    numeric = [word for word in words if parse_number(word["text"]) is not None]
    if not numeric:
        return set()
    numeric_lines = {
        line
        for line, word in zip(lines, words)
        if parse_number(word["text"]) is not None
    }
    found = set()
    for position in dashes:
        if len(words[position]["text"]) != 1:
            continue
        if lines[position] not in numeric_lines:
            continue
        left, right = float(words[position]["x0"]), float(words[position]["x1"])
        stacked = sum(
            1
            for word in numeric
            if min(right, float(word["x1"])) - max(left, float(word["x0"]))
            >= _ANCHOR_OVERLAP
        )
        if stacked >= _NIL_COLUMN_NUMBERS:
            found.add(position)
    return found


def _columns(words: list[dict[str, Any]], lines: list[str]) -> list[str]:
    """For each word, the column header standing above it.

    The rule frozen in the Scribe log for round 6: walk the lines above
    a word on its own page, nearest first, at most
    :data:`_ANCHOR_LINES_UP`; in each, keep the tokens whose x-range
    overlaps the word's by at least :data:`_ANCHOR_OVERLAP` points; the
    first line up that yields a **non-numeric** token supplies the
    anchor. A numeric line above is another data row, not a header, and
    is stepped over.

    This is geometry, not inference: the header is printed there, and
    the only judgement is « which words sit above this one ».
    """
    order = sorted(range(len(words)), key=lambda i: float(words[i]["top"]))
    rows: list[list[int]] = []
    for position in order:
        top = float(words[position]["top"])
        if rows and top - float(words[rows[-1][0]]["top"]) <= _LINE_TOLERANCE:
            rows[-1].append(position)
        else:
            rows.append([position])
    row_of = {}
    for index, row in enumerate(rows):
        for position in row:
            row_of[position] = index

    out = [""] * len(words)
    for position in range(len(words)):
        here = row_of[position]
        left, right = float(words[position]["x0"]), float(words[position]["x1"])
        for step in range(1, _ANCHOR_LINES_UP + 1):
            above = here - step
            if above < 0:
                break
            over = [
                words[i]
                for i in rows[above]
                if min(right, float(words[i]["x1"])) - max(left, float(words[i]["x0"]))
                >= _ANCHOR_OVERLAP
            ]
            named = [w for w in over if parse_number(w["text"]) is None]
            if named:
                named.sort(key=lambda w: float(w["x0"]))
                out[position] = " ".join(w["text"] for w in named)
                break
    return out


def _scan_refusal(
    index: int, page: Any, words: list[dict[str, Any]]
) -> RefusedPage | None:
    """The refusal for a page that is a picture, or None for a real one.

    A blank page is not a scan — no text and no images is simply an
    empty page, and yields nothing rather than a refusal.
    """
    characters = sum(len(word["text"]) for word in words)
    if characters >= _SCANT_TEXT:
        return None
    page_area = float(page.width) * float(page.height)
    image_area = sum(
        max(0.0, float(image["x1"]) - float(image["x0"]))
        * max(0.0, float(image["bottom"]) - float(image["top"]))
        for image in page.images
    )
    if page_area <= 0 or image_area <= _IMAGE_SHARE * page_area:
        return None
    return RefusedPage(
        page=index,
        reason=(
            f"Page {index} carries {characters} characters of text while "
            f"images cover {image_area / page_area:.0%} of it. That is a "
            "scan, and reading a scan means OCR — which cannot carry a "
            "citation-grade box, so this page is refused rather than "
            "guessed at."
        ),
    )
