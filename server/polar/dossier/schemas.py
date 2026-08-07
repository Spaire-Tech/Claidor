from datetime import datetime
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
