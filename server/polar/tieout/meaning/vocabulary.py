"""The vocabulary: taxonomy concepts, filer labels, and the match that names a row.

Two sources, both distilled on 2 September 2026 (`data/NOTICE.md`,
`docs/pierce/materials-intake.md`):

- the **US GAAP 2026** and **UK FRC 2025** taxonomies — every money
  concept with its balance (debit or credit), its period type
  (instant: a balance at a date; duration: a movement over a
  period) and its published labels;
- the **SEC's label-to-concept pairs** for one quarter — how real
  filers wrote each statement line beside the concept they tagged it
  as, with how many printed it sign-flipped.

A label is matched **exactly** after normalisation, or not at all.
No fuzzy matching: a near miss is a guess, and a wrong meaning under
a row is worse than no meaning. The registration fixed the three
tiers — exact, filers, none — and this module returns which one
answered and why.
"""

from __future__ import annotations

import gzip
import json
import re
from collections.abc import Iterable
from dataclasses import dataclass
from functools import cache
from pathlib import Path

_DATA = Path(__file__).parent / "data"

#: The qualifier words a regulator's model hangs on a label to say
#: which copy of a line this is, not what the line is. Measured on
#: the first run (taxonomy-coverage.md): the entity words — appointee,
#: wholesale, retail — sat in the middle of every statement label and
#: the statements scored zero until they were here.
_QUALIFIER_WORDS = (
    r"nominal|real|control|total|outturn|base year|pos|"
    r"pre[- ]?financeability|post[- ]?financeability|"
    r"appointee|wholesale|retail|residential|business|water|wastewater|"
    r"£m|£k|£|%"
)
#: A trailing parenthetical comes off only when it is a **code** —
#: `(WR)`, `(ADDN2)`, `(BR)`: short, upper case — or a qualifier
#: word. `(Loss)`, `(Benefit)`, `(incl. 3rd party income)` are part of
#: the name and stay: stripping « (Loss) » from the taxonomy's
#: « Operating Income (Loss) » made it collide with the British
#: « Operating income », which is revenue, on the first run.
_TRAILING_CODE = re.compile(r"\s*\([A-Z0-9][A-Z0-9 /&-]{0,7}\)\s*$")
_TRAILING_WORD = re.compile(r"\s*\((?:" + _QUALIFIER_WORDS + r")\)\s*$", re.IGNORECASE)
_SUFFIX = re.compile(r"\s*[-–—]\s*(" + _QUALIFIER_WORDS + r")\s*$", re.IGNORECASE)
#: Words that name a place in a schedule, not a line of accounts. US
#: filers tag « Opening balance » as equity because that is where
#: their equity roll-forward says it; in a debt schedule it is debt,
#: in a fixed-asset schedule it is cost. Never named.
GENERIC = frozenset(
    {
        "opening balance",
        "closing balance",
        "balance",
        "brought forward",
        "carried forward",
        "b f",
        "c f",
        "bf",
        "cf",
        "subtotal",
        "sub total",
        "total",
        "movement",
        "movements",
        "other",
        "adjustment",
        "adjustments",
        "check",
        "difference",
    }
)
_YEAR = re.compile(r"\b(?:19|20)\d{2}(?:[-/]\d{2,4})?\b")
_UNIT = re.compile(r"\b(?:£m|£k|£|\$m|\$|€m|€|gbp|usd|eur|m|k|bn|%)\b", re.IGNORECASE)
_CAMEL = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")
_NOT_WORD = re.compile(r"[^a-z0-9 ]+")
_SPACES = re.compile(r"\s+")


def normalise(label: str) -> str:
    """The label as the vocabulary keys it: lower case, no qualifiers,
    no years or units, one space between words."""
    text = label.strip()
    #: Strip qualifiers repeatedly: `Interest - nominal (WR)` carries both.
    for _ in range(3):
        before = text
        text = _TRAILING_CODE.sub("", text)
        text = _TRAILING_WORD.sub("", text)
        text = _SUFFIX.sub("", text)
        if text == before:
            break
    text = text.lower()
    text = _YEAR.sub(" ", text)
    text = _NOT_WORD.sub(" ", text)
    text = _UNIT.sub(" ", text)
    return _SPACES.sub(" ", text).strip()


def qualifiers(label: str) -> tuple[str, ...]:
    """What normalisation removed from the end — kept as the row's
    qualifiers, never matched on."""
    found: list[str] = []
    text = label.strip()
    for _ in range(3):
        paren = _TRAILING_CODE.search(text) or _TRAILING_WORD.search(text)
        if paren:
            found.append(paren.group(0).strip())
            text = text[: paren.start()]
            continue
        suffix = _SUFFIX.search(text)
        if suffix:
            found.append(suffix.group(1))
            text = text[: suffix.start()]
            continue
        break
    return tuple(found)


def words_of(concept_name: str) -> str:
    """`NetCurrentAssetsLiabilities` → `net current assets liabilities`."""
    return normalise(_CAMEL.sub(" ", concept_name))


@dataclass(frozen=True)
class Concept:
    """One money line of the dictionary."""

    source: str
    name: str
    #: `debit` or `credit`, or None where the taxonomy gives none.
    balance: str | None
    #: `instant` (a balance at a date) or `duration` (a movement).
    period: str | None
    label: str | None
    total_label: str | None
    terse_label: str | None

    @property
    def words(self) -> str:
        return self.label or words_of(self.name)


