"""Defined-term defects, and the false positives that would sink them.

Four of the five checks claim to be *certain* — true of the text as a
matter of arithmetic. That claim is only worth making if the false-positive
cases are tested as hard as the true ones, because a reader who finds one
wrong finding stops trusting all of them, and a check nobody trusts is
worse than no check: it costs the reading time and returns nothing.

So roughly half of what follows asserts that something is *not* reported,
and the two fixtures at the bottom are where the real work happens. Toy
sentences test the code you wrote; a real document tests the assumptions
you did not know you had made.
"""

import re

from polar.redline import SEVERITY, Certainty, Defect, Severity, review_terms
from polar.redline.terms import definitions_list, find_definitions


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

    def test_a_naming_parenthetical_is_marked_as_an_aside(self) -> None:
        # The distinction is load-bearing: a party named in the parties
        # clause is not an entry in the definitions list, and counting it
        # as one made a correctly alphabetised contract look unordered.
        text = 'Acme Holdings Inc. (the "Company") agrees. The Company shall pay.'
        definitions, _ = find_definitions(text)
        assert definitions[0].kind == "aside"

    def test_a_means_definition_is_marked_as_such(self) -> None:
        text = '"Closing Date" means 30 June 2026. The Closing Date is fixed.'
        definitions, _ = find_definitions(text)
        assert definitions[0].kind == "means"

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


class TestUnusedDefinition:
    def test_a_dead_definition_is_reported(self) -> None:
        text = (
            '"Earn-Out Payment" means the amount calculated under Schedule 3. '
            "The Buyer shall pay the Consideration at Closing."
        )
        assert _defects(text, Defect.unused_definition) == ["Earn-Out Payment"]

    def test_a_used_definition_is_not_reported(self) -> None:
        text = (
            '"Earn-Out Payment" means the amount under Schedule 3. '
            "The Buyer shall pay the Earn-Out Payment at Closing."
        )
        assert _defects(text, Defect.unused_definition) == []

    def test_a_plural_counts_as_use(self) -> None:
        # « "Party" means … » followed only by « the Parties » is correct
        # drafting. Reporting it would be the false positive that teaches a
        # reader to skim.
        text = '"Party" means a party to this agreement. The Parties agree.'
        assert _defects(text, Defect.unused_definition) == []

    def test_a_y_plural_counts_as_use(self) -> None:
        text = '"Subsidiary" means any subsidiary undertaking. The Subsidiaries agree.'
        assert _defects(text, Defect.unused_definition) == []


class TestMultipleDefinitions:
    def test_two_definitions_are_reported_once(self) -> None:
        text = (
            '"Closing" means completion under clause 4. The Closing occurs '
            'then. "Closing" means the date of transfer.'
        )
        findings = [
            f for f in review_terms(text) if f.defect is Defect.multiple_definitions
        ]
        assert len(findings) == 1
        assert findings[0].term == "Closing"

    def test_the_second_definition_is_the_one_flagged(self) -> None:
        text = (
            '"Closing" means completion. Closing happens. "Closing" means '
            "the transfer date."
        )
        finding = next(
            f for f in review_terms(text) if f.defect is Defect.multiple_definitions
        )
        assert finding.start > text.index("completion")

    def test_one_definition_is_not_reported(self) -> None:
        text = '"Closing" means completion under clause 4. Closing occurs then.'
        assert _defects(text, Defect.multiple_definitions) == []


