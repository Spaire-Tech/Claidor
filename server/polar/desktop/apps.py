"""Apps (Gmail, Slack, GitHub, …) behind Simeon's own name.

The founder, 28 September 2026: "for the rest of the connectors, lets use
composio. but i want to white label it. i dont want anywhere to show
composio." So the app and the agent never talk to Composio and never see
its name. Each app is served here as an MCP server of our own, one per
toolkit, at `/desktop/api/apps/mcp/{toolkit}`, and the desktop's existing
connector code (`vendor-mcp/backend-exec.ts`, `http-mcp-client.ts`) treats
it like any vendor connector: tools listed and called over streamable
HTTP, a 401 read as "sign-in needed", which draws the connect card.

What is served, all scoped to the person by `composio_user_id` (the same
id the older forwarder in `composio.py` gives Composio, so a connection
made through it is kept):

- `GET  /api/apps` — `{"available": …}`, asked before any app card offers
  Connect.
- `POST /api/apps/mcp/{toolkit}` — MCP JSON-RPC: `initialize`, the
  notifications, `tools/list`, `tools/call`. The desktop and the box's
  own credential both reach it, because the tools run in the box.
- `GET  /api/apps/{toolkit}/status` — whether the person has the app
  connected. Desktop and box.
- `POST /api/apps/{toolkit}/connect` — the sign-in link. Desktop only.
- `DELETE /api/apps/{toolkit}` — disconnect. Desktop only.
- `GET  /apps/connected` — the page a finished sign-in lands on, ours.
- `GET  /apps/oauth/callback` — the redirect URI to register in a
  provider's console when Simeon Labs brings its own OAuth app, so the
  address bar shows api.simeonlabs.com; forwarded to Composio's callback.

Every text that reaches a person or the agent — tool descriptions,
errors — has the word Composio replaced (`scrub`).
"""

from __future__ import annotations

import html
import json
import re
import time
from typing import Any
from urllib.parse import urlencode

import httpx
import structlog
from fastapi import Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from polar.config import settings
from polar.models import DesktopSession, User
from polar.routing import APIRouter

from .auth import get_desktop_or_box_session, get_desktop_session
from .composio import composio_user_id, configured

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

_TOOLKIT = re.compile(r"^[a-z0-9_]{1,64}$")
_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
_PROTOCOL_VERSION = "2025-06-18"
_TOOLS_TTL_S = 600.0
# A toolkit with hundreds of tools (GitHub has several hundred) would fill
# the model's context; the featured ("important") tools are served when
# there are enough of them, else the first of the full list.
_MAX_TOOLS = 80
_MIN_IMPORTANT = 5
_OUTPUT_LIMIT = 60_000
COMPOSIO_CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback"
NOT_CONFIGURED = "Apps are not switched on for this server yet."

_tools_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_sessions: dict[str, str] = {}


def scrub(text: str) -> str:
    """No sentence we pass on names the provider behind the apps."""
    text = re.sub(r"(?i)\bcomposio\.dev\b", "simeonlabs.com", text)
    return re.sub(r"(?i)composio", "Simeon", text)


def valid_toolkit(toolkit: str) -> bool:
    return _TOOLKIT.match(toolkit) is not None


def connected_page_url() -> str:
    return f"{settings.BASE_URL.rstrip('/')}/desktop/apps/connected"


def _api_url(path: str) -> str:
    return f"{settings.COMPOSIO_BASE_URL.rstrip('/')}/{path.lstrip('/')}"


