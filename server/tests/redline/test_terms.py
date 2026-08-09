"""Defined-term defects, and the false positives that would sink them.

Every finding this module produces is meant to be *certain* — true of the
text as a matter of arithmetic. That claim is only worth making if the
false-positive cases are tested as hard as the true ones, because a reader
who finds one wrong finding stops trusting all of them, and a check nobody
trusts is worse than no check: it costs the reading time and returns
nothing.

So roughly half of what follows asserts that something is *not* reported.
"""

from polar.redline import Certainty, Defect, review_terms
from polar.redline.terms import find_definitions


def _defects(text: str, defect: Defect) -> list[str]:
    return [f.term for f in review_terms(text) if f.defect is defect]


class TestFindingTheDefinitions:
    def test_means_defines_a_term(self) -> None:
        text = '"Closing Date" means 30 June 2026. The Closing Date is fixed.'
        definitions, _ = find_definitions(text)
        assert [d.term for d in definitions] == ["Closing Date"]

    def test_shall_have_the_meaning_defines_a_term(self) -> None:
        text = (
            '"Permitted Encumbrance" shall have the meaning given in Schedule 2. '
            "Each Permitted Encumbrance survives Closing."
        )
        definitions, _ = find_definitions(text)
        assert [d.term for d in definitions] == ["Permitted Encumbrance"]

    def test_a_naming_parenthetical_defines_a_term(self) -> None:
        text = (
            "Acme Holdings Inc. (the “Company”) hereby agrees. "
            "The Company shall deliver the accounts."
        )
        definitions, _ = find_definitions(text)
        assert [d.term for d in definitions] == ["Company"]

    def test_several_terms_in_one_parenthetical(self) -> None:
        text = (
            'The parties (each a "Party" and together the "Parties") agree. '
            "Each Party shall perform. The Parties acknowledge this."
        )
        definitions, _ = find_definitions(text)
        assert {d.term for d in definitions} == {"Party", "Parties"}

    def test_curly_quotes_are_read(self) -> None:
        text = "“Escrow Amount” means $1,000,000. The Escrow Amount is held."
        definitions, _ = find_definitions(text)
        assert [d.term for d in definitions] == ["Escrow Amount"]


class TestQuotationsThatAreNotDefinitions:
    def test_a_quoted_sentence_is_not_a_term(self) -> None:
        # Contracts quote statutes and other agreements. Reading a quoted
        # sentence as a defined term would put a finding on every recital.
        text = (
            'The Act provides that "No person shall be liable for the '
            'consequences of an act done in good faith." The Seller agrees.'
        )
        definitions, _ = find_definitions(text)
        assert definitions == []

    def test_a_quotation_inside_a_long_parenthetical_is_not_a_definition(self) -> None:
        text = (
            "The Seller confirms (and the Buyer has relied on this "
            'confirmation in full, having taken advice on the "Disclosure '
            'Letter" and every document referred to in it) that the accounts '
            "are true."
        )
        definitions, _ = find_definitions(text)
        assert definitions == []


class TestDefinedButNeverUsed:
    def test_a_dead_definition_is_reported(self) -> None:
        text = (
            '"Earn-Out Payment" means the amount calculated under Schedule 3. '
            "The Buyer shall pay the Consideration at Closing."
        )
        assert _defects(text, Defect.defined_never_used) == ["Earn-Out Payment"]

    def test_a_used_definition_is_not_reported(self) -> None:
        text = (
            '"Earn-Out Payment" means the amount under Schedule 3. '
            "The Buyer shall pay the Earn-Out Payment at Closing."
        )
        assert _defects(text, Defect.defined_never_used) == []

    def test_a_plural_counts_as_use(self) -> None:
        # « "Party" means … » followed only by « the Parties » is correct
        # drafting. Reporting it would be the false positive that teaches a
        # reader to skim.
        text = '"Party" means a party to this agreement. The Parties agree.'
        assert _defects(text, Defect.defined_never_used) == []

    def test_a_y_plural_counts_as_use(self) -> None:
        text = '"Subsidiary" means any subsidiary undertaking. The Subsidiaries agree.'
        assert _defects(text, Defect.defined_never_used) == []


