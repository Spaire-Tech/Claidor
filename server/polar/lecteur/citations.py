"""Finding the citations in a document someone else wrote.

Opposing conclusions cite texts and decisions, and a lawyer's first job is
to check each one. That check is mechanical — does this article exist in
the act as cited, does this arrêt exist — which is exactly the work a
corpus can do and a reader cannot do quickly.

Extraction is deterministic on purpose. A model asked to "find the
citations" will occasionally produce one that is not in the document, and
a brief-reader that invents a citation in the opponent's filing is worse
than no reader at all. So references are matched by their written form,
and every finding carries the exact span it came from — quotable back to
the reader, checkable against the page.
"""

import re
from dataclasses import dataclass
from enum import StrEnum

#: Act short codes as practitioners write them, including the variants
#: seen in real filings (AU/PSRVE, AUPSRVE, "Acte uniforme … recouvrement").
ACT_PATTERNS: dict[str, str] = {
    "AUPSRVE": r"AU\s*/?\s*P?SRVE|AUVE|voies?\s+d[''’]ex[ée]cution|proc[ée]dures?\s+simplifi[ée]es?\s+de\s+recouvrement",
    "AUSCGIE": r"AU\s*/?\s*SCGIE|soci[ée]t[ée]s?\s+commerciales?",
    "AUDCG": r"AU\s*/?\s*DCG|droit\s+commercial\s+g[ée]n[ée]ral",
    "AUS": r"AU\s*/?\s*S\b|s[ûu]ret[ée]s",
    "AUPC": r"AU\s*/?\s*PC(?:AP)?|proc[ée]dures?\s+collectives?",
    "AUA": r"AU\s*/?\s*A\b|droit\s+de\s+l[''’]arbitrage",
    "AUDCIF": r"AU\s*/?\s*DCIF|droit\s+comptable|SYSCOHADA",
    "AUCTMR": r"AU\s*/?\s*CTMR|transport\s+de\s+marchandises",
    "AUM": r"AU\s*/?\s*M\b|m[ée]diation",
    "AUSCOOP": r"AU\s*/?\s*SCOOP|soci[ée]t[ée]s?\s+coop[ée]ratives?",
    "TRAITE": r"Trait[ée]\s+(?:OHADA|de\s+Port[-\s]Louis|relatif\s+[àa]\s+l[''’]harmonisation)",
}

#: « article 170 », « art. 160-2 » — the head of a reference, up to the
#: first digit. The numbers themselves are read by :data:`_NUMBER`, because
#: one head can carry several: « articles 169, 170 et 172 ».
_ARTICLE_HEAD = re.compile(r"\b(?:articles?|art\.)\s*(?=\d)", re.IGNORECASE)
_NUMBER = re.compile(r"(\d{1,4})(?:\s*[-–]\s*(\d{1,2})\b)?")
#: What joins two numbers under one « articles » — comma, « et », « à ».
#: « à » only with its accent: « l'article 3 a 5 alinéas » is a sentence
#: about one article, not a range over three.
_SEPARATOR = re.compile(r"\s*(?:,|;|\bet\b|\bà\b|&)\s*(?=\d)", re.IGNORECASE)
#: A number followed by a month is a date, not an article: « l'article 170,
#: 12 avril 2023 » cites one article, not two.
_MONTH = re.compile(
    r"\s*(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t"
    r"|septembre|octobre|novembre|d[ée]cembre)\b",
    re.IGNORECASE,
)

#: « CCJA, arrêt n° 090/2018 », « CCJA n°090/2018 », « arrêt 022/2014 ».
_DECISION = re.compile(
    r"(?:CCJA|arr[êe]t)[^.;\n]{0,40}?n?[°ºo]?\s*(\d{1,3})\s*/\s*(\d{4})",
    re.IGNORECASE,
)

#: A version claimed alongside the act: « AUPSRVE (2023) », « rédaction de
#: 1998 ». Only these forms — a bare year is far more often part of a date.
_VERSION = re.compile(
    r"\(\s*((?:19|20)\d{2})\s*\)|(?:r[ée]daction|version)\s+(?:de\s+)?((?:19|20)\d{2})",
    re.IGNORECASE,
)

