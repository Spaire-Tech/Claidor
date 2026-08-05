"""Tests for the platform upgrade-checkout flow and trial supersession.

Covers the platform upgrade / supersession behavior:
  - maybe_supersede_platform_trial: a new paid Spaire sub cancels the
    creator's leftover auto-trial, and is a no-op for the trial itself,
    non-platform subs, and non-paid subs.
  - PlatformUpgradeService.create_checkout: does NOT pre-revoke the trial,
    carries the remaining trial days onto the conversion checkout, bills
    immediately (no trial) for an inactive creator, and writes the
    creator's real billing email onto the platform customer.
"""

from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from pytest_mock import MockerFixture

from polar.entitlements.tiers import TierKey
from polar.enums import SubscriptionRecurringInterval
from polar.kit.trial import TrialInterval
from polar.kit.utils import utc_now
from polar.models import Customer, Organization, Product
from polar.models.subscription import SubscriptionStatus
from polar.platform.fee_sync import (
    maybe_mark_platform_trial_consumed,
    maybe_supersede_platform_trial,
)
from polar.platform.upgrade import (
    AlreadyOnPaidTier,
    _plus_tagged_email,
    platform_upgrade,
)
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    PriceFixtureType,
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


def _patch_platform_org_id(mocker: MockerFixture, org_id: UUID | None) -> None:
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", org_id)


async def _tier_product(
    save_fixture: SaveFixture,
    *,
    platform_org: Organization,
    tier: str,
    interval: str = "month",
    monthly_cents: int = 4900,
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
    product.user_metadata = {"tier": tier, "billing_interval": interval}
    await save_fixture(product)
    return product


async def _platform_customer(
    save_fixture: SaveFixture,
    *,
    platform_org: Organization,
    creator: Organization,
    email: str | None = None,
) -> Customer:
    return await create_customer(
        save_fixture,
        organization=platform_org,
        email=email or f"creator-{creator.slug}@billing.spairehq.internal",
        user_metadata={"creator_org_id": str(creator.id)},
    )


@pytest.mark.asyncio
class TestMaybeSupersedePlatformTrial:
    async def test_paid_sub_cancels_active_trial(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        customer = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )

        trial_product = await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )
        trial = await create_subscription(
            save_fixture,
            product=trial_product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_end=utc_now() + timedelta(days=9),
            user_metadata={"managed_by": "trial"},
        )

        studio_product = await _tier_product(
            save_fixture,
            platform_org=platform_org,
            tier="studio",
            monthly_cents=12900,
        )
        paid = await create_subscription(
            save_fixture,
            product=studio_product,
            customer=customer,
            status=SubscriptionStatus.active,
        )

        await maybe_supersede_platform_trial(session, paid)

        await session.refresh(trial)
        await session.refresh(paid)
        assert trial.status == SubscriptionStatus.canceled
        assert trial.ended_at is not None
        assert paid.status == SubscriptionStatus.active

    async def test_new_trial_supersedes_prior_trial_on_switch(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Mid-trial tier switch: the new (Studio) trial supersedes the prior
        # (Starter) trial so the creator holds exactly one.
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        customer = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )
        starter_product = await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )
        prior_trial = await create_subscription(
            save_fixture,
            product=starter_product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_end=utc_now() + timedelta(days=9),
        )

        studio_product = await _tier_product(
            save_fixture,
            platform_org=platform_org,
            tier="studio",
            monthly_cents=12900,
        )
        new_trial = await create_subscription(
            save_fixture,
            product=studio_product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_end=utc_now() + timedelta(days=9),
        )

        await maybe_supersede_platform_trial(session, new_trial)

        await session.refresh(prior_trial)
        await session.refresh(new_trial)
        assert prior_trial.status == SubscriptionStatus.canceled
        assert new_trial.status == SubscriptionStatus.trialing

    async def test_non_paid_sub_does_not_supersede(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        customer = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )

        # Some other active sub that must NOT be touched.
        other_product = await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )
        other = await create_subscription(
            save_fixture,
            product=other_product,
            customer=customer,
            status=SubscriptionStatus.active,
        )

        # A sub whose product carries a non-paid / unknown tier must not
        # supersede anything (only the three paid tiers do).
        non_paid_product = await _tier_product(
            save_fixture, platform_org=platform_org, tier="inactive", monthly_cents=0
        )
        non_paid = await create_subscription(
            save_fixture,
            product=non_paid_product,
            customer=customer,
            status=SubscriptionStatus.active,
        )

        await maybe_supersede_platform_trial(session, non_paid)

        await session.refresh(other)
        assert other.status == SubscriptionStatus.active

    async def test_non_platform_subscription_is_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        # A normal creator org selling to its own customer — NOT the
        # platform org. Supersession must never touch these.
        seller = await create_organization(save_fixture)
        customer = await create_customer(save_fixture, organization=seller)
        product = await create_product(
            save_fixture,
            organization=seller,
            recurring_interval=SubscriptionRecurringInterval.month,
            prices=[(1000, "usd")],
        )
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


