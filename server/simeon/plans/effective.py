"""A person's plan, whoever bills it (12 October 2026).

A plan is either Stripe's (`DesktopSubscription`, bought on the web) or
Apple's (`DesktopAppStoreSubscription`, bought in the iPhone app). Both
rows carry what the allowance reads (status, tier, the period and the
trial) and say who bills them (`provider`), so everything that asks "what
plan does this person have" asks here: the allowance, the access check,
the web billing page, trial cancel and account deletion.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from simeon.kit.utils import utc_now
from simeon.models import DesktopAppStoreSubscription, DesktopSubscription
from simeon.postgres import AsyncReadSession, AsyncSession

from .repository import AppStoreSubscriptionRepository, DesktopSubscriptionRepository

PlanRow = DesktopSubscription | DesktopAppStoreSubscription

#: When two plans are live at once (a person paid on the web and through
#: Apple), the bigger one counts.
_TIER_RANK = {"standard": 1, "pro": 2, "max": 3}


async def plan_of(
    session: AsyncSession | AsyncReadSession,
    user_id: UUID,
    *,
    now: datetime | None = None,
) -> PlanRow | None:
    """The plan that counts now: a live one if there is one (the bigger,
    then the one that runs longest), else the Stripe row (its status says
    why it ended), else the latest Apple one, else None."""
    moment = now or utc_now()
    stripe = await DesktopSubscriptionRepository.from_session(session).get_by_user(
        user_id
    )
    apple = list(
        await AppStoreSubscriptionRepository.from_session(session).list_by_user(user_id)
    )
    rows: list[PlanRow] = [*([stripe] if stripe is not None else []), *apple]
    live = [row for row in rows if row.billable_at(moment)]
    if live:
        return max(
            live,
            key=lambda row: (
                _TIER_RANK.get(row.tier or "", 0),
                row.current_period_end or moment,
            ),
        )
    if stripe is not None:
        return stripe
    return apple[0] if apple else None


def billed_by_apple(row: PlanRow | None, *, now: datetime | None = None) -> bool:
    """Whether the plan that counts is a live one Apple bills."""
    return (
        row is not None
        and row.provider == "app_store"
        and row.billable_at(now or utc_now())
    )


__all__ = ["PlanRow", "billed_by_apple", "plan_of"]
