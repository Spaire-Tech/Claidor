"""The billing page on the API host (`simeon/desktop/billing_page.py`):
what the Mac app's upgrade button, the sign-in gate and the window's
access cover open. Stripe is a fake; the page's words and redirects are
what is read."""

from __future__ import annotations

from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import stripe as stripe_lib
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.models import User
from simeon.plans.service import plans
from simeon.postgres import AsyncSession
from tests.desktop.test_allowance import _person_with_plan, billing_on
from tests.plans.test_service import stripe_subscription

ORIGIN = {"Origin": settings.generate_external_url("/").rstrip("/")}


def _checkout_fakes(mocker: MockerFixture) -> AsyncMock:
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
    return mocker.patch(
        "simeon.plans.service.stripe_billing.create_checkout_session",
        new=AsyncMock(
            return_value=stripe_lib.checkout.Session.construct_from(
                {"id": "cs_1", "url": "https://checkout.stripe.com/c/cs_1"}, None
            )
        ),
    )


@pytest.mark.asyncio
class TestBillingPage:
    async def test_anonymous_is_sent_to_the_api_s_own_sign_in_and_back(
        self, client: httpx.AsyncClient
    ) -> None:
        """No web app in the way: the API's Google sign-in, returning here
        with the plan the link named."""
        response = await client.get("/billing", params={"plan": "pro"})
        assert response.status_code == 303
        location = urlparse(response.headers["location"])
        assert location.path.endswith("/integrations/google/login/authorize")
        back = parse_qs(location.query)["return_to"][0]
        assert back.startswith(settings.generate_external_url("/billing?"))
        assert "plan=pro" in back

    @pytest.mark.auth
    async def test_the_three_plans_with_their_prices(
        self, client: httpx.AsyncClient
    ) -> None:
        response = await client.get("/billing")
        assert response.status_code == 200
        text = response.text
        for name, price in (("Standard", "$20"), ("Pro", "$60"), ("Max", "$200")):
            assert f"Simeon {name}" in text
            assert price in text
        assert "$192/year" in text
        assert 'action="/billing/checkout"' in text
        assert "does not require a plan yet" in text

    @pytest.mark.auth
    async def test_the_sign_in_gate_s_way_back_is_kept_and_explained(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        billing_on(mocker)
        back = settings.generate_external_url("/loginDeepControl?uuid=1&challenge=2")
        response = await client.get("/billing", params={"return_to": back})
        assert response.status_code == 200
        assert "One step before you sign in" in response.text
        assert 'name="return_to"' in response.text
        assert "does not require a plan" not in response.text

    @pytest.mark.auth
    async def test_choosing_a_plan_opens_checkout_that_returns_to_the_sign_in(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        create = _checkout_fakes(mocker)
        back = settings.generate_external_url("/loginDeepControl?uuid=1&challenge=2")
        response = await client.post(
            "/billing/checkout",
            data={"tier": "pro", "interval": "year", "return_to": back},
            headers=ORIGIN,
        )
        assert response.status_code == 303, response.text
        assert response.headers["location"] == "https://checkout.stripe.com/c/cs_1"
        params = create.await_args.kwargs
        assert params["success_url"].startswith(back)
        assert params["success_url"].endswith(
            "checkout_session_id={CHECKOUT_SESSION_ID}"
        )
        assert params["line_items"] == [{"price": "price_1", "quantity": 1}]
        assert params["subscription_data"]["metadata"]["simeon_tier"] == "pro"

    @pytest.mark.auth
    async def test_without_a_way_back_checkout_returns_here_as_done(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        create = _checkout_fakes(mocker)
        response = await client.post(
            "/billing/checkout", data={"tier": "standard"}, headers=ORIGIN
        )
        assert response.status_code == 303, response.text
        success = create.await_args.kwargs["success_url"]
        assert success.startswith(settings.generate_external_url("/billing?done=1"))

    @pytest.mark.auth
    async def test_a_cross_site_post_or_a_bad_plan_does_nothing(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        create = _checkout_fakes(mocker)
        other = await client.post(
            "/billing/checkout",
            data={"tier": "pro"},
            headers={"Origin": "https://evil.example"},
        )
        assert other.status_code == 200
        assert "did not work" in other.text
        bad = await client.post(
            "/billing/checkout", data={"tier": "ultra"}, headers=ORIGIN
        )
        assert "did not work" in bad.text
        create.assert_not_awaited()

    @pytest.mark.auth
    async def test_without_a_stripe_key_the_page_says_so(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "")
        response = await client.post(
            "/billing/checkout", data={"tier": "standard"}, headers=ORIGIN
        )
        assert response.status_code == 200
        assert "not configured" in response.text

    @pytest.mark.auth
    async def test_back_from_checkout_the_plan_is_copied_in_and_shown(
        self, client: httpx.AsyncClient, user: User, mocker: MockerFixture
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_checkout_session",
            new=AsyncMock(
                return_value={
                    "client_reference_id": str(user.id),
                    "subscription": stripe_subscription(user, status="trialing"),
                }
            ),
        )
        response = await client.get(
            "/billing", params={"checkout_session_id": "cs_1", "done": "1"}
        )
        assert response.status_code == 200
        text = response.text
        assert "Your card is saved" in text
        assert "Your plan: Simeon Standard, on trial" in text
        assert "Open billing on Stripe" in text
        assert "Cancel trial" in text
        assert 'action="/billing/checkout"' not in text

    @pytest.mark.auth
    async def test_with_a_plan_the_portal_opens_on_the_step_asked(
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
        await session.flush()
        portal = mocker.patch(
            "simeon.plans.service.stripe_billing.create_portal_session",
            new=AsyncMock(
                return_value=stripe_lib.billing_portal.Session.construct_from(
                    {"id": "bps_1", "url": "https://billing.stripe.com/p/1"}, None
                )
            ),
        )
        response = await client.post(
            "/billing/portal", data={"flow": "cancel"}, headers=ORIGIN
        )
        assert response.status_code == 303, response.text
        assert response.headers["location"] == "https://billing.stripe.com/p/1"
        params = portal.await_args.kwargs
        assert params["flow_data"]["type"] == "subscription_cancel"
        assert params["return_url"].startswith(
            settings.generate_external_url("/billing")
        )

    @pytest.mark.auth
    async def test_the_sign_in_gate_sends_people_to_this_page(
        self, client: httpx.AsyncClient, mocker: MockerFixture
    ) -> None:
        """The gate on `/loginDeepControl` names this host, not a web app."""
        billing_on(mocker)
        response = await client.get(
            "/loginDeepControl",
            params={
                "challenge": "c" * 43,
                "uuid": "11111111-1111-4111-8111-111111111111",
            },
        )
        assert response.status_code == 303
        location = response.headers["location"]
        assert location.startswith(settings.generate_external_url("/billing?"))

    @pytest.mark.auth
    async def test_a_plan_from_before_is_told_to_go_back(
        self,
        client: httpx.AsyncClient,
        save_fixture,  # type: ignore[no-untyped-def]
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(save_fixture, mocker, user, tier="max", status="active")
        back = settings.generate_external_url("/loginDeepControl?uuid=1&challenge=2")
        response = await client.get("/billing", params={"return_to": back})
        assert response.status_code == 200
        assert "You have a plan" in response.text
        assert "Go back and finish signing in" in response.text
