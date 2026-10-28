"""What one person may spend, and over which window.

The app meters model calls in credits (`simeon.desktop.pricing`). How many
a person has depends on their plan (`simeon.entitlements.tiers`), which
Stripe Billing owns and the server keeps a copy of, one row per person,
written by webhook (`DesktopSubscription`, `simeon.plans`,
`docs/services-billing.md`), or which Apple bills when it was bought in the
iPhone app (`DesktopAppStoreSubscription`, `simeon.plans.app_store`); the
live one counts (`simeon.plans.effective`).

Three windows, one shape:

- **Free** (`DESKTOP_BILLING_REQUIRED` off: development, tests, a
  self-hosted server; or an exempt e-mail): the calendar month,
  `DESKTOP_MONTHLY_CREDITS`. Nothing changes for an installation that
  has not switched billing on.
- **Trial**: `trial_start` to `trial_end` of the trialing subscription,
  the plan's `trial_credits`, once. The free trial the iPhone app starts
  with no card (`simeon.plans.free_month`, 12 October 2026) is a trial
  too: its seven days, its credits, once.
- **A plan** (active, or past due while the card is retried): the plan's
  own week (`plan_week`, 27 October 2026), seven days at a time from the
  start of its current period, so a renewal, an upgrade (which starts a
  new period, as Apple's does) and the end of a trial each start a fresh
  week; the plan's `weekly_credits`. Monday to Monday UTC for everyone
  until then, which counted a trial's last days against the first paid
  week. Stripe cannot reset a meter weekly, so the week is counted here,
  from `desktop_usage`. Past the week, a paid plan spends its prepaid
  extra credits (`simeon.plans.credits`).
- **No plan** (never subscribed, trial lapsed, cancelled, dunning over,
  or the first charge after the trial failed): the week, with a limit of
  0, so every metered call is refused with a sentence that says where to
  subscribe, or, when the card failed, to update it (`payment_failed`).
  A failed renewal after a paid period keeps the plan while the card is
  retried; a failed first charge does not, as nothing was paid (14
  October 2026).

The allowance is read before every metered call (`budget_refusal`), so
it is one indexed lookup and no Stripe call; the aggregate is the usage
in the window, which `DesktopService.credits_used` sums.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlencode

from simeon.config import settings
from simeon.entitlements.tiers import (
    PAID_TIERS,
    TIER_NAMES,
    TierKey,
    get_definition,
    tier_from_value,
)
from simeon.kit.utils import utc_now
from simeon.models import DesktopFreeTrial, User
from simeon.plans.effective import PlanRow, plan_of
from simeon.plans.repository import DesktopFreeTrialRepository
from simeon.postgres import AsyncSession

#: `subscriptionStatus` values the app sees. `free` and `none` are ours;
#: the rest are Stripe's own status words.
STATUS_FREE = "free"
STATUS_NONE = "none"
STATUS_TRIALING = "trialing"
STATUS_ACTIVE = "active"
STATUS_PAST_DUE = "past_due"

#: Where a person goes to choose, change or cancel a plan.
BILLING_PATH = "/billing"

#: The plan name of the free trial (`simeon.plans.free_month`).
FREE_TRIAL_PLAN_NAME = "Free trial"

#: A trial's hourly brake, whichever plan: Standard's, as its credits are
#: a week of Standard (`tiers.TRIAL_CREDITS`).
TRIAL_HOURLY_CREDITS = get_definition(TierKey.standard).hourly_credits


def billing_required() -> bool:
    """Whether anyone needs a plan on this server."""
    return settings.DESKTOP_BILLING_REQUIRED


def billing_exempt(user: User) -> bool:
    """Staff and friends: never asked for a plan, on the free month."""
    return user.email.lower() in {
        email.lower() for email in settings.DESKTOP_BILLING_EXEMPT_EMAILS
    }


def billing_url(*, from_app: bool = False, plan: str | None = None) -> str:
    """The billing page on the web app (`clients/`), the one thing the web
    app is for: a plan and a card, then Stripe's portal. A link the app
    itself opens says so (`from=app`), so the page afterwards sends the
    person back to the app instead of offering the download. `plan` opens
    it on the plans, that one picked."""
    query = urlencode(
        {**({"from": "app"} if from_app else {}), **({"plan": plan} if plan else {})}
    )
    return settings.generate_frontend_url(
        f"{BILLING_PATH}?{query}" if query else BILLING_PATH
    )


def upgrade_url(allowance: Allowance) -> str | None:
    """Where the apps' "Get more usage" and "See plans" go (28 October
    2026): with a plan below the top one, the plans with the next one
    picked, not the page that says the person is all set; otherwise the
    billing page; none on the free allowance."""
    if allowance.free:
        return None
    tier = tier_from_value(allowance.tier) if allowance.tier else None
    ladder = list(PAID_TIERS)
    above = (
        ladder[ladder.index(tier) + 1].value
        if tier in ladder and ladder.index(tier) + 1 < len(ladder)
        else None
    )
    return billing_url(from_app=True, plan=above)


def month_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The calendar month, in UTC, the free allowance is counted over."""
    moment = now or utc_now()
    start = moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


