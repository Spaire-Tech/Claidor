from uuid import UUID

import pytest
from pytest_mock import MockerFixture
from sqlalchemy import func, select

from polar.entitlements.tiers import TierKey
from polar.enums import SubscriptionRecurringInterval
from polar.models import Customer, Organization, Product, Subscription
from polar.models.subscription import SubscriptionStatus
from polar.platform.billing import (
    TierProductMissing,
    platform_billing,
)
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    PriceFixtureType,
    create_organization,
    create_product,
)


def _patch_platform_org_id(mocker: MockerFixture, org_id: UUID | None) -> None:
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", org_id)


async def _seed_tier_product(
    save_fixture: SaveFixture,
    *,
    platform_org: Organization,
    tier: str,
    monthly_cents: int = 0,
) -> Product:
    prices: list[PriceFixtureType] = (
        [(None, "usd")] if monthly_cents == 0 else [(monthly_cents, "usd")]
    )
    product = await create_product(
        save_fixture,
        organization=platform_org,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=prices,
    )
    product.user_metadata = {"tier": tier}
    await save_fixture(product)
    return product


@pytest.mark.asyncio
class TestEnsureStarterTrialSubscription:
    async def test_no_platform_org_configured_is_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        _patch_platform_org_id(mocker, None)
        creator = await create_organization(save_fixture)

        result = await platform_billing.ensure_starter_trial_subscription(session, creator)

        assert result is None
        # No platform-org Customer or Subscription should exist.
        customer_count = (
            await session.execute(select(func.count(Customer.id)))
        ).scalar_one()
        subscription_count = (
            await session.execute(select(func.count(Subscription.id)))
        ).scalar_one()
        assert customer_count == 0
        assert subscription_count == 0

    async def test_platform_org_itself_is_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        result = await platform_billing.ensure_starter_trial_subscription(
            session, platform_org
        )

        assert result is None
        customer_count = (
            await session.execute(select(func.count(Customer.id)))
        ).scalar_one()
        assert customer_count == 0

    async def test_missing_pro_product_raises(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        with pytest.raises(TierProductMissing):
            await platform_billing.ensure_starter_trial_subscription(session, creator)

    async def test_creates_customer_and_active_subscription(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        pro_product = await _seed_tier_product(
            save_fixture, platform_org=platform_org, tier=TierKey.starter.value
        )

        subscription = await platform_billing.ensure_starter_trial_subscription(
            session, creator
        )

        assert subscription is not None
        assert subscription.product_id == pro_product.id
        assert subscription.status == SubscriptionStatus.active
        assert subscription.amount == 0
        assert subscription.net_amount == 0
        assert subscription.cancel_at_period_end is False

        # A platform-org Customer should have been created and linked to the
        # creator org via metadata.
        customer = (
            await session.execute(
                select(Customer).where(Customer.id == subscription.customer_id)
            )
        ).scalar_one()
        assert customer.organization_id == platform_org.id
        assert customer.user_metadata["creator_org_id"] == str(creator.id)
        assert customer.name == creator.name

    async def test_idempotent_when_already_subscribed(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        await _seed_tier_product(
            save_fixture, platform_org=platform_org, tier=TierKey.starter.value
        )

        first = await platform_billing.ensure_starter_trial_subscription(session, creator)
        assert first is not None

        second = await platform_billing.ensure_starter_trial_subscription(session, creator)
        assert second is not None
        assert second.id == first.id

        # Only one Customer and one Subscription should exist for this creator.
        customer_count = (
            await session.execute(
                select(func.count(Customer.id)).where(
                    Customer.organization_id == platform_org.id
                )
            )
        ).scalar_one()
        subscription_count = (
            await session.execute(
                select(func.count(Subscription.id)).where(
                    Subscription.customer_id == first.customer_id
                )
            )
        ).scalar_one()
        assert customer_count == 1
        assert subscription_count == 1

    async def test_ensure_subscription_does_not_replace_existing_sub(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """If an org already has any active platform sub (Starter trial,
        Studio, etc.), a later call with a different tier returns the
        existing one rather than creating a duplicate."""
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        await _seed_tier_product(
            save_fixture, platform_org=platform_org, tier=TierKey.starter.value
        )
        await _seed_tier_product(
            save_fixture, platform_org=platform_org, tier=TierKey.studio.value
        )

        first = await platform_billing.ensure_subscription(
            session, creator, tier=TierKey.starter
        )
        assert first is not None
        assert first.product.user_metadata["tier"] == "starter"

        second = await platform_billing.ensure_subscription(
            session,
            creator,
            tier=TierKey.studio,
        )
        assert second is not None
        assert second.id == first.id
        # Still on Starter, not switched to Studio.
        assert second.product.user_metadata["tier"] == "starter"

    async def test_reuses_existing_customer_when_subscription_is_missing(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """Simulates a partial state where the Customer was created but
        the subscription creation failed previously."""
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        await _seed_tier_product(
            save_fixture, platform_org=platform_org, tier=TierKey.starter.value
        )

        existing_customer = Customer(
            email=f"creator-{creator.slug}@billing.spairehq.internal",
            name=creator.name,
            organization_id=platform_org.id,
            user_metadata={"creator_org_id": str(creator.id)},
        )
        await save_fixture(existing_customer)

        subscription = await platform_billing.ensure_starter_trial_subscription(
            session, creator
        )

        assert subscription is not None
        assert subscription.customer_id == existing_customer.id

        customer_count = (
            await session.execute(
                select(func.count(Customer.id)).where(
                    Customer.organization_id == platform_org.id
                )
            )
        ).scalar_one()
        assert customer_count == 1
