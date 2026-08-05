import dataclasses
from uuid import UUID

import pytest
from pytest_mock import MockerFixture

from polar.entitlements.exceptions import (
    FeatureNotInPlanError,
    TierLimitReachedError,
)
from polar.entitlements.service import entitlements
from polar.entitlements.tiers import TierKey, get_definition
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


def _patch_starter_limits(mocker: MockerFixture, **limit_overrides: int | None) -> None:
    """Override Pro's TierLimits so the limit-reached tests can assert
    against small values (Pro's real limits — unlimited courses /
    lessons, 250k email sends — make the original Free-shaped tests
    meaningless without an override)."""
    base = get_definition(TierKey.starter)
    overridden = dataclasses.replace(
        base, limits=dataclasses.replace(base.limits, **limit_overrides)
    )

    def _resolve(tier: TierKey) -> "object":
        if tier == TierKey.starter:
            return overridden
        return get_definition(tier)

    mocker.patch(
        "polar.entitlements.service.get_definition", side_effect=_resolve
    )


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


async def _subscribe(
    save_fixture: SaveFixture,
    *,
    platform_org: Organization,
    creator: Organization,
    tier: str,
    monthly_cents: int,
) -> None:
    product = await _seed_tier_product(
        save_fixture,
        platform_org=platform_org,
        tier=tier,
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


@pytest.mark.asyncio
class TestRequireFeature:
    async def test_raises_when_feature_disabled(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        # Email A/B testing is gated on Studio+ — Pro should be blocked.
        with pytest.raises(FeatureNotInPlanError) as excinfo:
            await entitlements.require_feature(
                session, creator.id, "email_ab_testing"
            )
        assert excinfo.value.feature == "email_ab_testing"
        assert excinfo.value.tier == TierKey.starter
        assert excinfo.value.status_code == 402

    async def test_passes_when_feature_enabled(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=4900,
        )

        # No raise.
        await entitlements.require_feature(
            session, creator.id, "email_sequences_and_segments"
        )

    async def test_scale_tier_unlocks_everything(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="scale",
            monthly_cents=29900,
        )

        for feature in (
            "customer_wallet",
            "white_label_course_player",
            "sandbox_mode",
            "drip_scheduling",
            "email_ab_testing",
            "seat_based_product_pricing",
        ):
            await entitlements.require_feature(session, creator.id, feature)

    async def test_unknown_feature_raises_value_error(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        with pytest.raises(ValueError):
            await entitlements.require_feature(
                session, creator.id, "telepathic_marketing"
            )

    async def test_legacy_tier_allows_all_features(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Pre-platform-org orgs default to legacy, which unlocks everything
        # for backwards compatibility.
        _patch_platform_org_id(mocker, None)
        creator = await create_organization(save_fixture)

        await entitlements.require_feature(
            session, creator.id, "customer_wallet"
        )


@pytest.mark.asyncio
class TestRequireUnderLimit:
    async def test_raises_when_at_limit(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        # Patch Pro down to 1 published course so the "at-cap" branch
        # can be exercised. Pro's real limit is unlimited.
        _patch_starter_limits(mocker, published_courses=1)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        with pytest.raises(TierLimitReachedError) as excinfo:
            await entitlements.require_under_limit(
                session, creator.id, "published_courses", current=1
            )
        assert excinfo.value.key == "published_courses"
        assert excinfo.value.limit == 1
        assert excinfo.value.tier == TierKey.starter
        assert excinfo.value.status_code == 402

    async def test_raises_when_above_limit(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Pre-PR backfills can leave orgs over the limit. Future creates
        # should still be blocked.
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        _patch_starter_limits(mocker, lessons_per_course=10)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        with pytest.raises(TierLimitReachedError):
            await entitlements.require_under_limit(
                session, creator.id, "lessons_per_course", current=42
            )

    async def test_passes_when_under_limit(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        _patch_starter_limits(mocker, lessons_per_course=10)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        # 10 lessons per course (patched). At 9 -> next one fits.
        await entitlements.require_under_limit(
            session, creator.id, "lessons_per_course", current=9
        )

    async def test_unlimited_tier_passes(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="scale",
            monthly_cents=29900,
        )

        # Scale: unlimited lessons per course (None). require_under_limit
        # returns silently when the limit is None — that's the path
        # under test.
        await entitlements.require_under_limit(
            session, creator.id, "lessons_per_course", current=10_000
        )

    async def test_unknown_limit_raises_value_error(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        with pytest.raises(ValueError):
            await entitlements.require_under_limit(
                session, creator.id, "horses_per_acre", current=2
            )
