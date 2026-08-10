from uuid import UUID

from fastapi import Depends, HTTPException, Query

from polar.config import settings
from polar.exceptions import ResourceNotFound
from polar.file.repository import FileRepository
from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.librarian.service import librarian
from polar.models import (
    AgentStep,
    AgentTask,
    CitationNature,
    Dossier,
    DossierCitation,
    DossierDocument,
    DossierQuestion,
    DossierRole,
    ExtractionStatus,
)
from polar.models.file import FileServiceTypes
from polar.openapi import APITag
from polar.postgres import get_db_read_session, get_db_session
from polar.routing import APIRouter
from polar.user.repository import UserRepository

from . import auth
from .repository import DossierRepository
from .schemas import (
    AgentStepRead,
    AgentTaskCreate,
    AgentTaskRead,
    CommitmentRead,
    ConflictRead,
    CrossCheckRead,
    DossierAsk,
    DossierCitationRead,
    DossierCreate,
    DossierDocumentCreate,
    DossierDocumentRead,
    DossierDocumentText,
    DossierDocumentUpdate,
    DossierListItem,
    DossierMemberAdd,
    DossierMemberRead,
    DossierQuestionRead,
    DossierRead,
    DossierUpdate,
    MatterDocumentReview,
    MatterFinding,
    MatterReviewRead,
)
from .agent import service as agent_service
from polar.agent import Stopped
from .agent.service import AgentNotConfigured, build_client
from .crosscheck import Commitment, cross_check
from .review import review_matter
from .service import dossier_service

router = APIRouter(prefix="/dossiers", tags=["dossiers", APITag.private])

NOT_FOUND = "Dossier introuvable."


async def _get_dossier_or_404(
    session: AsyncSession | AsyncReadSession, dossier_id: UUID, user_id: UUID
) -> Dossier:
    """A matter the caller is assigned to, or 404.

    Not 403: a lawyer outside the matter learns nothing about it, not even
    that it exists.
    """
    repository = DossierRepository.from_session(session)
    dossier = await repository.get_for_user(dossier_id, user_id)
    if dossier is None:
        raise ResourceNotFound(NOT_FOUND)
    return dossier


async def _require_lead(session: AsyncSession, dossier_id: UUID, user_id: UUID) -> None:
    repository = DossierRepository.from_session(session)
    membership = await repository.get_membership(dossier_id, user_id)
    if membership is None or membership.role != DossierRole.lead:
        raise HTTPException(
            status_code=403,
            detail="Seul un responsable du dossier peut effectuer cette action.",
        )


def _document_schema(document: DossierDocument) -> DossierDocumentRead:
    return DossierDocumentRead(
        id=document.id,
        title=document.title,
        category=document.category,
        piece_number=document.piece_number,
        extraction_status=document.extraction_status,
        file_name=document.file.name,
        mime_type=document.file.mime_type,
        size=document.file.size,
        created_at=document.created_at,
        readable=document.extraction_status == ExtractionStatus.extracted,
    )


def _citation_schema(citation: DossierCitation) -> DossierCitationRead:
    return DossierCitationRead(
        id=citation.id,
        nature=citation.nature,
        source_kind=citation.source_kind,
        source_id=citation.source_id,
        title=citation.title,
        quote=citation.quote,
    )


def _question_schema(
    question: DossierQuestion,
    citations: list[DossierCitation],
    asked_by: str | None,
) -> DossierQuestionRead:
    return DossierQuestionRead(
        id=question.id,
        question=question.question,
        answer=question.answer,
        status=question.status,
        versions_used=question.versions_used,
        authority_label=question.authority_label,
        authority_count=question.authority_count,
        asked_by=asked_by,
        created_at=question.created_at,
        answered_at=question.answered_at,
        facts=[
            _citation_schema(c) for c in citations if c.nature == CitationNature.fact
        ],
        law=[_citation_schema(c) for c in citations if c.nature == CitationNature.law],
    )


