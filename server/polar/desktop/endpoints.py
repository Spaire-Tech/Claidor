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
from uuid import uuid4

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
from .composio import forward as composio_forward

# Straight from the price list rather than through `service`, which
# re-exports only what it uses itself — a name it merely passed through
# is one `ruff --fix` away from disappearing, and the failure would be an
# ImportError at boot.
from .pricing import (
    IMAGE_MAX_IMAGES,
    IMAGE_MODEL,
    IMAGE_MODEL_ID,
    IMAGE_QUALITY,
    IMAGE_SIZE_DEFAULT,
    IMAGE_USD_PER_IMAGE,
    SPEECH_MAX_CHARACTERS,
    SPEECH_MODEL,
    SPEECH_VOICE,
    image_billing_units,
    image_size_offered,
    openai_models_list,
)
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


#: How much of a refusal to keep. Provider errors say what is wrong in
#: their first sentence; the rest is echoed request.
_REFUSAL_LOG_LIMIT = 1000

#: The one line to search the logs for when a model call fails.
UPSTREAM_REFUSED = "desktop.proxy.upstream_refused"


def _log_upstream_refusal(model: DesktopModel, status: int, body: bytes | None) -> None:
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

    url = f"{provider_base_url(DesktopProvider.openai)}/audio/speech"
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


# --- images -----------------------------------------------------------------
#
# Why these live at `/api/media/...` and not on the proxy.
#
# `docs/product/images-state.md` recommended a synchronous
# `/api/proxy/v1/images/generations` mirroring the speech route, and said
# serving the shape the app already asks for would mean "more server
# code… it emulates an upstream API we otherwise do not use". Reading
# `desktop/src/main/main.ts` changes both halves of that:
#
# 1. **The task shape does not require a task.** The app registers
#    background polling only when the status it got back is not terminal
#    (`main.ts:6679`). A `generate` that answers `status: "succeeded"`
#    with the pictures already in it goes straight to
#    `persistGeneratedImages` (`main.ts:6648`) and nothing is ever
#    polled. So the whole polling machinery — a task table, a job, a
#    lease — is not needed to satisfy a caller that expects it.
#
# 2. **Nothing needs hosting.** `mediaAssetPersistence.ts:296` decodes a
#    base64 `data:` URL inline and only reaches for the network on an
#    `http` one. So OpenAI's `b64_json` goes back as a data URL and is
#    written to the session's folder without Claidor storing a byte of
#    it.
#
# 3. **This is not a wire we otherwise avoid; it is the one we already
#    speak.** The split is by caller. `/api/proxy/v1/*` is the *engine's*
#    door and talks a provider's own language. Everything under `/api/*`
#    is the *app's* door and talks the app's `{code, data}` envelope —
#    which is why `_ok` and `_fail` exist at the top of this file. Image
#    generation is an app call (`handleMediaGenerationCallback`), not an
#    engine call, so it belongs on the app's door in the app's shape.
#
# What this costs, said plainly: a `taskId` that is not a task, and a
# `tasks/{id}` route that can only answer "there was nothing to poll".
# The day an image model is genuinely asynchronous, that route grows a
# store. Until then the debt is one honest 404-ish message.

#: An image request that cannot be served as asked — a size we do not
#: draw, more pictures than the cap, a reference image. 400-family,
#: beside `MEMORY_REFUSED`.
IMAGE_REFUSED = 40010

#: Quota. **Not** `QUOTA_EXHAUSTED_CODE`, and the exception is
#: deliberate: the app's media handler knows 40203 and 40204 on this path
#: and nothing else (`main.ts:6569`, `main.ts:6577`). Answering 40200
#: here would fall through to its generic branch and the person would be
#: told "Media generation request failed" instead of that their month ran
#: out. The code the reader understands wins over the code the rest of
#: this file uses.
IMAGE_QUOTA_EXHAUSTED = 40204

#: Claidor holds no OpenAI key. Reads as « not available here », never as
#: a fault of the person's request.
IMAGE_NOT_CONFIGURED = 50300

#: OpenAI refused, or could not be reached. The provider's own sentence
#: travels in the message: the lesson of 13 September is that a status
#: without the sentence costs hours (`_log_upstream_refusal`).
IMAGE_UPSTREAM_REFUSED = 50200

