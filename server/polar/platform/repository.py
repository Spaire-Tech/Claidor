from datetime import datetime
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from polar.kit.repository import RepositoryBase
from polar.models import Customer, Product, Subscription
from polar.models.subscription import SubscriptionStatus
from polar.postgres import AsyncReadSession


class _PlatformProductRepository(RepositoryBase[Product]):
    model = Product

    async def get_by_tier(self, platform_org_id: UUID, tier: str) -> Product | None:
        """Return the monthly product for a tier — kept as the default
        lookup for the startup check and any caller that doesn't care
        about billing interval. For interval-aware lookups, use
        `get_by_tier_and_interval`."""
        return await self.get_by_tier_and_interval(platform_org_id, tier, "month")

    async def get_by_tier_and_interval(
        self,
        platform_org_id: UUID,
        tier: str,
        billing_interval: str,
    ) -> Product | None:
        """Resolve the platform-org Product for (tier, billing_interval).

        Falls back to ignoring billing_interval when no row stores it
        (pre-annual seed) — that way a stale DB still returns the
        monthly row for "month" lookups before re-seeding lands.
        """
        statement = (
            select(Product)
            .where(Product.organization_id == platform_org_id)
            .where(Product.user_metadata["tier"].astext == tier)
            .where(Product.user_metadata["billing_interval"].astext == billing_interval)
            .where(Product.deleted_at.is_(None))
            .where(Product.is_archived.is_(False))
        )
        product = await self.get_one_or_none(statement)
        if product is not None or billing_interval != "month":
            return product

        # Backcompat: a pre-annual seed didn't stamp billing_interval.
        # For a "month" lookup, fall back to any tier-matching product
        # without the key so existing deploys still work.
        fallback = (
            select(Product)
            .where(Product.organization_id == platform_org_id)
            .where(Product.user_metadata["tier"].astext == tier)
            .where(Product.deleted_at.is_(None))
            .where(Product.is_archived.is_(False))
        )
        return await self.get_one_or_none(fallback)


class _PlatformCustomerRepository(RepositoryBase[Customer]):
    model = Customer

    async def get_for_creator_org(
        self,
        platform_org_id: UUID,
        creator_org_id: UUID,
        *,
        load_organization: bool = False,
    ) -> Customer | None:
        statement = (
            select(Customer)
            .where(Customer.organization_id == platform_org_id)
            .where(
                Customer.user_metadata["creator_org_id"].astext == str(creator_org_id)
            )
            .where(Customer.deleted_at.is_(None))
        )
        # Customer.organization is lazy="raise"; callers that read it (e.g.
        # building the customer-portal URL, which needs organization.slug)
        # must opt in to eager-loading it, or the access raises -> 500.
        if load_organization:
            statement = statement.options(selectinload(Customer.organization))
        return await self.get_one_or_none(statement)


