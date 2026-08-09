"""What a screener is shown of an opinion.

Opinions in this corpus average about 192,000 characters. Sending all of
it to answer one yes-or-no question is expensive and adds noise, so the
screener reads the opening plus the passages where the doctrine is
actually discussed.

That is a coverage decision, and coverage decisions are how a corpus
quietly acquires blind spots. Hence tests: if the excerpter stops finding
the passage that decides the case, the screening numbers degrade and
nothing else announces it.
"""

from polar.registry.doctrines import TX_EXPRESS_NEGLIGENCE
from polar.registry.excerpt import MAX_CHARS, MAX_WINDOWS, excerpt_for

QUERIES = TX_EXPRESS_NEGLIGENCE.queries

FILLER = "Procedural history and unrelated points of appeal. " * 400
HOLDING = (
    "We hold the indemnity provision fails the express negligence test "
    "because it nowhere states that Page indemnifies Dresser against "
    "Dresser's own negligence."
)


class TestFindingTheRelevantPassage:
    def test_the_holding_is_included(self) -> None:
        text = FILLER + HOLDING + FILLER
        piece = excerpt_for(text, QUERIES)

        assert "express negligence test" in piece.text
        assert piece.windows >= 1

    def test_the_opening_is_always_shown(self) -> None:
        # The caption and first lines say what kind of decision this is —
        # a merits judgment, a rehearing, an order. The screener needs that
        # even when the doctrine is discussed 100,000 characters later.
        text = "IN THE COURT OF APPEALS, Second District" + FILLER + HOLDING
        piece = excerpt_for(text, QUERIES)

        assert piece.text.startswith("IN THE COURT OF APPEALS")

    def test_unrelated_bulk_is_left_out(self) -> None:
        text = FILLER + HOLDING + FILLER
        piece = excerpt_for(text, QUERIES)

        assert len(piece.text) < len(text) / 2
        assert piece.coverage < 1.0

    def test_several_discussions_are_all_carried(self) -> None:
        text = (
            "OPINION"
            + FILLER
            + "the express negligence doctrine requires specificity"
            + FILLER
            + HOLDING
            + FILLER
            + "conspicuous under Dresser"
            + FILLER
        )
        piece = excerpt_for(text, QUERIES)
        assert piece.windows >= 2

    def test_adjacent_passages_merge_into_one(self) -> None:
        # A densely-argued page should read continuously, not as the same
        # sentences repeated once per matched phrase.
        text = "OPEN" + FILLER + (HOLDING + " " + HOLDING) + FILLER
        piece = excerpt_for(text, QUERIES)
        assert piece.text.count("nowhere states") <= 2


class TestBudget:
    def test_the_excerpt_stays_within_budget(self) -> None:
        # Anything approaching the whole opinion means the filter failed
        # and we are paying full price for the illusion of one.
        text = (HOLDING + FILLER) * 12
        piece = excerpt_for(text, QUERIES)
        assert len(piece.text) <= MAX_CHARS + 40

    def test_windows_are_capped(self) -> None:
        text = ("express negligence " + FILLER) * 20
        piece = excerpt_for(text, QUERIES)
        assert piece.windows <= MAX_WINDOWS


class TestHonestEdges:
    def test_no_match_still_returns_the_opening(self) -> None:
        # Zero windows is a real answer: the case matched a search phrase
        # somewhere the excerpter cannot locate. The screener should see
        # something and be told it is thin, not receive an empty string.
        text = "IN THE COURT OF APPEALS. " + FILLER
        piece = excerpt_for(text, QUERIES)

        assert piece.windows == 0
        assert piece.text.startswith("IN THE COURT OF APPEALS")

    def test_empty_text_is_empty_not_an_error(self) -> None:
        piece = excerpt_for("", QUERIES)
        assert piece.text == ""
        assert piece.windows == 0
        assert piece.coverage == 0.0

    def test_a_short_opinion_is_shown_whole(self) -> None:
        text = "PER CURIAM. " + HOLDING
        piece = excerpt_for(text, QUERIES)
        assert "nowhere states" in piece.text

    def test_matching_is_case_insensitive(self) -> None:
        text = FILLER + "EXPRESS NEGLIGENCE was not satisfied here." + FILLER
        piece = excerpt_for(text, QUERIES)
        assert piece.windows >= 1
        assert "EXPRESS NEGLIGENCE" in piece.text
