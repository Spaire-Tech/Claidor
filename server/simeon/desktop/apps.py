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
- `POST /api/apps/{toolkit}/connect` — the sign-in link. Desktop and,
  since Simeon on the web (4 October 2026), the box: the window on the web
  starts a sign-in through the manager in the box.
  `{"another": true}` starts a sign-in for one more account (Add Another
  Account, 29 October 2026).
- `DELETE /api/apps/{toolkit}` — disconnect. Desktop and box, likewise.
- `GET /api/apps/{toolkit}/accounts`, `PATCH` and `DELETE
  /api/apps/{toolkit}/accounts/{id}` — the person's accounts of one app,
  one renamed, one removed (the app's page in the iPhone and Mac apps).
  With several accounts each tool takes `use_account`, which one the call
  is for (`ACCOUNT_FIELD`); the agent asks the person when they haven't said.
- `POST /api/apps/{toolkit}/files` — a file a tool takes (an email's
  attachment), uploaded to the provider for the box (28 October 2026). The
  tool lists such a field as the path of a file on the computer
  (`files_as_paths`); the box reads the file there, sends it here, and
  calls the tool with the reference this answers
  (`desktop/source/shared/node/vendor-mcp/app-files.ts`).
- `GET  /apps/connected` — the page a finished sign-in lands on, ours.
- `GET  /apps/oauth/callback` — the redirect URI to register in a
  provider's console when Simeon Labs brings its own OAuth app, so the
  address bar shows api.simeonlabs.com; forwarded to Composio's callback.
- `GET  /apps/start` — where every sign-in starts (13 October 2026, the
  founder: "white label composio as best as you can"): a signed link of
  ours that sends the browser on to the provider's own sign-in page, so
  the iPhone's and the Mac's sign-in sheet say simeonlabs.com, and
  Composio's own link page is skipped whenever it only redirects
  (`provider_page`).

Every text that reaches a person or the agent — tool descriptions,
errors — has the word Composio replaced (`scrub`).
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import html
import json
import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import httpx
import structlog
from fastapi import Depends, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response

from simeon.config import settings
from simeon.models import DesktopSession, User
from simeon.routing import APIRouter

from .app_results import tidy_result
from .auth import get_desktop_or_box_session
from .composio import composio_user_id, configured
from .language import current_language
from .words import say

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

_TOOLKIT = re.compile(r"^[a-z0-9_]{1,64}$")
_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
# A Composio call slower than this is logged, so "it takes forever" has a line.
# At 5 s (until 16 October 2026) the ~1.8 s answers to every connector not
# signed in, which each agent turn waited for, left no line at all.
_SLOW_CALL_MS = 1_000
_PROTOCOL_VERSION = "2025-06-18"
#: The most a file may weigh: Gmail's and Outlook's limit for a whole message.
_MAX_FILE_BYTES = 25 * 1024 * 1024
_TOOL_SLUG = re.compile(r"^[A-Z0-9_]{1,128}$")
_MIMETYPE = re.compile(r"^[\w.+-]+/[\w.+-]+$")
#: The provider's own upload: asked for a presigned address, then the bytes
#: go there (its SDKs, read 28 October 2026: `{md5, filename, mimetype,
#: tool_slug, toolkit_slug}` → `{key, new_presigned_url}`; a tool then
#: takes `{name, mimetype, s3key}`).
_FILE_UPLOAD = "api/v3/files/upload/request"
#: What a file field says once it takes a path (`files_as_paths`).
_FILE_FIELD = (
    "The absolute path of a file on the computer "
    "(for example /home/user/Downloads/report.pdf); Simeon uploads it."
)
_TOOLS_TTL_S = 600.0
# Every app is served its whole tool list, featured ("important") tools
# first: the agent reads a tool's schema only when it needs it (GetMcpTools),
# so a long list costs names, not schemas. Serving only the featured tools
# whenever there were five of them left LinkedIn with 6 of its 22 (no post,
# comment or delete) and most other apps short too (1 October 2026).
# GitHub alone, at several hundred tools, still gets its featured tools.
_FEATURED_ONLY = frozenset({"github"})
_MAX_FEATURED = 80
_MIN_IMPORTANT = 5
_PAGE_LIMIT = 1000
_MAX_PAGES = 5
COMPOSIO_CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback"
#: The provider's own addresses: a sign-in link on one of them is followed
#: to the app's sign-in page when it only redirects there (`provider_page`).
_COMPOSIO_DOMAINS = ("composio.dev", "composio.io")
#: How long a start link of ours is good for (the provider's own lasts about as long).
_START_TTL_S = 15 * 60
#: Asking the provider's link where it leads: a quick question, never a wait for the person.
_LINK_TIMEOUT_S = 5.0
#: The provider's hosted Connect page, `connect.composio.dev/link/lk_…`
#: (`provider_page`): the token its page hands on with.
_LINK_PAGE = re.compile(r"^/link/(lk_[A-Za-z0-9_-]{4,64})/?$")
#: What the provider's Connect page asks its own backend, without a key,
#: to find where the sign-in goes (read from the page's script on 13
#: October 2026; the documented way, `long_redirect_url`, is refused for
#: the provider's own sign-ins since July 2026).
_LINK_SESSION = "api/v3.1/internal/connected_accounts/link/{token}"
#: The apps that open a sign-in and are sent back to once it is done
#: (`apps_start`, `apps_connected`): the iPhone's scheme and the Mac's,
#: with the Mac's earlier one.
_APP_SCHEMES = frozenset({"simeon-ios", "simeon", "simeon-mac"})
#: Which app opened the sign-in, for the page it ends on.
_BACK_COOKIE = "simeon_apps_back"
NOT_CONFIGURED = "Apps are not switched on for this server yet."

#: Apps whose provider lends no sign-in of its own (measured 11 October
#: 2026: no managed OAuth for these). Their link works once Simeon Labs
#: registers its own app with each company and names the auth config in
#: `COMPOSIO_AUTH_CONFIGS` (docs/services-agents.md, 7c); until then a refused
#: link is "coming soon" on the card, not the provider's error. Klaviyo and
#: Ashby left the list on 13 October 2026: the apps reach their makers' own
#: MCP servers instead, which sign anyone in. Shopify's own server reads
#: Simeon's client document (`app_sign_in.py`) but takes only clients it has
#: approved, so Shopify stays here until it approves Simeon. OneNote and
#: Microsoft To Do joined the same day (Composio's toolkit pages: "requires
#: connections to go through your own OAuth app"); Simeon Labs' Microsoft
#: app, once registered, serves them with Teams and Outlook. Meta Ads, Jobber,
#: BambooHR, TikTok, Follow Up Boss, Matterport, ZoomInfo and Clio joined on
#: 22 October 2026 (their toolkit pages: "Composio-managed OAuth available?
#: No"; Meta's and Jobber's own MCP servers register no clients of ours, and
#: BambooHR's is one per company).
OWN_APP_NEEDED = frozenset(
    {
        "gusto",
        "xero",
        "shopify",
        "brex",
        "pipedrive",
        "docusign",
        "onenote",
        "microsoft_todo",
        "metaads",
        "jobber",
        "bamboohr",
        "tiktok",
        "follow_up_boss",
        "matterport",
        "zoominfo",
        "clio_manage",
    }
)


def own_auth_configs() -> dict[str, str]:
    """Simeon Labs' own sign-in per app (`COMPOSIO_AUTH_CONFIGS`), the
    well-formed entries only: a toolkit slug and an `ac_` id."""
    return {
        toolkit: config
        for toolkit, config in settings.COMPOSIO_AUTH_CONFIGS.items()
        if valid_toolkit(toolkit)
        and isinstance(config, str)
        and config.startswith("ac_")
    }


@dataclass(frozen=True)
class AppAccount:
    """One account a person has connected to an app (a second Gmail, a
    second Slack workspace: Add Another Account, 29 October 2026)."""

    id: str
    #: The person's own name for it ("Work"), the provider's alias.
    name: str | None
    #: Who it signs in as, as the app says (Gmail's address), when it says.
    identity: str | None
    #: What the agent and the apps call it, unique among the app's accounts.
    label: str

    def described(self) -> str:
        if self.identity is not None and self.identity != self.label:
            return f"{self.label} ({self.identity})"
        return self.label

    def answers_to(self, asked: str) -> bool:
        key = asked.strip().casefold()
        return bool(key) and key in {
            one.casefold()
            for one in (self.label, self.name, self.identity, self.id)
            if one
        }

    def as_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "identity": self.identity,
            "label": self.label,
        }


