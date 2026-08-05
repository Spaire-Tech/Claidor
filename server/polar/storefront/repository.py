from collections.abc import Sequence

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import selectinload

from polar.kit.pagination import PaginationParams, paginate
from polar.kit.repository import RepositoryBase
from polar.models import (
    Customer,
    Order,
    Organization,
    OrganizationCustomDomain,
    Product,
    Subscription,
)
from polar.models.organization_custom_domain import OrganizationCustomDomainStatus
from polar.models.product import ProductCategory


class StorefrontRepository(RepositoryBase[Organization]):
    model = Organization

    async def get_public_by_slug(self, slug: str) -> Organization | None:
        # A storefront is public when the creator explicitly enabled the Space,
        # OR when the org has a live course. The course-only reposition (Phase 6)
        # hides the Space UI and no longer flips `storefront_enabled`, so gating
        # solely on that flag 404s every course landing (the bare `/{slug}` page
        # redirects to the course, and both it and `/{slug}/products/{id}` resolve
        # through this query). Treating "has a live course" as public keeps those
        # landings reachable without resurrecting the hidden Space toggle.
        has_live_course = exists(
            select(1).where(
                Product.organization_id == Organization.id,
                Product.category == ProductCategory.course,
                Product.is_archived.is_(False),
                Product.deleted_at.is_(None),
            )
        )
        statement = (
            select(Organization)
            .where(
                Organization.deleted_at.is_(None),
                Organization.blocked_at.is_(None),
                Organization.slug == slug,
                or_(Organization.storefront_enabled.is_(True), has_live_course),
            )
            .options(
                selectinload(Organization.products).options(
                    selectinload(Product.product_medias)
                )
            )
        )
        result = await self.session.execute(statement)
        return result.unique().scalar_one_or_none()

    async def get_organization_slug_by_product_id(self, product_id: str) -> str | None:
        statement = (
            select(Organization.slug)
            .join(Product, Product.organization_id == Organization.id)
            .where(
                Product.id == product_id,
                Product.deleted_at.is_(None),
                Organization.deleted_at.is_(None),
                Organization.blocked_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_organization_slug_by_custom_domain(self, domain: str) -> str | None:
        statement = (
            select(Organization.slug)
            .join(
                OrganizationCustomDomain,
                OrganizationCustomDomain.organization_id == Organization.id,
            )
            .where(
                OrganizationCustomDomain.domain == domain,
                OrganizationCustomDomain.status
                == OrganizationCustomDomainStatus.active,
                OrganizationCustomDomain.deleted_at.is_(None),
                Organization.deleted_at.is_(None),
                Organization.blocked_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def get_organization_slug_by_subscription_id(
        self, subscription_id: str
    ) -> str | None:
        statement = (
            select(Organization.slug)
            .join(Product, Product.organization_id == Organization.id)
            .join(Subscription, Subscription.product_id == Product.id)
            .where(
                Subscription.id == subscription_id,
                Subscription.deleted_at.is_(None),
                Product.deleted_at.is_(None),
                Organization.deleted_at.is_(None),
                Organization.blocked_at.is_(None),
            )
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_customers(
        self,
        organization: Organization,
        *,
        pagination: PaginationParams,
    ) -> tuple[Sequence[Customer], int]:
        statement = select(Customer).where(
            Customer.id.in_(
                select(Order.customer_id)
                .join(Product, Product.id == Order.product_id, isouter=True)
                .where(
                    Order.deleted_at.is_(None),
                    Product.organization_id == organization.id,
                )
            )
        )
        return await paginate(self.session, statement, pagination=pagination)
