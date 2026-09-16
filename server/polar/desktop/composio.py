"""Apps through Composio, with the key kept here.

The founder: "my users should never put a key. everything happens under
the hood. not a setting." So the desktop app carries no Composio key.
Its six calls (the Tool Router session, search, execute, the sign-in
link, the toolkit list, and disconnect) come to Claidor under the
account's own bearer token, and this module forwards each one to
Composio with Claidor's key. That is the whole of it: an allow-list of
the six paths, the key added, the answer passed back as Composio gave
it.

One thing is decided here and not by the app: **who the person is to
Composio.** Composio scopes sign-ins by a `user_id` given when the
session is made. The app sends a placeholder; it is replaced with a name
derived from the Claidor user id, so one account's Gmail is never
another's, whatever the app said.

What this does not do, said plainly: it does not remember which Composio
session belongs to which account. A session id is minted by Composio,
returned only to the account that made it, and is not guessable; a
person who somehow held another account's session id could act through
it. The same goes for a connected-account id on disconnect. Binding
those ids to the account server-side is the next step if apps ever
carry more than a first handful of people.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx
import structlog
from fastapi import Request
from fastapi.responses import JSONResponse, Response

from polar.config import settings
from polar.models import DesktopSession, User

log = structlog.get_logger()

# The six calls, as `@composio/client` 0.1.0-alpha.76 makes them and as
# the app's two clients (`openclaw-extensions/composio/client.ts` and
# `src/main/libs/composio/composioApi.ts`) repeat them. Anything else
# is not forwarded: the key must not become a general-purpose door.
_SESSION = "api/v3.1/tool_router/session"
_SESSION_ID = r"[A-Za-z0-9_\-]{1,128}"
ALLOWED: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("POST", re.compile(rf"^{re.escape(_SESSION)}$")),
    ("POST", re.compile(rf"^{re.escape(_SESSION)}/{_SESSION_ID}/search$")),
    ("POST", re.compile(rf"^{re.escape(_SESSION)}/{_SESSION_ID}/execute$")),
    ("POST", re.compile(rf"^{re.escape(_SESSION)}/{_SESSION_ID}/link$")),
    ("GET", re.compile(rf"^{re.escape(_SESSION)}/{_SESSION_ID}/toolkits$")),
    ("DELETE", re.compile(r"^api/v3.1/connected_accounts/[A-Za-z0-9_\-]{1,128}$")),
)

NOT_CONFIGURED = "Apps are not configured on this server."
UPSTREAM_REFUSED = "desktop.composio.upstream_refused"
_REFUSAL_LOG_LIMIT = 2_000
_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


def configured() -> bool:
    return bool(settings.COMPOSIO_API_KEY.strip())


def composio_user_id(user: User) -> str:
    """The account, as Composio knows it. Stable, and never the app's word."""
    return f"claidor-{user.id}"


def allowed(method: str, path: str) -> bool:
    return any(
        method == verb and pattern.match(path) is not None for verb, pattern in ALLOWED
    )


def _error(kind: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        {"error": {"type": kind, "message": message}}, status_code=status
    )


def _session_body(raw: bytes, user: User) -> bytes | JSONResponse:
    """The session request, with the account's own id in place of the app's."""
    try:
        payload: Any = json.loads(raw or b"{}")
    except ValueError:
        return _error("invalid_request_error", "The body is not JSON.", 400)
    if not isinstance(payload, dict):
        return _error("invalid_request_error", "The body must be an object.", 400)
    payload["user_id"] = composio_user_id(user)
    return json.dumps(payload).encode()


async def forward(
    request: Request, desktop_session: DesktopSession, path: str
) -> Response:
    if not configured():
        return _error("not_configured", NOT_CONFIGURED, 503)
    method = request.method.upper()
    if not allowed(method, path):
        return _error("not_found_error", f"/{path} is not proxied.", 404)

    raw = await request.body()
    body: bytes = raw
    if method == "POST" and path == _SESSION:
        prepared = _session_body(raw, desktop_session.user)
        if isinstance(prepared, JSONResponse):
            return prepared
        body = prepared

    headers = {
        "x-api-key": settings.COMPOSIO_API_KEY,
        "accept": "application/json",
    }
    if body:
        headers["content-type"] = "application/json"

    url = f"{settings.COMPOSIO_BASE_URL.rstrip('/')}/{path}"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        upstream = await client.request(
            method, url, headers=headers, content=body or None
        )

    if upstream.status_code >= 400:
        text = upstream.content.decode("utf-8", "replace")
        log.warning(
            UPSTREAM_REFUSED,
            path=path,
            status=upstream.status_code,
            body=text[:_REFUSAL_LOG_LIMIT] or "(empty)",
            truncated=len(text) > _REFUSAL_LOG_LIMIT,
        )

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type", "application/json"),
        headers={"cache-control": "no-store"},
    )
