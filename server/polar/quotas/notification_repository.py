from uuid import UUID

from sqlalchemy import delete, select

from polar.kit.repository import RepositoryBase
from polar.models import QuotaNotification
from polar.postgres import AsyncSession


class QuotaNotificationRepository(RepositoryBase[QuotaNotification]):
    model = QuotaNotification

    async def get_by_key(
        self,
        *,
        organization_id: UUID,
        quota_key: str,
        threshold: int,
        period_key: str,
    ) -> QuotaNotification | None:
        statement = select(QuotaNotification).where(
            QuotaNotification.organization_id == organization_id,
            QuotaNotification.quota_key == quota_key,
            QuotaNotification.threshold == threshold,
            QuotaNotification.period_key == period_key,
        )
        return await self.get_one_or_none(statement)

    async def delete_lifetime_for(
        self,
        *,
        organization_id: UUID,
        quota_key: str,
        threshold: int,
    ) -> None:
        """Clear a lifetime-scoped notification row so the next crossing
        can re-fire. Called when usage has dropped below the threshold."""
        statement = delete(QuotaNotification).where(
            QuotaNotification.organization_id == organization_id,
            QuotaNotification.quota_key == quota_key,
            QuotaNotification.threshold == threshold,
            QuotaNotification.period_key == "lifetime",
        )
        await self.session.execute(statement)


def quota_notification_repository(
    session: AsyncSession,
) -> QuotaNotificationRepository:
    return QuotaNotificationRepository.from_session(session)
