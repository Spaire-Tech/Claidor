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

from dataclasses import dataclass, field, replace
from decimal import Decimal
from typing import Any

from .deck import read_deck
from .figures import Figure
from .link import Link, Unlinked, link
from .model import Output, OutputsMissing, read_outputs
from .provenance import outputs_from_workbook, verify_outputs
from .workbook import Workbook, read_workbook


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
    #: The same position in coordinates a host application can act on, so
    #: a panel can select the shape rather than describe it.
    anchor: dict[str, Any]
    #: The line as printed, so a finding can quote the deck to itself.
    context: str
    #: How confident the link was. A drift found on a link that only just
    #: cleared the threshold deserves to be read differently from one on a
    #: label that names its output outright.
    confidence: float
    #: True when the deck and the model differ by exactly one unit at the
    #: printed precision — 18.6% against 18.655%, which rounds to 18.7%.
    #: Almost always a rounding convention rather than a wrong number, and
    #: it still is a difference: a banker asked whether the deck is right
    #: deserves both the answer and the distinction, not one of them.
    one_tick: bool = False


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
        quantum = Decimal(1).scaleb(-figure.decimals)
        drifts.append(
            Drift(
                one_tick=abs(printed - expected) == quantum,
                slide=figure.slide,
                printed=figure.printed,
                expected=_format(expected, figure.kind, figure.printed),
                ref=item.output.ref,
                name=item.output.name,
                source=item.output.source,
                basis=item.output.basis,
                location=figure.location,
                anchor=figure.anchor,
                context=figure.context,
                confidence=item.score,
            )
        )
    return drifts, agreed


def tie_out(deck_path: str, model_path: str) -> TieOut:
    """Reconcile a deck against the model, twice, and merge.

    The two passes see different things and neither subsumes the other, so
    running one of them is a choice to be blind to what the other finds.

    **Against the Outputs tab.** Two dozen figures the model publishes,
    named by whoever built it, with a stated basis. High confidence and
    narrow: on Cascade it reconciles 34 of 100 printed figures.

    **Against the whole workbook.** Every numeric cell, named from the row
    and column labels beside it. It reconciles 80 of the same 100 — and on
    the *clean* Cascade deck it finds six figures that disagree with the
    model, every one of them verified by hand, none of them injected, and
    not one of them published on the Outputs tab. A checker that only
    reads the interface can only check what the interface exposes.

    The Outputs pass wins where both fire, because a figure the model
    publishes is named by a human and carries a basis, and a finding that
    quotes `O5 FY2025A adjusted EBITDA (Adjusted - see bridge)` reads
    better than one quoting `Model!D26`.
    """
    figures = read_deck(deck_path).figures
    book = read_workbook(model_path)

    published: list[Output] = []
    try:
        published = repair(read_outputs(model_path), book)
    except OutputsMissing:
        # The common case in the wild, and the reason the second pass
        # exists. Nothing to merge; the workbook carries it alone.
        pass

    from_workbook = tie_out_against(figures, outputs_from_workbook(book))
    if not published:
        return from_workbook

    from_outputs = tie_out_against(figures, published)
    seen = {_where(drift) for drift in from_outputs.drifts}
    checked = {
        (link.figure.slide, link.figure.location, link.figure.printed)
        for link in from_outputs.agreed
    }

    return TieOut(
        drifts=from_outputs.drifts
        + [
            drift
            for drift in from_workbook.drifts
            if _where(drift) not in seen
            and (drift.slide, drift.location, drift.printed) not in checked
        ],
        agreed=from_outputs.agreed
        + [
            link
            for link in from_workbook.agreed
            if (link.figure.slide, link.figure.location, link.figure.printed)
            not in checked
        ],
        unlinked=from_workbook.unlinked,
    )


def _where(drift: Drift) -> tuple[int, str, str]:
    return (drift.slide, drift.location, drift.printed)


def repair(outputs: list[Output], book: Workbook) -> list[Output]:
    """Outputs rows, with stale source references pointed at the real cell.

    Four of Cascade's twenty-three point one row above the figure they
    name. The values are right, so this changes no finding's arithmetic —
    it changes where the finding sends the reader, which is the difference
    between an answer and a dead end.
    """
    fixed = {
        problem.ref: problem.actual
        for problem in verify_outputs(outputs, book)
        if problem.actual
    }
    if not fixed:
        return outputs
    return [
        replace(output, source=fixed[output.ref]) if output.ref in fixed else output
        for output in outputs
    ]


def tie_out_against(figures: list[Figure], outputs: list[Output]) -> TieOut:
    links, unlinked = link(figures, outputs)
    drifts, agreed = compare(links)
    return TieOut(drifts=drifts, agreed=agreed, unlinked=unlinked)


__all__ = ["Drift", "TieOut", "compare", "tie_out", "tie_out_against"]
