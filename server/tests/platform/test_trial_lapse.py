"""Tests for the legacy-trial lapse sweep and the scheduler-lock reaper.

Legacy card-less trials (`user_metadata.managed_by = "trial"`) are
excluded from the billing scheduler and their old expire cron was
deleted — leaving any remaining row trialing forever: never charged,
never lapsed, paid entitlements granted for free (the bug behind
"my trial ended two days ago and nothing happened").
`lapse_stale_legacy_trials` is the reinstated owner of their
end-of-life.
"""

from datetime import UTC, datetime, timedelta

import pytest
from pytest_mock import MockerFixture

from polar.enums import SubscriptionRecurringInterval
from polar.models import Customer, Organization, Product, Subscription
from polar.models.subscription import SubscriptionStatus
from polar.platform.trial_lapse import lapse_stale_legacy_trials
from polar.postgres import AsyncSession
from polar.subscription.repository import SubscriptionRepository
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


async def _platform_setup(
    save_fixture: SaveFixture, mocker: MockerFixture
) -> tuple[Organization, Product]:
    platform_org = await create_organization(save_fixture)
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id)
    product = await create_product(
        save_fixture,
        organization=platform_org,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=[(4900, "usd")],
    )
    product.user_metadata = {"tier": "starter"}
    await save_fixture(product)
    return platform_org, product


async def _legacy_trial(
    save_fixture: SaveFixture,
    platform_org: Organization,
    product: Product,
    *,
    trial_end: datetime,
) -> tuple[Customer, Subscription]:
    creator = await create_organization(save_fixture)
    customer = await create_customer(
        save_fixture,
        organization=platform_org,
        email=f"creator-{creator.slug}@billing.spairehq.internal",
        user_metadata={"creator_org_id": str(creator.id)},
    )
    subscription = await create_subscription(
        save_fixture,
        product=product,
        customer=customer,
        status=SubscriptionStatus.trialing,
        trial_start=trial_end - timedelta(days=14),
        trial_end=trial_end,
        current_period_end=trial_end,
        user_metadata={"managed_by": "trial"},
    )
    return customer, subscription


@pytest.mark.asyncio
class TestLapseStaleLegacyTrials:
    async def test_expired_legacy_trial_is_revoked_and_stamped(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org, product = await _platform_setup(save_fixture, mocker)
        customer, subscription = await _legacy_trial(
            save_fixture,
            platform_org,
            product,
            trial_end=datetime.now(UTC) - timedelta(days=2),
        )

        counters = await lapse_stale_legacy_trials(session)

        assert counters["lapsed"] == 1
        assert counters["trial_consumed_stamped"] == 1
        await session.refresh(subscription)
        assert subscription.status == SubscriptionStatus.canceled
        assert subscription.ended_at is not None
        await session.refresh(customer)
        assert customer.user_metadata.get("trial_consumed_at")

    async def test_running_trial_is_untouched(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org, product = await _platform_setup(save_fixture, mocker)
        _, subscription = await _legacy_trial(
            save_fixture,
            platform_org,
            product,
            trial_end=datetime.now(UTC) + timedelta(days=5),
        )

        counters = await lapse_stale_legacy_trials(session)

        assert counters["lapsed"] == 0
        await session.refresh(subscription)
        assert subscription.status == SubscriptionStatus.trialing
        # trial_consumed IS stamped even for a running legacy trial:
        # holding one at all means the free trial is used.
        assert counters["trial_consumed_stamped"] == 1

    async def test_card_backed_trial_is_not_lapsed(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org, product = await _platform_setup(save_fixture, mocker)
        creator = await create_organization(save_fixture)
        customer = await create_customer(
            save_fixture,
            organization=platform_org,
            email="real@example.com",
            user_metadata={"creator_org_id": str(creator.id)},
        )
        # A checkout-created trial has NO managed_by key — the cycle
        # scheduler owns it (charge at trial_end), not the lapse sweep.
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_end=datetime.now(UTC) - timedelta(days=1),
            current_period_end=datetime.now(UTC) - timedelta(days=1),
        )

        counters = await lapse_stale_legacy_trials(session)

        assert counters["lapsed"] == 0
        await session.refresh(subscription)
        assert subscription.status == SubscriptionStatus.trialing

    async def test_second_run_is_a_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org, product = await _platform_setup(save_fixture, mocker)
        await _legacy_trial(
            save_fixture,
            platform_org,
            product,
            trial_end=datetime.now(UTC) - timedelta(days=2),
        )

        first = await lapse_stale_legacy_trials(session)
        second = await lapse_stale_legacy_trials(session)

        assert first["lapsed"] == 1
        assert second["lapsed"] == 0
        assert second["trial_consumed_stamped"] == 0

    async def test_unconfigured_platform_is_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
    ) -> None:
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", None)
        counters = await lapse_stale_legacy_trials(session)
        assert counters["lapsed"] == 0
        assert counters["trial_consumed_stamped"] == 0

    async def test_sweep_heals_legacy_list_markers(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Rows written by the old code carry trial_reminders_sent as a
        # JSON list, which fails scalar-only webhook metadata validation
        # and crashes every lifecycle event on the row. The hourly sweep
        # must rewrite them to the comma-string encoding.
        platform_org, product = await _platform_setup(save_fixture, mocker)
        customer = await create_customer(
            save_fixture, organization=platform_org, email="legacy@example.com"
        )
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_end=datetime.now(UTC) + timedelta(days=1),
            current_period_end=datetime.now(UTC) + timedelta(days=1),
            user_metadata={"trial_reminders_sent": [7, 2, 0]},
        )

        counters = await lapse_stale_legacy_trials(session)

        assert counters["markers_healed"] == 1
        await session.refresh(subscription)
        assert subscription.user_metadata.get("trial_reminders_sent") == "7,2,0"
        # Idempotent: second run heals nothing.
        again = await lapse_stale_legacy_trials(session)
        assert again["markers_healed"] == 0


@pytest.mark.asyncio
class TestSchedulerLockReaper:
    async def test_stale_lock_on_due_subscription_is_listed(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org, product = await _platform_setup(save_fixture, mocker)
        customer = await create_customer(
            save_fixture, organization=platform_org, email="stuck@example.com"
        )
        now = datetime.now(UTC)
        stuck = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            current_period_end=now - timedelta(hours=3),
            scheduler_locked_at=now - timedelta(hours=2),
        )
        # In-flight lock (too fresh) — must NOT be reaped.
        fresh_customer = await create_customer(
            save_fixture, organization=platform_org, email="fresh@example.com"
        )
        await create_subscription(
            save_fixture,
            product=product,
            customer=fresh_customer,
            status=SubscriptionStatus.active,
            current_period_end=now - timedelta(minutes=10),
            scheduler_locked_at=now - timedelta(minutes=5),
        )
        # Locked but not due (period end in the future) — must NOT be reaped.
        future_customer = await create_customer(
            save_fixture, organization=platform_org, email="future@example.com"
        )
        await create_subscription(
            save_fixture,
            product=product,
            customer=future_customer,
            status=SubscriptionStatus.active,
            current_period_end=now + timedelta(days=10),
            scheduler_locked_at=now - timedelta(hours=2),
        )

        repository = SubscriptionRepository.from_session(session)
        stale = await repository.list_stale_scheduler_locked(
            locked_before=now - timedelta(hours=1),
            due_before=now,
        )

        assert [s.id for s in stale] == [stuck.id]
