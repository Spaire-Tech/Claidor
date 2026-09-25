"""`aiserver.v1.GrokBotService`, the box broker (25 September 2026).

Cursor's server brokered the box the app runs its agent in; Simeon Labs'
server did not, so `setBoxRuntime("remote")` was refused and Settings
said Coming Soon (design-audit-ledger.md F-137). The app side was
complete the whole time (`docs/product/cursor-dependencies-map.md` §5):
`BrokeredHostConnector` calls `EnsureSandBox` and builds the descriptor
from `gateway_url`, `gateway_token`, `network_token`, `vnc_url` and
`fork_vnc_base_url`; `RecreateSandBox` / `ForceRecreateSandBox` answer
`started`, `reason`, `operation_id`; the migration watcher streams
`WatchSandBoxMigration`; the box's own lifecycle extension asks
`GetSandBoxRunState`. This module answers those, in the shapes the
generated `sand_box_pb.ts` reads, from `box_service.py`, which finds or
creates the box on the host `box_hosts.py` names.

Plus the two plain routes the app posts to at the root of the API host:
`POST /sand-box/local-exec-daemon-credential` and
`POST /sand-box/local-exec-connection` (`box-host-connector.ts:15`,
`local-exec-daemon.ts:23`), and the reverse proxy in `box_proxy.py`.

Every failure is one sentence: the host's (`BoxHostError`), or
"Simeon's cloud computer needs a host; set CLAIDOR_BOX_HOST_PROVIDER"
as `unavailable` when none is configured, which `setBoxRuntime` shows and
falls back from.
"""

from __future__ import annotations

import base64
from collections.abc import AsyncIterator
from typing import Any

import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from polar.desktop.auth import get_desktop_session
from polar.models import DesktopSession
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from . import box_proxy
from .box_hosts import (
    BoxBlocked,
    BoxClientUpdateRequired,
    BoxHostError,
    BoxHostUnavailable,
    BoxStorageDisabled,
)
from .box_service import BoxBrokerRefused, broker, migrations
from .connect import ConnectCall, ConnectError, ConnectService

log = structlog.get_logger()

service = ConnectService("aiserver.v1.GrokBotService")

AUTOMATION_FAILURE_HINT_HEADER = "x-automation-failure-hint"
SAND_BOX_BLOCKED = "SAND_BOX_BLOCKED"
CLOUD_AGENT_STORAGE_DISABLED = "CLOUD_AGENT_STORAGE_DISABLED"
SAND_CLIENT_UPDATE_REQUIRED = "SAND_CLIENT_UPDATE_REQUIRED"
#: `SAND_BOX_BLOCK_REASON_KEY` in `shared/gateway-reachability.ts`.
SAND_BOX_BLOCK_REASON_KEY = "sandBoxBlockReason"
ERROR_DETAILS_TYPE = "aiserver.v1.ErrorDetails"
ERROR_DETAILS_CUSTOM_MESSAGE = 29


# --- protobuf binary for the one detail the app decodes ----------------------------
#
# Connect carries error details as `{"type": "<typeName>", "value":
# "<base64 protobuf>"}`, and `readBlockedInfoOrEmpty` decodes
# `aiserver.v1.ErrorDetails` (`error` enum = 1, `details` message = 2)
# whose `CustomErrorDetails` has `title` = 1, `detail` = 2 and
# `additional_info` map = 7 (`utils_pb.ts`). Three field kinds, encoded
# by hand rather than adding a schema for one message.


