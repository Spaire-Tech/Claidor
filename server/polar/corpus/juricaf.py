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
    number: str | None  # "022/2014", or "Avis 001/1999"
    decided_on: str | None  # ISO date
    urn_lex: str | None
    title: str | None
    keyword_header: str | None
    full_text: str
    #: "arret" or "avis" — Juricaf files them together under /arret/, but
    #: an advisory opinion decided no case and must not be counted as a
    #: judgment in an authority line.
    kind: str = "arret"


#: Scanned avis headings sometimes carry letter O where a zero belongs.
_OCR_ZEROS = str.maketrans({"O": "0", "o": "0", "Q": "0"})

#: "AVIS N° 01/2006/JN", "Avis N° 01/2009/EP", "AVIS N° 03/2015".
_AVIS_HEADING = re.compile(
    r"\bavis\s+n[°ºo0]?\s*([0-9OoQ]{1,4})\s*/\s*(\d{2,4})", re.IGNORECASE
)
#: "Avis n° 001 du 17 juin 2015" — numbered without a year.
_AVIS_HEADING_DATED = re.compile(
    r"\bavis\s+n[°ºo0]?\s*([0-9OoQ]{1,4})\s+du\s+\d{1,2}\s+[a-zà-ÿ]+\s+(\d{4})",
    re.IGNORECASE,
)
#: The request that prompted it, when the heading itself is OCR-damaged.
_AVIS_REQUEST = re.compile(
    r"demande\s+d.avis\s+n[°ºo0]?\s*([0-9OoQ]{1,4})\s*[/-]\s*(\d{2,4})",
    re.IGNORECASE,
)
#: An avis is given in séance, by the Court sitting as a whole, and is
#: referenced /JN, /EP or /AC. Requiring one of these keeps « lettre
#: recommandée avec demande d'avis de réception » — an ordinary phrase in
#: saisie judgments — from turning a judgment into an advisory opinion.
_AVIS_CONTEXT = re.compile(
    r"s[ée]ance\s+du|formation\s+pl[ée]ni[èe]re|ass\.?\s*pl[ée]n|/JN\b|/EP\b|/AC\b",
    re.IGNORECASE,
)


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
    kind = "arret"

    # An avis consultatif, before anything else: its identifiers do not
    # follow the arrêt shape at all, so trying the arrêt patterns first
    # would simply fail and drop the document (which is what happened to
    # the two 1999 avis).
    avis = re.search(
        r"avis[.\s]*n?[°o]?\s*0*(\d{1,3})[./](\d{2,4})",
        (urn or "") + " " + (title or ""),
        re.IGNORECASE,
    )
    if avis:
        kind = "avis"
        year = avis.group(2)
        if len(year) == 2:
            # "99" is 1999 here: the avis series began with the Court.
            year = ("19" if int(year) >= 90 else "20") + year
        number = f"Avis {int(avis.group(1)):03d}/{year}"
        m = re.search(r";(\d{4})-(\d{2})-(\d{2});", urn or "")
        if m:
            decided_on = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"

    # Juricaf files avis among the arrêts, sometimes under a plain
    # reference ("01/2006/") that parses perfectly well as a judgment
    # number — which is how an advisory opinion ends up counted as a case.
    # The document says what it is in its own heading, and that wins.
    if kind != "avis":
        head = _clean(
            re.sub(
                r"<[^>]+>",
                " ",
                re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", page),
            )
        )
        window = head[:4000]
        if _AVIS_CONTEXT.search(window):
            # « Demande d'Avis n° 001/2015/AC … AVIS N° 03/2015 » — the
            # request and the opinion carry different numbers, and the
            # document is cited by the opinion's, so any match that is the
            # request being referred to is skipped.
            hit = None
            for pattern in (_AVIS_HEADING, _AVIS_HEADING_DATED):
                for candidate in pattern.finditer(window):
                    before = window[max(0, candidate.start() - 20) : candidate.start()]
                    if re.search(r"demande\s+d.\s*$", before, re.I):
                        continue
                    hit = candidate
                    break
                if hit:
                    break
            hit = hit or _AVIS_REQUEST.search(window)
            if hit:
                kind = "avis"
                digits = hit.group(1).translate(_OCR_ZEROS)
                year = hit.group(2)
                if len(year) == 2:
                    year = ("19" if int(year) >= 90 else "20") + year
                number = f"Avis {int(digits):03d}/{year}"
                m = re.search(r";(\d{4})-(\d{2})-(\d{2});", urn or "")
                if m:
                    decided_on = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"

    if urn and number is None:
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
    if (number is None or decided_on is None) and title and kind == "arret":
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
        if re.search(r"(?i)cour commune de justice|arr[eê]t n|avis n", line):
            start = i
            break
    end = len(lines)
    for i, line in enumerate(lines):
        if "juricaf" in line.lower() and i > start + 5:
            end = i
            break
    full_text = "\n".join(lines[start:end]).strip()

    return ParsedDecision(
        kind=kind,
        number=number,
        decided_on=decided_on,
        urn_lex=urn,
        title=title,
        keyword_header=keyword_header,
        full_text=full_text,
    )
