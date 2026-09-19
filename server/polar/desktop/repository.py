"""The desktop app's tables, queried."""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select

from polar.kit.repository import RepositoryBase, RepositorySoftDeletionMixin
from polar.models import (
    DesktopAuthCode,
    DesktopBox,
    DesktopMemoryFile,
    DesktopSession,
    DesktopUsage,
)


class DesktopBoxRepository(
    RepositorySoftDeletionMixin[DesktopBox], RepositoryBase[DesktopBox]
):
    """The person's computer.

    Unique on (`user_id`, `scope_key`), which is what makes
    `POST /box/sandboxes` mean « ensure » rather than « create »: the
    engine asks for a scope and gets back the box that is already there.
    The product uses one scope, so in practice there is one row per
    account — *there is no "which computer", only this computer*.

    **Every read here takes a `user_id`.** There is deliberately no
    `get(box_id)`: a box id from one account has to be invisible to
    another, and the only way that cannot be forgotten is for no method
    to exist that returns a row without the owner in the where clause.
    """

    model = DesktopBox

    async def get_by_scope(self, user_id: UUID, scope_key: str) -> DesktopBox | None:
        """The box this account already has for this scope, if any.

        What makes `POST /box/sandboxes` « ensure » rather than
        « create ». Each accidental extra box is a second bill.
        """
        statement = self.get_base_statement().where(
            DesktopBox.user_id == user_id, DesktopBox.scope_key == scope_key
        )
        return await self.get_one_or_none(statement)

    async def get_for_user(self, user_id: UUID, box_id: UUID) -> DesktopBox | None:
        """One box, **scoped to its owner in the query itself.**

        Not « fetch, then check the owner »: a box id from one account
        has to be invisible to another, and the only way that cannot be
        forgotten is for there to be no method that returns a row
        without the account in the where clause.
        """
        statement = self.get_base_statement().where(
            DesktopBox.id == box_id, DesktopBox.user_id == user_id
        )
        return await self.get_one_or_none(statement)

    async def list_for_user(self, user_id: UUID) -> Sequence[DesktopBox]:
        statement = self.get_base_statement().where(DesktopBox.user_id == user_id)
        return await self.get_all(statement)

    async def get_by_sandbox_id(self, sandbox_id: str) -> DesktopBox | None:
        """Used when E2B tells us about a box rather than the other way
        round — a webhook, or a sweep for sandboxes nobody owns."""
        statement = self.get_base_statement().where(DesktopBox.sandbox_id == sandbox_id)
        return await self.get_one_or_none(statement)


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
