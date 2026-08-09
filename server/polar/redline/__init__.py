"""Mechanical defects in a document, found without asking a model.

A transactional document fails in ways that are *decidable*: a term is
defined and never used, defined twice, used before it is defined, or
written in the wrong case. A cross-reference points at a clause that is not
there. Numbering skips.

None of that needs judgement, and so none of it should be delegated to
something that can be wrong in an unfalsifiable way. A finding here is
either true of the text or it is not, and the finding carries the span it
came from so a reader can check it in one click.

The checks that *do* need judgement — is this indemnity mutual, does this
arithmetic hold — come later and are labelled differently. Keeping the two
apart is the whole design: a lawyer who learns that the mechanical findings
are always right will read the judgement ones properly.
"""

from .structure import review_structure
from .terms import (
    SEVERITY,
    Certainty,
    Defect,
    Definition,
    Finding,
    Severity,
    review_terms,
)


def review_document(text: str) -> list[Finding]:
    """Every mechanical defect in the document, in document order.

    Defined terms and structure are separate modules because they fail in
    separate ways, but a reader sees one list.
    """
    findings = review_terms(text) + review_structure(text)
    findings.sort(key=lambda finding: (finding.start, finding.defect))
    return findings


__all__ = [
    "SEVERITY",
    "Certainty",
    "Defect",
    "Definition",
    "Finding",
    "Severity",
    "review_document",
    "review_structure",
    "review_terms",
]
