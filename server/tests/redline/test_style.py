"""House style, checked as self-consistency.

We do not know any firm's rules and inventing some would produce a tool
that argues with a partner about their own house style on the first
document. So the check asks the one question that is answerable from the
text alone: does the document contradict itself?

An agreement writing « 30 June 2026 » in clause 4 and « June 30, 2026 » in
clause 9 is inconsistent whichever form the firm prefers, and nobody chose
it — it arrived when two precedents were spliced together.
"""

from polar.redline import Defect, Severity, review_document
from polar.redline.style import MIN_EXAMPLES, review_style


def _terms(text: str) -> list[str]:
    return [f.term for f in review_style(text)]


class TestDates:
    def test_two_date_formats_are_reported(self) -> None:
        text = (
            "Dated 30 June 2026 for the first closing.\n"
            "The second closing is on June 30, 2026 as agreed.\n"
            "A third date of 1 July 2026 applies.\n"
            "The long stop is 15 August 2026.\n"
        )
        assert _terms(text) == ["dates"]

    def test_one_format_used_throughout_is_not_reported(self) -> None:
        text = (
            "Dated 30 June 2026. Also 1 July 2026. And 15 August 2026, "
            "and 2 September 2026."
        )
        assert _terms(text) == []

    def test_the_minority_form_is_the_one_named(self) -> None:
        # The majority is what the document mostly does. Calling that wrong
        # would be an opinion about the firm's style rather than an
        # observation about the text.
        text = (
            "Dated 30 June 2026. Also 1 July 2026. And 15 August 2026. "
            "But August 20, 2026 for the last one."
        )
        note = review_style(text)[0].note
        assert "Mostly day first" in note
        assert "1 use month first" in note


class TestCurrency:
    def test_mixed_currency_forms_are_reported(self) -> None:
        text = (
            "The Price is $5,000,000 payable at Closing. A further "
            "USD 2,500,000 is payable later. The Escrow is $500,000. "
            "A retention of $250,000 applies."
        )
        assert _terms(text) == ["currency amounts"]

    def test_a_consistent_document_is_not_reported(self) -> None:
        text = (
            "The Price is $5,000,000. The Escrow is $500,000. A retention "
            "of $250,000 applies."
        )
        assert _terms(text) == []

    def test_three_forms_are_described_as_three(self) -> None:
        # Saying « two ways » when there are three is a small lie a reader
        # notices immediately.
        text = (
            "The Price is $5,000,000. A further USD 2,500,000 later. The "
            "Escrow is $500,000. The fee of 250,000 dollars is due."
        )
        assert "three ways" in review_style(text)[0].note


class TestQuotationMarks:
    def test_mixed_quote_styles_are_reported(self) -> None:
        text = 'A “curly” one, another “curly” one, and a "straight" one.'
        assert _terms(text) == ["quotation marks"]

    def test_one_style_throughout_is_not_reported(self) -> None:
        assert _terms("A “curly” one, another “curly” one, a “third” one.") == []


class TestNumbering:
    def test_mixing_bare_and_worded_numbering_is_reported(self) -> None:
        text = (
            "4.1 The Seller shall sell.\n"
            "4.2 The Buyer shall buy.\n"
            "4.3 Payment is due.\n"
            "Section 5.1 Termination applies.\n"
        )
        assert _terms(text) == ["clause numbering"]

    def test_consistent_numbering_is_not_reported(self) -> None:
        text = "4.1 The Seller sells.\n4.2 The Buyer buys.\n4.3 Payment is due.\n"
        assert _terms(text) == []


class TestNotEnoughToHaveAStyle:
    def test_a_document_with_too_few_examples_is_left_alone(self) -> None:
        # Two forms once each is a document too short to have a style, not
        # a document that is inconsistent.
        text = "Dated 30 June 2026 and also June 30, 2026."
        assert _terms(text) == []

    def test_the_threshold_is_the_documented_one(self) -> None:
        assert MIN_EXAMPLES == 3


class TestHowItIsReported:
    def test_one_finding_per_pattern_not_per_occurrence(self) -> None:
        # A document with two hundred dates in two formats has one problem.
        # Reporting it two hundred times would bury everything else.
        text = "Dated 30 June 2026. " * 100 + "Also June 30, 2026. " * 100
        assert len(review_style(text)) == 1

    def test_it_lands_on_the_first_example_of_the_minority(self) -> None:
        text = (
            "Dated 30 June 2026. Also 1 July 2026. And 15 August 2026. "
            "But August 20, 2026 and September 21, 2026 for the last two."
        )
        finding = review_style(text)[0]
        assert text[finding.start : finding.end] == "August 20, 2026"

    def test_style_is_only_to_review(self) -> None:
        # The firm's house style is the firm's call. An inconsistency is
        # worth seeing and is never urgent.
        text = (
            "Dated 30 June 2026. Also 1 July 2026. And 15 August 2026. "
            "But August 20, 2026."
        )
        assert review_style(text)[0].severity is Severity.to_review

    def test_it_appears_in_the_combined_review(self) -> None:
        text = (
            '"Closing" means completion.\n\n'
            "Dated 30 June 2026. Also 1 July 2026. And 15 August 2026. "
            "But August 20, 2026. The Closing occurs then."
        )
        assert Defect.inconsistent_style in {f.defect for f in review_document(text)}

    def test_empty_text_gives_nothing(self) -> None:
        assert review_style("") == []
