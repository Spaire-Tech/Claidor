"""`simeon.v1.DashboardService`, the part every Connect call pre-flights
(25 September 2026).

The app's Connect interceptor looks up the person's privacy mode before
every other call (`createSandInferenceInterceptor`,
`GetUserPrivacyMode`, cached five minutes), the Mac reads the team's
local-tool ceiling (`GetTeamAdminSettingsOrEmptyIfNotInTeam`) and the
plugin sync reads `GetMe` for the user id. These three are answered
here so the DashboardService can be in the served set; the team and
plugin methods of the same service live in `skill_registry.py`, the
Slack and SCM ones in `listeners.py`. Enum fields are sent as integers,
which protobuf JSON accepts.

`CancelSandTrial` (5 October 2026) is the Settings page's « Cancel
trial » button: the app calls it as it did the upstream's, and here it ends
the person's trial on Stripe Billing (`simeon.plans`,
`docs/services-billing.md`).
"""

from __future__ import annotations

from typing import Any

from simeon.desktop.allowance import billing_required
from simeon.desktop.service import desktop
from simeon.models import User
from simeon.plans.repository import DesktopTrialRedemptionRepository
from simeon.plans.service import plans as plans_service
from simeon.postgres import AsyncSession

from .connect import ConnectCall, ConnectError, ConnectService

service = ConnectService(
    "simeon.v1.DashboardService", aliases=("aiserver.v1.DashboardService",)
)

#: `PrivacyMode` in `desktop/source/shared/observability/sentry-privacy-mode.ts`:
#: UNSPECIFIED 0, NO_STORAGE 1, NO_TRAINING 2, …. Simeon Labs trains on
#: nothing and stores what the proxy meters, so the answer is NO_TRAINING.
PRIVACY_MODE_NO_TRAINING = 2


def user_id_of(call: ConnectCall) -> int:
    """`GetMe.user_id` is an int32; a UUID does not fit, so the app gets
    a stable 31-bit hash of it. Nothing on our side keys on the number:
    `plugin-skills.ts` only compares it with a plugin's `publisher.ownerUserId`,
    which `skill_registry.py` writes with the same function."""
    return int(call.caller.user_id.int % 2_147_483_647) or 1


@service.unary("GetUserPrivacyMode", auth="desktop-or-box")
async def get_user_privacy_mode(call: ConnectCall) -> dict[str, Any]:
    return {"privacyMode": PRIVACY_MODE_NO_TRAINING, "isEnforcedByTeam": False}


@service.unary("GetTeamAdminSettingsOrEmptyIfNotInTeam", auth="desktop-or-box")
async def get_team_admin_settings(call: ConnectCall) -> dict[str, Any]:
    # Empty: no team, so no ceiling and nothing disabled by an admin.
    return {}


#: `GetSandAccessStatusResponse.SandAccessState`: GRANTED 1, PAYMENT_REQUIRED 3.
#: The Mac asks this at sign-in (`electron-main/account/access.ts`) and the
#: window keeps the answer for its access cover's words. The cover itself
#: shows when `EnsureSandBox` refuses with `permission_denied`
#: (`box_broker.require_a_plan`), the way the upstream app paywalls: the
#: cover's button opens the billing page, and the window keeps asking for
#: its box until the plan is there, so paying on the web is all it takes.
#: Purchase channel IN_APP (1). Block reasons: NONE 1 ("Check Access"),
#: FREE_TRIAL_AVAILABLE 6 ("Start Trial"), in the window's own copy.
SAND_ACCESS_STATE_GRANTED = 1
SAND_ACCESS_STATE_PAYMENT_REQUIRED = 3
SAND_PURCHASE_CHANNEL_IN_APP = 1
SAND_BLOCK_REASON_NONE = 1
SAND_BLOCK_REASON_FREE_TRIAL_AVAILABLE = 6


async def sand_access_of(db: AsyncSession, user: User) -> dict[str, Any]:
    """Granted on the free month, a trial or a plan; payment required
    with no plan, offering the trial to a person who never had one."""
    allowance = await desktop.allowance(db, user)
    if not allowance.none:
        return {
            "state": SAND_ACCESS_STATE_GRANTED,
            "purchaseChannel": SAND_PURCHASE_CHANNEL_IN_APP,
            "blockReason": 0,
        }
    had_trial = (
        await DesktopTrialRedemptionRepository.from_session(db).get_for_user(user.id)
        is not None
    )
    return {
        "state": SAND_ACCESS_STATE_PAYMENT_REQUIRED,
        "purchaseChannel": SAND_PURCHASE_CHANNEL_IN_APP,
        "blockReason": (
            SAND_BLOCK_REASON_NONE
            if had_trial
            else SAND_BLOCK_REASON_FREE_TRIAL_AVAILABLE
        ),
    }


@service.unary("GetSandAccessStatus", auth="desktop-or-box")
async def get_sand_access_status(call: ConnectCall) -> dict[str, Any]:
    return await sand_access_of(call.db, call.caller.user)


@service.unary("GetMe", auth="desktop-or-box")
async def get_me(call: ConnectCall) -> dict[str, Any]:
    user = call.caller.user
    email = getattr(user, "email", "") or ""
    return {
        "authId": str(call.caller.user_id),
        "userId": user_id_of(call),
        "email": email,
        "profilePictureUrl": getattr(user, "avatar_url", None) or "",
    }


@service.unary("CancelSandTrial", auth="desktop")
async def cancel_sand_trial(call: ConnectCall) -> dict[str, Any]:
    """End the trial without a charge. The subscription is scheduled to
    end when the trial does (the person keeps the remaining days, as the
    reminder e-mails promise), the card is never charged, and the trial
    stays consumed: no second one on re-subscribe. The upstream's own answers
    `FAILED_PRECONDITION` when there is no trial to cancel; the app
    shows the message either way."""
    if not billing_required():
        raise ConnectError("failed_precondition", "There is no trial to cancel.")
    user = call.caller.user
    allowance = await desktop.allowance(call.db, user)
    if not allowance.trialing:
        raise ConnectError("failed_precondition", "There is no trial to cancel.")
    if not allowance.trial_cancelable:
        return {}
    if not await plans_service.cancel_trial(call.db, user):
        raise ConnectError("failed_precondition", "There is no trial to cancel.")
    return {}


router = service.router
