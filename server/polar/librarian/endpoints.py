import json
from datetime import datetime
from uuid import UUID

from fastapi import Depends, HTTPException, Query
from pydantic import Field
from sse_starlette.sse import EventSourceResponse

from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.kit.schemas import Schema
from polar.models import QuestionStatus
from polar.openapi import APITag
from polar.postgres import get_db_read_session, get_db_session
from polar.routing import APIRouter

from . import auth
from .repository import LibrarianQuestionRepository
from .service import librarian

router = APIRouter(prefix="/librarian", tags=["librarian", APITag.private])


class LibrarianAsk(Schema):
    question: str = Field(min_length=3, max_length=2000)
    answer_both_versions: bool = Field(
        default=False,
        description=(
            "When the question is version-dependent and undated, answer under "
            "both acts side by side instead of asking for the date."
        ),
    )
    organization_id: UUID | None = Field(
        default=None,
        description=(
            "Workspace the question belongs to. When given, the question and "
            "its answer are kept in Historique."
        ),
    )


class LibrarianQuestionRead(Schema):
    """One line of Historique."""

    id: UUID
    question: str
    answer: str | None
    status: QuestionStatus
    versions_used: list[str] | None
    authority_label: str | None
    authority_count: int | None
    created_at: datetime
    answered_at: datetime | None


@router.get("/questions", response_model=list[LibrarianQuestionRead])
async def list_questions(
    auth_subject: auth.LibrarianRead,
    organization_id: UUID = Query(...),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[LibrarianQuestionRead]:
    """Your own questions asked outside a matter, most recent first."""
    repository = LibrarianQuestionRepository.from_session(session)
    rows = await repository.list_for_user(
        auth_subject.subject.id, organization_id=organization_id
    )
    return [
        LibrarianQuestionRead(
            id=row.id,
            question=row.question,
            answer=row.answer,
            status=row.status,
            versions_used=row.versions_used,
            authority_label=row.authority_label,
            authority_count=row.authority_count,
            created_at=row.created_at,
            answered_at=row.answered_at,
        )
        for row in rows
    ]


@router.post("/ask")
async def ask(
    ask_body: LibrarianAsk,
    auth_subject: auth.LibrarianRead,
    read_session: AsyncReadSession = Depends(get_db_read_session),
    session: AsyncSession = Depends(get_db_session),
) -> EventSourceResponse:
    """Stream a grounded, cited answer from the legal corpus (SSE)."""
    if not librarian.is_configured():
        raise HTTPException(status_code=503, detail="Librarian is not configured.")

    async def event_stream():  # type: ignore[no-untyped-def]
        repository = LibrarianQuestionRepository.from_session(session)
        row = None
        # The row is written before the first token: a question that fails
        # is still a question the lawyer asked, and Historique that only
        # remembers successes is a diary, not a record.
        if ask_body.organization_id is not None:
            row = await repository.create_question(
                user_id=auth_subject.subject.id,
                organization_id=ask_body.organization_id,
                question=ask_body.question,
            )

        parts: list[str] = []
        status = QuestionStatus.failed
        versions_used: list[str] | None = None
        authority_label: str | None = None
        authority_count: int | None = None
        clarification: str | None = None

        async for event in librarian.answer_stream(
            read_session,
            ask_body.question,
            answer_both_versions=ask_body.answer_both_versions,
        ):
            kind = event["type"]
            if kind == "text":
                parts.append(event["delta"])
            elif kind == "authority":
                authority_label = event.get("label")
                authority_count = event.get("count")
            elif kind == "clarification":
                status = QuestionStatus.clarification_requested
                clarification = event.get("message")
            elif kind == "done":
                status = QuestionStatus.answered
                versions_used = event.get("versions_used") or []
            yield {"event": kind, "data": json.dumps(event)}

        if row is not None:
            # Flush only — the request's session is committed by the
            # framework once the stream has finished.
            await repository.record_answer(
                row,
                answer="".join(parts) or clarification,
                status=status,
                versions_used=versions_used,
                authority_label=authority_label,
                authority_count=authority_count,
            )

    return EventSourceResponse(event_stream())
