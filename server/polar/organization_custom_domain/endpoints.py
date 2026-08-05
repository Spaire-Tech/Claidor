from fastapi import Depends

from polar.auth.models import AuthSubject, User
from polar.exceptions import ResourceNotFound
from polar.models import Organization
from polar.openapi import APITag
from polar.organization.repository import OrganizationRepository
from polar.organization.schemas import OrganizationID
from polar.postgres import (
    AsyncReadSession,
    AsyncSession,
    get_db_read_session,
    get_db_session,
)
from polar.routing import APIRouter

from . import auth
from .schemas import CustomDomainChecks, CustomDomainSet, CustomDomainStatus
from .service import organization_custom_domain as custom_domain_service

router = APIRouter(
    prefix="/organizations",
    tags=["custom_domains", APITag.private],
)

OrganizationNotFound = {
    "description": "Organization not found.",
    "model": ResourceNotFound.schema(),
}


async def _get_readable_organization(
    session: AsyncReadSession,
    auth_subject: AuthSubject[User | Organization],
    organization_id: OrganizationID,
) -> Organization:
    repository = OrganizationRepository.from_session(session)
    statement = repository.get_readable_statement(auth_subject).where(
        Organization.id == organization_id
    )
    organization = await repository.get_one_or_none(statement)
    if organization is None:
        raise ResourceNotFound("Organization not found.")
    return organization


def _empty_status() -> CustomDomainStatus:
    return CustomDomainStatus(
        domain=None,
        status=None,
        verified_at=None,
        last_checked_at=None,
        dns_records=[],
    )


@router.get(
    "/{organization_id}/custom-domain",
    summary="Get Custom Storefront Domain Status",
    response_model=CustomDomainStatus,
    responses={404: OrganizationNotFound},
)
async def get_custom_domain(
    organization_id: OrganizationID,
    auth_subject: auth.CustomDomainRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> CustomDomainStatus:
    """Current state of the org's custom storefront domain: the configured
    domain, its verification status, and the DNS records the creator must
    install. All fields are None/empty when no domain is configured."""
    organization = await _get_readable_organization(
        session, auth_subject, organization_id
    )
    custom_domain = await custom_domain_service.get_for_organization(
        session, organization.id
    )
    if custom_domain is None:
        return _empty_status()
    return CustomDomainStatus(
        domain=custom_domain.domain,
        status=custom_domain.status,
        verified_at=custom_domain.verified_at,
        last_checked_at=custom_domain.last_checked_at,
        dns_records=custom_domain_service.get_dns_records(custom_domain),
    )


@router.put(
    "/{organization_id}/custom-domain",
    summary="Set Custom Storefront Domain",
    response_model=CustomDomainStatus,
    responses={404: OrganizationNotFound},
)
async def set_custom_domain(
    organization_id: OrganizationID,
    body: CustomDomainSet,
    auth_subject: auth.CustomDomainWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CustomDomainStatus:
    """Set or replace the org's custom storefront domain. Requires the
    custom_storefront_domain entitlement (Studio plan and above). Returns
    the DNS records to install; verification runs automatically."""
    organization = await _get_readable_organization(
        session, auth_subject, organization_id
    )
    custom_domain = await custom_domain_service.set_domain(
        session, organization, body.domain
    )
    return CustomDomainStatus(
        domain=custom_domain.domain,
        status=custom_domain.status,
        verified_at=custom_domain.verified_at,
        last_checked_at=custom_domain.last_checked_at,
        dns_records=custom_domain_service.get_dns_records(custom_domain),
    )


@router.post(
    "/{organization_id}/custom-domain/verify",
    summary="Verify Custom Storefront Domain",
    response_model=CustomDomainStatus,
    responses={404: OrganizationNotFound},
)
async def verify_custom_domain(
    organization_id: OrganizationID,
    auth_subject: auth.CustomDomainWrite,
    session: AsyncSession = Depends(get_db_session),
) -> CustomDomainStatus:
    """Check the domain's DNS records now and return the updated state,
    including which record checks passed."""
    organization = await _get_readable_organization(
        session, auth_subject, organization_id
    )
    custom_domain = await custom_domain_service.get_for_organization(
        session, organization.id
    )
    if custom_domain is None:
        return _empty_status()
    result = await custom_domain_service.verify(session, custom_domain)
    return CustomDomainStatus(
        domain=custom_domain.domain,
        status=custom_domain.status,
        verified_at=custom_domain.verified_at,
        last_checked_at=custom_domain.last_checked_at,
        dns_records=custom_domain_service.get_dns_records(custom_domain),
        checks=CustomDomainChecks(cname_ok=result.cname_ok, txt_ok=result.txt_ok),
    )


@router.delete(
    "/{organization_id}/custom-domain",
    summary="Remove Custom Storefront Domain",
    status_code=204,
    responses={404: OrganizationNotFound},
)
async def delete_custom_domain(
    organization_id: OrganizationID,
    auth_subject: auth.CustomDomainWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Remove the org's custom domain. The storefront falls back to its
    platform-hosted URL immediately."""
    organization = await _get_readable_organization(
        session, auth_subject, organization_id
    )
    await custom_domain_service.remove(session, organization.id)
