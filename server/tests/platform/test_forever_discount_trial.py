"""End-to-end simulation of the owner's reported state: a Spaire plan
trial started through checkout with a 100% FOREVER discount, whose
trial_end is days in the past, still sitting in `trialing`.

Proves what the billing engine does with that exact subscription once the
scheduler runs: the jobstore must pick it up, cycle() must flip it to
active, and the resulting order must be $0 and immediately settled (the
forever discount means no charge, no dunning — ever).
"""

from datetime import UTC, datetime, timedelta

import pytest
from pytest_mock import MockerFixture

from polar.config import settings
from polar.enums import SubscriptionRecurringInterval
from polar.models import Discount, Organization, Product, Subscription
from polar.models.discount import DiscountDuration, DiscountType
from polar.models.order import OrderStatus
from polar.models.subscription import SubscriptionStatus
from polar.order.service import OrderBillingReasonInternal
from polar.order.service import order as order_service
from polar.postgres import AsyncSession
from polar.subscription.scheduler import SubscriptionJobStore
from polar.subscription.service import subscription as subscription_service
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    create_customer,
    create_discount,
    create_organization,
    create_product,
    create_subscription,
)


def _base_statement():
    store = SubscriptionJobStore.__new__(SubscriptionJobStore)
    return store._get_base_statement()


async def _expired_forever_discount_trial(
    save_fixture: SaveFixture, mocker: MockerFixture
) -> tuple[Organization, Product, Discount, Subscription]:
    platform_org = await create_organization(save_fixture)
    mocker.patch.object(settings, "PLATFORM_ORG_ID", platform_org.id)
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id)
    product = await create_product(
        save_fixture,
        organization=platform_org,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=[(4900, "usd")],
    )
    product.user_metadata = {"tier": "starter"}
    await save_fixture(product)
    discount = await create_discount(
        save_fixture,
        type=DiscountType.percentage,
        basis_points=10_000,  # 100% off
        duration=DiscountDuration.forever,
        organization=platform_org,
    )
    customer = await create_customer(
        save_fixture, organization=platform_org, email="founder@example.com"
    )
    trial_end = datetime.now(UTC) - timedelta(days=4)  # "ended Jul 24"
    subscription = await create_subscription(
        save_fixture,
        product=product,
        customer=customer,
        status=SubscriptionStatus.trialing,
        trial_start=trial_end - timedelta(days=14),
        trial_end=trial_end,
        current_period_start=trial_end - timedelta(days=14),
        current_period_end=trial_end,
        discount=discount,
        # Checkout-created: no managed_by key, and with a 100% forever
        # discount no payment method was captured.
    )
    return platform_org, product, discount, subscription


@pytest.mark.asyncio
class TestExpiredForeverDiscountTrial:
    async def test_scheduler_picks_it_up(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        _, _, _, subscription = await _expired_forever_discount_trial(
            save_fixture, mocker
        )
        result = await session.execute(_base_statement())
        ids = {row.id for row in result.scalars().all()}
        assert subscription.id in ids

    async def test_cycle_converts_and_settles_at_zero(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        _, _, _, subscription = await _expired_forever_discount_trial(
            save_fixture, mocker
        )

        cycled = await subscription_service.cycle(session, subscription)

        assert cycled.status == SubscriptionStatus.active
        assert cycled.current_period_end is not None
        assert cycled.current_period_end > datetime.now(UTC)
        assert cycled.scheduler_locked_at is None

        order = await order_service.create_subscription_order(
            session,
            cycled,
            OrderBillingReasonInternal.subscription_cycle_after_trial,
        )

        # 100% forever discount: order exists for the record, totals zero,
        # settles instantly — no charge attempt, no dunning, no card needed.
        assert order.subtotal_amount == 4900
        assert order.discount_amount == 4900
        assert order.total_amount == 0
        assert order.status == OrderStatus.paid
        assert order.next_payment_attempt_at is None

    async def test_cycle_survives_legacy_list_reminder_markers(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """Direct reproduction of the production crash:

        subscription.cycle → ValidationError on the subscription.updated
        webhook payload because trial_reminders_sent was stored as a JSON
        list by the old reminder code. The cycle must heal the metadata
        in place and complete.
        """
        _, _, _, subscription = await _expired_forever_discount_trial(
            save_fixture, mocker
        )
        subscription.user_metadata = {"trial_reminders_sent": [7, 2, 0]}
        await save_fixture(subscription)

        cycled = await subscription_service.cycle(session, subscription)

        assert cycled.status == SubscriptionStatus.active
        assert cycled.user_metadata.get("trial_reminders_sent") == "7,2,0"
