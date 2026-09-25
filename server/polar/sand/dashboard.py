"""`aiserver.v1.DashboardService`, the part every Connect call pre-flights
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
"""

from __future__ import annotations

from typing import Any

from .connect import ConnectCall, ConnectService

service = ConnectService("aiserver.v1.DashboardService")

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


router = service.router
