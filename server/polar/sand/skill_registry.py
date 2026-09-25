"""`aiserver.v1.DashboardService`, the team and plugin half: the skill
registry (25 September 2026, `docs/product/skill-publish-served.md`).

Five methods the app calls (`docs/product/cursor-dependencies-map.md` §7):
`GetTeams` for the publish targets, `PublishPlugin` with the tar.gz,
`UnpublishPlugin`, `GetEffectiveUserPlugins` on every plugin sync, and
`GetMe`, which `dashboard.py` already answers. The registry itself is
`skill_registry_service.py`; the tables are `polar.models.sand_plugin`.
Field names are the generated protos' JSON spelling; int64 as strings;
bytes arrive base64.
"""

from __future__ import annotations

import base64
from typing import Any

from .connect import ConnectCall, ConnectError, ConnectService
from .skill_registry_service import TEAM_ROLE_MEMBER, TEAM_ROLE_OWNER, skill_registry

service = ConnectService("aiserver.v1.DashboardService")


def _int(value: Any, field: str) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ConnectError("invalid_argument", f"`{field}` must be an integer.")


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _bytes(value: Any, field: str) -> bytes:
    if value is None or value == "":
        return b""
    if not isinstance(value, str):
        raise ConnectError("invalid_argument", f"`{field}` must be base64 bytes.")
    try:
        return base64.b64decode(value, validate=False)
    except ValueError:
        raise ConnectError("invalid_argument", f"`{field}` is not base64.")


@service.unary("GetTeams", auth="desktop-or-box")
async def get_teams(call: ConnectCall) -> dict[str, Any]:
    teams = await skill_registry.teams_of(call.db, call.caller.user)
    return {
        "teams": [
            {
                "name": team.name,
                "id": team.id,
                "role": TEAM_ROLE_OWNER if team.is_personal else TEAM_ROLE_MEMBER,
                "seats": 1 if team.is_personal else 0,
                "isDirectMember": True,
                "teamSlug": team.slug,
                "verified": True,
            }
            for team in teams
        ]
    }


@service.unary("PublishPlugin", auth="desktop-or-box")
async def publish_plugin(call: ConnectCall) -> dict[str, Any]:
    message = call.message
    plugin, team = await skill_registry.publish(
        call.db,
        call.caller.user,
        team_id=_int(message.get("teamId", message.get("team_id")), "teamId"),
        name=_text(message.get("name")),
        display_name=_text(message.get("displayName", message.get("display_name"))),
        description=_text(message.get("description")),
        plugin_tar_gz=_bytes(
            message.get("pluginTarGz", message.get("plugin_tar_gz")), "pluginTarGz"
        ),
        commit_message=_text(
            message.get("commitMessage", message.get("commit_message"))
        ),
    )
    return {
        "pluginId": str(plugin.numeric_id),
        "marketplaceId": str(team.id),
        "commitSha": plugin.commit_sha,
    }


@service.unary("UnpublishPlugin", auth="desktop-or-box")
async def unpublish_plugin(call: ConnectCall) -> dict[str, Any]:
    message = call.message
    plugin_id = _int(message.get("pluginId", message.get("plugin_id")), "pluginId")
    if plugin_id is None:
        raise ConnectError("invalid_argument", "`pluginId` is required.")
    commit_sha = await skill_registry.unpublish(
        call.db,
        call.caller.user,
        plugin_id=plugin_id,
        team_id=_int(message.get("teamId", message.get("team_id")), "teamId"),
    )
    return {"commitSha": commit_sha}


@service.unary("GetEffectiveUserPlugins", auth="desktop-or-box")
async def get_effective_user_plugins(call: ConnectCall) -> dict[str, Any]:
    message = call.message
    return await skill_registry.effective_plugins(
        call.db,
        call.caller.user,
        team_id=_int(message.get("teamId", message.get("team_id")), "teamId"),
    )


router = service.router
