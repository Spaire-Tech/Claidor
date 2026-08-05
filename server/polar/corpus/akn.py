"""Akoma Ntoso (Laws.Africa HTML rendering) article extractor.

SenLII/Laws.Africa render AKN XML as semantic HTML: every structural node
becomes an element with an ``akn-*`` class and a ``data-eId`` carrying the
hierarchical AKN element id (``chp_2__sec_première__art_157``). This module
walks that structure and yields article-level records.

Deliberately import-light and pure: no database, no network — so extraction
is unit-testable against acquired files, and every parsing decision is
inspectable before anything touches the corpus tables.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from bs4 import BeautifulSoup, Tag

# French ordinal words used in article numbering ("Article premier").
_WORD_NUMBERS = {
    "premier": "1",
    "première": "1",
    "1er": "1",
    "1re": "1",
}


@dataclass(frozen=True)
class ParsedArticle:
    number: str  # normalized, as cited: "1", "157", "157-1"
    number_label: str  # as printed in the source: "Article premier"
    heading: str | None
    akn_eid: str
    text: str  # alinéas joined by newlines
    alineas: list[str] = field(default_factory=list)
    sort_key: int = 0


@dataclass(frozen=True)
class ParsedAct:
    title: str | None
    articles: list[ParsedArticle] = field(default_factory=list)


def normalize_article_number(label: str) -> str:
    """``"Article premier"`` → ``"1"``; ``"Article 157-1"`` → ``"157-1"``.

    Word ordinals are normalized segment by segment so ``premier-1`` becomes
    ``1-1``.
    """
    s = label.strip()
    s = re.sub(r"^article\s+", "", s, flags=re.IGNORECASE)
    s = s.strip().rstrip(".").strip()
    segments = s.split("-")
    normalized = [
        _WORD_NUMBERS.get(seg.strip().lower(), seg.strip()) for seg in segments
    ]
    return "-".join(normalized)


def article_sort_key(number: str) -> int:
    """Order compound numbers correctly: 157 < 157-1 < 157-3 < 158.

    Main number × 1000 plus the sub-number; non-numeric residue sorts at its
    main number.
    """
    m = re.match(r"^(\d+)(?:-(\d+))?", number)
    if m is None:
        return 0
    main = int(m.group(1))
    sub = int(m.group(2)) if m.group(2) else 0
    return main * 1000 + sub


def _element_text(el: Tag) -> str:
    text = el.get_text(" ", strip=True)
    # Collapse whitespace and normalize unicode (source mixes NBSP variants).
    text = unicodedata.normalize("NFC", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_lawsafrica_act_html(html: str) -> ParsedAct:
    """Extract the article list from a Laws.Africa/SenLII AKN HTML page."""
    soup = BeautifulSoup(html, "html.parser")

    title: str | None = None
    h1 = soup.find("h1")
    if h1 is not None:
        title = _element_text(h1) or None

    articles: list[ParsedArticle] = []
    for section in soup.find_all(class_="akn-article"):
        if not isinstance(section, Tag):
            continue
        eid = str(section.get("data-eid") or section.get("data-eId") or "")

        # The article label lives in the first h2 ("Article premier").
        label_el = section.find(["h2", "h3"])
        label = _element_text(label_el) if label_el is not None else ""
        number = normalize_article_number(label) if label else ""
        if not number:
            # Fall back to the eId tail: ...__art_157-1 → 157-1
            m = re.search(r"art_([^_]+)$", eid)
            number = normalize_article_number(m.group(1)) if m else ""
        if not number:
            continue

        # Alinéas: the akn-p spans in document order, excluding the label.
        alineas: list[str] = []
        for p in section.find_all(class_="akn-p"):
            if not isinstance(p, Tag):
                continue
            t = _element_text(p)
            if t:
                alineas.append(t)
        # Some articles carry list items (akn-li) with their own text not
        # wrapped in akn-p; capture any li text not already collected.
        for li in section.find_all(class_="akn-li"):
            if not isinstance(li, Tag):
                continue
            if li.find(class_="akn-p") is not None:
                continue
            t = _element_text(li)
            if t and t not in alineas:
                alineas.append(t)

        text = "\n".join(alineas)
        if not text:
            continue

        articles.append(
            ParsedArticle(
                number=number,
                number_label=label or f"Article {number}",
                heading=None,
                akn_eid=eid,
                text=text,
                alineas=alineas,
                sort_key=article_sort_key(number),
            )
        )

    return ParsedAct(title=title, articles=articles)
