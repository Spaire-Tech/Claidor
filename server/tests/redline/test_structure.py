"""Cross-references and numbering.

These findings claim to be *certain* — a clause either exists or it does
not — so the whole burden falls on reading the document's own structure
correctly. Every rule below was added because it got that wrong on one of
thirty real filings.
"""

import pytest

from polar.redline import Defect, Severity, review_document
from polar.redline.structure import (
    broken_references,
    duplicate_numbers,
    numbering_gaps,
    read_structure,
)

AGREEMENT = """AGREEMENT

1. DEFINITIONS

1.1 In this agreement the following words apply.

1.2 Headings do not affect construction.

2. SALE

2.1 The Seller shall sell the shares.

2.2 Payment is made under clause 3.1.

3. PAYMENT

3.1 The price is payable at completion.

SCHEDULE 1

The assets.
"""


class TestReadingTheStructure:
    def test_numbered_clauses_are_found(self) -> None:
        structure = read_structure(AGREEMENT)
        assert {"1", "1.1", "1.2", "2", "2.1", "2.2", "3", "3.1"} <= set(
            structure.clauses
        )

    def test_attachments_are_found(self) -> None:
        assert "1" in read_structure(AGREEMENT).attachments

    def test_a_heading_carrying_its_own_word_is_structure(self) -> None:
        # Most real agreements number this way, and text extracted from a
        # filing rarely keeps the line breaks that would mark a heading.
        text = (
            "Article I. Definitions\n\nSection 1.01 Capitalized terms have "
            "the meanings given.\n\nSection 1.02 Headings are ignored.\n\n"
            "Section 2.01 Sale. The Seller shall sell."
        )
        clauses = read_structure(text).clauses
        assert {"1", "1.01", "1.02", "2.01"} <= set(clauses)

    def test_a_roman_numeral_reads_as_its_number(self) -> None:
        clauses = read_structure("Article IV. Payment\n\nThe price.").clauses
        assert "4" in clauses

    def test_a_reference_is_not_mistaken_for_a_heading(self) -> None:
        # « as set out in Section 5.01 » points at a heading; it is not one.
        text = "The price is payable as set out in Section 5.01 of this deed."
        assert "5.01" not in read_structure(text).clauses

    def test_a_page_number_is_not_a_clause(self) -> None:
        assert "0" not in read_structure("0\n\n0. \n\nSome text.").clauses


class TestBrokenReferences:
    def test_a_reference_to_a_missing_clause_is_reported(self) -> None:
        text = AGREEMENT.replace("under clause 3.1", "under clause 9.4")
        assert [r.number for r in broken_references(text)] == ["9.4"]

    def test_a_reference_that_resolves_is_not_reported(self) -> None:
        assert broken_references(AGREEMENT) == []

    def test_a_reference_to_a_parent_clause_resolves(self) -> None:
        # Some drafters number only sub-clauses; « clause 2 » is satisfied
        # by 2.1 existing.
        text = AGREEMENT.replace("under clause 3.1", "under clause 2")
        assert broken_references(text) == []

    @pytest.mark.parametrize(
        "citation",
        [
            "Section 1.1 of the Credit Agreement",
            "Section 5 thereof",
            "Article 9.4 of the Indenture",
        ],
    )
    def test_a_reference_to_another_instrument_is_left_alone(
        self, citation: str
    ) -> None:
        # Nothing in this text can say whether another document's clause
        # exists. Getting this wrong would put a critical finding on every
        # contract that cites anything.
        text = AGREEMENT.replace("under clause 3.1", f"under {citation}")
        assert broken_references(text) == []

    def test_a_document_that_borrows_is_not_judged(self) -> None:
        # An amendment says « Section 5.01 is amended » about the parent
        # agreement's clause. On 15 real amendments this was 9 findings per
        # document before the check deferred.
        text = (
            "AMENDMENT NO. 2. Capitalized terms used but not defined herein "
            "have the meanings given in the Credit Agreement.\n\n"
            "1. Section 5.01 is amended. Section 9.03 is deleted.\n"
        )
        assert broken_references(text) == []

    def test_an_unreadable_structure_is_not_judged(self) -> None:
        # Three readable clauses and forty references means the numbering
        # did not survive extraction, not that the document is broken.
        text = "1. One.\n\n" + "See Section 9.4 and Section 8.1. " * 20
        assert broken_references(text) == []


class TestNumbering:
    def test_a_gap_is_reported(self) -> None:
        text = "1. A\n\n1.1 X\n\n1.2 Y\n\n1.4 Z\n\n1.5 W\n"
        assert [gap[0] for gap in numbering_gaps(text)] == ["1.3"]

    def test_a_complete_sequence_is_not_reported(self) -> None:
        assert numbering_gaps("1. A\n\n1.1 X\n\n1.2 Y\n\n1.3 Z\n") == []

    def test_scattered_numbering_is_not_read_as_gaps(self) -> None:
        # 2, 9, 30 is a document whose numbering did not survive
        # extraction. Reporting 25 missing clauses would be noise.
        assert numbering_gaps("2. A\n\n9. B\n\n30. C\n") == []

    def test_a_repeated_number_is_reported(self) -> None:
        text = "1. A\n\n2. B\n\n2. C again\n"
        assert [d[0] for d in duplicate_numbers(text)] == ["2"]

    def test_numbering_restarting_in_a_schedule_is_not_a_duplicate(self) -> None:
        # A schedule numbers its own clauses from 1, and an exhibit often
        # binds two instruments into one file. On real filings this
        # accounted for every duplicate found.
        text = "1. A\n\n2. B\n\nSCHEDULE 1\n\n1. First\n\n2. Second\n"
        assert duplicate_numbers(text) == []


class TestInTheReview:
    def test_structure_findings_appear_alongside_term_findings(self) -> None:
        text = AGREEMENT.replace("under clause 3.1", "under clause 9.4")
        defects = {f.defect for f in review_document(text)}
        assert Defect.broken_reference in defects

    def test_a_broken_reference_is_critical(self) -> None:
        # An obligation that points at a clause which is not there cannot
        # be read at all.
        text = AGREEMENT.replace("under clause 3.1", "under clause 9.4")
        finding = next(
            f for f in review_document(text) if f.defect is Defect.broken_reference
        )
        assert finding.severity is Severity.critical

    def test_findings_come_back_in_document_order(self) -> None:
        text = AGREEMENT.replace("under clause 3.1", "under clause 9.4")
        starts = [f.start for f in review_document(text)]
        assert starts == sorted(starts)

    def test_every_finding_carries_a_span_matching_its_literal(self) -> None:
        text = AGREEMENT.replace("under clause 3.1", "under clause 9.4")
        for finding in review_document(text):
            assert text[finding.start : finding.end] == finding.literal

    def test_a_clean_agreement_returns_nothing_structural(self) -> None:
        structural = {
            Defect.broken_reference,
            Defect.numbering_gap,
            Defect.duplicate_number,
        }
        assert not {f.defect for f in review_document(AGREEMENT)} & structural
