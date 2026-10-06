"""Simeon's plans on Stripe Billing (`simeon/plans/service.py`): the copy
a webhook writes, the one-trial-per-card rule, Checkout, the Portal and
the usage reporter. Stripe itself is one object
(`simeon.plans.service.stripe_billing`), replaced here."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest
import stripe as stripe_lib
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop.allowance import resolve_allowance
from simeon.entitlements.tiers import TierKey
from simeon.kit.utils import utc_now
from simeon.models import DesktopUsage, SandBox, User
from simeon.plans.catalog import lookup_key, parse_lookup_key, prices, yearly_cents
from simeon.plans.repository import (
    DesktopSubscriptionRepository,
    DesktopTrialRedemptionRepository,
)
from simeon.plans.service import (
    AlreadySubscribed,
    CheckoutNotYours,
    NoSubscription,
    allowed_return_url,
    plans,
)
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_user


def stripe_subscription(
    user: User,
    *,
    status: str = "trialing",
    tier: str = "standard",
    interval: str = "month",
    subscription_id: str = "sub_test",
    customer_id: str = "cus_test",
    cancel_at_period_end: bool = False,
    fingerprint: str | None = "fp_card_1",
    with_metadata: bool = True,
    trial_days_left: int = 7,
) -> stripe_lib.Subscription:
    """A subscription as Stripe's 2025+ API versions send it: the period
    on the item, the payment method expanded."""
    now = utc_now()
    key = lookup_key(TierKey(tier), interval)  # type: ignore[arg-type]
    data: dict[str, Any] = {
        "id": subscription_id,
        "object": "subscription",
        "customer": customer_id,
        "status": status,
        "cancel_at_period_end": cancel_at_period_end,
        "canceled_at": None,
        "metadata": (
            {"simeon_user_id": str(user.id), "simeon_tier": tier}
            if with_metadata
            else {}
        ),
        "items": {
            "object": "list",
            "data": [
                {
                    "id": "si_test",
                    "object": "subscription_item",
                    "current_period_start": int((now - timedelta(days=1)).timestamp()),
                    "current_period_end": int((now + timedelta(days=29)).timestamp()),
                    "price": {
                        "id": "price_test",
                        "object": "price",
                        "lookup_key": key,
                        "recurring": {"interval": interval},
                    },
                }
            ],
        },
        "default_payment_method": (
            {
                "id": "pm_test",
                "object": "payment_method",
                "type": "card",
                "card": {"fingerprint": fingerprint, "last4": "4242"},
            }
            if fingerprint
            else None
        ),
    }
    if status == "trialing":
        data["trial_start"] = int(
            (now - timedelta(days=7 - trial_days_left)).timestamp()
        )
        data["trial_end"] = int((now + timedelta(days=trial_days_left)).timestamp())
    else:
        data["trial_start"] = None
        data["trial_end"] = None
    return stripe_lib.Subscription.construct_from(data, None)


@pytest.fixture
def billing(mocker: MockerFixture) -> None:
    mocker.patch("simeon.desktop.allowance.settings.DESKTOP_BILLING_REQUIRED", True)
    mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "sk_test_x")


class TestCatalog:
    def test_six_prices_with_yearly_at_twenty_percent_off(self) -> None:
        keys = [price.lookup_key for price in prices()]
        assert keys == [
            "simeon_standard_month",
            "simeon_standard_year",
            "simeon_pro_month",
            "simeon_pro_year",
            "simeon_max_month",
            "simeon_max_year",
        ]
        amounts = {price.lookup_key: price.unit_amount for price in prices()}
        assert amounts["simeon_standard_month"] == 2000
        assert amounts["simeon_standard_year"] == 19200
        assert amounts["simeon_pro_year"] == 57600
        assert amounts["simeon_max_year"] == 192000
        assert yearly_cents(2000) == 19200

    def test_lookup_keys_round_trip(self) -> None:
        parsed = parse_lookup_key("simeon_pro_year")
        assert parsed is not None
        assert parsed[0].value == "pro"
        assert parsed[1] == "year"
        assert parse_lookup_key("simeon_studio_month") is None
        assert parse_lookup_key("something_else") is None
        assert parse_lookup_key(None) is None


class TestReturnUrls:
    def test_a_path_becomes_the_web_app_s(self) -> None:
        assert allowed_return_url("/billing?x=1") == settings.generate_frontend_url(
            "/billing?x=1"
        )

    def test_the_api_s_own_sign_in_page_is_allowed(self) -> None:
        url = settings.generate_external_url("/loginDeepControl?uuid=1")
        assert allowed_return_url(url) == url

    def test_anything_else_is_dropped(self) -> None:
        assert allowed_return_url("https://evil.example/x") is None
        assert allowed_return_url("//evil.example/x") is None
        assert allowed_return_url("javascript:alert(1)") is None
        assert allowed_return_url("") is None


@pytest.mark.asyncio
class TestApplyStripeSubscription:
    async def test_a_webhook_writes_the_copy_and_the_allowance_reads_it(
        self, session: AsyncSession, user: User, billing: None, mocker: MockerFixture
    ) -> None:
        row = await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="trialing", tier="pro")
        )
        assert row is not None
        assert row.user_id == user.id
        assert row.status == "trialing"
        assert row.tier == "pro"
        assert row.billing_interval == "month"
        assert row.current_period_end is not None
        assert row.trial_end is not None
        assert row.raw["id"] == "sub_test"
        assert user.stripe_customer_id == "cus_test"

        allowance = await resolve_allowance(session, user)
        assert allowance.trialing
        assert allowance.plan_name == "Pro"
        assert allowance.credits_limit == 1_000_000
        assert allowance.period_end == row.trial_end

    async def test_the_first_trial_records_the_card(
        self, session: AsyncSession, user: User, billing: None
    ) -> None:
        await plans.apply_stripe_subscription(session, stripe_subscription(user))
        redemption = await DesktopTrialRedemptionRepository.from_session(
            session
        ).get_for_user(user.id)
        assert redemption is not None
        assert redemption.payment_method_fingerprint == "fp_card_1"
        assert redemption.email == user.email

    async def test_a_second_trial_on_the_same_card_is_ended_at_once(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        billing: None,
        mocker: MockerFixture,
    ) -> None:
        """Checkout cannot refuse a card by its fingerprint; the server
        ends the trial the moment it sees it, so the card is charged at
        once instead of getting a second free week."""
        first = await create_user(save_fixture)
        await plans.apply_stripe_subscription(
            session,
            stripe_subscription(
                first, subscription_id="sub_first", customer_id="cus_first"
            ),
        )
        ended = stripe_subscription(user, status="active", subscription_id="sub_second")
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription",
            new=AsyncMock(return_value=ended),
        )
        row = await plans.apply_stripe_subscription(
            session, stripe_subscription(user, subscription_id="sub_second")
        )
        modify.assert_awaited_once_with("sub_second", trial_end="now")
        assert row is not None
        assert row.status == "active"
        assert row.trial_checked_at is not None
        # The second person gets no redemption of their own: the card's is
        # the first person's.
        mine = await DesktopTrialRedemptionRepository.from_session(
            session
        ).get_for_user(user.id)
        assert mine is None

    async def test_the_card_is_checked_once(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        billing: None,
        mocker: MockerFixture,
    ) -> None:
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription",
            new=AsyncMock(),
        )
        await plans.apply_stripe_subscription(session, stripe_subscription(user))
        await plans.apply_stripe_subscription(session, stripe_subscription(user))
        modify.assert_not_awaited()

    async def test_a_dead_subscription_cannot_overwrite_a_live_one(
        self, session: AsyncSession, user: User, billing: None
    ) -> None:
        """The person cancelled and re-subscribed; the old one's final
        `deleted` event arrives after the new one's `created`."""
        await plans.apply_stripe_subscription(
            session,
            stripe_subscription(user, status="active", subscription_id="sub_new"),
        )
        row = await plans.apply_stripe_subscription(
            session,
            stripe_subscription(user, status="canceled", subscription_id="sub_old"),
        )
        assert row is not None
        assert row.stripe_subscription_id == "sub_new"
        assert row.status == "active"

    async def test_a_cancellation_closes_the_allowance(
        self, session: AsyncSession, user: User, billing: None
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="canceled")
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.none
        assert allowance.credits_limit == 0

    async def test_the_person_is_found_by_customer_when_metadata_is_missing(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        billing: None,
    ) -> None:
        """A subscription made in the Stripe dashboard carries no
        metadata; the customer on the user row finds the person."""
        person = await create_user(save_fixture, stripe_customer_id="cus_dash")
        row = await plans.apply_stripe_subscription(
            session,
            stripe_subscription(
                person, with_metadata=False, customer_id="cus_dash", status="active"
            ),
        )
        assert row is not None
        assert row.user_id == person.id

    async def test_nobody_s_subscription_is_ignored(
        self, session: AsyncSession, user: User, billing: None
    ) -> None:
        stranger = User(id=uuid.uuid4(), email="nobody@example.com")
        row = await plans.apply_stripe_subscription(
            session, stripe_subscription(stranger, customer_id="cus_unknown")
        )
        assert row is None


