from datetime import UTC, datetime
from uuid import UUID

import pytest
from pytest_mock import MockerFixture

from polar.entitlements.tiers import TierKey
from polar.enums import RateLimitGroup, SubscriptionRecurringInterval
from polar.models import Account, Organization, Product, User
from polar.models.subscription import SubscriptionStatus
from polar.platform.fee_sync import (
    maybe_enqueue_sync_from_subscription,
    platform_fee_sync,
)
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    PriceFixtureType,
    create_account,
    create_customer,
    create_organization,
    create_product,
    create_subscription,
    create_user,
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


async def _setup_subscribed_creator(
    *,
    mocker: MockerFixture,
    save_fixture: SaveFixture,
    tier: TierKey,
    monthly_cents: int,
    fee_basis_points: int | None = None,
    fee_fixed: int | None = None,
    platform_fee_locked: bool = False,
) -> tuple[Organization, Account, User]:
    """Build a complete creator-org-with-active-Spaire-subscription scenario."""
    platform_org = await create_organization(save_fixture)
    _patch_platform_org_id(mocker, platform_org.id)

    creator_owner = await create_user(save_fixture)
    creator = await create_organization(save_fixture)
    account = await create_account(
        save_fixture,
        creator,
        creator_owner,
        fee_basis_points=fee_basis_points,
        fee_fixed=fee_fixed,
    )
    if platform_fee_locked:
        account.platform_fee_locked_at = datetime.now(UTC)
        await save_fixture(account)

    product = await _seed_tier_product(
        save_fixture,
        platform_org=platform_org,
        tier=tier.value,
        monthly_cents=monthly_cents,
    )
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
        status=SubscriptionStatus.active,
    )

    return creator, account, creator_owner


