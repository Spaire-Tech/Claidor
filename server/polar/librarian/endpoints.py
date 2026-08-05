import json

from fastapi import Depends, HTTPException
from pydantic import Field
from sse_starlette.sse import EventSourceResponse

from polar.kit.db.postgres import AsyncReadSession
from polar.kit.schemas import Schema
from polar.openapi import APITag
from polar.postgres import get_db_read_session
from polar.routing import APIRouter

from . import auth
from .service import librarian

router = APIRouter(prefix="/librarian", tags=["librarian", APITag.private])


class LibrarianAsk(Schema):
    question: str = Field(min_length=3, max_length=2000)


@router.post("/ask")
async def ask(
    ask_body: LibrarianAsk,
    auth_subject: auth.LibrarianRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> EventSourceResponse:
    """Stream a grounded, cited answer from the legal corpus (SSE)."""
    if not librarian.is_configured():
        raise HTTPException(status_code=503, detail="Librarian is not configured.")

    async def event_stream():  # type: ignore[no-untyped-def]
        async for event in librarian.answer_stream(session, ask_body.question):
            yield {"event": event["type"], "data": json.dumps(event)}

    return EventSourceResponse(event_stream())