@pytest.mark.asyncio
class TestCheckout:
    async def test_a_first_plan_gets_the_trial(
        self, session: AsyncSession, user: User, billing: None, mocker: MockerFixture
    ) -> None:
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
        create = mocker.patch(
            "simeon.plans.service.stripe_billing.create_checkout_session",
            new=AsyncMock(
                return_value=stripe_lib.checkout.Session.construct_from(
                    {"id": "cs_1", "url": "https://checkout.stripe.com/c/cs_1"}, None
                )
            ),
        )
        url = await plans.create_checkout(
            session, user, tier=TierKey.pro, interval="year", success_url="/billing?x=1"
        )
        assert url == "https://checkout.stripe.com/c/cs_1"
        assert user.stripe_customer_id == "cus_new"
        params = create.await_args.kwargs
        assert params["mode"] == "subscription"
        assert params["customer"] == "cus_new"
        assert params["client_reference_id"] == str(user.id)
        assert params["line_items"] == [{"price": "price_1", "quantity": 1}]
        assert params["payment_method_collection"] == "always"
        assert params["subscription_data"]["trial_period_days"] == 7
        assert params["subscription_data"]["metadata"]["simeon_tier"] == "pro"
        assert params["success_url"].startswith(
            settings.generate_frontend_url("/billing?x=1")
        )
        assert params["success_url"].endswith(
            "checkout_session_id={CHECKOUT_SESSION_ID}"
        )

    async def test_a_second_plan_gets_no_trial(
        self, session: AsyncSession, user: User, billing: None, mocker: MockerFixture
    ) -> None:
        """The trial was redeemed once (the row the first trial wrote);
        the next plan is charged at once."""
        await plans.apply_stripe_subscription(session, stripe_subscription(user))
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="canceled")
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.price_by_lookup_key",
            new=AsyncMock(
                return_value=stripe_lib.Price.construct_from({"id": "price_1"}, None)
            ),
        )
        create = mocker.patch(
            "simeon.plans.service.stripe_billing.create_checkout_session",
            new=AsyncMock(
                return_value=stripe_lib.checkout.Session.construct_from(
                    {"id": "cs_2", "url": "https://checkout.stripe.com/c/cs_2"}, None
                )
            ),
        )
        await plans.create_checkout(session, user, tier=TierKey.standard)
        params = create.await_args.kwargs
        assert "trial_period_days" not in params["subscription_data"]
        assert params["customer"] == "cus_test"

    async def test_a_live_plan_refuses_a_second_checkout(
        self, session: AsyncSession, user: User, billing: None
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        with pytest.raises(AlreadySubscribed):
            await plans.create_checkout(session, user, tier=TierKey.pro)

    async def test_syncing_a_checkout_copies_its_subscription_in(
        self, session: AsyncSession, user: User, billing: None, mocker: MockerFixture
    ) -> None:
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_checkout_session",
            new=AsyncMock(
                return_value={
                    "client_reference_id": str(user.id),
                    "subscription": stripe_subscription(user, status="trialing"),
                }
            ),
        )
        row = await plans.sync_checkout_session(session, user, "cs_1")
        assert row is not None
        assert row.status == "trialing"

    async def test_someone_else_s_checkout_is_refused(
        self, session: AsyncSession, user: User, billing: None, mocker: MockerFixture
    ) -> None:
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_checkout_session",
            new=AsyncMock(return_value={"client_reference_id": str(uuid.uuid4())}),
        )
        with pytest.raises(CheckoutNotYours):
            await plans.sync_checkout_session(session, user, "cs_1")