#: How many accounts of one app a person may connect (the provider's own
#: default for a session, which allows 2 to 10).
MAX_ACCOUNTS = 5
#: The argument each tool takes once several accounts of its app are
#: connected: which one the call is for.
ACCOUNT_FIELD = "use_account"
_ACCOUNT_NAME_MAX = 40

_tools_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_sessions: dict[str, str] = {}
# Which accounts a person has connected, per app, for the agent's tool calls.
# Every tools/list and tools/call asked the provider again before doing the
# work: one more round trip on each Gmail step. A connected answer is kept a
# minute; "not connected" is never kept, so an app connected a moment ago
# works at once, and disconnecting forgets it.
_ACCOUNTS_TTL_S = 60.0
_accounts_cache: dict[tuple[str, str], tuple[float, list[AppAccount]]] = {}


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
    started = time.monotonic()
    # A timeout or a dropped connection used to leave no line at all: the
    # caller answers the app "could not be reached" and Render showed a 200.
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.request(
                method, _api_url(path), headers=headers, params=params, json=body
            )
    except httpx.HTTPError as error:
        log.warning(
            "desktop.apps.upstream_unreachable",
            path=path,
            error=type(error).__name__,
            elapsed_ms=round((time.monotonic() - started) * 1000),
        )
        raise
    elapsed_ms = round((time.monotonic() - started) * 1000)
    if elapsed_ms >= _SLOW_CALL_MS:
        log.info("desktop.apps.upstream_slow", path=path, elapsed_ms=elapsed_ms)
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


async def connected_accounts(user: User, toolkit: str) -> list[AppAccount]:
    """active_accounts, kept a minute when the app is connected."""
    key = (composio_user_id(user), toolkit)
    cached = _accounts_cache.get(key)
    if cached is not None and time.monotonic() - cached[0] < _ACCOUNTS_TTL_S:
        return cached[1]
    return await fresh_accounts(user, toolkit)


async def fresh_accounts(user: User, toolkit: str) -> list[AppAccount]:
    """active_accounts asked now, and kept for the agent's next calls."""
    key = (composio_user_id(user), toolkit)
    accounts = await active_accounts(user, toolkit)
    if accounts:
        _accounts_cache[key] = (time.monotonic(), accounts)
    else:
        _accounts_cache.pop(key, None)
    return accounts


