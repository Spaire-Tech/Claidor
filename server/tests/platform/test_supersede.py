"""Trial supersession must go through the real subscription lifecycle.

The old implementation flipped status fields directly: no webhooks, no
benefit revocation, no fee resync — and it missed `past_due` siblings,
leaving their dunning retries charging the card alongside the brand-new
subscription.
"""

from datetime import UTC, datetime, timedelta

import pytest
from pytest_mock import MockerFixture

from polar.enums import SubscriptionRecurringInterval
from polar.models import Customer, Organization, Product
from polar.models.subscription import SubscriptionStatus
from polar.platform.fee_sync import maybe_supersede_platform_trial
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


async def _setup(
    save_fixture: SaveFixture, mocker: MockerFixture
) -> tuple[Organization, Product, Customer]:
    platform_org = await create_organization(save_fixture)
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id)
    product = await create_product(
        save_fixture,
        organization=platform_org,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=[(12900, "usd")],
    )
    product.user_metadata = {"tier": "studio"}
    await save_fixture(product)
    creator = await create_organization(save_fixture)
    customer = await create_customer(
        save_fixture,
        organization=platform_org,
        email="creator@example.com",
        user_metadata={"creator_org_id": str(creator.id)},
    )
    return platform_org, product, customer


@pytest.mark.asyncio
class TestMaybeSupersedePlatformTrial:
    async def test_trial_is_revoked_and_markers_carried(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org, product, customer = await _setup(save_fixture, mocker)

        old_trial = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_end=datetime.now(UTC) + timedelta(days=5),
            user_metadata={"trial_reminders_sent": "7"},
        )
        new_sub = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_end=datetime.now(UTC) + timedelta(days=5),
        )

        await maybe_supersede_platform_trial(session, new_sub)

        await session.refresh(old_trial)
        assert old_trial.status == SubscriptionStatus.canceled
        assert old_trial.ended_at is not None
        assert old_trial.user_metadata.get("superseded_by") == str(new_sub.id)
        # Reminder idempotency markers carried over so the T-7 email isn't
        # re-sent for the replacement trial (scalar comma-string encoding —
        # a list here breaks webhook payload serialization).
        assert new_sub.user_metadata.get("trial_reminders_sent") == "7"

    async def test_past_due_sibling_is_superseded_too(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org, product, customer = await _setup(save_fixture, mocker)

        past_due = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.past_due,
            past_due_at=datetime.now(UTC) - timedelta(days=3),
        )
        new_sub = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.active,
            started_at=datetime.now(UTC),
        )

        await maybe_supersede_platform_trial(session, new_sub)

        await session.refresh(past_due)
        # The delinquent sub must not stay billable next to the new one —
        # canceled status is also what stops its dunning retries.
        assert past_due.status == SubscriptionStatus.canceled

    async def test_non_platform_subscription_is_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", None)
        org = await create_organization(save_fixture)
        product = await create_product(
            save_fixture,
            organization=org,
            recurring_interval=SubscriptionRecurringInterval.month,
            prices=[(1000, "usd")],
        )
        customer = await create_customer(save_fixture, organization=org)
        other = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.active,
        )
        new_sub = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.active,
        )

        await maybe_supersede_platform_trial(session, new_sub)

        await session.refresh(other)
        assert other.status == SubscriptionStatus.active
