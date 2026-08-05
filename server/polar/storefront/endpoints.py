from fastapi import Depends

from polar.email_subscriber.schemas import StorefrontSubscribe
from polar.email_subscriber.service import email_subscriber as email_subscriber_service
from polar.exceptions import ResourceNotFound
from polar.form.service import form as form_service
from polar.kit.pagination import PaginationParams
from polar.kit.schemas import Schema
from polar.models import Product
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .schemas import OrganizationSlugLookup, Storefront
from .service import storefront as storefront_service


class SubscribeResponse(Schema):
    success: bool = True


router = APIRouter(prefix="/storefronts", tags=["storefronts", APITag.private])

OrganizationNotFound = {
    "description": "Organization not found.",
    "model": ResourceNotFound.schema(),
}


@router.get(
    "/{slug}",
    summary="Get Organization Storefront",
    response_model=Storefront,
    responses={404: OrganizationNotFound},
)
async def get(slug: str, session: AsyncSession = Depends(get_db_session)) -> Storefront:
    """Get an organization storefront by slug."""
    organization = await storefront_service.get(session, slug)
    if organization is None:
        raise ResourceNotFound()

    # Retrieve the product that was created from the migrated donation feature
    donation_product: Product | None = None
    for product in organization.products:
        if product.user_metadata.get("donation_product", False):
            donation_product = product

    customers, total = await storefront_service.list_customers(
        session, organization, pagination=PaginationParams(1, 3)
    )

    published_forms = await form_service.list_published(session, organization.id)
    forms = [form_service.build_public(form) for form in published_forms]

    return Storefront.model_validate(
        {
            "organization": organization,
            "products": organization.products,
            "donation_product": donation_product,
            "forms": forms,
            "customers": {
                "total": total,
                "customers": [
                    {
                        "name": customer.name[0]
                        if customer.name
                        else customer.email[0],
                    }
                    for customer in customers
                ],
            },
        }
    )


@router.get(
    "/lookup/product/{product_id}",
    responses={404: OrganizationNotFound},
)
async def get_organization_slug_by_product_id(
    product_id: str, session: AsyncSession = Depends(get_db_session)
) -> OrganizationSlugLookup:
    """Get organization slug by product ID for legacy redirect purposes."""
    organization_slug = await storefront_service.get_organization_slug_by_product_id(
        session, product_id
    )
    if organization_slug is None:
        raise ResourceNotFound()

    return OrganizationSlugLookup(organization_slug=organization_slug)


@router.get(
    "/lookup/domain/{hostname}",
    responses={404: OrganizationNotFound},
)
async def get_organization_slug_by_custom_domain(
    hostname: str, session: AsyncSession = Depends(get_db_session)
) -> OrganizationSlugLookup:
    """Resolve an active custom storefront domain to its organization slug.
    Used by the frontend middleware to route custom-domain requests."""
    organization_slug = await storefront_service.get_organization_slug_by_custom_domain(
        session, hostname.lower().rstrip(".")
    )
    if organization_slug is None:
        raise ResourceNotFound()

    return OrganizationSlugLookup(organization_slug=organization_slug)


@router.get(
    "/lookup/subscription/{subscription_id}",
    responses={404: OrganizationNotFound},
)
async def get_organization_slug_by_subscription_id(
    subscription_id: str, session: AsyncSession = Depends(get_db_session)
) -> OrganizationSlugLookup:
    """Get organization slug by subscription ID for legacy redirect purposes."""
    organization_slug = (
        await storefront_service.get_organization_slug_by_subscription_id(
            session, subscription_id
        )
    )
    if organization_slug is None:
        raise ResourceNotFound()

    return OrganizationSlugLookup(organization_slug=organization_slug)


@router.post(
    "/{slug}/subscribe",
    summary="Subscribe to Storefront",
    response_model=SubscribeResponse,
    status_code=201,
)
async def subscribe_to_storefront(
    slug: str,
    subscribe: StorefrontSubscribe,
    session: AsyncSession = Depends(get_db_session),
) -> SubscribeResponse:
    """Public endpoint: subscribe an email to an organization's storefront."""
    organization = await storefront_service.get(session, slug)
    if organization is None:
        raise ResourceNotFound()

    await email_subscriber_service.subscribe_from_storefront(
        session,
        organization_id=organization.id,
        email=subscribe.email,
        name=subscribe.name,
    )

    return SubscribeResponse(success=True)
