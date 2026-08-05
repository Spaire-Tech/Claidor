from fastapi import Depends

from polar.exceptions import ResourceNotFound
from polar.openapi import APITag
from polar.organization.repository import OrganizationRepository
from polar.organization.schemas import OrganizationID
from polar.postgres import AsyncReadSession, get_db_read_session
from polar.routing import APIRouter

from . import auth
from .schemas import Entitlements
from .service import entitlements as entitlements_service

router = APIRouter(prefix="/entitlements", tags=["entitlements", APITag.private])


@router.get(
    "/{organization_id}",
    summary="Get Entitlements",
    response_model=Entitlements,
)
async def get(
    organization_id: OrganizationID,
    auth_subject: auth.EntitlementsRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Entitlements:
    """Return the entitlements (tier, limits, features, fees) for the
    organization. The caller must have read access to the organization.
    """
    organization_repository = OrganizationRepository.from_session(session)
    readable = organization_repository.get_readable_statement(auth_subject).where(
        OrganizationRepository.model.id == organization_id
    )
    organization = await organization_repository.get_one_or_none(readable)
    if organization is None:
        raise ResourceNotFound("Organization not found.")

    tier_entitlements = await entitlements_service.get_for_organization(
        session, organization.id
    )
    return Entitlements.from_dataclass(tier_entitlements)
