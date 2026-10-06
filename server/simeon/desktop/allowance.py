"""What one person may spend, and over which window.

The app meters model calls in credits (`simeon.desktop.pricing`). How many
a person has depends on their plan (`simeon.entitlements.tiers`), which
Stripe Billing owns and the server keeps a copy of, one row per person,
written by webhook (`DesktopSubscription`, `simeon.plans`,
`docs/services-billing.md`).

Three windows, one shape:

- **Free** (`DESKTOP_BILLING_REQUIRED` off: development, tests, a
  self-hosted server; or an exempt e-mail): the calendar month,
  `DESKTOP_MONTHLY_CREDITS`. Nothing changes for an installation that
  has not switched billing on.
- **Trial**: `trial_start` to `trial_end` of the trialing subscription,
  the plan's `trial_credits`, once.
- **A plan** (active, or past due while the card is retried): Monday
  00:00 UTC to the next Monday, the plan's `weekly_credits`. Stripe
  cannot reset a meter weekly, so the week is counted here, from
  `desktop_usage`.
- **No plan** (never subscribed, trial lapsed, cancelled, dunning over):
  the week, with a limit of 0, so every metered call is refused with a
  sentence that says where to subscribe.

The allowance is read before every metered call (`budget_refusal`), so
it is one indexed lookup and no Stripe call; the aggregate is the usage
in the window, which `DesktopService.credits_used` sums.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from simeon.config import settings
from simeon.entitlements.tiers import (
    PAID_TIERS,
    TIER_NAMES,
    TierKey,
    get_definition,
    tier_from_value,
)
from simeon.kit.utils import utc_now
from simeon.models import DesktopSubscription, User
from simeon.plans.repository import DesktopSubscriptionRepository
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


def billing_required() -> bool:
    """Whether anyone needs a plan on this server."""
    return settings.DESKTOP_BILLING_REQUIRED


def billing_exempt(user: User) -> bool:
    """Staff and friends: never asked for a plan, on the free month."""
    return user.email.lower() in {
        email.lower() for email in settings.DESKTOP_BILLING_EXEMPT_EMAILS
    }


def billing_url() -> str:
    """The billing page on the web app (`clients/`), the one thing the web
    app is for: a plan and a card, then Stripe's portal."""
    return settings.generate_frontend_url(BILLING_PATH)


def month_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The calendar month, in UTC, the free allowance is counted over."""
    moment = now or utc_now()
    start = moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def week_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Monday 00:00 UTC to the next Monday: the week a plan's credits
    are counted over. Monday rather than the subscription's own day so
    every person's meter resets at the same moment and "resets Monday"
    is true for everyone."""
    moment = now or utc_now()
    start = (moment - timedelta(days=moment.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return start, start + timedelta(days=7)


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
    #: When the trial ends, while trialing.
    trial_end: datetime | None = None
    #: Whether the person can still cancel the trial (it is not already
    #: scheduled to end without a charge).
    trial_cancelable: bool = False

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


def _none(now: datetime) -> Allowance:
    start, end = week_bounds(now)
    return Allowance(
        plan_name=TIER_NAMES[TierKey.inactive],
        status=STATUS_NONE,
        tier=None,
        credits_limit=0,
        period_start=start,
        period_end=end,
    )


def allowance_of(
    subscription: DesktopSubscription | None, *, now: datetime | None = None
) -> Allowance:
    """The allowance one synced subscription row gives, with billing on."""
    moment = now or utc_now()
    if subscription is None or not subscription.billable:
        return _none(moment)
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
        )

    start, end = week_bounds(moment)
    return Allowance(
        plan_name=TIER_NAMES[tier],
        status=subscription.status,
        tier=tier.value,
        credits_limit=definition.weekly_credits,
        period_start=start,
        period_end=end,
    )


async def resolve_allowance(
    session: AsyncSession, user: User, *, now: datetime | None = None
) -> Allowance:
    """The person's allowance now: one lookup of the synced subscription
    row, by the user's id."""
    moment = now or utc_now()
    if not billing_required() or billing_exempt(user):
        return _free(moment)
    subscription = await DesktopSubscriptionRepository.from_session(
        session
    ).get_by_user(user.id)
    return allowance_of(subscription, now=moment)


__all__ = [
    "BILLING_PATH",
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
    "month_bounds",
    "resolve_allowance",
    "week_bounds",
]
