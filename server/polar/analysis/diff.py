"""Comparing two versions of an article, the way a lawyer reads them.

A character diff is useless here. What a lawyer asks of two versions of a
text is: which alinéa was added, which one disappeared, and inside the ones
that stayed, what words moved. So the comparison works at two levels:

- **alinéas are aligned first**, in order, by similarity — a reworded
  alinéa stays the same alinéa rather than showing up as one deletion and
  one addition;
- **words are diffed inside each aligned pair**, so the reader sees the
  actual edit and not a repainted paragraph.

Everything here is pure: the text goes in, the comparison comes out. No
judgement about what a change *means* is made anywhere — the product
reports what the texts say, and the lawyer draws the consequence.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from enum import StrEnum

#: An alinéa boundary: a blank line, or a newline before a new sentence.
_ALINEA_SPLIT = re.compile(r"\n\s*\n|\n(?=\s*[«A-ZÀ-Þ0-9])")
_WORD_SPLIT = re.compile(r"(\s+)")

#: Below this, two alinéas are different provisions rather than one edited.
ALIGN_THRESHOLD = 0.55

#: Typography that differs between our sources and never between two
#: legislative texts: the 1998 acts come from PDF extraction (straight
#: apostrophes, unaccented capitals), the 2023 ones from Akoma Ntoso
#: (typographic apostrophes, accented capitals). Reporting « l'étendue →
#: l’étendue » as an amendment would bury the real changes under noise.
_TYPOGRAPHY = str.maketrans(
    {
        "’": "'",
        "‘": "'",
        "“": '"',
        "”": '"',
        " ": " ",
        " ": " ",
        "–": "-",
        "—": "-",
        "…": "...",
        "À": "A",
        "Â": "A",
        "É": "E",
        "È": "E",
        "Ê": "E",
        "Ë": "E",
        "Î": "I",
        "Ï": "I",
        "Ô": "O",
        "Ù": "U",
        "Û": "U",
        "Ç": "C",
    }
)


def fold(text: str) -> str:
    """The text as it is *compared* — never as it is displayed.

    Folding happens on the comparison key only: every excerpt and every
    word run still carries the source's own characters, so what the reader
    sees is the text as published.
    """
    return unicodedata.normalize("NFC", text).translate(_TYPOGRAPHY)


class ChangeKind(StrEnum):
    added = "added"
    removed = "removed"
    modified = "modified"


@dataclass
class WordRun:
    """A stretch of words with one fate: kept, added or removed."""

    text: str
    op: str  # "equal" | "insert" | "delete"


@dataclass
class AlineaPair:
    """One aligned position across the two versions.

    ``old_index``/``new_index`` are 1-based alinéa numbers, or None when the
    alinéa exists on one side only.
    """

    old_index: int | None
    new_index: int | None
    old_text: str
    new_text: str
    kind: ChangeKind | None = None
    runs: list[WordRun] = field(default_factory=list)


@dataclass
class Change:
    """One line of the « ce qui a changé » summary."""

    kind: ChangeKind
    #: The alinéa number in the version where it can be pointed at.
    alinea: int
    #: A short quotation of what was added or removed, for recognition.
    excerpt: str

    @property
    def sign(self) -> str:
        return {
            ChangeKind.added: "+",
            ChangeKind.removed: "−",
            ChangeKind.modified: "~",
        }[self.kind]


@dataclass
class ArticleComparison:
    pairs: list[AlineaPair]
    changes: list[Change]

    @property
    def identical(self) -> bool:
        return not self.changes


def split_alineas(text: str) -> list[str]:
    """The article's alinéas, in order, whitespace normalized."""
    if not text or not text.strip():
        return []
    parts = _ALINEA_SPLIT.split(text)
    return [
        re.sub(r"\s+", " ", part).strip() for part in parts if part and part.strip()
    ]


def similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, fold(left), fold(right)).ratio()


