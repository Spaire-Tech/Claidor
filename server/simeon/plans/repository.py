"""The plans' tables, queried."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select, update

from simeon.kit.repository import RepositoryBase
from simeon.models import (
    DesktopSubscription,
    DesktopTrialRedemption,
    DesktopUsage,
    SandBox,
    User,
)


class DesktopSubscriptionRepository(RepositoryBase[DesktopSubscription]):
    model = DesktopSubscription

    async def get_by_user(self, user_id: UUID) -> DesktopSubscription | None:
        statement = self.get_base_statement().where(
            DesktopSubscription.user_id == user_id
        )
        return await self.get_one_or_none(statement)

    async def get_by_stripe_subscription_id(
        self, stripe_subscription_id: str
    ) -> DesktopSubscription | None:
        statement = self.get_base_statement().where(
            DesktopSubscription.stripe_subscription_id == stripe_subscription_id
        )
        return await self.get_one_or_none(statement)

    async def get_by_stripe_customer_id(
        self, stripe_customer_id: str
    ) -> DesktopSubscription | None:
        statement = (
            self.get_base_statement()
            .where(DesktopSubscription.stripe_customer_id == stripe_customer_id)
            .order_by(DesktopSubscription.created_at.desc())
            .limit(1)
        )
        return await self.get_one_or_none(statement)

    async def customer_ids_by_user(self, user_ids: Sequence[UUID]) -> dict[UUID, str]:
        """Every known Stripe customer for these people: the subscription's,
        else the one on the user row."""
        if not user_ids:
            return {}
        rows = await self.session.execute(
            select(
                User.id, User.stripe_customer_id, DesktopSubscription.stripe_customer_id
            )
            .outerjoin(DesktopSubscription, DesktopSubscription.user_id == User.id)
            .where(User.id.in_(list(user_ids)))
        )
        out: dict[UUID, str] = {}
        for user_id, on_user, on_subscription in rows.all():
            customer = on_subscription or on_user
            if customer:
                out[user_id] = customer
        return out


class DesktopTrialRedemptionRepository(RepositoryBase[DesktopTrialRedemption]):
    model = DesktopTrialRedemption

    async def get_for_user(self, user_id: UUID) -> DesktopTrialRedemption | None:
        statement = self.get_base_statement().where(
            DesktopTrialRedemption.user_id == user_id
        )
        return await self.get_one_or_none(statement)

    async def get_for_card(
        self, fingerprint: str, *, other_than_user: UUID
    ) -> DesktopTrialRedemption | None:
        statement = (
            self.get_base_statement()
            .where(DesktopTrialRedemption.payment_method_fingerprint == fingerprint)
            .where(DesktopTrialRedemption.user_id != other_than_user)
            .limit(1)
        )
        return await self.get_one_or_none(statement)

    async def get_for_email(
        self, email: str, *, other_than_user: UUID
    ) -> DesktopTrialRedemption | None:
        statement = (
            self.get_base_statement()
            .where(func.lower(DesktopTrialRedemption.email) == email.lower())
            .where(DesktopTrialRedemption.user_id != other_than_user)
            .limit(1)
        )
        return await self.get_one_or_none(statement)


class UsageReportRepository:
    """What the meter reporter reads and stamps. Not a `RepositoryBase`:
    it works across two tables and writes with `UPDATE … WHERE`."""

    def __init__(self, session: object) -> None:
        self.session = session

    async def unreported_credits_by_user(
        self, *, until: datetime
    ) -> list[tuple[UUID, int]]:
        """Credits metered before `until` and not yet sent to Stripe, by
        person. Failed calls cost nothing and are skipped."""
        statement = (
            select(DesktopUsage.user_id, func.sum(DesktopUsage.credits))
            .where(DesktopUsage.stripe_reported_at.is_(None))
            .where(DesktopUsage.created_at < until)
            .where(DesktopUsage.credits > 0)
            .group_by(DesktopUsage.user_id)
        )
        rows = await self.session.execute(statement)  # type: ignore[attr-defined]
        return [(user_id, int(total)) for user_id, total in rows.all()]

    async def mark_credits_reported(
        self, user_id: UUID, *, until: datetime, at: datetime
    ) -> int:
        statement = (
            update(DesktopUsage)
            .where(DesktopUsage.user_id == user_id)
            .where(DesktopUsage.stripe_reported_at.is_(None))
            .where(DesktopUsage.created_at < until)
            .values(stripe_reported_at=at)
        )
        result = await self.session.execute(statement)  # type: ignore[attr-defined]
        return int(result.rowcount or 0)

    async def boxes_with_unmetered_time(self) -> Sequence[SandBox]:
        """Every box that is running, or that was hibernated after the
        last time its running seconds were sent."""
        statement = select(SandBox).where(
            SandBox.deleted_at.is_(None),
            or_(
                SandBox.state == "running",
                SandBox.hibernated_at
                > func.coalesce(SandBox.usage_metered_at, SandBox.created_at),
            ),
        )
        rows = await self.session.execute(statement)  # type: ignore[attr-defined]
        return list(rows.scalars().unique().all())