@router.get("", response_model=list[DossierListItem])
async def list_dossiers(
    auth_subject: auth.DossierRead,
    organization_id: UUID = Query(...),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[DossierListItem]:
    """The matters the caller is assigned to."""
    repository = DossierRepository.from_session(session)
    dossiers = await repository.list_for_user(
        auth_subject.subject.id, organization_id=organization_id
    )
    documents, members = await repository.count_documents_and_members(
        [d.id for d in dossiers]
    )
    return [
        DossierListItem(
            id=d.id,
            name=d.name,
            reference=d.reference,
            client_name=d.client_name,
            status=d.status,
            document_count=documents.get(d.id, 0),
            member_count=members.get(d.id, 0),
            created_at=d.created_at,
            modified_at=d.modified_at,
        )
        for d in dossiers
    ]


@router.post("", response_model=DossierRead, status_code=201)
async def create_dossier(
    body: DossierCreate,
    auth_subject: auth.DossierWrite,
    organization_id: UUID = Query(...),
    session: AsyncSession = Depends(get_db_session),
) -> DossierRead:
    """Open a matter. The creator is assigned to it as lead."""
    repository = DossierRepository.from_session(session)
    dossier = await repository.create_dossier(
        organization_id=organization_id,
        name=body.name,
        reference=body.reference,
        client_name=body.client_name,
        created_by_id=auth_subject.subject.id,
    )
    return await _read_schema(session, dossier)


async def _read_schema(
    session: AsyncSession | AsyncReadSession, dossier: Dossier
) -> DossierRead:
    repository = DossierRepository.from_session(session)
    members = await repository.list_members(dossier.id)
    documents = await repository.list_documents(dossier.id)
    return DossierRead(
        id=dossier.id,
        name=dossier.name,
        reference=dossier.reference,
        client_name=dossier.client_name,
        status=dossier.status,
        notes=dossier.notes,
        created_at=dossier.created_at,
        members=[
            DossierMemberRead(
                id=m.id, user_id=m.user_id, email=m.user.email, role=m.role
            )
            for m in members
        ],
        documents=[_document_schema(d) for d in documents],
    )


@router.get("/{dossier_id}", response_model=DossierRead)
async def get_dossier(
    dossier_id: UUID,
    auth_subject: auth.DossierRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> DossierRead:
    dossier = await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    return await _read_schema(session, dossier)


@router.patch("/{dossier_id}", response_model=DossierRead)
async def update_dossier(
    dossier_id: UUID,
    body: DossierUpdate,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
) -> DossierRead:
    dossier = await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(dossier, field, value)
    session.add(dossier)
    await session.flush()
    return await _read_schema(session, dossier)


@router.delete("/{dossier_id}", status_code=204)
async def delete_dossier(
    dossier_id: UUID,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a matter — lead only.

    A soft delete: the dossier disappears from the product (every read
    filters on it), but its journalized record — who asked what, answered
    on what basis — survives in the database. A matter's history is not
    something a click should be able to destroy.
    """
    dossier = await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    await _require_lead(session, dossier_id, auth_subject.subject.id)
    repository = DossierRepository.from_session(session)
    await repository.remove_dossier(dossier)


@router.post("/{dossier_id}/members", response_model=DossierMemberRead, status_code=201)
async def add_member(
    dossier_id: UUID,
    body: DossierMemberAdd,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
) -> DossierMemberRead:
    """Assign a colleague to the matter — the only way to grant access.

    By id, or by the email the colleague signs in with. Email resolution
    requires an existing Claidor account: access is granted to a person the
    system knows, never to an address on faith. (Inviting people who have
    no account yet is an email feature, deliberately deferred until
    sending is set up.)
    """
    await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    await _require_lead(session, dossier_id, auth_subject.subject.id)
    user_id = body.user_id
    if user_id is None:
        if not body.email:
            raise ResourceNotFound("Indiquez un utilisateur ou une adresse e-mail.")
        user_repository = UserRepository.from_session(session)
        user = await user_repository.get_by_email(body.email.strip().lower())
        if user is None:
            raise ResourceNotFound(
                "Aucun compte Claidor avec cette adresse. Votre confrère doit "
                "d'abord se connecter une première fois."
            )
        user_id = user.id
    repository = DossierRepository.from_session(session)
    await repository.add_member(
        dossier_id=dossier_id, user_id=user_id, role=body.role
    )
    members = await repository.list_members(dossier_id)
    member = next(m for m in members if m.user_id == user_id)
    return DossierMemberRead(
        id=member.id, user_id=member.user_id, email=member.user.email, role=member.role
    )


@router.delete("/{dossier_id}/members/{user_id}", status_code=204)
async def remove_member(
    dossier_id: UUID,
    user_id: UUID,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    await _require_lead(session, dossier_id, auth_subject.subject.id)
    repository = DossierRepository.from_session(session)
    members = await repository.list_members(dossier_id)
    if len([m for m in members if m.role == DossierRole.lead]) == 1 and any(
        m.user_id == user_id and m.role == DossierRole.lead for m in members
    ):
        raise HTTPException(
            status_code=409,
            detail="Le dossier doit conserver au moins un responsable.",
        )
    if not await repository.remove_member(dossier_id=dossier_id, user_id=user_id):
        raise ResourceNotFound("Ce membre n'est pas affecté au dossier.")


@router.post(
    "/{dossier_id}/documents", response_model=DossierDocumentRead, status_code=201
)
async def add_document(
    dossier_id: UUID,
    body: DossierDocumentCreate,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
) -> DossierDocumentRead:
    """Register an uploaded file as a piece of this matter, and read it.

    Extraction runs here, in the open: the response already says whether
    the piece is readable, so nobody discovers weeks later that a scan
    contributed nothing to the answers.
    """
    dossier = await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    file_repository = FileRepository.from_session(session)
    file = await file_repository.get_by_id(body.file_id)
    if (
        file is None
        or file.organization_id != dossier.organization_id
        or file.service != FileServiceTypes.dossier_document
        or not file.is_uploaded
    ):
        raise ResourceNotFound("Fichier introuvable ou non téléversé.")

    repository = DossierRepository.from_session(session)
    document = await repository.add_document(
        dossier_id=dossier_id,
        file_id=file.id,
        title=body.title,
        category=body.category,
        piece_number=body.piece_number,
        uploaded_by_id=auth_subject.subject.id,
    )
    await dossier_service.extract_document(session, document, file)
    document.file = file
    return _document_schema(document)


@router.patch(
    "/{dossier_id}/documents/{document_id}", response_model=DossierDocumentRead
)
async def update_document(
    dossier_id: UUID,
    document_id: UUID,
    body: DossierDocumentUpdate,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
) -> DossierDocumentRead:
    await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    repository = DossierRepository.from_session(session)
    document = await repository.get_document(document_id, dossier_id)
    if document is None:
        raise ResourceNotFound("Pièce introuvable.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(document, field, value)
    session.add(document)
    await session.flush()
    return _document_schema(document)


@router.delete("/{dossier_id}/documents/{document_id}", status_code=204)
async def remove_document(
    dossier_id: UUID,
    document_id: UUID,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove a piece from the matter.

    Answers that relied on it keep their quotes: the record of what was
    said, and on what basis, does not change because a document was
    withdrawn later.
    """
    await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    repository = DossierRepository.from_session(session)
    document = await repository.get_document(document_id, dossier_id)
    if document is None:
        raise ResourceNotFound("Pièce introuvable.")
    await repository.remove_document(document)


@router.get("/{dossier_id}/questions", response_model=list[DossierQuestionRead])
async def list_questions(
    dossier_id: UUID,
    auth_subject: auth.DossierRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[DossierQuestionRead]:
    """The matter's shared record: every question asked, with its answer."""
    await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    repository = DossierRepository.from_session(session)
    questions = await repository.list_questions(dossier_id)
    ids = [q.id for q in questions]
    citations = await repository.list_citations(ids)
    askers = await repository.list_askers(ids)
    by_question: dict[UUID, list[DossierCitation]] = {}
    for citation in citations:
        by_question.setdefault(citation.question_id, []).append(citation)
    return [
        _question_schema(q, by_question.get(q.id, []), askers.get(q.id))
        for q in questions
    ]


@router.post("/{dossier_id}/ask", response_model=DossierQuestionRead, status_code=201)
async def ask(
    dossier_id: UUID,
    body: DossierAsk,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
    read_session: AsyncReadSession = Depends(get_db_read_session),
) -> DossierQuestionRead:
    """Ask inside the matter: the corpus supplies the law, the file the facts."""
    if not librarian.is_configured():
        raise HTTPException(
            status_code=503, detail="Le bibliothécaire n'est pas configuré."
        )
    dossier = await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)
    question = await dossier_service.ask(
        session,
        read_session,
        dossier=dossier,
        user_id=auth_subject.subject.id,
        question=body.question,
        answer_both_versions=body.answer_both_versions,
    )
    repository = DossierRepository.from_session(session)
    citations = list(await repository.list_citations([question.id]))
    askers = await repository.list_askers([question.id])
    return _question_schema(question, citations, askers.get(question.id))


@router.post("/{dossier_id}/check", response_model=MatterReviewRead)
async def check_matter(
    dossier_id: UUID,
    auth_subject: auth.DossierRead,
    read_session: AsyncReadSession = Depends(get_db_read_session),
) -> MatterReviewRead:
    """Run the checks over every readable document in the matter.

    Vesence's own example of the web app is « run a full consistency check
    across all transaction documents », and this is the deterministic half
    of it: the same ten checks the Word panel runs, applied to each file,
    reported per file with the matter's totals on top.

    A POST rather than a GET because it is work, not a lookup — a bundle of
    two hundred files is seconds of computation, and a route that shape
    should not be behind a cache or a prefetch.

    Nothing is stored. The text is already in the matter; the findings are
    computed and returned, never written back, so a document that changes
    is never disagreed with by a stale report.
    """
    await _get_dossier_or_404(read_session, dossier_id, auth_subject.subject.id)

    repository = DossierRepository.from_session(read_session)
    readable = list(await repository.list_readable_documents(dossier_id))
    everything = list(await repository.list_documents(dossier_id))

    review = review_matter(readable, unreadable=len(everything) - len(readable))

    return MatterReviewRead(
        documents=[
            MatterDocumentReview(
                document_id=document.document_id,
                title=document.title,
                piece_number=document.piece_number,
                characters=document.characters,
                critical_count=document.critical,
                warning_count=document.warning,
                to_review_count=document.to_review,
                findings=[
                    MatterFinding(
                        defect=str(finding.defect),
                        severity=str(finding.severity),
                        certainty=str(finding.certainty),
                        term=finding.term,
                        note=finding.note,
                        context=finding.context,
                        start=finding.start,
                        end=finding.end,
                        literal=finding.literal,
                        occurrence=finding.occurrence,
                    )
                    for finding in document.findings
                ],
            )
            for document in review.documents
        ],
        critical_count=review.critical_count,
        warning_count=review.warning_count,
        to_review_count=review.to_review_count,
        finding_count=review.finding_count,
        checked=review.checked,
        characters=review.characters,
        unreadable=review.unreadable,
        too_large=review.too_large,
    )


@router.get(
    "/{dossier_id}/documents/{document_id}/text",
    response_model=DossierDocumentText,
)
async def read_document_text(
    dossier_id: UUID,
    document_id: UUID,
    auth_subject: auth.DossierRead,
    read_session: AsyncReadSession = Depends(get_db_read_session),
) -> DossierDocumentText:
    """One document's text, for the preview pane.

    The findings from ``/check`` carry character offsets into exactly this
    string, so a preview that showed anything else — a re-extraction, a
    trimmed copy, a rendering — would put every highlight in the wrong
    place without anything failing. It returns what was stored, unchanged.

    A document whose extraction did not succeed returns ``text: null`` and
    its status, rather than an empty string. Blank and unreadable look the
    same on screen and mean opposite things.
    """
    await _get_dossier_or_404(read_session, dossier_id, auth_subject.subject.id)

    repository = DossierRepository.from_session(read_session)
    document = await repository.get_document(document_id, dossier_id)
    if document is None:
        raise ResourceNotFound(NOT_FOUND)

    readable = document.extraction_status == ExtractionStatus.extracted
    text = document.extracted_text if readable else None

    return DossierDocumentText(
        id=document.id,
        title=document.title,
        piece_number=document.piece_number,
        text=text,
        extraction_status=document.extraction_status,
        characters=len(text or ""),
    )


def _task_schema(task: AgentTask, steps: list[AgentStep]) -> AgentTaskRead:
    return AgentTaskRead(
        id=task.id,
        prompt=task.prompt,
        answer=task.answer,
        stopped=task.stopped,
        complete=task.stopped == Stopped.answered,
        error=task.error,
        input_tokens=task.input_tokens,
        output_tokens=task.output_tokens,
        steps=[
            AgentStepRead(
                ordinal=step.ordinal,
                tool=step.tool,
                arguments=step.arguments,
                ok=step.ok,
                summary=step.summary,
                milliseconds=step.milliseconds,
            )
            for step in steps
        ],
        created_at=task.created_at,
    )


@router.post("/{dossier_id}/tasks", response_model=AgentTaskRead, status_code=201)
async def run_agent_task(
    dossier_id: UUID,
    body: AgentTaskCreate,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
) -> AgentTaskRead:
    """Ask the agent to do something with this matter's documents.

    It can list them, read them in windows, search across them and run the
    deterministic checks — and nothing else. It cannot reach a document
    outside the matter, and it cannot write.

    The trace comes back with the answer, because that is how a reader
    tells an answer that was looked up from one that was composed. So does
    ``complete``: a run that hit the step limit or died on a provider error
    is returned rather than hidden, and a caller that shows the answer
    without checking that field would present a partial run as a finished
    one.
    """
    await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)

    try:
        task, outcome = await agent_service.run_task(
            session,
            dossier_id=dossier_id,
            user_id=auth_subject.subject.id,
            prompt=body.prompt,
        )
    except AgentNotConfigured as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    repository = DossierRepository.from_session(session)
    return _task_schema(task, await repository.list_task_steps(task.id))


@router.get("/{dossier_id}/tasks", response_model=list[AgentTaskRead])
async def list_agent_tasks(
    dossier_id: UUID,
    auth_subject: auth.DossierRead,
    read_session: AsyncReadSession = Depends(get_db_read_session),
) -> list[AgentTaskRead]:
    """Everything the agent has been asked to do in this matter.

    Failed and truncated runs included. A matter where three of yesterday's
    twenty tasks silently never happened is worse than one showing three
    failures.
    """
    await _get_dossier_or_404(read_session, dossier_id, auth_subject.subject.id)

    repository = DossierRepository.from_session(read_session)
    tasks = await repository.list_tasks(dossier_id)
    steps = await repository.list_steps_for(task.id for task in tasks)
    return [_task_schema(task, steps.get(task.id, [])) for task in tasks]


@router.post("/{dossier_id}/crosscheck", response_model=CrossCheckRead)
async def cross_check_matter(
    dossier_id: UUID,
    auth_subject: auth.DossierWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CrossCheckRead:
    """Where the matter's documents disagree with each other.

    « The MSA caps liability at USD 1.8M; the LOI at 2.5M » — the finding a
    per-document check can never produce, because each document is
    internally coherent and the transaction is not.

    Slower and more expensive than ``/check``: one model call per document
    plus one to compare, where ``/check`` is arithmetic. A separate route so
    the panel can show what it knows immediately and offer this as a
    deliberate act.

    Three gates stand between a proposal and a conflict here, all of them
    arithmetic — see :mod:`polar.dossier.crosscheck`. Every conflict that
    survives can be shown to a reader as two sentences from two documents.
    """
    await _get_dossier_or_404(session, dossier_id, auth_subject.subject.id)

    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503, detail="The cross-document check is not configured."
        )

    repository = DossierRepository.from_session(session)
    documents = list(await repository.list_documents(dossier_id))
    conflicts, report = await cross_check(build_client(), documents)

    return CrossCheckRead(
        conflicts=[
            ConflictRead(
                subject=group.subject,
                note=group.note,
                positions=[_commitment_schema(p) for p in group.positions],
                pairs=group.pairs,
            )
            for group in conflicts
        ],
        documents_read=report.documents_read,
        unreadable=report.unreadable,
        commitments=report.commitments,
        proposed=report.proposed,
        kept=report.kept,
    )


def _commitment_schema(commitment: Commitment) -> CommitmentRead:
    return CommitmentRead(
        document_id=commitment.document_id,
        document_title=commitment.document_title,
        subject=commitment.subject,
        value=commitment.value,
        quote=commitment.quote,
        start=commitment.start,
        end=commitment.end,
    )
