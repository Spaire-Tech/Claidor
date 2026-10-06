"""The web app's billing page over HTTP (`simeon/plans/endpoints.py`)."""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest
import stripe as stripe_lib
from pytest_mock import MockerFixture

from simeon.models import User
from simeon.plans.service import plans
from simeon.postgres import AsyncSession
from tests.plans.test_service import stripe_subscription


@pytest.mark.asyncio
class TestPlans:
    async def test_anonymous(self, client: httpx.AsyncClient) -> None:
        response = await client.get("/v1/plans/")
        assert response.status_code == 401

    @pytest.mark.auth
    async def test_the_three_plans_with_their_prices(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.get("/v1/plans/")
        assert response.status_code == 200
        items = response.json()["items"]
        assert [item["tier"] for item in items] == ["standard", "pro", "max"]
        assert items[0]["monthly_price_cents"] == 2000
        assert items[0]["annual_price_cents"] == 19200
        assert items[0]["weekly_credits"] == 750_000
        assert items[0]["trial_days"] == 7
        assert items[2]["monthly_lookup_key"] == "simeon_max_month"

    @pytest.mark.auth
    async def test_no_subscription_is_inactive_once_billing_is_required(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        mocker.patch("simeon.desktop.allowance.settings.DESKTOP_BILLING_REQUIRED", True)
        response = await client.get("/v1/plans/subscription")
        assert response.status_code == 200
        body = response.json()
        assert body["tier"] == "inactive"
        assert body["status"] == "none"
        assert body["entitlements"]["tier"] == "inactive"

    @pytest.mark.auth
    async def test_with_billing_off_nobody_is_sent_to_billing(
        self, client: httpx.AsyncClient
    ) -> None:
        """The web app's dashboard gate redirects on `inactive`; while the
        server does not require a plan, the answer is `unmanaged` (free),
        as the platform endpoint answered before."""
        response = await client.get("/v1/plans/subscription")
        assert response.status_code == 200
        body = response.json()
        assert body["tier"] == "unmanaged"
        assert body["status"] == "free"

    @pytest.mark.auth
    async def test_an_exempt_person_is_free_too(
        self, client: httpx.AsyncClient, user: User, mocker: MockerFixture
    ) -> None:
        mocker.patch("simeon.desktop.allowance.settings.DESKTOP_BILLING_REQUIRED", True)
        mocker.patch(
            "simeon.desktop.allowance.settings.DESKTOP_BILLING_EXEMPT_EMAILS",
            {user.email.upper()},
        )
        response = await client.get("/v1/plans/subscription")
        assert response.json()["tier"] == "unmanaged"

    @pytest.mark.auth
    async def test_the_synced_subscription_is_shown(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="trialing", tier="pro")
        )
        await session.flush()
        response = await client.get("/v1/plans/subscription")
        assert response.status_code == 200
        body = response.json()
        assert body["tier"] == "pro"
        assert body["status"] == "trialing"
        assert body["billing_interval"] == "month"
        assert body["trial_end"] is not None
        assert body["cancel_at_period_end"] is False
        assert body["stripe_customer_id"] == "cus_test"

    @pytest.mark.auth
    async def test_checkout_answers_with_the_url(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        mocker.patch(
            "simeon.plans.service.stripe_billing.create_customer",
            new=AsyncMock(
                return_value=stripe_lib.Customer.construct_from({"id": "cus_new"}, None)
            ),
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.price_by_lookup_key",
            new=AsyncMock(
                return_value=stripe_lib.Price.construct_from({"id": "price_1"}, None)
            ),
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.create_checkout_session",
            new=AsyncMock(
                return_value=stripe_lib.checkout.Session.construct_from(
                    {"id": "cs_1", "url": "https://checkout.stripe.com/c/cs_1"}, None
                )
            ),
        )
        response = await client.post(
            "/v1/plans/checkout", json={"tier": "standard", "billing_interval": "year"}
        )
        assert response.status_code == 201, response.text
        assert response.json() == {"checkout_url": "https://checkout.stripe.com/c/cs_1"}

    @pytest.mark.auth
    async def test_checkout_without_a_key_is_503(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "")
        response = await client.post("/v1/plans/checkout", json={"tier": "standard"})
        assert response.status_code == 503

    @pytest.mark.auth
    async def test_the_portal_needs_a_customer(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        response = await client.post("/v1/plans/portal", json={"flow": "cancel"})
        assert response.status_code == 404