@pytest.mark.asyncio
class TestPortal:
    async def test_without_a_customer_there_is_no_portal(
        self, session: AsyncSession, user: User, billing: None
    ) -> None:
        with pytest.raises(NoSubscription):
            await plans.create_portal(session, user)

    async def test_the_cancel_flow_names_the_subscription(
        self, session: AsyncSession, user: User, billing: None, mocker: MockerFixture
    ) -> None:
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
        url = await plans.create_portal(session, user, flow="cancel")
        assert url == "https://billing.stripe.com/p/1"
        params = create.await_args.kwargs
        assert params["customer"] == "cus_test"
        assert params["flow_data"] == {
            "type": "subscription_cancel",
            "subscription_cancel": {"subscription": "sub_test"},
        }
        assert params["return_url"] == settings.generate_frontend_url("/billing")


@pytest.mark.asyncio
class TestCancelTrial:
    async def test_a_trial_is_scheduled_to_end(
        self, session: AsyncSession, user: User, billing: None, mocker: MockerFixture
    ) -> None:
        await plans.apply_stripe_subscription(session, stripe_subscription(user))
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription",
            new=AsyncMock(
                return_value=stripe_subscription(user, cancel_at_period_end=True)
            ),
        )
        assert await plans.cancel_trial(session, user)
        modify.assert_awaited_once_with("sub_test", cancel_at_period_end=True)
        row = await plans.subscription_of(session, user)
        assert row is not None
        assert row.cancel_at_period_end
        allowance = await resolve_allowance(session, user)
        assert allowance.trialing
        assert not allowance.trial_cancelable

    async def test_without_a_trial_there_is_nothing_to_cancel(
        self, session: AsyncSession, user: User, billing: None, mocker: MockerFixture
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription", new=AsyncMock()
        )
        assert not await plans.cancel_trial(session, user)
        modify.assert_not_awaited()