class _PlatformSubscriptionRepository(RepositoryBase[Subscription]):
    model = Subscription

    async def get_active_for_customer(self, customer_id: UUID) -> Subscription | None:
        # Returns the customer's current *billable* subscription — active,
        # trialing, OR past_due. past_due is included on purpose: while a
        # creator's Spaire charge is being retried (dunning window), they
        # keep their tier entitlements and the dashboard can surface the
        # "payment failed, pay by {date}" state. Only a fully canceled sub
        # drops them out (-> inactive).
        #
        # Subscription.product is lazy="raise" so we eager-load it here —
        # every caller reads .product (user_metadata.tier or product.id).
        statement = (
            select(Subscription)
            .where(Subscription.customer_id == customer_id)
            .where(Subscription.status.in_(SubscriptionStatus.billable_statuses()))
            .where(Subscription.deleted_at.is_(None))
            .options(selectinload(Subscription.product))
            .order_by(Subscription.created_at.desc())
            .limit(1)
        )
        return await self.get_one_or_none(statement)

    async def list_active_for_customer(self, customer_id: UUID) -> list[Subscription]:
        """Every active/trialing subscription for a platform customer,
        newest first."""
        statement = (
            select(Subscription)
            .where(Subscription.customer_id == customer_id)
            .where(Subscription.status.in_(SubscriptionStatus.active_statuses()))
            .where(Subscription.deleted_at.is_(None))
            .options(selectinload(Subscription.product))
            .order_by(Subscription.created_at.desc())
        )
        return list(await self.get_all(statement))

    async def list_billable_for_customer(self, customer_id: UUID) -> list[Subscription]:
        """Every billable (active / trialing / past_due) subscription for a
        platform customer, newest first. Used by trial supersession so that
        a past_due sub in its dunning window is also superseded when the
        creator completes a new paid checkout — otherwise its dunning
        retries keep charging the card alongside the new subscription.
        """
        statement = (
            select(Subscription)
            .where(Subscription.customer_id == customer_id)
            .where(Subscription.status.in_(SubscriptionStatus.billable_statuses()))
            .where(Subscription.deleted_at.is_(None))
            .options(selectinload(Subscription.product))
            .order_by(Subscription.created_at.desc())
        )
        return list(await self.get_all(statement))

    async def list_stale_legacy_trials(
        self, platform_org_id: UUID, *, before: datetime
    ) -> list[Subscription]:
        """Legacy card-less local trials (``managed_by='trial'``) whose
        trial has already ended.

        These rows are deliberately excluded from the billing scheduler
        (they carry no payment method, so cycling one would emit an
        uncollectable order) and their former owner — the
        ``platform.expire_trials`` cron — was removed with the card-required
        trial redesign. Without a new owner they sit in ``trialing``
        forever, granting paid entitlements for free. The
        ``platform.lapse_legacy_trials`` cron is that owner.
        """
        statement = (
            select(Subscription)
            .join(Customer, Subscription.customer_id == Customer.id)
            .where(Customer.organization_id == platform_org_id)
            .where(Customer.deleted_at.is_(None))
            .where(Subscription.status == SubscriptionStatus.trialing)
            .where(Subscription.deleted_at.is_(None))
            .where(Subscription.user_metadata["managed_by"].astext == "trial")
            .where(Subscription.trial_end.is_not(None))
            .where(Subscription.trial_end < before)
            .options(
                selectinload(Subscription.product),
                selectinload(Subscription.customer),
            )
        )
        return list(await self.get_all(statement))

    async def normalize_legacy_reminder_marker_metadata(self) -> int:
        """Rewrite legacy list-encoded ``trial_reminders_sent`` metadata to
        the scalar comma-string encoding, on subscriptions AND on orders
        that copied the subscription metadata before it was scrubbed.

        The list encoding fails webhook payload validation (scalar-only
        metadata), crashing every lifecycle event on the row — trial
        conversion included. Returns the number of rows healed.
        """
        healed = 0
        for table in ("subscriptions", "orders"):
            result = await self.session.execute(
                text(
                    f"""
                    UPDATE {table}
                    SET user_metadata = jsonb_set(
                        user_metadata,
                        '{{trial_reminders_sent}}',
                        to_jsonb(coalesce((
                            SELECT string_agg(value, ',')
                            FROM jsonb_array_elements_text(
                                user_metadata->'trial_reminders_sent'
                            )
                        ), ''))
                    )
                    WHERE jsonb_typeof(
                        user_metadata->'trial_reminders_sent'
                    ) = 'array'
                    """
                )
            )
            healed += result.rowcount or 0
        return healed

    async def list_legacy_trial_customers_missing_consumed(
        self, platform_org_id: UUID
    ) -> list[Customer]:
        """Platform customers that held a legacy auto-attached trial
        (``managed_by='trial'``, any status) but were never stamped with
        ``trial_consumed_at``.

        Those subscriptions were inserted directly (no
        ``_after_subscription_created`` hook), so the one-trial-per-customer
        stamp never happened — without a backfill each of these creators
        would be handed a second free 14-day trial on re-subscribe.
        """
        statement = (
            select(Customer)
            .join(Subscription, Subscription.customer_id == Customer.id)
            .where(Customer.organization_id == platform_org_id)
            .where(Customer.deleted_at.is_(None))
            .where(Subscription.user_metadata["managed_by"].astext == "trial")
            .where(Subscription.deleted_at.is_(None))
            .where(Customer.user_metadata["trial_consumed_at"].is_(None))
            .distinct()
        )
        return list(await self.get_all(statement))

    async def list_expired_trials(
        self, platform_org_id: UUID, *, before: datetime
    ) -> list[Subscription]:
        """All trialing platform-org subscriptions whose `trial_end`
        has already passed `before`. Joined to Customer so the cron task
        can read user_metadata.creator_org_id without an extra round-trip.
        """
        statement = (
            select(Subscription)
            .join(Customer, Subscription.customer_id == Customer.id)
            .where(Customer.organization_id == platform_org_id)
            .where(Customer.deleted_at.is_(None))
            .where(Subscription.status == SubscriptionStatus.trialing)
            .where(Subscription.deleted_at.is_(None))
            .where(Subscription.trial_end.is_not(None))
            .where(Subscription.trial_end < before)
            .options(
                selectinload(Subscription.product),
                selectinload(Subscription.customer),
            )
        )
        return list(await self.get_all(statement))


def platform_product_repository(
    session: AsyncReadSession,
) -> _PlatformProductRepository:
    return _PlatformProductRepository.from_session(session)


def platform_customer_repository(
    session: AsyncReadSession,
) -> _PlatformCustomerRepository:
    return _PlatformCustomerRepository.from_session(session)


def platform_subscription_repository(
    session: AsyncReadSession,
) -> _PlatformSubscriptionRepository:
    return _PlatformSubscriptionRepository.from_session(session)
