"""The desktop app's server, on Claidor.

The desktop app, Maties (`desktop/`), is pointed at
`{BASE_URL}/desktop` and calls the paths below exactly as its own
server mode does. Sign-in works like this:

1. The app opens the browser at `/desktop/login?redirect_uri=…&state=…`
   (the redirect is a loopback callback the app is listening on; when
   it could not open one it comes with no redirect and expects a
   `caisra://` deep link instead).
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

import base64
import functools
import json
from collections.abc import AsyncIterator, Awaitable, Callable
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

from .auth import ProxyCaller, bearer_token, get_desktop_session, get_proxy_caller
from .boxes import (
    DEFAULT_SCOPE_KEY,
    BoxNotConfigured,
    BoxNotFound,
    BoxUpstreamError,
    box_service,
)
from .capabilities import router as capabilities_router
from .composio import forward as composio_forward

# Straight from the price list rather than through `service`, which
# re-exports only what it uses itself — a name it merely passed through
# is one `ruff --fix` away from disappearing, and the failure would be an
# ImportError at boot.
from .pricing import (
    SPEECH_MAX_CHARACTERS,
    SPEECH_MODEL,
    SPEECH_VOICE,
    openai_models_list,
)
from .proxy_common import error_response as _error
from .proxy_common import log_upstream_refusal as _log_upstream_refusal
from .proxy_common import upstream_timeout as _timeout
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
    SpokenApi,
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
from .skill_store import archive as skill_archive_bytes
from .skill_store import archive_path, marketplace_item
from .skill_store import catalog as skill_store_catalog

log = structlog.get_logger()

router = APIRouter(prefix="/desktop", tags=["desktop", APITag.private])

ANTHROPIC_VERSION = "2023-06-01"
DEEP_LINK_CALLBACK = "caisra://auth/callback"
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
        parsed.scheme == "caisra"
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
    """The skill marketplace: Anthropic's Apache-licensed skills.

    The app reads ``data.value.marketplace`` (skills to install),
    ``data.value.localSkill`` (names and descriptions for the bundled skills)
    and ``data.value.marketTags``.

    ``marketplace`` is the catalogue in ``polar/desktop/skill_store.py``:
    the skills of https://github.com/anthropics/skills that carry the
    Apache License 2.0, vendored under ``skills/`` next to that module
    and each downloadable as a zip from the route below. Four of that
    repository's skills — docx, pdf, pptx, xlsx — are under a different
    licence (« governed by your agreement with Anthropic ») and are not
    here; the app bundles them itself. ``doc-coauthoring`` carries no
    licence at all and is not here either. The full accounting is in
    ``skills/NOTICE``.

    ``localSkill`` stays empty. It would only add titles and descriptions
    for skills that are already installed, and the app covers both without
    us: names come from ``BUNDLED_SKILL_DISPLAY_NAMES``, which a test holds
    against ``skills.config.json`` in both languages, and descriptions fall
    back to the skill's own ``SKILL.md``. Sending them from here would be a
    second copy to keep in step.

    No bearer on either route: the app fetches the catalogue with a plain
    ``https.get`` and the archive with a fetch that carries only a
    User-Agent (``ipcHandlers/skills/handlers.ts``, ``downloadZipUrl``).
    """
    listing = skill_store_catalog()
    return _ok(
        {
            "value": {
                "marketplace": [
                    marketplace_item(
                        skill,
                        settings.generate_external_url(archive_path(skill.name)),
                    )
                    for skill in listing.skills
                ],
                "localSkill": [],
                "marketTags": list(listing.tags),
            }
        }
    )


@router.get(
    "/api/skill-store/{name}.zip",
    name="desktop:skill_archive",
    response_model=None,
)
async def skill_archive(name: str) -> Response:
    """One skill as the archive the app installs from: ``<name>/SKILL.md``
    and the rest of the skill beside it. A name the catalogue does not
    offer is 404, which the app reports as a failed download."""
    content = skill_archive_bytes(name)
    if content is None:
        return _fail(404, f"No skill named {name!r} in the store.", status=404)
    return Response(
        content=content,
        media_type="application/zip",
        headers={"content-disposition": f'attachment; filename="{name}.zip"'},
    )


@router.get("/api/kit-store", name="desktop:kit_store")
async def kit_store() -> JSONResponse:
    """The kit store, and it is empty for a structural reason, not for want of
    curation.

    The app reads ``data.value.kits`` and appends its own built-in kits.

    Three facts settle what can honestly go here, all of them in the desktop
    app rather than in this file:

    1. Installing a kit always downloads a zip from the kit's ``bundleUrl``,
       extracts it, and looks for directories containing ``SKILL.md``
       (``desktop/src/main/ipcHandlers/kits/handlers.ts``). There is no
       install-from-what-you-already-have path; even the one "built-in" kit,
       Computer Use, is a hosted zip.
    2. The skills the app bundles are enabled by
       ``desktop/SKILLs/skills.config.json``; the skill store above serves
       the rest of Anthropic's Apache-licensed skills one at a time.
    3. Kit installs and bundled skills share one directory, and the installer
       suffixes on collision. Shipping a kit of skills the app already has
       would write ``pdf-1`` next to ``pdf``.

    So a kit here would have to be a chosen set of the store's unbundled
    skills, hosted as one zip. Which of them belong together is a product
    decision nobody has taken; until then the store offers them singly.
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
# Three languages, and nothing here translates between any of them. The
# engine speaks Anthropic's `/v1/messages` to an Anthropic model, and one
# of OpenAI's two to an OpenAI one: `/v1/responses`, which is what we use,
# or the older `/v1/chat/completions`, kept because it costs nothing to
# keep and a client that has not moved still works.
#
# The path says which language is being spoken; the model says who serves
# it; the two must agree. From the model come the address, the key and
# the price list. One branch, in one place: `_WIRES`.
#
# Why Responses is the one we use: OpenAI will not take `reasoning_effort`
# and function tools together on Chat Completions — it answers 400 and
# names `/v1/responses` in its own error. An agent always carries tools,
# so on that wire every OpenAI model of ours ran with reasoning switched
# off. On this one it does not have to.


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


