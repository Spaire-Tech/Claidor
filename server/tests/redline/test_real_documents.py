"""What thirty real filings taught the checker.

Every rule tested here was added because the engine got something wrong on
an agreement drafted by somebody else. Before this, it had only ever seen
two documents, both of which I wrote — and rules fitted to one document
turn out to be rules about that document.

Measured on 15 full agreements and 15 amendments pulled from SEC EDGAR.
"""

import pytest

from polar.redline import Defect, review_terms
from polar.redline.terms import defers_definitions


def _terms(text: str, defect: Defect) -> list[str]:
    return [f.term for f in review_terms(text) if f.defect is defect]


class TestDocumentsThatBorrowTheirDefinitions:
    """The blind spot no amount of tuning would have found.

    An amendment uses terms the parent agreement defines and does not
    repeat those definitions. Reporting every one as undefined is correct
    about the text and wrong about the world. On 15 real amendments this
    produced **47 undefined terms per document**.
    """

    @pytest.mark.parametrize(
        "boilerplate",
        [
            "Capitalized terms used but not defined herein shall have the "
            "meanings ascribed to them in the Credit Agreement.",
            "Capitalised terms not otherwise defined in this Amendment have "
            "the meanings given in the Purchase Agreement.",
            "Terms used but not defined herein are as defined in the Loan Agreement.",
            "This is Amendment No. 2 to the Credit Agreement.",
            "The Credit Agreement is hereby amended as follows.",
        ],
    )
    def test_the_boilerplate_is_recognised(self, boilerplate: str) -> None:
        assert defers_definitions(boilerplate)

    def test_a_self_contained_agreement_is_not_flagged(self) -> None:
        text = (
            '"Closing Date" means 30 June 2026. The Closing Date is fixed. '
            "The parties agree to the terms set out in this deed."
        )
        assert not defers_definitions(text)

    def test_undefined_terms_are_not_reported_at_all(self) -> None:
        # The whole check is switched off, not softened. A document that
        # says it borrows its definitions cannot be judged on them.
        text = (
            "AMENDMENT NO. 2 TO CREDIT AGREEMENT\n\n"
            "Capitalized terms used but not defined herein shall have the "
            "meanings ascribed to them in the Credit Agreement.\n\n"
            "The Required Lenders agree that the Obligations of each Loan "
            "Party under the Loan Documents shall continue. The Required "
            "Lenders confirm the Obligations remain in full force."
        )
        assert _terms(text, Defect.undefined_term) == []

    def test_the_other_checks_still_run(self) -> None:
        # Borrowing definitions says nothing about the ones it does define.
        text = (
            "AMENDMENT NO. 2. Capitalized terms used but not defined herein "
            "have the meanings given in the Credit Agreement.\n\n"
            '"Extension Fee" means USD 40,000 payable on signature.\n'
        )
        assert _terms(text, Defect.unused_definition) == ["Extension Fee"]


class TestRepeatedDefinitionsAreNotConflicts:
    """A credit agreement with a signature page per lender repeats its own
    preamble dozens of times. That produced 52 « multiple definitions » per
    document, all of them the same words twice.

    The defect is « two definitions and nothing says which governs », and
    that requires them to disagree.
    """

    def test_identical_definitions_are_not_reported(self) -> None:
        preamble = 'Acme Corporation (the "Company"), and the lenders. '
        text = preamble * 4 + 'The Company shall pay. "Fee" means one. The Fee applies.'
        assert _terms(text, Defect.multiple_definitions) == []

    def test_definitions_that_differ_are_still_reported(self) -> None:
        text = (
            '"Closing" means completion under clause 4. Closing occurs.\n'
            '"Closing" means the date the shares transfer.\n'
        )
        assert _terms(text, Defect.multiple_definitions) == ["Closing"]


class TestCapitalisedDefinitions:
    """« "TRADE SECRET" means … » is a styling choice for the definitions
    list. The body writing « Trade Secret » is correct drafting, and one
    real licence agreement produced 139 findings from this alone.
    """

    def test_an_all_capitals_term_is_not_case_checked(self) -> None:
        text = (
            '"TRADE SECRET" means the know-how described in Schedule 1.\n\n'
            "The Licensee shall keep each Trade Secret confidential and "
            "shall not disclose any Trade Secret to a third party."
        )
        assert _terms(text, Defect.case_mismatch) == []

    def test_a_normally_cased_term_is_still_checked(self) -> None:
        text = (
            '"Trade Secret" means the know-how in Schedule 1.\n\n'
            "The Licensee shall keep each trade secret confidential."
        )
        assert _terms(text, Defect.case_mismatch) == ["Trade Secret"]


class TestParentheticalsThatDoNotDefine:
    """Legal prose quotes terms inside parentheticals constantly without
    defining them. Reading those as definitions is what produced the
    repeat-definition flood in the first place.
    """

    @pytest.mark.parametrize(
        "aside",
        [
            'Acme Corporation (the "Company")',
            'the parties (each a "Party" and together the "Parties")',
            'THIS DEED (this "Agreement")',
            'the lenders (collectively, the "Lenders")',
        ],
    )
    def test_a_naming_aside_defines(self, aside: str) -> None:
        from polar.redline.terms import find_definitions

        definitions, _ = find_definitions(f"{aside} agrees as follows.")
        assert definitions, f"should have defined a term in: {aside}"

    @pytest.mark.parametrize(
        "mention",
        [
            'obligations (as defined in the "Credit Agreement")',
            'the entities (other than the "Excluded Subsidiaries")',
            'the notes (issued under the "Indenture" dated 2024)',
        ],
    )
    def test_a_mention_does_not_define(self, mention: str) -> None:
        from polar.redline.terms import find_definitions

        definitions, _ = find_definitions(f"The {mention} shall continue.")
        assert definitions == [], f"should not have defined a term in: {mention}"


class TestCandidatesThatAreNotTerms:
    """Three shapes that produced nonsense terms on real filings.

    Each assertion below is about the *specific* wrong term the engine used
    to produce. It is deliberately not « nothing is reported »: I wrote
    that first and it failed, because stripping « By » off « Collateral
    Manager By » leaves « Collateral Manager », which is a perfectly
    plausible defined term. The fix removed the nonsense, not the residue,
    and the test should say so rather than claim more than the code does.
    """

    def test_a_signature_block_label_is_not_part_of_the_term(self) -> None:
        text = (
            '"Fee" means one. The Fee applies.\n\nACME LLC\n'
            "By the Collateral Manager By its authorised signatory.\n"
            "The Collateral Manager By."
        )
        assert "Collateral Manager By" not in _terms(text, Defect.undefined_term)

    def test_a_statute_named_is_not_a_missing_definition(self) -> None:
        text = (
            '"Fee" means one. The Fee applies under the Securities Exchange '
            "Act and the Internal Revenue Code, and again the Securities "
            "Exchange Act and the Internal Revenue Code."
        )
        reported = _terms(text, Defect.undefined_term)
        assert "Securities Exchange Act" not in reported
        assert "Internal Revenue Code" not in reported

    def test_a_term_does_not_run_across_a_line_break(self) -> None:
        # « 1285 Avenue of the Americas / New York » produced the term
        # « Americas New York » before candidates stopped at a newline.
        text = (
            '"Fee" means one. The Fee applies.\nNotices to 1285 Avenue of '
            "the Americas\nNew York, and to the Americas\nNew York office."
        )
        assert "Americas New York" not in _terms(text, Defect.undefined_term)