@dataclass(frozen=True)
class Match:
    """How a row label was named, or that it was not."""

    label: str
    normalised: str
    qualifiers: tuple[str, ...]
    #: `exact`, `filers`, or `none`.
    tier: str
    concept: Concept | None = None
    #: For `filers`: how many statement lines agreed and disagreed
    #: with the chosen concept, and how many were printed sign-flipped.
    agreed: int = 0
    disagreed: int = 0
    flipped: int = 0
    #: One sentence a screen can show.
    why: str = ""

    @property
    def named(self) -> bool:
        return self.concept is not None


class Vocabulary:
    """The loaded dictionary. Build once; `vocabulary()` caches it."""

    def __init__(
        self,
        concepts: Iterable[Concept],
        filer_labels: dict[str, dict[str, list[int]]],
        uk_filer_labels: dict[str, dict[str, list[int]]] | None = None,
    ):
        self.by_name: dict[tuple[str, str], Concept] = {}
        self.by_label: dict[str, list[Concept]] = {}
        for one in concepts:
            self.by_name[(one.source, one.name)] = one
            for text in (one.label, one.total_label, one.terse_label):
                if text:
                    self.by_label.setdefault(normalise(text), []).append(one)
            self.by_label.setdefault(words_of(one.name), []).append(one)
        #: How real filers wrote each line, by country: the SEC's
        #: quarter for the US, Companies House's daily bulk for the UK
        #: (uk-filer-labels.md). Each maps a normalised label to the
        #: concepts it was tagged as, with line counts and sign flips.
        self.filers: dict[str, dict[str, dict[str, list[int]]]] = {
            "us-gaap": filer_labels,
            "frc": uk_filer_labels or {},
        }

    @property
    def filer_labels(self) -> dict[str, dict[str, list[int]]]:
        return self.filers["us-gaap"]

    @property
    def size(self) -> int:
        return len(self.by_name)

    def concept(self, name: str, source: str = "us-gaap") -> Concept | None:
        return self.by_name.get((source, name))

    def _filers(self, key: str, source: str, found: Match) -> Match | None:
        """One country's filers on one label: majority, split, or nothing."""
        tags = self.filers.get(source) or {}
        found_tags = tags.get(key)
        if not found_tags:
            return None
        name, (count, flipped) = max(found_tags.items(), key=lambda kv: kv[1][0])
        concept = self.by_name.get((source, name))
        if concept is None:
            return None
        total = sum(v[0] for v in found_tags.values())
        who = "UK filers" if source == "frc" else "US filers"
        if count * 2 <= total:
            #: The registration says « the concept most of them tagged
            #: it as ». A plurality is not most: « Total revenue »
            #: splits 307 of 616 between two revenue concepts, and
            #: picking one would be a guess dressed as a count.
            return Match(
                label=found.label,
                normalised=key,
                qualifiers=found.qualifiers,
                tier="none",
                agreed=count,
                disagreed=total - count,
                why=(
                    f"{who} split: {count} of {total} lines written this way "
                    f"were tagged « {concept.words} », the rest otherwise"
                ),
            )
        return Match(
            label=found.label,
            normalised=key,
            qualifiers=found.qualifiers,
            tier="uk-filers" if source == "frc" else "filers",
            concept=concept,
            agreed=count,
            disagreed=total - count,
            flipped=flipped,
            why=(
                f"{count} of {total} {who}' lines written this way were "
                f"tagged « {concept.words} »"
            ),
        )

    def match(
        self,
        label: str,
        sources: tuple[str, ...] = ("us-gaap", "frc"),
        dialect: str = "us",
    ) -> Match:
        """Name one row label, or say it cannot be named.

        `dialect` orders the filers' tiers: `uk` asks the UK filers
        before the US ones, `us` the reverse. The exact tier comes
        first either way, and a split in the first country asked is
        the answer — the second is not consulted to break a tie the
        first could not.
        """
        key = normalise(label)
        found = Match(
            label=label, normalised=key, qualifiers=qualifiers(label), tier="none"
        )
        if not key:
            return found
        if key in GENERIC:
            return Match(
                label=label,
                normalised=key,
                qualifiers=found.qualifiers,
                tier="none",
                why=f"« {key} » is a schedule word, not a line of accounts",
            )
        #: Exact: a taxonomy label. The US dictionary first — its labels
        #: are complete — then the UK one; within a source, the
        #: shortest concept name wins a tie, which is the general line
        #: over its qualified variants.
        for source in sources:
            candidates = [c for c in self.by_label.get(key, []) if c.source == source]
            if candidates:
                chosen = min(candidates, key=lambda c: (len(c.name), c.name))
                return Match(
                    label=label,
                    normalised=key,
                    qualifiers=found.qualifiers,
                    tier="exact",
                    concept=chosen,
                    why=f"the label is the {source} name of « {chosen.words} »",
                )
        #: Filers: how real filers wrote it, majority concept, the
        #: dialect's own country first.
        order = ("frc", "us-gaap") if dialect == "uk" else ("us-gaap", "frc")
        for source in order:
            if source not in sources:
                continue
            answer = self._filers(key, source, found)
            if answer is not None:
                return answer
        return found


def _load_concepts() -> list[Concept]:
    with gzip.open(_DATA / "concepts.json.gz", "rt", encoding="utf-8") as handle:
        rows = json.load(handle)
    return [Concept(*row) for row in rows]


def _load_filer_labels(
    name: str = "filer_labels.json.gz",
) -> dict[str, dict[str, list[int]]]:
    path = _DATA / name
    if not path.exists():
        return {}
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        loaded: dict[str, dict[str, list[int]]] = json.load(handle)
    return loaded


@cache
def vocabulary() -> Vocabulary:
    """The dictionary, loaded once per process."""
    return Vocabulary(
        _load_concepts(),
        _load_filer_labels(),
        _load_filer_labels("uk_filer_labels.json.gz"),
    )
