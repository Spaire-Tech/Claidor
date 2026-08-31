"""C5 — the deck delta, on fabricated tie-outs where truth is known.

The class that carries the promise is `broken_by_revision`; the one
that makes it trustworthy is `still_drifting`, which keeps a deck's
pre-existing disagreements off the revision's account. Both are
pinned here, along with the attribution that names the model change
underneath a break.
"""

from decimal import Decimal

from polar.tieout.check import Drift, TieOut
from polar.tieout.figures import Figure
from polar.tieout.link import Link
from polar.tieout.provenance import Output
from polar.tieout.watch import compare_tieouts
from polar.tieout.watch.delta import DeltaItem, DeltaReport
from polar.tieout.watch.document import attribute


def figure(slide: int, printed: str, location: str) -> Figure:
    return Figure(
        printed=printed,
        value=Decimal("48.9"),
        decimals=1,
        kind="currency",
        slide=slide,
        label="Adjusted EBITDA",
        location=location,
    )


def agreed(slide: int, printed: str, location: str, ref: str) -> Link:
    return Link(
        figure=figure(slide, printed, location),
        output=Output(
            ref=ref,
            name="Adjusted EBITDA",
            value=Decimal("48.9"),
            source="Outputs",
            basis="",
        ),
        score=0.9,
        runner_up=0.1,
    )


def drift(slide: int, printed: str, location: str, *, one_tick: bool = False) -> Drift:
    return Drift(
        slide=slide,
        printed=printed,
        expected="51.2",
        ref="Model!D26",
        name="Adjusted EBITDA",
        source="Outputs",
        basis="",
        location=location,
        anchor={},
        context="",
        confidence=0.9,
        one_tick=one_tick,
    )


EMPTY = DeltaReport(old="old", new="new")


class TestTheFourClasses:
    def test_agreed_then_drifting_is_the_finding(self) -> None:
        before = TieOut(agreed=[agreed(3, "$48.9mm", "body", "Model!D26")])
        after = TieOut(drifts=[drift(3, "$48.9mm", "body")])
        result = compare_tieouts(before, after, EMPTY)
        assert result.summary["broken_by_revision"] == 1
        assert result.summary["still_drifting"] == 0
        assert result.broken[0].old_ref == "Model!D26"
        assert result.broken[0].expected == "51.2"

    def test_a_pre_existing_drift_is_never_blamed_on_the_revision(self) -> None:
        """The discipline that makes the finding trustworthy."""
        before = TieOut(drifts=[drift(4, "9.9x", "tile")])
        after = TieOut(drifts=[drift(4, "9.9x", "tile")])
        result = compare_tieouts(before, after, EMPTY)
        assert result.summary["still_drifting"] == 1
        assert result.summary["broken_by_revision"] == 0

    def test_the_revision_coming_to_the_deck_is_its_own_class(self) -> None:
        before = TieOut(drifts=[drift(5, "12.0%", "body")])
        after = TieOut(agreed=[agreed(5, "12.0%", "body", "Model!D30")])
        result = compare_tieouts(before, after, EMPTY)
        assert result.summary["repaired_by_revision"] == 1
        assert result.summary["broken_by_revision"] == 0

    def test_losing_sight_of_a_figure_is_not_breaking_it(self) -> None:
        """Its output row was deleted or renamed: reported apart, and
        never counted as a break."""
        before = TieOut(agreed=[agreed(6, "$96.4mm", "table", "Model!D40")])
        after = TieOut()
        result = compare_tieouts(before, after, EMPTY)
        assert result.summary["coverage_changed"] == 1
        assert result.summary["broken_by_revision"] == 0

    def test_a_rounding_tick_is_labelled_not_hidden(self) -> None:
        before = TieOut(agreed=[agreed(7, "18.6%", "body", "Model!D50")])
        after = TieOut(drifts=[drift(7, "18.6%", "body", one_tick=True)])
        result = compare_tieouts(before, after, EMPTY)
        assert result.broken[0].one_tick is True


class TestAttribution:
    REPORT = DeltaReport(
        old="old",
        new="new",
        items=[
            DeltaItem(
                kind="moved_assumption",
                sheet="Model",
                first_row=26,
                last_row=27,
                columns=("D",),
                detail="100 → 120",
            )
        ],
    )

    def test_a_break_names_the_change_underneath_it(self) -> None:
        assert "moved assumption" in attribute("Model!D26", self.REPORT)
        assert "100 → 120" in attribute("Model!D27", self.REPORT)

    def test_a_row_the_delta_never_mentions_gets_no_cause(self) -> None:
        """« I do not know » is an answer; the nearest change is not."""
        assert attribute("Model!D99", self.REPORT) == ""
        assert attribute("Other!D26", self.REPORT) == ""

    def test_structure_items_are_not_offered_as_causes(self) -> None:
        report = DeltaReport(
            old="old",
            new="new",
            items=[
                DeltaItem(
                    kind="structure",
                    sheet="Model",
                    first_row=26,
                    last_row=26,
                    detail="inserted rows",
                )
            ],
        )
        assert attribute("Model!D26", report) == ""

    def test_the_break_carries_its_cause_through_the_comparison(self) -> None:
        before = TieOut(agreed=[agreed(3, "$48.9mm", "body", "Model!D26")])
        after = TieOut(drifts=[drift(3, "$48.9mm", "body")])
        result = compare_tieouts(before, after, self.REPORT)
        assert "moved assumption" in result.broken[0].cause
