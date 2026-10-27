"""Changing plans (27 October 2026, `PlansService.change_plan`): an upgrade
starts today and costs the new price less the old plan's unused time, a
downgrade waits for the renewal, a trial switches and goes on, and "Start
my plan now" ends a card trial. Stripe is one object, replaced here."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
import stripe as stripe_lib
from pytest_mock import MockerFixture

from simeon.desktop.allowance import resolve_allowance
from simeon.entitlements.tiers import TierKey
from simeon.kit.utils import utc_now
from simeon.models import User
from simeon.plans.service import (
    CardDeclined,
    NotTrialing,
    PaymentDue,
    SamePlan,
    plans,
)
from simeon.postgres import AsyncSession
from tests.plans.test_service import billing, stripe_subscription  # noqa: F401

PRICES = {
    "simeon_standard_month": "price_standard",
    "simeon_pro_month": "price_pro",
    "simeon_max_month": "price_max",
}


def _prices(mocker: MockerFixture) -> None:
    async def by_key(key: str) -> stripe_lib.Price:
        return stripe_lib.Price.construct_from({"id": PRICES[key]}, None)

    mocker.patch(
        "simeon.plans.service.stripe_billing.price_by_lookup_key",
        new=AsyncMock(side_effect=by_key),
    )


def _with(subscription: stripe_lib.Subscription, **changes: Any) -> Any:
    data = subscription.to_dict_recursive()
    data.update(changes)
    return stripe_lib.Subscription.construct_from(data, None)


async def _on(session: AsyncSession, user: User, **kwargs: Any) -> Any:
    subscription = stripe_subscription(user, **kwargs)
    await plans.apply_stripe_subscription(session, subscription)
    return subscription


@pytest.mark.asyncio
@pytest.mark.usefixtures("billing")
class TestUpgrade:
    async def test_the_preview_takes_off_the_unused_time(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        await _on(session, user, status="active", tier="standard")
        _prices(mocker)
        preview = mocker.patch(
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
        change = await plans.change_preview(session, user, TierKey.pro)
        assert change.kind == "upgrade"
        assert change.amount_due == 7700
        assert change.credit == 2300
        assert change.price == 10000
        assert change.proration_date is not None
        details = preview.await_args.kwargs["subscription_details"]
        assert details["billing_cycle_anchor"] == "now"
        assert details["proration_behavior"] == "always_invoice"
        assert details["items"] == [
            {"id": "si_test", "price": "price_pro", "quantity": 1}
        ]

    async def test_the_upgrade_is_charged_now_and_starts_a_fresh_week(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        current = await _on(session, user, status="active", tier="standard")
        _prices(mocker)
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_subscription",
            new=AsyncMock(return_value=current),
        )
        upgraded = _with(
            stripe_subscription(user, status="active", tier="pro"),
            latest_invoice="in_up",
        )
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription",
            new=AsyncMock(return_value=upgraded),
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_invoice",
            new=AsyncMock(
                return_value=stripe_lib.Invoice.construct_from(
                    {"id": "in_up", "amount_paid": 7700}, None
                )
            ),
        )
        at = int(utc_now().timestamp()) - 60
        change = await plans.change_plan(session, user, TierKey.pro, proration_date=at)
        assert change.kind == "upgrade"
        assert change.amount_due == 7700
        params = modify.await_args.kwargs
        assert params["billing_cycle_anchor"] == "now"
        assert params["proration_behavior"] == "always_invoice"
        assert params["payment_behavior"] == "error_if_incomplete"
        assert params["proration_date"] == at
        assert params["items"][0]["price"] == "price_pro"
        row = await plans.subscription_of(session, user)
        assert row is not None
        assert row.tier == "pro"
        allowance = await resolve_allowance(session, user)
        assert allowance.credits_limit == 35_000_000

    async def test_a_declined_card_changes_nothing(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        current = await _on(session, user, status="active", tier="standard")
        _prices(mocker)
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_subscription",
            new=AsyncMock(return_value=current),
        )
        mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription",
            new=AsyncMock(
                side_effect=stripe_lib.CardError(
                    "Your card was declined.", None, "card_declined"
                )
            ),
        )
        with pytest.raises(CardDeclined):
            await plans.change_plan(session, user, TierKey.max)
        row = await plans.subscription_of(session, user)
        assert row is not None
        assert row.tier == "standard"

    async def test_a_failed_payment_is_settled_first(
        self, session: AsyncSession, user: User
    ) -> None:
        await _on(session, user, status="past_due", tier="standard")
        with pytest.raises(PaymentDue):
            await plans.change_preview(session, user, TierKey.pro)

    async def test_the_same_plan_is_no_change(
        self, session: AsyncSession, user: User
    ) -> None:
        await _on(session, user, status="active", tier="pro")
        with pytest.raises(SamePlan):
            await plans.change_preview(session, user, TierKey.pro)


@pytest.mark.asyncio
@pytest.mark.usefixtures("billing")
class TestDowngrade:
    async def test_it_waits_for_the_renewal(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        current = await _on(session, user, status="active", tier="max")
        _prices(mocker)
        held = _with(current, schedule="sub_sched_1")
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_subscription",
            new=AsyncMock(side_effect=[current, held]),
        )
        start = int(utc_now().timestamp()) - 86400
        end = start + 30 * 86400
        mocker.patch(
            "simeon.plans.service.stripe_billing.create_schedule_from",
            new=AsyncMock(
                return_value=stripe_lib.SubscriptionSchedule.construct_from(
                    {
                        "id": "sub_sched_1",
                        "phases": [
                            {
                                "start_date": start,
                                "end_date": end,
                                "items": [{"price": "price_max", "quantity": 1}],
                            }
                        ],
                    },
                    None,
                )
            ),
        )
        modify_schedule = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_schedule",
            new=AsyncMock(return_value=None),
        )
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription", new=AsyncMock()
        )
        change = await plans.change_plan(session, user, TierKey.standard)
        assert change.kind == "downgrade"
        assert change.amount_due == 0
        modify.assert_not_awaited()
        params = modify_schedule.await_args.kwargs
        assert params["end_behavior"] == "release"
        now_phase, next_phase = params["phases"]
        assert now_phase["items"] == [{"price": "price_max", "quantity": 1}]
        assert (now_phase["start_date"], now_phase["end_date"]) == (start, end)
        assert next_phase["items"] == [{"price": "price_standard", "quantity": 1}]
        assert next_phase["duration"] == {"interval": "month", "interval_count": 1}

        row = await plans.subscription_of(session, user)
        assert row is not None
        # Max until the renewal, Standard after.
        assert row.tier == "max"
        assert row.scheduled_tier == "standard"
        assert row.scheduled_at == row.current_period_end

        # Stripe's next update still carries the schedule: it stays.
        await plans.apply_stripe_subscription(session, held)
        assert row.scheduled_tier == "standard"
        # The renewal made the move: it is cleared.
        await plans.apply_stripe_subscription(
            session,
            _with(
                stripe_subscription(user, status="active", tier="standard"),
                schedule="sub_sched_1",
            ),
        )
        assert row.tier == "standard"
        assert row.scheduled_tier is None

    async def test_keeping_the_plan_lets_the_schedule_go(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        current = await _on(session, user, status="active", tier="pro")
        row = await plans.subscription_of(session, user)
        assert row is not None
        row.scheduled_tier = "standard"
        row.scheduled_at = row.current_period_end
        _prices(mocker)
        preview = await plans.change_preview(session, user, TierKey.pro)
        assert preview.kind == "keep"
        assert preview.scheduled_tier == TierKey.standard
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_subscription",
            new=AsyncMock(return_value=_with(current, schedule="sub_sched_1")),
        )
        release = mocker.patch(
            "simeon.plans.service.stripe_billing.release_schedule", new=AsyncMock()
        )
        change = await plans.change_plan(session, user, TierKey.pro)
        assert change.kind == "keep"
        release.assert_awaited_once_with("sub_sched_1")
        assert row.scheduled_tier is None


@pytest.mark.asyncio
@pytest.mark.usefixtures("billing")
class TestTrial:
    async def test_a_trial_switches_plan_and_goes_on(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        current = await _on(session, user, status="trialing", tier="standard")
        _prices(mocker)
        mocker.patch(
            "simeon.plans.service.stripe_billing.retrieve_subscription",
            new=AsyncMock(return_value=current),
        )
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription",
            new=AsyncMock(
                return_value=stripe_subscription(user, status="trialing", tier="max")
            ),
        )
        change = await plans.change_plan(session, user, TierKey.max)
        assert change.kind == "trial"
        assert modify.await_args.kwargs["proration_behavior"] == "none"
        allowance = await resolve_allowance(session, user)
        assert allowance.trialing
        assert allowance.credits_limit == 10_000_000

    async def test_start_my_plan_now(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        await _on(session, user, status="trialing", tier="pro")
        modify = mocker.patch(
            "simeon.plans.service.stripe_billing.modify_subscription",
            new=AsyncMock(
                return_value=stripe_subscription(user, status="active", tier="pro")
            ),
        )
        change = await plans.start_now(session, user)
        assert change.kind == "start_now"
        assert change.amount_due == 10000
        params = modify.await_args.kwargs
        assert params["trial_end"] == "now"
        assert params["payment_behavior"] == "error_if_incomplete"
        allowance = await resolve_allowance(session, user)
        assert allowance.paid
        assert allowance.credits_limit == 35_000_000

    async def test_start_now_needs_a_trial(
        self, session: AsyncSession, user: User
    ) -> None:
        await _on(session, user, status="active", tier="pro")
        with pytest.raises(NotTrialing):
            await plans.start_now(session, user)
