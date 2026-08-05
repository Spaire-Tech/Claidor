import pytest
from pytest_mock import MockerFixture
from sqlalchemy import func, select

from polar.enums import SubscriptionRecurringInterval
from polar.kit.db.postgres import AsyncSession
from polar.models import Meter, Product, ProductPrice
from polar.models.product_price import (
    ProductPriceFixed,
)
from scripts.seed_platform_products import (
    METER_SPECS,
    PRODUCT_SPECS,
    _configure_platform_org,
    _find_product_by_tier_and_interval,
    _upsert_catalog_price,
    _upsert_meter,
    _upsert_product,
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
            "polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
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
            "polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
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
            "polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
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

        # Starter — monthly $49 + annual $470 (~20% off 12 × $49 = $588,
        # rounded to a whole dollar).
        starter_monthly = await _find("starter", "month")
        assert starter_monthly.name == "Spaire Starter"
        assert starter_monthly.trial_interval_count == 14
        starter_monthly_price = await _price_for(starter_monthly)
        assert isinstance(starter_monthly_price, ProductPriceFixed)
        assert starter_monthly_price.price_amount == 4900

        starter_annual = await _find("starter", "year")
        assert starter_annual.name == "Spaire Starter (Annual)"
        assert starter_annual.trial_interval_count == 14
        starter_annual_price = await _price_for(starter_annual)
        assert isinstance(starter_annual_price, ProductPriceFixed)
        assert starter_annual_price.price_amount == 47000  # $470.00

        # Studio — monthly $129 + annual $1,238.
        studio_monthly = await _find("studio", "month")
        assert studio_monthly.name == "Spaire Studio"
        assert studio_monthly.trial_interval_count == 14
        studio_monthly_price = await _price_for(studio_monthly)
        assert isinstance(studio_monthly_price, ProductPriceFixed)
        assert studio_monthly_price.price_amount == 12900

        studio_annual = await _find("studio", "year")
        assert studio_annual.name == "Spaire Studio (Annual)"
        studio_annual_price = await _price_for(studio_annual)
        assert isinstance(studio_annual_price, ProductPriceFixed)
        assert studio_annual_price.price_amount == 123800  # $1,238.00

        # Scale — monthly $299 + annual $2,870.
        scale_monthly = await _find("scale", "month")
        assert scale_monthly.name == "Spaire Scale"
        assert scale_monthly.trial_interval_count == 14
        scale_monthly_price = await _price_for(scale_monthly)
        assert isinstance(scale_monthly_price, ProductPriceFixed)
        assert scale_monthly_price.price_amount == 29900

        scale_annual = await _find("scale", "year")
        assert scale_annual.name == "Spaire Scale (Annual)"
        scale_annual_price = await _price_for(scale_annual)
        assert isinstance(scale_annual_price, ProductPriceFixed)
        assert scale_annual_price.price_amount == 287000  # $2,870.00

    async def test_archives_stale_price_when_amount_changes(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        mocker.patch(
            "polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
        )
        starter_spec = next(s for s in PRODUCT_SPECS if s.tier == "starter")

        product, _ = await _upsert_product(
            session, platform_org, starter_spec, dry_run=False
        )
        await _upsert_catalog_price(
            session, product, starter_spec.price, dry_run=False
        )
        await session.flush()

        # Simulate a price change: same product, different amount.
        from dataclasses import replace

        new_price_spec = replace(starter_spec.price, price_amount_cents=5900)
        action = await _upsert_catalog_price(
            session, product, new_price_spec, dry_run=False
        )
        assert action == "replaced"
        await session.flush()

        prices = (
            await session.execute(
                select(ProductPrice).where(ProductPrice.product_id == product.id)
            )
        ).scalars().all()
        active = [p for p in prices if not p.is_archived]
        archived = [p for p in prices if p.is_archived]
        assert len(active) == 1
        assert len(archived) == 1
        assert isinstance(active[0], ProductPriceFixed)
        assert active[0].price_amount == 5900
        assert isinstance(archived[0], ProductPriceFixed)
        assert archived[0].price_amount == 4900

    async def test_configure_platform_org_enables_multiple_subscriptions(
        self,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        assert platform_org.subscription_settings["allow_multiple_subscriptions"] is False

        action = _configure_platform_org(platform_org, dry_run=False)
        assert action == "updated"
        assert platform_org.subscription_settings["allow_multiple_subscriptions"] is True

        # Idempotent.
        assert _configure_platform_org(platform_org, dry_run=False) == "unchanged"

    async def test_configure_platform_org_dry_run_does_not_mutate(
        self,
        save_fixture: SaveFixture,
    ) -> None:
        platform_org = await create_organization(save_fixture)
        action = _configure_platform_org(platform_org, dry_run=True)
        assert action == "updated"
        assert platform_org.subscription_settings["allow_multiple_subscriptions"] is False

    async def test_migrates_legacy_pro_product_to_starter_in_place(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        """A product seeded under the original "pro" tier key is adopted by
        the Starter spec and re-stamped to "starter" — same row, no
        duplicate — so existing subscriptions keep pointing at it."""
        platform_org = await create_organization(save_fixture)
        mocker.patch(
            "polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id
        )

        legacy_pro = await create_product(
            save_fixture,
            organization=platform_org,
            name="Spaire Pro",
            recurring_interval=SubscriptionRecurringInterval.month,
            prices=[(4900, "usd")],
        )
        legacy_pro.user_metadata = {"tier": "pro", "billing_interval": "month"}
        await save_fixture(legacy_pro)

        # The Starter monthly spec must find the legacy "pro" row...
        starter_spec = next(
            s
            for s in PRODUCT_SPECS
            if s.tier == "starter" and s.billing_interval == "month"
        )
        found = await _find_product_by_tier_and_interval(
            session, platform_org.id, "starter", "month"
        )
        assert found is not None
        assert found.id == legacy_pro.id

        # ...and upserting re-stamps it in place rather than creating a new one.
        product, action = await _upsert_product(
            session, platform_org, starter_spec, dry_run=False
        )
        await session.flush()
        assert product.id == legacy_pro.id
        assert action == "updated"
        assert product.user_metadata["tier"] == "starter"
        assert product.name == "Spaire Starter"

        total = (
            await session.execute(
                select(func.count(Product.id)).where(
                    Product.organization_id == platform_org.id
                )
            )
        ).scalar_one()
        assert total == 1
