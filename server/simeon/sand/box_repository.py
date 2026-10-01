"""Queries on `sand_boxes` (25 September 2026)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select

from simeon.kit.repository import RepositoryBase, RepositorySoftDeletionMixin
from simeon.models import SandBox


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

    async def list_awake(self, provider: str) -> Sequence[SandBox]:
        """Boxes the broker last left running on this host."""
        statement = self.get_base_statement().where(
            SandBox.provider == provider, SandBox.state == "running"
        )
        return await self.get_all(statement)

    async def count_awake(self, provider: str, *, excluding: UUID) -> int:
        statement = select(func.count(SandBox.id)).where(
            SandBox.deleted_at.is_(None),
            SandBox.provider == provider,
            SandBox.state == "running",
            SandBox.id != excluding,
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())

    async def get_by_credential_session(self, session_id: UUID) -> SandBox | None:
        statement = self.get_base_statement().where(
            SandBox.credential_session_id == session_id
        )
        return await self.get_one_or_none(statement)
