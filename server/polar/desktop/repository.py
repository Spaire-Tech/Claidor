"""The desktop app's tables, queried."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select

from polar.kit.repository import RepositoryBase
from polar.models import DesktopAuthCode, DesktopSession, DesktopUsage


class DesktopAuthCodeRepository(RepositoryBase[DesktopAuthCode]):
    model = DesktopAuthCode

    async def get_by_code_hash(self, code_hash: str) -> DesktopAuthCode | None:
        statement = self.get_base_statement().where(
            DesktopAuthCode.code_hash == code_hash
        )
        return await self.get_one_or_none(statement)


class DesktopSessionRepository(RepositoryBase[DesktopSession]):
    model = DesktopSession

    async def get_by_access_token_hash(self, token_hash: str) -> DesktopSession | None:
        statement = self.get_base_statement().where(
            DesktopSession.access_token_hash == token_hash
        )
        return await self.get_one_or_none(statement)

    async def get_by_refresh_token_hash(self, token_hash: str) -> DesktopSession | None:
        statement = self.get_base_statement().where(
            DesktopSession.refresh_token_hash == token_hash
        )
        return await self.get_one_or_none(statement)


class DesktopUsageRepository(RepositoryBase[DesktopUsage]):
    model = DesktopUsage

    async def credits_between(
        self, user_id: UUID, start: datetime, end: datetime
    ) -> int:
        """The credits a person spent in a window, from the rows that
        were actually served."""
        statement = select(func.coalesce(func.sum(DesktopUsage.credits), 0)).where(
            DesktopUsage.user_id == user_id,
            DesktopUsage.created_at >= start,
            DesktopUsage.created_at < end,
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())
