"""House style, checked as self-consistency rather than conformance.

Vesence's Format action *« fixes headings, numbering, and styles to match
your firm's formatting rules »*. Ours cannot know a firm's rules — nobody
has given us any — and inventing them would produce a tool that argues
with a partner about their own house style on the first document.

So it checks the one thing that is wrong under *every* house style: a
document that contradicts itself. An agreement that writes « 30 June
2026 » in clause 4 and « June 30, 2026 » in clause 9 is inconsistent
whichever form the firm prefers, and the drafter did not choose it — it
arrived when two precedents were spliced together.

That framing has a useful property: it needs no configuration to be worth
running, and when a firm *does* supply a style guide the same machinery
answers a stricter question by fixing the expected variant instead of
inferring it from the majority.

**One finding per pattern, not per occurrence.** A document with two
hundred dates in two formats has one problem, and reporting it two hundred
times would bury everything else in the panel. Each finding names the
minority form, counts it, and points at its first appearance.
"""

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .terms import Finding

#: Below this many examples a « pattern » is a coincidence. Two forms
#: appearing once each is a document too short to have a style.
MIN_EXAMPLES = 3


@dataclass(frozen=True)
class Variant:
    """One way of writing something, and where it is written that way."""

    label: str
    offsets: list[int]
    literals: list[str]


def _date_variant(match: re.Match[str]) -> str | None:
    written = match.group(0)
    if re.match(r"\A\d{1,2}\s", written):
        return "day first (30 June 2026)"
    if re.match(r"\A[A-Z][a-z]+\s+\d{1,2},", written):
        return "month first (June 30, 2026)"
    if re.match(r"\A\d{1,2}/\d{1,2}/\d{2,4}\Z", written):
        return "numeric (30/06/2026)"
    return None


_MONTH = (
    "January|February|March|April|May|June|July|August|September|October|"
    "November|December"
)

DATES = re.compile(
    rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?(?:{_MONTH})\s+\d{{4}}"
    rf"|\b(?:{_MONTH})\s+\d{{1,2}},\s+\d{{4}}"
    rf"|\b\d{{1,2}}/\d{{1,2}}/\d{{2,4}}\b"
)


def _currency_variant(match: re.Match[str]) -> str | None:
    written = match.group(0)
    if written.startswith("$"):
        return "symbol first ($5,000,000)"
    if re.match(r"\A(?:USD|EUR|GBP)\s*\$", written):
        return "code and symbol (USD $5,000,000)"
    if re.match(r"\A(?:USD|EUR|GBP)\s", written):
        return "code first (USD 5,000,000)"
    if re.search(r"(?:dollars|euros|pounds)\Z", written, re.IGNORECASE):
        return "amount then word (5,000,000 dollars)"
    return None


CURRENCY = re.compile(
    r"(?:USD|EUR|GBP)\s*\$?\s?\d[\d,]{2,}(?:\.\d{2})?"
    r"|\$\s?\d[\d,]{2,}(?:\.\d{2})?"
    r"|\d[\d,]{2,}(?:\.\d{2})?\s+(?:dollars|euros|pounds)",
    re.IGNORECASE,
)


def _quote_variant(match: re.Match[str]) -> str | None:
    return "curly (“ ”)" if match.group(0) in "“”" else 'straight (")'


QUOTES = re.compile(r"[“”\"]")


def _numbering_variant(match: re.Match[str]) -> str | None:
    written = match.group(0).strip()
    if re.match(r"\A(?:Section|Article|Clause|Paragraph)\b", written, re.I):
        return "worded (Section 4.2)"
    if written.endswith("."):
        return "trailing stop (4.2.)"
    return "bare (4.2)"


NUMBERING = re.compile(
    r"^[ \t]*(?:(?:Section|Article|Clause|Paragraph)\s+\d[\d.]*\.?"
    r"|\d{1,2}(?:\.\d{1,3})+\.?)(?=[ \t]+[A-Za-z(\"“])",
    re.MULTILINE | re.IGNORECASE,
)

DIMENSIONS: list[tuple[str, str, re.Pattern[str], object]] = [
    ("dates", "dates", DATES, _date_variant),
    ("currency", "currency amounts", CURRENCY, _currency_variant),
    ("quotes", "quotation marks", QUOTES, _quote_variant),
    ("numbering", "clause numbering", NUMBERING, _numbering_variant),
]


def _ways(count: int) -> str:
    """« two ways », « three ways ». Saying « two » when there are three is
    a small lie that a reader notices immediately."""
    words = {2: "two", 3: "three", 4: "four", 5: "five"}
    return f"{words.get(count, str(count))} ways"


def variants(text: str, pattern: re.Pattern[str], classify: object) -> list[Variant]:
    """Every way the document writes one kind of thing, commonest first."""
    seen: dict[str, list[tuple[int, str]]] = {}
    for match in pattern.finditer(text):
        label = classify(match)  # type: ignore[operator]
        if label is None:
            continue
        seen.setdefault(label, []).append((match.start(), match.group(0)))

    found = [
        Variant(
            label=label,
            offsets=[offset for offset, _ in hits],
            literals=[literal for _, literal in hits],
        )
        for label, hits in seen.items()
    ]
    found.sort(key=lambda variant: -len(variant.offsets))
    return found


def inconsistencies(
    text: str,
) -> list[tuple[str, str, Variant, Variant, int, int]]:
    """Where the document contradicts itself.

    Returns ``(key, name, majority, minority, total, forms)`` per dimension that
    is used more than one way. Only the minority is reported: the majority
    is what the document mostly does, and calling that wrong would be an
    opinion about a firm's style rather than an observation about the text.
    """
    found: list[tuple[str, str, Variant, Variant, int, int]] = []
    for key, name, pattern, classify in DIMENSIONS:
        forms = variants(text, pattern, classify)
        total = sum(len(form.offsets) for form in forms)
        if len(forms) < 2 or total < MIN_EXAMPLES:
            continue
        majority = forms[0]
        for minority in forms[1:]:
            found.append((key, name, majority, minority, total, len(forms)))
    return found


def review_style(text: str) -> list["Finding"]:
    """House-style inconsistencies, one finding per pattern.

    Anchored at the *first* place the minority form appears, so « Go to »
    lands on an example rather than on a summary.
    """
    from .terms import Certainty, Defect, _finding, _Occurrences

    if not text:
        return []

    located = _Occurrences(text)
    findings: list[Finding] = []

    for _key, name, majority, minority, total, forms in inconsistencies(text):
        offset = minority.offsets[0]
        literal = minority.literals[0]
        count = len(minority.offsets)
        findings.append(
            _finding(
                text,
                located,
                defect=Defect.inconsistent_style,
                term=name,
                start=offset,
                end=offset + len(literal),
                certainty=Certainty.certain,
                note=(
                    f"The document writes {name} {_ways(forms)}. Mostly "
                    f"{majority.label} ({len(majority.offsets)} of {total}), "
                    f"but {count} use {minority.label} — this is the first."
                ),
            )
        )

    findings.sort(key=lambda finding: finding.start)
    return findings
