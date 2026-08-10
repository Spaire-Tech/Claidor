"""Comparing a linked figure against the cell behind it.

By the time anything gets here the hard decision has been made — see
:mod:`polar.tieout.link`. What remains is arithmetic, and one judgement
inside it: **at what precision.**

The deck prints `9.9x`. The model holds 9.90401938065649. Comparing those
as they stand fails on every figure in every deck ever built. Rounding
both to two decimals lets `10.4x` through as close enough to `9.9x`. The
only comparison that means anything is at the precision the deck itself
chose: a figure printed to one decimal is a claim about one decimal, and
that claim is either true or it is not.

So `$48.9mm` against 48.90123 agrees, `$49.6mm` against 48.90123 does not,
and neither answer depends on a tolerance anybody had to pick.
"""

from dataclasses import dataclass, field
from decimal import Decimal

from .deck import read_deck
from .figures import Figure
from .link import Link, Unlinked, link
from .model import Output, read_outputs


@dataclass(frozen=True)
class Drift:
    """A printed figure that does not agree with the cell behind it."""

    slide: int
    #: As it appears on the slide.
    printed: str
    #: What the model's value rounds to, at the precision the deck printed.
    #: Deliberately not the model's full value: « should read 9.9x » is
    #: actionable and « should read 9.90401938065649 » is not.
    expected: str
    #: The output row, so the chain can be followed back.
    ref: str
    name: str
    source: str
    basis: str
    location: str
    #: The line as printed, so a finding can quote the deck to itself.
    context: str
    #: How confident the link was. A drift found on a link that only just
    #: cleared the threshold deserves to be read differently from one on a
    #: label that names its output outright.
    confidence: float


@dataclass
class TieOut:
    drifts: list[Drift] = field(default_factory=list)
    #: Figures that were linked and agree. The number that says whether
    #: silence means « checked and fine » or « never looked ».
    agreed: list[Link] = field(default_factory=list)
    #: Figures deliberately not reconciled, with the reason for each.
    unlinked: list[Unlinked] = field(default_factory=list)

    @property
    def checked(self) -> int:
        return len(self.drifts) + len(self.agreed)


def _format(value: Decimal, figure_kind: str, printed: str) -> str:
    """The model's value, dressed the way the deck dressed its own."""
    text = f"{value:f}"
    if figure_kind == "percent":
        return f"{text}%"
    if figure_kind == "multiple":
        return f"{text}x"
    prefix = printed[0] if printed[:1] in ("$", "€", "£") else ""
    suffix = ""
    for scale in ("mm", "bn", "m", "k"):
        if printed.lower().endswith(scale):
            suffix = printed[-len(scale) :]
            break
    return f"{prefix}{text}{suffix}"


def compare(links: list[Link]) -> tuple[list[Drift], list[Link]]:
    drifts: list[Drift] = []
    agreed: list[Link] = []

    for item in links:
        figure = item.figure
        printed = figure.printed_value_at_precision()
        expected = figure.as_printed_precision(item.output.value)
        if figure.parenthesised:
            # « Less: total debt ... (96.4) » against a model holding
            # +96.4. The parentheses say the figure is subtracted at this
            # point in the bridge; they are not a claim that the cell is
            # negative, and every bridge in every deck is built that way.
            # Sign is checked on figures the deck printed with a sign.
            printed, expected = abs(printed), abs(expected)
        if printed == expected:
            agreed.append(item)
            continue
        drifts.append(
            Drift(
                slide=figure.slide,
                printed=figure.printed,
                expected=_format(expected, figure.kind, figure.printed),
                ref=item.output.ref,
                name=item.output.name,
                source=item.output.source,
                basis=item.output.basis,
                location=figure.location,
                context=figure.context,
                confidence=item.score,
            )
        )
    return drifts, agreed


def tie_out(deck_path: str, model_path: str) -> TieOut:
    """Reconcile every figure in a deck against the model's Outputs tab."""
    return tie_out_against(read_deck(deck_path).figures, read_outputs(model_path))


def tie_out_against(figures: list[Figure], outputs: list[Output]) -> TieOut:
    links, unlinked = link(figures, outputs)
    drifts, agreed = compare(links)
    return TieOut(drifts=drifts, agreed=agreed, unlinked=unlinked)


__all__ = ["Drift", "TieOut", "compare", "tie_out", "tie_out_against"]
