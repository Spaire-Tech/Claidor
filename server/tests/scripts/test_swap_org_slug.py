"""The org-slug swap moves a globally-unique slug between two orgs safely.

Covers:
  * perform_swap — the happy path (slug + invoice prefix move, the held org
    is renamed) and the guards that must abort BEFORE any write.
  * _inspect — the read-only report. This ran real SQL referencing a column
    that doesn't exist (Order.organization_id) and crashed in production with
    AttributeError BEFORE any swap. It is now exercised against a real org
    that actually has a customer, a product, and an order, so the SQL is
    validated against the live schema — the regression that escaped before.
  * _run — the whole CLI flow (load -> inspect -> plan -> swap -> commit/
    rollback) driven directly against the test session, so the real path is
    covered end to end, not a proxy for it.
"""

import uuid

import pytest
import typer
from pytest_mock import MockerFixture
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from polar.models import Customer, Order, OrderItem, Organization, Product
from polar.models.order import OrderBillingReasonInternal, OrderStatus
from scripts.swap_org_slug import (
    SwapError,
    _default_release_slug,
    _inspect,
    _run,
    perform_swap,
)
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    create_customer,
    create_organization,
    create_product,
)


async def _order(
    save_fixture: SaveFixture, *, customer: Customer, product: Product
) -> Order:
    """Build a paid order directly. The shared create_order fixture currently
    omits net_amount (a NOT NULL column) — building it here keeps this test
    self-contained and independent of that fixture."""
    order = Order(
        status=OrderStatus.paid,
        subtotal_amount=1000,
        discount_amount=0,
        net_amount=1000,
        tax_amount=0,
        applied_balance_amount=0,
        currency="usd",
        billing_reason=OrderBillingReasonInternal.purchase,
        invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
        customer=customer,
        product=product,
        items=[
            OrderItem(
                label="", amount=1000, net_amount=1000, tax_amount=0, proration=False
            )
        ],
        custom_field_data={},
        user_metadata={},
    )
    await save_fixture(order)
    return order


async def _org(
    save_fixture: SaveFixture, *, slug: str, prefix: str | None = None
) -> Organization:
    # create_organization hardcodes slug/invoice prefix, so set them after.
    org = await create_organization(save_fixture)
    org.slug = slug
    org.customer_invoice_prefix = prefix or slug.upper()
    await save_fixture(org)
    return org


