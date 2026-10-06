"""The app's Manage plan card asks the API for a Stripe portal link
(`POST /desktop/api/billing/portal`) and opens it in the browser."""

from unittest.mock import AsyncMock

import httpx
import pytest
import stripe as stripe_lib
from pytest_mock import MockerFixture

from simeon.models import User
from simeon.plans.service import plans
from simeon.postgres import AsyncSession
from tests.desktop.test_endpoints import _signed_in
from tests.plans.test_service import stripe_subscription


@pytest.mark.asyncio
class TestBillingPortal:
    async def test_the_portal_s_front_page(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        create = mocker.patch(
            "simeon.plans.service.stripe_billing.create_portal_session",
            new=AsyncMock(
                return_value=stripe_lib.billing_portal.Session.construct_from(
                    {"id": "bps_1", "url": "https://billing.stripe.com/p/1"}, None
                )
            ),
        )
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/portal",
            json={},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200, response.text
        assert response.json() == {
            "code": 0,
            "data": {"portalUrl": "https://billing.stripe.com/p/1"},
        }
        assert "flow_data" not in create.await_args.kwargs

    async def test_an_upgrade_confirms_the_one_plan(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.price_by_lookup_key",
            new=AsyncMock(
                return_value=stripe_lib.Price.construct_from({"id": "price_pro"}, None)
            ),
        )
        create = mocker.patch(
            "simeon.plans.service.stripe_billing.create_portal_session",
            new=AsyncMock(
                return_value=stripe_lib.billing_portal.Session.construct_from(
                    {"id": "bps_2", "url": "https://billing.stripe.com/p/2"}, None
                )
            ),
        )
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/portal",
            json={"flow": "update_confirm", "tier": "pro"},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200, response.text
        flow = create.await_args.kwargs["flow_data"]
        assert flow["type"] == "subscription_update_confirm"
        assert flow["subscription_update_confirm"]["items"][0]["price"] == "price_pro"

    async def test_without_a_plan_there_is_no_portal(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/portal",
            json={},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 404
        assert response.json()["code"] == 404

    async def test_a_plan_that_is_not_ours_is_refused(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/portal",
            json={"flow": "update_confirm", "tier": "ultra"},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 400
