"""C5 — the Watch on documents: model moved, deck did not.

A deck is a claim about a model made at a moment. The model is
revised; the deck is not re-checked, because nobody knows which of
its hundred printed figures the revision touched. This module
answers that: the same deck tied out against both versions, and
the difference between the two results read in review language.

The classes are registered in `docs/pierce/logs/prism.md` (« C5 »)
before any pair produced a number. The one that carries the
product's promise is `broken_by_revision`; the one that makes it
trustworthy is `still_drifting`, which keeps a deck's pre-existing
disagreements off the revision's account.

The engine is a read-only library here: `tie_out` is the engine's,
`delta_of` is this lane's, and nothing below changes either.
"""

from dataclasses import dataclass, field

from polar.tieout.check import TieOut, tie_out
from polar.tieout.workbook import read_workbook

from .delta import DeltaReport, delta_of

#: A printed figure's identity across two runs of the same deck.
#: The deck is byte-identical in both, so where it sits and what it
#: says name it exactly.
Key = tuple[int, str, str]


@dataclass(frozen=True)
class DeckItem:
    """One printed figure, and what the revision did to it."""

    slide: int
    printed: str
    location: str
    #: The output row the figure agreed with *before* the revision —
    #: old-side, which is what makes attribution exact.
    old_ref: str = ""
    #: What the new model says it should read now.
    expected: str = ""
    name: str = ""
    #: True when the disagreement is one unit at the printed
    #: precision — a rounding convention, reported as itself.
    one_tick: bool = False
    #: The model change underneath this break, in the delta report's
    #: own words — or empty, which the report states in words rather
    #: than filling with the nearest change.
    cause: str = ""


@dataclass
class DeckDelta:
    old_model: str
    new_model: str
    deck: str
    #: Agreed before, drifts now — the model moved and the deck did
    #: not. C5's finding.
    broken: list[DeckItem] = field(default_factory=list)
    #: Drifted before, agrees now: the revision came to the deck.
    repaired: list[DeckItem] = field(default_factory=list)
    #: Drifts against both — never this revision's fault.
    still_drifting: list[DeckItem] = field(default_factory=list)
    #: Reconcilable against one version only. « I lost sight of it »
    #: is not « it broke », so it is counted apart.
    coverage_changed: list[DeckItem] = field(default_factory=list)
    checked_old: int = 0
    checked_new: int = 0

    @property
    def summary(self) -> dict[str, int]:
        return {
            "broken_by_revision": len(self.broken),
            "repaired_by_revision": len(self.repaired),
            "still_drifting": len(self.still_drifting),
            "coverage_changed": len(self.coverage_changed),
            "checked_old": self.checked_old,
            "checked_new": self.checked_new,
        }


def _agreed(result: TieOut) -> dict[Key, str]:
    """Key → the output ref it agreed with."""
    return {
        (link.figure.slide, link.figure.printed, link.figure.location): link.output.ref
        for link in result.agreed
    }


def _drifted(result: TieOut) -> dict[Key, object]:
    return {
        (drift.slide, drift.printed, drift.location): drift for drift in result.drifts
    }


def _split_ref(ref: str) -> tuple[str, int] | None:
    """« Model!D26 » → ("Model", 26)."""
    if "!" not in ref:
        return None
    sheet, coordinate = ref.rsplit("!", 1)
    digits = "".join(character for character in coordinate if character.isdigit())
    return (sheet, int(digits)) if digits else None


def attribute(old_ref: str, report: DeltaReport) -> str:
    """The model change under an old-side ref, in the delta's own
    words — or empty. Exact, because both sides are old-side: the
    figure agreed with this row before the revision, and the delta
    report's blocks are keyed on the rows as they were."""
    where = _split_ref(old_ref)
    if where is None:
        return ""
    sheet, row = where
    for item in report.items:
        if item.sheet != sheet or item.kind == "structure":
            continue
        if item.first_row <= row <= item.last_row:
            return f"{item.kind.replace('_', ' ')}: {item.detail}"[:200]
    return ""


def deck_delta(
    old_model: str, new_model: str, deck: str, report: DeltaReport | None = None
) -> DeckDelta:
    """The same deck, against both versions, with every break
    attributed to the model change underneath it."""
    before = tie_out(deck, old_model)
    after = tie_out(deck, new_model)
    if report is None:
        report = delta_of(
            read_workbook(old_model),
            read_workbook(new_model),
            old_name=old_model,
            new_name=new_model,
        )
    return compare_tieouts(before, after, report, old_model, new_model, deck)


def compare_tieouts(
    before: TieOut,
    after: TieOut,
    report: DeltaReport,
    old_model: str = "old",
    new_model: str = "new",
    deck: str = "deck",
) -> DeckDelta:
    agreed_before, agreed_after = _agreed(before), _agreed(after)
    drifted_before, drifted_after = _drifted(before), _drifted(after)
    result = DeckDelta(
        old_model=old_model,
        new_model=new_model,
        deck=deck,
        checked_old=before.checked,
        checked_new=after.checked,
    )

    seen_before = agreed_before.keys() | drifted_before.keys()
    seen_after = agreed_after.keys() | drifted_after.keys()

    for key in sorted(seen_before | seen_after):
        slide, printed, location = key
        drift = drifted_after.get(key) or drifted_before.get(key)
        item = DeckItem(
            slide=slide,
            printed=printed,
            location=location,
            old_ref=agreed_before.get(key, ""),
            expected=getattr(drift, "expected", ""),
            name=getattr(drift, "name", ""),
            one_tick=bool(getattr(drift, "one_tick", False)),
        )
        if key not in seen_before or key not in seen_after:
            result.coverage_changed.append(item)
        elif key in agreed_before and key in drifted_after:
            #: The finding. Attribution uses the *old* ref, which is
            #: the row this figure agreed with before the revision.
            old_ref = agreed_before[key]
            result.broken.append(
                DeckItem(**{**item.__dict__, "cause": attribute(old_ref, report)})
            )
        elif key in drifted_before and key in agreed_after:
            result.repaired.append(item)
        elif key in drifted_before and key in drifted_after:
            result.still_drifting.append(item)
    return result


__all__ = ["DeckDelta", "DeckItem", "attribute", "compare_tieouts", "deck_delta"]
