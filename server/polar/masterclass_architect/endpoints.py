"""Masterclass Architect endpoints — the wizard's engine API.

POST resolves the pasted link synchronously (the instant-confirmation beat)
and enqueues the analysis; the wizard then polls GET until mirror_ready and
completed. Failures surface as a `failed` status with a typed reason — the
wizard maps every reason to warm fork copy, so these endpoints never need
to produce a user-facing error for a bad channel.
"""

from uuid import UUID

from fastapi import Depends, HTTPException

from polar.exceptions import ResourceNotFound
from polar.models import MasterclassArchitectAnalysis
from polar.openapi import APITag
from polar.organization.resolver import get_payload_organization
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from . import auth
from .repository import MasterclassArchitectAnalysisRepository
from .schemas import Analysis, AnalysisCreate, AnalysisFaqUpdate
from .service import ArchitectNotConfigured, masterclass_architect_service

router = APIRouter(
    prefix="/masterclass-architect",
    tags=["masterclass_architect", APITag.private],
)


@router.post(
    "/analyses",
    response_model=Analysis,
    status_code=201,
    summary="Start a channel analysis",
)
async def create_analysis(
    analysis_create: AnalysisCreate,
    auth_subject: auth.ArchitectWrite,
    session: AsyncSession = Depends(get_db_session),
) -> MasterclassArchitectAnalysis:
    organization = await get_payload_organization(
        session, auth_subject, analysis_create
    )
    try:
        return await masterclass_architect_service.create(
            session,
            auth_subject,
            organization_id=organization.id,
            ref=analysis_create.ref,
            faq_answer=analysis_create.faq_answer,
        )
    except ArchitectNotConfigured as e:
        raise HTTPException(status_code=503, detail=e.message) from e


@router.get(
    "/analyses/{id}",
    response_model=Analysis,
    summary="Poll an analysis",
)
async def get_analysis(
    id: UUID,
    auth_subject: auth.ArchitectRead,
    session: AsyncSession = Depends(get_db_session),
) -> MasterclassArchitectAnalysis:
    repository = MasterclassArchitectAnalysisRepository.from_session(session)
    analysis = await repository.get_readable_by_id(auth_subject, id)
    if analysis is None:
        raise ResourceNotFound()
    return analysis


@router.patch(
    "/analyses/{id}/faq",
    response_model=Analysis,
    summary='Store the "what do people keep asking you?" answer',
)
async def set_faq_answer(
    id: UUID,
    faq_update: AnalysisFaqUpdate,
    auth_subject: auth.ArchitectWrite,
    session: AsyncSession = Depends(get_db_session),
) -> MasterclassArchitectAnalysis:
    repository = MasterclassArchitectAnalysisRepository.from_session(session)
    analysis = await repository.get_readable_by_id(auth_subject, id)
    if analysis is None:
        raise ResourceNotFound()
    return await masterclass_architect_service.set_faq_answer(
        session, analysis, faq_answer=faq_update.faq_answer
    )
