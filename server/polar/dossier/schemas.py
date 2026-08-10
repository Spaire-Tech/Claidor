from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from polar.kit.schemas import Schema
from polar.models import (
    CitationNature,
    CitationSourceKind,
    DocumentCategory,
    DossierRole,
    DossierStatus,
    ExtractionStatus,
    QuestionStatus,
)


class DossierListItem(Schema):
    id: UUID
    name: str
    reference: str | None
    client_name: str | None
    status: DossierStatus
    document_count: int
    member_count: int
    created_at: datetime
    modified_at: datetime | None


class DossierMemberRead(Schema):
    id: UUID
    user_id: UUID
    email: str
    role: DossierRole


class DossierDocumentRead(Schema):
    id: UUID
    title: str
    category: DocumentCategory
    piece_number: int | None
    extraction_status: ExtractionStatus
    file_name: str
    mime_type: str
    size: int
    created_at: datetime
    # True when the librarian can read this piece. False is not a failure to
    # hide: it tells the team this document contributes nothing to answers
    # until it is replaced by a readable copy.
    readable: bool


class DossierRead(Schema):
    id: UUID
    name: str
    reference: str | None
    client_name: str | None
    status: DossierStatus
    notes: str | None
    created_at: datetime
    members: list[DossierMemberRead]
    documents: list[DossierDocumentRead]


class DossierCreate(Schema):
    name: str = Field(min_length=2, max_length=256)
    reference: str | None = Field(default=None, max_length=64)
    client_name: str | None = Field(default=None, max_length=256)


class DossierUpdate(Schema):
    name: str | None = Field(default=None, min_length=2, max_length=256)
    reference: str | None = Field(default=None, max_length=64)
    client_name: str | None = Field(default=None, max_length=256)
    status: DossierStatus | None = None
    notes: str | None = None


class DossierMemberAdd(Schema):
    """Assign by id, or by the email a colleague signs in with."""

    user_id: UUID | None = None
    email: str | None = Field(default=None, max_length=320)
    role: DossierRole = DossierRole.member


class DossierDocumentCreate(Schema):
    """Registers an already-uploaded file as a piece of this matter."""

    file_id: UUID
    title: str = Field(min_length=1, max_length=512)
    category: DocumentCategory = DocumentCategory.other
    piece_number: int | None = None


class DossierDocumentUpdate(Schema):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    category: DocumentCategory | None = None
    piece_number: int | None = None


class DossierCitationRead(Schema):
    id: UUID
    nature: CitationNature
    source_kind: CitationSourceKind
    source_id: UUID | None
    title: str
    quote: str


class DossierQuestionRead(Schema):
    id: UUID
    question: str
    answer: str | None
    status: QuestionStatus
    versions_used: list[str] | None
    authority_label: str | None
    authority_count: int | None
    asked_by: str | None
    created_at: datetime
    answered_at: datetime | None
    # Split at the boundary that matters: what the answer took from the
    # file, and what it took from the law.
    facts: list[DossierCitationRead]
    law: list[DossierCitationRead]


class DossierAsk(Schema):
    question: str = Field(min_length=3, max_length=2000)
    answer_both_versions: bool = Field(
        default=False,
        description=(
            "When the question is version-dependent and no date can be "
            "established from the file, answer under both acts side by side "
            "instead of asking for the date."
        ),
    )


class MatterFinding(Schema):
    """One defect, in one document of the matter.

    The same shape the Word panel receives, so a finding read in the
    workspace and the same finding read in Word are the same object rather
    than two renderings that can disagree.
    """

    defect: str
    severity: str
    certainty: str
    term: str
    note: str
    context: str
    start: int
    end: int
    literal: str
    occurrence: int


class MatterDocumentReview(Schema):
    document_id: UUID
    title: str
    piece_number: int | None
    characters: int
    critical_count: int
    warning_count: int
    to_review_count: int
    findings: list[MatterFinding]


class MatterReviewRead(Schema):
    """Every document in the matter, and what the engine found in each."""

    documents: list[MatterDocumentReview]
    #: Totals across the matter, so a header can say « Critical (3) »
    #: without summing client-side and disagreeing with the list.
    critical_count: int
    warning_count: int
    to_review_count: int
    finding_count: int
    #: How many files were actually read. The difference between this and
    #: the matter's file count is the next two fields, and printing a clean
    #: result without them would be the most misleading thing here.
    checked: int
    characters: int
    #: Files holding no machine-readable text — a scan without OCR.
    unreadable: int
    #: Files past the size ceiling, skipped rather than truncated.
    too_large: int


class DossierDocumentText(Schema):
    """A document's own words, for reading it in the workspace.

    Separate from :class:`DossierDocumentRead` because it is large: a file
    list of forty documents that each carried its full text would be
    megabytes to render a sidebar. The preview asks for one document at a
    time, which is also how a person reads.
    """

    id: UUID
    title: str
    piece_number: int | None
    #: Absent when extraction did not succeed. The status says why, and the
    #: reader is told rather than shown an empty document that looks blank.
    text: str | None
    extraction_status: ExtractionStatus
    characters: int


class AgentStepRead(Schema):
    """One line of the « Used 12 tools » trace."""

    ordinal: int
    tool: str
    arguments: dict[str, Any]
    ok: bool
    summary: str
    milliseconds: int


class AgentTaskRead(Schema):
    id: UUID
    prompt: str
    #: Empty when the run failed before saying anything. Never invented.
    answer: str
    #: ``answered``, ``step_limit`` or ``failed``.
    stopped: str
    #: True only for ``answered``. A caller showing an answer without
    #: checking this would present a partial run as a finished one.
    complete: bool
    error: str | None
    input_tokens: int
    output_tokens: int
    steps: list[AgentStepRead]
    created_at: datetime


class AgentTaskCreate(Schema):
    prompt: str = Field(min_length=3, max_length=8000)
