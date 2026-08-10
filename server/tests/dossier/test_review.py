"""Checking a whole matter.

The engine itself is tested to death in ``tests/redline``. What is tested
here is everything *around* running it N times, and almost all of that is
about honesty: a report that quietly leaves files out is worse than no
report, because « no issues found in 24 files » reads as « the bundle is
clean » whichever six of them could not be opened.
"""

from uuid import uuid4

import pytest

from polar.dossier.review import MAX_DOCUMENTS, review_matter
from polar.models.dossier import DossierDocument

#: Two undefined terms and a definition nobody uses — enough that the
#: engine has something to say, short enough to read.
DEFECTIVE = (
    'HELIOS SYSTEMS LTD (the "Company") and ZENITH CAPITAL LLP '
    '(the "Subscriber") agree.\n'
    '"Subscription Price" means EUR 2,500,000.\n'
    '"Bank Account" means the account notified by the Company.\n'
    "The Subscriber shall pay the Consideration to the Escrow Agent.\n"
)

CLEAN = (
    '"Closing Date" means 30 June 2026.\n'
    '"Consideration" means $5,000,000.\n'
    "The buyer shall pay the Consideration on the Closing Date.\n"
)


def document(text: str | None, *, title: str = "A file", piece: int | None = 1):
    """A DossierDocument with only the fields the review reads.

    Constructed rather than saved: `review_matter` is pure, and the point
    of it being pure is that this test needs no database.
    """
    return DossierDocument(
        id=uuid4(),
        dossier_id=uuid4(),
        file_id=uuid4(),
        uploaded_by_id=uuid4(),
        title=title,
        piece_number=piece,
        extracted_text=text,
    )


class TestWhatItChecks:
    def test_each_document_is_checked_separately(self) -> None:
        review = review_matter([document(DEFECTIVE), document(CLEAN)])

        assert review.checked == 2
        assert len(review.documents[0].findings) > 0
        assert review.documents[1].findings == []

    def test_the_totals_are_the_sum_of_the_documents(self) -> None:
        # The header says « Critical (3) » above the list. If it counted
        # separately from the list it could disagree with it, and a tally
        # that disagrees with what is beneath it is worse than no tally.
        review = review_matter([document(DEFECTIVE), document(DEFECTIVE)])

        assert review.critical_count == sum(d.critical for d in review.documents)
        assert review.warning_count == sum(d.warning for d in review.documents)
        assert review.finding_count == sum(len(d.findings) for d in review.documents)

    def test_documents_stay_in_the_matter_s_own_order(self) -> None:
        # A lawyer looking for pièce 4 should find it where pièce 4 lives,
        # not wherever it lands once sorted by how alarming it is.
        review = review_matter(
            [
                document(CLEAN, title="First", piece=1),
                document(DEFECTIVE, title="Second", piece=2),
                document(CLEAN, title="Third", piece=3),
            ]
        )

        assert [d.title for d in review.documents] == ["First", "Second", "Third"]

    def test_it_reports_how_much_was_read(self) -> None:
        review = review_matter([document(CLEAN), document(DEFECTIVE)])

        assert review.characters == len(CLEAN) + len(DEFECTIVE)


class TestWhatItRefusesToPretend:
    """The failure this module exists to avoid is a clean-looking lie."""

    def test_unreadable_files_are_counted_not_hidden(self) -> None:
        # A scan without OCR has no text. It gets no findings, and the
        # report has to say so — otherwise a matter of 24 files where 6
        # are scans reads as 24 files checked and clean.
        review = review_matter([document(CLEAN)], unreadable=6)

        assert review.checked == 1
        assert review.unreadable == 6

    def test_a_document_too_large_is_skipped_and_said_so(self) -> None:
        from polar.dossier.review import MAX_CHARACTERS

        review = review_matter([document("x" * (MAX_CHARACTERS + 1))])

        assert review.checked == 0
        assert review.too_large == 1

    def test_truncation_is_never_silent(self) -> None:
        # Checking the first 200 of 250 files and reporting "checked" would
        # be the same lie in a different place.
        review = review_matter([document(CLEAN) for _ in range(MAX_DOCUMENTS + 50)])

        assert review.checked == MAX_DOCUMENTS
        assert review.too_large == 50

    def test_an_empty_matter_is_empty_rather_than_clean(self) -> None:
        review = review_matter([])

        assert review.checked == 0
        assert review.finding_count == 0
        assert review.characters == 0

    def test_a_document_with_no_text_is_checked_and_found_empty(self) -> None:
        # Distinct from unreadable: extraction succeeded and the file
        # genuinely holds nothing. It is checked, and it is clean.
        review = review_matter([document("   ")])

        assert review.checked == 1
        assert review.documents[0].findings == []


@pytest.mark.parametrize("text", [None, ""])
def test_a_missing_extraction_does_not_crash(text: str | None) -> None:
    # list_readable_documents should never hand these over, but a review
    # that raises on one would take the whole matter's report with it.
    review = review_matter([document(text)])

    assert review.checked == 1
    assert review.documents[0].findings == []
