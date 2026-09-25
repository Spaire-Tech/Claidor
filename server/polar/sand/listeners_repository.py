"""Queries for the listener relay (25 September 2026)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, delete, update

from polar.kit.repository import RepositoryBase
from polar.kit.utils import utc_now
from polar.models import (
    SandAutomation,
    SandAutomationFire,
    SandListenerConnection,
    SandListenerEvent,
    SandListenerSubscription,
)


class SandAutomationRepository(RepositoryBase[SandAutomation]):
    model = SandAutomation

    def _mine(self, user_id: UUID) -> Select[tuple[SandAutomation]]:
        return self.get_base_statement().where(SandAutomation.user_id == user_id)

    async def get_by_automation_id(
        self, user_id: UUID, automation_id: str
    ) -> SandAutomation | None:
        return await self.get_one_or_none(
            self._mine(user_id).where(SandAutomation.automation_id == automation_id)
        )

    async def list_for_agent(
        self, user_id: UUID, sand_agent_id: str
    ) -> Sequence[SandAutomation]:
        return await self.get_all(
            self._mine(user_id)
            .where(SandAutomation.sand_agent_id == sand_agent_id)
            .order_by(SandAutomation.created_at)
        )

    async def list_enabled(self, user_id: UUID) -> Sequence[SandAutomation]:
        return await self.get_all(
            self._mine(user_id).where(SandAutomation.enabled.is_(True))
        )

    async def list_enabled_for_users(
        self, user_ids: Sequence[UUID]
    ) -> Sequence[SandAutomation]:
        if not user_ids:
            return []
        return await self.get_all(
            self.get_base_statement().where(
                SandAutomation.user_id.in_(list(user_ids)),
                SandAutomation.enabled.is_(True),
            )
        )

    async def list_due(
        self, now: datetime, limit: int = 500
    ) -> Sequence[SandAutomation]:
        return await self.get_all(
            self.get_base_statement()
            .where(
                SandAutomation.enabled.is_(True),
                SandAutomation.next_fire_at.is_not(None),
                SandAutomation.next_fire_at <= now,
            )
            .order_by(SandAutomation.next_fire_at)
            .limit(limit)
        )


class SandListenerSubscriptionRepository(RepositoryBase[SandListenerSubscription]):
    model = SandListenerSubscription

    async def get_for_user(self, user_id: UUID) -> SandListenerSubscription | None:
        return await self.get_one_or_none(
            self.get_base_statement().where(SandListenerSubscription.user_id == user_id)
        )

    async def list_all(self) -> Sequence[SandListenerSubscription]:
        return await self.get_all(self.get_base_statement())


class SandListenerEventRepository(RepositoryBase[SandListenerEvent]):
    model = SandListenerEvent

    async def list_pending(
        self, user_id: UUID, limit: int = 100
    ) -> Sequence[SandListenerEvent]:
        return await self.get_all(
            self.get_base_statement()
            .where(SandListenerEvent.user_id == user_id)
            .order_by(SandListenerEvent.created_at)
            .limit(limit)
        )

    async def ack(self, user_id: UUID, ids: Sequence[UUID]) -> None:
        if not ids:
            return
        await self.session.execute(
            delete(SandListenerEvent).where(
                SandListenerEvent.user_id == user_id,
                SandListenerEvent.id.in_(list(ids)),
            )
        )

    async def delete_older_than(self, cutoff: datetime) -> None:
        await self.session.execute(
            delete(SandListenerEvent).where(SandListenerEvent.created_at < cutoff)
        )


class SandAutomationFireRepository(RepositoryBase[SandAutomationFire]):
    model = SandAutomationFire

    async def list_open(
        self, user_id: UUID, limit: int = 50
    ) -> Sequence[SandAutomationFire]:
        """Pending fires the box has not completed, and completed ones it
        has not yet acknowledged (the consumer re-reads those to settle
        its own state)."""
        return await self.get_all(
            self.get_base_statement()
            .where(
                SandAutomationFire.user_id == user_id,
                SandAutomationFire.status.in_(["pending", "completed"]),
            )
            .order_by(SandAutomationFire.created_at)
            .limit(limit)
        )

    async def has_pending_cron_fire(self, automation_row_id: UUID) -> bool:
        row = await self.get_one_or_none(
            self.get_base_statement()
            .where(
                SandAutomationFire.automation_row_id == automation_row_id,
                SandAutomationFire.status == "pending",
                SandAutomationFire.scheduled_for.is_not(None),
            )
            .limit(1)
        )
        return row is not None

    async def get_for_user(
        self, user_id: UUID, fire_id: UUID
    ) -> SandAutomationFire | None:
        return await self.get_one_or_none(
            self.get_base_statement().where(
                SandAutomationFire.user_id == user_id, SandAutomationFire.id == fire_id
            )
        )

    async def ack(self, user_id: UUID, ids: Sequence[UUID]) -> None:
        if not ids:
            return
        await self.session.execute(
            update(SandAutomationFire)
            .where(
                SandAutomationFire.user_id == user_id,
                SandAutomationFire.id.in_(list(ids)),
                SandAutomationFire.status == "completed",
            )
            .values(status="acked", modified_at=utc_now())
        )

    async def expire_pending_before(self, user_id: UUID, cutoff: datetime) -> None:
        await self.session.execute(
            update(SandAutomationFire)
            .where(
                SandAutomationFire.user_id == user_id,
                SandAutomationFire.status == "pending",
                SandAutomationFire.created_at < cutoff,
            )
            .values(status="expired", modified_at=utc_now())
        )


class SandListenerConnectionRepository(RepositoryBase[SandListenerConnection]):
    model = SandListenerConnection

    async def list_for_user(
        self, user_id: UUID, platform: str
    ) -> Sequence[SandListenerConnection]:
        return await self.get_all(
            self.get_base_statement().where(
                SandListenerConnection.user_id == user_id,
                SandListenerConnection.platform == platform,
            )
        )

    async def get_by_external(
        self, platform: str, external_id: str
    ) -> SandListenerConnection | None:
        return await self.get_one_or_none(
            self.get_base_statement().where(
                SandListenerConnection.platform == platform,
                SandListenerConnection.external_id == external_id,
            )
        )

    async def list_by_external(
        self, platform: str, external_id: str
    ) -> Sequence[SandListenerConnection]:
        return await self.get_all(
            self.get_base_statement().where(
                SandListenerConnection.platform == platform,
                SandListenerConnection.external_id == external_id,
                SandListenerConnection.user_id.is_not(None),
            )
        )

    async def get_by_webhook_token(
        self, platform: str, token: str
    ) -> SandListenerConnection | None:
        return await self.get_one_or_none(
            self.get_base_statement().where(
                SandListenerConnection.platform == platform,
                SandListenerConnection.webhook_token == token,
                SandListenerConnection.user_id.is_not(None),
            )
        )
