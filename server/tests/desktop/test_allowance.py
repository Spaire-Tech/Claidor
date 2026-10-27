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
    TRIAL_HOURLY_CREDITS,
    plan_week,
    resolve_allowance,
    week_bounds,
)
from simeon.desktop.proxy_common import budget_refusal, quota_exhausted_response
from simeon.desktop.service import desktop
from simeon.entitlements.tiers import TierKey, tier_from_value
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


async def _after_the_trial(
    save_fixture: SaveFixture,
    mocker: MockerFixture,
    user: User,
    *,
    status: str,
    months_paid: int,
) -> DesktopSubscription:
    """Billing on, and a Pro subscription whose 30-day trial is over, as
    Stripe's webhook writes it: `trial_end` stays set, and the first
    period after the trial starts at it, to the second. `months_paid` is
    how many monthly periods were charged before the current one."""
    billing_on(mocker)
    now = utc_now()
    period_start = now - timedelta(days=2)
    trial_end = period_start - timedelta(days=30 * months_paid)
    row = DesktopSubscription(
        user_id=user.id,
        stripe_customer_id="cus_test",
        stripe_subscription_id="sub_test",
        status=status,
        tier="pro",
        price_lookup_key=lookup_key(TierKey.pro, "month"),
        billing_interval="month",
        current_period_start=period_start,
        current_period_end=period_start + timedelta(days=30),
        trial_start=trial_end - timedelta(days=30),
        trial_end=trial_end,
        synced_at=now,
        raw={},
    )
    await save_fixture(row)
    return row