@pytest.mark.asyncio
class TestSwapOrgSlug:
    async def test_moves_slug_and_invoice_prefix(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        claim = await _org(
            save_fixture, slug="robin-kaye-x", prefix="ROBIN-KAYE-X"
        )
        release = await _org(save_fixture, slug="spaire", prefix="SPAIRE")
        release_slug = _default_release_slug("spaire", release)

        await perform_swap(
            session,
            release_org=release,
            claim_org=claim,
            slug="spaire",
            release_slug=release_slug,
        )

        # The platform (claim) org now owns "spaire", invoice prefix follows.
        assert claim.slug == "spaire"
        assert claim.customer_invoice_prefix == "SPAIRE"
        # The test (release) org was renamed off "spaire".
        assert release.slug == release_slug
        assert release.customer_invoice_prefix == release_slug.upper()

    async def test_aborts_if_release_org_does_not_hold_slug(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        claim = await _org(save_fixture, slug="robin-kaye-y")
        release = await _org(save_fixture, slug="not-spaire")

        with pytest.raises(SwapError):
            await perform_swap(
                session,
                release_org=release,
                claim_org=claim,
                slug="spaire",
                release_slug="spaire-test-x",
            )
        # Nothing changed.
        assert claim.slug == "robin-kaye-y"
        assert release.slug == "not-spaire"

    async def test_aborts_if_release_slug_is_taken(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        claim = await _org(save_fixture, slug="robin-kaye-z")
        release = await _org(save_fixture, slug="spaire")
        release_slug = _default_release_slug("spaire", release)
        # A third org already holds the slug we'd rename the release org to.
        await _org(save_fixture, slug=release_slug)

        with pytest.raises(SwapError):
            await perform_swap(
                session,
                release_org=release,
                claim_org=claim,
                slug="spaire",
                release_slug=release_slug,
            )
        assert claim.slug == "robin-kaye-z"
        assert release.slug == "spaire"


@pytest.mark.asyncio
class TestInspect:
    """_inspect runs real count SQL; it crashed in prod on Order.organization_id."""

    async def test_counts_customers_orders_products(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        org = await _org(save_fixture, slug="inspect-me")
        product = await create_product(
            save_fixture, organization=org, recurring_interval=None
        )
        customer = await create_customer(save_fixture, organization=org)
        # An order whose customer belongs to the org — counted via the join
        # (Order has no organization_id; this is the line that used to crash).
        await _order(save_fixture, customer=customer, product=product)

        info = await _inspect(session, org)

        assert info["id"] == str(org.id)
        assert info["slug"] == "inspect-me"
        assert info["customers"] == 1
        assert info["products"] == 1
        assert info["orders"] == 1

    async def test_empty_org_reports_zero_counts(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # The test/leftover org we want to release the slug from: no real data.
        org = await _org(save_fixture, slug="empty-test-org")

        info = await _inspect(session, org)

        assert info["customers"] == 0
        assert info["orders"] == 0
        assert info["products"] == 0


@pytest.mark.asyncio
class TestRunFlow:
    """The full CLI flow (_run) against the real session — load, inspect, plan,
    swap, then commit/rollback. commit/rollback are stubbed so the shared test
    transaction is left intact, but everything up to and including the swap
    runs for real."""

    async def test_dry_run_inspects_and_does_not_commit(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        claim = await _org(save_fixture, slug="robin-kaye-dry")
        release = await _org(save_fixture, slug="spaire")
        # Give the release (leftover) org an order so _inspect's join runs.
        customer = await create_customer(save_fixture, organization=release)
        product = await create_product(
            save_fixture, organization=release, recurring_interval=None
        )
        await _order(save_fixture, customer=customer, product=product)

        commit = mocker.patch.object(session, "commit")
        rollback = mocker.patch.object(session, "rollback")

        await _run(
            session,
            release_org=str(release.id),
            claim_org=str(claim.id),
            slug="spaire",
            release_slug=None,
            apply=False,
        )

        out = capsys.readouterr().out
        # The inspection + plan were printed (the part that used to crash).
        assert "RELEASE org" in out
        assert "CLAIM org" in out
        assert "Plan:" in out
        assert "dry-run" in out
        # Dry-run rolls back, never commits.
        rollback.assert_awaited_once()
        commit.assert_not_called()

    async def test_apply_moves_the_slug_for_real(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        claim = await _org(save_fixture, slug="robin-kaye-apply")
        release = await _org(save_fixture, slug="spaire")

        commit = mocker.patch.object(session, "commit")
        rollback = mocker.patch.object(session, "rollback")

        await _run(
            session,
            release_org=str(release.id),
            claim_org=str(claim.id),
            slug="spaire",
            release_slug=None,
            apply=True,
        )

        # --apply commits, never rolls back.
        commit.assert_awaited_once()
        rollback.assert_not_called()

        # The swap was actually flushed: the claim org now holds the slug and
        # the release org was renamed off it. Re-read from the DB to be sure.
        held = await session.scalar(
            select(Organization).where(Organization.slug == "spaire")
        )
        assert held is not None
        assert held.id == claim.id
        assert held.customer_invoice_prefix == "SPAIRE"
        await session.refresh(release)
        assert release.slug != "spaire"

    async def test_aborts_when_release_org_missing(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        claim = await _org(save_fixture, slug="robin-kaye-missing")
        missing_id = "00000000-0000-0000-0000-000000000000"

        commit = mocker.patch.object(session, "commit")

        with pytest.raises(typer.Exit):
            await _run(
                session,
                release_org=missing_id,
                claim_org=str(claim.id),
                slug="spaire",
                release_slug=None,
                apply=True,
            )
        commit.assert_not_called()
