"""Queries on `sand_boxes` (25 September 2026)."""

from __future__ import annotations

from uuid import UUID

from polar.kit.repository import RepositoryBase, RepositorySoftDeletionMixin
from polar.models import SandBox


class SandBoxRepository(RepositorySoftDeletionMixin[SandBox], RepositoryBase[SandBox]):
    model = SandBox

    async def get_by_user(self, user_id: UUID) -> SandBox | None:
        """One box per person: the newest row that is not deleted."""
        statement = (
            self.get_base_statement()
            .where(SandBox.user_id == user_id)
            .order_by(SandBox.created_at.desc())
        )
        return await self.get_one_or_none(statement)

    async def get_by_id(self, box_id: UUID) -> SandBox | None:
        statement = self.get_base_statement().where(SandBox.id == box_id)
        return await self.get_one_or_none(statement)

    async def get_by_credential_session(self, session_id: UUID) -> SandBox | None:
        statement = self.get_base_statement().where(
            SandBox.credential_session_id == session_id
        )
        return await self.get_one_or_none(statement)