class TestDefinedTwice:
    def test_two_definitions_are_reported_once(self) -> None:
        text = (
            '"Closing" means completion under clause 4. The Closing occurs '
            'then. "Closing" means the date of transfer.'
        )
        findings = [f for f in review_terms(text) if f.defect is Defect.defined_twice]
        assert len(findings) == 1
        assert findings[0].term == "Closing"

    def test_the_second_definition_is_the_one_flagged(self) -> None:
        text = (
            '"Closing" means completion. Closing happens. "Closing" means '
            "the transfer date."
        )
        finding = next(
            f for f in review_terms(text) if f.defect is Defect.defined_twice
        )
        assert finding.start > text.index("completion")

    def test_one_definition_is_not_reported(self) -> None:
        text = '"Closing" means completion under clause 4. Closing occurs then.'
        assert _defects(text, Defect.defined_twice) == []


class TestUsedBeforeDefined:
    def test_a_forward_use_is_reported(self) -> None:
        text = (
            "The Buyer shall pay the Consideration at Closing. "
            '"Consideration" means $5,000,000.'
        )
        assert _defects(text, Defect.used_before_defined) == ["Consideration"]

    def test_definition_first_is_not_reported(self) -> None:
        text = (
            '"Consideration" means $5,000,000. '
            "The Buyer shall pay the Consideration at Closing."
        )
        assert _defects(text, Defect.used_before_defined) == []


class TestCaseMismatch:
    def test_a_lowercased_defined_term_is_reported(self) -> None:
        text = (
            '"Closing Date" means 30 June 2026. Completion occurs on the '
            "Closing Date, save that the closing date may be extended."
        )
        findings = [f for f in review_terms(text) if f.defect is Defect.case_mismatch]
        assert len(findings) == 1
        assert findings[0].literal == "closing date"

    def test_an_all_capitals_heading_is_not_reported(self) -> None:
        # « CLOSING DATE » as a section title is correct drafting, and
        # flagging headings would put a finding on every well-formed
        # contract in the world.
        text = (
            '"Closing Date" means 30 June 2026.\n\nCLOSING DATE\n\n'
            "Completion occurs on the Closing Date."
        )
        assert _defects(text, Defect.case_mismatch) == []

    def test_the_correct_form_is_not_reported(self) -> None:
        text = '"Closing Date" means 30 June 2026. The Closing Date is fixed.'
        assert _defects(text, Defect.case_mismatch) == []


class TestQuotedButUndefined:
    def test_a_quoted_phrase_with_no_definition_is_reported(self) -> None:
        text = (
            '"Consideration" means $5,000,000, payable subject to the '
            '"Escrow Agreement". The Consideration is fixed.'
        )
        findings = [
            f for f in review_terms(text) if f.defect is Defect.quoted_but_undefined
        ]
        assert [f.term for f in findings] == ["Escrow Agreement"]

    def test_it_is_marked_probable_not_certain(self) -> None:
        # The phrase may be the title of another document rather than a
        # term the drafter believed was defined. Saying so is the
        # difference between a finding a lawyer trusts and one they argue
        # with.
        text = '"Consideration" means $5. Subject to the "Escrow Agreement".'
        finding = next(
            f for f in review_terms(text) if f.defect is Defect.quoted_but_undefined
        )
        assert finding.certainty is Certainty.probable

    def test_everything_else_is_certain(self) -> None:
        text = '"Dead Term" means nothing here.'
        assert all(
            f.certainty is Certainty.certain
            for f in review_terms(text)
            if f.defect is not Defect.quoted_but_undefined
        )