@pytest.mark.asyncio
class TestReportUsage:
    async def test_credits_go_to_the_meter_once(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        billing: None,
        mocker: MockerFixture,
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        for credits, status in ((100_000, 200), (50_000, 200), (999, 500)):
            await save_fixture(
                DesktopUsage(
                    user_id=user.id,
                    model="gpt-6-sol",
                    credits=credits if status == 200 else 0,
                    upstream_status=status,
                )
            )
        meter = mocker.patch(
            "simeon.plans.service.stripe_billing.create_meter_event", new=AsyncMock()
        )
        now = utc_now() + timedelta(seconds=1)
        counts = await plans.report_usage(session, now=now)
        assert counts["credit_events"] == 1
        params = meter.await_args.kwargs
        assert params["event_name"] == "simeon_credits"
        assert params["customer_id"] == "cus_test"
        assert params["value"] == 150_000
        assert params["identifier"].startswith(f"credits:{user.id}:")

        meter.reset_mock()
        counts = await plans.report_usage(session, now=now + timedelta(minutes=5))
        assert counts["credit_events"] == 0
        meter.assert_not_awaited()

    async def test_a_failed_call_is_retried_next_run(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        billing: None,
        mocker: MockerFixture,
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        await save_fixture(
            DesktopUsage(
                user_id=user.id, model="gpt-6-sol", credits=10, upstream_status=200
            )
        )
        meter = mocker.patch(
            "simeon.plans.service.stripe_billing.create_meter_event",
            new=AsyncMock(side_effect=[RuntimeError("stripe down"), None]),
        )
        now = utc_now() + timedelta(seconds=1)
        counts = await plans.report_usage(session, now=now)
        assert counts["credit_events"] == 0
        counts = await plans.report_usage(session, now=now + timedelta(minutes=5))
        assert counts["credit_events"] == 1
        assert meter.await_count == 2

    async def test_a_person_without_a_customer_is_skipped(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        billing: None,
        mocker: MockerFixture,
    ) -> None:
        await save_fixture(
            DesktopUsage(
                user_id=user.id, model="gpt-6-sol", credits=10, upstream_status=200
            )
        )
        meter = mocker.patch(
            "simeon.plans.service.stripe_billing.create_meter_event", new=AsyncMock()
        )
        counts = await plans.report_usage(session, now=utc_now() + timedelta(seconds=1))
        assert counts["skipped"] == 1
        meter.assert_not_awaited()

    async def test_a_running_box_s_seconds_go_to_the_meter(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        billing: None,
        mocker: MockerFixture,
    ) -> None:
        await plans.apply_stripe_subscription(
            session, stripe_subscription(user, status="active")
        )
        started = utc_now() - timedelta(minutes=10)
        box = SandBox(
            user_id=user.id,
            provider="docker",
            provider_box_id="c",
            host_address="127.0.0.1",
            ports={},
            gateway_token="g",
            network_token="n",
            state="running",
            last_ensured_at=started,
        )
        await save_fixture(box)
        meter = mocker.patch(
            "simeon.plans.service.stripe_billing.create_meter_event", new=AsyncMock()
        )
        now = utc_now()
        counts = await plans.report_usage(session, now=now)
        assert counts["box_events"] == 1
        params = meter.await_args.kwargs
        assert params["event_name"] == "simeon_box_seconds"
        assert 590 <= params["value"] <= 610
        assert params["identifier"].startswith(f"box:{box.id}:")
        assert box.usage_metered_at == now

        # Hibernated two minutes later: the two minutes, then nothing.
        box.state = "hibernated"
        box.hibernated_at = now + timedelta(minutes=2)
        await save_fixture(box)
        meter.reset_mock()
        counts = await plans.report_usage(session, now=now + timedelta(minutes=5))
        assert counts["box_events"] == 1
        assert meter.await_args.kwargs["value"] == 120
        meter.reset_mock()
        counts = await plans.report_usage(session, now=now + timedelta(minutes=10))
        assert counts["box_events"] == 0
        meter.assert_not_awaited()

    async def test_without_a_key_nothing_is_sent(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        mocker.patch("simeon.plans.service.settings.STRIPE_SECRET_KEY", "")
        meter = mocker.patch(
            "simeon.plans.service.stripe_billing.create_meter_event", new=AsyncMock()
        )
        counts = await plans.report_usage(session)
        assert counts == {"credit_events": 0, "box_events": 0, "skipped": 0}
        meter.assert_not_awaited()


@pytest.mark.asyncio
class TestRepository:
    async def test_customer_ids_prefer_the_subscription_s(
        self, session: AsyncSession, save_fixture: SaveFixture, billing: None
    ) -> None:
        a = await create_user(save_fixture, stripe_customer_id="cus_a_user")
        b = await create_user(save_fixture)
        await plans.apply_stripe_subscription(
            session, stripe_subscription(b, customer_id="cus_b_sub", status="active")
        )
        found = await DesktopSubscriptionRepository.from_session(
            session
        ).customer_ids_by_user([a.id, b.id, uuid.uuid4()])
        assert found == {a.id: "cus_a_user", b.id: "cus_b_sub"}
