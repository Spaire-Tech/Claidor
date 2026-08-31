"""Parsing a declared unit: the scale ladder and the non-unit class.

Build items (c) and (g). What a units column *says*, turned into the
dimensions E1 labelled — or refused, which is a real answer.

Two things the research (`corpus-sources.md`, 28 Aug fourth
addendum) makes non-negotiable:

- **The scale ladder is wider than our corpus.** `$MM`, `$K`,
  `USD Billions`, and the non-Western `crore` (10,000,000), `lakh`
  (100,000), `千`, `百万`. One Indian model puts `Lakh/MW/year` and
  `Cr/year` three rows apart — a 100× step with no currency symbol
  on either.
- **Units columns contain things that are not units.** `Choice`,
  `Index`, `Check`, `[1,0]`, `Toggle YES/NO` in their corpus;
  `Flag`, `Factor`, `Date` in ours. They are declarations and they
  must **never enter dimensional arithmetic**, so they come back as
  a refusal that says why, not as a unit and not as silence.
"""

import re
from dataclasses import dataclass

#: Scale words to the multiplier they name. Order matters when
#: matching: the longest name is tried first so `billion` is not
#: read as `b`.
SCALE_WORDS: tuple[tuple[str, str], ...] = (
    ("billions", "billions"),
    ("billion", "billions"),
    ("millions", "millions"),
    ("million", "millions"),
    ("thousands", "thousands"),
    ("thousand", "thousands"),
    ("crore", "crore"),
    ("lakh", "lakh"),
    ("百万", "millions"),
    ("千", "thousands"),
    ("'000s", "thousands"),
    ("'000", "thousands"),
    ("000s", "thousands"),
    ("bn", "billions"),
    ("mm", "millions"),
    ("cr", "crore"),
)

#: Single letters, only ever read immediately after a currency sign
#: — `£m`, `$K`. A bare `m` in prose is metres, months or nothing.
SCALE_LETTERS = {"m": "millions", "k": "thousands", "b": "billions"}

CURRENCIES = (("£", "GBP"), ("$", "USD"), ("€", "EUR"), ("¥", "JPY"), ("₹", "INR"))

#: Currency **codes**, because « USD Billions » carries no sign and
#: was read as a scale with no currency until this was added.
CURRENCY_CODES = re.compile(
    r"(?<![A-Za-z])(gbp|usd|eur|jpy|inr|aud|cad|chf|nzd|zar|sgd|hkd)(?![A-Za-z])",
    re.I,
)

#: A percentage **value** rather than a percentage unit:
#: « Indexing at 0% », « 3% inflation ». The research lists these
#: among the non-units found inside real units columns; a digit
#: attached to the sign is what separates a qualifier from a unit.
PERCENT_QUALIFIER = re.compile(r"\d\s*%")

#: Declared, and not a unit. Never dimensional.
NON_UNIT = re.compile(
    r"^\[?\s*(flag|factor|date|text|number|numeric|choice|index|check|toggle"
    r"|yes\s*/\s*no|y\s*/\s*n|true\s*/\s*false|boolean|bool|n/?a|switch"
    r"|selector|list|scalar|0\s*,\s*1|1\s*,\s*0)"
    # A switch often names its own states: « Toggle YES/NO » was
    # refused as unparseable until this suffix was allowed.
    r"(\s*[:\-]?\s*(yes\s*/\s*no|y\s*/\s*n|1\s*/\s*0|0\s*/\s*1|true/false))?"
    r"\s*\]?$",
    re.I,
)


@dataclass(frozen=True)
class Parsed:
    """A declaration read, or refused with its reason."""

    kind: str = "unknown"
    b5_type: str = "untyped"
    currency: str = "unknown"
    scale: str = "unknown"
    period: str = "unknown"
    rate_form: str = "unknown"
    #: True when the text is a declaration that is not a unit — a
    #: switch, a flag, a date marker. Excluded from any dimensional
    #: check, and counted rather than dropped.
    not_a_unit: bool = False
    #: True when the text declares something this parser cannot read.
    unparseable: bool = False
    why: str = ""


def _scale_in(text: str) -> str | None:
    for word, scale in SCALE_WORDS:
        if word in text:
            return scale
    return None


def parse_declaration(text: str, number_formats: tuple[str, ...] = ()) -> Parsed:
    """One units-column entry, read into dimensions or refused.

    `number_formats` is consulted **only** for the percent
    convention, which the text alone cannot decide (build item a).
    """
    from .inference import percent_convention

    stripped = (text or "").strip()
    if not stripped:
        return Parsed(unparseable=True, why="empty")
    lowered = stripped.lower()

    if NON_UNIT.match(lowered):
        return Parsed(
            kind="categorical",
            not_a_unit=True,
            why=f"« {stripped} » is a declaration and not a unit — never dimensional",
        )

    code = CURRENCY_CODES.search(stripped)
    currency = next((c for sign, c in CURRENCIES if sign in stripped), None)
    if currency is None and code:
        currency = code.group(1).upper()
    if currency:
        scale = _scale_in(lowered)
        if scale is None:
            sign = next(s for s, c in CURRENCIES if s in stripped)
            after = lowered[lowered.index(sign.lower()) + len(sign) :].lstrip()
            first = after[:1]
            scale = (
                SCALE_LETTERS.get(first)
                if first in SCALE_LETTERS and not after[1:2].isalpha()
                else None
            )
        # « £/kWh » and « £m / MWh » are prices, not amounts: a rate
        # of currency per something, which is a different dimension
        # from an amount of money.
        # « Date / £m » is a column holding either a date or an
        # amount, not a price of one per the other. A slash is only a
        # price when neither side is itself a non-unit declaration.
        sides = [part.strip() for part in stripped.split("/")]
        if "/" in stripped and any(NON_UNIT.match(part.lower()) for part in sides):
            return Parsed(
                unparseable=True,
                why=f"« {stripped} » puts a declaration and a unit in one "
                "entry; which applies to a row is not stated",
            )
        if "/" in stripped:
            return Parsed(
                kind="continuous",
                b5_type="rate",
                currency=currency,
                scale=scale or "units",
                period="unknown",
                rate_form="not-a-rate",
                why=f"« {stripped} » is a price: {currency} per something",
            )
        return Parsed(
            kind="continuous",
            b5_type="money",
            currency=currency,
            scale=scale or "units",
            period="annual" if "annual" in lowered else "unknown",
            rate_form="not-a-rate",
            why=f"« {stripped} » declares {currency}"
            + (f" in {scale}" if scale else " with no scale stated"),
        )

    if PERCENT_QUALIFIER.search(stripped):
        return Parsed(
            not_a_unit=True,
            kind="continuous",
            why=f"« {stripped} » names a percentage *value*, not a unit — "
            "a qualifier like « 3% inflation », never dimensional",
        )

    if "%" in stripped:
        return Parsed(
            kind="continuous",
            b5_type="rate",
            currency="none",
            scale="units",
            period="annual" if "annual" in lowered or "p.a" in lowered else "none",
            rate_form=percent_convention(number_formats, stripped),
            why=f"« {stripped} » declares a percentage",
        )

    scale = _scale_in(lowered)
    if scale is not None:
        return Parsed(
            kind="continuous",
            b5_type="unknown-quantity",
            currency="unknown",
            scale=scale,
            why=f"« {stripped} » names a scale but no currency — "
            "the Indian models put « Lakh/MW/year » and « Cr/year » "
            "three rows apart with no sign on either",
        )

    return Parsed(
        unparseable=True,
        why=f"« {stripped} » is declared and this parser cannot read it",
    )