async def _call(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    headers = {"x-api-key": settings.COMPOSIO_API_KEY, "accept": "application/json"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.request(
            method, _api_url(path), headers=headers, params=params, json=body
        )
    try:
        payload: Any = response.json()
    except ValueError:
        payload = response.text
    if response.status_code >= 400:
        log.warning(
            "desktop.apps.upstream_refused",
            path=path,
            status=response.status_code,
            body=str(payload)[:2_000],
        )
    return response.status_code, payload


def _upstream_message(payload: Any) -> str:
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return scrub(error["message"])
        if isinstance(error, str) and error:
            return scrub(error)
        if isinstance(payload.get("message"), str):
            return scrub(payload["message"])
    return "The app did not answer."


async def active_account_ids(user: User, toolkit: str) -> list[str]:
    status, payload = await _call(
        "GET",
        "api/v3.1/connected_accounts",
        params={
            "user_ids": [composio_user_id(user)],
            "toolkit_slugs": [toolkit],
            "statuses": ["ACTIVE"],
            "limit": 10,
        },
    )
    if status >= 400 or not isinstance(payload, dict):
        raise AppsUpstreamError(_upstream_message(payload), status)
    items = payload.get("items") or []
    return [
        str(item["id"])
        for item in items
        if isinstance(item, dict)
        and isinstance(item.get("id"), str)
        and str(item.get("status", "")).upper() == "ACTIVE"
    ]


class AppsUpstreamError(Exception):
    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


async def toolkit_tools(toolkit: str) -> list[dict[str, Any]]:
    cached = _tools_cache.get(toolkit)
    if cached is not None and time.monotonic() - cached[0] < _TOOLS_TTL_S:
        return cached[1]

    async def fetch(important: bool) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"toolkit_slug": toolkit, "limit": _MAX_TOOLS}
        if important:
            params["important"] = "true"
        status, payload = await _call("GET", "api/v3.1/tools", params=params)
        if status >= 400 or not isinstance(payload, dict):
            raise AppsUpstreamError(_upstream_message(payload), status)
        return [
            item
            for item in payload.get("items") or []
            if isinstance(item, dict)
            and isinstance(item.get("slug"), str)
            and not item.get("is_deprecated", False)
        ]

    items = await fetch(True)
    if len(items) < _MIN_IMPORTANT:
        items = await fetch(False)
    tools = [
        {
            "name": item["slug"],
            "description": scrub(
                str(item.get("description") or item.get("name") or item["slug"])
            ),
            "inputSchema": item.get("input_parameters")
            if isinstance(item.get("input_parameters"), dict)
            else {"type": "object", "properties": {}},
        }
        for item in items[:_MAX_TOOLS]
    ]
    _tools_cache[toolkit] = (time.monotonic(), tools)
    return tools


async def _session_id(user: User) -> str:
    """One tool-router session per person, for sign-in links: it picks the
    toolkit's managed auth config on its own."""
    key = composio_user_id(user)
    known = _sessions.get(key)
    if known is not None:
        return known
    status, payload = await _call(
        "POST", "api/v3.1/tool_router/session", body={"user_id": key}
    )
    if status >= 400 or not isinstance(payload, dict) or not payload.get("session_id"):
        raise AppsUpstreamError(_upstream_message(payload), status)
    _sessions[key] = str(payload["session_id"])
    return _sessions[key]


async def sign_in_link(user: User, toolkit: str) -> str:
    body = {"toolkit": toolkit, "callback_url": connected_page_url()}
    session_id = await _session_id(user)
    status, payload = await _call(
        "POST", f"api/v3.1/tool_router/session/{session_id}/link", body=body
    )
    if status == 404:
        # The session expired upstream; one new one.
        _sessions.pop(composio_user_id(user), None)
        session_id = await _session_id(user)
        status, payload = await _call(
            "POST", f"api/v3.1/tool_router/session/{session_id}/link", body=body
        )
    if status >= 400 or not isinstance(payload, dict):
        raise AppsUpstreamError(_upstream_message(payload), status)
    url = payload.get("redirect_url")
    if not isinstance(url, str) or not url:
        raise AppsUpstreamError("No sign-in link came back for this app.", 502)
    return url


def _error(message: str, status: int) -> JSONResponse:
    return JSONResponse(
        {"error": {"type": "apps_error", "message": message}}, status_code=status
    )


def _guard(toolkit: str) -> JSONResponse | None:
    if not configured():
        return _error(NOT_CONFIGURED, 503)
    if not valid_toolkit(toolkit):
        return _error("Unknown app.", 404)
    return None


# --- MCP ---------------------------------------------------------------------


def _rpc_result(request_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _rpc_error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": code, "message": message},
    }


def _call_content(data: Any) -> str:
    text = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    text = scrub(text)
    if len(text) > _OUTPUT_LIMIT:
        text = text[:_OUTPUT_LIMIT] + "… (cut)"
    return text


async def _handle(
    user: User, toolkit: str, message: dict[str, Any]
) -> dict[str, Any] | Response | None:
    method = message.get("method")
    request_id = message.get("id")
    if not isinstance(method, str):
        return _rpc_error(request_id, -32600, "Invalid request.")
    if method.startswith("notifications/"):
        return None
    if method == "initialize":
        params = message.get("params") or {}
        version = params.get("protocolVersion") if isinstance(params, dict) else None
        return _rpc_result(
            request_id,
            {
                "protocolVersion": version
                if isinstance(version, str)
                else _PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "Simeon", "version": "1"},
            },
        )
    if method == "ping":
        return _rpc_result(request_id, {})
    if method == "tools/list":
        if not await active_account_ids(user, toolkit):
            return _error("This app is not connected yet.", 401)
        return _rpc_result(request_id, {"tools": await toolkit_tools(toolkit)})
    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name") if isinstance(params, dict) else None
        arguments = params.get("arguments") if isinstance(params, dict) else None
        if not isinstance(name, str) or not name:
            return _rpc_error(request_id, -32602, "A tool name is required.")
        known = {tool["name"] for tool in await toolkit_tools(toolkit)}
        if name not in known and not name.upper().startswith(f"{toolkit.upper()}_"):
            return _rpc_error(request_id, -32602, f"{name} is not a tool of this app.")
        accounts = await active_account_ids(user, toolkit)
        if not accounts:
            return _error("This app is not connected yet.", 401)
        status, payload = await _call(
            "POST",
            f"api/v3.1/tools/execute/{name}",
            body={
                "user_id": composio_user_id(user),
                "connected_account_id": accounts[0],
                "arguments": arguments if isinstance(arguments, dict) else {},
            },
        )
        if status >= 400 or not isinstance(payload, dict):
            return _rpc_result(
                request_id,
                {
                    "content": [{"type": "text", "text": _upstream_message(payload)}],
                    "isError": True,
                },
            )
        ok = payload.get("successful") is True
        text = (
            _call_content(payload.get("data"))
            if ok
            else scrub(str(payload.get("error") or "The app refused the call."))
        )
        return _rpc_result(
            request_id, {"content": [{"type": "text", "text": text}], "isError": not ok}
        )
    return _rpc_error(request_id, -32601, f"{method} is not supported.")


