"""Ending a Spaire subscription (incl. a trial) must return a serializable
Subscription — not 500.

The platform cancel endpoint does SubscriptionSchema.model_validate() on the
subscription returned by platform_management.cancel_at_period_end. That
subscription comes from get_active_for_customer, which only eager-loads
`product` — so `customer`, `product.medias`, and `product.attached_custom_
fields` are lazy="raise" and serialization blew up with a 500. The endpoint
now reloads via _serialize_subscription with the canonical eager options.

These tests drive the real cancel service + the real serialize helper.
"""

import pytest
from pydantic import ValidationError
from pytest_mock import MockerFixture
from sqlalchemy.ext.asyncio import AsyncSession

from polar.enums import SubscriptionRecurringInterval
from polar.locker import Locker
from polar.models import Organization, Subscription
from polar.models.subscription import SubscriptionStatus
from polar.platform.endpoints import _serialize_subscription
from polar.platform.management import platform_management
from polar.subscription.repository import SubscriptionRepository
from polar.subscription.schemas import Subscription as SubscriptionSchema
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    PriceFixtureType,
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


async def _trialing_creator(
    save_fixture: SaveFixture,
    mocker: MockerFixture,
) -> Organization:
    """A creator org on a trialing Starter Spaire subscription."""
    platform_org = await create_organization(save_fixture)
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id)
    prices: list[PriceFixtureType] = [(4900, "usd")]
    product = await create_product(
        save_fixture,
        organization=platform_org,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=prices,
    )
    product.user_metadata = {"tier": "starter"}
    await save_fixture(product)
    creator = await create_organization(save_fixture)
    customer = await create_customer(
        save_fixture,
        organization=platform_org,
        email=f"creator-{creator.id}@billing.spaire",
        user_metadata={"creator_org_id": str(creator.id)},
    )
    await create_subscription(
        save_fixture,
        product=product,
        customer=customer,
        status=SubscriptionStatus.trialing,
    )
    return creator


@pytest.mark.asyncio
class TestCancelSubscription:
    async def test_cancel_trial_keeps_access_until_trial_end(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        locker: Locker,
    ) -> None:
        creator = await _trialing_creator(save_fixture, mocker)

        # The real cancel path: a trialing sub now schedules cancellation at
        # period end — the creator keeps their remaining trial days (as the
        # reminder emails promise) and is never charged. It must NOT be
        # revoked on the spot.
        canceled = await platform_management.cancel_at_period_end(
            session, locker, organization=creator
        )
        assert canceled.status == SubscriptionStatus.trialing
        assert canceled.cancel_at_period_end is True
        assert canceled.canceled_at is not None
        assert canceled.ended_at is None

        # The exact thing that 500'd in prod — serializing what cancel
        # returns. The endpoint reloads via _serialize_subscription; must work.
        result = await _serialize_subscription(session, canceled)
        assert isinstance(result, SubscriptionSchema)
        assert result.id == canceled.id

    async def test_canceled_trial_revokes_without_charging_at_trial_end(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        locker: Locker,
    ) -> None:
        from polar.subscription.service import (
            subscription as subscription_service,
        )

        creator = await _trialing_creator(save_fixture, mocker)
        canceled = await platform_management.cancel_at_period_end(
            session, locker, organization=creator
        )

        # At trial end the scheduler cycles the subscription. A canceled
        # trial must end (status canceled), not resurrect to `active` —
        # the previous cycle() flipped previous_status==trialing back to
        # active even on the revoke branch.
        cycled = await subscription_service.cycle(
            session, canceled, update_cycle_dates=False
        )
        assert cycled.status == SubscriptionStatus.canceled
        assert cycled.ended_at is not None

    async def test_bare_subscription_serialization_reproduces_the_500(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Regression guard: a subscription without the eager loads can't be
        # serialized directly (this is what the endpoint used to do).
        org = await create_organization(save_fixture)
        product = await create_product(
            save_fixture,
            organization=org,
            recurring_interval=SubscriptionRecurringInterval.month,
            prices=[(4900, "usd")],
        )
        customer = await create_customer(save_fixture, organization=org)
        subscription = await create_subscription(
            save_fixture, product=product, customer=customer
        )

        # Drop the identity map so a fresh load has relationships unloaded.
        session.expunge_all()
        repo = SubscriptionRepository.from_session(session)
        bare = await repo.get_one_or_none(
            repo.get_base_statement().where(Subscription.id == subscription.id)
        )
        assert bare is not None
        with pytest.raises(ValidationError):
            SubscriptionSchema.model_validate(bare)

        # ...but the reload helper makes it serializable.
        result = await _serialize_subscription(session, bare)
        assert result.id == subscription.id
