"""Reading the Cascade deck: which words end up naming which number.

These run against the real `.pptx`, because every one of them is a case
that a synthetic fixture would have got right and PowerPoint did not.
"""

from pathlib import Path

import pytest

from polar.tieout.deck import read_deck

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"


@pytest.fixture(scope="module")
def figures() -> list:
    return read_deck(str(CASCADE / "cascade_deck.pptx")).figures


def label_for(figures: list, slide: int, printed: str, context: str = "") -> str:
    for figure in figures:
        if figure.slide == slide and figure.printed == printed:
            if not context or context in figure.context:
                return figure.label
    raise AssertionError(f"no {printed} on slide {slide}")


def test_a_metric_tile_is_named_by_the_caption_above_it(figures: list) -> None:
    assert label_for(figures, 2, "$228.9mm") == "FY2025A revenue"
    assert label_for(figures, 2, "$48.9mm", "$48.9mm") == "FY2025A adjusted EBITDA"


def test_a_tiles_subtext_borrows_the_caption_and_keeps_its_own_words(
    figures: list,
) -> None:
    """« 21.4% margin » under « FY2025A adjusted EBITDA » is the margin,
    not the EBITDA. Neither half of that label is enough on its own."""
    assert label_for(figures, 2, "21.4%") == "FY2025A adjusted EBITDA margin"
    assert label_for(figures, 2, "11.8%") == "FY2025A revenue year-on-year"


def test_a_slide_title_is_context_and_never_a_caption(figures: list) -> None:
    """« Adjusted EBITDA bridge » sits directly above « FY2025A reported
    EBITDA of $41.2mm ». Read as a caption it makes the reported figure
    claim to be the adjusted one, which is a $7.7mm false positive."""
    assert label_for(figures, 4, "$41.2mm") == "FY2025A reported EBITDA of"
    assert "bridge" not in label_for(figures, 4, "$41.2mm").lower()


def test_each_figure_in_a_sentence_gets_its_own_clause(figures: list) -> None:
    callout = "Applying the peer median"
    assert label_for(figures, 6, "9.9x", callout) == "Applying the peer median of"
    assert (
        label_for(figures, 6, "$48.9mm", callout)
        == "to Cascade's FY2025A adjusted EBITDA of"
    )
    assert label_for(figures, 6, "$484mm", callout) == "implies an enterprise value of"


def test_a_name_that_follows_its_figure_does_not_bind_to_the_next_one(
    figures: list,
) -> None:
    """« ... 9.8% WACC, 2.5% terminal growth ». The words before 2.5% are
    the tail of the WACC's name; reading across the comma says the WACC is
    2.5%, which is a finding on a page that is correct."""
    line = "Five-year management plan"
    assert label_for(figures, 8, "9.8%", line) == "Discounted cash flow WACC"
    assert label_for(figures, 8, "2.5%", line) == "Discounted cash flow terminal growth"


def test_a_table_cell_is_named_by_its_row_and_its_column(figures: list) -> None:
    assert label_for(figures, 6, "9.7x") == "Mean EV / EBITDA"
    assert label_for(figures, 3, "41.2") == "Reported EBITDA FY2025A"


def test_a_derived_row_belongs_to_the_line_item_above_it(figures: list) -> None:
    """Slide 3 prints « % margin » twice — 38.2% under gross profit and
    21.4% under adjusted EBITDA. On its own the label is the same for
    both."""
    assert label_for(figures, 3, "38.2%") == "Gross profit % margin FY2025A"
    assert label_for(figures, 3, "21.4%") == "Adjusted EBITDA % margin FY2025A"


def test_a_range_is_marked_at_both_ends(figures: list) -> None:
    ends = [f for f in figures if f.slide == 8 and f.printed in ("$455mm", "$528mm")]
    assert len(ends) == 2
    assert all(f.range_endpoint for f in ends)


def test_the_sensitivity_grid_never_becomes_a_figure(figures: list) -> None:
    """Slide 7's grid holds nine bare integers — 497, 528, 462 … — none of
    which is anybody's enterprise value. They are rejected for having no
    currency, scale, suffix or decimal, before any label is built."""
    printed = {f.printed for f in figures if f.slide == 7}
    assert not printed & {"497", "528", "565", "462", "489", "521", "431", "455", "483"}


def test_a_chart_is_read_for_its_series(figures: list) -> None:
    """A chart's numbers live in an embedded workbook part, not on the
    slide, and they are not always what the table beside them says."""
    chart = [f for f in figures if "chart series" in f.location and f.slide == 3]
    assert {f.printed for f in chart} >= {"182.4", "204.7", "228.9", "37.8", "43.0"}
    assert any(f.label == "Adjusted EBITDA FY2023A" for f in chart)


def test_a_chart_series_keeps_the_precision_it_carries(figures: list) -> None:
    """43.0 is a claim about one decimal. Normalising it to 43 makes the
    finding read « 43 should be 40 » about a model that says 39.6."""
    point = next(
        f for f in figures if f.slide == 3 and f.label == "Adjusted EBITDA FY2024A"
    )
    assert point.printed == "43.0"
    assert point.decimals == 1


def test_a_bridge_chart_is_named_by_its_category(figures: list) -> None:
    """Slide 4's waterfall has one series, FY2025A, and its categories are
    the line items — so the label is a period and a line item, the same
    shape a table cell's is."""
    bridge = {f.label: f.printed for f in figures if f.slide == 4 and f.subject}
    assert bridge.get("FY2025A Reported EBITDA") == "41.2"
    assert bridge.get("FY2025A Adjusted EBITDA") == "48.9"
