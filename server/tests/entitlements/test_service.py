from uuid import UUID, uuid4

import pytest
from pytest_mock import MockerFixture

from polar.entitlements.service import entitlements
from polar.entitlements.tiers import TierKey
from polar.enums import SubscriptionRecurringInterval
from polar.models import Organization, Product
from polar.models.subscription import SubscriptionStatus
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
class TestGetTier:
    async def test_no_platform_org_configured_returns_unmanaged(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        _patch_platform_org_id(mocker, None)
        creator = await create_organization(save_fixture)

        tier = await entitlements.get_tier(session, creator.id)

        assert tier == TierKey.unmanaged

    async def test_platform_org_itself_returns_unmanaged(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        tier = await entitlements.get_tier(session, platform_org.id)

        assert tier == TierKey.unmanaged

    async def test_no_platform_customer_returns_inactive(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        tier = await entitlements.get_tier(session, creator.id)

        assert tier == TierKey.inactive

    async def test_no_active_subscription_returns_inactive(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        product = await _seed_tier_product(
            save_fixture, platform_org=platform_org, tier="starter", monthly_cents=4900
        )
        customer = await create_customer(
            save_fixture,
            organization=platform_org,
            email=f"creator-{creator.id}@billing.spaire",
            user_metadata={"creator_org_id": str(creator.id)},
        )
        # Subscription exists but is canceled.
        await create_subscription(
            save_fixture,
            product=product,
            customer=customer,
            status=SubscriptionStatus.canceled,
        )

        tier = await entitlements.get_tier(session, creator.id)

        assert tier == TierKey.inactive

    @pytest.mark.parametrize(
        "tier_label,expected,monthly_cents",
        [
            ("pro", TierKey.starter, 4900),
            ("studio", TierKey.studio, 12900),
            ("scale", TierKey.scale, 29900),
        ],
    )
    async def test_active_subscription_returns_product_tier(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        tier_label: str,
        expected: TierKey,
        monthly_cents: int,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        product = await _seed_tier_product(
            save_fixture,
            platform_org=platform_org,
            tier=tier_label,
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

        tier = await entitlements.get_tier(session, creator.id)

        assert tier == expected

    async def test_trialing_subscription_returns_product_tier(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        product = await _seed_tier_product(
            save_fixture, platform_org=platform_org, tier="starter", monthly_cents=4900
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
            status=SubscriptionStatus.trialing,
        )

        tier = await entitlements.get_tier(session, creator.id)

        assert tier == TierKey.starter

    async def test_past_due_subscription_keeps_tier(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # While a Spaire charge is being retried (dunning window), the
        # subscription is past_due but the creator KEEPS their tier — they
        # only drop to `inactive` once it's fully canceled.
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        product = await _seed_tier_product(
            save_fixture, platform_org=platform_org, tier="studio", monthly_cents=12900
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
            status=SubscriptionStatus.past_due,
        )

        tier = await entitlements.get_tier(session, creator.id)

        assert tier == TierKey.studio

    async def test_unrecognized_tier_metadata_returns_inactive(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        product = await _seed_tier_product(
            save_fixture,
            platform_org=platform_org,
            tier="enterprise_xxl",
            monthly_cents=99900,
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

        tier = await entitlements.get_tier(session, creator.id)

        assert tier == TierKey.inactive

    async def test_missing_org_with_platform_configured_returns_inactive(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        tier = await entitlements.get_tier(session, uuid4())

        assert tier == TierKey.inactive


@pytest.mark.asyncio
class TestGetForOrganization:
    async def test_returns_tier_definition(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        creator = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)

        product = await _seed_tier_product(
            save_fixture, platform_org=platform_org, tier="starter", monthly_cents=4900
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

        result = await entitlements.get_for_organization(session, creator.id)

        assert result.tier == TierKey.starter
        assert result.transaction_fee.percent_basis_points == 700
        assert result.transaction_fee.fixed_cents == 30
        assert result.monthly_price_cents == 4900
        assert result.features.email_sequences_and_segments is True
        assert result.features.white_label_course_player is False
        assert result.features.customer_wallet is False
        assert result.limits.published_courses == 5
        # Email is metered on list size only — sends and active sequences
        # are uncapped on every tier.
        assert result.limits.active_email_sequences is None
        assert result.limits.email_sends_monthly is None
        assert result.limits.email_subscribers == 10_000

    async def test_unmanaged_has_unlimited_limits(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Platform billing not configured -> unmanaged (unlimited).
        _patch_platform_org_id(mocker, None)
        creator = await create_organization(save_fixture)

        result = await entitlements.get_for_organization(session, creator.id)

        assert result.tier == TierKey.unmanaged
        assert result.limits.published_courses is None
        assert result.limits.email_sends_monthly is None
        assert result.features.custom_email_sender_domain is True


class TestTierDefinitions:
    """Smoke-test the static tier definitions to guard the pricing-page contract."""

    def test_studio_shape(self) -> None:
        from polar.entitlements.tiers import get_definition

        studio = get_definition(TierKey.studio)
        assert studio.monthly_price_cents == 12900
        assert studio.transaction_fee.percent_basis_points == 500
        assert studio.transaction_fee.fixed_cents == 30
        assert studio.limits.published_courses == 25
        assert studio.limits.active_email_sequences is None
        assert studio.limits.video_hours_hosted == 50
        assert studio.limits.email_subscribers == 50_000
        assert studio.limits.email_sends_monthly is None
        assert studio.limits.dashboard_team_seats == 5
        assert studio.features.white_label_course_player is True
        assert studio.features.customer_wallet is True
        assert studio.features.custom_pricing_negotiation is False

    def test_starter_shape(self) -> None:
        from polar.entitlements.tiers import get_definition

        starter = get_definition(TierKey.starter)
        assert starter.monthly_price_cents == 4900
        assert starter.transaction_fee.percent_basis_points == 700
        assert starter.transaction_fee.fixed_cents == 30
        assert starter.limits.published_courses == 5
        assert starter.limits.active_email_sequences is None
        assert starter.limits.video_hours_hosted == 25
        assert starter.limits.email_subscribers == 10_000
        assert starter.limits.email_sends_monthly is None
        assert starter.features.email_sequences_and_segments is True
        # email_ab_testing was pulled up to Studio+ so Starter doesn't have it.
        assert starter.features.email_ab_testing is False
        assert starter.features.customer_wallet is False
        assert starter.rate_limit_group == "elevated"

    def test_unmanaged_is_unlimited(self) -> None:
        from polar.entitlements.tiers import get_definition

        # unmanaged is the dev / self-host / platform-org fallback: unlimited.
        unmanaged = get_definition(TierKey.unmanaged)
        assert unmanaged.monthly_price_cents == 0
        assert unmanaged.limits.published_courses is None
        assert unmanaged.features.audit_logs is True

    def test_inactive_is_restrictive(self) -> None:
        from polar.entitlements.tiers import get_definition

        # inactive is a real creator with no plan: everything gated off, so
        # there is no free unlimited fallback.
        inactive = get_definition(TierKey.inactive)
        assert inactive.monthly_price_cents == 0
        assert inactive.limits.published_courses == 0
        assert inactive.limits.email_sends_monthly == 0
        assert inactive.features.audit_logs is False
        assert inactive.features.email_sequences_and_segments is False

    def test_scale_shape(self) -> None:
        from polar.entitlements.tiers import get_definition

        scale = get_definition(TierKey.scale)
        assert scale.monthly_price_cents == 29900
        assert scale.transaction_fee.percent_basis_points == 300
        assert scale.transaction_fee.fixed_cents == 30
        # Scale caps video at 200 hours; only Legacy is fully unlimited.
        assert scale.limits.video_hours_hosted == 200
        assert scale.limits.dashboard_team_seats == 20
        # Email is metered on list size only; sends and sequences are
        # uncapped, and the published contact ceiling is set high (150k)
        # so a Scale plan can hold a whale before custom pricing kicks in.
        assert scale.limits.active_email_sequences is None
        assert scale.limits.email_sends_monthly is None
        assert scale.limits.email_subscribers == 150_000
        assert scale.features.custom_pricing_negotiation is True
        assert scale.features.customer_wallet is True
        assert scale.features.white_label_course_player is True
        assert scale.features.audit_logs is True
