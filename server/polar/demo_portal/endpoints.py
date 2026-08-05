from fastapi import Depends, HTTPException

from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .schemas import DemoPortalSession
from .service import demo_portal as demo_portal_service

router = APIRouter(prefix="/demo-portal", tags=["demo-portal", APITag.private])


@router.post(
    "/{slug}/session",
    response_model=DemoPortalSession,
    summary="Create Demo Portal Session",
)
async def create_demo_session(
    slug: str,
    session: AsyncSession = Depends(get_db_session),
) -> DemoPortalSession:
    """Mint a throwaway customer session for the configured demo organization.

    Public and unauthenticated *by design* — but it only ever works for the one
    org named in ``DEMO_PORTAL_ORG_SLUG``. Any other slug, or the feature being
    unset, returns 404, so it can't be pointed at real customers' portals.
    """
    result = await demo_portal_service.create_session(session, slug)
    if result is None:
        raise HTTPException(status_code=404)

    token, organization = result
    return DemoPortalSession(token=token, organization_slug=organization.slug)