class TestPlanWeek:
    """Each person's week runs from their plan's start (27 October 2026),
    as Claude's does, so a plan bought on a Thursday resets on Thursdays."""

    start = datetime(2026, 10, 1, 9, 30, tzinfo=UTC)
    end = datetime(2026, 10, 31, 9, 30, tzinfo=UTC)

    def test_the_first_week_starts_with_the_plan(self) -> None:
        moment = datetime(2026, 10, 3, tzinfo=UTC)
        assert plan_week(self.start, self.end, moment) == (
            self.start,
            self.start + timedelta(days=7),
        )

    def test_later_weeks_follow_on(self) -> None:
        moment = datetime(2026, 10, 16, tzinfo=UTC)
        assert plan_week(self.start, self.end, moment) == (
            datetime(2026, 10, 15, 9, 30, tzinfo=UTC),
            datetime(2026, 10, 22, 9, 30, tzinfo=UTC),
        )

    def test_the_last_stretch_of_a_month_joins_the_fourth_week(self) -> None:
        """A 30-day period holds four weeks and two days; the two days join
        the fourth week, so the week ends with the period and the renewal
        starts a fresh one, never a two-day week."""
        moment = datetime(2026, 10, 30, tzinfo=UTC)
        assert plan_week(self.start, self.end, moment) == (
            datetime(2026, 10, 22, 9, 30, tzinfo=UTC),
            self.end,
        )

    def test_past_the_period_end_the_weeks_carry_on_from_it(self) -> None:
        """The renewal's webhook can lag: until it lands, the weeks carry on
        from the old period's end, which is where the new one starts."""
        moment = datetime(2026, 11, 2, tzinfo=UTC)
        assert plan_week(self.start, self.end, moment) == (
            self.end,
            self.end + timedelta(days=7),
        )

    def test_without_a_period_it_is_the_monday_week(self) -> None:
        moment = datetime(2026, 10, 8, 15, 42, tzinfo=UTC)
        assert plan_week(None, None, moment) == week_bounds(moment)

    def test_a_yearly_plan_has_weeks_all_year(self) -> None:
        end = self.start + timedelta(days=365)
        moment = self.start + timedelta(days=200)
        week_start, week_end = plan_week(self.start, end, moment)
        assert week_end - week_start == timedelta(days=7)
        assert week_start <= moment < week_end
        assert (week_start - self.start) % timedelta(days=7) == timedelta(0)


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
        row = await _person_with_plan(
            save_fixture, mocker, user, tier="pro", status="active"
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.status == "active"
        assert allowance.plan_name == "Pro"
        assert allowance.tier == "pro"
        assert allowance.credits_limit == 35_000_000
        assert allowance.hourly_credits == 7_000_000
        # The person's own week, from the day the plan's period began (three
        # days ago in the fixture), not Monday's.
        assert row.current_period_start is not None
        assert allowance.period_start == row.current_period_start
        assert allowance.period_end == row.current_period_start + timedelta(days=7)
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
        assert allowance.credits_limit == 10_000_000
        assert allowance.paid

    async def test_a_failed_first_charge_after_the_trial_is_no_plan(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """The founder's own test (14 October 2026): the trial ended, the
        card was refused, and the plan started anyway. Stripe marks the
        subscription `past_due` and retries; nothing was ever paid, so
        there is no plan, and the app is told the card failed."""
        row = await _after_the_trial(
            save_fixture, mocker, user, status="past_due", months_paid=0
        )
        assert row.unpaid_after_trial
        assert row.billable, "the subscription is still Stripe's: no second checkout"
        allowance = await resolve_allowance(session, user)
        assert allowance.none
        assert allowance.credits_limit == 0
        assert allowance.payment_failed
        assert allowance.provider == "stripe"
        assert not allowance.paid
        assert await desktop.exhausted(session, user)

    async def test_once_the_retried_charge_goes_through_the_plan_starts(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _after_the_trial(
            save_fixture, mocker, user, status="active", months_paid=0
        )
        allowance = await resolve_allowance(session, user)
        assert allowance.status == "active"
        assert allowance.credits_limit == 35_000_000
        assert not allowance.payment_failed

    async def test_a_failed_renewal_after_a_paid_month_keeps_the_week(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        row = await _after_the_trial(
            save_fixture, mocker, user, status="past_due", months_paid=1
        )
        assert not row.unpaid_after_trial
        allowance = await resolve_allowance(session, user)
        assert allowance.status == "past_due"
        assert allowance.credits_limit == 35_000_000
        assert not allowance.payment_failed

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
        # A trial is one Standard week, whichever plan was chosen.
        assert allowance.credits_limit == 10_000_000
        assert allowance.hourly_credits == TRIAL_HOURLY_CREDITS == 2_000_000
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
        assert quota["creditsLimit"] == 10_000_000
        assert quota["tier"] == "standard"
        assert quota["trialEndsAt"] == quota["periodEnd"]
        assert quota["trialCancelable"] is True
        assert quota["onDemand"] is None
        assert quota["upgradeUrl"] == settings.generate_frontend_url(
            "/billing?from=app"
        )
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
        start = (await desktop.allowance(session, user)).period_start
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
        # Standard's week (10,000,000 since 27 October 2026) less this week's 100,000.
        assert quota["creditsRemaining"] == 9_900_000
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
        # The person's own reset day, not every account's Monday.
        assert allowance.period_end.strftime("%A") in body

    async def test_a_failed_card_is_told_to_update_it(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        await _after_the_trial(
            save_fixture, mocker, user, status="past_due", months_paid=0
        )
        quota = await desktop.quota(session, user)
        assert quota["subscriptionStatus"] == "none"
        assert quota["creditsLimit"] == 0
        assert quota["paymentFailed"] is True
        assert quota["billedBy"] == "stripe"
        assert quota["hasPaidCredits"] is False
        allowance = await desktop.allowance(session, user)
        body = bytes(quota_exhausted_response(allowance).body).decode()
        assert "Your payment didn't go through (code 40200)" in body
        assert "Update your card at" in body
        assert "/billing" in body

    async def test_a_person_with_no_plan_is_not_told_their_card_failed(
        self, session: AsyncSession, user: User, mocker: MockerFixture
    ) -> None:
        billing_on(mocker)
        quota = await desktop.quota(session, user)
        assert quota["paymentFailed"] is False
        assert quota["billedBy"] is None

    async def test_each_plan_has_its_own_hourly_brake(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        user: User,
        mocker: MockerFixture,
    ) -> None:
        """About a fifth of the week (27 October 2026): an hour on Max may
        spend what would stop Standard, and the refusal names Max's limit."""
        await _person_with_plan(save_fixture, mocker, user, tier="max", status="active")
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="gpt-6-sol",
                credits=5_000_000,
                upstream_status=200,
            )
        )
        allowance = await desktop.allowance(session, user)
        assert allowance.hourly_credits == 18_000_000
        assert not await desktop.hourly_exhausted(session, user, allowance=allowance)
        assert await budget_refusal(session, user) is None
        await save_fixture(
            DesktopUsage(
                user_id=user.id,
                model="gpt-6-sol",
                credits=13_000_000,
                upstream_status=200,
            )
        )
        assert await desktop.hourly_exhausted(session, user)
        refusal = await budget_refusal(session, user)
        assert refusal is not None
        body = bytes(refusal.body).decode()
        assert "40201" in body
        assert "18,000,000 of 18,000,000" in body

    async def test_the_free_refusal_still_says_the_month(self) -> None:
        body = quota_exhausted_response(None).body.decode()
        assert "Monthly credits exhausted (code 40200)" in body
