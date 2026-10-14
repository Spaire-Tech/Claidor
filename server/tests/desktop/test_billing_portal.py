"""The app's Manage plan card asks the API for a Stripe portal link
(`POST /desktop/api/billing/portal`) and opens it; the banner over the
composer does too after a failed payment, then asks for the plan to be
charged (`POST /desktop/api/billing/settle`)."""

from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
import stripe as stripe_lib
from pytest_mock import MockerFixture

from simeon.config import settings
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


def _past_due(user: User, *, card: str = "pm_test", invoice: str = "in_1") -> Any:
    subscription = stripe_subscription(user, status="past_due")
    subscription["default_payment_method"] = {"id": card, "object": "payment_method"}
    subscription["latest_invoice"] = invoice
    return subscription


@pytest.mark.asyncio
class TestFromTheApp:
    """14 October 2026: the banner over the composer opens Stripe's card
    page from the app, which comes back to the app (not to the web's
    billing page, which asks to sign in), and the plan is charged at once."""

    async def test_the_card_page_comes_back_to_the_app(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        await plans.apply_stripe_subscription(session, _past_due(user))
        create = mocker.patch(
            "simeon.plans.service.stripe_billing.create_portal_session",
            new=AsyncMock(
                return_value=stripe_lib.billing_portal.Session.construct_from(
                    {"id": "bps_3", "url": "https://billing.stripe.com/p/3"}, None
                )
            ),
        )
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/portal",
            json={"flow": "payment_method", "back": "simeon-ios"},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200, response.text
        back = settings.generate_external_url("/desktop/billing/back?to=simeon-ios")
        kwargs = create.await_args.kwargs
        assert kwargs["return_url"] == back
        assert kwargs["flow_data"]["type"] == "payment_method_update"
        assert kwargs["flow_data"]["after_completion"] == {
            "type": "redirect",
            "redirect": {"return_url": back},
        }

    async def test_an_unknown_app_is_refused(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/portal",
            json={"flow": "payment_method", "back": "https"},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 422

    async def test_back_hands_over_to_the_app(self, client: httpx.AsyncClient) -> None:
        response = await client.get("/desktop/billing/back?to=simeon-ios")
        assert response.status_code == 302
        assert response.headers["location"] == "simeon-ios://app/v1/open"
        mac = await client.get("/desktop/billing/back?to=simeon")
        assert mac.headers["location"] == "simeon://app/v1/open"
        other = await client.get("/desktop/billing/back?to=javascript")
        assert other.headers["location"] == settings.generate_frontend_url("/billing")

    async def test_the_new_card_pays_the_plan_now(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        await plans.apply_stripe_subscription(session, _past_due(user))
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_customer",
            new=AsyncMock(
                return_value=stripe_lib.Customer.construct_from(
                    {
                        "id": "cus_test",
                        "invoice_settings": {"default_payment_method": "pm_new"},
                    },
                    None,
                )
            ),
        )
        paid = stripe_subscription(user, status="active")
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_subscription",
            new=AsyncMock(side_effect=[_past_due(user), paid]),
        )
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription",
            new=AsyncMock(return_value=_past_due(user, card="pm_new")),
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_invoice",
            new=AsyncMock(
                return_value=stripe_lib.Invoice.construct_from(
                    {"id": "in_1", "status": "open"}, None
                )
            ),
        )
        pay = mocker.patch(
            "simeon.plans.service.stripe_billing.pay_invoice", new=AsyncMock()
        )
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/settle",
            json={},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"] == {"paid": True}
        modify.assert_awaited_once_with("sub_test", default_payment_method="pm_new")
        pay.assert_awaited_once_with("in_1", payment_method="pm_new")
        row = await plans.subscription_of(session, user)
        assert row is not None
        assert row.status == "active"

    async def test_a_card_still_declined_leaves_the_plan_off(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        await plans.apply_stripe_subscription(session, _past_due(user, card="pm_new"))
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_customer",
            new=AsyncMock(
                return_value=stripe_lib.Customer.construct_from(
                    {
                        "id": "cus_test",
                        "invoice_settings": {"default_payment_method": "pm_new"},
                    },
                    None,
                )
            ),
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_subscription",
            new=AsyncMock(return_value=_past_due(user, card="pm_new")),
        )
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription", new=AsyncMock()
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_invoice",
            new=AsyncMock(
                return_value=stripe_lib.Invoice.construct_from(
                    {"id": "in_1", "status": "open"}, None
                )
            ),
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.pay_invoice",
            new=AsyncMock(
                side_effect=stripe_lib.CardError(
                    "Your card was declined.", None, "card_declined"
                )
            ),
        )
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/settle",
            json={},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.json()["data"] == {"paid": False}
        modify.assert_not_awaited()

    async def test_nothing_unpaid_asks_nothing_of_stripe(
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
        customer = mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_customer", new=AsyncMock()
        )
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/settle",
            json={},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.json()["data"] == {"paid": False}
        customer.assert_not_awaited()
