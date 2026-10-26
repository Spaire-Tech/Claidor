"""The queries behind an agent's own bots listened to from the server
(`channel_bots.py`, 26 October 2026)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete

from simeon.kit.repository import RepositoryBase
from simeon.models import DesktopChannelBot


class DesktopChannelBotRepository(RepositoryBase[DesktopChannelBot]):
    model = DesktopChannelBot

    async def list_by_user(self, user_id: UUID) -> list[DesktopChannelBot]:
        statement = self.get_base_statement().where(
            DesktopChannelBot.user_id == user_id
        )
        return list(await self.get_all(statement))

    async def list_all(self) -> list[DesktopChannelBot]:
        return list(await self.get_all(self.get_base_statement()))

    async def get_many(self, ids: list[UUID]) -> dict[UUID, DesktopChannelBot]:
        if not ids:
            return {}
        statement = self.get_base_statement().where(DesktopChannelBot.id.in_(ids))
        return {bot.id: bot for bot in await self.get_all(statement)}

    async def remove(self, ids: list[UUID]) -> None:
        if ids:
            await self.session.execute(
                delete(DesktopChannelBot).where(DesktopChannelBot.id.in_(ids))
            )

    async def remove_for_user(self, user_id: UUID) -> int:
        statement = (
            delete(DesktopChannelBot)
            .where(DesktopChannelBot.user_id == user_id)
            .returning(DesktopChannelBot.id)
        )
        return len((await self.session.execute(statement)).all())