class TestWhatTheAddInNeeds:
    def test_every_finding_carries_a_span_that_matches_its_literal(self) -> None:
        text = (
            '"Closing Date" means 30 June 2026. The closing date is fixed. '
            '"Dead Term" means nothing.'
        )
        for finding in review_terms(text):
            assert text[finding.start : finding.end] == finding.literal

    def test_the_occurrence_index_selects_the_right_hit(self) -> None:
        # Word locates text by searching and returns every match. The index
        # is how the add-in knows which one the finding meant.
        text = (
            '"Closing Date" means 30 June 2026. The closing date is one '
            "thing and the closing date is another."
        )
        findings = [f for f in review_terms(text) if f.defect is Defect.case_mismatch]
        assert [f.occurrence for f in findings] == [1, 2]

        hits = [
            match.start() for match in __import__("re").finditer("closing date", text)
        ]
        for finding in findings:
            assert hits[finding.occurrence - 1] == finding.start

    def test_findings_come_back_in_document_order(self) -> None:
        text = (
            '"Alpha" means one. "Beta" means two. The beta is used and Alpha is used.'
        )
        starts = [f.start for f in review_terms(text)]
        assert starts == sorted(starts)

    def test_context_is_carried_for_reading_without_the_document(self) -> None:
        text = '"Dead Term" means nothing at all in this agreement.'
        finding = review_terms(text)[0]
        assert "Dead Term" in finding.context


class TestHonestEdges:
    def test_empty_text_returns_nothing(self) -> None:
        assert review_terms("") == []

    def test_a_document_with_no_definitions_returns_nothing(self) -> None:
        text = "The parties agree that the goods will be delivered on Tuesday."
        assert review_terms(text) == []

    def test_a_clean_document_returns_nothing(self) -> None:
        # The most important test here. A well-drafted extract must come
        # back empty, or the checks are noise dressed as diligence.
        text = (
            'This agreement is made between Acme Holdings Inc. (the "Seller") '
            'and Zenith Partners LLC (the "Buyer").\n\n'
            "1. DEFINITIONS\n\n"
            '"Closing Date" means 30 June 2026.\n'
            '"Consideration" means $5,000,000.\n\n'
            "2. SALE\n\n"
            "The Seller shall sell and the Buyer shall purchase the shares "
            "on the Closing Date in return for the Consideration."
        )
        assert review_terms(text) == []


class TestARealDocument:
    """The test that should have existed first.

    Every check above passed on toy sentences while the engine produced
    twelve findings on a real share purchase agreement, seven of them
    wrong: the ordinary English words « company », « conditions »,
    « shares » and « warranties » read as miscased defined terms; a term
    wrapped across a line read as never used; and every term used in the
    recitals read as used-before-defined, which is how every contract in
    the world is drafted.

    Toy inputs test the code you wrote. A real document tests the
    assumptions you did not know you had made.
    """

    def test_the_planted_defects_are_all_found(self, spa: str) -> None:
        found = {(f.defect, f.term) for f in review_terms(spa)}
        assert (Defect.case_mismatch, "Closing Date") in found
        assert (Defect.defined_twice, "Company") in found
        assert (Defect.quoted_but_undefined, "Escrow Agreement") in found

    def test_nothing_else_is_reported(self, spa: str) -> None:
        # The number that matters. Three planted defects, three findings.
        assert len(review_terms(spa)) == 3

    def test_ordinary_english_is_not_a_miscased_term(self, spa: str) -> None:
        # « a Washington limited liability company » is not a use of the
        # defined term "Company".
        miscased = {
            f.term for f in review_terms(spa) if f.defect is Defect.case_mismatch
        }
        assert not {"Company", "Closing", "Shares", "Warranties"} & miscased

    def test_a_term_wrapped_across_a_line_counts_as_used(self, spa: str) -> None:
        # "Escrow Amount" appears in clause 2.2 as « Escrow\nAmount ».
        assert "Escrow Amount" not in _defects(spa, Defect.defined_never_used)
        assert "Escrow Amount" not in _defects(spa, Defect.case_mismatch)

    def test_recital_uses_are_not_used_before_defined(self, spa: str) -> None:
        # The recitals name the Shares and the Company before clause 1
        # defines them. That is the shape of every contract with a
        # definitions clause.
        assert _defects(spa, Defect.used_before_defined) == []