def _openai_responses_body(
    payload: dict[str, Any], raw: bytes, model: DesktopModel
) -> bytes:
    """Untouched.

    Neither of the two things the Chat Completions wire has to be told is
    needed here. Usage arrives on the terminal event without
    `stream_options` being set, and reasoning and tools travel together,
    which is the whole reason for this wire — so `tool_reasoning` is read
    only on the other one, and nothing is forced to `none`.

    Left deliberately as a function rather than reusing
    `_anthropic_body`: the two are identical today for different reasons,
    and a shared body would hide the day one of them stops being.
    """
    return raw


def _anthropic_body(payload: dict[str, Any], raw: bytes, model: DesktopModel) -> bytes:
    """Untouched: Anthropic reports usage on every stream without being
    asked."""
    return raw


def _openai_body(payload: dict[str, Any], raw: bytes, model: DesktopModel) -> bytes:
    """The older wire. Untouched, but for two things OpenAI will not do
    without being told, both of which are silent failures otherwise.

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


_WIRES: dict[SpokenApi, _Wire] = {
    SpokenApi.anthropic_messages: _Wire(
        upstream_path="/v1/messages",
        headers=_anthropic_headers,
        body=_anthropic_body,
    ),
    SpokenApi.openai_responses: _Wire(
        upstream_path="/v1/responses",
        headers=_openai_headers,
        body=_openai_responses_body,
    ),
    SpokenApi.openai_completions: _Wire(
        upstream_path="/v1/chat/completions",
        headers=_openai_headers,
        body=_openai_body,
    ),
}


@router.post("/api/proxy/v1/messages", name="desktop:messages", response_model=None)
async def proxy_messages(
    request: Request,
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse | StreamingResponse:
    """Anthropic's Messages API, behind Claidor's key and the person's
    monthly allowance. The body goes through untouched; the usage
    Anthropic reports comes back as credits."""
    return await _proxy(request, caller, session, SpokenApi.anthropic_messages)


@router.post(
    "/api/proxy/v1/chat/completions",
    name="desktop:chat_completions",
    response_model=None,
)
async def proxy_chat_completions(
    request: Request,
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse | StreamingResponse:
    """OpenAI's older Chat Completions API, behind Claidor's key and the
    same allowance.

    Not what our own engine is pointed at: this wire refuses reasoning
    alongside function tools, and an agent always carries tools. See
    `/api/proxy/v1/responses`.

    It is, however, the wire every general OpenAI-compatible client
    speaks, and Rakazo is one of them — its model connection posts here
    and nowhere else
    (the Rakazo attempt, removed 18 September; see `docs/product/going-back-brief.md`,
    which builds every model with `api: "openai-completions"`). So this
    route stopped being a courtesy to old clients the day Claidor was
    connected to a server it did not write.
    """
    return await _proxy(request, caller, session, SpokenApi.openai_completions)


@router.post(
    "/api/proxy/v1/responses",
    name="desktop:responses",
    response_model=None,
)
async def proxy_responses(
    request: Request,
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse | StreamingResponse:
    """OpenAI's Responses API, behind Claidor's key and the person's
    monthly allowance.

    The wire the engine speaks to every OpenAI model of ours, because it
    is the only one that will take reasoning and function tools in the
    same request. The engine implements it natively
    (`openai-transport-stream.ts`); nothing here translates anything.
    """
    return await _proxy(request, caller, session, SpokenApi.openai_responses)


@router.get(
    "/api/proxy/v1/models",
    name="desktop:proxy_models",
    include_in_schema=False,
)
async def proxy_models(
    caller: ProxyCaller = Depends(get_proxy_caller),
) -> JSONResponse:
    """The menu, in OpenAI's own words.

    `/api/models/available` is the same question answered in the desktop
    app's vocabulary. This is the answer an OpenAI-compatible client
    expects, because such a client knows nothing about Claidor and asks
    the one question its own protocol defines. Rakazo asks it while a
    person is connecting a model, and fills the list it is given
    (the Rakazo attempt, removed 18 September; see `docs/product/going-back-brief.md`,
    `probeOpenAiCompatibleModels`, which GETs `<base URL>/models`).

    Until this route existed that GET fell through to the catch-all below
    and answered 404, so connecting meant typing a model id from memory
    with no way to discover it. That was the whole of the gap.

    Scoped to the Chat Completions wire, because that is the only one an
    OpenAI-compatible client speaks — see `openai_models_list`. It is
    authenticated like everything else here: which models a person may
    name is their business, not the public's.

    **Not `_ok`.** Every other route on this router answers in the desktop
    app's envelope, `{"code": 0, "data": …}`, because the vendored client
    unwraps it. This one must not: an OpenAI-compatible client reads
    `data` as the array of models, and wrapping would hand it an object
    where it expects a list — a 200 that parses and then finds no models,
    which is the worst kind of failure to debug.
    """
    return JSONResponse(
        openai_models_list(offered_models(), SpokenApi.openai_completions)
    )


async def _proxy(
    request: Request,
    caller: ProxyCaller,
    session: AsyncSession,
    spoken: SpokenApi,
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
    if not model.reachable_on(spoken):
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
    user = caller.user
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

    wire = _WIRES[spoken]
    stream = payload.get("stream") is True
    url = f"{provider_base_url(model.provider)}{wire.upstream_path}"
    headers = wire.headers(request)
    body = wire.body(payload, raw, model)
    user_id, session_id = user.id, caller.session_id

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
            usage = usage_from_answer(spoken, answer)
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
        tally = tally_for(spoken)
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


# --- speech -----------------------------------------------------------------


@router.post(
    "/api/proxy/v1/audio/speech",
    name="desktop:speech",
    response_model=None,
    include_in_schema=False,
)
async def proxy_speech(
    request: Request,
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """Turn a reply into a voice.

    The engine already knows how to do this: OpenClaw ships a speech
    provider that posts OpenAI's own `/v1/audio/speech` shape at whatever
    base URL it is given (`openclaw/src/tts/`), and we keep that extension
    in the packaged runtime. So the app does not call this; the engine
    does, with its base URL pointed here, and this is the piece that was
    missing — a door that meters.

    Unlike the model proxy there is nothing to read back: the answer is
    audio bytes and carries no usage object. The characters we were asked
    to say are the only honest measure, so they are counted here, before
    the call, and recorded whether or not the call succeeds — a refusal
    after OpenAI has done the work still costs money.
    """
    raw = await request.body()
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        return _error("invalid_request_error", "The body is not JSON.", 400)
    if not isinstance(payload, dict):
        return _error("invalid_request_error", "The body must be an object.", 400)

    text = payload.get("input")
    if not isinstance(text, str) or not text.strip():
        return _error("invalid_request_error", "There is nothing to say.", 400)
    if len(text) > SPEECH_MAX_CHARACTERS:
        # Refused rather than truncated. Cutting a sentence in half and
        # charging for it is worse than saying no.
        return _error(
            "invalid_request_error",
            f"That is longer than {SPEECH_MAX_CHARACTERS} characters.",
            400,
        )

    if not provider_configured(DesktopProvider.openai):
        return _error("api_error", "The speech service is not configured.", 503)

    user = caller.user
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

    # The voice is ours, not the caller's. All seven of the app's voices
    # name a manner and ride on one OpenAI voice (`direction.md` §4), and
    # the manner is already in the agent's instructions — so a request
    # asking for a different speaker is answered with ours.
    body = {
        "model": SPEECH_MODEL.model_id,
        "voice": SPEECH_VOICE,
        "input": text,
        "response_format": payload.get("response_format") or "mp3",
    }
    instructions = payload.get("instructions")
    if isinstance(instructions, str) and instructions.strip():
        body["instructions"] = instructions

    user_id, session_id = user.id, caller.session_id
    sessionmaker: AsyncSessionMaker | None = getattr(
        request.state, "async_sessionmaker", None
    )

    async def record(status: int) -> None:
        usage = Usage(input_tokens=len(text))
        if sessionmaker is None:
            await desktop.record_usage(
                session,
                user_id=user_id,
                session_id=session_id,
                model=SPEECH_MODEL,
                usage=usage,
                stream=False,
                upstream_status=status,
            )
            return
        async with sessionmaker() as fresh:
            await desktop.record_usage(
                fresh,
                user_id=user_id,
                session_id=session_id,
                model=SPEECH_MODEL,
                usage=usage,
                stream=False,
                upstream_status=status,
            )
            await fresh.commit()

    url = f"{provider_base_url(DesktopProvider.openai)}/v1/audio/speech"
    headers = {
        "authorization": f"Bearer {provider_api_key(DesktopProvider.openai)}",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        try:
            upstream = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as error:
            log.warning("desktop.speech.upstream_unreachable", error=str(error))
            return _error("api_error", "The speech service could not be reached.", 502)

    try:
        await record(upstream.status_code)
    except Exception:  # a lost usage row must not swallow the audio
        log.exception("desktop.speech.usage_not_recorded")

    if upstream.status_code != 200:
        _log_upstream_refusal(SPEECH_MODEL, upstream.status_code, upstream.content)
        try:
            return JSONResponse(
                json.loads(upstream.content), status_code=upstream.status_code
            )
        except ValueError:
            return _error(
                "api_error",
                upstream.content.decode(errors="replace")[:500],
                upstream.status_code,
            )

    return Response(
        content=upstream.content,
        status_code=200,
        media_type=upstream.headers.get("content-type", "audio/mpeg"),
        headers={"cache-control": "no-store"},
    )


# --- the computer -----------------------------------------------------------
#
# The person's box, brokered. `polar/desktop/boxes.py` holds the whole of
# the reasoning and the E2B calls; these ten routes are the contract the
# engine's box plugin was written against
# (`docs/product/agent-computer-plan.md` §9, and
# `openclaw-extensions/box/brokerClient.ts`, which is the contract in
# executable form).
#
# **They live under `/api/proxy/box/…` and they are declared here for a
# reason.** The app reaches this server through its local token proxy,
# which prefixes `/api/proxy` and injects the account's bearer
# (`openclawTokenProxy.ts:219`). FastAPI takes the first route that
# matches, and `/api/proxy/{path:path}` below would swallow every one of
# these and answer 404 — the same trap the Composio block underneath
# already documents. Moving these after it silently kills the box.
#
# **Nothing here returns a key, and nothing returns an E2B sandbox id.**
# `boxId` is this server's own row id. The key would bill every box we
# run; the sandbox id would name a machine to whoever holds it.
#
# These answer in **plain JSON, not the app's `{code, data}` envelope**,
# because their caller is not the app: it is the engine's plugin, whose
# client reads `response.ok` and the body's own fields
# (`brokerClient.json`). Two conventions on one server is a cost; a
# client that cannot read the answer is worse.

#: The computer is not switched on for this server. Reads as « not
#: available here », never as a fault of the person's request.
BOX_NOT_CONFIGURED = 503

#: E2B refused or could not be reached, with its own sentence attached.
BOX_UPSTREAM_REFUSED = 502

#: The allowance is gone. The box is the first thing here that spends it
#: while nobody is looking, so it is the one refusal a person is most
#: likely to meet without having just asked for anything.
BOX_QUOTA_EXHAUSTED = 402


def _box_error(status: int, message: str) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


async def _box_json(make: Callable[[], Awaitable[Any]]) -> JSONResponse:
    """Run one box operation and turn its three failures into the shapes
    `brokerClient` reads. Written once because every route fails the same
    way, and a second spelling of « not configured » is a second thing to
    keep in step."""
    try:
        return JSONResponse(await make())
    except BoxNotConfigured:
        return _box_error(BOX_NOT_CONFIGURED, "The computer is not switched on here.")
    except BoxNotFound:
        # The same answer whether it belongs to nobody or to somebody
        # else. That is what keeps one account's box invisible to another.
        return _box_error(404, "No such box.")
    except BoxUpstreamError as error:
        return _box_error(BOX_UPSTREAM_REFUSED, error.message)


class BoxEnsureBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    scopeKey: str = DEFAULT_SCOPE_KEY
    template: str | None = None


class BoxShellBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    script: str
    args: list[str] = Field(default_factory=list)
    stdinBase64: str | None = None


class BoxExecBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    command: str
    workdir: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    pty: bool = False
    stdinBase64: str | None = None


class BoxFileBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    path: str
    contentBase64: str


@router.post("/api/proxy/box/sandboxes", name="desktop:box_ensure")
async def box_ensure(
    body: BoxEnsureBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """**Ensure, not create.**

    The same account and the same `scopeKey` get the box that is already
    there rather than a second one, because each accidental extra box is
    a second bill.

    The allowance is checked **here and in no other box route**: this is
    the only one that can start the meter. Pausing, describing or killing
    a box has to keep working when the month has run out — refusing to
    kill an exhausted account's box would leave it running and billing,
    which is precisely backwards.
    """
    user = desktop_session.user
    if await desktop.exhausted(session, user):
        return _box_error(
            BOX_QUOTA_EXHAUSTED,
            "Monthly credits exhausted. The computer stays asleep until the "
            "allowance resets at the start of next month.",
        )
    return await _box_json(
        lambda: _box_state_payload(
            box_service.ensure(
                session, user, scope_key=body.scopeKey, template=body.template
            )
        )
    )


@router.get("/api/proxy/box/machines", name="desktop:box_machines")
async def box_machines(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """The registry. Declared before `/sandboxes/{box_id}` would ever be
    consulted for it — different prefix, so no clash, but the ordering is
    kept obvious rather than left to chance."""
    return await _box_json(
        lambda: _machines_payload(box_service.machines(session, desktop_session.user))
    )


@router.get("/api/proxy/box/sandboxes/{box_id}", name="desktop:box_describe")
async def box_describe(
    box_id: str,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    return await _box_json(
        lambda: _box_state_payload(
            box_service.describe(session, desktop_session.user, box_id)
        )
    )


@router.delete(
    "/api/proxy/box/sandboxes/{box_id}",
    name="desktop:box_remove",
    status_code=204,
    response_model=None,
)
async def box_remove(
    box_id: str,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """204, and a 404 is fine — the client treats it as already gone.

    E2B bills by the second, so this really kills the machine rather than
    forgetting the row: a forgotten row is a machine nobody can now reach
    to stop.
    """
    try:
        await box_service.remove(session, desktop_session.user, box_id)
    except BoxNotConfigured:
        return _box_error(BOX_NOT_CONFIGURED, "The computer is not switched on here.")
    except BoxNotFound:
        return Response(status_code=404)
    except BoxUpstreamError as error:
        return _box_error(BOX_UPSTREAM_REFUSED, error.message)
    return Response(status_code=204)


@router.post("/api/proxy/box/sandboxes/{box_id}/update", name="desktop:box_update")
async def box_update(
    box_id: str,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    return await _box_json(
        lambda: _box_state_payload(
            box_service.update(session, desktop_session.user, box_id)
        )
    )


@router.post("/api/proxy/box/sandboxes/{box_id}/reset", name="desktop:box_reset")
async def box_reset(
    box_id: str,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    return await _box_json(
        lambda: _box_state_payload(
            box_service.reset(session, desktop_session.user, box_id)
        )
    )


@router.post("/api/proxy/box/sandboxes/{box_id}/shell", name="desktop:box_shell")
async def box_shell(
    box_id: str,
    body: BoxShellBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """One script, run to completion.

    A non-zero exit comes back **in the body, not as an HTTP error**: the
    filesystem bridge builds every file operation out of this and decides
    for itself whether a failure matters (`brokerClient.runShell`,
    `allowFailure`).
    """
    stdin = _decode_base64(body.stdinBase64)
    if stdin is _BAD_BASE64:
        return _box_error(400, "stdinBase64 is not base64.")
    return await _box_json(
        lambda: box_service.shell(
            session,
            desktop_session.user,
            box_id,
            script=body.script,
            args=body.args,
            stdin=stdin,
        )
    )


@router.put("/api/proxy/box/sandboxes/{box_id}/file", name="desktop:box_put_file")
async def box_put_file(
    box_id: str,
    body: BoxFileBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Import: the only way a file from the person's machine gets into
    the box. A deliberate copy, never ambient."""
    content = _decode_base64(body.contentBase64)
    if content is _BAD_BASE64 or content is None:
        return _box_error(400, "contentBase64 is not base64.")
    return await _box_json(
        lambda: _ok_dict(
            box_service.put_file(
                session, desktop_session.user, box_id, path=body.path, content=content
            )
        )
    )


