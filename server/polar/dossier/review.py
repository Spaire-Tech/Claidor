"""Checking every document in a matter at once.

The Check panel answers « is this document coherent ». A transaction is not
one document, and the questions that matter across a set are the ones no
single file can answer: does the cap in the SPA match the one in the letter
of intent, is a term defined in one place and used in three others, does
every schedule referred to actually exist somewhere in the bundle.

This is the first half of that: run the engine over each file and report
what came back, grouped by file, with the same four buckets the panel uses.
Every finding here is arithmetic on one document's text — the same checks,
just applied N times — so nothing in this module can be wrong in a way the
single-document check is not already wrong.

**What it deliberately does not do yet** is compare documents *against each
other*. That needs a different kind of check and it is worth building
separately rather than smuggling in: a cross-document contradiction is a
reading, and readings go through :mod:`polar.redline.judgement`, which
verifies quotes and recomputes arithmetic before anything reaches a reader.
Reporting one here without that machinery would be the most confident wrong
answer the product could give.

**Unreadable files are counted, never guessed at.** A scan without OCR has
no text, so it gets no findings — and the response says how many such files
there were rather than letting a clean-looking result imply the bundle was
clean. « No issues found in 24 files » when six of them could not be read
is the single most dangerous sentence this product could print.
"""

from dataclasses import dataclass, field
from uuid import UUID

import structlog

from polar.models.dossier import DossierDocument
from polar.redline import review_document
from polar.redline.terms import Finding, Severity

log = structlog.get_logger()

#: A transaction bundle is tens of files, not thousands. Beyond this it is a
#: data room and wants the background worker, not a request.
MAX_DOCUMENTS = 200

#: Matches the single-document ceiling. A file longer than this is not a
#: document.
MAX_CHARACTERS = 4_000_000


@dataclass
class DocumentReview:
    """One file's findings."""

    document_id: UUID
    title: str
    piece_number: int | None
    characters: int
    findings: list[Finding] = field(default_factory=list)

    @property
    def critical(self) -> int:
        return _count(self.findings, Severity.critical)

    @property
    def warning(self) -> int:
        return _count(self.findings, Severity.warning)

    @property
    def to_review(self) -> int:
        return _count(self.findings, Severity.to_review)


@dataclass
class MatterReview:
    """Every file in the matter, and what the engine found in each."""

    documents: list[DocumentReview] = field(default_factory=list)
    #: Files in the matter that hold no machine-readable text — a scan
    #: without OCR. Reported so a clean result cannot be mistaken for a
    #: clean bundle.
    unreadable: int = 0
    #: Files past the size ceiling, skipped rather than truncated. Checking
    #: half a document and reporting it as a document is worse than saying
    #: it was not checked.
    too_large: int = 0

    @property
    def checked(self) -> int:
        return len(self.documents)

    @property
    def characters(self) -> int:
        return sum(document.characters for document in self.documents)

    @property
    def critical_count(self) -> int:
        return sum(document.critical for document in self.documents)

    @property
    def warning_count(self) -> int:
        return sum(document.warning for document in self.documents)

    @property
    def to_review_count(self) -> int:
        return sum(document.to_review for document in self.documents)

    @property
    def finding_count(self) -> int:
        return sum(len(document.findings) for document in self.documents)


def _count(findings: list[Finding], severity: Severity) -> int:
    return sum(1 for finding in findings if finding.severity is severity)


def review_matter(
    documents: list[DossierDocument],
    *,
    unreadable: int = 0,
) -> MatterReview:
    """Run the engine over each document and collect the results.

    Pure: it takes the documents and returns the findings. Nothing is read
    from the database here and nothing is written back, which is what makes
    it testable without one.

    Documents are reported in the order given — the repository orders by
    piece number, so the report reads in the order the matter numbers its
    own files rather than by how alarming each one is. A lawyer looking for
    « pièce 4 » should find it where pièce 4 lives.
    """
    review = MatterReview(unreadable=unreadable)

    for document in documents[:MAX_DOCUMENTS]:
        text = document.extracted_text or ""
        if len(text) > MAX_CHARACTERS:
            review.too_large += 1
            log.info(
                "dossier.review.too_large",
                document_id=str(document.id),
                characters=len(text),
            )
            continue

        findings = review_document(text) if text.strip() else []
        review.documents.append(
            DocumentReview(
                document_id=document.id,
                title=document.title,
                piece_number=document.piece_number,
                characters=len(text),
                findings=findings,
            )
        )

    if len(documents) > MAX_DOCUMENTS:
        # Silent truncation would read as "we checked everything".
        review.too_large += len(documents) - MAX_DOCUMENTS
        log.warning(
            "dossier.review.truncated",
            total=len(documents),
            checked=MAX_DOCUMENTS,
        )

    return review


__all__ = [
    "MAX_CHARACTERS",
    "MAX_DOCUMENTS",
    "DocumentReview",
    "MatterReview",
    "review_matter",
]