WEEK = timedelta(days=7)


def week_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Monday 00:00 UTC to the next Monday: the week of a person with no
    plan, and of a plan whose period is not known (`plan_week`)."""
    moment = now or utc_now()
    start = (moment - timedelta(days=moment.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return start, start + WEEK


def plan_week(
    period_start: datetime | None,
    period_end: datetime | None,
    now: datetime | None = None,
) -> tuple[datetime, datetime]:
    """The plan's own week around `now` (27 October 2026): seven days at a
    time from the start of its current period, as Claude gives each account
    its own weekly reset. A renewal, an upgrade and the end of a trial each
    start a period, so each starts a fresh week. The period's last stretch
    shorter than a week joins the week before it (a 30-day month is three
    weeks and one of nine days), so no week crosses a renewal. Past the
    period's end (a renewal not yet copied in), seven days at a time from
    that end. Without a period, Monday to Monday (`week_bounds`)."""
    moment = now or utc_now()
    if period_start is None or period_start > moment:
        return week_bounds(moment)
    if period_end is not None and moment >= period_end:
        start = period_end + ((moment - period_end) // WEEK) * WEEK
        return start, start + WEEK
    index = (moment - period_start) // WEEK
    if period_end is None:
        start = period_start + index * WEEK
        return start, start + WEEK
    last = max((period_end - period_start) // WEEK - 1, 0)
    index = min(index, last)
    start = period_start + index * WEEK
    return start, (period_end if index == last else start + WEEK)


@dataclass(frozen=True)
class Allowance:
    """One person's credits, this window."""

    #: "Standard", "Pro", "Max", "Free", or "No plan".
    plan_name: str
    #: `free`, `none`, or the subscription's status (`trialing`,
    #: `active`, `past_due`).
    status: str
    #: The plan's key, None for free and none.
    tier: str | None
    credits_limit: int
    period_start: datetime
    period_end: datetime
    #: When the trial ends, while trialing; when the free month ended, for
    #: a person with no plan since (the app says the month is over).
    trial_end: datetime | None = None
    #: Whether the person can still cancel the trial (it is not already
    #: scheduled to end without a charge).
    trial_cancelable: bool = False
    #: Who bills the plan: `stripe`, `app_store`, or None for free, none
    #: and the free month. Also set with `payment_failed`, so the app
    #: sends the person to whoever holds the card.
    provider: str | None = None
    #: No plan because the first charge after the trial failed: the
    #: subscription is still there and the card is being retried, so the
    #: person updates the card rather than choosing a plan.
    payment_failed: bool = False
    #: Credits in any sliding hour (27 October 2026): the plan's
    #: `hourly_credits`, Standard's on a trial; 0 reads
    #: `DESKTOP_HOURLY_CREDITS`.
    hourly_limit: int = 0

    @property
    def hourly_credits(self) -> int:
        return self.hourly_limit or settings.DESKTOP_HOURLY_CREDITS

    @property
    def paid(self) -> bool:
        return self.status in (STATUS_ACTIVE, STATUS_PAST_DUE)

    @property
    def trialing(self) -> bool:
        return self.status == STATUS_TRIALING

    @property
    def free(self) -> bool:
        return self.status == STATUS_FREE

    @property
    def none(self) -> bool:
        return self.status == STATUS_NONE

    @property
    def label(self) -> str:
        """The credit item's label in the app's profile summary."""
        if self.free:
            return "Monthly credits"
        if self.trialing:
            return "Trial credits"
        return "Weekly credits"


def _free(now: datetime) -> Allowance:
    start, end = month_bounds(now)
    return Allowance(
        plan_name=TIER_NAMES[TierKey.unmanaged],
        status=STATUS_FREE,
        tier=None,
        credits_limit=settings.DESKTOP_MONTHLY_CREDITS,
        period_start=start,
        period_end=end,
    )


