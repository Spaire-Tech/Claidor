import dataclasses
from datetime import UTC, datetime
from uuid import UUID

import pytest
from pytest_mock import MockerFixture

from polar.entitlements.tiers import TierKey, get_definition
from polar.enums import SubscriptionRecurringInterval
from polar.models import Organization, Product
from polar.models.event import EventSource
from polar.models.subscription import SubscriptionStatus
from polar.postgres import AsyncSession
from polar.quotas.definitions import QuotaKey
from polar.quotas.service import quotas
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    PriceFixtureType,
    create_customer,
    create_event,
    create_organization,
    create_product,
    create_subscription,
)


def _patch_platform_org_id(mocker: MockerFixture, org_id: UUID | None) -> None:
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", org_id)


def _patch_starter_limits(mocker: MockerFixture, **limit_overrides: int | None) -> None:
    """Override Pro's TierLimits with small testable values so the
    "fill near cap, then check" tests don't have to fixture 250k events.

    Pro's real limits (250k email sends, 50 video hours, 25 GB storage)
    make per-event-fixture loops too slow to be practical. The tests
    care about *behavior at the cap*, not the cap value itself, so
    patching the limit to a small number preserves coverage while
    keeping tests fast.
    """
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


async def _subscribe_to_tier(
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
class TestGetUsage:
    async def test_count_aggregation_for_video_views(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        _patch_starter_limits(mocker, video_views_monthly=5000)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        for _ in range(7):
            await create_event(
                save_fixture,
                organization=creator,
                source=EventSource.system,
                name="spaire.video.viewed",
            )

        usage = await quotas.get_usage(
            session, creator.id, QuotaKey.video_views_monthly
        )

        assert usage.used == 7
        assert usage.limit == 5000
        assert usage.remaining == 4993
        assert usage.is_unlimited is False
        assert usage.is_exceeded is False

    async def test_sum_aggregation_for_video_hours(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        _patch_starter_limits(mocker, video_hours_hosted=5)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        # Two videos: 1800s (30 min) and 5400s (90 min) = 7200s = 2 hours
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.video.uploaded",
            metadata={"duration_seconds": 1800},
        )
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.video.uploaded",
            metadata={"duration_seconds": 5400},
        )

        usage = await quotas.get_usage(
            session, creator.id, QuotaKey.video_hours_hosted
        )

        assert usage.used == 2  # 7200 seconds / 3600 = 2 hours
        assert usage.limit == 5
        assert usage.remaining == 3

    async def test_storage_bytes_sums_positive_and_negative(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=4900,
        )

        gb = 1024 * 1024 * 1024
        # Upload 3 files (15 GB total), delete one (5 GB)
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.storage.bytes",
            metadata={"bytes_delta": 5 * gb},
        )
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.storage.bytes",
            metadata={"bytes_delta": 5 * gb},
        )
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.storage.bytes",
            metadata={"bytes_delta": 5 * gb},
        )
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.storage.bytes",
            metadata={"bytes_delta": -5 * gb},
        )

        usage = await quotas.get_usage(
            session, creator.id, QuotaKey.storage_gb
        )

        assert usage.used == 10  # 15 GB - 5 GB
        assert usage.limit == 5  # pro tier
        assert usage.remaining == 0  # over the cap; floored at zero
        assert usage.is_exceeded is True

    async def test_user_source_events_are_ignored(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        # User-submitted events with the same name should NOT inflate quota
        # usage. Otherwise a creator could fake usage via the events API.
        for _ in range(50):
            await create_event(
                save_fixture,
                organization=creator,
                source=EventSource.user,
                name="spaire.video.viewed",
            )

        usage = await quotas.get_usage(
            session, creator.id, QuotaKey.video_views_monthly
        )

        assert usage.used == 0

    async def test_monthly_scope_ignores_previous_month_events(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        # 60 days ago — should be excluded
        old = datetime.now(UTC).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        ).replace(month=max(datetime.now(UTC).month - 2, 1))
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.video.viewed",
            timestamp=old,
        )
        # Today — should count
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.video.viewed",
        )

        usage = await quotas.get_usage(
            session, creator.id, QuotaKey.video_views_monthly
        )

        assert usage.used == 1

    async def test_lifetime_scope_counts_old_events(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        old = datetime.now(UTC).replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        ).replace(month=max(datetime.now(UTC).month - 6, 1))
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.video.uploaded",
            metadata={"duration_seconds": 3600},
            timestamp=old,
        )
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.video.uploaded",
            metadata={"duration_seconds": 3600},
        )

        usage = await quotas.get_usage(
            session, creator.id, QuotaKey.video_hours_hosted
        )

        # Both events count toward lifetime quota.
        assert usage.used == 2

    async def test_scale_tier_video_hours_capped(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="scale",
            monthly_cents=29900,
        )

        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.video.uploaded",
            metadata={"duration_seconds": 100 * 3600},
        )

        usage = await quotas.get_usage(
            session, creator.id, QuotaKey.video_hours_hosted
        )

        assert usage.limit == 200  # scale tier
        assert usage.remaining == 100
        assert usage.is_unlimited is False
        assert usage.is_exceeded is False
        assert usage.used == 100


