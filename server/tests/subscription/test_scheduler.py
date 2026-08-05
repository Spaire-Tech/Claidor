"""The subscription cycle scheduler must not pick up legacy card-less
Spaire trials (managed_by=trial) ON THE PLATFORM ORG — those carry no
payment method; cycling one would flip it to active and emit an
uncollectable order. Their end-of-life is owned by the
platform.lapse_legacy_trials cron.

Crucially, the exclusion is scoped to the platform org: subscription
user_metadata is copied verbatim from checkout metadata, which creators
control. A creator's customer passing `{"managed_by": "trial"}` through
checkout must NOT become silently unbillable.
"""

from datetime import timedelta

import pytest
from pytest_mock import MockerFixture

from polar.config import settings
from polar.enums import SubscriptionRecurringInterval
from polar.kit.utils import utc_now
from polar.models import Organization, Product
from polar.models.subscription import SubscriptionStatus
from polar.postgres import AsyncSession
from polar.subscription.scheduler import SubscriptionJobStore
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    create_active_subscription,
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


def _base_statement():
    # Bypass __init__ so we don't spin up the scheduler's sync engine; the
    # statement builder itself uses no instance state.
    store = SubscriptionJobStore.__new__(SubscriptionJobStore)
    return store._get_base_statement()


async def _org_with_product(
    save_fixture: SaveFixture,
) -> tuple[Organization, Product]:
    organization = await create_organization(save_fixture)
    product = await create_product(
        save_fixture,
        organization=organization,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=[(4900, "usd")],
    )
    return organization, product


@pytest.mark.asyncio
class TestSchedulerExcludesLegacyPlatformTrial:
    async def test_platform_trial_excluded_normal_included(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        organization, product = await _org_with_product(save_fixture)
        mocker.patch.object(settings, "PLATFORM_ORG_ID", organization.id)
        customer = await create_customer(save_fixture, organization=organization)

        past = utc_now() - timedelta(hours=1)

        # Legacy platform auto-trial: must NOT be returned by the scheduler.
        trial = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            current_period_end=past,
            trial_end=past,
            user_metadata={"managed_by": "trial"},
        )

        # A normal active subscription on the platform org: must be returned.
        normal = await create_active_subscription(
            save_fixture,
            product=product,
            customer=customer,
            current_period_end=past,
        )

        result = await session.execute(_base_statement())
        ids = {row.id for row in result.scalars().all()}

        assert trial.id not in ids
        assert normal.id in ids

    async def test_creator_sub_with_trial_metadata_is_still_billed(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # A CREATOR org's subscription carrying managed_by=trial in its
        # (checkout-supplied, creator-controlled) metadata must stay in
        # scope — otherwise checkout metadata becomes a
        # never-get-billed-again switch.
        platform_org, _ = await _org_with_product(save_fixture)
        mocker.patch.object(settings, "PLATFORM_ORG_ID", platform_org.id)

        creator_org, creator_product = await _org_with_product(save_fixture)
        customer = await create_customer(
            save_fixture, organization=creator_org, email="buyer@example.com"
        )
        sub = await create_active_subscription(
            save_fixture,
            product=creator_product,
            customer=customer,
            current_period_end=utc_now() - timedelta(hours=1),
        )
        sub.user_metadata = {"managed_by": "trial"}
        await save_fixture(sub)

        result = await session.execute(_base_statement())
        ids = {row.id for row in result.scalars().all()}
        assert sub.id in ids

    async def test_no_platform_org_no_exclusion(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Unconfigured platform (dev/single-tenant): no legacy platform
        # trials can exist, so nothing is excluded on metadata.
        mocker.patch.object(settings, "PLATFORM_ORG_ID", None)
        organization, product = await _org_with_product(save_fixture)
        customer = await create_customer(save_fixture, organization=organization)
        sub = await create_active_subscription(
            save_fixture,
            product=product,
            customer=customer,
            current_period_end=utc_now() - timedelta(hours=1),
        )
        sub.user_metadata = {"managed_by": "trial"}
        await save_fixture(sub)

        result = await session.execute(_base_statement())
        ids = {row.id for row in result.scalars().all()}
        assert sub.id in ids

    async def test_sub_without_managed_by_is_included(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # A subscription whose metadata has no managed_by key (NULL) must
        # stay in scope — is_distinct_from('trial') keeps NULLs — even on
        # the platform org itself.
        organization, product = await _org_with_product(save_fixture)
        mocker.patch.object(settings, "PLATFORM_ORG_ID", organization.id)
        customer = await create_customer(save_fixture, organization=organization)
        sub = await create_active_subscription(
            save_fixture,
            product=product,
            customer=customer,
            current_period_end=utc_now() - timedelta(hours=1),
        )
        assert "managed_by" not in (sub.user_metadata or {})

        result = await session.execute(_base_statement())
        ids = {row.id for row in result.scalars().all()}
        assert sub.id in ids
