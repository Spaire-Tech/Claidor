import pytest
from pytest_mock import MockerFixture
from sqlalchemy import func, select

from scripts.seed_platform_products import (
    METER_SPECS,
    PRODUCT_SPECS,
    _configure_platform_org,
    _find_product_by_tier_and_interval,
    _upsert_catalog_price,
    _upsert_meter,
    _upsert_product,
)
from simeon.enums import SubscriptionRecurringInterval
from simeon.kit.db.postgres import AsyncSession
from simeon.models import Meter, Product, ProductPrice
from simeon.models.product_price import (
    ProductPriceFixed,
)
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization, create_product


@pytest.mark.asyncio
class TestSeedPlatformProducts:
    async def test_creates_all_meters_and_products(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        mocker.patch(
            "simeon.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
        )

        for meter_spec in METER_SPECS:
            _, action = await _upsert_meter(
                session, platform_org, meter_spec, dry_run=False
            )
            assert action == "created"

        for product_spec in PRODUCT_SPECS:
            product, action = await _upsert_product(
                session, platform_org, product_spec, dry_run=False
            )
            assert action == "created"
            price_action = await _upsert_catalog_price(
                session, product, product_spec.price, dry_run=False
            )
            assert price_action == "created"

        await session.flush()

        meter_count = (
            await session.execute(
                select(func.count(Meter.id)).where(
                    Meter.organization_id == platform_org.id
                )
            )
        ).scalar_one()
        assert meter_count == len(METER_SPECS)

        product_count = (
            await session.execute(
                select(func.count(Product.id)).where(
                    Product.organization_id == platform_org.id
                )
            )
        ).scalar_one()
        assert product_count == len(PRODUCT_SPECS)

    async def test_is_idempotent(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        mocker.patch(
            "simeon.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
        )

        # First pass.
        for meter_spec in METER_SPECS:
            await _upsert_meter(session, platform_org, meter_spec, dry_run=False)
        for product_spec in PRODUCT_SPECS:
            product, _ = await _upsert_product(
                session, platform_org, product_spec, dry_run=False
            )
            await _upsert_catalog_price(
                session, product, product_spec.price, dry_run=False
            )
        await session.flush()

        # Second pass — everything should already exist.
        for meter_spec in METER_SPECS:
            _, action = await _upsert_meter(
                session, platform_org, meter_spec, dry_run=False
            )
            assert action == "unchanged"
        for product_spec in PRODUCT_SPECS:
            product, action = await _upsert_product(
                session, platform_org, product_spec, dry_run=False
            )
            assert action == "unchanged"
            price_action = await _upsert_catalog_price(
                session, product, product_spec.price, dry_run=False
            )
            assert price_action == "unchanged"

        # And the row counts should not have grown.
        meter_count = (
            await session.execute(
                select(func.count(Meter.id)).where(
                    Meter.organization_id == platform_org.id
                )
            )
        ).scalar_one()
        assert meter_count == len(METER_SPECS)

        product_count = (
            await session.execute(
                select(func.count(Product.id)).where(
                    Product.organization_id == platform_org.id
                )
            )
        ).scalar_one()
        assert product_count == len(PRODUCT_SPECS)

    async def test_products_have_expected_shape(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        mocker.patch(
            "simeon.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
        )

        for product_spec in PRODUCT_SPECS:
            product, _ = await _upsert_product(
                session, platform_org, product_spec, dry_run=False
            )
            await _upsert_catalog_price(
                session, product, product_spec.price, dry_run=False
            )
        await session.flush()

        async def _find(tier: str, billing_interval: str) -> Product:
            return (
                await session.execute(
                    select(Product)
                    .where(Product.organization_id == platform_org.id)
                    .where(Product.user_metadata["tier"].astext == tier)
                    .where(
                        Product.user_metadata["billing_interval"].astext
                        == billing_interval
                    )
                )
            ).scalar_one()

        async def _price_for(product: Product) -> ProductPrice:
            return (
                await session.execute(
                    select(ProductPrice)
                    .where(ProductPrice.product_id == product.id)
                    .where(ProductPrice.is_archived.is_(False))
                )
            ).scalar_one()

        # No Legacy product — there is no free fallback tier.
        legacy_count = (
            await session.execute(
                select(func.count(Product.id))
                .where(Product.organization_id == platform_org.id)
                .where(Product.user_metadata["tier"].astext == "legacy")
            )
        ).scalar_one()
        assert legacy_count == 0

        # Standard — monthly $20 + annual $192 (20% off 12 × $20 = $240).
        standard_monthly = await _find("standard", "month")
        assert standard_monthly.name == "Simeon Standard"
        assert standard_monthly.trial_interval_count == 7
        standard_monthly_price = await _price_for(standard_monthly)
        assert isinstance(standard_monthly_price, ProductPriceFixed)
        assert standard_monthly_price.price_amount == 2000

        standard_annual = await _find("standard", "year")
        assert standard_annual.name == "Simeon Standard (Annual)"
        assert standard_annual.trial_interval_count == 7
        standard_annual_price = await _price_for(standard_annual)
        assert isinstance(standard_annual_price, ProductPriceFixed)
        assert standard_annual_price.price_amount == 19200  # $192.00

        # Pro — monthly $60 + annual $576.
        pro_monthly = await _find("pro", "month")
        assert pro_monthly.name == "Simeon Pro"
        assert pro_monthly.trial_interval_count == 7
        pro_monthly_price = await _price_for(pro_monthly)
        assert isinstance(pro_monthly_price, ProductPriceFixed)
        assert pro_monthly_price.price_amount == 6000

        pro_annual = await _find("pro", "year")
        assert pro_annual.name == "Simeon Pro (Annual)"
        pro_annual_price = await _price_for(pro_annual)
        assert isinstance(pro_annual_price, ProductPriceFixed)
        assert pro_annual_price.price_amount == 57600  # $576.00

        # Max — monthly $200 + annual $1,920.
        max_monthly = await _find("max", "month")
        assert max_monthly.name == "Simeon Max"
        assert max_monthly.trial_interval_count == 7
        max_monthly_price = await _price_for(max_monthly)
        assert isinstance(max_monthly_price, ProductPriceFixed)
        assert max_monthly_price.price_amount == 20000

        max_annual = await _find("max", "year")
        assert max_annual.name == "Simeon Max (Annual)"
        max_annual_price = await _price_for(max_annual)
        assert isinstance(max_annual_price, ProductPriceFixed)
        assert max_annual_price.price_amount == 192000  # $1,920.00

    async def test_archives_stale_price_when_amount_changes(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        mocker.patch(
            "simeon.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
        )
        standard_spec = next(s for s in PRODUCT_SPECS if s.tier == "standard")

        product, _ = await _upsert_product(
            session, platform_org, standard_spec, dry_run=False
        )
        await _upsert_catalog_price(
            session, product, standard_spec.price, dry_run=False
        )
        await session.flush()

        # Simulate a price change: same product, different amount.
        from dataclasses import replace

        new_price_spec = replace(standard_spec.price, price_amount_cents=2500)
        action = await _upsert_catalog_price(
            session, product, new_price_spec, dry_run=False
        )
        assert action == "replaced"
        await session.flush()

        prices = (
            (
                await session.execute(
                    select(ProductPrice).where(ProductPrice.product_id == product.id)
                )
            )
            .scalars()
            .all()
        )
        active = [p for p in prices if not p.is_archived]
        archived = [p for p in prices if p.is_archived]
        assert len(active) == 1
        assert len(archived) == 1
        assert isinstance(active[0], ProductPriceFixed)
        assert active[0].price_amount == 2500
        assert isinstance(archived[0], ProductPriceFixed)
        assert archived[0].price_amount == 2000

    async def test_configure_platform_org_enables_multiple_subscriptions(
        self,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        assert (
            platform_org.subscription_settings["allow_multiple_subscriptions"] is False
        )

        action = _configure_platform_org(platform_org, dry_run=False)
        assert action == "updated"
        assert (
            platform_org.subscription_settings["allow_multiple_subscriptions"] is True
        )

        # Idempotent.
        assert _configure_platform_org(platform_org, dry_run=False) == "unchanged"

    async def test_configure_platform_org_dry_run_does_not_mutate(
        self,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        action = _configure_platform_org(platform_org, dry_run=True)
        assert action == "updated"
        assert (
            platform_org.subscription_settings["allow_multiple_subscriptions"] is False
        )

    async def test_migrates_creator_era_product_to_the_plan_in_place(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """A product seeded under the creator-era "starter" key is adopted
        by the Standard spec and re-stamped to "standard" — same row, no
        duplicate — so a subscription on a staging database keeps pointing
        at it."""
        platform_org = await create_organization(save_fixture)
        mocker.patch(
            "simeon.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
        )

        legacy_starter = await create_product(
            save_fixture,
            organization=platform_org,
            name="Simeon Starter",
            recurring_interval=SubscriptionRecurringInterval.month,
            prices=[(4900, "usd")],
        )
        legacy_starter.user_metadata = {"tier": "starter", "billing_interval": "month"}
        await save_fixture(legacy_starter)

        # The Standard monthly spec must find the legacy "starter" row...
        standard_spec = next(
            s
            for s in PRODUCT_SPECS
            if s.tier == "standard" and s.billing_interval == "month"
        )
        found = await _find_product_by_tier_and_interval(
            session, platform_org.id, "standard", "month"
        )
        assert found is not None
        assert found.id == legacy_starter.id

        # ...and upserting re-stamps it in place rather than creating a new one.
        product, action = await _upsert_product(
            session, platform_org, standard_spec, dry_run=False
        )
        await session.flush()
        assert product.id == legacy_starter.id
        assert action == "updated"
        assert product.user_metadata["tier"] == "standard"
        assert product.name == "Simeon Standard"

        total = (
            await session.execute(
                select(func.count(Product.id)).where(
                    Product.organization_id == platform_org.id
                )
            )
        ).scalar_one()
        assert total == 1