@pytest.mark.asyncio
class TestCheck:
    async def test_allows_when_under_limit(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        _patch_starter_limits(mocker, video_views_monthly=5000)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )

        result = await quotas.check(
            session,
            creator.id,
            QuotaKey.video_views_monthly,
            requested_storage_units=100,
        )

        assert result.allowed is True
        assert result.reason == "ok"
        assert result.limit == 5000
        assert result.used == 0
        assert result.remaining == 5000

    async def test_blocks_when_requested_would_exceed(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        _patch_starter_limits(mocker, video_views_monthly=5000)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )
        for _ in range(4999):
            await create_event(
                save_fixture,
                organization=creator,
                source=EventSource.system,
                name="spaire.video.viewed",
            )

        # Pro carries a 10% overage grace (ceiling 5500): the request has
        # to push past the grace ceiling, not just the limit, to block.
        result = await quotas.check(
            session,
            creator.id,
            QuotaKey.video_views_monthly,
            requested_storage_units=600,
        )

        assert result.allowed is False
        assert result.reason == "exceeded"
        assert result.used == 4999
        assert result.limit == 5000

    async def test_allows_unlimited_tier(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Every paid tier caps video views. The only unlimited path is
        # `unmanaged` — platform billing not configured (dev / self-host).
        _patch_platform_org_id(mocker, None)
        creator = await create_organization(save_fixture)

        result = await quotas.check(
            session,
            creator.id,
            QuotaKey.video_views_monthly,
            requested_storage_units=1_000_000,
        )

        assert result.allowed is True
        assert result.reason == "unlimited"
        assert result.limit is None

    async def test_unmanaged_tier_is_unlimited(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # No platform org configured -> unmanaged tier (unlimited).
        _patch_platform_org_id(mocker, None)
        creator = await create_organization(save_fixture)

        result = await quotas.check(
            session,
            creator.id,
            QuotaKey.storage_gb,
            requested_storage_units=999 * 1024 * 1024 * 1024,
        )

        assert result.allowed is True
        assert result.reason == "unlimited"
        assert result.limit is None

    async def test_pro_allows_overage_within_grace(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """Pro tier has a 10% overage grace: a request that pushes usage
        just above the limit is allowed and surfaces overage details."""
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        # Patch the Pro cap down to 10 so we can fill it without fixturing
        # 250k events. The 10% grace logic (overage_grace_pct=10 on Pro)
        # is what's actually under test.
        _patch_starter_limits(mocker, video_views_monthly=10)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=4900,
        )
        for _ in range(10):
            await create_event(
                save_fixture,
                organization=creator,
                source=EventSource.system,
                name="spaire.video.viewed",
            )

        result = await quotas.check(
            session,
            creator.id,
            QuotaKey.video_views_monthly,
            requested_storage_units=1,
        )

        assert result.allowed is True
        assert result.reason == "overage"
        assert result.overage_storage_units == 1
        assert result.is_overage is True

    async def test_pro_blocks_past_grace(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """Pro tier still hard-blocks once usage crosses the 10% grace
        ceiling (limit * 1.10)."""
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        # Cap=10, grace=10% -> ceiling=11. Pre-fill 11 events; the next
        # one is hard-blocked.
        _patch_starter_limits(mocker, video_views_monthly=10)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=4900,
        )
        for _ in range(11):
            await create_event(
                save_fixture,
                organization=creator,
                source=EventSource.system,
                name="spaire.video.viewed",
            )

        result = await quotas.check(
            session,
            creator.id,
            QuotaKey.video_views_monthly,
            requested_storage_units=1,
        )

        assert result.allowed is False
        assert result.reason == "exceeded"
        assert result.overage_storage_units > 0

    async def test_zero_grace_hard_blocks_at_cap(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """The "no grace band, hard-block at the cap" semantics, exercised
        by patching Starter down to a tiny cap with overage_grace_pct=0."""
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        # Fake a 0% grace on Pro by patching the entitlement field.
        base = get_definition(TierKey.starter)
        no_grace = dataclasses.replace(
            base,
            limits=dataclasses.replace(base.limits, video_views_monthly=10),
            overage_grace_pct=0,
        )
        mocker.patch(
            "polar.entitlements.service.get_definition",
            side_effect=lambda t: no_grace if t == TierKey.starter else get_definition(t),
        )
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )
        for _ in range(10):
            await create_event(
                save_fixture,
                organization=creator,
                source=EventSource.system,
                name="spaire.video.viewed",
            )

        result = await quotas.check(
            session,
            creator.id,
            QuotaKey.video_views_monthly,
            requested_storage_units=1,
        )

        assert result.allowed is False
        assert result.reason == "exceeded"

    async def test_byte_precision_blocks_at_byte_level(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """Storage check works at byte precision: an org under its cap
        cannot upload a single byte that would push it over."""
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        # Patch Pro storage cap down to 1 GB so we can fill it with a
        # single event without fixturing 25 GB.
        _patch_starter_limits(mocker, storage_gb=1)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )
        gb = 1024 * 1024 * 1024
        await create_event(
            save_fixture,
            organization=creator,
            source=EventSource.system,
            name="spaire.storage.bytes",
            metadata={"bytes_delta": gb - 100},
        )

        # 200 bytes more would push past the 1 GB cap (with 10% grace
        # ceiling at ~1.1 GB). Use a request large enough to clear both
        # the cap and the grace ceiling so the test is unambiguous.
        block = await quotas.check(
            session,
            creator.id,
            QuotaKey.storage_gb,
            requested_storage_units=int(0.2 * gb),
        )
        assert block.allowed is False
        assert block.reason == "exceeded"
        # But 50 bytes still fits inside the grace band.
        allow = await quotas.check(
            session,
            creator.id,
            QuotaKey.storage_gb,
            requested_storage_units=50,
        )
        assert allow.allowed is True
