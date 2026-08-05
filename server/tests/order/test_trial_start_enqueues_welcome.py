"""A trial-start order enqueues the subscribe job that fires the
'Subscription started' (on_subscription_created) welcome automation.

This is the link the welcome-email fix depends on and that wasn't tested
before: paying the first (subscription_create) order of a trialing
subscription must enqueue email_subscriber.subscribe_from_order WITH the
subscription_id + product_id so the task can fire on_subscription_created.
"""

import pytest
from pytest_mock import MockerFixture
from sqlalchemy.ext.asyncio import AsyncSession

from polar.enums import SubscriptionRecurringInterval
from polar.models.order import OrderBillingReasonInternal
from polar.order.service import order as order_service
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    create_customer,
    create_organization,
    create_product,
    create_trialing_subscription,
)


@pytest.mark.asyncio
class TestTrialStartEnqueuesWelcome:
    async def test_trial_order_enqueues_subscribe_with_subscription_id(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        org = await create_organization(save_fixture)
        product = await create_product(
            save_fixture,
            organization=org,
            recurring_interval=SubscriptionRecurringInterval.month,
            prices=[(4900, "usd")],
        )
        customer = await create_customer(save_fixture, organization=org)
        subscription = await create_trialing_subscription(
            save_fixture, product=product, customer=customer
        )

        enqueue = mocker.patch("polar.order.service.enqueue_job")

        # The real trial-start order (what checkout creates for a trialing sub).
        await order_service.create_trial_order(
            session,
            subscription,
            OrderBillingReasonInternal.subscription_create,
        )

        subscribe_calls = [
            c
            for c in enqueue.call_args_list
            if c.args and c.args[0] == "email_subscriber.subscribe_from_order"
        ]
        assert len(subscribe_calls) == 1
        kwargs = subscribe_calls[0].kwargs
        # The crux: subscription_id + product_id are passed, so the task fires
        # on_subscription_created (a one-time purchase / renewal passes None).
        assert kwargs["subscription_id"] == str(subscription.id)
        assert kwargs["product_id"] == str(product.id)
        assert kwargs["organization_id"] == org.id
