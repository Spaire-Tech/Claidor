from collections.abc import Sequence
from uuid import UUID

from simeon.kit.repository import (
    RepositoryBase,
    RepositorySoftDeletionIDMixin,
    RepositorySoftDeletionMixin,
)
from simeon.kit.repository.base import Options
from simeon.models.notification_recipient import NotificationRecipient

from .schemas import NotificationRecipientPlatform


class NotificationRecipientRepository(
    RepositorySoftDeletionIDMixin[NotificationRecipient, UUID],
    RepositorySoftDeletionMixin[NotificationRecipient],
    RepositoryBase[NotificationRecipient],
):
    model = NotificationRecipient

    async def delete(
        self, notification_recipient_id: UUID, user_id: UUID, *, flush: bool = False
    ) -> None:
        # First get the notification recipient
        statement = (
            self.get_base_statement()
            .where(NotificationRecipient.id == notification_recipient_id)
            .where(NotificationRecipient.user_id == user_id)
        )
        notification_recipient = await self.get_one_or_none(statement)

        # If notification recipient exists, soft delete it
        if notification_recipient:
            await self.soft_delete(notification_recipient, flush=flush)

        return None

    async def list_by_user(
        self,
        user_id: UUID,
        platform: NotificationRecipientPlatform | None,
        expo_push_token: str | None,
        *,
        options: Options = (),
    ) -> Sequence[NotificationRecipient]:
        statement = self.get_base_statement().where(
            NotificationRecipient.user_id == user_id
        )

        if expo_push_token:
            statement = statement.where(
                NotificationRecipient.expo_push_token == expo_push_token
            )

        if platform:
            statement = statement.where(NotificationRecipient.platform == platform)

        return await self.get_all(statement.options(*options))

    async def get_by_expo_token(
        self, expo_push_token: str
    ) -> NotificationRecipient | None:
        statement = self.get_base_statement().where(
            NotificationRecipient.expo_push_token == expo_push_token
        )
        return await self.get_one_or_none(statement)

    async def list_by_expo_token(
        self, expo_push_token: str
    ) -> Sequence[NotificationRecipient]:
        """Every live row for one phone, whoever registered it. The unique
        index is per person, so a phone two people signed in on can have
        two (`simeon/desktop/push.py` keeps only the one registering it
        now)."""
        statement = (
            self.get_base_statement()
            .where(NotificationRecipient.expo_push_token == expo_push_token)
            .order_by(NotificationRecipient.created_at)
        )
        return await self.get_all(statement)
