"""The queries behind the AI accounts a person connected (`model_accounts.py`)."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import delete

from simeon.kit.repository import RepositoryBase
from simeon.models import DesktopModelAccount


class ModelAccountRepository(RepositoryBase[DesktopModelAccount]):
    model = DesktopModelAccount

    async def for_user(self, user_id: UUID) -> Sequence[DesktopModelAccount]:
        """The person's accounts, oldest first: the first one connected is the
        one used until the person picks another."""
        statement = (
            self.get_base_statement()
            .where(DesktopModelAccount.user_id == user_id)
            .order_by(DesktopModelAccount.created_at, DesktopModelAccount.id)
        )
        return await self.get_all(statement)

    async def one_for_user(
        self, user_id: UUID, account_id: UUID, *, lock: bool = False
    ) -> DesktopModelAccount | None:
        """One of the person's accounts; with `lock`, held until the request
        ends, so two calls that find its token run out refresh it once (the
        provider rotates the refresh token, and the second refresh with the
        old one would fail)."""
        statement = self.get_base_statement().where(
            DesktopModelAccount.user_id == user_id,
            DesktopModelAccount.id == account_id,
        )
        if lock:
            statement = statement.with_for_update()
        return await self.get_one_or_none(statement)

    async def by_key(
        self, user_id: UUID, provider: str, account_key: str
    ) -> DesktopModelAccount | None:
        statement = self.get_base_statement().where(
            DesktopModelAccount.user_id == user_id,
            DesktopModelAccount.provider == provider,
            DesktopModelAccount.account_key == account_key,
        )
        return await self.get_one_or_none(statement)

    async def delete_one(self, user_id: UUID, account_id: UUID) -> int:
        result = await self.session.execute(
            delete(DesktopModelAccount).where(
                DesktopModelAccount.user_id == user_id,
                DesktopModelAccount.id == account_id,
            )
        )
        return int(getattr(result, "rowcount", 0) or 0)
