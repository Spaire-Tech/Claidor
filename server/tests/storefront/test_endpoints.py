import uuid

import pytest
from httpx import AsyncClient

from polar.models import Organization, OrganizationCustomDomain, Product, User
from polar.models.organization_custom_domain import OrganizationCustomDomainStatus
from polar.models.product import ProductCategory
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


@pytest.mark.asyncio
async def test_get_organization_slug_by_product_id_not_found(
    client: AsyncClient,
) -> None:
    response = await client.get(
        f"/v1/storefronts/lookup/product/{uuid.uuid4()}",
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_organization_slug_by_product_id(
    client: AsyncClient,
    organization: Organization,
    product: Product,
) -> None:
    response = await client.get(
        f"/v1/storefronts/lookup/product/{product.id}",
    )

    assert response.status_code == 200

    json = response.json()
    assert json["organization_slug"] == organization.slug


@pytest.mark.asyncio
async def test_get_organization_slug_by_subscription_id_not_found(
    client: AsyncClient,
) -> None:
    response = await client.get(
        f"/v1/storefronts/lookup/subscription/{uuid.uuid4()}",
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_organization_slug_by_subscription_id(
    save_fixture: SaveFixture,
    client: AsyncClient,
    organization: Organization,
    product: Product,
    user: User,
) -> None:
    customer = await create_customer(
        save_fixture, organization=organization, email=user.email
    )
    subscription = await create_subscription(
        save_fixture, product=product, customer=customer
    )

    response = await client.get(
        f"/v1/storefronts/lookup/subscription/{subscription.id}",
    )

    assert response.status_code == 200

    json = response.json()
    assert json["organization_slug"] == organization.slug


@pytest.mark.asyncio
async def test_get_storefront_disabled_without_course_returns_404(
    save_fixture: SaveFixture,
    client: AsyncClient,
) -> None:
    # Storefront disabled and no course product → not public.
    organization = await create_organization(
        save_fixture, storefront_settings={"enabled": False}
    )

    response = await client.get(f"/v1/storefronts/{organization.slug}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_storefront_enabled_returns_200(
    save_fixture: SaveFixture,
    client: AsyncClient,
) -> None:
    organization = await create_organization(
        save_fixture, storefront_settings={"enabled": True}
    )

    response = await client.get(f"/v1/storefronts/{organization.slug}")

    assert response.status_code == 200
    assert response.json()["organization"]["slug"] == organization.slug


@pytest.mark.asyncio
async def test_get_storefront_with_live_course_returns_200(
    save_fixture: SaveFixture,
    client: AsyncClient,
) -> None:
    # Course-only reposition (Phase 6) hides the Space UI and never flips
    # `storefront_enabled`, so a live course must keep the storefront (and
    # therefore the course landing at `/{slug}` and `/{slug}/products/{id}`)
    # reachable even though the flag is off.
    organization = await create_organization(
        save_fixture, storefront_settings={"enabled": False}
    )
    product = await create_product(
        save_fixture, organization=organization, recurring_interval=None
    )
    product.category = ProductCategory.course
    await save_fixture(product)

    response = await client.get(f"/v1/storefronts/{organization.slug}")

    assert response.status_code == 200
    assert response.json()["organization"]["slug"] == organization.slug


@pytest.mark.asyncio
async def test_get_storefront_with_archived_course_returns_404(
    save_fixture: SaveFixture,
    client: AsyncClient,
) -> None:
    # An archived course product is not live, so it does not make the
    # storefront public on its own.
    organization = await create_organization(
        save_fixture, storefront_settings={"enabled": False}
    )
    product = await create_product(
        save_fixture,
        organization=organization,
        recurring_interval=None,
        is_archived=True,
    )
    product.category = ProductCategory.course
    await save_fixture(product)

    response = await client.get(f"/v1/storefronts/{organization.slug}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_organization_slug_by_custom_domain_not_found(
    client: AsyncClient,
) -> None:
    response = await client.get("/v1/storefronts/lookup/domain/unknown.creator.com")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_organization_slug_by_custom_domain_pending_not_resolved(
    save_fixture: SaveFixture,
    client: AsyncClient,
    organization: Organization,
) -> None:
    # Only ACTIVE (verified) domains resolve — pending ones must not route.
    custom_domain = OrganizationCustomDomain(
        organization_id=organization.id,
        domain="learn.creator.com",
    )
    await save_fixture(custom_domain)

    response = await client.get("/v1/storefronts/lookup/domain/learn.creator.com")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_organization_slug_by_custom_domain_active(
    save_fixture: SaveFixture,
    client: AsyncClient,
    organization: Organization,
) -> None:
    custom_domain = OrganizationCustomDomain(
        organization_id=organization.id,
        domain="learn.creator.com",
        status=OrganizationCustomDomainStatus.active,
    )
    await save_fixture(custom_domain)

    # Case-insensitive (CITEXT) and tolerant of a trailing dot.
    response = await client.get("/v1/storefronts/lookup/domain/Learn.Creator.com.")

    assert response.status_code == 200
    assert response.json()["organization_slug"] == organization.slug
