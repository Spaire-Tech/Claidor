"""Which article of the old act became which article of the new one.

A revised uniform act renumbers, rewrites, drops and adds provisions at
once. A lawyer holding a 1998 judgment needs to know where article 170
lives in the 2023 text — and the corpus can answer that only where a
concordance is recorded. Fourteen were mapped by hand for the
saisie-attribution slice; the rest of the corpus had none.

The mapping is computed here, and computed carefully, because a wrong
concordance is worse than a missing one: it sends a lawyer to a provision
that never replaced theirs. Three properties do the work:

- **order is preserved.** Legislators renumber, they do not shuffle. A
  global alignment (the same Needleman–Wunsch used for alinéas, banded
  for size) cannot cross two mappings over each other, which removes an
  entire class of plausible-looking nonsense.
- **weak matches are refused, not forced.** Below the threshold no
  mapping is made at all, and the article is reported as repealed or new.
  Gaps are honest; guesses are not.
- **nothing is asserted as official.** Every mapping produced here is
  labelled as computed, with the similarity that produced it, so it can
  never be mistaken for the legislator's own table of concordance.
"""

import re
from collections.abc import Sequence
from dataclasses import dataclass

#: Words shorter than this carry no signal in legal French ("de", "la",
#: "les"): dropping them keeps the similarity about substance.
MIN_TOKEN = 4

#: Below this Jaccard similarity two articles are different provisions.
#: Chosen against the fourteen hand-verified AUPSRVE mappings — see
#: tests/corpus/test_concordance.py.
MATCH_THRESHOLD = 0.45

#: An article that keeps its number across a revision is very probably the
#: same provision, even when heavily rewritten: 1998 art. 49 became 2023
#: art. 49 with only a third of its words in common, and every lawyer
#: reads them as the same rule. Same number therefore lowers the bar —
#: but does not remove it.
SAME_NUMBER_THRESHOLD = 0.25

#: A renumbering shifts an article by some amount, it does not send it to
#: the other end of the act. Restricting candidates to a window keeps the
#: quadratic work tractable on AUSCGIE (920 × 1076) and rules out absurd
#: long-distance pairings. Widened automatically when the two versions
#: differ greatly in length.
BAND = 160

_WORD = re.compile(r"[a-zà-ÿœæ]+", re.IGNORECASE)


@dataclass(frozen=True)
class ArticleRef:
    number: str
    text: str


@dataclass(frozen=True)
class Mapping:
    """One position in the concordance; either side may be absent."""

    old: ArticleRef | None
    new: ArticleRef | None
    similarity: float
    relation: str

    @property
    def is_pair(self) -> bool:
        return self.old is not None and self.new is not None


def tokenize(text: str) -> frozenset[str]:
    return frozenset(
        token for token in _WORD.findall(text.lower()) if len(token) >= MIN_TOKEN
    )


def similarity(left: frozenset[str], right: frozenset[str]) -> float:
    if not left or not right:
        return 0.0
    intersection = len(left & right)
    if not intersection:
        return 0.0
    return intersection / len(left | right)


def _normalized(text: str) -> str:
    return " ".join(text.split()).lower()


def align(
    old: Sequence[ArticleRef],
    new: Sequence[ArticleRef],
    *,
    threshold: float = MATCH_THRESHOLD,
    band: int = BAND,
) -> list[Mapping]:
    """Order-preserving concordance between two versions of one act."""
    n, m = len(old), len(new)
    if not n or not m:
        return [Mapping(a, None, 0.0, "repealed") for a in old] + [
            Mapping(None, b, 0.0, "new") for b in new
        ]

    # A length difference is itself a shift: widen the window so a late
    # article is not stranded merely because many were inserted before it.
    band = max(band, abs(n - m) + 40)
    old_tokens = [tokenize(a.text) for a in old]
    new_tokens = [tokenize(b.text) for b in new]

    gap = -0.05
    forbidden = float("-inf")
    previous = [0.0] + [gap * j for j in range(1, m + 1)]
    # 0 = diagonal (pair), 1 = up (old only), 2 = left (new only)
    pointers: list[bytearray] = []

    for i in range(1, n + 1):
        current = [previous[0] + gap] + [forbidden] * m
        row = bytearray(m + 1)
        row[0] = 1
        lo, hi = max(1, i - band), min(m, i + band)
        for j in range(1, lo):
            current[j] = current[j - 1] + gap
            row[j] = 2
        for j in range(lo, hi + 1):
            score = similarity(old_tokens[i - 1], new_tokens[j - 1])
            same_number = old[i - 1].number == new[j - 1].number
            acceptable = score >= threshold or (
                same_number and score >= SAME_NUMBER_THRESHOLD
            )
            # A tiny nudge, not a free pass: it only decides ties between
            # two candidates that both cleared the bar on their text.
            weight = score + (0.05 if same_number else 0.0)
            diagonal = previous[j - 1] + weight if acceptable else forbidden
            up = previous[j] + gap
            left = current[j - 1] + gap
            best = max(diagonal, up, left)
            current[j] = best
            row[j] = 0 if best == diagonal else (1 if best == up else 2)
        for j in range(hi + 1, m + 1):
            current[j] = current[j - 1] + gap
            row[j] = 2
        pointers.append(row)
        previous = current

    mappings: list[Mapping] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and pointers[i - 1][j] == 0:
            a, b = old[i - 1], new[j - 1]
            score = similarity(old_tokens[i - 1], new_tokens[j - 1])
            same_text = _normalized(a.text) == _normalized(b.text)
            same_number = a.number == b.number
            if same_text:
                relation = "unchanged" if same_number else "renumbered"
            else:
                relation = "amended"
            mappings.append(Mapping(a, b, score, relation))
            i, j = i - 1, j - 1
        elif i > 0 and (j == 0 or pointers[i - 1][j] == 1):
            mappings.append(Mapping(old[i - 1], None, 0.0, "repealed"))
            i -= 1
        else:
            mappings.append(Mapping(None, new[j - 1], 0.0, "new"))
            j -= 1
    mappings.reverse()
    return mappings
