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
forwards to the provider that serves the model asked for — Anthropic or
OpenAI — with Claidor's key, and meters what came back against that
provider's price list (`polar/desktop/pricing.py`). There is no API-key
screen in the app and there will not be one: a person picks a model,
never a key.
"""

from __future__ import annotations

import functools
import json
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
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
from pydantic import BaseModel, ConfigDict, Field

from polar.auth.dependencies import WebUserOrAnonymous
from polar.auth.models import is_user
from polar.config import settings
from polar.connectors.endpoints import router as connectors_router
from polar.kit.db.postgres import AsyncSessionMaker
from polar.kit.utils import utc_now
from polar.maty.desktop_endpoints import router as maty_jobs_router
from polar.models import DesktopSession
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.routing import APIRouter

from .auth import bearer_token, get_desktop_session
from .service import (
    AUTH_CODE_INVALID,
    MEMORY_FILE_LIMIT,
    MEMORY_REFUSED,
    QUOTA_EXHAUSTED_CODE,
    REFRESH_INVALID,
    DesktopMemoryRefused,
    DesktopModel,
    DesktopProvider,
    DesktopUnauthenticated,
    IncomingMemoryFile,
    Usage,
    desktop,
    model_by_id,
    offered_models,
    provider_api_key,
    provider_base_url,
    provider_configured,
    tally_for,
    usage_from_answer,
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
    token = bearer_token(request)
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


# --- the shared memory ------------------------------------------------------


class MemorySyncFile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(max_length=200)
    content: str
    #: The version the client started from; 0 means « I have never seen
    #: this file from you ».
    base_version: int = Field(default=0, ge=0)


class MemorySyncBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    files: list[MemorySyncFile] = Field(
        default_factory=list, max_length=MEMORY_FILE_LIMIT
    )


class MemorySyncedFile(BaseModel):
    name: str
    content: str
    version: int
    #: True when the answer differs from what the client sent, so the app
    #: writes the file back to the workspace.
    changed: bool


class MemorySyncResponse(BaseModel):
    files: list[MemorySyncedFile]
    deleted: list[str]


class MemoryListedFile(BaseModel):
    name: str
    version: int
    size: int


class MemoryListResponse(BaseModel):
    files: list[MemoryListedFile]


@router.post(
    "/api/memory/sync",
    name="desktop:memory_sync",
    response_model=MemorySyncResponse,
)
async def memory_sync(
    body: MemorySyncBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> MemorySyncResponse | JSONResponse:
    """The shared memory, one round (`docs/maties/cloud.md`, section 3).

    The client sends every memory file it has and the version it last
    saw for each; Claidor merges and answers with every file it holds,
    so a fresh computer receives the whole memory by sending nothing.
    Merging is Claidor's job alone, so two engines cannot disagree.
    """
    try:
        synced = await desktop.sync_memory_files(
            session,
            desktop_session.user,
            [
                IncomingMemoryFile(
                    name=file.name,
                    content=file.content,
                    base_version=file.base_version,
                )
                for file in body.files
            ],
        )
    except DesktopMemoryRefused as error:
        return _fail(MEMORY_REFUSED, error.message, status=400)
    return MemorySyncResponse(
        files=[
            MemorySyncedFile(
                name=file.name,
                content=file.content,
                version=file.version,
                changed=file.changed,
            )
            for file in synced.files
        ],
        deleted=synced.deleted,
    )


@router.get("/api/memory", name="desktop:memory_list")
async def memory_list(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> MemoryListResponse:
    """What Claidor holds, without the text of it: a cheap way for a
    client to see whether it is behind before sending anything."""
    return MemoryListResponse(
        files=[
            MemoryListedFile(
                name=file.name,
                version=file.version,
                size=len(file.content.encode("utf-8")),
            )
            for file in await desktop.list_memory_files(session, desktop_session.user)
        ]
    )


# --- the models ------------------------------------------------------------


@router.get("/api/models/available", name="desktop:models")
async def models_available(
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    """The menu. A provider Claidor holds no key for is not on it: a
    missing key reads as « not available here », never as an error at the
    moment somebody sends a message."""
    return _ok([one.available() for one in offered_models()])


@router.get("/api/models/pricing-catalog", name="desktop:pricing")
async def pricing_catalog() -> JSONResponse:
    return _ok(
        {
            "textModels": [one.pricing() for one in offered_models()],
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
#
# Two providers serve the catalogue, and each one talks its own language
# end to end: the engine speaks Anthropic's `/v1/messages` to an
# Anthropic model and OpenAI's `/v1/chat/completions` to an OpenAI one.
# Nothing here converts between the two shapes. The path says which
# language is being spoken; the model says who serves it, and from that
# come the address, the key and the price list. One branch, in one
# place: `_WIRES`.


def _anthropic_headers(request: Request) -> dict[str, str]:
    headers = {
        "x-api-key": provider_api_key(DesktopProvider.anthropic),
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


def _openai_headers(request: Request) -> dict[str, str]:
    return {
        "authorization": f"Bearer {provider_api_key(DesktopProvider.openai)}",
        "content-type": "application/json",
        "accept": request.headers.get("accept", "application/json"),
    }


def _anthropic_body(payload: dict[str, Any], raw: bytes, model: DesktopModel) -> bytes:
    """Untouched: Anthropic reports usage on every stream without being
    asked."""
    return raw


def _openai_body(payload: dict[str, Any], raw: bytes, model: DesktopModel) -> bytes:
    """Untouched, but for two things OpenAI will not do without being
    told, both of which are silent failures otherwise.

    **Usage on a stream.** OpenAI sends none unless the request carried
    `stream_options.include_usage`, and whether the engine asks for it is
    a compatibility flag in its own configuration. A stream that reports
    nothing would cost nothing, which is not a discount — it is metering
    that has quietly stopped working. So the proxy asks, always.

    **Reasoning alongside tools.** Some models refuse the two together on
    this endpoint and answer 400 rather than dropping one. The agent
    always carries tools, so such a model cannot answer at all. Where the
    catalogue records that refusal, the proxy sends the `none` that
    OpenAI's own error asks for. Setting it beats omitting it: the model's
    default is a reasoning level, so silence would be refused too.
    """
    changes: dict[str, Any] = {}

    if payload.get("stream") is True:
        options = payload.get("stream_options")
        options = dict(options) if isinstance(options, dict) else {}
        if options.get("include_usage") is not True:
            options["include_usage"] = True
            changes["stream_options"] = options

    tools = payload.get("tools")
    # `is not True` and not `not …`: the flag is three-valued, and an
    # unestablished model is treated as refusing. See the note on
    # DesktopModel.tool_reasoning for why that is the safe way round.
    if (
        model.tool_reasoning is not True
        and isinstance(tools, list)
        and tools
        and payload.get("reasoning_effort") != "none"
    ):
        changes["reasoning_effort"] = "none"

    if not changes:
        return raw
    return json.dumps({**payload, **changes}).encode()


@dataclass(frozen=True)
class _Wire:
    """One provider's own language: where it is spoken upstream, and how
    the request is dressed for it."""

    upstream_path: str
    headers: Callable[[Request], dict[str, str]]
    body: Callable[[dict[str, Any], bytes, DesktopModel], bytes]


_WIRES: dict[DesktopProvider, _Wire] = {
    DesktopProvider.anthropic: _Wire(
        upstream_path="/v1/messages",
        headers=_anthropic_headers,
        body=_anthropic_body,
    ),
    DesktopProvider.openai: _Wire(
        upstream_path="/v1/chat/completions",
        headers=_openai_headers,
        body=_openai_body,
    ),
}


def _timeout() -> httpx.Timeout:
    return httpx.Timeout(600.0, connect=30.0)


def _error(kind: str, message: str, status: int) -> JSONResponse:
    """The error shape both wires use. Anthropic's and OpenAI's own error
    bodies are already this shape, so the app reads ours the same way it
    reads theirs."""
    return JSONResponse(
        {"error": {"type": kind, "message": message}}, status_code=status
    )


@router.post("/api/proxy/v1/messages", name="desktop:messages", response_model=None)
async def proxy_messages(
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse | StreamingResponse:
    """Anthropic's Messages API, behind Claidor's key and the person's
    monthly allowance. The body goes through untouched; the usage
    Anthropic reports comes back as credits."""
    return await _proxy(request, desktop_session, session, DesktopProvider.anthropic)


@router.post(
    "/api/proxy/v1/chat/completions",
    name="desktop:chat_completions",
    response_model=None,
)
async def proxy_chat_completions(
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse | StreamingResponse:
    """OpenAI's Chat Completions API, behind Claidor's key and the same
    allowance. The app's loopback proxy already forwards this path, so
    the engine reaches it by speaking OpenAI to an OpenAI model — no
    translation anywhere."""
    return await _proxy(request, desktop_session, session, DesktopProvider.openai)


#: How much of a refusal to keep. Provider errors say what is wrong in
#: their first sentence; the rest is echoed request.
_REFUSAL_LOG_LIMIT = 1000

#: The one line to search the logs for when a model call fails.
UPSTREAM_REFUSED = "desktop.proxy.upstream_refused"


def _log_upstream_refusal(
    model: DesktopModel, status: int, body: bytes | None
) -> None:
    """Write down why the model service refused, in full, once.

    Without this the reason is lost: the body is handed back to the app,
    the app's engine reduces it to a failure kind, and what reaches the
    person is « 400 terminated » — a status and a word, with the sentence
    that says what is actually wrong nowhere at all. That was the state on
    13 September, when GPT models failed and nothing anywhere recorded
    OpenAI's own explanation. One line here ended two hours of guessing.

    The body is the provider's error text. It carries no key: the key goes
    up in a header, and a provider does not echo it back.
    """
    text = (body or b"").decode(errors="replace").strip()
    log.warning(
        UPSTREAM_REFUSED,
        provider=model.provider.value,
        model=model.model_id,
        status=status,
        body=text[:_REFUSAL_LOG_LIMIT] or "(empty)",
        truncated=len(text) > _REFUSAL_LOG_LIMIT,
    )


async def _proxy(
    request: Request,
    desktop_session: DesktopSession,
    session: AsyncSession,
    spoken: DesktopProvider,
) -> JSONResponse | StreamingResponse:
    raw = await request.body()
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        return _error("invalid_request_error", "The body is not JSON.", 400)
    if not isinstance(payload, dict):
        return _error("invalid_request_error", "The body must be an object.", 400)
    model = model_by_id(str(payload.get("model", "")))
    if model is None:
        return _error(
            "invalid_request_error",
            "This model is not offered by the desktop app.",
            400,
        )
    if model.provider is not spoken:
        # The path is one provider's language and the model is served by
        # another. Nothing here translates between the two, so this is a
        # mistake in the caller, not something to paper over.
        return _error(
            "invalid_request_error",
            f"{model.model_id} is served by {model.provider.value} "
            f"and is not reached through the {spoken.value} API.",
            400,
        )
    if not provider_configured(model.provider):
        return _error("api_error", "The model service is not configured.", 503)
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

    wire = _WIRES[model.provider]
    stream = payload.get("stream") is True
    url = f"{provider_base_url(model.provider)}{wire.upstream_path}"
    headers = wire.headers(request)
    body = wire.body(payload, raw, model)
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
            upstream = await client.post(url, headers=headers, content=body)
        usage = Usage()
        try:
            answer = upstream.json()
            usage = usage_from_answer(model.provider, answer)
        except ValueError:
            answer = None
        if upstream.status_code >= 400:
            _log_upstream_refusal(model, upstream.status_code, upstream.content)
        await record(usage, upstream.status_code)
        if answer is None:
            return _error(
                "api_error",
                "The model service answered with something that is not JSON.",
                502,
            )
        return JSONResponse(answer, status_code=upstream.status_code)

    client = httpx.AsyncClient(timeout=_timeout())
    upstream_request = client.build_request("POST", url, headers=headers, content=body)
    try:
        upstream = await client.send(upstream_request, stream=True)
    except httpx.HTTPError as error:
        await client.aclose()
        log.warning(
            "desktop.proxy.upstream_unreachable",
            provider=model.provider.value,
            error=str(error),
        )
        return _error("api_error", "The model service could not be reached.", 502)

    if upstream.status_code != 200:
        # An error is small and not an event stream: read it, meter
        # nothing, hand it back as it came.
        error_body = await upstream.aread()
        await upstream.aclose()
        await client.aclose()
        _log_upstream_refusal(model, upstream.status_code, error_body)
        await record(Usage(), upstream.status_code)
        try:
            return JSONResponse(
                json.loads(error_body), status_code=upstream.status_code
            )
        except ValueError:
            return _error(
                "api_error",
                error_body.decode(errors="replace")[:500],
                upstream.status_code,
            )

    async def relay() -> AsyncIterator[bytes]:
        tally = tally_for(model.provider)
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


# --- the connections --------------------------------------------------------

# The four routes of `docs/maties/connectors.md` are their own module,
# because everything about the middleman is kept away from the rest of
# Claidor, but they are the desktop app's routes and belong at the
# desktop app's address. Included here, they come out under
# `/desktop/api/connectors`.
router.include_router(connectors_router)


# --- the cloud engine -------------------------------------------------------

# The person's side of `docs/maties/cloud.md`: asking for a piece of work
# to be done on Claidor's servers, and seeing what came of it. The
# runner's own four verbs are a router of their own at `/maty/runner`,
# mounted in `polar.app` and reachable only with the service token; these
# are the app's, and belong at the app's address. Included here, they
# come out under `/desktop/api/maty/jobs`.
router.include_router(maty_jobs_router)
