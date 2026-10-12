"""The free month (12 October 2026): the iPhone app's free trial, no card.

The founder dropped Apple's free week ("the whole free trial makes it
complicated"): a person signs in on the iPhone and has thirty days with
the trial's credits (`catalog.TRIAL_DAYS`, `tiers.TRIAL_CREDITS`), no
checkout; when the days or the credits run out, the app offers the plans.
On the web and the Mac the trial still takes a card (abuse: a browser or
a Mac cannot be told apart, an iPhone can).

One per person and one per iPhone:

- the person: no free month, card trial or Apple free week before, by
  account and by e-mail (a hash of it, kept after the account is deleted);
- the iPhone: Apple's DeviceCheck bit (`device_check`), which survives
  deleting the app and signing in with another account.

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

from . import catalog, device_check
from .effective import plan_of
from .repository import DesktopFreeTrialRepository, DesktopTrialRedemptionRepository

log = structlog.get_logger()

#: Why a free month did not start, as the app reads it.
STARTED = "started"
RUNNING = "running"
NOT_NEEDED = "not_needed"
HAD_TRIAL = "had_trial"
DEVICE_USED = "device_used"
UNAVAILABLE = "unavailable"


@dataclass(frozen=True)
class Outcome:
    #: `started`, `running`, `not_needed` (a plan, or billing off),
    #: `had_trial`, `device_used`, or `unavailable` (DeviceCheck not set
    #: up, or Apple could not be asked).
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


async def start(
    session: AsyncSession,
    user: User,
    *,
    device_token: str,
    development: bool = False,
) -> Outcome:
    """Start the person's free month if they and this iPhone never had one."""
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
    if not test:
        if not device_check.configured():
            log.warning("free_month.device_check_not_configured", user_id=str(user.id))
            return Outcome(UNAVAILABLE)
        try:
            if await device_check.free_month_used(
                device_token, development=development
            ):
                log.info("free_month.device_used", user_id=str(user.id))
                return Outcome(DEVICE_USED)
        except device_check.DeviceCheckError as error:
            log.warning(
                "free_month.device_check_failed",
                user_id=str(user.id),
                error=error.message,
            )
            return Outcome(UNAVAILABLE)

    trial = DesktopFreeTrial(
        user_id=user.id,
        email_hash=email_hash(user.email or str(user.id)),
        starts_at=now,
        ends_at=now + timedelta(days=catalog.TRIAL_DAYS),
        credits=TRIAL_CREDITS,
        device_checked=not test,
    )
    await DesktopFreeTrialRepository.from_session(session).create(trial, flush=True)
    if not test:
        try:
            await device_check.mark_free_month_used(
                device_token, development=development
            )
        except device_check.DeviceCheckError as error:
            # The month stands: the account and the e-mail already count it.
            log.warning(
                "free_month.device_mark_failed",
                user_id=str(user.id),
                error=error.message,
            )
    log.info(
        "free_month.started",
        user_id=str(user.id),
        ends_at=trial.ends_at.isoformat(),
        test=test,
    )
    return Outcome(STARTED, trial)


__all__ = [
    "DEVICE_USED",
    "HAD_TRIAL",
    "NOT_NEEDED",
    "RUNNING",
    "STARTED",
    "UNAVAILABLE",
    "Outcome",
    "email_hash",
    "free_trial_of",
    "had_trial",
    "start",
]
