"""What one person may spend, per plan state (`simeon/desktop/allowance.py`),
and what the app's quota route says about it."""

from datetime import UTC, datetime, timedelta

import pytest
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop.allowance import (
    STATUS_FREE,
    STATUS_NONE,
    STATUS_TRIALING,
    resolve_allowance,
    week_bounds,
)
from simeon.desktop.proxy_common import quota_exhausted_response
from simeon.desktop.service import desktop
from simeon.entitlements.tiers import tier_from_value
from simeon.kit.utils import utc_now
from simeon.models import DesktopSubscription, DesktopUsage, User
from simeon.plans.catalog import lookup_key
from simeon.postgres import AsyncSession
from tests.fixtures.database import SaveFixture


def billing_on(mocker: MockerFixture) -> None:
    """Production's setting: everyone needs a plan."""
    mocker.patch("simeon.desktop.allowance.settings.DESKTOP_BILLING_REQUIRED", True)


async def _person_with_plan(
    save_fixture: SaveFixture,
    mocker: MockerFixture,
    user: User,
    *,
    tier: str,
    status: str,
    trial_days_left: int | None = None,
    cancel_at_period_end: bool = False,
    stripe_subscription_id: str = "sub_test",
) -> DesktopSubscription:
    """Billing on, and the synced copy of a Stripe subscription on `tier`
    in `status`, as the webhook would have written it."""
    billing_on(mocker)
    now = utc_now()
    trial: dict[str, datetime] = {}
    if trial_days_left is not None:
        trial = {
            "trial_start": now - timedelta(days=7 - trial_days_left),
            "trial_end": now + timedelta(days=trial_days_left),
        }
    row = DesktopSubscription(
        user_id=user.id,
        stripe_customer_id="cus_test",
        stripe_subscription_id=stripe_subscription_id,
        status=status,
        tier=tier,
        price_lookup_key=(
            lookup_key(key, "month") if (key := tier_from_value(tier)) else None
        ),
        billing_interval="month",
        current_period_start=now - timedelta(days=3),
        current_period_end=now + timedelta(days=27),
        cancel_at_period_end=cancel_at_period_end,
        synced_at=now,
        raw={},
        **trial,
    )
    await save_fixture(row)
    return row


class TestWeekBounds:
    def test_monday_to_monday_in_utc(self) -> None:
        # Thursday 8 October 2026, 15:42 UTC.
        start, end = week_bounds(datetime(2026, 10, 8, 15, 42, tzinfo=UTC))
        assert start == datetime(2026, 10, 5, tzinfo=UTC)
        assert end == datetime(2026, 10, 12, tzinfo=UTC)

    def test_a_monday_starts_its_own_week(self) -> None:
        start, end = week_bounds(datetime(2026, 10, 5, 0, 0, tzinfo=UTC))
        assert start == datetime(2026, 10, 5, tzinfo=UTC)
        assert end == datetime(2026, 10, 12, tzinfo=UTC)

    def test_sunday_night_is_still_last_week(self) -> None:
        start, _ = week_bounds(datetime(2026, 10, 11, 23, 59, tzinfo=UTC))
        assert start == datetime(2026, 10, 5, tzinfo=UTC)


