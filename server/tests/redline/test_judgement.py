"""The gates that stand between a model and a lawyer.

A model can find a contradiction. A model can also invent one, and a
lawyer who reads an invented contradiction in their own draft loses an
hour and then stops using the tool. So nothing a model proposes reaches
the panel until code has checked it, and this file is about those checks
rather than about the model.

No API calls anywhere here. Every test hands :func:`verify` a proposal and
asserts what survives, which is the only part that can be tested honestly
without spending money on a non-deterministic answer.
"""

import pytest

from polar.redline import Certainty, Defect, Severity
from polar.redline.judgement import (
    CHUNK,
    MIN_QUOTE,
    OVERLAP,
    JudgementReport,
    chunks,
    locate_quote,
    verify,
)

DOCUMENT = (
    "3. NOTICES\n\n"
    "3.1 Either party may terminate on thirty (30) days written notice.\n\n"
    "4. PRICE\n\n"
    "4.1 The Purchase Price is USD 5,000,000, payable as USD 2,000,000 at "
    "Closing and USD 2,500,000 on the Earn-Out Date.\n\n"
    "12. TERMINATION\n\n"
    "12.1 Either party may terminate on sixty (60) days written notice.\n"
)


def _report() -> JudgementReport:
    report = JudgementReport()
    report.proposed = 0
    return report


class TestLocatingAQuote:
    def test_a_quote_that_is_there_is_found(self) -> None:
        span = locate_quote(DOCUMENT, "terminate on thirty (30) days written notice")
        assert span is not None
        assert DOCUMENT[span[0] : span[1]].startswith("terminate on thirty")

    def test_a_quote_that_is_not_there_is_refused(self) -> None:
        assert locate_quote(DOCUMENT, "terminate on ninety (90) days notice") is None

    def test_a_quote_broken_by_a_line_break_is_still_found(self) -> None:
        # A model reproducing a passage will not reproduce the line break
        # in the middle of it. Rejecting the quote over that would throw
        # away good findings.
        text = "The Purchase Price is\nUSD 5,000,000 in total."
        span = locate_quote(text, "The Purchase Price is USD 5,000,000")
        assert span is not None
        assert text[span[0] : span[1]] == "The Purchase Price is\nUSD 5,000,000"

    def test_the_span_indexes_the_original_text(self) -> None:
        # Everything downstream — the panel's jump, the occurrence index —
        # depends on the span indexing the string that was submitted, not a
        # normalised copy of it.
        for quote in (
            "Either party may terminate on sixty (60) days",
            "The Purchase Price is USD 5,000,000",
        ):
            span = locate_quote(DOCUMENT, quote)
            assert span is not None
            assert " ".join(DOCUMENT[span[0] : span[1]].split()) == quote

    def test_a_quote_too_short_to_place_is_refused(self) -> None:
        assert locate_quote(DOCUMENT, "the") is None
        assert locate_quote(DOCUMENT, "a" * (MIN_QUOTE - 1)) is None


class TestTheFabricationGate:
    def test_a_finding_whose_words_are_not_there_is_dropped(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "contradiction",
                    "quotes": ["terminate on ninety (90) days written notice"],
                    "note": "This conflicts with clause 3.1.",
                }
            ],
            report,
        )
        assert kept == []
        assert report.unquotable == 1

    def test_a_finding_with_one_real_and_one_invented_quote_is_dropped(self) -> None:
        # The dangerous shape: half true, so it reads as credible.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "contradiction",
                    "quotes": [
                        "terminate on thirty (30) days written notice",
                        "terminate on ninety (90) days written notice",
                    ],
                    "note": "These conflict.",
                }
            ],
            report,
        )
        assert kept == []
        assert report.unquotable == 1

    def test_a_finding_with_no_note_is_dropped(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "contradiction",
                    "quotes": ["terminate on thirty (30) days written notice"],
                    "note": "   ",
                }
            ],
            report,
        )
        assert kept == []

    def test_a_real_contradiction_survives(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "contradiction",
                    "quotes": [
                        "terminate on thirty (30) days written notice",
                        "terminate on sixty (60) days written notice",
                    ],
                    "note": "Clause 3.1 gives thirty days and clause 12.1 sixty.",
                }
            ],
            report,
        )
        assert len(kept) == 1
        assert kept[0].defect is Defect.contradiction
        assert report.unquotable == 0


