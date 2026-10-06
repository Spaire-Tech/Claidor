"""Settings' plan, over the desktop API (`/desktop/api/user/billing`)."""

from unittest.mock import AsyncMock

import httpx
import pytest
import stripe as stripe_lib
from pytest_mock import MockerFixture

from simeon.models import User
from simeon.postgres import AsyncSession
from tests.desktop.test_allowance import _person_with_plan
from tests.desktop.test_endpoints import _signed_in
from tests.fixtures.database import SaveFixture


@pytest.mark.asyncio
class TestDesktopBilling:
    async def test_a_free_month_has_nothing_to_manage(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        access, _ = await _signed_in(client, session, user)
        response = await client.get(
            "/desktop/api/user/billing",
            headers={"Authorization": f"Bearer {access}"},
        )
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["status"] == "free"
        assert data["tier"] == "unmanaged"
        assert data["plan_name"] == "Free"
        assert data["can_change_plan"] is False
        assert data["can_open_portal"] is False

    async def test_a_plan_is_the_one_settings_shows(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(save_fixture, mocker, user, tier="pro", status="active")
        access, _ = await _signed_in(client, session, user)
        response = await client.get(
            "/desktop/api/user/billing",
            headers={"Authorization": f"Bearer {access}"},
        )
        data = response.json()["data"]
        assert data["tier"] == "pro"
        assert data["plan_name"] == "Pro"
        assert data["status"] == "active"
        assert data["billing_interval"] == "month"
        assert data["can_change_plan"] is True
        assert data["weekly_credits"] == 2_500_000
        assert data["trial_cancelable"] is False

    async def test_without_a_customer_the_portal_refuses(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
        access, _ = await _signed_in(client, session, user)
        response = await client.post(
            "/desktop/api/user/billing/portal",
            headers={"Authorization": f"Bearer {access}"},
            json={},
        )
        assert response.status_code == 404
        assert response.json()["code"] == 404

    async def test_update_opens_the_portal_on_the_subscription(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        save_fixture: SaveFixture,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(
            save_fixture, mocker, user, tier="standard", status="active"
        )
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")
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
            "/desktop/api/user/billing/portal",
            headers={"Authorization": f"Bearer {access}"},
            json={"flow": "update"},
        )
        assert response.status_code == 200
        assert response.json()["data"]["portal_url"] == "https://billing.stripe.com/p/1"
        assert create.await_args.kwargs["flow_data"]["type"] == "subscription_update"
        assert (
            create.await_args.kwargs["flow_data"]["subscription_update"]["subscription"]
            == "sub_test"
        )

    async def test_anonymous_is_refused(self, client: httpx.AsyncClient) -> None:
        response = await client.get("/desktop/api/user/billing")
        assert response.status_code == 401
