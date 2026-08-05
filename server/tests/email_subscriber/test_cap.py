"""The email_subscribers cap meters the *marketing list* only.

Buyers — contacts acquired through a purchase or linked to a paying
customer — are deliberately uncapped, because they're already monetized by
the transaction fee. Counting them would push a creator to upgrade by their
own sales (the "success tax" that drove the Kajabi backlash). These tests
pin that definition: marketing contacts count and block at the cap; buyers
never do; and a lead who later buys converts to an uncapped buyer.
"""

import dataclasses
from uuid import UUID

import pytest
from pytest_mock import MockerFixture

from polar.email_subscriber.repository import EmailSubscriberRepository
from polar.email_subscriber.service import email_subscriber as email_subscriber_service
from polar.entitlements.exceptions import TierLimitReachedError
from polar.entitlements.tiers import TierKey, get_definition
from polar.enums import SubscriptionRecurringInterval
from polar.models import Organization, Product
from polar.models.email_subscriber import EmailSubscriberSource
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
    """Shrink Starter's caps so we can fill them without fixturing 10k rows."""
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
    save_fixture: SaveFixture, *, platform_org: Organization, tier: str
) -> Product:
    prices: list[PriceFixtureType] = [(4900, "usd")]
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
) -> None:
    product = await _seed_tier_product(
        save_fixture, platform_org=platform_org, tier=tier
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
class TestEmailSubscriberCap:
    async def _starter_creator_at_limit(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        *,
        limit: int,
    ) -> Organization:
        platform_org = await create_organization(save_fixture)
        _patch_platform_org_id(mocker, platform_org.id)
        _patch_starter_limits(mocker, email_subscribers=limit)
        creator = await create_organization(save_fixture)
        await _subscribe_to_tier(
            save_fixture,
            platform_org=platform_org,
            creator=creator,
            tier="starter",
        )
        return creator

    async def test_marketing_contacts_count_and_block_at_cap(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await self._starter_creator_at_limit(
            mocker, session, save_fixture, limit=2
        )

        # Two marketing contacts fill the cap.
        await email_subscriber_service.create(
            session,
            organization_id=creator.id,
            email="lead1@example.com",
            source=EmailSubscriberSource.manual,
        )
        await email_subscriber_service.create(
            session,
            organization_id=creator.id,
            email="lead2@example.com",
            source=EmailSubscriberSource.lead_magnet,
        )

        # The third marketing contact is refused.
        with pytest.raises(TierLimitReachedError) as excinfo:
            await email_subscriber_service.create(
                session,
                organization_id=creator.id,
                email="lead3@example.com",
                source=EmailSubscriberSource.manual,
            )
        assert excinfo.value.key == "email_subscribers"

    async def test_buyers_are_uncapped(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await self._starter_creator_at_limit(
            mocker, session, save_fixture, limit=1
        )

        # Fill the marketing cap with a single contact.
        await email_subscriber_service.create(
            session,
            organization_id=creator.id,
            email="lead@example.com",
            source=EmailSubscriberSource.manual,
        )

        # Buyers add freely past the cap — by source...
        buyer_a = await email_subscriber_service.create(
            session,
            organization_id=creator.id,
            email="buyer-a@example.com",
            source=EmailSubscriberSource.purchase,
        )
        # ...and by customer linkage.
        customer = await create_customer(
            save_fixture, organization=creator, email="buyer-b@example.com"
        )
        buyer_b = await email_subscriber_service.create(
            session,
            organization_id=creator.id,
            email="buyer-b@example.com",
            source=EmailSubscriberSource.manual,
            customer_id=customer.id,
        )
        assert buyer_a.id is not None
        assert buyer_b.id is not None

        # The marketing count is still 1 (only the lead), not 3.
        repo = EmailSubscriberRepository.from_session(session)
        assert await repo.count_marketing_subscribers(creator.id) == 1
        # ...while the raw active total counts everyone.
        assert await repo.count_by_organization(creator.id) == 3

    async def test_lead_who_buys_stops_counting(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        creator = await self._starter_creator_at_limit(
            mocker, session, save_fixture, limit=1
        )
        repo = EmailSubscriberRepository.from_session(session)

        # A marketing lead opts in — fills the cap.
        await email_subscriber_service.create(
            session,
            organization_id=creator.id,
            email="lead@example.com",
            source=EmailSubscriberSource.lead_magnet,
        )
        assert await repo.count_marketing_subscribers(creator.id) == 1

        # The same person buys: the existing row gets its customer link
        # backfilled and converts to an (uncapped) buyer.
        customer = await create_customer(
            save_fixture, organization=creator, email="lead@example.com"
        )
        await email_subscriber_service.create(
            session,
            organization_id=creator.id,
            email="lead@example.com",
            source=EmailSubscriberSource.purchase,
            customer_id=customer.id,
        )
        assert await repo.count_marketing_subscribers(creator.id) == 0

        # ...which frees the marketing slot for a new lead.
        new_lead = await email_subscriber_service.create(
            session,
            organization_id=creator.id,
            email="lead2@example.com",
            source=EmailSubscriberSource.manual,
        )
        assert new_lead.id is not None