def diff_words(old: str, new: str) -> list[WordRun]:
    """Word-level runs turning ``old`` into ``new``.

    Splitting on whitespace (and keeping it) means the reassembled text is
    the original text, not a re-spaced approximation of it.
    """
    old_tokens = [t for t in _WORD_SPLIT.split(old) if t]
    new_tokens = [t for t in _WORD_SPLIT.split(new) if t]
    runs: list[WordRun] = []

    def push(op: str, text: str) -> None:
        if not text:
            return
        if runs and runs[-1].op == op:
            runs[-1].text += text
        else:
            runs.append(WordRun(text=text, op=op))

    matcher = SequenceMatcher(
        None,
        [fold(t) for t in old_tokens],
        [fold(t) for t in new_tokens],
        autojunk=False,
    )
    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        if op == "equal":
            push("equal", "".join(old_tokens[i1:i2]))
        elif op == "delete":
            push("delete", "".join(old_tokens[i1:i2]))
        elif op == "insert":
            push("insert", "".join(new_tokens[j1:j2]))
        else:  # replace
            push("delete", "".join(old_tokens[i1:i2]))
            push("insert", "".join(new_tokens[j1:j2]))
    return runs


def _align(old: list[str], new: list[str]) -> list[tuple[int | None, int | None]]:
    """Order-preserving alignment of alinéas, by similarity.

    A small Needleman–Wunsch: articles have a handful of alinéas, so the
    quadratic table costs nothing and — unlike a greedy pass — it cannot
    strand a later alinéa by matching an earlier one too eagerly.
    """
    n, m = len(old), len(new)
    gap = -0.5
    # Below the threshold the two alinéas are unrelated provisions, so the
    # pairing is not merely expensive — it is forbidden. Anything finite
    # would tie with "one deletion plus one addition" and, on a tie, pair
    # two texts that have nothing to do with each other.
    forbidden = float("-inf")
    score = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        score[i][0] = score[i - 1][0] + gap
    for j in range(1, m + 1):
        score[0][j] = score[0][j - 1] + gap

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            ratio = similarity(old[i - 1], new[j - 1])
            match = (
                score[i - 1][j - 1] + ratio if ratio >= ALIGN_THRESHOLD else forbidden
            )
            score[i][j] = max(match, score[i - 1][j] + gap, score[i][j - 1] + gap)

    pairs: list[tuple[int | None, int | None]] = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            ratio = similarity(old[i - 1], new[j - 1])
            match = (
                score[i - 1][j - 1] + ratio if ratio >= ALIGN_THRESHOLD else forbidden
            )
            if match != forbidden and score[i][j] == match:
                pairs.append((i, j))
                i, j = i - 1, j - 1
                continue
        if i > 0 and score[i][j] == score[i - 1][j] + gap:
            pairs.append((i, None))
            i -= 1
            continue
        pairs.append((None, j))
        j -= 1
    pairs.reverse()
    return pairs


def _excerpt(text: str, limit: int = 90) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rsplit(" ", 1)[0] + "…"


def compare_articles(old_text: str, new_text: str) -> ArticleComparison:
    """Compare two versions of one article, alinéa by alinéa."""
    old = split_alineas(old_text)
    new = split_alineas(new_text)
    pairs: list[AlineaPair] = []
    changes: list[Change] = []

    for old_index, new_index in _align(old, new):
        old_body = old[old_index - 1] if old_index else ""
        new_body = new[new_index - 1] if new_index else ""
        pair = AlineaPair(
            old_index=old_index,
            new_index=new_index,
            old_text=old_body,
            new_text=new_body,
        )
        if old_index and new_index:
            if old_body != new_body:
                pair.kind = ChangeKind.modified
                pair.runs = diff_words(old_body, new_body)
                inserted = " ".join(
                    run.text.strip() for run in pair.runs if run.op == "insert"
                ).strip()
                changes.append(
                    Change(
                        kind=ChangeKind.modified,
                        alinea=new_index,
                        excerpt=_excerpt(inserted or new_body),
                    )
                )
        elif new_index:
            pair.kind = ChangeKind.added
            pair.runs = [WordRun(text=new_body, op="insert")]
            changes.append(
                Change(
                    kind=ChangeKind.added, alinea=new_index, excerpt=_excerpt(new_body)
                )
            )
        else:
            assert old_index is not None
            pair.kind = ChangeKind.removed
            pair.runs = [WordRun(text=old_body, op="delete")]
            changes.append(
                Change(
                    kind=ChangeKind.removed,
                    alinea=old_index,
                    excerpt=_excerpt(old_body),
                )
            )
        pairs.append(pair)

    return ArticleComparison(pairs=pairs, changes=changes)
