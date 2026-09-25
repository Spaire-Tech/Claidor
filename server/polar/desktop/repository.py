"""The desktop app's tables, queried."""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select

from polar.kit.repository import RepositoryBase
from polar.models import (
    DesktopAuthCode,
    DesktopMemoryFile,
    DesktopSession,
    DesktopUsage,
)


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

    async def get_parent_of(self, child: DesktopSession) -> DesktopSession | None:
        """The signed-in desktop a box credential belongs to."""
        if child.box_of_session_id is None:
            return None
        statement = self.get_base_statement().where(
            DesktopSession.id == child.box_of_session_id
        )
        return await self.get_one_or_none(statement)

    async def list_box_credentials_of(
        self, parent_id: UUID
    ) -> Sequence[DesktopSession]:
        """The box credentials a signed-in desktop is the parent of."""
        statement = self.get_base_statement().where(
            DesktopSession.box_of_session_id == parent_id
        )
        return await self.get_all(statement)


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


class DesktopMemoryFileRepository(RepositoryBase[DesktopMemoryFile]):
    model = DesktopMemoryFile

    async def list_by_user(self, user_id: UUID) -> Sequence[DesktopMemoryFile]:
        """Everything Claidor holds for one person, in name order."""
        statement = (
            self.get_base_statement()
            .where(DesktopMemoryFile.user_id == user_id)
            .order_by(DesktopMemoryFile.name)
        )
        return await self.get_all(statement)

    async def get_by_name(self, user_id: UUID, name: str) -> DesktopMemoryFile | None:
        statement = self.get_base_statement().where(
            DesktopMemoryFile.user_id == user_id, DesktopMemoryFile.name == name
        )
        return await self.get_one_or_none(statement)

    async def upsert(
        self, user_id: UUID, name: str, *, content: str, version: int
    ) -> DesktopMemoryFile:
        """The row for one name, written at the version given. A name
        the person does not have yet is created; one they have is
        overwritten."""
        found = await self.get_by_name(user_id, name)
        if found is None:
            found = DesktopMemoryFile(
                user_id=user_id, name=name, content=content, version=version
            )
            return await self.create(found, flush=True)
        return await self.update(
            found, update_dict={"content": content, "version": version}, flush=True
        )