#: Aspect ratios the app may send instead of a size (`params.aspectRatio`),
#: mapped onto the three sizes OpenAI's image API actually draws. A ratio
#: that is not here is not guessed at — `_image_size` answers None and the
#: caller is told which sizes exist.
IMAGE_ASPECT_RATIOS: dict[str, str] = {
    "1:1": "1024x1024",
    "2:3": "1024x1536",
    "3:2": "1536x1024",
    "9:16": "1024x1536",
    "16:9": "1536x1024",
}

#: The formats OpenAI will return. `png` unless asked otherwise; the
#: choice does not move the price.
IMAGE_OUTPUT_FORMATS = frozenset({"png", "jpeg", "webp"})

#: Parameters that mean « draw from this picture » rather than « draw a
#: picture ». That is `/v1/images/edits`, a multipart endpoint with its
#: own price, and it is not served yet. Named here so the refusal can say
#: which one arrived instead of failing somewhere further in.
IMAGE_REFERENCE_PARAMS = (
    "image",
    "images",
    "referenceImages",
    "media",
    "firstFrame",
    "lastFrame",
)


def _image_count(params: dict[str, Any]) -> int | str:
    """How many pictures were asked for, or a sentence saying why that
    cannot be served. The app sends `n`, and `count` on some paths."""
    asked = params.get("n")
    if asked is None:
        asked = params.get("count")
    if asked is None:
        return 1
    if isinstance(asked, bool) or not isinstance(asked, int | float):
        return "The number of images must be a whole number."
    number = int(asked)
    if number < 1:
        return "The number of images must be at least one."
    if number > IMAGE_MAX_IMAGES:
        # Refused rather than clamped. Drawing three when four were asked
        # for, and charging for three, is a picture missing from a
        # document with nothing anywhere saying why.
        return f"At most {IMAGE_MAX_IMAGES} images can be drawn in one call."
    return number


def _image_size(params: dict[str, Any]) -> str | None:
    """The size to draw at, or None if the caller named one we do not
    serve. `size`, then `imageSize`, then `aspectRatio` — the three keys
    the app fills in (`main.ts:6369`)."""
    for key in ("size", "imageSize"):
        value = params.get(key)
        if isinstance(value, str) and value.strip():
            return image_size_offered(value)
    ratio = params.get("aspectRatio")
    if isinstance(ratio, str) and ratio.strip():
        return IMAGE_ASPECT_RATIOS.get(ratio.strip())
    return image_size_offered(None)


def _image_output_format(params: dict[str, Any]) -> str:
    for key in ("outputFormat", "output_format"):
        value = params.get(key)
        if isinstance(value, str) and value.strip().lower() in IMAGE_OUTPUT_FORMATS:
            return value.strip().lower()
    return "png"


@router.get("/api/media/images/models", name="desktop:image_models")
async def image_models(
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    """The image menu, which is one model long.

    One model because the founder, 16 September: *"my users should never
    put a key. everything happens under the hood. not a setting."* The
    agent decides a picture belongs; Claidor decides what draws it. The
    list is served at all because the agent's brief allows one `list`
    call before drawing, and an agent that asks and is answered 404
    concludes it cannot make pictures.

    Empty when Claidor holds no OpenAI key — « not available here »
    rather than an error at the moment somebody asks for a picture,
    which is the same rule `offered_models()` follows.
    """
    if not provider_configured(DesktopProvider.openai):
        return _ok([])
    return _ok(
        [
            {
                "modelId": IMAGE_MODEL_ID,
                "displayName": "Caisra images",
                "capabilities": (
                    "Draws a picture from a description. "
                    f"Sizes: {', '.join(sorted(IMAGE_USD_PER_IMAGE))}. "
                    f"Up to {IMAGE_MAX_IMAGES} images in one call. "
                    "Drawing from an existing picture is not available."
                ),
                "parameterSpec": {
                    "prompt": {"type": "string", "required": True},
                    "size": {
                        "type": "string",
                        "enum": sorted(IMAGE_USD_PER_IMAGE),
                        "default": IMAGE_SIZE_DEFAULT,
                    },
                    "n": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": IMAGE_MAX_IMAGES,
                        "default": 1,
                    },
                    "outputFormat": {
                        "type": "string",
                        "enum": sorted(IMAGE_OUTPUT_FORMATS),
                        "default": "png",
                    },
                },
            }
        ]
    )


