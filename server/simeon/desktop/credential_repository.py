"""The queries behind the person's Secure Credentials Store
(`credentials.py`, 28 October 2026)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, func, select

from simeon.kit.repository import RepositoryBase
from simeon.models import DesktopCredential


class DesktopCredentialRepository(RepositoryBase[DesktopCredential]):
    model = DesktopCredential

    async def list_by_user(self, user_id: UUID) -> list[DesktopCredential]:
        statement = (
            self.get_base_statement()
            .where(DesktopCredential.user_id == user_id)
            .order_by(DesktopCredential.created_at)
        )
        return list(await self.get_all(statement))

    async def count_for_user(self, user_id: UUID) -> int:
        statement = select(func.count(DesktopCredential.id)).where(
            DesktopCredential.user_id == user_id
        )
        return int((await self.session.execute(statement)).scalar_one())

    async def for_user(self, user_id: UUID, entry_id: UUID) -> DesktopCredential | None:
        """The entry, when it is this person's; another's is never found."""
        statement = self.get_base_statement().where(
            DesktopCredential.id == entry_id, DesktopCredential.user_id == user_id
        )
        return await self.get_one_or_none(statement)

    async def remove(self, user_id: UUID, entry_id: UUID) -> bool:
        statement = (
            delete(DesktopCredential)
            .where(
                DesktopCredential.id == entry_id, DesktopCredential.user_id == user_id
            )
            .returning(DesktopCredential.id)
        )
        return len((await self.session.execute(statement)).all()) > 0
