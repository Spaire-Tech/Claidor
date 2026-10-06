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
the person's trial through the billing engine (`docs/services-billing.md`).
"""

from __future__ import annotations

from typing import Any

from simeon.desktop.service import desktop
from simeon.locker import Locker
from simeon.platform.management import (
    NoActiveSubscription,
    platform_management,
)
from simeon.platform.service import platform as platform_service

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


#: `GetSandAccessStatusResponse.SandAccessState`: GRANTED is 1. The Mac asks
#: this at sign-in (`electron-main/account/access.ts`) and gates the whole
#: app on it; the upstream app answered from its billing. Every signed-in Simeon
#: account has access; billing is the proxy's allowance, not a gate here.
#: Purchase channel IN_APP (1); no block reason (0).
SAND_ACCESS_STATE_GRANTED = 1
SAND_PURCHASE_CHANNEL_IN_APP = 1


@service.unary("GetSandAccessStatus", auth="desktop-or-box")
async def get_sand_access_status(call: ConnectCall) -> dict[str, Any]:
    return {
        "state": SAND_ACCESS_STATE_GRANTED,
        "purchaseChannel": SAND_PURCHASE_CHANNEL_IN_APP,
        "blockReason": 0,
    }


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
    if not platform_service.is_configured():
        raise ConnectError("failed_precondition", "There is no trial to cancel.")
    user = call.caller.user
    allowance = await desktop.allowance(call.db, user)
    if not allowance.trialing:
        raise ConnectError("failed_precondition", "There is no trial to cancel.")
    if not allowance.trial_cancelable:
        return {}
    organization = await desktop.ensure_personal_organization(call.db, user)
    try:
        await platform_management.cancel_at_period_end(
            call.db, Locker(call.redis), organization=organization
        )
    except NoActiveSubscription:
        raise ConnectError("failed_precondition", "There is no trial to cancel.")
    return {}


router = service.router
