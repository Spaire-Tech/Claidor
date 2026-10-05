"""What one person may spend, and over which window.

The app meters model calls in credits (`simeon.desktop.pricing`). How many
a person has depends on their plan (`simeon.entitlements.tiers`), which
the billing engine keeps as a Subscription on the Customer that stands
for the person's own organisation, under the Simeon Labs platform
organisation (`simeon.platform`, `docs/services-billing.md`).

Three windows, one shape:

- **Free** (no platform organisation configured: development, tests, a
  self-hosted server): the calendar month, `DESKTOP_MONTHLY_CREDITS`.
  Nothing changes for an installation that has not switched billing on.
- **Trial**: `trial_start` to `trial_end` of the trialing subscription,
  the plan's `trial_credits`, once.
- **A plan** (active, or past due while the card is retried): Monday
  00:00 UTC to the next Monday, the plan's `weekly_credits`.
- **No plan** (never subscribed, trial lapsed, cancelled, dunning over):
  the week, with a limit of 0, so every metered call is refused with a
  sentence that says where to subscribe.

The allowance is read before every metered call (`budget_refusal`), so
it is three indexed lookups and no aggregate; the aggregate is the
usage in the window, which `DesktopService.credits_used` sums.
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
from simeon.models import User
from simeon.models.subscription import SubscriptionStatus
from simeon.platform.repository import (
    platform_customer_repository,
    platform_subscription_repository,
)
from simeon.platform.service import platform as platform_service
from simeon.postgres import AsyncSession

from .repository import DesktopOrganizationRepository

#: `subscriptionStatus` values the app sees. `free` and `none` are ours;
#: the rest are the subscription's own status.
STATUS_FREE = "free"
STATUS_NONE = "none"
STATUS_TRIALING = SubscriptionStatus.trialing.value

#: Where a person goes to choose, change or cancel a plan.
BILLING_PATH = "/billing"


def billing_url() -> str:
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
        return self.status in (
            SubscriptionStatus.active.value,
            SubscriptionStatus.past_due.value,
        )

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


async def resolve_allowance(
    session: AsyncSession, user: User, *, now: datetime | None = None
) -> Allowance:
    """The person's allowance now. Reads the person's own organisation,
    its Customer on the platform organisation, and that Customer's
    billable subscription; three lookups, all by index."""
    moment = now or utc_now()
    if not platform_service.is_configured():
        return _free(moment)

    organization = await DesktopOrganizationRepository.from_session(
        session
    ).get_first_for_user(user.id)
    if organization is None:
        return _none(moment)
    # Staff: the platform organisation's own members are not its customers.
    if platform_service.is_platform_organization(organization.id):
        return _free(moment)

    customer = await platform_customer_repository(session).get_for_creator_org(
        platform_service.get_id(), organization.id
    )
    if customer is None:
        return _none(moment)
    subscription = await platform_subscription_repository(
        session
    ).get_active_for_customer(customer.id)
    if subscription is None or subscription.product is None:
        return _none(moment)

    tier_value = (subscription.product.user_metadata or {}).get("tier")
    tier = tier_from_value(tier_value) if isinstance(tier_value, str) else None
    if tier is None or tier not in PAID_TIERS:
        return _none(moment)
    definition = get_definition(tier)

    if (
        subscription.status == SubscriptionStatus.trialing
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
        status=subscription.status.value,
        tier=tier.value,
        credits_limit=definition.weekly_credits,
        period_start=start,
        period_end=end,
    )


__all__ = [
    "BILLING_PATH",
    "STATUS_FREE",
    "STATUS_NONE",
    "STATUS_TRIALING",
    "Allowance",
    "billing_url",
    "month_bounds",
    "resolve_allowance",
    "week_bounds",
]
