import dataclasses
from uuid import UUID

import pytest
from pytest_mock import MockerFixture
from sqlalchemy import func, select

from polar.entitlements.tiers import TierKey, get_definition
from polar.enums import SubscriptionRecurringInterval
from polar.models import Event, Organization, Product
from polar.models.event import EventSource
from polar.models.subscription import SubscriptionStatus
from polar.postgres import AsyncSession
from polar.quotas.definitions import QuotaKey
from polar.quotas.exceptions import QuotaExceededError
from polar.quotas.producers import (
    emit_storage_delta,
    emit_video_uploaded,
    emit_video_viewed,
    enforce,
)
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
    """See tests/quotas/test_service.py:_patch_starter_limits."""
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
class TestEmitStorageDelta:
    async def test_writes_system_event_with_bytes_delta(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await create_organization(save_fixture)

        emit_storage_delta(session, organization_id=creator.id, bytes_delta=1234567)
        await session.flush()

        events = (
            await session.execute(
                select(Event).where(Event.organization_id == creator.id)
            )
        ).scalars().all()
        assert len(events) == 1
        assert events[0].name == "spaire.storage.bytes"
        assert events[0].source == EventSource.system
        assert events[0].user_metadata["bytes_delta"] == 1234567

    async def test_negative_delta_recorded_for_delete(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await create_organization(save_fixture)

        emit_storage_delta(session, organization_id=creator.id, bytes_delta=-500_000)
        await session.flush()

        event = (
            await session.execute(
                select(Event).where(Event.organization_id == creator.id)
            )
        ).scalar_one()
        assert event.user_metadata["bytes_delta"] == -500_000


@pytest.mark.asyncio
class TestEmitVideoEvents:
    async def test_video_uploaded_carries_duration(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await create_organization(save_fixture)

        emit_video_uploaded(
            session, organization_id=creator.id, duration_seconds=900
        )
        await session.flush()

        event = (
            await session.execute(
                select(Event).where(
                    Event.organization_id == creator.id,
                    Event.name == "spaire.video.uploaded",
                )
            )
        ).scalar_one()
        assert event.user_metadata["duration_seconds"] == 900

    async def test_video_viewed_is_a_pure_count(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await create_organization(save_fixture)

        emit_video_viewed(session, organization_id=creator.id)
        emit_video_viewed(session, organization_id=creator.id)
        await session.flush()

        count = (
            await session.execute(
                select(func.count(Event.id)).where(
                    Event.organization_id == creator.id,
                    Event.name == "spaire.video.viewed",
                )
            )
        ).scalar_one()
        assert count == 2


@pytest.mark.asyncio
class TestEnforce:
    async def test_raises_when_quota_exceeded(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        # Patch Pro down to 5000/mo so we can fill near-cap with 4999
        # events. Pro's real limit is 250k.
        _patch_starter_limits(mocker, video_views_monthly=5000)
        creator = await create_organization(save_fixture)
        await _subscribe(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
            monthly_cents=0,
        )
        # Pro grace = 10%, ceiling = 5500. 4999 + requested=2 lands in
        # the grace band (5001), which is allowed. Bump request past
        # the ceiling so the test exercises the "exceeded" branch.
        for _ in range(4999):
            await create_event(
                save_fixture,
                organization=creator,
                source=EventSource.system,
                name="spaire.video.viewed",
            )

        with pytest.raises(QuotaExceededError) as excinfo:
            await enforce(
                session,
                creator,
                QuotaKey.video_views_monthly,
                requested_storage_units=600,
            )
        result = excinfo.value.result
        assert result.allowed is False
        assert result.limit == 5000

    async def test_returns_result_when_allowed(
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

        result = await enforce(
            session,
            creator,
            QuotaKey.storage_gb,
            requested_storage_units=5 * 1024 * 1024 * 1024,  # 5 GB
        )
        assert result.allowed is True
        assert result.reason == "ok"
        assert result.limit == 5  # pro

    async def test_unlimited_tier_allows_anything(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        # Every paid tier caps storage. The only unlimited path is
        # `unmanaged` — platform billing not configured (dev / self-host).
        _patch_platform_org_id(mocker, None)
        creator = await create_organization(save_fixture)

        result = await enforce(
            session,
            creator,
            QuotaKey.storage_gb,
            requested_storage_units=10**14,  # 100 TB
        )
        assert result.allowed is True
        assert result.reason == "unlimited"


@pytest.mark.asyncio
class TestProducersIntegrateWithService:
    """End-to-end: emit events then read them back through the service."""

    async def test_storage_usage_reflects_emitted_events(
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

        gb = 1024 * 1024 * 1024
        emit_storage_delta(session, organization_id=creator.id, bytes_delta=3 * gb)
        emit_storage_delta(session, organization_id=creator.id, bytes_delta=2 * gb)
        emit_storage_delta(session, organization_id=creator.id, bytes_delta=-1 * gb)
        await session.flush()

        usage = await quotas.get_usage(
            session, creator.id, QuotaKey.storage_gb
        )
        assert usage.used == 4
        assert usage.limit == 5
        assert usage.remaining == 1
