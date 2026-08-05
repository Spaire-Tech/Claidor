"""Juricaf decision-page parser and deterministic URL builder.

Pure parsing (no network): callers fetch, this module extracts. Kept
import-light for the same reason as :mod:`polar.corpus.akn` — every parsing
decision must be testable against acquired files.
"""

from __future__ import annotations

import html as html_lib
import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedDecision:
    number: str | None  # "022/2014"
    decided_on: str | None  # ISO date
    urn_lex: str | None
    title: str | None
    keyword_header: str | None
    full_text: str


def juricaf_ccja_url(number: str, decided_on: str) -> str:
    """``022/2014`` + ``2014-03-11`` → the deterministic Juricaf URL."""
    num, year = number.split("/")
    return (
        "https://juricaf.org/arret/OHADA-COURCOMMUNEDEJUSTICEETDARBITRAGE-"
        f"{decided_on.replace('-', '')}-{num}{year}"
    )


_MONTHS = {
    "janvier": 1,
    "février": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "août": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "décembre": 12,
}


def _clean(text: str) -> str:
    text = unicodedata.normalize("NFC", html_lib.unescape(text))
    return re.sub(r"[ \t\xa0]+", " ", text).strip()


def parse_juricaf_decision_html(page: str) -> ParsedDecision:
    urn = None
    m = re.search(r"urn:lex[^\"'<\s]*", page)
    if m:
        urn = _clean(m.group(0))

    title = None
    m = re.search(r"<title>([^<]*)</title>", page)
    if m:
        title = _clean(m.group(1))

    number = None
    decided_on = None
    if urn:
        # urn:lex;ohada;cour.commune.justice.arbitrage;arret;2014-03-11;022.2014
        m = re.search(r";(\d{4}-\d{2}-\d{2});(\d+)\.(\d{4})$", urn)
        if m:
            decided_on = m.group(1)
            number = f"{m.group(2)}/{m.group(3)}"
        else:
            # Older records omit the year suffix: ...;2010-06-10;038
            m = re.search(r";(\d{4})-(\d{2})-(\d{2});(\d+)$", urn)
            if m:
                decided_on = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
                number = f"{m.group(4)}/{m.group(1)}"
    if (number is None or decided_on is None) and title:
        m = re.search(r"(\d{1,2})\s+(\w+)\s+(\d{4}),\s*([\d]+/[\d]{4})", title)
        if m and m.group(2).lower() in _MONTHS:
            decided_on = (
                f"{m.group(3)}-{_MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
            )
            number = m.group(4)

    # The keyword header, when present, is an uppercase semicolon-separated
    # line naming the act and articles, near the top of the decision body.
    keyword_header = None
    m = re.search(
        r"((?:AUPSRVE|AUSCGIE|AUS|AUDCG|ACTE UNIFORME)[^<\n]{0,40}?;[^<\n]{10,400})",
        page,
    )
    if m:
        candidate = _clean(m.group(1))
        if "ARTICLE" in candidate.upper():
            keyword_header = candidate

    # Full text: strip tags, keep the block between the metadata and footer.
    text = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", page)
    text = re.sub(r"<[^>]+>", "\n", text)
    lines = [_clean(raw_line) for raw_line in text.split("\n")]
    lines = [line for line in lines if line]
    # Heuristic: the decision body starts at the first line mentioning the
    # court or "ARRET"/"Arrêt" and runs to the Juricaf footer.
    start = 0
    for i, line in enumerate(lines):
        if re.search(r"(?i)cour commune de justice|arr[eê]t n", line):
            start = i
            break
    end = len(lines)
    for i, line in enumerate(lines):
        if "juricaf" in line.lower() and i > start + 5:
            end = i
            break
    full_text = "\n".join(lines[start:end]).strip()

    return ParsedDecision(
        number=number,
        decided_on=decided_on,
        urn_lex=urn,
        title=title,
        keyword_header=keyword_header,
        full_text=full_text,
    )
