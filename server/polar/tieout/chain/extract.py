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
from pathlib import Path
from typing import IO, Any

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

#: Below this many text characters a page has no usable text layer.
_SCANT_TEXT = 20

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
    no scale.
    """

    page: int  # 1-based
    text: str
    value: float
    box: Box


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


def extract_pdf(source: str | Path | IO[bytes]) -> Extraction:
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
            for word in words:
                value = parse_number(word["text"])
                if value is None:
                    continue
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
                    )
                )

    return Extraction(tuple(numbers), tuple(refusals), tuple(sizes))


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
