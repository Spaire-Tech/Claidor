from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import contains_eager, joinedload

from polar.kit.repository import RepositoryBase
from polar.models import (
    CitationNature,
    CitationSourceKind,
    DocumentCategory,
    Dossier,
    DossierCitation,
    DossierDocument,
    DossierMember,
    DossierQuestion,
    DossierRole,
    DossierStatus,
    ExtractionStatus,
    QuestionStatus,
    User,
)


class DossierRepository(RepositoryBase[Dossier]):
    """All dossier access, scoped by membership.

    Every read here joins ``DossierMember`` for the requesting user. A
    dossier is closed by default: organization membership grants nothing,
    so a lawyer who is not on the matter gets the same answer as a
    stranger — not found.
    """

    model = Dossier

    # --- access ----------------------------------------------------------

    async def get_for_user(self, dossier_id: UUID, user_id: UUID) -> Dossier | None:
        """The dossier, only if this user is assigned to it."""
        statement = (
            select(Dossier)
            .join(DossierMember, DossierMember.dossier_id == Dossier.id)
            .where(
                Dossier.id == dossier_id,
                Dossier.deleted_at.is_(None),
                DossierMember.user_id == user_id,
                DossierMember.deleted_at.is_(None),
            )
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def get_membership(
        self, dossier_id: UUID, user_id: UUID
    ) -> DossierMember | None:
        statement = select(DossierMember).where(
            DossierMember.dossier_id == dossier_id,
            DossierMember.user_id == user_id,
            DossierMember.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def list_for_user(
        self, user_id: UUID, *, organization_id: UUID
    ) -> Sequence[Dossier]:
        """The matters this user is assigned to, most recently touched first."""
        statement = (
            select(Dossier)
            .join(DossierMember, DossierMember.dossier_id == Dossier.id)
            .where(
                Dossier.organization_id == organization_id,
                Dossier.deleted_at.is_(None),
                DossierMember.user_id == user_id,
                DossierMember.deleted_at.is_(None),
            )
            .order_by(Dossier.modified_at.desc().nullslast(), Dossier.created_at.desc())
        )
        return (await self.session.execute(statement)).scalars().all()

    async def count_documents_and_members(
        self, dossier_ids: Sequence[UUID]
    ) -> tuple[dict[UUID, int], dict[UUID, int]]:
        """Per-dossier counts for the index list ("14 pièces · 3 avocats")."""
        if not dossier_ids:
            return {}, {}
        document_rows = (
            await self.session.execute(
                select(DossierDocument.dossier_id, func.count(DossierDocument.id))
                .where(
                    DossierDocument.dossier_id.in_(list(dossier_ids)),
                    DossierDocument.deleted_at.is_(None),
                )
                .group_by(DossierDocument.dossier_id)
            )
        ).all()
        member_rows = (
            await self.session.execute(
                select(DossierMember.dossier_id, func.count(DossierMember.id))
                .where(
                    DossierMember.dossier_id.in_(list(dossier_ids)),
                    DossierMember.deleted_at.is_(None),
                )
                .group_by(DossierMember.dossier_id)
            )
        ).all()
        documents = {dossier_id: count for dossier_id, count in document_rows}
        members = {dossier_id: count for dossier_id, count in member_rows}
        return documents, members

    # --- writes ----------------------------------------------------------

    async def create_dossier(
        self,
        *,
        organization_id: UUID,
        name: str,
        created_by_id: UUID,
        reference: str | None = None,
        client_name: str | None = None,
    ) -> Dossier:
        """Create a matter and assign its creator as lead in one step.

        A dossier without members would be unreachable by anyone — the
        creator's assignment is part of creating it, not a later call.
        """
        dossier = Dossier(
            organization_id=organization_id,
            name=name,
            reference=reference,
            client_name=client_name,
            status=DossierStatus.open,
            created_by_id=created_by_id,
        )
        self.session.add(dossier)
        await self.session.flush()
        self.session.add(
            DossierMember(
                dossier_id=dossier.id,
                user_id=created_by_id,
                role=DossierRole.lead,
            )
        )
        await self.session.flush()
        return dossier

    async def remove_dossier(self, dossier: Dossier) -> None:
        """Soft-delete the matter: gone from every list and lookup here
        (they all filter ``deleted_at``), while the journalized record —
        questions, answers, citations — survives in the database."""
        dossier.set_deleted_at()
        self.session.add(dossier)
        await self.session.flush()

    async def add_member(
        self, *, dossier_id: UUID, user_id: UUID, role: DossierRole
    ) -> DossierMember:
        existing = await self.get_membership(dossier_id, user_id)
        if existing is not None:
            existing.role = role
            self.session.add(existing)
            await self.session.flush()
            return existing
        member = DossierMember(dossier_id=dossier_id, user_id=user_id, role=role)
        self.session.add(member)
        await self.session.flush()
        return member

    async def remove_member(self, *, dossier_id: UUID, user_id: UUID) -> bool:
        member = await self.get_membership(dossier_id, user_id)
        if member is None:
            return False
        member.set_deleted_at()
        self.session.add(member)
        await self.session.flush()
        return True

    async def list_members(self, dossier_id: UUID) -> Sequence[DossierMember]:
        statement = (
            select(DossierMember)
            .join(User, User.id == DossierMember.user_id)
            .where(
                DossierMember.dossier_id == dossier_id,
                DossierMember.deleted_at.is_(None),
            )
            .options(contains_eager(DossierMember.user))
            .order_by(DossierMember.created_at)
        )
        # unique(): User carries joined eager loads of its own (OAuth
        # accounts), so the result contains collection joins.
        return (await self.session.execute(statement)).unique().scalars().all()

    # --- documents -------------------------------------------------------

    async def next_piece_number(self, dossier_id: UUID) -> int:
        """Piece numbers are per-matter and never reused."""
        highest = (
            await self.session.execute(
                select(func.max(DossierDocument.piece_number)).where(
                    DossierDocument.dossier_id == dossier_id
                )
            )
        ).scalar_one_or_none()
        return (highest or 0) + 1

    async def add_document(
        self,
        *,
        dossier_id: UUID,
        file_id: UUID,
        title: str,
        category: DocumentCategory,
        uploaded_by_id: UUID,
        piece_number: int | None = None,
    ) -> DossierDocument:
        document = DossierDocument(
            dossier_id=dossier_id,
            file_id=file_id,
            title=title,
            category=category,
            piece_number=(
                piece_number
                if piece_number is not None
                else await self.next_piece_number(dossier_id)
            ),
            extraction_status=ExtractionStatus.pending,
            uploaded_by_id=uploaded_by_id,
        )
        self.session.add(document)
        await self.session.flush()
        return document

    async def list_documents(self, dossier_id: UUID) -> Sequence[DossierDocument]:
        statement = (
            select(DossierDocument)
            .where(
                DossierDocument.dossier_id == dossier_id,
                DossierDocument.deleted_at.is_(None),
            )
            .options(joinedload(DossierDocument.file))
            .order_by(DossierDocument.piece_number)
        )
        return (await self.session.execute(statement)).unique().scalars().all()

    async def list_readable_documents(
        self, dossier_id: UUID
    ) -> Sequence[DossierDocument]:
        """Documents whose text extraction genuinely succeeded.

        These are the only ones the librarian may read. A scan without OCR
        stays in the file for the humans and out of the prompt — the model
        never receives a document whose contents we could not read.
        """
        statement = (
            select(DossierDocument)
            .where(
                DossierDocument.dossier_id == dossier_id,
                DossierDocument.deleted_at.is_(None),
                DossierDocument.extraction_status == ExtractionStatus.extracted,
                DossierDocument.extracted_text.is_not(None),
            )
            .order_by(DossierDocument.piece_number)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def get_document(
        self, document_id: UUID, dossier_id: UUID
    ) -> DossierDocument | None:
        statement = (
            select(DossierDocument)
            .where(
                DossierDocument.id == document_id,
                DossierDocument.dossier_id == dossier_id,
                DossierDocument.deleted_at.is_(None),
            )
            .options(joinedload(DossierDocument.file))
        )
        return (await self.session.execute(statement)).unique().scalar_one_or_none()

    async def set_extraction(
        self,
        document: DossierDocument,
        *,
        status: ExtractionStatus,
        text: str | None = None,
    ) -> DossierDocument:
        document.extraction_status = status
        document.extracted_text = text
        self.session.add(document)
        await self.session.flush()
        return document

    async def remove_document(self, document: DossierDocument) -> None:
        document.set_deleted_at()
        self.session.add(document)
        await self.session.flush()

    # --- questions & answers --------------------------------------------

    async def create_question(
        self, *, dossier_id: UUID, asked_by_id: UUID, question: str
    ) -> DossierQuestion:
        row = DossierQuestion(
            dossier_id=dossier_id,
            asked_by_id=asked_by_id,
            question=question,
            status=QuestionStatus.answered,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def record_answer(
        self,
        question: DossierQuestion,
        *,
        answer: str | None,
        status: QuestionStatus,
        versions_used: list[str] | None = None,
        authority_label: str | None = None,
        authority_count: int | None = None,
    ) -> DossierQuestion:
        question.answer = answer
        question.status = status
        question.versions_used = versions_used
        question.authority_label = authority_label
        question.authority_count = authority_count
        question.answered_at = datetime.now(UTC)
        self.session.add(question)
        await self.session.flush()
        return question

    async def add_citation(
        self,
        *,
        question_id: UUID,
        nature: CitationNature,
        source_kind: CitationSourceKind,
        source_id: UUID | None,
        title: str,
        quote: str,
    ) -> DossierCitation:
        citation = DossierCitation(
            question_id=question_id,
            nature=nature,
            source_kind=source_kind,
            source_id=source_id,
            title=title,
            quote=quote,
        )
        self.session.add(citation)
        await self.session.flush()
        return citation

    async def list_questions(self, dossier_id: UUID) -> Sequence[DossierQuestion]:
        """The matter's shared record, newest first."""
        statement = (
            select(DossierQuestion)
            .where(
                DossierQuestion.dossier_id == dossier_id,
                DossierQuestion.deleted_at.is_(None),
            )
            .order_by(DossierQuestion.created_at.desc())
        )
        return (await self.session.execute(statement)).scalars().all()

    async def get_question(
        self, question_id: UUID, dossier_id: UUID
    ) -> DossierQuestion | None:
        statement = select(DossierQuestion).where(
            DossierQuestion.id == question_id,
            DossierQuestion.dossier_id == dossier_id,
            DossierQuestion.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def list_citations(
        self, question_ids: Sequence[UUID]
    ) -> Sequence[DossierCitation]:
        if not question_ids:
            return []
        statement = (
            select(DossierCitation)
            .where(
                DossierCitation.question_id.in_(list(question_ids)),
                DossierCitation.deleted_at.is_(None),
            )
            # Facts before law: the reader checks what the answer took from
            # the file before what it took from the corpus.
            .order_by(
                DossierCitation.question_id,
                DossierCitation.nature,
                DossierCitation.created_at,
            )
        )
        return (await self.session.execute(statement)).scalars().all()

    async def list_askers(self, question_ids: Sequence[UUID]) -> dict[UUID, str]:
        """Display names of who asked, keyed by question id."""
        if not question_ids:
            return {}
        statement = (
            select(DossierQuestion.id, User.email)
            .join(User, User.id == DossierQuestion.asked_by_id)
            .where(DossierQuestion.id.in_(list(question_ids)))
        )
        rows = (await self.session.execute(statement)).all()
        return {qid: email for qid, email in rows}
