from datetime import date
from uuid import UUID

from fastapi import Depends, Query

from polar.corpus import auth
from polar.exceptions import ResourceNotFound
from polar.kit.db.postgres import AsyncReadSession
from polar.openapi import APITag
from polar.postgres import get_db_read_session
from polar.routing import APIRouter

from .schemas import (
    AnalysisSuggestions,
    AuthorityAnalysis,
    CitationsAnalysis,
    CompareAnalysis,
    HistoryAnalysis,
)
from .service import analysis_service

router = APIRouter(prefix="/analyses", tags=["analyses", APITag.private])

NOT_FOUND = "Introuvable dans le corpus chargé."


@router.get("/suggestions", response_model=AnalysisSuggestions)
async def suggestions(
    auth_subject: auth.CorpusRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> AnalysisSuggestions:
    """Where to start, ranked out of the corpus rather than chosen by hand."""
    return await analysis_service.suggestions(session)


@router.get("/authority", response_model=AuthorityAnalysis)
async def authority(
    auth_subject: auth.CorpusRead,
    article_id: UUID | None = Query(None),
    decision_id: UUID | None = Query(None),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> AuthorityAnalysis:
    """Is this held repeatedly, or once — counted on one named article."""
    if (article_id is None) == (decision_id is None):
        raise ResourceNotFound("Indiquez un article ou une décision.")
    result = await analysis_service.authority(
        session, article_id=article_id, decision_id=decision_id
    )
    if result is None:
        raise ResourceNotFound(NOT_FOUND)
    return result


@router.get("/history", response_model=HistoryAnalysis)
async def history(
    auth_subject: auth.CorpusRead,
    article_id: UUID = Query(...),
    on: date | None = Query(None, description="Date of the facts."),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> HistoryAnalysis:
    """The versions of a text, and which one governs on a given date."""
    result = await analysis_service.history(session, article_id=article_id, on=on)
    if result is None:
        raise ResourceNotFound(NOT_FOUND)
    return result


@router.get("/compare", response_model=CompareAnalysis)
async def compare(
    auth_subject: auth.CorpusRead,
    article_id: UUID = Query(...),
    with_article_id: UUID | None = Query(None),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> CompareAnalysis:
    """The two texts side by side, with what moved between them."""
    result = await analysis_service.compare(
        session, article_id=article_id, with_article_id=with_article_id
    )
    if result is None:
        raise ResourceNotFound(
            "Aucune version correspondante n'est enregistrée pour cet article."
        )
    return result


@router.get("/citations", response_model=CitationsAnalysis)
async def citations(
    auth_subject: auth.CorpusRead,
    article_id: UUID = Query(...),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> CitationsAnalysis:
    """An article's life in the courts: who cites it, and with what."""
    result = await analysis_service.citations(session, article_id=article_id)
    if result is None:
        raise ResourceNotFound(NOT_FOUND)
    return result
