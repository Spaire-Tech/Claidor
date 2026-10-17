"""The queries behind a person's Link connection (`link_wallet.py`)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete

from simeon.kit.repository import RepositoryBase
from simeon.models import DesktopLinkWallet


class LinkWalletRepository(RepositoryBase[DesktopLinkWallet]):
    model = DesktopLinkWallet

    async def for_user(
        self, user_id: UUID, *, lock: bool = False
    ) -> DesktopLinkWallet | None:
        """The person's connection; with `lock`, held until the request ends,
        so two of their computers asking at once refresh it once: Link
        rotates the refresh token, and the second refresh with the old one
        would fail."""
        statement = self.get_base_statement().where(
            DesktopLinkWallet.user_id == user_id
        )
        if lock:
            statement = statement.with_for_update()
        return await self.get_one_or_none(statement)

    async def delete_for_user(self, user_id: UUID) -> int:
        result = await self.session.execute(
            delete(DesktopLinkWallet).where(DesktopLinkWallet.user_id == user_id)
        )
        return int(getattr(result, "rowcount", 0) or 0)
