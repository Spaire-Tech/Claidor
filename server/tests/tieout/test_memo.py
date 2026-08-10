"""Reading a memo, and reconciling it against the model it quotes.

A memo is the document most likely to have been written first and updated
last. Nobody re-reads the committee paper when the model moves, which is
exactly why checking it is worth doing — and why the fixture pair here is
a stale memo rather than a typo hunt.

The numbers are exact on purpose. A test that asserts « some drifts » does
not notice the day the reader starts finding twice as many.
"""

from pathlib import Path

import pytest

from polar.tieout.check import tie_out_against
from polar.tieout.memo import read_memo, read_memo_text
from polar.tieout.prose import name_figures
from polar.tieout.provenance import outputs_from_workbook
from polar.tieout.workbook import read_workbook

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
MEMO = str(CASCADE / "cascade_memo.docx")
STALE = str(CASCADE / "cascade_memo_stale.docx")
MODEL = str(CASCADE / "cascade_model.xlsx")


@pytest.fixture(scope="module")
def outputs():
    return outputs_from_workbook(read_workbook(MODEL))


class TestReadingAMemo:
    def test_every_figure_in_the_paper_is_found(self) -> None:
        extraction = read_memo(MEMO)
        printed = [figure.printed for figure in extraction.figures]
        assert printed == [
            "$228.9mm",
            "11.8%",
            "$96.4mm",
            "$21.7mm",
            "42.8mm",
            "9.8%",
            "2.5%",
        ]

    def test_a_memo_has_paragraphs_where_a_deck_has_slides(self) -> None:
        """Pagination is a rendering decision Word makes at print time.

        The file does not carry page numbers, so inventing one would send
        the panel to a page that does not exist. Zero says « no page ».
        """
        for figure in read_memo(MEMO).figures:
            assert figure.slide == 0
            assert figure.location.startswith("paragraph ")

    def test_headings_become_the_section_below_them(self) -> None:
        by_printed = {one.printed: one for one in read_memo(MEMO).figures}
        assert by_printed["$228.9mm"].section == "2 FINANCIAL PERFORMANCE"
        assert by_printed["9.8%"].section == "3 VALUATION"

    def test_a_figure_carries_what_the_panel_needs_to_find_it(self) -> None:
        """Word has no shape ids, and a paragraph index in a document
        somebody is editing is stale by the time it is used. The printed
        figure is stable, and « which occurrence » disambiguates it."""
        anchors = [one.anchor for one in read_memo(MEMO).figures]
        assert all(one["kind"] == "paragraph" for one in anchors)
        assert all(one["text"] for one in anchors)
        assert all(one["occurrence"] >= 1 for one in anchors)

    def test_the_same_text_reads_the_same_way_from_the_open_document(self) -> None:
        """The panel checks the memo open in Word, where the text comes
        over Office.js and there is no file. Two extractions that differ
        by one character put every finding in the wrong place."""
        from polar.redline.ooxml import Package

        text = Package.open(Path(MEMO).read_bytes()).read().text
        assert [one.printed for one in read_memo_text(text).figures] == [
            one.printed for one in read_memo(MEMO).figures
        ]


class TestNamingAFigureInProse:
    def test_the_clause_before_names_it(self) -> None:
        named = name_figures("the discounted cash flow is run at a WACC of 9.8%")
        assert named[0].label == "the discounted cash flow is run at a WACC of"

    def test_a_name_does_not_reach_across_a_comma(self) -> None:
        """« 9.8% WACC, 2.5% terminal growth » puts each name *after* its
        figure, so reading across the comma swaps the two round."""
        named = name_figures("management plan, 9.8% WACC, 2.5% terminal growth")
        assert named[0].label == "WACC"
        assert named[1].label == "terminal growth"

    def test_of_binds_the_noun_that_follows(self) -> None:
        """« generated $228.9mm of revenue » — the words before name
        nothing, and English put the noun after the number."""
        named = name_figures("The business generated $228.9mm of revenue in FY2025A")
        assert named[0].label == "The business generated of revenue in FY2025A"

    def test_two_figures_on_two_bases_are_named_apart(self) -> None:
        """The failure the whole design exists to prevent: one label for
        both would reconcile the reported figure against the adjusted cell."""
        named = name_figures("FY2025A reported EBITDA of $41.2mm adjusts to $48.9mm")
        assert "reported" in named[0].label
        assert "reported" not in named[1].label

    def test_the_ends_of_a_range_are_marked(self) -> None:
        named = name_figures("a reference range of $455mm to $528mm")
        assert [one.range_endpoint for one in named] == [True, True]


class TestTyingAMemoOut:
    def test_a_memo_that_matches_the_model_reports_nothing(self, outputs) -> None:
        """The good outcome, and the one that has to be silent."""
        result = tie_out_against(read_memo(MEMO).figures, outputs)
        assert result.drifts == []
        assert len(result.agreed) == 4

    def test_a_memo_written_against_an_older_model_is_caught(self, outputs) -> None:
        result = tie_out_against(read_memo(STALE).figures, outputs)
        found = {(one.printed, one.expected) for one in result.drifts}
        assert found == {("$235.3mm", "$228.9mm"), ("10.2%", "9.8%")}

    def test_what_it_could_not_check_says_why(self, outputs) -> None:
        """Three of seven go unlinked and each gives a reason. An
        unmatched figure is never a finding and is never hidden either."""
        result = tie_out_against(read_memo(MEMO).figures, outputs)
        assert len(result.unlinked) == 3
        assert all(one.reason for one in result.unlinked)