class TestTheArithmeticGate:
    def test_figures_that_do_not_add_up_survive(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "miscalculation",
                    "quotes": [
                        "The Purchase Price is USD 5,000,000, payable as USD "
                        "2,000,000 at Closing and USD 2,500,000 on the Earn-Out Date"
                    ],
                    "note": "The instalments do not add up to the price.",
                    "components": [2_000_000, 2_500_000],
                    "stated_total": 5_000_000,
                }
            ],
            report,
        )
        assert len(kept) == 1
        assert kept[0].defect is Defect.miscalculation

    def test_the_computed_sum_is_put_in_the_note(self) -> None:
        # So a lawyer can check the claim in one glance instead of adding
        # the figures up themselves.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "miscalculation",
                    "quotes": ["The Purchase Price is USD 5,000,000"],
                    "note": "The instalments do not add up.",
                    "components": [2_000_000, 2_500_000],
                    "stated_total": 5_000_000,
                }
            ],
            report,
        )
        assert "4,500,000.00" in kept[0].note
        assert "5,000,000.00" in kept[0].note

    def test_figures_that_do_add_up_are_dropped(self) -> None:
        # The model claimed a miscalculation and the arithmetic says
        # otherwise. Python wins.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "miscalculation",
                    "quotes": ["The Purchase Price is USD 5,000,000"],
                    "note": "These do not add up.",
                    "components": [2_500_000, 2_500_000],
                    "stated_total": 5_000_000,
                }
            ],
            report,
        )
        assert kept == []
        assert report.arithmetic_wrong == 1

    def test_a_miscalculation_with_no_figures_is_dropped(self) -> None:
        # An arithmetic claim that cannot be recomputed is exactly what
        # this module exists to refuse.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "miscalculation",
                    "quotes": ["The Purchase Price is USD 5,000,000"],
                    "note": "Something does not add up.",
                }
            ],
            report,
        )
        assert kept == []
        assert report.arithmetic_wrong == 1

    def test_rounding_to_the_cent_is_not_a_miscalculation(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "miscalculation",
                    "quotes": ["The Purchase Price is USD 5,000,000"],
                    "note": "Thirds do not divide evenly.",
                    "components": [1_666_666.67, 1_666_666.67, 1_666_666.66],
                    "stated_total": 5_000_000,
                }
            ],
            report,
        )
        assert kept == []


class TestHowFindingsAreLabelled:
    def test_judgement_findings_are_suggested_not_certain(self) -> None:
        # A verified quote proves the words are real, not that the reading
        # of them is right. A reader who learns the mechanical findings are
        # always right will give these the attention they need.
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "contradiction",
                    "quotes": [
                        "terminate on thirty (30) days written notice",
                        "terminate on sixty (60) days written notice",
                    ],
                    "note": "These conflict.",
                }
            ],
            report,
        )
        assert kept[0].certainty is Certainty.suggested

    def test_a_miscalculation_is_critical(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "miscalculation",
                    "quotes": ["The Purchase Price is USD 5,000,000"],
                    "note": "Does not add up.",
                    "components": [1, 2],
                    "stated_total": 4,
                }
            ],
            report,
        )
        assert kept[0].severity is Severity.critical

    def test_a_finding_carries_a_span_matching_its_literal(self) -> None:
        report = _report()
        kept = verify(
            DOCUMENT,
            [
                {
                    "kind": "contradiction",
                    "quotes": ["terminate on thirty (30) days written notice"],
                    "note": "Conflicts with clause 12.1.",
                }
            ],
            report,
        )
        for finding in kept:
            assert DOCUMENT[finding.start : finding.end] == finding.literal


class TestChunking:
    def test_a_short_document_is_one_window(self) -> None:
        assert len(chunks("short")) == 1

    def test_empty_text_is_no_windows(self) -> None:
        assert chunks("") == []

    def test_windows_overlap_so_nothing_falls_between_them(self) -> None:
        text = "x" * (CHUNK * 3)
        windows = chunks(text)
        assert len(windows) > 1
        for (start, _), (next_start, _) in zip(windows, windows[1:], strict=False):
            assert next_start - start == CHUNK - OVERLAP

    def test_every_character_is_covered(self) -> None:
        # A gap between windows is a passage nothing ever reads, and it
        # would be invisible.
        text = "y" * (CHUNK * 2 + 500)
        covered = set()
        for start, window in chunks(text):
            covered.update(range(start, start + len(window)))
        assert covered == set(range(len(text)))

    def test_offsets_index_the_original_text(self) -> None:
        text = "".join(f"clause {n} " for n in range(4000))
        for start, window in chunks(text):
            assert text[start : start + len(window)] == window


class TestTheReport:
    def test_it_counts_what_was_dropped_and_why(self) -> None:
        # The fabrication rate is a number worth watching, so it is
        # reported rather than swallowed.
        report = JudgementReport()
        report.proposed = 3
        verify(
            DOCUMENT,
            [
                {
                    "kind": "contradiction",
                    "quotes": ["invented words that are not in the document"],
                    "note": "x",
                },
                {
                    "kind": "miscalculation",
                    "quotes": ["The Purchase Price is USD 5,000,000"],
                    "note": "x",
                    "components": [1, 1],
                    "stated_total": 2,
                },
                {
                    "kind": "contradiction",
                    "quotes": ["terminate on sixty (60) days written notice"],
                    "note": "x",
                },
            ],
            report,
        )
        assert report.unquotable == 1
        assert report.arithmetic_wrong == 1
        assert report.kept == 1
        assert "1 kept" in report.summary()


@pytest.mark.asyncio
class TestWithoutAKey:
    async def test_empty_text_needs_no_model(self) -> None:
        from polar.redline.judgement import review_judgement

        findings, report = await review_judgement("   ")
        assert findings == []
        assert report.chunks == 0