@pytest.mark.asyncio
class TestResolveAllowance:
    async def test_without_billing_configured_everybody_is_free_for_the_month(
        self, session: AsyncSession, user: User
    ) -> None:
        """Development, a self-hosted server: nothing to buy, the month
        and `DESKTOP_MONTHLY_CREDITS`, as before the plans."""
        allowance = await resolve_allowance(session, user)
        assert allowance.status == STATUS_FREE
        assert allowance.plan_name == "Free"
        assert allowance.credits_limit == settings.DESKTOP_MONTHLY_CREDITS
        assert allowance.period_start.day == 1

    async def test_with_billing_and_no_subscription_there_is_no_plan(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        billing_on(mocker)
        allowance = await resolve_allowance(session, user)
        assert allowance.status == STATUS_NONE
        assert allowance.credits_limit == 0
        assert allowance.plan_name == "No plan"

    async def test_an_active_plan_gets_its_week(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(save_fixture, mocker, user, tier="pro", status="active")
        allowance = await resolve_allowance(session, user)
        assert allowance.status == "active"
        assert allowance.plan_name == "Pro"
        assert allowance.tier == "pro"
        assert allowance.credits_limit == 2_500_000
        start, end = week_bounds()
        assert (allowance.period_start, allowance.period_end) == (start, end)
        assert allowance.paid

    async def test_past_due_keeps_the_week_while_the_card_is_retried(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(
            save_fixture,
            mocker,
            user,
            tier="standard",
            status="past_due",
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.status == "past_due"
        assert allowance.credits_limit == 750_000
        assert allowance.paid

    async def test_a_trial_gets_its_own_window_and_credits(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(
            save_fixture,
            mocker,
            user,
            tier="max",
            status="trialing",
            trial_days_left=5,
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.status == STATUS_TRIALING
        assert allowance.plan_name == "Max"
        assert allowance.credits_limit == 1_000_000
        assert allowance.trial_end is not None
        assert allowance.period_end == allowance.trial_end
        assert allowance.trial_cancelable
        assert not allowance.paid

    async def test_a_cancelled_trial_is_not_cancelable_again(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(
            save_fixture,
            mocker,
            user,
            tier="standard",
            status="trialing",
            trial_days_left=2,
            cancel_at_period_end=True,
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.trialing
        assert not allowance.trial_cancelable

    async def test_a_cancelled_subscription_is_no_plan(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(
            save_fixture,
            mocker,
            user,
            tier="standard",
            status="canceled",
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.none
        assert allowance.credits_limit == 0

    async def test_the_creator_era_key_resolves_to_its_plan(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(
            save_fixture, mocker, user, tier="studio", status="active"
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.plan_name == "Pro"


@pytest.mark.asyncio
class TestQuotaAndRefusal:
    async def test_the_quota_carries_the_plan_and_the_trial(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(
            save_fixture,
            mocker,
            user,
            tier="standard",
            status="trialing",
            trial_days_left=6,
        )
        quota = await desktop.quota(session, user)
        assert quota["planName"] == "Standard"
        assert quota["subscriptionStatus"] == "trialing"
        assert quota["creditsLimit"] == 1_000_000
        assert quota["tier"] == "standard"
        assert quota["trialEndsAt"] == quota["periodEnd"]
        assert quota["trialCancelable"] is True
        assert quota["onDemand"] is None
        assert quota["upgradeUrl"] == settings.generate_external_url("/billing")
        summary = await desktop.profile_summary(session, user)
        assert summary["creditItems"][0]["label"] == "Trial credits"
        assert summary["creditItems"][0]["type"] == "plan"

    async def test_only_this_week_s_spend_counts(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(
            save_fixture,
            mocker,
            user,
            tier="standard",
            status="active",
        )
        start, _ = week_bounds()
        old = DesktopUsage(
            user_id=user.id, model="gpt-6-sol", credits=700_000, upstream_status=200
        )
        old.created_at = start - timedelta(hours=1)
        await save_fixture(old)
        await save_fixture(
            DesktopUsage(
                user_id=user.id, model="gpt-6-sol", credits=100_000, upstream_status=200
            )
        )
        quota = await desktop.quota(session, user)
        assert quota["creditsUsed"] == 100_000
        assert quota["creditsRemaining"] == 650_000
        assert not await desktop.exhausted(session, user)

    async def test_no_plan_is_exhausted_before_the_first_call(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        billing_on(mocker)
        assert await desktop.exhausted(session, user)
        allowance = await desktop.allowance(session, user)
        body = quota_exhausted_response(allowance).body.decode()
        assert "40200" in body
        assert "No active plan" in body
        assert "/billing" in body

    async def test_the_refusal_names_the_window(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _person_with_plan(
            save_fixture,
            mocker,
            user,
            tier="standard",
            status="active",
        )
        allowance = await desktop.allowance(session, user)
        body = quota_exhausted_response(allowance).body.decode()
        assert "This week's credits are used (code 40200)" in body
        assert "Monday" in body

    async def test_the_free_refusal_still_says_the_month(self) -> None:
        body = quota_exhausted_response(None).body.decode()
        assert "Monthly credits exhausted (code 40200)" in body