#: How far around a reference to look for the act it belongs to.
CONTEXT = 180
#: How far *after* a reference a claimed version can sit.
VERSION_REACH = 40


class Finding(StrEnum):
    verified = "verified"
    unverified = "unverified"
    weak = "weak"


@dataclass(frozen=True)
class Citation:
    """One reference as written, with where it was found."""

    kind: str  # "article" | "decision"
    raw: str
    #: Article number ("170", "160-2") or decision number ("090/2018").
    number: str
    #: Act short code when the document names one near the reference.
    act: str | None
    #: Version label the document claims, when it states one ("2023").
    version: str | None
    start: int
    end: int
    #: The sentence it sits in — quoted back so the reader can check.
    context: str


def _context(text: str, start: int, end: int) -> str:
    left = max(0, start - CONTEXT)
    right = min(len(text), end + CONTEXT)
    return " ".join(text[left:right].split())


def _act_near(text: str, start: int, end: int) -> str | None:
    """The act named closest to the reference, if any.

    Nearest wins: « articles 169 et 170 AUPSRVE, ensemble l'article 33 de
    l'AUS » must not attach the AUS to the first two.
    """
    window_start = max(0, start - CONTEXT)
    window_end = min(len(text), end + CONTEXT)
    window = text[window_start:window_end]
    best: tuple[int, str] | None = None
    for code, pattern in ACT_PATTERNS.items():
        for match in re.finditer(pattern, window, re.IGNORECASE):
            position = window_start + match.start()
            distance = start - position if position < start else position - end
            if best is None or distance < best[0]:
                best = (distance, code)
    return best[1] if best else None


def _version_near(text: str, end: int) -> str | None:
    """A version label the document claims just after the reference."""
    match = _VERSION.search(text, end, min(len(text), end + VERSION_REACH))
    if match is None:
        return None
    return match.group(1) or match.group(2)


def _article_citations(text: str) -> list[Citation]:
    """Article references, one per number, enumerations included."""
    found: list[Citation] = []
    for head in _ARTICLE_HEAD.finditer(text):
        position = head.end()
        first = True
        while True:
            number_match = _NUMBER.match(text, position)
            if number_match is None:
                break
            # « l'article 170, 12 avril 2023 » — the second number is a date.
            if not first and _MONTH.match(text, number_match.end()):
                break
            number = number_match.group(1)
            if number_match.group(2):
                number = f"{number}-{number_match.group(2)}"
            start = head.start() if first else number_match.start()
            end = number_match.end()
            found.append(
                Citation(
                    kind="article",
                    raw=text[start:end].strip(),
                    number=number,
                    act=_act_near(text, start, end),
                    version=_version_near(text, end),
                    start=start,
                    end=end,
                    context=_context(text, start, end),
                )
            )
            first = False
            separator = _SEPARATOR.match(text, end)
            if separator is None:
                break
            position = separator.end()
    return found


def _decision_citations(text: str) -> list[Citation]:
    found: list[Citation] = []
    for match in _DECISION.finditer(text):
        # Numbers are written « 90/2018 » as often as « 090/2018 ».
        number = f"{int(match.group(1)):03d}/{match.group(2)}"
        found.append(
            Citation(
                kind="decision",
                raw=" ".join(match.group(0).split()),
                number=number,
                act=None,
                version=None,
                start=match.start(),
                end=match.end(),
                context=_context(text, match.start(), match.end()),
            )
        )
    return found


def extract(text: str) -> list[Citation]:
    """Every article and decision reference in the document, in order."""
    if not text:
        return []
    found = _article_citations(text) + _decision_citations(text)

    # Reading order, and never the same reference twice.
    found.sort(key=lambda c: (c.start, c.kind))
    deduped: list[Citation] = []
    seen: set[tuple[str, str, str | None, str | None]] = set()
    for citation in found:
        key = (citation.kind, citation.number, citation.act, citation.version)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(citation)

    # « l'article 170 AUPSRVE (2023) » here and « l'article 170 » there are
    # one reference, and the one that names a version is the one to check.
    versioned = {(c.kind, c.number, c.act) for c in deduped if c.version is not None}
    return [
        c
        for c in deduped
        if c.version is not None or (c.kind, c.number, c.act) not in versioned
    ]