class TestUndefinedTerm:
    def test_a_quoted_phrase_with_no_definition_is_reported(self) -> None:
        # Needs a definitions convention to judge against — see
        # MIN_CONVENTION. A document that defines nothing explicitly gives
        # capitalisation no meaning.
        text = (
            '"Consideration" means $5,000,000.\n'
            '"Closing" means completion.\n'
            '"Warranties" means the warranties in Schedule 1.\n'
            "The Consideration is payable at the Closing subject to the "
            '"Escrow Agreement", and the Warranties survive the '
            '"Escrow Agreement".'
        )
        assert "Escrow Agreement" in _defects(text, Defect.undefined_term)

    def test_a_capitalised_phrase_with_no_definition_is_reported(self) -> None:
        # Twice, because one sighting is more often a proper noun than a
        # missing definition — see MIN_SIGHTINGS.
        text = (
            '"Consideration" means $5,000,000.\n'
            '"Closing" means completion.\n'
            '"Warranties" means the warranties in Schedule 1.\n'
            "The Consideration is payable by the Long Stop Date, and the "
            "Warranties expire on the Long Stop Date."
        )
        assert _defects(text, Defect.undefined_term) == ["Long Stop Date"]

    def test_a_document_with_no_definitions_convention_is_not_judged(self) -> None:
        # Six of fifteen real agreements had no definitions section at all.
        # In those, every Title-Case phrase becomes a candidate and the
        # check is pure noise.
        text = (
            "The Executive shall report to the Board and the Compensation "
            "Committee. The Board and the Compensation Committee may "
            "terminate for Cause. Cause is determined by the Board."
        )
        assert _defects(text, Defect.undefined_term) == []

    def test_it_is_marked_probable_not_certain(self) -> None:
        # A contract capitalises Delaware and Tuesday as well as Purchase
        # Price. Saying "probable" is the difference between a finding a
        # lawyer trusts and one they argue with.
        text = (
            '"Consideration" means $5.\n"Closing" means completion.\n'
            '"Warranties" means the warranties.\n'
            "The Consideration and the Warranties are payable by the Long "
            "Stop Date, on the Long Stop Date."
        )
        finding = next(
            f for f in review_terms(text) if f.defect is Defect.undefined_term
        )
        assert finding.certainty is Certainty.probable

    def test_everything_else_is_certain(self) -> None:
        text = '"Dead Term" means nothing here.'
        assert all(
            f.certainty is Certainty.certain
            for f in review_terms(text)
            if f.defect is not Defect.undefined_term
        )

    def test_a_proper_noun_is_not_an_undefined_term(self) -> None:
        # No stoplist can enumerate states and company names. The rule is
        # that a defined term follows a definite determiner and a proper
        # noun usually does not.
        text = (
            '"Company" means Acme Operating Co., a Delaware corporation, '
            "with its office in Seattle, Washington. The Company agrees."
        )
        assert _defects(text, Defect.undefined_term) == []

    def test_an_indefinite_article_rules_a_phrase_out(self) -> None:
        text = (
            '"Buyer" means the purchaser. The Buyer is a Washington limited '
            "liability company incorporated as a Delaware corporation."
        )
        assert _defects(text, Defect.undefined_term) == []

    def test_a_sentence_opener_is_not_part_of_the_term(self) -> None:
        # « At Closing, the Purchaser shall pay » is a use of « Closing ».
        text = (
            '"Closing" means completion.\n\n'
            "2.1 At Closing, payment shall be made in full.\n\n"
            "2.2 The Closing is conditional."
        )
        assert _defects(text, Defect.undefined_term) == []

    def test_a_clause_number_does_not_hide_a_sentence_start(self) -> None:
        # « 3.2 If the Conditions are not satisfied » — without consuming
        # the clause number, « If » looked mid-sentence and was reported.
        text = (
            '"Conditions" means the conditions in Schedule 1.\n\n'
            "3.1 The Conditions must be satisfied.\n\n"
            "3.2 If the Conditions are not satisfied, either party may "
            "terminate.\n\n"
            "3.3 In the event the Conditions lapse, this agreement ends."
        )
        assert _defects(text, Defect.undefined_term) == []

    def test_a_structural_reference_is_not_a_term(self) -> None:
        text = (
            '"Warranties" means the warranties in Schedule 2. The Warranties '
            "are given subject to the Schedule and the Clause referred to."
        )
        assert _defects(text, Defect.undefined_term) == []