@pytest.mark.asyncio
class TestMaybeMarkPlatformTrialConsumed:
    async def test_trialing_sub_stamps_consumed(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        customer = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )
        assert "trial_consumed_at" not in (customer.user_metadata or {})

        product = await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )
        trial = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_end=utc_now() + timedelta(days=14),
        )

        await maybe_mark_platform_trial_consumed(session, trial)

        await session.refresh(customer)
        assert customer.user_metadata.get("trial_consumed_at") is not None

    async def test_active_sub_does_not_stamp(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        customer = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )
        product = await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )
        active = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.active,
        )

        await maybe_mark_platform_trial_consumed(session, active)

        await session.refresh(customer)
        assert "trial_consumed_at" not in (customer.user_metadata or {})


@pytest.mark.asyncio
class TestCreateCheckout:
    """Exercise the upgrade decision logic with checkout creation mocked."""

    def _mock_checkout_create(self, mocker: MockerFixture) -> AsyncMock:
        fake_checkout = type(
            "FakeCheckout",
            (),
            {
                "id": uuid4(),
                "url": "https://checkout.test/x",
                "client_secret": "CS",
            },
        )()
        return mocker.patch(
            "polar.platform.upgrade.checkout_service.create",
            new=AsyncMock(return_value=fake_checkout),
        )

    async def test_active_trial_is_not_revoked_and_carries_remaining_days(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        customer = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )
        starter = await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )
        trial = await create_subscription(
            save_fixture,
            product=starter,
            customer=customer,
            status=SubscriptionStatus.trialing,
            trial_end=utc_now() + timedelta(days=9, hours=1),
            user_metadata={"managed_by": "trial"},
        )
        await _tier_product(
            save_fixture,
            platform_org=platform_org,
            tier="studio",
            monthly_cents=12900,
        )

        create_mock = self._mock_checkout_create(mocker)

        await platform_upgrade.create_checkout(
            session,
            organization=creator,
            tier=TierKey.studio,
            billing_interval="month",
            success_url="https://app.test/done",
            billing_email="creator@real.test",
        )

        # The trial is still active — NOT pre-revoked.
        await session.refresh(trial)
        assert trial.status == SubscriptionStatus.trialing

        # The checkout carried the remaining ~9 days, not a fresh 14, and no
        # convert-from-free subscription_id (the trial is billable).
        checkout_create = create_mock.call_args.args[1]
        assert checkout_create.trial_interval == TrialInterval.day
        assert checkout_create.trial_interval_count == 10  # ceil(9d1h)
        assert checkout_create.subscription_id is None

    async def test_first_time_creator_gets_trial(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # A first-time creator (customer exists, never trialed, no active
        # sub) picking a plan gets the card-required 14-day trial: the
        # checkout uses the product's trial config (no allow_trial=False, no
        # interval override) so it captures the card and starts the trial.
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )
        await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )

        create_mock = self._mock_checkout_create(mocker)

        await platform_upgrade.create_checkout(
            session,
            organization=creator,
            tier=TierKey.starter,
            billing_interval="month",
        )

        checkout_create = create_mock.call_args.args[1]
        # Product's trial applies: allow_trial defaults True, no override.
        assert checkout_create.allow_trial is True
        assert checkout_create.trial_interval is None
        assert checkout_create.subscription_id is None

    async def test_churned_creator_bills_immediately(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # A creator who already used their trial (trial_consumed_at stamped)
        # and has no active sub re-subscribes with NO trial — bills
        # immediately. Closes the cancel-then-re-subscribe-for-a-fresh-trial
        # abuse loop.
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        customer = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )
        customer.user_metadata = {
            **(customer.user_metadata or {}),
            "trial_consumed_at": utc_now().isoformat(),
        }
        await save_fixture(customer)
        await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )

        create_mock = self._mock_checkout_create(mocker)

        await platform_upgrade.create_checkout(
            session,
            organization=creator,
            tier=TierKey.starter,
            billing_interval="month",
        )

        checkout_create = create_mock.call_args.args[1]
        assert checkout_create.allow_trial is False
        assert checkout_create.subscription_id is None

    async def test_active_paid_tier_rejects_upgrade_checkout(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        customer = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )
        starter = await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )
        await create_subscription(
            save_fixture,
            product=starter,
            customer=customer,
            status=SubscriptionStatus.active,
        )
        await _tier_product(
            save_fixture,
            platform_org=platform_org,
            tier="studio",
            monthly_cents=12900,
        )
        self._mock_checkout_create(mocker)

        with pytest.raises(AlreadyOnPaidTier):
            await platform_upgrade.create_checkout(
                session,
                organization=creator,
                tier=TierKey.studio,
                billing_interval="month",
            )

    async def test_real_billing_email_written_to_customer(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        customer = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=creator
        )
        synthetic = customer.email
        await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )
        self._mock_checkout_create(mocker)

        assert synthetic.endswith("@billing.spairehq.internal")

        await platform_upgrade.create_checkout(
            session,
            organization=creator,
            tier=TierKey.starter,
            billing_interval="month",
            billing_email="real-creator@gmail.com",
        )

        await session.refresh(customer)
        assert customer.email == "real-creator@gmail.com"

    async def test_collision_falls_back_to_plus_addressed_email(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # One person owns two orgs and uses the same real email for both.
        # The platform customers table is unique on (org, lower(email)), so
        # only the first org can hold the email verbatim — the second must
        # still end up with a DELIVERABLE address, not the dead placeholder.
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        await _tier_product(
            save_fixture, platform_org=platform_org, tier="starter"
        )
        self._mock_checkout_create(mocker)
        real_email = "niki@gmail.com"

        # Org A converts first and adopts the real email verbatim.
        org_a = await create_organization(save_fixture)
        customer_a = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=org_a
        )
        await platform_upgrade.create_checkout(
            session,
            organization=org_a,
            tier=TierKey.starter,
            billing_interval="month",
            billing_email=real_email,
        )
        await session.refresh(customer_a)
        assert customer_a.email == real_email

        # Org B (same person, same email) collides. It must NOT keep the
        # @billing.spairehq.internal placeholder — it adopts a plus-addressed
        # variant that routes to the same inbox and stays unique.
        org_b = await create_organization(save_fixture)
        customer_b = await _platform_customer(
            save_fixture, platform_org=platform_org, creator=org_b
        )
        await platform_upgrade.create_checkout(
            session,
            organization=org_b,
            tier=TierKey.starter,
            billing_interval="month",
            billing_email=real_email,
        )
        await session.refresh(customer_b)
        expected = _plus_tagged_email(real_email, org_b.slug)
        assert customer_b.email == expected
        assert customer_b.email != real_email
        assert "@billing.spairehq.internal" not in customer_b.email
        # Same real mailbox: base local part + real domain.
        assert customer_b.email.split("+", 1)[0] == "niki"
        assert customer_b.email.endswith("@gmail.com")
