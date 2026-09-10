"""The desktop app's server, on Claidor.

The desktop app, Maties (`desktop/`), is pointed at
`{BASE_URL}/desktop` and calls the paths below exactly as its own
server mode does. Sign-in works like this:

1. The app opens the browser at `/desktop/login?redirect_uri=…&state=…`
   (the redirect is a loopback callback the app is listening on; when
   it could not open one it comes with no redirect and expects a
   `maties://` deep link instead).
2. With no Claidor session in the browser, that page sends the person
   to the web login and asks to be returned to.
3. With one, it mints a five-minute, single-use code and redirects to
   the app's callback with `code` and `state`.
4. The app posts the code to `/desktop/api/auth/exchange` and receives
   an access token, a refresh token, the person and their quota.

Every later call carries the access token as a bearer; the model proxy
forwards to Anthropic with Claidor's key and meters what came back.
"""

from __future__ import annotations

import functools
import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, quote, urlencode, urlparse, urlunparse

import httpx
import structlog
from fastapi import Depends, Query, Request
from fastapi.responses import (
    JSONResponse,
    RedirectResponse,
    Response,
    StreamingResponse,
)
from pydantic import BaseModel, ConfigDict

from polar.auth.dependencies import WebUserOrAnonymous
from polar.auth.models import is_user
from polar.config import settings
from polar.kit.db.postgres import AsyncSessionMaker
from polar.kit.utils import utc_now
from polar.models import DesktopSession
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .service import (
    AUTH_CODE_INVALID,
    MODELS,
    QUOTA_EXHAUSTED_CODE,
    REFRESH_INVALID,
    DesktopUnauthenticated,
    Usage,
    UsageTally,
    desktop,
    model_by_id,
)

log = structlog.get_logger()

router = APIRouter(prefix="/desktop", tags=["desktop", APITag.private])

ANTHROPIC_VERSION = "2023-06-01"
DEEP_LINK_CALLBACK = "maties://auth/callback"
CLIENT_VERSION_HEADER = "x-maties-client-version"


# --- helpers ---------------------------------------------------------------


def _ok(data: Any) -> JSONResponse:
    return JSONResponse({"code": 0, "data": data})


def _fail(code: int, message: str, *, status: int = 200) -> JSONResponse:
    """The app's error shape: a non-zero `code` and a message. `status`
    is 200 unless the app keys on it — a 401 on refresh means « sign in
    again », anything else « try later »."""
    return JSONResponse({"code": code, "message": message}, status_code=status)


