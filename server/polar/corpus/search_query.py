"""How lawyers type, parsed.

Practitioners do not type search queries; they type citations. « article 170
AUPSRVE », « art. 160-2 », « CCJA 090/2018 », « arrêt n° 22/2010 du 8 avril
2010 » — each of those is a request for one specific document, and the right
answer is to land on it, not to rank it third among keyword matches.

This module turns a raw query into a structured intent. It is pure and
import-light on purpose: every recognition rule is inspectable and unit
tested, and nothing here touches the database.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from enum import StrEnum

# Short codes as practitioners write them, mapped to the registry's codes.
# Deliberately generous with the spellings actually seen in briefs.
ACT_ALIASES: dict[str, str] = {
    "aupsrve": "AUPSRVE",
    "audcg": "AUDCG",
    "aus": "AUS",
    "auscgie": "AUSCGIE",
    "auscoop": "AUSCOOP",
    "aupc": "AUPC",
    "aua": "AUA",
    "aum": "AUM",
    "auctmr": "AUCTMR",
    "audcif": "AUDCIF",
    "traite": "TRAITE",
    "traité": "TRAITE",
    # Long forms, abbreviated to what identifies them.
    "voies d'exécution": "AUPSRVE",
    "procédures simplifiées": "AUPSRVE",
    "droit commercial général": "AUDCG",
    "sûretés": "AUS",
    "sociétés commerciales": "AUSCGIE",
    "sociétés coopératives": "AUSCOOP",
    "procédures collectives": "AUPC",
    "arbitrage": "AUA",
    "médiation": "AUM",
    "transport de marchandises": "AUCTMR",
    "droit comptable": "AUDCIF",
}


class QueryKind(StrEnum):
    #: One specific article is being asked for.
    article = "article"
    #: One specific decision is being asked for.
    decision = "decision"
    #: No citation recognized — search the text.
    text = "text"


@dataclass(frozen=True)
class ParsedQuery:
    kind: QueryKind
    #: Article or decision number, when one was recognized ("170", "090/2018").
    number: str | None = None
    #: Registry short code, when the query named an act.
    act_code: str | None = None
    #: Year, when a decision number carried one.
    year: int | None = None
    #: What is left for full-text search (the whole query for `text`).
    text: str = ""


def _fold(value: str) -> str:
    """Lowercase, NFC-normalized, whitespace-collapsed."""
    value = unicodedata.normalize("NFC", value).lower()
    return re.sub(r"\s+", " ", value).strip()


def _find_act(query: str) -> str | None:
    """The act named in the query, if any. Longest alias wins."""
    for alias in sorted(ACT_ALIASES, key=len, reverse=True):
        # Short codes must match as whole words ("aus" must not fire inside
        # "auscgie"); long forms are matched as phrases.
        pattern = rf"\b{re.escape(alias)}\b" if " " not in alias else re.escape(alias)
        if re.search(pattern, query):
            return ACT_ALIASES[alias]
    return None


#: "article 170", "art. 160-2", "art 245-11" — the number may be compound.
_ARTICLE = re.compile(r"\bart(?:icle|\.)?\s*(\d+(?:-\d+)*)\b")
#: "090/2018", "22/2010" — a decision number carries its year.
_DECISION_NUMBER = re.compile(r"\b(\d{1,4})\s*/\s*(19|20)(\d{2})\b")
#: A court named explicitly.
_COURT = re.compile(r"\b(ccja|cour\s+commune|arr[êe]t)\b")


def parse_query(raw: str) -> ParsedQuery:
    """Turn a raw query into an intent.

    Order matters: a decision number (``090/2018``) is unambiguous and wins
    over an article number, because « CCJA 090/2018 » also contains digits
    that an article pattern would happily claim.
    """
    query = _fold(raw)
    if not query:
        return ParsedQuery(kind=QueryKind.text, text="")

    act = _find_act(query)

    decision = _DECISION_NUMBER.search(query)
    if decision is not None:
        number = f"{decision.group(1)}/{decision.group(2)}{decision.group(3)}"
        return ParsedQuery(
            kind=QueryKind.decision,
            number=number,
            year=int(f"{decision.group(2)}{decision.group(3)}"),
            act_code=act,
            text=raw.strip(),
        )

    article = _ARTICLE.search(query)
    if article is not None:
        return ParsedQuery(
            kind=QueryKind.article,
            number=article.group(1),
            act_code=act,
            text=raw.strip(),
        )

    # A bare number next to an act code is an article reference too:
    # "AUPSRVE 170" is how a hurried practitioner writes it.
    if act is not None:
        bare = re.search(r"\b(\d+(?:-\d+)*)\b", query)
        if bare is not None:
            return ParsedQuery(
                kind=QueryKind.article,
                number=bare.group(1),
                act_code=act,
                text=raw.strip(),
            )

    # A bare number after an explicit court mention, with no year: not enough
    # to identify a decision, so it stays a text search rather than guessing.
    if _COURT.search(query):
        return ParsedQuery(kind=QueryKind.text, act_code=act, text=raw.strip())

    return ParsedQuery(kind=QueryKind.text, act_code=act, text=raw.strip())


def normalize_decision_number(number: str) -> str:
    """Zero-padding-insensitive form: "090/2018" ≡ "90/2018".

    The corpus stores decisions as the source spelled them; practitioners
    type either. Comparison happens on this form.
    """
    match = re.match(r"^0*(\d+)\s*/\s*(\d{4})$", number.strip())
    if match is None:
        return number.strip()
    return f"{int(match.group(1))}/{match.group(2)}"
