from collections.abc import Sequence

from polar.kit.pagination import PaginationParams
from polar.models import Customer, Organization
from polar.postgres import AsyncSession

from .repository import StorefrontRepository


class StorefrontService:
    async def get(self, session: AsyncSession, slug: str) -> Organization | None:
        repository = StorefrontRepository.from_session(session)
        return await repository.get_public_by_slug(slug)

    async def get_organization_slug_by_product_id(
        self, session: AsyncSession, product_id: str
    ) -> str | None:
        """Get organization slug by product ID for legacy redirect purposes."""
        repository = StorefrontRepository.from_session(session)
        return await repository.get_organization_slug_by_product_id(product_id)

    async def get_organization_slug_by_custom_domain(
        self, session: AsyncSession, domain: str
    ) -> str | None:
        """Resolve an active custom storefront domain (learn.creator.com)
        to the owning organization's slug, for host-based routing in the
        frontend middleware."""
        repository = StorefrontRepository.from_session(session)
        return await repository.get_organization_slug_by_custom_domain(domain)

    async def get_organization_slug_by_subscription_id(
        self, session: AsyncSession, subscription_id: str
    ) -> str | None:
        """Get organization slug by subscription ID for legacy redirect purposes."""
        repository = StorefrontRepository.from_session(session)
        return await repository.get_organization_slug_by_subscription_id(
            subscription_id
        )

    async def list_customers(
        self,
        session: AsyncSession,
        organization: Organization,
        *,
        pagination: PaginationParams,
    ) -> tuple[Sequence[Customer], int]:
        repository = StorefrontRepository.from_session(session)
        return await repository.list_customers(organization, pagination=pagination)


storefront = StorefrontService()
