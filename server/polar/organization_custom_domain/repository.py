from uuid import UUID

from polar.kit.repository import RepositoryBase
from polar.models import OrganizationCustomDomain


class OrganizationCustomDomainRepository(RepositoryBase[OrganizationCustomDomain]):
    model = OrganizationCustomDomain

    async def get_by_organization_id(
        self, organization_id: UUID
    ) -> OrganizationCustomDomain | None:
        statement = self.get_base_statement().where(
            OrganizationCustomDomain.organization_id == organization_id
        )
        return await self.get_one_or_none(statement)

    async def get_by_domain(self, domain: str) -> OrganizationCustomDomain | None:
        statement = self.get_base_statement().where(
            OrganizationCustomDomain.domain == domain
        )
        return await self.get_one_or_none(statement)

    async def hard_delete(self, custom_domain: OrganizationCustomDomain) -> None:
        # Hard delete (not soft): the unique index on `domain` must not be
        # blocked by tombstoned rows when the same domain is re-added.
        await self.session.delete(custom_domain)