def _bearer(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    api_key = request.headers.get("x-api-key", "").strip()
    return api_key or None


async def get_desktop_session(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> DesktopSession:
    token = _bearer(request)
    if token is None:
        raise DesktopUnauthenticated()
    found = await desktop.authenticate(session, token)
    if found is None:
        raise DesktopUnauthenticated("This desktop session has expired.")
    return found


def _callback_target(redirect_uri: str | None) -> str | None:
    """The app's own callback and nothing else: its loopback listener,
    or its deep link. Any other address gets no code."""
    if redirect_uri is None or not redirect_uri.strip():
        return DEEP_LINK_CALLBACK
    parsed = urlparse(redirect_uri.strip())
    if (
        parsed.scheme == "http"
        and parsed.hostname in ("127.0.0.1", "localhost")
        and parsed.path == "/auth/callback"
    ):
        return redirect_uri.strip()
    if (
        parsed.scheme == "maties"
        and parsed.netloc == "auth"
        and parsed.path == "/callback"
    ):
        return redirect_uri.strip()
    return None


def _with_params(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update(params)
    return urlunparse(parsed._replace(query=urlencode(query)))


# --- sign-in ---------------------------------------------------------------


@router.get("/login", name="desktop:login", response_model=None)
async def login(
    request: Request,
    auth_subject: WebUserOrAnonymous,
    session: AsyncSession = Depends(get_db_session),
    redirect_uri: str | None = Query(default=None),
    state: str | None = Query(default=None),
    source: str | None = Query(default=None),
) -> RedirectResponse | JSONResponse:
    target = _callback_target(redirect_uri)
    if target is None:
        return _fail(
            400, "The desktop app's callback address is not allowed.", status=400
        )

    if not is_user(auth_subject):
        kept = {
            key: value
            for key, value in (
                ("redirect_uri", redirect_uri),
                ("state", state),
                ("source", source),
            )
            if value
        }
        return_to = settings.generate_external_url(
            "/desktop/login" + (f"?{urlencode(kept)}" if kept else "")
        )
        login_url = settings.generate_frontend_url(
            f"/login?return_to={quote(return_to, safe='')}"
        )
        return RedirectResponse(login_url, 303)

    code = await desktop.create_auth_code(session, auth_subject.subject)
    params = {"code": code}
    if state:
        params["state"] = state
    return RedirectResponse(_with_params(target, params), 303)


class ExchangeBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    authCode: str


class RefreshBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    refreshToken: str


@router.post("/api/auth/exchange", name="desktop:exchange")
async def exchange(
    request: Request,
    body: ExchangeBody,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    try:
        desktop_session, access, refresh = await desktop.exchange_auth_code(
            session,
            body.authCode,
            user_agent=request.headers.get("User-Agent", ""),
            client_version=request.headers.get(CLIENT_VERSION_HEADER),
        )
    except DesktopUnauthenticated as error:
        return _fail(AUTH_CODE_INVALID, error.message)
    user = desktop_session.user
    return _ok(
        {
            "accessToken": access,
            "refreshToken": refresh,
            "user": desktop.user_payload(user),
            "quota": await desktop.quota(session, user),
        }
    )


@router.post("/api/auth/refresh", name="desktop:refresh")
async def refresh(
    body: RefreshBody, session: AsyncSession = Depends(get_db_session)
) -> JSONResponse:
    try:
        _, access, new_refresh = await desktop.refresh(session, body.refreshToken)
    except DesktopUnauthenticated as error:
        # 401 is the one status the app reads as terminal: it signs out
        # instead of retrying.
        return _fail(REFRESH_INVALID, error.message, status=401)
    return _ok({"accessToken": access, "refreshToken": new_refresh})


@router.post("/api/auth/logout", name="desktop:logout")
async def logout(
    request: Request, session: AsyncSession = Depends(get_db_session)
) -> JSONResponse:
    token = _bearer(request)
    if token is not None:
        found = await desktop.authenticate(session, token)
        if found is not None:
            await desktop.revoke(session, found)
    return _ok({})


# --- the person ------------------------------------------------------------


@router.get("/api/user/profile", name="desktop:profile")
async def profile(
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    return _ok(desktop.user_payload(desktop_session.user))


@router.get("/api/user/quota", name="desktop:quota")
async def quota(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    return _ok(await desktop.quota(session, desktop_session.user))


@router.get("/api/user/profile-summary", name="desktop:profile_summary")
async def profile_summary(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    return _ok(await desktop.profile_summary(session, desktop_session.user))


# --- the models ------------------------------------------------------------


@router.get("/api/models/available", name="desktop:models")
async def models_available(
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    return _ok([one.available() for one in MODELS])


@router.get("/api/models/pricing-catalog", name="desktop:pricing")
async def pricing_catalog() -> JSONResponse:
    return _ok(
        {
            "textModels": [one.pricing() for one in MODELS],
            "imageModels": [],
            "videoModels": [],
        }
    )


# --- what the app asks for and Claidor does not have ------------------------


@router.get("/api/client-banners/active-list", name="desktop:banners")
async def client_banners_active_list() -> JSONResponse:
    return _ok([])


@router.get("/api/client-banners/active", name="desktop:banner")
async def client_banner_active() -> JSONResponse:
    return _ok(None)


@router.get("/api/client-banners/snapshot", name="desktop:banner_snapshot")
async def client_banner_snapshot(request: Request) -> JSONResponse:
    return _ok(
        {
            "serverTime": utc_now().isoformat(),
            "nextRefreshAt": None,
            "clientVersion": request.headers.get(CLIENT_VERSION_HEADER, ""),
            "banners": [],
        }
    )


@router.get("/api/updates/check", name="desktop:updates")
@router.get("/api/updates/check-manual", name="desktop:updates_manual")
async def updates_check() -> JSONResponse:
    """The app asks whether a newer Maties exists.

    Claidor does not publish desktop releases yet, so the answer is « nothing
    newer »: the app reads ``data.value`` and treats ``None`` as up to date.
    """
    return _ok({"value": None})


@router.get("/api/skill-store", name="desktop:skill_store")
async def skill_store() -> JSONResponse:
    """The skill marketplace. Empty until Claidor curates one.

    The app reads ``data.value.marketplace`` (skills to install),
    ``data.value.localSkill`` (names and descriptions for the bundled skills)
    and ``data.value.marketTags``.
    """
    return _ok({"value": {"marketplace": [], "localSkill": [], "marketTags": []}})


@router.get("/api/kit-store", name="desktop:kit_store")
async def kit_store() -> JSONResponse:
    """The kit store. Empty until Claidor curates one.

    The app reads ``data.value.kits`` and appends its own built-in kits.
    """
    return _ok({"value": {"kits": []}})


_MCP_MARKETPLACE_PATH = Path(__file__).with_name("mcp_marketplace.json")


@functools.cache
def _mcp_marketplace() -> dict[str, Any]:
    """The MCP server catalogue the app offers (categories and servers)."""
    return json.loads(_MCP_MARKETPLACE_PATH.read_text(encoding="utf-8"))


@router.get("/api/mcp-marketplace", name="desktop:mcp_marketplace")
async def mcp_marketplace() -> JSONResponse:
    """The MCP marketplace. The app reads ``data.value.categories`` and
    ``data.value.servers``; the catalogue lives next to this module."""
    return _ok({"value": _mcp_marketplace()})


@router.get("/api/analytics/events", name="desktop:analytics_events")
async def analytics_events() -> Response:
    """Usage events the app sends when the person allows usage statistics.

    Acknowledged and discarded: Claidor keeps no usage analytics for the
    desktop app yet. The app only checks that the request succeeded.
    """
    return Response(status_code=204)


@router.get("/api/enterprise/context", name="desktop:enterprise_context")
async def enterprise_context() -> JSONResponse:
    """Enterprise accounts do not exist on Claidor; every account is
    personal. 41602 is the app's « not a member » code: it clears any
    stale enterprise context and carries on."""
    return _fail(41602, "This account is a personal account.", status=404)


@router.get("/api/client-activities/slot", name="desktop:activity_slot")
async def activity_slot() -> JSONResponse:
    """Promotional activities (daily check-in, startup credits). Maties runs none."""
    return _ok({"slotState": "empty", "serverTime": utc_now().isoformat()})


@router.get(
    "/api/client-activities/{activity_code}/context",
    name="desktop:activity_context",
)
async def activity_context(activity_code: str) -> JSONResponse:
    return _fail(404, f"No activity named {activity_code!r}.", status=404)


@router.post(
    "/api/client-activities/{activity_code}/actions/{action_id}",
    name="desktop:activity_action",
)
async def activity_action(activity_code: str, action_id: str) -> JSONResponse:
    return _fail(404, f"No activity named {activity_code!r}.", status=404)


# --- the model proxy --------------------------------------------------------


def _upstream_headers(request: Request) -> dict[str, str]:
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": request.headers.get(
            "anthropic-version", ANTHROPIC_VERSION
        ),
        "content-type": "application/json",
        "accept": request.headers.get("accept", "application/json"),
    }
    beta = request.headers.get("anthropic-beta")
    if beta:
        headers["anthropic-beta"] = beta
    return headers


def _timeout() -> httpx.Timeout:
    return httpx.Timeout(600.0, connect=30.0)


@router.post("/api/proxy/v1/messages", name="desktop:messages", response_model=None)
async def proxy_messages(
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse | StreamingResponse:
    """Anthropic's Messages API, behind Claidor's key and the person's
    monthly allowance. The body goes through untouched; the usage
    Anthropic reports comes back as credits."""
    raw = await request.body()
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        return JSONResponse(
            {
                "error": {
                    "type": "invalid_request_error",
                    "message": "The body is not JSON.",
                }
            },
            status_code=400,
        )
    if not isinstance(payload, dict):
        return JSONResponse(
            {
                "error": {
                    "type": "invalid_request_error",
                    "message": "The body must be an object.",
                }
            },
            status_code=400,
        )
    model = model_by_id(str(payload.get("model", "")))
    if model is None:
        return JSONResponse(
            {
                "error": {
                    "type": "invalid_request_error",
                    "message": "This model is not offered by the desktop app.",
                }
            },
            status_code=400,
        )
    if not settings.ANTHROPIC_API_KEY:
        return JSONResponse(
            {
                "error": {
                    "type": "api_error",
                    "message": "The model service is not configured.",
                }
            },
            status_code=503,
        )
    user = desktop_session.user
    if await desktop.exhausted(session, user):
        return JSONResponse(
            {
                "error": {
                    "type": "quota_exhausted",
                    "code": QUOTA_EXHAUSTED_CODE,
                    "message": (
                        f"Monthly credits exhausted (code {QUOTA_EXHAUSTED_CODE}). "
                        "The allowance resets at the start of next month."
                    ),
                }
            },
            status_code=402,
        )

    stream = payload.get("stream") is True
    url = f"{settings.DESKTOP_ANTHROPIC_BASE_URL}/v1/messages"
    headers = _upstream_headers(request)
    user_id, session_id = user.id, desktop_session.id

    # The request's own session is committed when the handler returns,
    # before a stream has ended, so the usage row is written through a
    # session of its own where the app provides one; the test client
    # provides none and keeps the request's session open instead.
    sessionmaker: AsyncSessionMaker | None = getattr(
        request.state, "async_sessionmaker", None
    )

    async def record(usage: Usage, status: int) -> None:
        if sessionmaker is None:
            await desktop.record_usage(
                session,
                user_id=user_id,
                session_id=session_id,
                model=model,
                usage=usage,
                stream=stream,
                upstream_status=status,
            )
            return
        async with sessionmaker() as fresh:
            await desktop.record_usage(
                fresh,
                user_id=user_id,
                session_id=session_id,
                model=model,
                usage=usage,
                stream=stream,
                upstream_status=status,
            )
            await fresh.commit()

    if not stream:
        async with httpx.AsyncClient(timeout=_timeout()) as client:
            upstream = await client.post(url, headers=headers, content=raw)
        usage = Usage()
        try:
            answer = upstream.json()
            if isinstance(answer, dict):
                usage = Usage.from_payload(answer.get("usage"))
        except ValueError:
            answer = None
        await record(usage, upstream.status_code)
        if answer is None:
            return JSONResponse(
                {
                    "error": {
                        "type": "api_error",
                        "message": "The model service answered with something that is not JSON.",
                    }
                },
                status_code=502,
            )
        return JSONResponse(answer, status_code=upstream.status_code)

    client = httpx.AsyncClient(timeout=_timeout())
    upstream_request = client.build_request("POST", url, headers=headers, content=raw)
    try:
        upstream = await client.send(upstream_request, stream=True)
    except httpx.HTTPError as error:
        await client.aclose()
        log.warning("desktop.proxy.upstream_unreachable", error=str(error))
        return JSONResponse(
            {
                "error": {
                    "type": "api_error",
                    "message": "The model service could not be reached.",
                }
            },
            status_code=502,
        )

    if upstream.status_code != 200:
        # An error is small and not an event stream: read it, meter
        # nothing, hand it back as it came.
        body = await upstream.aread()
        await upstream.aclose()
        await client.aclose()
        await record(Usage(), upstream.status_code)
        try:
            return JSONResponse(json.loads(body), status_code=upstream.status_code)
        except ValueError:
            return JSONResponse(
                {
                    "error": {
                        "type": "api_error",
                        "message": body.decode(errors="replace")[:500],
                    }
                },
                status_code=upstream.status_code,
            )

    async def relay() -> AsyncIterator[bytes]:
        tally = UsageTally()
        try:
            async for chunk in upstream.aiter_bytes():
                tally.feed(chunk)
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()
            try:
                await record(tally.finish(), upstream.status_code)
            except Exception:  # a lost usage row must not kill the stream's close
                log.exception("desktop.proxy.usage_not_recorded")

    return StreamingResponse(
        relay(),
        status_code=200,
        media_type=upstream.headers.get("content-type", "text/event-stream"),
        headers={"cache-control": "no-store"},
    )


@router.api_route(
    "/api/proxy/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    name="desktop:proxy_other",
    include_in_schema=False,
)
async def proxy_other(path: str) -> JSONResponse:
    return JSONResponse(
        {"error": {"type": "not_found_error", "message": f"/{path} is not proxied."}},
        status_code=404,
    )