class TestUnorderedDefinitions:
    def test_an_unsorted_list_is_reported(self) -> None:
        text = (
            '"Zebra" means one. The Zebra applies.\n'
            '"Apple" means two. The Apple applies.\n'
            '"Mango" means three. The Mango applies.\n'
        )
        assert _defects(text, Defect.unordered_definitions) == ["Apple"]

    def test_a_sorted_list_is_not_reported(self) -> None:
        text = (
            '"Apple" means one. The Apple applies.\n'
            '"Mango" means two. The Mango applies.\n'
            '"Zebra" means three. The Zebra applies.\n'
        )
        assert _defects(text, Defect.unordered_definitions) == []

    def test_two_definitions_are_not_a_list(self) -> None:
        text = '"Zebra" means one. The Zebra applies. "Apple" means two. The Apple.'
        assert _defects(text, Defect.unordered_definitions) == []

    def test_parenthetical_asides_are_not_list_entries(self) -> None:
        # A party named in the parties clause is not an entry in the
        # definitions list. Counting Seller and Buyer as entries made a
        # correctly alphabetised contract look unordered.
        text = (
            'Acme Inc. (the "Seller") and Zenith LLC (the "Buyer") agree.\n'
            '"Apple" means one. The Apple applies. The Seller and the Buyer.\n'
            '"Mango" means two. The Mango applies.\n'
            '"Zebra" means three. The Zebra applies.\n'
        )
        assert _defects(text, Defect.unordered_definitions) == []

    def test_a_repeat_definition_does_not_count_as_disorder(self) -> None:
        # A term defined twice breaks the sequence, but that is already
        # reported as multiple_definitions. Reporting it here as well would
        # be one defect under two names.
        text = (
            '"Apple" means one. The Apple applies.\n'
            '"Mango" means two. The Mango applies.\n'
            '"Zebra" means three. The Zebra applies.\n'
            '"Apple" means four.\n'
        )
        assert _defects(text, Defect.unordered_definitions) == []
        assert _defects(text, Defect.multiple_definitions) == ["Apple"]

    def test_the_list_excludes_asides_and_repeats(self) -> None:
        text = (
            'Acme Inc. (the "Seller") agrees.\n'
            '"Apple" means one. The Apple and the Seller.\n'
            '"Mango" means two. The Mango applies.\n'
            '"Apple" means three.\n'
        )
        definitions, _ = find_definitions(text)
        assert [d.term for d in definitions_list(definitions)] == ["Apple", "Mango"]


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


class TestSeverity:
    def test_undefined_terms_are_critical(self) -> None:
        text = (
            '"Consideration" means $5.\n"Closing" means completion.\n'
            '"Warranties" means the warranties.\n'
            "The Consideration and the Warranties are payable by the Long "
            "Stop Date, on the Long Stop Date."
        )
        finding = next(
            f for f in review_terms(text) if f.defect is Defect.undefined_term
        )
        assert finding.severity is Severity.critical

    def test_an_unused_definition_is_a_warning(self) -> None:
        text = '"Dead Term" means nothing here.'
        assert review_terms(text)[0].severity is Severity.warning

    def test_ordering_is_only_to_review(self) -> None:
        text = (
            '"Zebra" means one. The Zebra applies.\n'
            '"Apple" means two. The Apple applies.\n'
            '"Mango" means three. The Mango applies.\n'
        )
        finding = next(
            f for f in review_terms(text) if f.defect is Defect.unordered_definitions
        )
        assert finding.severity is Severity.to_review

    def test_every_finding_has_a_severity_matching_its_defect(self) -> None:
        text = (
            '"Zebra" means one. The Zebra applies.\n'
            '"Apple" means two. The Apple applies.\n'
            '"Mango" means three. The Mango and the Long Stop Date.\n'
            '"Dead Term" means nothing.\n'
            '"Zebra" means four.\n'
        )
        findings = review_terms(text)
        assert findings
        for finding in findings:
            assert finding.severity is SEVERITY[finding.defect]


