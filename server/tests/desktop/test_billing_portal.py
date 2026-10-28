"""The app's Manage plan card asks the API for a Stripe portal link
(`POST /desktop/api/billing/portal`) and opens it; the banner over the
composer does too after a failed payment, then asks for the plan to be
charged (`POST /desktop/api/billing/settle`)."""

import html
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
import stripe as stripe_lib
from pytest_mock import MockerFixture
from structlog.testing import capture_logs

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

    async def test_an_upgrade_opens_simeon_s_own_confirm_page(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """27 October 2026: no longer Stripe's portal, which changed plans
        without the unused time and downgraded at once, but a page of the
        API's that says what the change costs, makes it, and goes back to
        the app."""
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        current = stripe_subscription(user, status="active")
        await plans.apply_stripe_subscription(session, current)
        mocker.patch(
            "simeon.plans.service.stripe_billing.price_by_lookup_key",
            new=AsyncMock(
                return_value=stripe_lib.Price.construct_from({"id": "price_pro"}, None)
            ),
        )
        portal = mocker.patch(
            "simeon.plans.service.stripe_billing.create_portal_session", new=AsyncMock()
        )
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/portal",
            json={"flow": "update_confirm", "tier": "pro", "back": "simeon"},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200, response.text
        portal.assert_not_awaited()
        url = response.json()["data"]["portalUrl"]
        assert url.startswith(
            settings.generate_external_url("/desktop/billing/change?t=")
        )

        mocker.patch(
            "simeon.plans.service.stripe_billing.preview_invoice",
            new=AsyncMock(
                return_value=stripe_lib.Invoice.construct_from(
                    {
                        "amount_due": 7700,
                        "currency": "usd",
                        "lines": {"data": [{"amount": -2300}, {"amount": 10000}]},
                    },
                    None,
                )
            ),
        )
        page = await client.get(url)
        assert page.status_code == 200
        assert "Upgrade to Pro" in page.text
        assert "$77" in page.text
        assert "$100 a month" in page.text
        token = url.split("t=", 1)[1]

        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_subscription",
            new=AsyncMock(return_value=current),
        )
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription",
            new=AsyncMock(
                return_value=stripe_subscription(user, status="active", tier="pro")
            ),
        )
        done = await client.post(
            "/desktop/billing/change",
            data={"t": token},
        )
        assert done.status_code == 200
        assert "You're on Pro" in html.unescape(done.text)
        assert "simeon://app/v1/open" in done.text
        assert modify.await_args.kwargs["billing_cycle_anchor"] == "now"

    async def test_stripe_refusing_the_preview_says_so_on_the_page(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """28 October 2026: Upgrade to Pro opened a bare "Internal Server
        Error". Stripe refusing the preview is now a page that says nothing
        changed, and the log says what Stripe said."""
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
        mocker.patch(
            "simeon.plans.service.stripe_billing.preview_invoice",
            new=AsyncMock(
                side_effect=stripe_lib.InvalidRequestError(
                    "This customer has no address.", "customer"
                )
            ),
        )
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/portal",
            json={"flow": "update_confirm", "tier": "pro", "back": "simeon"},
            headers={"Authorization": f"Bearer {access}"},
        )
        url = response.json()["data"]["portalUrl"]
        with capture_logs() as logs:
            page = await client.get(url)
        assert page.status_code == 200
        assert "nothing changed" in html.unescape(page.text)
        line = next(
            entry
            for entry in logs
            if entry["event"] == "plans.change.preview_stripe_failed"
        )
        assert line["error"] == "InvalidRequestError"
        assert "no address" in line["message"]

    async def test_an_expired_page_changes_nothing(
        self, client: httpx.AsyncClient
    ) -> None:
        page = await client.get("/desktop/billing/change?t=not-a-token")
        assert "That link has expired" in page.text
        done = await client.post("/desktop/billing/change", data={"t": "x"})
        assert "That link has expired" in done.text

    async def test_extra_credits_go_through_stripe_s_checkout(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        mocker.patch("simeon.desktop.allowance.settings.DESKTOP_BILLING_REQUIRED", True)
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        mocker.patch(
            "simeon.plans.credits.stripe_billing.price_by_lookup_key",
            new=AsyncMock(
                return_value=stripe_lib.Price.construct_from({"id": "price_c"}, None)
            ),
        )
        create = mocker.patch(
            "simeon.plans.credits.stripe_billing.create_checkout_session",
            new=AsyncMock(
                return_value=stripe_lib.checkout.Session.construct_from(
                    {"id": "cs_1", "url": "https://checkout.stripe.com/c/1"}, None
                )
            ),
        )
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/billing/portal",
            json={"flow": "credits", "back": "simeon-ios"},
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["portalUrl"] == "https://checkout.stripe.com/c/1"
        success = create.await_args.kwargs["success_url"]
        assert "/desktop/billing/credits/done?to=simeon-ios&" in success
        assert success.endswith("checkout_session_id={CHECKOUT_SESSION_ID}")

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
