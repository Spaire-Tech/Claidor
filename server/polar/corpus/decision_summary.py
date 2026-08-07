"""What was argued, and what was held — in the court's own words.

A lawyer scanning a decision wants three things before reading it: what
the appellant complained of, what the court decided, and which provisions
carried it. All three are already in the judgment, in a form French
appellate drafting makes remarkably regular:

- the ground is announced by « fait grief à l'arrêt attaqué de… » or
  « reproche à… » ;
- the holding is the dispositif, after « PAR CES MOTIFS » — the operative
  part, and the most reliable sentence in the whole document ;
- the provisions come from the verified citation links, not from here.

So the summary is EXTRACTED, never generated. Nothing is paraphrased,
nothing is inferred, and a decision whose structure we cannot recognise
gets no summary at all rather than a plausible invention. What the reader
sees is a quotation they can find in the text below it.
"""

import re
from dataclasses import dataclass

#: The dispositif opener, in the casings the corpus actually uses.
_DISPOSITIF = re.compile(r"par\s+ces\s+motifs", re.IGNORECASE)

#: What the court actually orders. French dispositifs are built from a
#: closed set of operative verbs, so the outcome can be found precisely
#: instead of guessing where the procedural formula ends — those formulas
#: ("statuant publiquement, contradictoirement à l'égard des parties, en
#: matière commerciale et en premier ressort") run long and comma-heavy.
_OPERATIVE = re.compile(
    r"\b(casse|rejette|déclare|confirme|annule|reçoit|ordonne|condamne|"
    r"renvoie|infirme|constate|prononce|sursoit|dit\s+(?:que|n['’]y)|"
    r"donne\s+acte|met\s+hors\s+de\s+cause)\b",
    re.IGNORECASE,
)

#: How far into the dispositif an operative verb may sit before we assume
#: the structure is not what we think it is.
_OPERATIVE_WINDOW = 600

#: « la requérante fait grief à l'arrêt attaqué d'avoir… », and variants.
_GRIEF = re.compile(
    r"(?:il\s+est\s+)?fait\s+grief\s+(?:à|au|aux)\s|reproche\s+(?:à|au|aux)\s",
    re.IGNORECASE,
)

#: « il ne peut lui être fait grief » is the court rejecting a complaint,
#: not the complaint itself. Anchoring on it would report the opposite of
#: what was argued.
_GRIEF_NEGATED = re.compile(
    r"\b(?:ne\s+(?:peut|saurait|pouvait)|sans)\b[^.;]{0,40}$", re.IGNORECASE
)

MAX_LENGTH = 260


@dataclass(frozen=True)
class DecisionSummary:
    """Extracted, quotable, and possibly empty — never invented."""

    argued: str | None
    held: str | None

    @property
    def is_empty(self) -> bool:
        return not self.argued and not self.held


def _collapse(text: str) -> str:
    return " ".join(text.split())


def _clip(text: str, limit: int = MAX_LENGTH) -> str:
    text = text.strip(" ,;:-—")
    if len(text) <= limit:
        return text
    # Prefer a clause boundary so the quotation ends where the court paused.
    window = text[:limit]
    for boundary in ("; ", ". ", ", "):
        cut = window.rfind(boundary)
        if cut > limit * 0.5:
            return window[:cut].strip() + "…"
    return window.rsplit(" ", 1)[0] + "…"


def extract_held(full_text: str | None) -> str | None:
    """The dispositif: what the court actually ordered."""
    if not full_text:
        return None
    collapsed = _collapse(full_text)
    match = _DISPOSITIF.search(collapsed)
    if match is None:
        return None
    tail = collapsed[match.end() :]
    # Start at what the court ORDERS, so the first words the reader sees
    # are Casse / Rejette / Confirme rather than the procedural formula.
    operative = _OPERATIVE.search(tail[:_OPERATIVE_WINDOW])
    if operative is not None:
        tail = tail[operative.start() :]
    tail = tail.lstrip(" ,;:-—")
    return _clip(tail) or None


def extract_argued(full_text: str | None) -> str | None:
    """The ground of appeal, as the judgment announces it."""
    if not full_text:
        return None
    collapsed = _collapse(full_text)
    for match in _GRIEF.finditer(collapsed):
        before = collapsed[max(0, match.start() - 60) : match.start()]
        if _GRIEF_NEGATED.search(before):
            continue
        return _clip(collapsed[match.start() :]) or None
    return None


def summarize(full_text: str | None) -> DecisionSummary:
    return DecisionSummary(
        argued=extract_argued(full_text), held=extract_held(full_text)
    )
