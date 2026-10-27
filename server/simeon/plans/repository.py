"""The plans' tables, queried."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import Select, func, or_, select, update

from simeon.kit.repository import RepositoryBase
from simeon.models import (
    DesktopAppStoreSubscription,
    DesktopCreditPack,
    DesktopFreeTrial,
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


class AppStoreSubscriptionRepository(RepositoryBase[DesktopAppStoreSubscription]):
    """Plans bought through Apple (`simeon.plans.app_store`)."""

    model = DesktopAppStoreSubscription

    async def get_by_original_transaction_id(
        self, original_transaction_id: str
    ) -> DesktopAppStoreSubscription | None:
        statement = self.get_base_statement().where(
            DesktopAppStoreSubscription.original_transaction_id
            == original_transaction_id
        )
        return await self.get_one_or_none(statement)

    async def list_by_user(
        self, user_id: UUID
    ) -> Sequence[DesktopAppStoreSubscription]:
        statement = (
            self.get_base_statement()
            .where(DesktopAppStoreSubscription.user_id == user_id)
            .order_by(DesktopAppStoreSubscription.synced_at.desc())
        )
        return await self.get_all(statement)


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


class DesktopFreeTrialRepository(RepositoryBase[DesktopFreeTrial]):
    model = DesktopFreeTrial

    async def get_for_user(self, user_id: UUID) -> DesktopFreeTrial | None:
        statement = self.get_base_statement().where(DesktopFreeTrial.user_id == user_id)
        return await self.get_one_or_none(statement)

    async def get_for_email_hash(self, email_hash: str) -> DesktopFreeTrial | None:
        statement = (
            self.get_base_statement()
            .where(DesktopFreeTrial.email_hash == email_hash)
            .order_by(DesktopFreeTrial.created_at.desc())
            .limit(1)
        )
        return await self.get_one_or_none(statement)


class DesktopCreditPackRepository(RepositoryBase[DesktopCreditPack]):
    """Extra credits (`simeon.plans.credits`)."""

    model = DesktopCreditPack

    def _live(self, user_id: UUID, now: datetime) -> Select[tuple[DesktopCreditPack]]:
        return self.get_base_statement().where(
            DesktopCreditPack.user_id == user_id,
            DesktopCreditPack.remaining > 0,
            DesktopCreditPack.refunded_at.is_(None),
            DesktopCreditPack.expires_at > now,
        )

    async def get_by_checkout_session(
        self, checkout_session_id: str
    ) -> DesktopCreditPack | None:
        statement = self.get_base_statement().where(
            DesktopCreditPack.stripe_checkout_session_id == checkout_session_id
        )
        return await self.get_one_or_none(statement)

    async def list_by_payment_intent(
        self, payment_intent_id: str
    ) -> Sequence[DesktopCreditPack]:
        statement = self.get_base_statement().where(
            DesktopCreditPack.stripe_payment_intent_id == payment_intent_id
        )
        return await self.get_all(statement)

    async def list_live(
        self, user_id: UUID, now: datetime, *, for_update: bool = False
    ) -> Sequence[DesktopCreditPack]:
        """The packs that still hold credits, the first to expire first;
        locked when they are about to be drawn from, so two calls ending at
        once cannot spend the same credits."""
        statement = self._live(user_id, now).order_by(
            DesktopCreditPack.expires_at, DesktopCreditPack.created_at
        )
        if for_update:
            statement = statement.with_for_update()
        return await self.get_all(statement)

    async def balance(self, user_id: UUID, now: datetime) -> int:
        statement = select(
            func.coalesce(func.sum(DesktopCreditPack.remaining), 0)
        ).where(
            DesktopCreditPack.user_id == user_id,
            DesktopCreditPack.deleted_at.is_(None),
            DesktopCreditPack.remaining > 0,
            DesktopCreditPack.refunded_at.is_(None),
            DesktopCreditPack.expires_at > now,
        )
        result = await self.session.execute(statement)
        return int(result.scalar_one())


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
