from uuid import UUID

from polar.kit.schemas import Schema


class LecteurFinding(Schema):
    """One reference in the document, and what the corpus says about it."""

    kind: str  # "article" | "decision"
    cite: str
    status: str  # "verified" | "unverified" | "weak"
    note: str
    #: Where « ouvrir » should land, when the reference resolved.
    article_id: UUID | None
    decision_id: UUID | None
    #: The document's own words around the reference.
    context: str


class LecteurReview(Schema):
    document_name: str
    page_count: int | None
    #: The counted line under the filename — never a claim, always a total.
    meta: str
    findings: list[LecteurFinding]
    verified_count: int
    unverified_count: int
    weak_count: int
