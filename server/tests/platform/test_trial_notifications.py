"""Unit tests for the platform trial-reminder scheduling logic.

The marker selection (`_due_marker`) had a bug where iterating the reminder
days in descending order made every run resolve to the 7-day marker, so the
T-2 and T-0 reminders never fired. These tests lock in the corrected
ascending behavior.

The integration tests below lock in the send/skip semantics: markers are
NOT stamped when no recipient can be resolved (so the next run retries
instead of silently swallowing a charge warning forever), and canceled or
legacy card-less trials never receive "your card will be charged" copy.
"""

from datetime import UTC, datetime, timedelta

import pytest
from pytest_mock import MockerFixture

from polar.enums import SubscriptionRecurringInterval
from polar.models.subscription import SubscriptionStatus
from polar.platform.trial_notifications import (
    _REMINDER_DAYS,
    _due_marker,
    check_pending_trial_reminders,
)
from polar.postgres import AsyncSession
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import (
    create_customer,
    create_organization,
    create_product,
    create_subscription,
)


class TestDueMarker:
    def test_more_than_seven_days_out_is_not_due(self) -> None:
        assert _due_marker(14) is None
        assert _due_marker(8) is None

    def test_seven_day_window_fires_seven(self) -> None:
        assert _due_marker(7) == 7
        assert _due_marker(6) == 7
        assert _due_marker(3) == 7

    def test_two_day_window_fires_two(self) -> None:
        assert _due_marker(2) == 2
        assert _due_marker(1) == 2

    def test_last_day_fires_zero(self) -> None:
        assert _due_marker(0) == 0

    def test_expired_is_not_due(self) -> None:
        assert _due_marker(-1) is None
        assert _due_marker(-5) is None

    def test_every_reminder_day_is_reachable(self) -> None:
        # Regression guard: each configured reminder threshold must be the
        # resolved marker for at least its own days-remaining value. The
        # original descending-iteration bug made 2 and 0 unreachable.
        for marker in _REMINDER_DAYS:
            assert _due_marker(marker) == marker

    def test_reminder_days_are_ascending(self) -> None:
        # _due_marker relies on ascending order to return the most-urgent
        # (smallest) reached threshold.
        assert list(_REMINDER_DAYS) == sorted(_REMINDER_DAYS)


async def _trialing_setup(
    save_fixture: SaveFixture,
    mocker: MockerFixture,
    *,
    days_remaining: int = 2,
    cancel_at_period_end: bool = False,
    managed_by_trial: bool = False,
):
    platform_org = await create_organization(save_fixture)
    mocker.patch("polar.platform.service.settings.PLATFORM_ORG_ID", platform_org.id)
    product = await create_product(
        save_fixture,
        organization=platform_org,
        recurring_interval=SubscriptionRecurringInterval.month,
        prices=[(4900, "usd")],
    )
    product.user_metadata = {"tier": "starter"}
    await save_fixture(product)
    creator = await create_organization(save_fixture)
    customer = await create_customer(
        save_fixture,
        organization=platform_org,
        email="creator@example.com",
        user_metadata={"creator_org_id": str(creator.id)},
    )
    trial_end = datetime.now(UTC) + timedelta(days=days_remaining, hours=6)
    metadata = {"managed_by": "trial"} if managed_by_trial else {}
    subscription = await create_subscription(
        save_fixture,
        product=product,
        customer=customer,
        status=SubscriptionStatus.trialing,
        trial_end=trial_end,
        current_period_end=trial_end,
        cancel_at_period_end=cancel_at_period_end,
        user_metadata=metadata,
    )
    return creator, subscription


@pytest.mark.asyncio
class TestCheckPendingTrialReminders:
    async def test_no_recipient_does_not_stamp_marker(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        _, subscription = await _trialing_setup(save_fixture, mocker)
        mocker.patch(
            "polar.platform.trial_notifications.resolve_billing_contact_email",
            return_value=None,
        )
        enqueue = mocker.patch("polar.platform.trial_notifications.enqueue_email")

        counters = await check_pending_trial_reminders(session)

        assert counters["sent"] == 0
        enqueue.assert_not_called()
        await session.refresh(subscription)
        # Crucial: the marker must NOT be stamped, so the next daily run
        # retries once the org has a resolvable member.
        assert not (subscription.user_metadata or {}).get("trial_reminders_sent")

    async def test_recipient_resolved_sends_and_stamps(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        _, subscription = await _trialing_setup(save_fixture, mocker)
        mocker.patch(
            "polar.platform.trial_notifications.resolve_billing_contact_email",
            return_value="founder@example.com",
        )
        enqueue = mocker.patch("polar.platform.trial_notifications.enqueue_email")

        counters = await check_pending_trial_reminders(session)

        assert counters["sent"] == 1
        enqueue.assert_called_once()
        assert enqueue.call_args.kwargs["to_email_addr"] == "founder@example.com"
        await session.refresh(subscription)
        assert (subscription.user_metadata or {}).get("trial_reminders_sent") == "2"

    async def test_canceled_trial_is_skipped(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        await _trialing_setup(save_fixture, mocker, cancel_at_period_end=True)
        enqueue = mocker.patch("polar.platform.trial_notifications.enqueue_email")

        counters = await check_pending_trial_reminders(session)

        # "Your card will be charged" copy must never reach someone who
        # already canceled.
        assert counters["canceled_skipped"] == 1
        enqueue.assert_not_called()

    async def test_legacy_cardless_trial_is_skipped(
        self,
        mocker: MockerFixture,
        session: AsyncSession,
        save_fixture: SaveFixture,
    ) -> None:
        await _trialing_setup(save_fixture, mocker, managed_by_trial=True)
        enqueue = mocker.patch("polar.platform.trial_notifications.enqueue_email")

        counters = await check_pending_trial_reminders(session)

        assert counters["legacy_skipped"] == 1
        enqueue.assert_not_called()
