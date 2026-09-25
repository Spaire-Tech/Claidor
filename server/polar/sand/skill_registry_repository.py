"""The skill registry's tables, queried (25 September 2026)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import ColumnElement, Select, or_, select

from polar.kit.repository import RepositoryBase
from polar.models import (
    Organization,
    SandPlugin,
    SandPluginUserSetting,
    UserOrganization,
)
from polar.postgres import AsyncReadSession, AsyncSession


class SandPluginRepository(RepositoryBase[SandPlugin]):
    model = SandPlugin

    def _live(self) -> Select[tuple[SandPlugin]]:
        return self.get_base_statement().where(SandPlugin.deleted_at.is_(None))

    async def get_by_numeric_id(self, numeric_id: int) -> SandPlugin | None:
        statement = self._live().where(SandPlugin.numeric_id == numeric_id)
        return await self.get_one_or_none(statement)

    async def get_personal_by_name(
        self, owner_user_id: UUID, name: str
    ) -> SandPlugin | None:
        statement = self._live().where(
            SandPlugin.owner_user_id == owner_user_id,
            SandPlugin.organization_id.is_(None),
            SandPlugin.name == name,
        )
        return await self.get_one_or_none(statement)

    async def get_team_by_name(
        self, organization_id: UUID, name: str
    ) -> SandPlugin | None:
        statement = self._live().where(
            SandPlugin.organization_id == organization_id,
            SandPlugin.name == name,
        )
        return await self.get_one_or_none(statement)

    async def list_visible_to(
        self, user_id: UUID, organization_ids: Sequence[UUID]
    ) -> Sequence[SandPlugin]:
        """Every live plugin the person can see: their own personal ones
        and every plugin of an organization they are in."""
        scopes: list[ColumnElement[bool]] = [
            (SandPlugin.owner_user_id == user_id) & SandPlugin.organization_id.is_(None)
        ]
        if organization_ids:
            scopes.append(SandPlugin.organization_id.in_(list(organization_ids)))
        statement = self._live().where(or_(*scopes)).order_by(SandPlugin.numeric_id)
        return await self.get_all(statement)


class SandPluginUserSettingRepository(RepositoryBase[SandPluginUserSetting]):
    model = SandPluginUserSetting

    async def list_for_user(self, user_id: UUID) -> Sequence[SandPluginUserSetting]:
        statement = self.get_base_statement().where(
            SandPluginUserSetting.user_id == user_id,
            SandPluginUserSetting.deleted_at.is_(None),
        )
        return await self.get_all(statement)


async def organizations_of(
    session: AsyncSession | AsyncReadSession, user_id: UUID
) -> Sequence[Organization]:
    """The organizations the person is a direct member of; the app's
    teams. `polar.organization.repository.get_all_by_user` is the same
    query behind an auth subject, which a desktop session is not."""
    statement = (
        select(Organization)
        .join(UserOrganization, UserOrganization.organization_id == Organization.id)
        .where(
            UserOrganization.user_id == user_id,
            UserOrganization.deleted_at.is_(None),
            Organization.deleted_at.is_(None),
            Organization.blocked_at.is_(None),
        )
        .order_by(Organization.created_at)
    )
    result = await session.execute(statement)
    return result.scalars().unique().all()