@router.get("/api/apps", name="desktop:apps_available")
async def apps_available(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> JSONResponse:
    """Whether apps can be connected here. The desktop asks before it offers
    Connect on any app card (`vendor-mcp/apps-availability.ts`): a server
    without this route, or without the provider's key, keeps them Coming
    soon instead of sending the person nowhere."""
    return JSONResponse({"available": configured()})


@router.post("/api/apps/mcp/{toolkit}", name="desktop:apps_mcp")
async def apps_mcp(
    toolkit: str,
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> Response:
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    try:
        message = json.loads(await request.body() or b"null")
    except ValueError:
        return JSONResponse(_rpc_error(None, -32700, "Parse error."), status_code=400)
    if not isinstance(message, dict):
        return JSONResponse(
            _rpc_error(None, -32600, "Send one JSON-RPC message."), status_code=400
        )
    try:
        answer = await _handle(desktop_session.user, toolkit, message)
    except AppsUpstreamError as error:
        return JSONResponse(
            _rpc_error(message.get("id"), -32000, str(error)), status_code=200
        )
    except httpx.HTTPError:
        return JSONResponse(
            _rpc_error(message.get("id"), -32000, "The app could not be reached."),
            status_code=200,
        )
    if answer is None:
        return Response(status_code=202)
    if isinstance(answer, Response):
        return answer
    return JSONResponse(answer)


# --- sign-in -----------------------------------------------------------------


@router.get("/api/apps/{toolkit}/status", name="desktop:apps_status")
async def apps_status(
    toolkit: str,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> JSONResponse:
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    try:
        accounts = await active_account_ids(desktop_session.user, toolkit)
    except (AppsUpstreamError, httpx.HTTPError) as error:
        return _error(str(error) or "The app could not be reached.", 502)
    return JSONResponse({"toolkit": toolkit, "connected": len(accounts) > 0})


@router.post("/api/apps/{toolkit}/connect", name="desktop:apps_connect")
async def apps_connect(
    toolkit: str,
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    try:
        if await active_account_ids(desktop_session.user, toolkit):
            return JSONResponse({"toolkit": toolkit, "connected": True})
        url = await sign_in_link(desktop_session.user, toolkit)
    except (AppsUpstreamError, httpx.HTTPError) as error:
        return _error(str(error) or "The app could not be reached.", 502)
    log.info(
        "desktop.apps.sign_in_started",
        toolkit=toolkit,
        user_id=str(desktop_session.user.id),
    )
    return JSONResponse({"toolkit": toolkit, "connected": False, "url": url})


@router.delete("/api/apps/{toolkit}", name="desktop:apps_disconnect")
async def apps_disconnect(
    toolkit: str,
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    try:
        accounts = await active_account_ids(desktop_session.user, toolkit)
        for account in accounts:
            await _call("DELETE", f"api/v3.1/connected_accounts/{account}")
    except (AppsUpstreamError, httpx.HTTPError) as error:
        return _error(str(error) or "The app could not be reached.", 502)
    return JSONResponse({"toolkit": toolkit, "disconnected": len(accounts)})


_CONNECTED_PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Simeon</title>
<style>:root{{color-scheme:light dark}}body{{margin:0;min-height:100vh;display:grid;place-items:center;
font:16px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;background:#f5f5f7;color:#1d1d1f}}
@media (prefers-color-scheme:dark){{body{{background:#1c1c1e;color:#f5f5f7}}.card{{background:#2c2c2e}}}}
.card{{background:#fff;border-radius:18px;padding:36px 40px;text-align:center;max-width:360px;
box-shadow:0 0 0 .5px rgba(20,30,60,.08),0 1px 2px rgba(20,30,60,.05)}}
h1{{font-size:20px;font-weight:600;margin:0 0 6px}}p{{margin:0;opacity:.7}}</style></head>
<body><div class="card"><h1>{title}</h1><p>{body}</p></div></body></html>"""


@router.get("/apps/connected", name="desktop:apps_connected")
async def apps_connected(request: Request) -> HTMLResponse:
    failed = str(request.query_params.get("status", "")).lower() in {"failed", "error"}
    title = "That didn't work" if failed else "Connected"
    body = (
        "Go back to Simeon and try again."
        if failed
        else "You can close this tab and go back to Simeon."
    )
    return HTMLResponse(
        _CONNECTED_PAGE.format(title=html.escape(title), body=html.escape(body)),
        headers={"cache-control": "no-store"},
    )


@router.get("/apps/oauth/callback", name="desktop:apps_oauth_callback")
async def apps_oauth_callback(request: Request) -> RedirectResponse:
    query = urlencode(list(request.query_params.multi_items()))
    return RedirectResponse(
        f"{COMPOSIO_CALLBACK}?{query}" if query else COMPOSIO_CALLBACK, status_code=302
    )


__all__ = ["active_account_ids", "router", "scrub", "toolkit_tools"]
