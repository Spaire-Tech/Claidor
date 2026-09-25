"""The desktop app's tables, queried."""

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select

from polar.kit.repository import RepositoryBase, RepositorySoftDeletionMixin
from polar.kit.utils import utc_now
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

    async def list_in_grace_of_user(
        self, user_id: UUID, now: datetime
    ) -> Sequence[DesktopSession]:
        """A person's sessions a refresh has replaced whose old access
        token is still inside its grace: refresh token dead, access token
        live, not a job token and not a box credential."""
        statement = self.get_base_statement().where(
            DesktopSession.user_id == user_id,
            DesktopSession.revoked_at.is_(None),
            DesktopSession.refresh_expires_at <= now,
            DesktopSession.access_expires_at > now,
            DesktopSession.job_id.is_(None),
            DesktopSession.box_of_session_id.is_(None),
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

    async def list_by_user(
        self, user_id: UUID, *, include_deleted: bool = False
    ) -> Sequence[DesktopMemoryFile]:
        """Everything Claidor holds for one person, in name order. A
        tombstone (`deleted_at` set) is a name one machine removed and
        the others have still to hear about; it is left out unless
        asked for."""
        statement = (
            self.get_base_statement()
            .where(DesktopMemoryFile.user_id == user_id)
            .order_by(DesktopMemoryFile.name)
        )
        if not include_deleted:
            statement = statement.where(DesktopMemoryFile.deleted_at.is_(None))
        return await self.get_all(statement)

    async def get_by_name(self, user_id: UUID, name: str) -> DesktopMemoryFile | None:
        """The one row for a name, tombstoned or not: a sync that sends
        a deleted name again has to see the tombstone's version."""
        statement = self.get_base_statement().where(
            DesktopMemoryFile.user_id == user_id, DesktopMemoryFile.name == name
        )
        return await self.get_one_or_none(statement)

    async def upsert(
        self, user_id: UUID, name: str, *, content: str, version: int
    ) -> DesktopMemoryFile:
        """The row for one name, written at the version given and alive.
        A name the person does not have yet is created; one they have,
        tombstoned or not, is overwritten."""
        found = await self.get_by_name(user_id, name)
        if found is None:
            found = DesktopMemoryFile(
                user_id=user_id, name=name, content=content, version=version
            )
            return await self.create(found, flush=True)
        return await self.update(
            found,
            update_dict={"content": content, "version": version, "deleted_at": None},
            flush=True,
        )

    async def tombstone(
        self, found: DesktopMemoryFile, *, version: int
    ) -> DesktopMemoryFile:
        """Mark one row deleted at the version given. The text goes with
        it: a tombstone is a name and a version, nothing to read."""
        return await self.update(
            found,
            update_dict={"content": "", "version": version, "deleted_at": utc_now()},
            flush=True,
        )