@router.get("/api/media/videos/models", name="desktop:video_models")
async def video_models(
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    """No video models, said in the app's own words rather than by a 404.

    The same tool that makes pictures offers video, so the agent will ask
    eventually. An empty list reaches it as "No video models available."
    (`main.ts:6132`); a 404 reaches it as an unparsed failure it may
    retry. This route exists to make a « no » legible, and for no other
    reason.
    """
    return _ok([])


@router.get(
    "/api/media/images/tasks/{task_id}",
    name="desktop:image_task",
)
async def image_task(
    task_id: str,
    desktop_session: DesktopSession = Depends(get_desktop_session),
) -> JSONResponse:
    """There is no task to poll, and saying so beats inventing one.

    Drawing here is synchronous: `generate` answers `succeeded` with the
    pictures in it, so the app never registers a poll (`main.ts:6679`)
    and this route is only reached by an agent following the polling half
    of its brief out of habit. It is answered with a sentence that ends
    the loop rather than a 404 the agent may read as a transient fault.
    """
    return _fail(
        IMAGE_REFUSED,
        "Images are drawn immediately, so there is no task to check. The "
        "pictures were in the answer to the generate call.",
    )


@router.post(
    "/api/media/images/generate",
    name="desktop:image_generate",
    response_model=None,
)
async def image_generate(
    request: Request,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Draw a picture, meter it, and hand it back in one answer.

    The speech route is the pattern this follows: one route, the provider
    call, a usage record, a price in `pricing.py`. It differs from speech
    in one way worth knowing — speech counts the characters it *sent*
    because the answer is audio with no usage in it, whereas an image's
    price is per picture, so what is counted here is what was actually
    drawn (`credits_for_image`).

    The model asked for is ignored on purpose. There is one, it is
    Claidor's, and a caller naming another is told which one drew the
    picture through `modelSelectionReason` — a field the app already
    prints (`main.ts:6642`) — rather than being refused. A picture the
    agent can see the provenance of is worth more than a refusal it has
    to recover from.
    """
    raw = await request.body()
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        return _fail(IMAGE_REFUSED, "The body is not JSON.")
    if not isinstance(payload, dict):
        return _fail(IMAGE_REFUSED, "The body must be an object.")

    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        return _fail(IMAGE_REFUSED, "There is nothing to draw.")

    params = payload.get("params")
    if not isinstance(params, dict):
        params = {}

    present = [name for name in IMAGE_REFERENCE_PARAMS if params.get(name)]
    if present:
        # Drawing *from* a picture is `/v1/images/edits`: a different
        # endpoint, multipart, with its own price. Refused by name rather
        # than quietly ignored, because an ignored reference image
        # produces a picture that is wrong in a way the agent cannot see.
        return _fail(
            IMAGE_REFUSED,
            f"Drawing from an existing picture is not available yet "
            f"({', '.join(present)} was supplied). Describe the picture "
            f"instead.",
        )

    count = _image_count(params)
    if isinstance(count, str):
        return _fail(IMAGE_REFUSED, count)

    size = _image_size(params)
    if size is None:
        return _fail(
            IMAGE_REFUSED,
            f"That size is not available. The sizes drawn are "
            f"{', '.join(sorted(IMAGE_USD_PER_IMAGE))}.",
        )

    if not provider_configured(DesktopProvider.openai):
        return _fail(IMAGE_NOT_CONFIGURED, "Image generation is not configured.")

    user = desktop_session.user
    if await desktop.exhausted(session, user):
        return _fail(
            IMAGE_QUOTA_EXHAUSTED,
            "Monthly credits exhausted. The allowance resets at the start of "
            "next month.",
        )

    body = {
        "model": IMAGE_MODEL_ID,
        "prompt": prompt,
        "n": count,
        "size": size,
        "quality": IMAGE_QUALITY,
        "output_format": _image_output_format(params),
    }
    url = f"{provider_base_url(DesktopProvider.openai)}/images/generations"
    headers = {
        "authorization": f"Bearer {provider_api_key(DesktopProvider.openai)}",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        try:
            upstream = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as error:
            log.warning("desktop.images.upstream_unreachable", error=str(error))
            return _fail(
                IMAGE_UPSTREAM_REFUSED, "The drawing service could not be reached."
            )

    if upstream.status_code != 200:
        _log_upstream_refusal(IMAGE_MODEL, upstream.status_code, upstream.content)
        # Nothing was drawn, so nothing is charged and no row is written:
        # unlike speech, where the provider has already done the work by
        # the time it answers, a refused image call produced no picture.
        return _fail(IMAGE_UPSTREAM_REFUSED, _image_refusal_message(upstream.content))

    try:
        answer = json.loads(upstream.content)
    except ValueError:
        answer = None
    urls = _image_data_urls(answer, _image_output_format(params))
    if not urls:
        log.warning(
            "desktop.images.no_pictures",
            status=upstream.status_code,
            body=upstream.content.decode(errors="replace")[:_REFUSAL_LOG_LIMIT],
        )
        return _fail(
            IMAGE_UPSTREAM_REFUSED, "The drawing service returned no pictures."
        )

    # Metered on what came back, not on what was asked for. A call that
    # was told to draw four and returned three is charged for three.
    units = image_billing_units(size, len(urls))
    recorded = True
    try:
        await desktop.record_usage(
            session,
            user_id=user.id,
            session_id=desktop_session.id,
            model=IMAGE_MODEL,
            usage=Usage(input_tokens=units),
            stream=False,
            upstream_status=upstream.status_code,
        )
        await session.flush()
    except Exception:
        # A lost usage row must not swallow the picture — OpenAI has
        # already drawn it and the person has already paid for it, so
        # handing back a 500 loses them both the picture and the money.
        #
        # The rollback is the part that makes that true. `get_db_session`
        # commits this session when the handler returns, and a session
        # left in a failed transaction raises there instead — so without
        # this line the "swallow" the message above forbids is exactly
        # what would happen, one frame further out.
        log.exception("desktop.images.usage_not_recorded")
        recorded = False
        try:
            await session.rollback()
        except Exception:
            log.exception("desktop.images.rollback_failed")

    # Read after the flush, so the figure the app is handed already has
    # this call in it. Skipped when nothing was recorded, because the
    # same session that could not write is unlikely to answer, and a
    # quota that cannot be read is not worth a failed picture.
    quota: dict[str, Any] = {}
    if recorded:
        try:
            quota = await desktop.quota(session, user)
        except Exception:
            log.exception("desktop.images.quota_not_read")
    return _ok(
        {
            # Not a task: drawing is synchronous here and the pictures are
            # already in this answer. An id is returned because the app
            # keys its per-account bookkeeping on one
            # (`rememberMediaTaskOwnership`), and because a stable handle
            # costs nothing.
            "taskId": str(uuid4()),
            "status": "succeeded",
            "resultUrls": urls,
            "model": IMAGE_MODEL_ID,
            "modelSelectionReason": (
                "Caisra draws with one model; the app does not ask anyone to "
                "choose one."
            ),
            # Omitted rather than guessed at when it could not be read:
            # the app prints this number to the person and only prints it
            # when it is present (`main.ts:6644`).
            **(
                {"quotaRemaining": quota["creditsRemaining"]}
                if "creditsRemaining" in quota
                else {}
            ),
        }
    )


def _image_refusal_message(body: bytes | None) -> str:
    """OpenAI's own sentence, so the agent is told what is actually
    wrong. A prompt refused by the safety system is the common case here
    and the agent can often rewrite it — but only if it is told."""
    try:
        parsed = json.loads(body or b"")
    except ValueError:
        parsed = None
    if isinstance(parsed, dict):
        error = parsed.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()[:500]
    return (body or b"").decode(errors="replace").strip()[:500] or (
        "The drawing service refused the request."
    )


def _image_data_urls(answer: Any, output_format: str) -> list[str]:
    """OpenAI's answer turned into data URLs the app can write to disk
    without a second request.

    `mediaAssetPersistence.ts` decodes a base64 data URL inline and
    sniffs the bytes for the real format, so the media type below only
    has to be an image type — it is corrected from the bytes on the way
    to disk. A `url` in the answer is passed through untouched for the
    same reason: the app fetches an `http` one itself.
    """
    if not isinstance(answer, dict):
        return []
    rows = answer.get("data")
    if not isinstance(rows, list):
        return []
    media_type = f"image/{'jpeg' if output_format == 'jpeg' else output_format}"
    urls: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        encoded = row.get("b64_json")
        if isinstance(encoded, str) and encoded.strip():
            urls.append(f"data:{media_type};base64,{encoded.strip()}")
            continue
        hosted = row.get("url")
        if isinstance(hosted, str) and hosted.strip():
            urls.append(hosted.strip())
    return urls


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
