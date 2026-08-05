"""Platform-side billing: subscribe creator organizations to Spaire's own
Pro/Studio/Scale plans.

This is the write counterpart to polar.entitlements.service (read-only).
Spaire is itself an Organization (the "platform org"); every creator org
is a Customer of that platform org and holds a Subscription to one of
the platform's products. This module manages that linkage.
"""

import logging
from datetime import datetime
from uuid import UUID

import structlog

from polar.entitlements.tiers import TierKey
from polar.enums import SubscriptionRecurringInterval
from polar.exceptions import PolarError
from polar.kit.utils import utc_now
from polar.models import Customer, Organization, Product, Subscription
from polar.models.product_price import (
    ProductPriceFixed,
    ProductPriceFree,
)
from polar.models.subscription import SubscriptionStatus
from polar.models.subscription_product_price import SubscriptionProductPrice
from polar.platform.service import platform as platform_service
from polar.postgres import AsyncSession

from .fee_sync import enqueue_sync as enqueue_fee_sync
from .repository import (
    platform_customer_repository,
    platform_product_repository,
    platform_subscription_repository,
)

log: structlog.stdlib.BoundLogger = structlog.get_logger()
logging.getLogger(__name__)


class PlatformBillingError(PolarError): ...


class TierProductMissing(PlatformBillingError):
    """The platform-org product for a tier doesn't exist yet.

    Surfaces when scripts.seed_platform_products hasn't been run on this
    environment. The caller (a Dramatiq task) catches this, logs, and
    returns — we'd rather have an org without a Spaire subscription than
    block its creation.
    """

    def __init__(self, tier: TierKey) -> None:
        super().__init__(
            f"No platform-org product found with metadata.tier='{tier.value}'. "
            "Run `uv run task seed_platform_products` to create them.",
            500,
        )


def _billing_email(organization: Organization) -> str:
    """Synthetic Customer.email for the platform-org Customer that anchors
    this creator org's Spaire subscription. During the Pro trial Spaire
    doesn't send invoices, so the address doesn't need to be deliverable.
    When the creator goes through checkout to convert / upgrade, real
    billing details are captured and overwrite this synthetic value.
    """
    return f"creator-{organization.slug}@billing.spairehq.internal"


def _price_amount_cents(product: Product) -> int:
    """Resolve the recurring base amount in cents for a platform product.

    Treats Free / metered-only products as $0.
    """
    for price in product.prices:
        if isinstance(price, ProductPriceFree):
            return 0
        if isinstance(price, ProductPriceFixed):
            return price.price_amount
    return 0


