"""The free trial on the iPhone (12 October 2026, a free month until 27
October 2026, a week since), no card.

The founder dropped Apple's free week ("the whole free trial makes it
complicated"): a person signs in on the iPhone and has seven days with
the trial's credits (`catalog.TRIAL_DAYS`, `tiers.TRIAL_CREDITS`), no
checkout; when the days or the credits run out, the app offers the plans.
On the web and the Mac the trial still takes a card, one per card. The
module, its route and its log lines keep the month's name (`free_month`):
they are what shipped apps and the logs already read.

One per person, by account and by e-mail (a hash of it, kept after the
account is deleted), and none after a card trial or Apple's free week.
Never by device (the founder, 19 October 2026: "we shouldnt base anything
on device. a device could have two to three accounts, thats fine. the thing
we base on are cards"): Apple's DeviceCheck, which allowed one per iPhone,
is gone, and every account on one phone has its own month.

The app asks after every sign-in (`POST /desktop/api/billing/free-month`);
the answer says whether the month started, is already running, or why not,
with the quota the app then shows. Asking again is harmless.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import timedelta

import structlog

from simeon.config import settings
from simeon.entitlements.tiers import TRIAL_CREDITS
from simeon.kit.utils import utc_now
from simeon.models import DesktopFreeTrial, User
from simeon.postgres import AsyncSession

from . import catalog
from .effective import plan_of
from .repository import DesktopFreeTrialRepository, DesktopTrialRedemptionRepository

log = structlog.get_logger()

#: Why a free month did not start, as the app reads it.
STARTED = "started"
RUNNING = "running"
NOT_NEEDED = "not_needed"
HAD_TRIAL = "had_trial"


@dataclass(frozen=True)
class Outcome:
    #: `started`, `running`, `not_needed` (a plan, or billing off), or
    #: `had_trial`.
    reason: str
    trial: DesktopFreeTrial | None = None

    @property
    def started(self) -> bool:
        return self.reason == STARTED


def email_hash(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


def _test_email(user: User) -> bool:
    return (user.email or "").strip().lower() in {
        email.strip().lower() for email in settings.DESKTOP_FREE_TRIAL_TEST_EMAILS
    }


async def free_trial_of(session: AsyncSession, user: User) -> DesktopFreeTrial | None:
    return await DesktopFreeTrialRepository.from_session(session).get_for_user(user.id)


async def had_trial(session: AsyncSession, user: User) -> bool:
    """Whether this person has had any trial: the free month, a card trial
    on the web or the Mac, or Apple's free week, by account or e-mail."""
    free = DesktopFreeTrialRepository.from_session(session)
    if await free.get_for_user(user.id) is not None:
        return True
    if user.email and await free.get_for_email_hash(email_hash(user.email)) is not None:
        return True
    redemptions = DesktopTrialRedemptionRepository.from_session(session)
    if await redemptions.get_for_user(user.id) is not None:
        return True
    return bool(user.email) and (
        await redemptions.get_for_email(user.email, other_than_user=user.id) is not None
    )


async def start(session: AsyncSession, user: User) -> Outcome:
    """Start the person's free month if they never had a trial."""
    # Imported here: `simeon.desktop.allowance` reads this module's table.
    from simeon.desktop.allowance import billing_exempt, billing_required

    now = utc_now()
    if not billing_required() or billing_exempt(user):
        return Outcome(NOT_NEEDED)
    live = await plan_of(session, user.id, now=now)
    if live is not None and live.billable_at(now):
        return Outcome(NOT_NEEDED)
    existing = await free_trial_of(session, user)
    if existing is not None:
        return Outcome(RUNNING if existing.live_at(now) else HAD_TRIAL, existing)

    test = _test_email(user)
    if not test and await had_trial(session, user):
        return Outcome(HAD_TRIAL)

    trial = DesktopFreeTrial(
        user_id=user.id,
        email_hash=email_hash(user.email or str(user.id)),
        starts_at=now,
        ends_at=now + timedelta(days=catalog.TRIAL_DAYS),
        credits=TRIAL_CREDITS,
        device_checked=False,
    )
    await DesktopFreeTrialRepository.from_session(session).create(trial, flush=True)
    log.info(
        "free_month.started",
        user_id=str(user.id),
        ends_at=trial.ends_at.isoformat(),
        test=test,
    )
    return Outcome(STARTED, trial)


__all__ = [
    "HAD_TRIAL",
    "NOT_NEEDED",
    "RUNNING",
    "STARTED",
    "Outcome",
    "email_hash",
    "free_trial_of",
    "had_trial",
    "start",
]