def _varint(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value & 0x7F
        value >>= 7
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def _string(field: int, value: str) -> bytes:
    data = value.encode("utf-8")
    return _varint((field << 3) | 2) + _varint(len(data)) + data if data else b""


def _message(field: int, payload: bytes) -> bytes:
    return _varint((field << 3) | 2) + _varint(len(payload)) + payload


def encode_error_details(
    title: str, detail: str, additional_info: dict[str, str]
) -> dict[str, str]:
    custom = _string(1, title) + _string(2, detail)
    for key, value in additional_info.items():
        custom += _message(7, _string(1, key) + _string(2, value))
    body = (
        _varint((1 << 3) | 0)
        + _varint(ERROR_DETAILS_CUSTOM_MESSAGE)
        + _message(2, custom)
    )
    return {"type": ERROR_DETAILS_TYPE, "value": base64.b64encode(body).decode("ascii")}


def connect_error_for(error: Exception) -> ConnectError:
    """The host's refusals in the shapes `BrokeredHostConnector.connect`
    reads: the hint header for a blocked box (with `retry-after` and the
    details it shows), storage disabled and client update required; a
    missing host as `unavailable`; anything else as `internal`."""
    if isinstance(error, BoxBlocked):
        return ConnectError(
            "resource_exhausted",
            error.detail or "Simeon's cloud computer is blocked for now.",
            details=[
                encode_error_details(
                    error.title, error.detail, {SAND_BOX_BLOCK_REASON_KEY: error.reason}
                )
            ],
            headers={
                AUTOMATION_FAILURE_HINT_HEADER: SAND_BOX_BLOCKED,
                "retry-after": str(error.retry_after_s),
            },
        )
    if isinstance(error, BoxStorageDisabled):
        return ConnectError(
            "failed_precondition",
            str(error),
            headers={AUTOMATION_FAILURE_HINT_HEADER: CLOUD_AGENT_STORAGE_DISABLED},
        )
    if isinstance(error, BoxClientUpdateRequired):
        return ConnectError(
            "failed_precondition",
            str(error),
            headers={AUTOMATION_FAILURE_HINT_HEADER: SAND_CLIENT_UPDATE_REQUIRED},
        )
    if isinstance(error, BoxHostUnavailable):
        return ConnectError("unavailable", str(error))
    if isinstance(error, BoxHostError):
        return ConnectError("internal", str(error))
    if isinstance(error, BoxBrokerRefused):
        return ConnectError(error.code, error.message)  # type: ignore[arg-type]
    return ConnectError("internal", f"Simeon's cloud computer failed: {error}")


# --- the RPCs -----------------------------------------------------------------------


@service.unary("EnsureSandBox")
async def ensure_sand_box(call: ConnectCall) -> dict[str, Any]:
    try:
        box = await broker.ensure(call.db, call.caller)
    except (BoxHostError, BoxBrokerRefused) as error:
        log.warning(
            "sand.box.ensure.refused", user=str(call.caller.user_id), error=str(error)
        )
        raise connect_error_for(error)
    return {
        "cluster": "simeon",
        "tenantId": str(call.caller.user_id),
        "podId": str(box.id),
        "networkToken": box.network_token,
        "vncUrl": box.vnc_url,
        "forkVncBaseUrl": box.fork_vnc_base_url,
        "imageUpdateAvailable": False,
        "gatewayUrl": box.gateway_url,
        "gatewayToken": box.gateway_token,
    }


def _recreate_json(outcome: Any) -> dict[str, Any]:
    return {
        "started": outcome.started,
        "reason": outcome.reason,
        "operationId": outcome.operation_id,
    }


@service.unary("RecreateSandBox", auth="desktop-or-box")
async def recreate_sand_box(call: ConnectCall) -> dict[str, Any]:
    preserve = call.message.get("preserveData")
    force = call.message.get("force")
    try:
        outcome = await broker.recreate(
            call.db,
            call.caller,
            preserve_data=preserve is not False,
            force=force is True,
        )
    except BoxBrokerRefused as error:
        raise connect_error_for(error)
    return _recreate_json(outcome)


@service.unary("ForceRecreateSandBox")
async def force_recreate_sand_box(call: ConnectCall) -> dict[str, Any]:
    try:
        outcome = await broker.recreate(
            call.db, call.caller, preserve_data=False, force=True
        )
    except BoxBrokerRefused as error:
        raise connect_error_for(error)
    return _recreate_json(outcome)


@service.stream("WatchSandBoxMigration", auth="desktop-or-box")
async def watch_sand_box_migration(call: ConnectCall) -> AsyncIterator[dict[str, Any]]:
    box = await broker.box_of_watcher(call.db, call.caller)
    if box is None:
        return
    from_offset = call.message.get("fromOffsetKey")
    include_finished = call.message.get("includeFinished") is not False
    async for event in migrations.watch(
        box.id, from_offset if isinstance(from_offset, str) else "", include_finished
    ):
        yield event


@service.unary("GetSandBoxRunState", auth="desktop-or-box")
async def get_sand_box_run_state(call: ConnectCall) -> dict[str, Any]:
    state, update_available = await broker.run_state(call.db, call.caller)
    return {"state": state, "imageUpdateAvailable": update_available}


@service.unary("NotifySandAgentTurnFinished", auth="desktop-or-box")
async def notify_sand_agent_turn_finished(call: ConnectCall) -> dict[str, Any]:
    # Cursor pushed this to the person's phone. There is no push service
    # here; the turn is logged so a box that reports is a box that runs.
    log.info(
        "sand.box.turn_finished",
        user=str(call.caller.user_id),
        agent=str(call.message.get("agentId", "")),
        awaiting_user=bool(call.message.get("awaitingUserResponse", False)),
    )
    return {}


# --- the plain routes ---------------------------------------------------------------

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)


@router.post(
    "/sand-box/local-exec-daemon-credential", name="sand:local_exec_daemon_credential"
)
async def local_exec_daemon_credential(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    db: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """`{}` → `{credential, expiresAtMs}` (`BrokeredHostConnector.
    issueLocalExecDaemonCredential`). The Mac's local-exec daemon keeps it
    and trades it below when its gateway connection goes stale."""
    try:
        row, credential = await broker.issue_local_exec_credential(db, desktop_session)
    except BoxBrokerRefused as error:
        return JSONResponse({"error": error.message}, status_code=403)
    return JSONResponse(
        {
            "credential": credential,
            "expiresAtMs": int(row.refresh_expires_at.timestamp() * 1000),
        },
        headers={"cache-control": "no-store"},
    )


@router.post("/sand-box/local-exec-connection", name="sand:local_exec_connection")
async def local_exec_connection(
    request: Request, db: AsyncSession = Depends(get_db_session)
) -> JSONResponse:
    """`{credential}` → `{baseUrl, token, networkToken}`
    (`resolveLocalExecConnectionFromBackend` in `local-exec-daemon.ts`).
    404 when the person has no running cloud box, which the daemon reads
    as "no fresh connection" and keeps what it has."""
    try:
        body = await request.json()
    except Exception:
        body = None
    credential = body.get("credential") if isinstance(body, dict) else None
    if not isinstance(credential, str) or not credential:
        return JSONResponse({"error": "invalid_request"}, status_code=400)
    try:
        box = await broker.trade_local_exec_credential(db, credential)
    except BoxBrokerRefused as error:
        return JSONResponse(
            {"error": "invalid_grant", "message": error.message}, status_code=401
        )
    if box is None:
        return JSONResponse({"error": "no_box"}, status_code=404)
    return JSONResponse(
        {
            "baseUrl": box.gateway_url,
            "token": box.gateway_token,
            "networkToken": box.network_token,
        },
        headers={"cache-control": "no-store"},
    )


router.include_router(service.router)
router.include_router(box_proxy.router)

__all__ = ["connect_error_for", "encode_error_details", "router", "service"]
