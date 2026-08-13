"""Every number printed in a deck, with the label that says what it is.

The number on its own is useless. `9.9x` appears twice on slide 6 of the
Cascade deck — once as a peer's multiple in the table body, once as the
median in the footer row — and they are different figures that happen to
share a value. What tells them apart is the label beside each: `Kestrel
Valve Group` against `Median`.

So extraction is not « find the numbers ». It is « find the numbers, and
for each one, find the words that name it ». Everything downstream depends
on the second half.

**Where labels come from, by shape:**

| Shape | The label |
|---|---|
| Metric tile | The caption above the value, inside the same shape or the one before it |
| Table cell | Its row header and its column header, joined |
| Body sentence | The clause between this figure and the one before it |
| Chart | The series name and the category |

**Printed precision is kept, not normalised away.** The deck prints
`9.9x`; the model holds 9.90401938065649. Comparing those as floats fails,
and rounding the model to two places fails differently. The only correct
comparison is *at the precision the deck chose to print*, so the number of
decimals shown is recorded here and used later. A figure printed to one
decimal is a claim about one decimal, and that is the claim to check.
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

#: Currency, scale, percent, multiple, thousands separators, and negatives
#: in parentheses — the conventions a banker's deck actually uses.
#:
#: Deliberately not a general number regex. `FY2025A`, `Q3`, `28-Nov-2025`
#: and slide numbers are not figures, and a matcher that treats them as
#: such spends its life explaining itself.
NUMBER = re.compile(
    r"""
    (?P<open>\()?                      # negative in parentheses
    \s*(?P<currency>[$€£])?\s*
    (?P<digits>\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)
    # Spelled-out scales first: alternation is ordered, and `m` would
    # otherwise win against « million » and leave « illion » behind.
    \s*(?P<scale>million|billion|thousand|mm|bn\.|bn|m|k)?
    \s*(?P<suffix>%|x)?
    # **A scale letter cannot begin the next word, or precede a digit.**
    # Without this, a contents page reading « 18 More value » parses as
    # eighteen million — the number fabricated rather than merely
    # misnamed, and 191 of them in one real annual report. Backtracking
    # does the right thing: the scale gives up, the bare integer fails
    # the no-marks test below, and nothing is claimed. The digit half
    # is « 12 m3 per day », which an annual report has hundreds of.
    (?![A-Za-z0-9])
    # A closing bracket only counts when this figure opened one. Taken
    # unconditionally it swallows the bracket of a footnote or an adjacent
    # column — « $16.5) » — and prints a value the document does not.
    (?(open)\)|)
    """,
    re.VERBOSE | re.IGNORECASE,
)

#: Tokens that look numeric and are never figures.
NOT_A_FIGURE = re.compile(
    r"""
    ^(?:
        FY\d{2,4}[AEP]?          # FY2025A, FY26E
      | Q[1-4]                    # Q3
      | \d{1,2}-[A-Za-z]{3}-\d{2,4}  # 28-Nov-2025
      | \d{4}                     # a bare year
    )$
    """,
    re.VERBOSE | re.IGNORECASE,
)

#: In the model's own units, which are millions.
SCALES = {
    "k": Decimal(1) / 1000,
    "thousand": Decimal(1) / 1000,
    "m": Decimal(1),
    "mm": Decimal(1),
    "million": Decimal(1),
    "bn": Decimal(1000),
    "bn.": Decimal(1000),
    "billion": Decimal(1000),
}


@dataclass(frozen=True)
class Figure:
    """One printed number, and everything needed to reason about it."""

    #: As printed: « $48.9mm », « 9.9x », « (96.4) ».
    printed: str
    #: The value the printing denotes, in the model's own units — millions
    #: for currency, a fraction for a percentage, a plain number for a
    #: multiple. So « $48.9mm » is 48.9 and « 21.4% » is 0.214.
    value: Decimal
    #: How many decimals the deck chose to show. The precision of the claim.
    decimals: int
    #: `currency`, `percent`, `multiple` or `plain`.
    kind: str
    slide: int
    #: What the deck calls *this* figure — the words that name it and no
    #: other. For a sentence holding three figures this is one clause, not
    #: the sentence: « FY2025A reported EBITDA of $41.2mm adjusts to
    #: $48.9mm » names two different quantities, and a label that covers
    #: both would reconcile one of them against the other's cell.
    label: str
    #: Where it sits, for taking a reader to it.
    location: str
    #: Kept so a finding can quote the sentence rather than the number.
    context: str = ""
    #: The slide's title and subtitle, and the heading above this block.
    #: Background, never a name: « Trading comparables » says which
    #: methodology a page is about without naming any figure on it.
    section: str = ""
    #: True when the figure is one end of a printed range — « $455mm to
    #: $528mm ». A range is a claim about two cells at once, and there is
    #: no single output row it reconciles to.
    range_endpoint: bool = False
    #: True when the label is a complete name rather than a fragment of
    #: prose: a table's row and column, or a metric tile's caption.
    structured: bool = False
    #: Printed inside parentheses — « (96.4) ». In a deck this is a
    #: presentation convention meaning « subtracted here », not a claim
    #: that the cell behind it holds a negative number. The Cascade model
    #: holds total debt as +96.4 and the DCF bridge prints it as (96.4);
    #: both are right, and comparing them signed is a false positive.
    parenthesised: bool = False
    #: A table's row label, and only that. A row label is a whole name for
    #: a line item — « Adjusted EBITDA », « Kestrel Valve Group » — so if
    #: the model has never used one of its words, the row is about
    #: something the model does not publish. Prose has no equivalent:
    #: « Applying the peer median of » is full of words no model uses.
    subject: str = ""
    #: Where this figure physically sits, in coordinates a host application
    #: can act on: which shape, which table cell, which chart point, which
    #: paragraph and which characters within it.
    #:
    #: :attr:`location` is the same fact in prose — « slide 3, row
    #: « Adjusted EBITDA » » — and the two are kept apart deliberately. One
    #: is for a person reading a finding; the other is for a panel inside
    #: PowerPoint that has to *select the shape* the banker is being told
    #: about. No amount of parsing that sentence gets there reliably.
    #:
    #: A dict rather than fields because what identifies a position differs
    #: by shape: a table cell is a row and a column, a chart point is a
    #: series and an index, a sentence is a paragraph and an offset. Only
    #: `shape_id` is common to all three.
    anchor: dict[str, Any] = field(default_factory=dict)

    def as_printed_precision(self, other: Decimal) -> Decimal:
        """Round a model value to the precision this figure was printed at.

        The comparison the whole product turns on. A deck printing 9.9x is
        making a claim about one decimal place; holding it to the model's
        fifteen would fail every time, and rounding both to two would let
        10.4x pass as 9.9x. Neither is a check.
        """
        if self.kind == "percent":
            scaled = other * 100
        else:
            scaled = other
        quantum = Decimal(1).scaleb(-self.decimals)
        return scaled.quantize(quantum)

    def printed_value_at_precision(self) -> Decimal:
        if self.kind == "percent":
            return (self.value * 100).quantize(Decimal(1).scaleb(-self.decimals))
        return self.value.quantize(Decimal(1).scaleb(-self.decimals))


@dataclass
class Extraction:
    figures: list[Figure] = field(default_factory=list)
    #: Numbers seen and rejected as not-figures, for tuning. A count that
    #: climbs unexpectedly means the rejection rules have drifted.
    rejected: int = 0
    #: Pages this reader declined, and why — « page 318, a table ». Rule 3:
    #: what was not read is part of the answer, and a document reported as
    #: « 40 figures » when 300 pages of it were skipped is the coverage
    #: line lying by omission.
    skipped: list[tuple[int, str]] = field(default_factory=list)


def _decimals(digits: str) -> int:
    return len(digits.split(".")[1]) if "." in digits else 0


def parse_number(token: str) -> tuple[Decimal, int, str] | None:
    """Turn « $48.9mm » into (48.9, 1, "currency"), or None.

    Returns the value in the model's units: currency in millions, a
    percentage as a fraction, a multiple as a plain number. Doing the
    conversion here rather than at comparison time means there is one place
    where « mm » means millions.
    """
    match = NUMBER.fullmatch(token.strip())
    if match is None:
        return None

    digits = match.group("digits").replace(",", "")
    if not digits:
        return None

    value = Decimal(digits)
    decimals = _decimals(digits)

    scale = (match.group("scale") or "").lower()
    suffix = match.group("suffix") or ""
    currency = match.group("currency")

    if suffix == "%":
        return value / 100, decimals, "percent"
    if suffix.lower() == "x":
        return value, decimals, "multiple"

    if scale:
        value = value * SCALES.get(scale, Decimal(1))
    if match.group("open"):
        value = -value

    return value, decimals, "currency" if currency else "plain"


@dataclass(frozen=True)
class Found:
    """A figure located in a run of text, with where it sits in that text."""

    printed: str
    value: Decimal
    decimals: int
    kind: str
    #: Offsets into the text it was found in, so the words on either side
    #: can be read as the label for this figure and not for its neighbour.
    start: int
    end: int
    parenthesised: bool = False


def figures_in(text: str) -> list[Found]:
    """Every figure in a run of text, in order."""
    found: list[Found] = []
    for match in NUMBER.finditer(text):
        token = match.group(0).strip()
        if not token or NOT_A_FIGURE.match(token):
            continue
        # A bare integer with no currency, scale or suffix is far more
        # often a year, a count or a slide number than a figure worth
        # reconciling. Requiring one of those marks is the single biggest
        # source of precision in this extractor.
        if not (
            match.group("currency")
            or match.group("scale")
            or match.group("suffix")
            or "." in match.group("digits")
            or "," in match.group("digits")
        ):
            continue
        parsed = parse_number(token)
        if parsed is None:
            continue
        value, decimals, kind = parsed
        # `match.group(0)` can carry leading whitespace the strip removed;
        # offsets must point at the token as printed, not at the match.
        start = match.start() + match.group(0).index(token[0])
        found.append(
            Found(
                printed=token,
                value=value,
                decimals=decimals,
                kind=kind,
                start=start,
                end=start + len(token),
                parenthesised=bool(match.group("open")),
            )
        )
    return found


__all__ = [
    "NOT_A_FIGURE",
    "NUMBER",
    "Extraction",
    "Figure",
    "Found",
    "figures_in",
    "parse_number",
]
