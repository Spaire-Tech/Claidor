from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel

if TYPE_CHECKING:
    from polar.models import File, Organization, User


class DossierStatus(StrEnum):
    open = "open"
    closed = "closed"
    archived = "archived"


class Dossier(RecordModel):
    """A workspace for one matter: its file, its questions, its answers.

    Closed by default — visibility is granted per matter through
    ``DossierMember``, never inherited from the organization. Membership is
    the only key: every read path joins it (see ``DossierRepository``), so
    a lawyer who is not on the matter cannot reach its documents, its
    questions or its answers.
    """

    __tablename__ = "dossiers"

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:
        return relationship("Organization", lazy="raise")

    # How the firm names the matter: "Recouvrement — BICIS c/ SODICA".
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    # The firm's own file reference, when it has one.
    reference: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default=None
    )
    client_name: Mapped[str | None] = mapped_column(
        String(256), nullable=True, default=None
    )
    status: Mapped[DossierStatus] = mapped_column(
        String(16), nullable=False, default=DossierStatus.open, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)

    created_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="restrict"), nullable=False
    )

    @declared_attr
    def created_by(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise", foreign_keys="Dossier.created_by_id")

    members: Mapped[list["DossierMember"]] = relationship(
        "DossierMember", back_populates="dossier", lazy="raise"
    )
    documents: Mapped[list["DossierDocument"]] = relationship(
        "DossierDocument", back_populates="dossier", lazy="raise"
    )


class DossierRole(StrEnum):
    # Can add and remove members, and archive the matter.
    lead = "lead"
    member = "member"


class DossierMember(RecordModel):
    """A lawyer assigned to a matter — the unit of access."""

    __tablename__ = "dossier_members"
    __table_args__ = (UniqueConstraint("dossier_id", "user_id"),)

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("dossiers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )
    role: Mapped[DossierRole] = mapped_column(
        String(16), nullable=False, default=DossierRole.member
    )

    dossier: Mapped["Dossier"] = relationship(
        "Dossier", back_populates="members", lazy="raise"
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship(
            "User", lazy="raise", foreign_keys="DossierMember.user_id"
        )


class DocumentCategory(StrEnum):
    pleading = "pleading"  # conclusions, assignation, requête
    exhibit = "exhibit"  # pièce (PV de saisie, constat…)
    contract = "contract"
    statement = "statement"  # relevé bancaire, décompte
    correspondence = "correspondence"
    decision = "decision"  # jugement/arrêt rendu dans CE dossier
    other = "other"


class ExtractionStatus(StrEnum):
    pending = "pending"
    extracted = "extracted"
    # The file carries no machine-readable text (a scan without OCR). It
    # stays in the file for the humans; it is never sent to the model as if
    # its contents were known.
    unextractable = "unextractable"
    failed = "failed"


class DossierDocument(RecordModel):
    """A piece of the case file, held where the matter lives.

    ``extracted_text`` is what the librarian may read; it exists only when
    extraction genuinely succeeded, so a scan the machine cannot read never
    silently becomes a source for an answer.
    """

    __tablename__ = "dossier_documents"
    __table_args__ = (UniqueConstraint("dossier_id", "file_id"),)

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("dossiers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    file_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("files.id", ondelete="cascade"), nullable=False, index=True
    )
    category: Mapped[DocumentCategory] = mapped_column(
        String(24), nullable=False, default=DocumentCategory.other, index=True
    )
    # "pièce n° 4" — how the document is cited in the matter. Assigned per
    # dossier, stable once given.
    piece_number: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    # Practitioner's label: "PV de saisie-attribution du 12 janvier 2024".
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    extraction_status: Mapped[ExtractionStatus] = mapped_column(
        String(16), nullable=False, default=ExtractionStatus.pending, index=True
    )
    extracted_text: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    uploaded_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="restrict"), nullable=False
    )

    dossier: Mapped["Dossier"] = relationship(
        "Dossier", back_populates="documents", lazy="raise"
    )

    @declared_attr
    def file(cls) -> Mapped["File"]:
        return relationship("File", lazy="raise")


class QuestionStatus(StrEnum):
    answered = "answered"
    # The version gate asked for the date of commencement instead of
    # answering — kept in the record, because "we had to ask" is itself
    # part of the matter's history.
    clarification_requested = "clarification_requested"
    failed = "failed"


class DossierQuestion(RecordModel):
    """One question asked inside a matter, with its answer — the shared record.

    Kept so a colleague joining in month four reads what has already been
    established instead of asking it again.
    """

    __tablename__ = "dossier_questions"

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("dossiers.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    asked_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="restrict"), nullable=False, index=True
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    status: Mapped[QuestionStatus] = mapped_column(
        String(32), nullable=False, default=QuestionStatus.answered, index=True
    )
    # Which act versions the answer was given under ("1998", "2023") — the
    # same structured metadata the librarian emits, kept with the answer.
    versions_used: Mapped[list | None] = mapped_column(
        JSONB, nullable=True, default=None
    )
    # The computed authority signal, stored as shown.
    authority_label: Mapped[str | None] = mapped_column(
        Text, nullable=True, default=None
    )
    authority_count: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None
    )
    answered_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )

    citations: Mapped[list["DossierCitation"]] = relationship(
        "DossierCitation", back_populates="question", lazy="raise"
    )


class CitationNature(StrEnum):
    """What a citation rests on — never mixed, always shown.

    A date read off an exhibit and a rule read off an article are different
    kinds of claim: one can be wrong because the file is wrong, the other
    because the law was misread. The product labels them apart so a reader
    always knows which is which.
    """

    fact = "fact"  # from a document in this dossier
    law = "law"  # from the OHADA corpus (article or decision)


class CitationSourceKind(StrEnum):
    document = "document"
    article = "article"
    decision = "decision"


class DossierCitation(RecordModel):
    """One anchored claim inside an answer.

    Every row carries the quote it rests on. For facts, that quote is
    verified to appear literally in the document's extracted text before
    the row is written — an unverifiable fact is dropped, never displayed.
    """

    __tablename__ = "dossier_citations"

    question_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("dossier_questions.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )
    nature: Mapped[CitationNature] = mapped_column(
        String(8), nullable=False, index=True
    )
    source_kind: Mapped[CitationSourceKind] = mapped_column(
        String(16), nullable=False
    )
    # Points at a dossier_documents.id, legal_articles.id or
    # court_decisions.id depending on source_kind. Deliberately not a
    # foreign key: an answer's record must survive a document being
    # removed from the dossier — the quote and title stay readable.
    source_id: Mapped[UUID | None] = mapped_column(
        Uuid, nullable=True, default=None, index=True
    )
    # As displayed: "PV de saisie-attribution, pièce n° 4" or
    # "AUPSRVE (1998) — Article 170".
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    quote: Mapped[str] = mapped_column(Text, nullable=False)

    question: Mapped["DossierQuestion"] = relationship(
        "DossierQuestion", back_populates="citations", lazy="raise"
    )