class TestWhatTheAddInNeeds:
    def test_every_finding_carries_a_span_that_matches_its_literal(self) -> None:
        text = (
            '"Closing Date" means 30 June 2026. The closing date is fixed. '
            '"Dead Term" means nothing. Payable by the Long Stop Date.'
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

        hits = [match.start() for match in re.finditer("closing date", text)]
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
    """The tests that should have existed first.

    An earlier version passed twenty-nine toy-sentence tests while
    producing twelve findings on a real share purchase agreement, seven of
    them wrong: ordinary English words read as miscased terms, a term
    wrapped across a line read as never used, and every term named in the
    recitals read as used-before-defined — which is how every contract with
    a definitions clause is drafted.

    There is one regression test below per false positive.
    """

    def test_the_planted_defects_are_all_found(self, spa: str) -> None:
        found = {(f.defect, f.term) for f in review_terms(spa)}
        assert (Defect.case_mismatch, "Closing Date") in found
        assert (Defect.multiple_definitions, "Company") in found
        assert (Defect.undefined_term, "Escrow Agreement") in found

    def test_a_term_used_only_once_is_deliberately_missed(self, spa: str) -> None:
        # « Long Stop Date » appears once in clause 3.2 and is defined
        # nowhere. It is a real defect and it is not reported, because
        # requiring two sightings halved the false positives on fifteen
        # real agreements — 14 per document down to 8.8 — while still
        # reproducing Vesence's published example exactly.
        #
        # Recorded as a test so the trade is visible rather than forgotten.
        assert "Long Stop Date" not in _defects(spa, Defect.undefined_term)

    def test_nothing_else_is_reported(self, spa: str) -> None:
        # The number that matters. « Agreement » is used as « this
        # Agreement » throughout and never defined, which is a real defect
        # in the fixture rather than a false positive.
        assert len(review_terms(spa)) == 4

    def test_ordinary_english_is_not_a_miscased_term(self, spa: str) -> None:
        # « a Washington limited liability company » is not a use of the
        # defined term "Company".
        miscased = {
            f.term for f in review_terms(spa) if f.defect is Defect.case_mismatch
        }
        assert not {"Company", "Closing", "Shares", "Warranties"} & miscased

    def test_a_term_wrapped_across_a_line_counts_as_used(self, spa: str) -> None:
        # "Escrow Amount" appears in clause 2.2 as « Escrow\nAmount ».
        assert "Escrow Amount" not in _defects(spa, Defect.unused_definition)
        assert "Escrow Amount" not in _defects(spa, Defect.case_mismatch)

    def test_states_and_company_names_are_not_undefined_terms(self, spa: str) -> None:
        undefined = set(_defects(spa, Defect.undefined_term))
        assert (
            not {
                "Delaware",
                "Washington",
                "Seattle",
                "Acme Operating Co",
            }
            & undefined
        )

    def test_an_alphabetised_definitions_clause_is_not_reported(self, spa: str) -> None:
        # The fixture's clause 1 is in alphabetical order. An earlier
        # version reported it as unordered because it counted the Seller
        # and Buyer from the parties clause as list entries.
        assert _defects(spa, Defect.unordered_definitions) == []


class TestAgainstVesencesOwnScreenshot:
    """Their published output, reproduced exactly.

    The Vesence Word page shows the Check panel for a real document:

    ==========  =====  ====================================
    Severity    Count  Findings
    ==========  =====  ====================================
    Critical    2      Undefined term: Completion
                       Undefined term: New Shares
    Warning     2      Unused definition: Bank Account
                       Multiple definitions: Claim
    To review   1      Unordered definitions
    ==========  =====  ====================================

    ``vesence_example.txt`` is a document built to contain exactly those
    defects and nothing else. If this clone is faithful it returns the same
    five findings in the same three buckets, and if a later change breaks
    that, this is the test that says so.
    """

    def test_the_two_critical_findings_are_the_undefined_terms(
        self, vesence_example: str
    ) -> None:
        critical = [
            f for f in review_terms(vesence_example) if f.severity is Severity.critical
        ]
        assert {f.term for f in critical} == {"Completion", "New Shares"}
        assert all(f.defect is Defect.undefined_term for f in critical)

    def test_the_two_warnings_are_the_unused_and_duplicate_definitions(
        self, vesence_example: str
    ) -> None:
        warnings = [
            f for f in review_terms(vesence_example) if f.severity is Severity.warning
        ]
        assert {(f.defect, f.term) for f in warnings} == {
            (Defect.unused_definition, "Bank Account"),
            (Defect.multiple_definitions, "Claim"),
        }

    def test_the_one_to_review_is_the_ordering(self, vesence_example: str) -> None:
        to_review = [
            f for f in review_terms(vesence_example) if f.severity is Severity.to_review
        ]
        assert [f.defect for f in to_review] == [Defect.unordered_definitions]

    def test_the_counts_match_theirs_exactly(self, vesence_example: str) -> None:
        findings = review_terms(vesence_example)
        counts = {
            severity: sum(1 for f in findings if f.severity is severity)
            for severity in (Severity.critical, Severity.warning, Severity.to_review)
        }
        assert counts == {
            Severity.critical: 2,
            Severity.warning: 2,
            Severity.to_review: 1,
        }
        assert len(findings) == 5