def forget_user(user: User) -> None:
    """Drop what this process remembers of a person (their sign-in session
    upstream and which apps they had connected): their account was deleted."""
    key = composio_user_id(user)
    _sessions.pop(key, None)
    for cached in [one for one in _accounts_cache if one[0] == key]:
        _accounts_cache.pop(cached, None)


async def active_account_ids(user: User, toolkit: str) -> list[str]:
    return [account.id for account in await active_accounts(user, toolkit)]


def _text(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


async def active_accounts(user: User, toolkit: str) -> list[AppAccount]:
    """The person's connected accounts of one app, the first connected
    first. Each is named by the person's own name for it, else by who it
    signs in as (the provider's `state.val.displayName`, documented as the
    account's identity, such as the Gmail address), else by its place."""
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
    items = [
        item
        for item in payload.get("items") or []
        if isinstance(item, dict)
        and isinstance(item.get("id"), str)
        and str(item.get("status", "")).upper() == "ACTIVE"
    ]
    items.sort(key=lambda item: str(item.get("created_at") or ""))
    accounts: list[AppAccount] = []
    taken: set[str] = set()
    for place, item in enumerate(items, start=1):
        state = item.get("state")
        values = state.get("val") if isinstance(state, dict) else None
        name = _text(item.get("alias"))
        identity = (
            _text(values.get("displayName")) if isinstance(values, dict) else None
        )
        label = name or identity or f"Account {place}"
        unique, more = label, 2
        while unique.casefold() in taken:
            unique, more = f"{label} ({more})", more + 1
        taken.add(unique.casefold())
        accounts.append(
            AppAccount(id=str(item["id"]), name=name, identity=identity, label=unique)
        )
    return accounts


_SCOPE_MISSING = re.compile(
    r"insufficient[ _]?(authentication[ _]?)?scopes?|ACCESS_TOKEN_SCOPE_INSUFFICIENT"
    r"|insufficientPermissions",
    re.IGNORECASE,
)


def scope_guidance(toolkit: str, error: str, several: AppAccount | None = None) -> str:
    """A refusal for a missing permission, with the way out in front. Google's
    consent screen shows one checkbox per permission and leaves them unticked;
    a sign-in that skipped the mail box is "connected" and refuses every read
    (7 October 2026, Gmail: "Request had insufficient authentication
    scopes"). The agent is told the fix the person can actually do. With
    several accounts of the app (`several`, the one that refused), signing
    the app out would sign out every one, so the person redoes that one."""
    if _SCOPE_MISSING.search(error) is None:
        return error
    if several is not None:
        return (
            f"The {toolkit} account {several.label} was connected without the "
            "permission this needs. Tell the user to open this app's page in "
            f"Simeon, remove {several.label}, and add it again with Add Another "
            "Account, ticking every box on the permissions screen. Don't call "
            "AuthenticateMcpServer with force_reauth: it signs out every account "
            f"of this app. The app said: {error}"
        )
    return (
        f"This {toolkit} sign-in was completed without the permission this needs. "
        "Call AuthenticateMcpServer for this app with force_reauth true: it signs "
        "the app out and shows a new sign-in card. Tell the user to tick every "
        f"box on the permissions screen this time. The app said: {error}"
    )


def _path_field(schema: dict[str, Any]) -> dict[str, Any]:
    description = schema.get("description")
    return {
        "type": "string",
        "description": f"{_FILE_FIELD} {description}"
        if isinstance(description, str) and description
        else _FILE_FIELD,
        "file_uploadable": True,
        **({"title": schema["title"]} if isinstance(schema.get("title"), str) else {}),
    }


def _mentions_file(schema: Any) -> bool:
    return '"file_uploadable": true' in json.dumps(schema)


def _paths(schema: Any, defs: dict[str, Any], depth: int) -> Any:
    if depth > 32:
        return schema
    if isinstance(schema, list):
        return [_paths(item, defs, depth + 1) for item in schema]
    if not isinstance(schema, dict):
        return schema
    if schema.get("file_uploadable") is True:
        return _path_field(schema)
    ref = schema.get("$ref")
    if isinstance(ref, str) and ref in defs and _mentions_file(defs[ref]):
        # A file behind a reference is brought in place, so the box finds it
        # without resolving references; the field's own words are kept.
        target = _paths(defs[ref], defs, depth + 1)
        rest = {key: value for key, value in schema.items() if key != "$ref"}
        if isinstance(target, dict) and target.get("file_uploadable") is True:
            return _path_field(
                {**target, **rest, "description": rest.get("description")}
            )
        return {**target, **rest} if isinstance(target, dict) else target
    return {key: _paths(value, defs, depth + 1) for key, value in schema.items()}


def files_as_paths(schema: Any) -> Any:
    """A tool's input schema with each file it takes (`file_uploadable`, the
    provider's `{name, mimetype, s3key}`, which nothing the agent can write)
    asked for as the path of a file on the computer, as the provider's own
    SDKs present it. The box uploads that file before the call (`apps_file`)."""
    defs: dict[str, Any] = {}
    if isinstance(schema, dict):
        for key in ("$defs", "definitions"):
            named = schema.get(key)
            if isinstance(named, dict):
                defs.update({f"#/{key}/{name}": value for name, value in named.items()})
    return _paths(schema, defs, 0)


class AppsUpstreamError(Exception):
    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


async def toolkit_tools(toolkit: str) -> list[dict[str, Any]]:
    cached = _tools_cache.get(toolkit)
    if cached is not None and time.monotonic() - cached[0] < _TOOLS_TTL_S:
        return cached[1]

    async def fetch(important: bool, limit: int, pages: int) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        cursor: str | None = None
        for _ in range(pages):
            params: dict[str, Any] = {"toolkit_slug": toolkit, "limit": limit}
            if important:
                params["important"] = "true"
            if cursor is not None:
                params["cursor"] = cursor
            status, payload = await _call("GET", "api/v3.1/tools", params=params)
            if status >= 400 or not isinstance(payload, dict):
                raise AppsUpstreamError(_upstream_message(payload), status)
            items.extend(
                item
                for item in payload.get("items") or []
                if isinstance(item, dict)
                and isinstance(item.get("slug"), str)
                and not item.get("is_deprecated", False)
            )
            next_cursor = payload.get("next_cursor")
            if not isinstance(next_cursor, str) or not next_cursor:
                break
            cursor = next_cursor
        return items

    if toolkit in _FEATURED_ONLY:
        items = await fetch(True, _MAX_FEATURED, 1)
        if len(items) < _MIN_IMPORTANT:
            items = await fetch(False, _MAX_FEATURED, 1)
        items = items[:_MAX_FEATURED]
    else:
        featured = await fetch(True, _PAGE_LIMIT, _MAX_PAGES)
        everything = await fetch(False, _PAGE_LIMIT, _MAX_PAGES)
        seen: set[str] = set()
        items = []
        for item in [*featured, *everything]:
            if item["slug"] not in seen:
                seen.add(item["slug"])
                items.append(item)
    tools = [
        {
            "name": item["slug"],
            # MCP's display name: the overlay shows "Create a LinkedIn post"
            # instead of the slug.
            **(
                {"title": scrub(item["name"])}
                if isinstance(item.get("name"), str) and item["name"]
                else {}
            ),
            "description": scrub(
                str(item.get("description") or item.get("name") or item["slug"])
            ),
            "inputSchema": files_as_paths(item["input_parameters"])
            if isinstance(item.get("input_parameters"), dict)
            else {"type": "object", "properties": {}},
        }
        for item in items
    ]
    _tools_cache[toolkit] = (time.monotonic(), tools)
    return tools


async def _session_id(user: User) -> str:
    """One tool-router session per person, for sign-in links. It uses the
    provider's own sign-in for each app unless Simeon Labs' own is named in
    `COMPOSIO_AUTH_CONFIGS`: a config the session is not given is never
    used (the provider's documentation, checked 11 October 2026). Several
    accounts of one app are allowed (`multi_account`, the provider's
    documentation, 29 October 2026): each link makes a new one. The agent's
    calls never go through the session; each names its account."""
    key = composio_user_id(user)
    known = _sessions.get(key)
    if known is not None:
        return known
    body: dict[str, Any] = {
        "user_id": key,
        "multi_account": {"enable": True, "max_accounts_per_toolkit": MAX_ACCOUNTS},
    }
    configs = own_auth_configs()
    if configs:
        body["auth_configs"] = configs
    status, payload = await _call("POST", "api/v3.1/tool_router/session", body=body)
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


def choose_account(url: str) -> str:
    """Google's sign-in for another account opens on its account chooser
    (`prompt=select_account`, kept beside the `consent` it may already
    ask): without it, Google signs in the account the browser already
    has, which is the one already connected."""
    parts = urlsplit(url)
    if (parts.hostname or "").lower() != "accounts.google.com":
        return url
    query = parse_qsl(parts.query, keep_blank_values=True)
    prompts = [
        word for key, value in query if key == "prompt" for word in value.split()
    ]
    if "select_account" in prompts:
        return url
    kept = [(key, value) for key, value in query if key != "prompt"]
    kept.append(("prompt", " ".join(["select_account", *prompts])))
    return urlunsplit(parts._replace(query=urlencode(kept)))


def _is_composio(url: str) -> bool:
    host = (urlsplit(url).hostname or "").lower()
    return any(host == one or host.endswith("." + one) for one in _COMPOSIO_DOMAINS)


async def _past_link_page(url: str) -> str | None:
    """Where the provider's hosted Connect page would send the person, asked
    for here so they never see it (the founder, 13 October 2026: "that
    simeon wants to connect page makes no sense ... it goes to the page
    that ends connection immediately without me clicking anything. please
    remove it as we already have our consent page"). The page does just
    this when the app asks for nothing (a shop's or a subdomain's name):
    it reads its link, and with nothing to ask it starts the sign-in at
    once and goes where that answers. Anything else, or any answer not
    understood, and the page is kept: it still works, one screen longer."""
    parts = urlsplit(url)
    match = _LINK_PAGE.match(parts.path)
    if not _is_composio(url) or match is None:
        return None
    session_url = _api_url(_LINK_SESSION.format(token=match.group(1)))
    try:
        async with httpx.AsyncClient(timeout=_LINK_TIMEOUT_S) as client:
            read = await client.get(session_url, headers={"accept": "application/json"})
            link = read.json() if read.status_code == 200 else None
            account = link.get("connected_account") if isinstance(link, dict) else None
            if not isinstance(account, dict):
                log.info("desktop.apps.link_kept", reason=f"read {read.status_code}")
                return None
            shared = (account.get("experimental") or {}).get("account_type") == "SHARED"
            if (
                account.get("status") != "INITIALIZING"
                or account.get("expected_input_fields")
                or shared
            ):
                # A form to fill, a team account, or a sign-in already under way: the page asks.
                log.info("desktop.apps.link_kept", reason="the page asks something")
                return None
            started = await client.post(
                session_url, headers={"accept": "application/json"}, json={"input": {}}
            )
            answer = started.json() if started.status_code < 300 else None
    except (httpx.HTTPError, ValueError) as error:
        log.info("desktop.apps.link_kept", reason=type(error).__name__)
        return None
    if not isinstance(answer, dict):
        log.warning("desktop.apps.link_kept", reason=f"start {started.status_code}")
        return None
    to = answer.get("redirect_url")
    if (
        not isinstance(to, str)
        or answer.get("status") != "INITIATED"
        or urlsplit(to).scheme != "https"
    ):
        log.warning("desktop.apps.link_kept", reason=f"start {started.status_code}")
        return None
    return to


async def provider_page(url: str) -> str:
    """The app's own sign-in page behind the provider's link (white label,
    13 October 2026): the link is asked for where it leads, without
    following it, as the browser would; while it only redirects (as the
    provider's documented `long_redirect_url` does), the person goes
    straight to Google's, Slack's or HubSpot's page and never sees the
    provider's. The hosted "Connect" page is asked the same way
    (`_past_link_page`); one that has something to ask is kept as it is,
    and so is any link when the provider can't be asked."""
    past = await _past_link_page(url)
    if past is not None:
        url = past
    current = url
    for _ in range(4):
        if not _is_composio(current):
            break
        try:
            async with httpx.AsyncClient(
                timeout=_LINK_TIMEOUT_S, follow_redirects=False
            ) as client:
                response = await client.get(current, headers={"accept": "text/html"})
        except httpx.HTTPError as error:
            log.info("desktop.apps.link_kept", reason=type(error).__name__)
            return url
        location = response.headers.get("location")
        if response.status_code not in {301, 302, 303, 307, 308} or not location:
            log.info("desktop.apps.link_kept", reason=f"status {response.status_code}")
            return url
        current = urljoin(current, location)
    if _is_composio(current) or urlsplit(current).scheme != "https":
        return url
    log.info("desktop.apps.link_direct", host=urlsplit(current).hostname)
    return current


def _start_signature(expires: int, url: str) -> str:
    message = f"simeon-apps-start|{expires}|{url}".encode()
    return hmac.new(settings.SECRET.encode(), message, hashlib.sha256).hexdigest()


def start_url(url: str, *, now: float | None = None) -> str:
    """A link of ours that leads to `url`, signed so it leads nowhere else
    and good for a quarter of an hour: where the sign-in sheet opens, so it
    names simeonlabs.com.

    The address travels as base64url (`t`), letters, digits, `-` and `_`
    only. Until 13 October 2026 it travelled as itself (`to`), and the apps,
    adding their `back=` through Apple's `URLComponents.queryItems`, wrote
    it back with every `+` bare, which a query reads as a space: Google's
    `scope=a+b` arrived as `scope=a b`, the signature no longer matched,
    and a Google sign-in opened from the Mac said the link had expired.
    Nothing in base64url can be rewritten that way."""
    expires = int(now if now is not None else time.time()) + _START_TTL_S
    target = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    query = urlencode({"t": target, "e": expires, "s": _start_signature(expires, url)})
    return f"{settings.BASE_URL.rstrip('/')}/desktop/apps/start?{query}"


def _start_targets(request: Request) -> list[str]:
    """The address a start link names, in the forms it may have come in:
    `t`, or a link made before it (`to`), as sent and with the spaces the
    apps' rewrite made of its `+` put back."""
    target = str(request.query_params.get("t", ""))
    if target:
        try:
            return [
                base64.urlsafe_b64decode(target + "=" * (-len(target) % 4)).decode()
            ]
        except (binascii.Error, UnicodeDecodeError, ValueError):
            return []
    to = str(request.query_params.get("to", ""))
    if not to:
        return []
    return [to, to.replace(" ", "+")] if " " in to else [to]


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
    return scrub(tidy_result(data))


def _takes_own_account_field(tool: dict[str, Any] | None) -> bool:
    """A tool that already has an argument by our name keeps it as its own."""
    schema = tool.get("inputSchema") if tool is not None else None
    properties = schema.get("properties") if isinstance(schema, dict) else None
    return isinstance(properties, dict) and ACCOUNT_FIELD in properties


def _with_account_choice(
    tool: dict[str, Any], accounts: list[AppAccount]
) -> dict[str, Any]:
    """A tool as listed to a person with several accounts of its app: it
    asks which one the call is for (`use_account`, required), so the agent
    picks, or asks the person, instead of the first connected answering."""
    if _takes_own_account_field(tool):
        return tool
    schema = tool.get("inputSchema")
    schema = schema if isinstance(schema, dict) else {"type": "object"}
    properties = schema.get("properties")
    required = schema.get("required")
    named = ", ".join(account.described() for account in accounts)
    field = {
        "type": "string",
        "enum": [account.label for account in accounts],
        "description": (
            f"Which connected account to use: {named}. "
            "Ask the user which one if they haven't said."
        ),
    }
    return {
        **tool,
        "inputSchema": {
            **schema,
            "properties": {
                ACCOUNT_FIELD: field,
                **(properties if isinstance(properties, dict) else {}),
            },
            "required": [
                ACCOUNT_FIELD,
                *(required if isinstance(required, list) else []),
            ],
        },
    }


def _account_for(
    accounts: list[AppAccount], asked: Any
) -> tuple[AppAccount | None, str]:
    """The account a call is for: the one it names, or the only one. A
    name that matches none, or no name while there are several, is
    refused with the accounts there are: never the first by default, so
    an email never goes out from the wrong address."""
    labels = ", ".join(account.described() for account in accounts)
    if isinstance(asked, str) and asked.strip():
        found = next((one for one in accounts if one.answers_to(asked)), None)
        if found is not None:
            return found, ""
        return None, (
            f'No account "{asked.strip()}" of this app is connected. '
            f"Connected: {labels}. Call again with {ACCOUNT_FIELD} set to one of them."
        )
    if len(accounts) == 1:
        return accounts[0], ""
    return None, (
        f"Several accounts of this app are connected: {labels}. Call again with "
        f"{ACCOUNT_FIELD} set to one of them; ask the user which if they haven't said."
    )


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
        accounts = await connected_accounts(user, toolkit)
        if not accounts:
            return _error("This app is not connected yet.", 401)
        tools = await toolkit_tools(toolkit)
        if len(accounts) > 1:
            tools = [_with_account_choice(tool, accounts) for tool in tools]
        return _rpc_result(request_id, {"tools": tools})
    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name") if isinstance(params, dict) else None
        arguments = params.get("arguments") if isinstance(params, dict) else None
        if not isinstance(name, str) or not name:
            return _rpc_error(request_id, -32602, "A tool name is required.")
        tools = await toolkit_tools(toolkit)
        known = {tool["name"]: tool for tool in tools}
        if name not in known and not name.upper().startswith(f"{toolkit.upper()}_"):
            return _rpc_error(request_id, -32602, f"{name} is not a tool of this app.")
        accounts = await connected_accounts(user, toolkit)
        if not accounts:
            return _error("This app is not connected yet.", 401)
        arguments = dict(arguments) if isinstance(arguments, dict) else {}
        asked = (
            None
            if _takes_own_account_field(known.get(name))
            else arguments.pop(ACCOUNT_FIELD, None)
        )
        account, refusal = _account_for(accounts, asked)
        if account is None:
            return _rpc_result(
                request_id,
                {"content": [{"type": "text", "text": refusal}], "isError": True},
            )
        status, payload = await _call(
            "POST",
            f"api/v3.1/tools/execute/{name}",
            body={
                "user_id": composio_user_id(user),
                "connected_account_id": account.id,
                "arguments": arguments,
            },
        )
        if status >= 400 or not isinstance(payload, dict):
            log.warning(
                "desktop.apps.tool_failed", toolkit=toolkit, tool=name, status=status
            )
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
            else scope_guidance(
                toolkit,
                scrub(str(payload.get("error") or "The app refused the call.")),
                account if len(accounts) > 1 else None,
            )
        )
        # Which tool ran and whether the app took it, never its arguments: a
        # send that "failed" (28 October 2026) left five 200s and no answer.
        if ok:
            log.info("desktop.apps.tool_called", toolkit=toolkit, tool=name)
        else:
            log.warning(
                "desktop.apps.tool_failed", toolkit=toolkit, tool=name, error=text[:300]
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
    soon instead of sending the person nowhere. `comingSoon` names the apps
    that can't be added yet: those needing Simeon Labs' own app with the
    company, until it is named in `COMPOSIO_AUTH_CONFIGS` (the iPhone and
    Mac apps say "Coming soon" on their cards and offer no Add)."""
    soon = sorted(OWN_APP_NEEDED - set(own_auth_configs()))
    return JSONResponse({"available": configured(), "comingSoon": soon})


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


@router.post("/api/apps/{toolkit}/files", name="desktop:apps_file")
async def apps_file(
    toolkit: str,
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> JSONResponse:
    """One file for one tool, uploaded to the provider: the bytes are the
    body, `tool`, `name` and `mimetype` the query. Answers the reference the
    tool takes in place of the path (`{name, mimetype, s3key}`)."""
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    tool = str(request.query_params.get("tool", ""))
    name = str(request.query_params.get("name", "")).strip()
    mimetype = (
        str(request.query_params.get("mimetype", "")).strip()
        or "application/octet-stream"
    )
    if _TOOL_SLUG.match(tool) is None or not tool.startswith(f"{toolkit.upper()}_"):
        return _error("Name the tool of this app the file is for.", 400)
    if not name or len(name) > 255 or "/" in name:
        return _error("Give the file's name.", 400)
    if _MIMETYPE.match(mimetype) is None:
        return _error("Give the file's type, such as application/pdf.", 400)
    content = await request.body()
    if not content:
        return _error("The file is empty.", 400)
    if len(content) > _MAX_FILE_BYTES:
        return _error("The file is over 25 MB.", 413)
    try:
        status, payload = await _call(
            "POST",
            _FILE_UPLOAD,
            body={
                "md5": hashlib.md5(content, usedforsecurity=False).hexdigest(),
                "filename": name,
                "mimetype": mimetype,
                "tool_slug": tool,
                "toolkit_slug": toolkit,
            },
        )
        key = payload.get("key") if isinstance(payload, dict) else None
        address = (
            payload.get("new_presigned_url") if isinstance(payload, dict) else None
        )
        if status >= 400 or not isinstance(key, str) or not isinstance(address, str):
            return _error(_upstream_message(payload), 502)
        # The provider's storage, signed for this file's type: the same type goes with the bytes.
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            put = await client.put(
                address, content=content, headers={"content-type": mimetype}
            )
    except httpx.HTTPError as error:
        log.warning(
            "desktop.apps.file_unreachable",
            toolkit=toolkit,
            tool=tool,
            error=type(error).__name__,
        )
        return _error("The file could not be uploaded.", 502)
    if put.status_code >= 300:
        log.warning(
            "desktop.apps.file_refused",
            toolkit=toolkit,
            tool=tool,
            status=put.status_code,
        )
        return _error("The file could not be uploaded.", 502)
    log.info(
        "desktop.apps.file_uploaded",
        toolkit=toolkit,
        tool=tool,
        bytes=len(content),
        mimetype=mimetype,
    )
    return JSONResponse({"name": name, "mimetype": mimetype, "s3key": key})


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


async def _body(request: Request) -> dict[str, Any]:
    """A request's JSON object, or nothing: callers before 29 October 2026 send none."""
    try:
        body = json.loads(await request.body() or b"null")
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


@router.post("/api/apps/{toolkit}/connect", name="desktop:apps_connect")
async def apps_connect(
    toolkit: str,
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> JSONResponse:
    """The sign-in link, or `connected` when the app already is. With
    `{"another": true}` (Add Another Account on the app's page in the iPhone
    and Mac apps) it is always a new sign-in, for one more account, up to
    MAX_ACCOUNTS; Google's opens on its account chooser."""
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    another = (await _body(request)).get("another") is True
    try:
        accounts = await active_account_ids(desktop_session.user, toolkit)
        if accounts and not another:
            return JSONResponse({"toolkit": toolkit, "connected": True})
        if len(accounts) >= MAX_ACCOUNTS:
            return _error(
                f"You can connect up to {MAX_ACCOUNTS} accounts of this app.", 409
            )
        url = await sign_in_link(desktop_session.user, toolkit)
    except AppsUpstreamError as error:
        if (
            toolkit in OWN_APP_NEEDED
            and toolkit not in own_auth_configs()
            and 400 <= error.status < 500
        ):
            # 503 reads as "coming soon" in the box (`vendor-mcp/backend-exec.ts`).
            log.warning(
                "desktop.apps.sign_in_needs_own_app",
                toolkit=toolkit,
                status=error.status,
                upstream=str(error),
            )
            return _error("This app is coming soon in Simeon.", 503)
        return _error(str(error) or "The app could not be reached.", 502)
    except httpx.HTTPError as error:
        return _error(str(error) or "The app could not be reached.", 502)
    log.info(
        "desktop.apps.sign_in_started",
        toolkit=toolkit,
        user_id=str(desktop_session.user.id),
        another=bool(accounts),
    )
    # Ours first, then the app's own page: the provider's address shows nowhere it can be helped.
    page = await provider_page(url)
    url = start_url(choose_account(page) if accounts else page)
    return JSONResponse({"toolkit": toolkit, "connected": False, "url": url})


def _accounts_answer(toolkit: str, accounts: list[AppAccount]) -> JSONResponse:
    return JSONResponse(
        {
            "toolkit": toolkit,
            "accounts": [account.as_json() for account in accounts],
            "max": MAX_ACCOUNTS,
        }
    )


@router.get("/api/apps/{toolkit}/accounts", name="desktop:apps_accounts")
async def apps_accounts(
    toolkit: str,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> JSONResponse:
    """The person's accounts of one app, for its page in the iPhone and Mac
    apps: each one's id, the person's name for it, who it signs in as, and
    the label the agent knows it by. Asked fresh, so an account added a
    moment ago shows, and kept for the agent's next calls."""
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    try:
        accounts = await fresh_accounts(desktop_session.user, toolkit)
    except (AppsUpstreamError, httpx.HTTPError) as error:
        return _error(str(error) or "The app could not be reached.", 502)
    return _accounts_answer(toolkit, accounts)


async def _owned_account(
    user: User, toolkit: str, account_id: str
) -> AppAccount | None:
    """One of the person's own accounts of this app, by id: an id from
    anywhere else changes nothing."""
    return next(
        (one for one in await active_accounts(user, toolkit) if one.id == account_id),
        None,
    )


@router.patch("/api/apps/{toolkit}/accounts/{account_id}", name="desktop:apps_rename")
async def apps_rename_account(
    toolkit: str,
    account_id: str,
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> JSONResponse:
    """The person's own name for one account (`{"name": "Work"}`, the
    pencil beside it); an empty name goes back to who it signs in as."""
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    name = (await _body(request)).get("name")
    if not isinstance(name, str):
        return _error("Give the account's name.", 400)
    name = " ".join(name.split())
    if len(name) > _ACCOUNT_NAME_MAX:
        return _error(f"A name can be at most {_ACCOUNT_NAME_MAX} characters.", 400)
    user = desktop_session.user
    try:
        if await _owned_account(user, toolkit, account_id) is None:
            return _error("No such account of this app.", 404)
        status, payload = await _call(
            "PATCH", f"api/v3.1/connected_accounts/{account_id}", body={"alias": name}
        )
        if status == 409:
            return _error("Another account of this app has that name.", 409)
        if status >= 400:
            return _error(_upstream_message(payload), 400 if status < 500 else 502)
        accounts = await fresh_accounts(user, toolkit)
    except (AppsUpstreamError, httpx.HTTPError) as error:
        return _error(str(error) or "The app could not be reached.", 502)
    log.info("desktop.apps.account_renamed", toolkit=toolkit, cleared=not name)
    return _accounts_answer(toolkit, accounts)


@router.delete(
    "/api/apps/{toolkit}/accounts/{account_id}", name="desktop:apps_remove_account"
)
async def apps_remove_account(
    toolkit: str,
    account_id: str,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> JSONResponse:
    """One account signed out of the app; the others stay connected."""
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    user = desktop_session.user
    _accounts_cache.pop((composio_user_id(user), toolkit), None)
    try:
        if await _owned_account(user, toolkit, account_id) is None:
            return _error("No such account of this app.", 404)
        status, payload = await _call(
            "DELETE", f"api/v3.1/connected_accounts/{account_id}"
        )
        if status >= 400:
            return _error(_upstream_message(payload), 502)
        accounts = await fresh_accounts(user, toolkit)
    except (AppsUpstreamError, httpx.HTTPError) as error:
        return _error(str(error) or "The app could not be reached.", 502)
    log.info("desktop.apps.account_removed", toolkit=toolkit, left=len(accounts))
    return _accounts_answer(toolkit, accounts)


@router.delete("/api/apps/{toolkit}", name="desktop:apps_disconnect")
async def apps_disconnect(
    toolkit: str,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
) -> JSONResponse:
    refused = _guard(toolkit)
    if refused is not None:
        return refused
    _accounts_cache.pop((composio_user_id(desktop_session.user), toolkit), None)
    try:
        accounts = await active_account_ids(desktop_session.user, toolkit)
        for account in accounts:
            await _call("DELETE", f"api/v3.1/connected_accounts/{account}")
    except (AppsUpstreamError, httpx.HTTPError) as error:
        return _error(str(error) or "The app could not be reached.", 502)
    return JSONResponse({"toolkit": toolkit, "disconnected": len(accounts)})


_CONNECTED_PAGE = """<!doctype html><html lang="{lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Simeon</title>
<style>:root{{color-scheme:light dark}}body{{margin:0;min-height:100vh;display:grid;place-items:center;
font:16px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;background:#f5f5f7;color:#1d1d1f}}
.card{{background:#fff;border-radius:18px;padding:36px 40px;text-align:center;max-width:360px;
box-shadow:0 0 0 .5px rgba(20,30,60,.08),0 1px 2px rgba(20,30,60,.05)}}
h1{{font-size:20px;font-weight:600;margin:0 0 6px}}p{{margin:0;opacity:.7}}
@media (prefers-color-scheme:dark){{body{{background:#1c1c1e;color:#f5f5f7}}.card{{background:#2c2c2e;box-shadow:none}}}}</style></head>
<body><div class="card"><h1>{title}</h1><p>{body}</p></div></body></html>"""


@router.get("/apps/connected", name="desktop:apps_connected")
async def apps_connected(request: Request) -> Response:
    """Where a sign-in ends. Opened from the iPhone or the Mac (`apps_start`
    kept which), it goes straight back to the app, whose sign-in sheet
    closes on its own address (the founder, 13 October 2026: "the last
    screen after something is connected makes no sense ... should take us
    back"); in a browser's tab it says it is done."""
    failed = str(request.query_params.get("status", "")).lower() in {"failed", "error"}
    back = request.cookies.get(_BACK_COOKIE, "")
    if back in _APP_SCHEMES:
        response = RedirectResponse(
            f"{back}://connected" + ("?status=failed" if failed else ""),
            status_code=302,
            headers={"cache-control": "no-store"},
        )
        response.delete_cookie(_BACK_COOKIE, path="/desktop/apps")
        return response
    title = say("apps.page.failed") if failed else say("apps.page.connected")
    body = say("apps.page.try_again") if failed else say("apps.page.close_tab")
    return HTMLResponse(
        _CONNECTED_PAGE.format(
            lang=current_language() or "en",
            title=html.escape(title),
            body=html.escape(body),
        ),
        headers={"cache-control": "no-store"},
    )


@router.get("/apps/start", name="desktop:apps_start")
async def apps_start(request: Request) -> Response:
    signature = str(request.query_params.get("s", ""))
    try:
        expires = int(request.query_params.get("e", "0"))
    except ValueError:
        expires = 0
    to = next(
        (
            one
            for one in _start_targets(request)
            if one.startswith("https://")
            and hmac.compare_digest(_start_signature(expires, one), signature)
        ),
        None,
    )
    # Two refusals, told apart in the log and on the page: a link that was
    # never ours, or that something changed on its way, and one that is
    # simply old.
    if to is None or expires < time.time():
        expired = to is not None
        log.info(
            "desktop.apps.start_refused", reason="expired" if expired else "signature"
        )
        return HTMLResponse(
            _CONNECTED_PAGE.format(
                lang=current_language() or "en",
                title=html.escape(
                    say("apps.page.expired") if expired else say("apps.page.broken"),
                    quote=False,
                ),
                body=html.escape(say("apps.page.try_again"), quote=False),
            ),
            status_code=400,
            headers={"cache-control": "no-store"},
        )
    response = RedirectResponse(
        to, status_code=302, headers={"cache-control": "no-store"}
    )
    # The app that opened this (`?back=` its scheme, outside the signature: it
    # only ever names one of ours) is where the sign-in's last page sends the person.
    back = str(request.query_params.get("back", "")).strip().lower()
    if back in _APP_SCHEMES:
        response.set_cookie(
            _BACK_COOKIE,
            back,
            max_age=_START_TTL_S,
            path="/desktop/apps",
            secure=settings.BASE_URL.startswith("https://"),
            httponly=True,
            samesite="lax",
        )
    return response


@router.get("/apps/oauth/callback", name="desktop:apps_oauth_callback")
async def apps_oauth_callback(request: Request) -> RedirectResponse:
    query = urlencode(list(request.query_params.multi_items()))
    return RedirectResponse(
        f"{COMPOSIO_CALLBACK}?{query}" if query else COMPOSIO_CALLBACK, status_code=302
    )


__all__ = ["active_account_ids", "files_as_paths", "router", "scrub", "toolkit_tools"]
