"""`aiserver.v1.AutomationsService`, the four methods the app's cloud
sync calls (25 September 2026; `sand-automation-cloud-sync.ts`).

The app mirrors every routine a server can fire as a shadow workflow:
`CreateSandAutomation` with `description: "sand-shadow:<hash>"`, `name`,
`workflow`, `enabled`, `sandAgentId`, `sandAutomationId`;
`UpdateSandAutomation` when the marker or `enabled` changed;
`DeleteSandAutomation` for a routine that is gone; `ListSandAutomations`
per agent, reading `workflows[].workflow.{automationId, description,
enabled}`. It re-lists after every mutation and expects the read-back
to converge, so a create of an id that exists is an update, and a delete
of an id that is gone succeeds.

Enums are echoed as the app sent them; the `Automation` message's
`createdAt`/`updatedAt` are int64, sent as strings.
"""

from __future__ import annotations

from typing import Any

from polar.models import SandAutomation

from .connect import ConnectCall, ConnectError, ConnectService
from .listeners_service import listeners

service = ConnectService("aiserver.v1.AutomationsService")


def automation_json(row: SandAutomation) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "automationId": row.automation_id,
        "name": row.name,
        "enabled": row.enabled,
        "workflow": row.workflow,
        "description": row.description,
        "createdAt": str(int(row.created_at.timestamp() * 1000)),
        "updatedAt": str(int((row.modified_at or row.created_at).timestamp() * 1000)),
    }
    return {"workflow": entry}


def _string(message: dict[str, Any], *names: str) -> str | None:
    for name in names:
        value = message.get(name)
        if isinstance(value, str):
            return value
    return None


def _workflow(message: dict[str, Any]) -> dict[str, Any] | None:
    value = message.get("workflow")
    return value if isinstance(value, dict) else None


@service.unary("ListSandAutomations", auth="desktop-or-box")
async def list_sand_automations(call: ConnectCall) -> dict[str, Any]:
    agent_id = _string(call.message, "sandAgentId", "sand_agent_id") or ""
    rows = await listeners.list_automations(call.db, call.caller.user_id, agent_id)
    return {"workflows": [automation_json(row) for row in rows]}


@service.unary("CreateSandAutomation", auth="desktop-or-box")
async def create_sand_automation(call: ConnectCall) -> dict[str, Any]:
    automation_id = _string(call.message, "sandAutomationId", "sand_automation_id")
    agent_id = _string(call.message, "sandAgentId", "sand_agent_id")
    if not automation_id or not agent_id:
        raise ConnectError(
            "invalid_argument", "sandAutomationId and sandAgentId are required."
        )
    enabled = call.message.get("enabled")
    row = await listeners.upsert_automation(
        call.db,
        call.caller.user_id,
        automation_id=automation_id,
        sand_agent_id=agent_id,
        name=_string(call.message, "name"),
        description=_string(call.message, "description"),
        enabled=enabled if isinstance(enabled, bool) else None,
        workflow=_workflow(call.message) or {},
    )
    return automation_json(row)


@service.unary("UpdateSandAutomation", auth="desktop-or-box")
async def update_sand_automation(call: ConnectCall) -> dict[str, Any]:
    automation_id = _string(call.message, "automationId", "automation_id")
    if not automation_id:
        raise ConnectError("invalid_argument", "automationId is required.")
    enabled = call.message.get("enabled")
    row = await listeners.upsert_automation(
        call.db,
        call.caller.user_id,
        automation_id=automation_id,
        sand_agent_id=_string(call.message, "sandAgentId", "sand_agent_id"),
        name=_string(call.message, "name"),
        description=_string(call.message, "description"),
        enabled=enabled if isinstance(enabled, bool) else None,
        workflow=_workflow(call.message),
    )
    return automation_json(row)


@service.unary("DeleteSandAutomation", auth="desktop-or-box")
async def delete_sand_automation(call: ConnectCall) -> dict[str, Any]:
    automation_id = _string(call.message, "automationId", "automation_id")
    if not automation_id:
        raise ConnectError("invalid_argument", "automationId is required.")
    await listeners.delete_automation(call.db, call.caller.user_id, automation_id)
    return {}


router = service.router