def _none(
    now: datetime,
    *,
    trial_ended: datetime | None = None,
    unpaid: PlanRow | None = None,
) -> Allowance:
    """No plan. `unpaid` is the subscription whose first charge after the
    trial failed, when that is why."""
    start, end = week_bounds(now)
    return Allowance(
        plan_name=TIER_NAMES[TierKey.inactive],
        status=STATUS_NONE,
        tier=None,
        credits_limit=0,
        period_start=start,
        period_end=end,
        trial_end=trial_ended,
        provider=unpaid.provider if unpaid is not None else None,
        payment_failed=unpaid is not None,
    )


def free_month_allowance(trial: DesktopFreeTrial, *, now: datetime) -> Allowance:
    """The free month while it runs: a trial with no tier and no one billing
    it, so the app shows the trial's credits and offers every plan. Once it
    has ended, no plan, with the day it ended."""
    if not trial.live_at(now):
        return _none(now, trial_ended=trial.ends_at)
    return Allowance(
        plan_name=FREE_TRIAL_PLAN_NAME,
        status=STATUS_TRIALING,
        tier=None,
        credits_limit=trial.credits,
        period_start=trial.starts_at,
        period_end=trial.ends_at,
        trial_end=trial.ends_at,
        hourly_limit=TRIAL_HOURLY_CREDITS,
    )


def allowance_of(
    subscription: PlanRow | None, *, now: datetime | None = None
) -> Allowance:
    """The allowance one synced subscription row gives, with billing on:
    Stripe's or Apple's, read the same way."""
    moment = now or utc_now()
    if subscription is None:
        return _none(moment)
    if not subscription.billable_at(moment):
        return _none(
            moment,
            unpaid=subscription if subscription.unpaid_after_trial else None,
        )
    tier = tier_from_value(subscription.tier) if subscription.tier else None
    if tier is None or tier not in PAID_TIERS:
        return _none(moment)
    definition = get_definition(tier)

    if (
        subscription.trialing
        and subscription.trial_start is not None
        and subscription.trial_end is not None
    ):
        return Allowance(
            plan_name=TIER_NAMES[tier],
            status=STATUS_TRIALING,
            tier=tier.value,
            credits_limit=definition.trial_credits,
            period_start=subscription.trial_start,
            period_end=subscription.trial_end,
            trial_end=subscription.trial_end,
            trial_cancelable=not subscription.cancel_at_period_end,
            provider=subscription.provider,
            hourly_limit=TRIAL_HOURLY_CREDITS,
        )

    start, end = plan_week(
        subscription.current_period_start, subscription.current_period_end, moment
    )
    return Allowance(
        plan_name=TIER_NAMES[tier],
        status=subscription.status,
        tier=tier.value,
        credits_limit=definition.weekly_credits,
        period_start=start,
        period_end=end,
        provider=subscription.provider,
        hourly_limit=definition.hourly_credits,
    )


async def resolve_allowance(
    session: AsyncSession, user: User, *, now: datetime | None = None
) -> Allowance:
    """The person's allowance now: the synced plan rows, by the user's
    id (Stripe's and Apple's, `plan_of`); without a live plan, the free
    month if the person has had one."""
    moment = now or utc_now()
    if not billing_required() or billing_exempt(user):
        return _free(moment)
    subscription = await plan_of(session, user.id, now=moment)
    allowance = allowance_of(subscription, now=moment)
    if not allowance.none:
        return allowance
    trial = await DesktopFreeTrialRepository.from_session(session).get_for_user(user.id)
    if trial is None:
        return allowance
    month = free_month_allowance(trial, now=moment)
    # A plan bought after the free month, since lapsed, is what ended last.
    if month.none and subscription is not None:
        return allowance
    return month


__all__ = [
    "BILLING_PATH",
    "FREE_TRIAL_PLAN_NAME",
    "STATUS_ACTIVE",
    "STATUS_FREE",
    "STATUS_NONE",
    "STATUS_PAST_DUE",
    "STATUS_TRIALING",
    "Allowance",
    "allowance_of",
    "billing_exempt",
    "billing_required",
    "billing_url",
    "free_month_allowance",
    "month_bounds",
    "plan_week",
    "resolve_allowance",
    "upgrade_url",
    "week_bounds",
]