@pytest.mark.asyncio
class TestSyncForOrganization:
    async def test_no_account_is_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)

        result = await platform_fee_sync.sync_for_organization(session, creator)

        assert result.changed is False
        assert result.reason == "no_account"

    async def test_locked_account_is_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator, account, _ = await _setup_subscribed_creator(
            mocker=mocker,
            save_fixture=save_fixture,
            tier=TierKey.starter,
            monthly_cents=4900,
            platform_fee_locked=True,
        )
        # Pre-align the rate-limit group so the lock branch is what the
        # result reflects (the group syncs regardless of the fee lock).
        creator.rate_limit_group = RateLimitGroup.elevated
        await save_fixture(creator)

        result = await platform_fee_sync.sync_for_organization(session, creator)

        assert result.changed is False
        assert result.reason == "locked"
        # Pre-existing fee (None — global default) stays untouched.
        assert account._platform_fee_percent is None
        assert account._platform_fee_fixed is None

    async def test_force_overrides_lock(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator, account, _ = await _setup_subscribed_creator(
            mocker=mocker,
            save_fixture=save_fixture,
            tier=TierKey.starter,
            monthly_cents=4900,
            platform_fee_locked=True,
        )

        result = await platform_fee_sync.sync_for_organization(
            session, creator, force=True
        )

        assert result.changed is True
        assert account._platform_fee_percent == 700
        assert account._platform_fee_fixed == 30

    async def test_fee_follows_tier_metadata_not_price(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # A $0-priced product stamped tier=pro still syncs the Pro list
        # rate — the fee comes from the tier definition, not the price.
        creator, account, _ = await _setup_subscribed_creator(
            mocker=mocker,
            save_fixture=save_fixture,
            tier=TierKey.starter,
            monthly_cents=0,
        )

        result = await platform_fee_sync.sync_for_organization(session, creator)

        assert result.changed is True
        assert result.reason == "updated"
        assert account._platform_fee_percent == 700
        assert account._platform_fee_fixed == 30

    async def test_writes_tier_rate_for_pro(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator, account, _ = await _setup_subscribed_creator(
            mocker=mocker,
            save_fixture=save_fixture,
            tier=TierKey.starter,
            monthly_cents=4900,
        )

        result = await platform_fee_sync.sync_for_organization(session, creator)

        assert result.changed is True
        assert account._platform_fee_percent == 700
        assert account._platform_fee_fixed == 30

    async def test_writes_tier_rate_for_scale(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator, account, _ = await _setup_subscribed_creator(
            mocker=mocker,
            save_fixture=save_fixture,
            tier=TierKey.scale,
            monthly_cents=29900,
        )

        result = await platform_fee_sync.sync_for_organization(session, creator)

        assert result.changed is True
        assert account._platform_fee_percent == 300
        assert account._platform_fee_fixed == 30

    async def test_idempotent_when_already_in_sync(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator, account, _ = await _setup_subscribed_creator(
            mocker=mocker,
            save_fixture=save_fixture,
            tier=TierKey.starter,
            monthly_cents=4900,
            fee_basis_points=700,
            fee_fixed=30,
        )
        creator.rate_limit_group = RateLimitGroup.elevated
        await save_fixture(creator)

        result = await platform_fee_sync.sync_for_organization(session, creator)

        assert result.changed is False
        assert result.reason == "up_to_date"
        assert account._platform_fee_percent == 700
        assert account._platform_fee_fixed == 30

    async def test_non_paid_tier_resets_fee_to_default(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # A non-paid tier (here `unmanaged` via no platform org) resets the
        # Account fee columns to NULL. This is the churn path: an org that
        # held a paid tier and now has no plan must not keep the lower rate
        # written onto its account; the global default (worst) rate applies.
        _patch_platform_org_id(mocker, None)
        creator_owner = await create_user(save_fixture)
        creator = await create_organization(save_fixture)
        account = await create_account(
            save_fixture,
            creator,
            creator_owner,
            fee_basis_points=300,
            fee_fixed=30,
        )

        result = await platform_fee_sync.sync_for_organization(session, creator)

        assert result.changed is True
        assert result.reason == "reset_to_default"
        # Fee reset to NULL -> Account.platform_fee falls back to the global
        # default (5% + 50c).
        assert account._platform_fee_percent is None
        assert account._platform_fee_fixed is None
        assert account.platform_fee == (500, 50)

    async def test_non_paid_tier_already_default_is_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # An account that never had a per-account rate written is already on
        # the global default; the non-paid-tier sync leaves it untouched.
        _patch_platform_org_id(mocker, None)
        creator_owner = await create_user(save_fixture)
        creator = await create_organization(save_fixture)
        account = await create_account(
            save_fixture,
            creator,
            creator_owner,
            fee_basis_points=None,
            fee_fixed=None,
        )

        result = await platform_fee_sync.sync_for_organization(session, creator)

        assert result.changed is False
        assert result.reason == "non_paid_tier"
        assert account._platform_fee_percent is None
        assert account._platform_fee_fixed is None


@pytest.mark.asyncio
class TestSyncByOrganizationId:
    async def test_missing_organization_is_noop(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        from uuid import uuid4

        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        result = await platform_fee_sync.sync_by_organization_id(
            session, uuid4()
        )

        assert result.changed is False
        assert result.reason == "org_missing"


@pytest.mark.asyncio
class TestMaybeEnqueueFromSubscription:
    async def test_enqueues_for_platform_org_subscription(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        enqueue = mocker.patch("polar.platform.fee_sync.enqueue_sync")
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        product = await _seed_tier_product(
            save_fixture,
            platform_org=platform_org,
            tier=TierKey.starter.value,
            monthly_cents=4900,
        )
        customer = await create_customer(
            save_fixture,
            organization=platform_org,
            email=f"creator-{creator.id}@billing.spaire",
            user_metadata={"creator_org_id": str(creator.id)},
        )
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.active,
        )

        await maybe_enqueue_sync_from_subscription(session, subscription)

        enqueue.assert_called_once_with(creator.id)

    async def test_skips_non_platform_org_subscription(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        enqueue = mocker.patch("polar.platform.fee_sync.enqueue_sync")
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        # Subscription on a *creator* org (not the platform org). Normal
        # B2C subscription — should not trigger tier sync.
        creator = await create_organization(save_fixture)
        end_customer = await create_customer(
            save_fixture,
            organization=creator,
            email="buyer@example.com",
        )
        product = await create_product(
            save_fixture,
            organization=creator,
            recurring_interval=SubscriptionRecurringInterval.month,
            prices=[(1000, "usd")],
        )
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=end_customer,
            status=SubscriptionStatus.active,
        )

        await maybe_enqueue_sync_from_subscription(session, subscription)

        enqueue.assert_not_called()

    async def test_skips_when_platform_not_configured(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        enqueue = mocker.patch("polar.platform.fee_sync.enqueue_sync")
        _patch_platform_org_id(mocker, None)
        any_org = await create_organization(save_fixture)
        end_customer = await create_customer(
            save_fixture, organization=any_org, email="buyer@example.com"
        )
        product = await create_product(
            save_fixture,
            organization=any_org,
            recurring_interval=SubscriptionRecurringInterval.month,
            prices=[(1000, "usd")],
        )
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=end_customer,
            status=SubscriptionStatus.active,
        )

        await maybe_enqueue_sync_from_subscription(session, subscription)

        enqueue.assert_not_called()

    async def test_skips_when_creator_org_id_missing_from_metadata(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        enqueue = mocker.patch("polar.platform.fee_sync.enqueue_sync")
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        product = await _seed_tier_product(
            save_fixture,
            platform_org=platform_org,
            tier=TierKey.starter.value,
            monthly_cents=4900,
        )
        # Customer on platform org but missing the creator_org_id metadata.
        customer = await create_customer(
            save_fixture,
            organization=platform_org,
            email="orphan@billing.spaire",
            user_metadata={},
        )
        subscription = await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.active,
        )

        await maybe_enqueue_sync_from_subscription(session, subscription)

        enqueue.assert_not_called()