class PlatformBillingService:
    async def ensure_subscription(
        self,
        session: AsyncSession,
        organization: Organization,
        *,
        tier: TierKey,
        managed_by: str | None = None,
    ) -> Subscription | None:
        """Ensure the creator organization has an active platform-org
        subscription to the given tier's product.

        Idempotent: re-running is a no-op once an active subscription
        exists for this creator (regardless of which tier — we never
        downgrade a creator who already has a sub). Returns None when
        no platform org is configured or when the organization IS the
        platform org itself.

        `managed_by` is stamped onto Subscription.user_metadata so
        backfills (grandfather migrations, etc.) can be distinguished
        from user-initiated subscriptions in analytics.
        """
        if not platform_service.is_configured():
            return None

        platform_org_id = platform_service.get_id()
        if organization.id == platform_org_id:
            return None

        customer = await self._ensure_platform_customer(
            session, organization, platform_org_id
        )

        subscription_repo = platform_subscription_repository(session)
        existing = await subscription_repo.get_active_for_customer(customer.id)
        if existing is not None:
            return existing

        product_repo = platform_product_repository(session)
        product = await product_repo.get_by_tier(platform_org_id, tier.value)
        if product is None:
            raise TierProductMissing(tier)

        subscription_metadata: dict[str, str] = {}
        if managed_by is not None:
            subscription_metadata["managed_by"] = managed_by

        subscription = await self._create_subscription(
            session,
            customer=customer,
            product=product,
            subscription_metadata=subscription_metadata,
        )
        # Schedule a tier-fee sync so the creator's Account picks up the
        # tier's list rate. Safe no-op if the org doesn't have an Account yet.
        enqueue_fee_sync(organization.id)
        return subscription

    async def ensure_starter_trial_subscription(
        self,
        session: AsyncSession,
        organization: Organization,
    ) -> Subscription | None:
        """Start a local 14-day Starter trial subscription for an org.

        NOTE: this is NOT the live trial path. Org creation only provisions
        the platform Customer (``ensure_platform_customer``); the real,
        card-required 14-day trial is created through the upgrade-checkout
        flow, which captures a payment method via a setup intent. At
        trial_end Polar's own cycle scheduler (not Stripe — there is no
        Stripe subscription object) charges the saved card.

        This helper creates a LOCAL trialing subscription with no captured
        payment method — it does not bill, and nothing in production calls
        it. It's retained only for the platform-billing tests. Do NOT wire
        it back into org creation: such a trial never charges; the
        `platform.lapse_legacy_trials` cron revokes it at trial_end.
        """
        return await self.ensure_subscription(
            session, organization, tier=TierKey.starter, managed_by="trial"
        )

    async def ensure_platform_customer(
        self,
        session: AsyncSession,
        organization: Organization,
    ) -> Customer | None:
        """Idempotently create the platform-org Customer row for a creator
        org. Used by the org-creation hook so /v1/platform/upgrade-checkout
        can attach a real customer_id from the very first click. Does NOT
        create a subscription — Stripe handles the trial when the creator
        picks a plan and goes through checkout.

        Returns None when the platform org isn't configured (dev mode).
        """
        if not platform_service.is_configured():
            return None
        platform_org_id = platform_service.get_id()
        if organization.id == platform_org_id:
            return None
        return await self._ensure_platform_customer(
            session, organization, platform_org_id
        )

    async def _ensure_platform_customer(
        self,
        session: AsyncSession,
        organization: Organization,
        platform_org_id: UUID,
    ) -> Customer:
        customer_repo = platform_customer_repository(session)
        existing = await customer_repo.get_for_creator_org(
            platform_org_id, organization.id
        )
        if existing is not None:
            return existing

        customer = Customer(
            email=_billing_email(organization),
            name=organization.name,
            organization_id=platform_org_id,
            user_metadata={"creator_org_id": str(organization.id)},
        )
        session.add(customer)
        await session.flush()
        return customer

    async def _create_subscription(
        self,
        session: AsyncSession,
        *,
        customer: Customer,
        product: Product,
        subscription_metadata: dict[str, str] | None = None,
    ) -> Subscription:
        recurring_interval = (
            product.recurring_interval or SubscriptionRecurringInterval.month
        )
        recurring_interval_count = product.recurring_interval_count or 1
        amount = _price_amount_cents(product)
        currency = "usd"

        now = utc_now()

        # If the product carries a trial configuration, the subscription
        # starts in `trialing` status and its first period ends when the
        # trial does. Conversion (capture a payment method, transition to
        # `active`) happens via the upgrade-checkout flow.
        is_trial = (
            product.trial_interval is not None
            and product.trial_interval_count is not None
        )
        if is_trial:
            assert product.trial_interval is not None
            assert product.trial_interval_count is not None
            trial_end = product.trial_interval.get_end(
                now, product.trial_interval_count
            )
            status = SubscriptionStatus.trialing
            current_period_end = trial_end
            trial_start: datetime | None = now
            trial_end_at: datetime | None = trial_end
        else:
            status = SubscriptionStatus.active
            current_period_end = recurring_interval.get_next_period(
                now, recurring_interval_count
            )
            trial_start = None
            trial_end_at = None

        subscription_prices = [
            SubscriptionProductPrice.from_price(price) for price in product.prices
        ]

        subscription = Subscription(
            amount=amount,
            net_amount=amount,
            currency=currency,
            recurring_interval=recurring_interval,
            recurring_interval_count=recurring_interval_count,
            status=status,
            current_period_start=now,
            current_period_end=current_period_end,
            cancel_at_period_end=False,
            started_at=now,
            trial_start=trial_start,
            trial_end=trial_end_at,
            customer=customer,
            product=product,
            subscription_product_prices=subscription_prices,
            user_metadata=subscription_metadata or {},
        )
        session.add(subscription)
        await session.flush()

        log.info(
            "platform_billing.subscription_created",
            creator_org_id=customer.user_metadata.get("creator_org_id"),
            customer_id=str(customer.id),
            subscription_id=str(subscription.id),
            product_id=str(product.id),
            tier=(product.user_metadata or {}).get("tier"),
            status=status.value,
            trial_end=trial_end_at.isoformat() if trial_end_at else None,
        )
        return subscription


platform_billing = PlatformBillingService()