@router.get("/api/proxy/box/sandboxes/{box_id}/file", name="desktop:box_get_file")
async def box_get_file(
    box_id: str,
    path: str = Query(...),
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Export: take a file back out of the box."""
    return await _box_json(
        lambda: _file_payload(
            box_service.get_file(session, desktop_session.user, box_id, path=path)
        )
    )


@router.post(
    "/api/proxy/box/sandboxes/{box_id}/exec",
    name="desktop:box_exec",
    response_model=None,
)
async def box_exec(
    box_id: str,
    body: BoxExecBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """The streamed one. NDJSON, one JSON object per line.

    **Every database touch happens here, before the response starts.**
    `get_db_session` commits the request's session when this function
    returns — which is the moment the `StreamingResponse` is handed back,
    long before the body has been streamed — so a write from inside the
    generator would land in a transaction nothing ever commits and be
    silently lost. The box would run and the person would be charged
    nothing, with no error anywhere. `BoxService.prepare_exec` is that
    rule with a name on it; the model proxy solves the same problem the
    other way, with a session of its own.

    Frames are then yielded the moment they arrive rather than collected:
    buffering a three-minute build into three minutes of silence is
    indistinguishable from a hang, from the agent's side. Killing the
    command when the client goes away is `exec_frames`'s `finally`,
    reached when Starlette closes the generator.
    """
    try:
        sandbox = await box_service.prepare_exec(session, desktop_session.user, box_id)
    except BoxNotConfigured:
        return _box_failed_stream("The computer is not switched on here.")
    except BoxNotFound:
        return _box_failed_stream("No such box.")
    except BoxUpstreamError as error:
        return _box_failed_stream(error.message)

    return StreamingResponse(
        box_service.exec_frames(
            sandbox,
            command=body.command,
            workdir=body.workdir,
            env=body.env,
            pty=body.pty,
        ),
        status_code=200,
        media_type="application/x-ndjson",
        headers={"cache-control": "no-store"},
    )


def _box_failed_stream(message: str) -> StreamingResponse:
    """A failure the bridge can read, in the shape it is already parsing.

    A command that never started still answers NDJSON rather than a bare
    status, because by the time the bridge is reading this it is reading
    a stream. And it still ends in an `exit` frame: a stream that stops
    without one is treated as a failure on purpose, and leaving the
    bridge to infer that from a closed socket is how a lie gets told
    about a command that never ran.
    """
    body = (
        json.dumps({"t": "error", "message": message}, separators=(",", ":")).encode()
        + b"\n"
        + b'{"t":"exit","code":1}\n'
    )

    async def once() -> AsyncIterator[bytes]:
        yield body

    return StreamingResponse(
        once(),
        status_code=200,
        media_type="application/x-ndjson",
        headers={"cache-control": "no-store"},
    )


#: A sentinel, because `None` is a legitimate answer for « nothing was
#: sent » and « that was not base64 » must not read as the same thing.
_BAD_BASE64 = object()


def _decode_base64(raw: str | None) -> Any:
    if raw is None:
        return None
    try:
        return base64.b64decode(raw, validate=True)
    except (ValueError, TypeError):
        return _BAD_BASE64


async def _box_state_payload(awaitable: Awaitable[Any]) -> dict[str, Any]:
    return (await awaitable).payload()


async def _machines_payload(
    awaitable: Awaitable[list[dict[str, Any]]],
) -> dict[str, Any]:
    return {"machines": await awaitable}


async def _file_payload(awaitable: Awaitable[bytes]) -> dict[str, Any]:
    return {"contentBase64": base64.b64encode(await awaitable).decode()}


async def _ok_dict(awaitable: Awaitable[None]) -> dict[str, Any]:
    await awaitable
    return {"ok": True}


# The agent's other three calls — web search, pictures, dictation — are
# their own module (`capabilities.py`) and sit under `/api/proxy/v1`
# like the model calls. Included before the catch-all for the same
# reason Composio is declared before it.
router.include_router(capabilities_router)


# Apps through Composio: the app's six calls, forwarded with Claidor's
# key and the account's own Composio user id (`composio.py`). Declared
# before the catch-all below, because FastAPI takes the first route
# that matches and `/api/proxy/{path}` would take this one.
@router.api_route(
    "/api/proxy/composio/{path:path}",
    methods=["GET", "POST", "DELETE"],
    name="desktop:composio",
    include_in_schema=False,
)
async def proxy_composio(
    path: str,
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> Response:
    return await composio_forward(request, desktop_session, path)


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
