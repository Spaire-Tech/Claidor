"""A person's Slack workspace and GitHub App installation, as the app
reads them (25 September 2026).

The app asks three `DashboardService` methods before it draws a
listener's connect card and after the person clicks it
(`host/extensions/automations/listener-integrations.ts`,
`listener-connect-watcher.ts`): `GetSlackUserSettings.hasSlackAuth`,
`GetScmConnectionStatus.connected`, and `GetSlackInstallUrl.url`. Grok
Bot's install URL was cursor.com's dashboard; ours is on this host:

- `GET /sand/slack/install` sends the signed-in person to Slack's OAuth
  v2 consent page for Simeon's Slack app and `GET /sand/slack/callback`
  stores the workspace's bot token on their connection row;
- `GET /sand/github/install` sends them to Simeon's GitHub App
  installation page and `GET /sand/github/callback` (the App's *Setup
  URL*, with the `state` GitHub forwards) binds the installation to them.

Both pages use the web session cookie, the way `/desktop/login` does: an
anonymous browser is sent to the web login and back. The card's watcher
polls the two status methods every five seconds and resumes the agent.
"""

from __future__ import annotations

import secrets
from typing import Any
from urllib.parse import quote
from uuid import UUID

import structlog
from fastapi import Depends, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from polar.auth.dependencies import WebUserOrAnonymous
from polar.auth.models import is_user
from polar.config import settings
from polar.kit.utils import utc_now
from polar.models import SandListenerConnection
from polar.openapi import APITag
from polar.postgres import AsyncSession, get_db_session
from polar.redis import Redis, get_redis
from polar.routing import APIRouter

from .connect import ConnectCall, ConnectService
from .listeners_repository import SandListenerConnectionRepository
from .listeners_service import ANY_SCOPE, listeners
from .listeners_slack import SlackApiError, SlackWebClient, authorize_url

log = structlog.get_logger()

STATE_TTL_SECONDS = 15 * 60
CHANNEL_CACHE_SECONDS = 5 * 60

#: The sentence a person reads when the founder has not registered the
#: app yet; the same sentence is what the log line carries.
SLACK_NOT_REGISTERED = (
    "Simeon's Slack app is not registered on this server yet "
    "(CLAIDOR_SLACK_CLIENT_ID and CLAIDOR_SLACK_CLIENT_SECRET are empty), so Slack cannot be connected."
)
GITHUB_NOT_REGISTERED = (
    "Simeon's GitHub App is not registered on this server yet "
    "(CLAIDOR_SAND_GITHUB_APP_SLUG is empty), so GitHub cannot be connected."
)

service = ConnectService("aiserver.v1.DashboardService")
router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)

#: Replaceable in tests (an `httpx.MockTransport` behind it).
slack_client = SlackWebClient()


def slack_install_url() -> str:
    return settings.generate_external_url("/sand/slack/install")


def github_install_url() -> str:
    return settings.generate_external_url("/sand/github/install")


# --- DashboardService ----------------------------------------------------------


@service.unary("GetSlackUserSettings", auth="desktop-or-box")
async def get_slack_user_settings(call: ConnectCall) -> dict[str, Any]:
    connected = await listeners.has_connection(call.db, call.caller.user_id, "slack")
    return {"hasSlackAuth": connected, "canShow": True}


@service.unary("GetScmConnectionStatus", auth="desktop-or-box")
async def get_scm_connection_status(call: ConnectCall) -> dict[str, Any]:
    return {
        "connected": await listeners.has_connection(
            call.db, call.caller.user_id, "github"
        )
    }


@service.unary("GetSlackInstallUrl", auth="desktop-or-box")
async def get_slack_install_url(call: ConnectCall) -> dict[str, Any]:
    if not settings.SLACK_CLIENT_ID:
        log.info(
            "sand.listeners.slack_install_url",
            user_id=str(call.caller.user_id),
            registered=False,
        )
    return {"url": slack_install_url()}


# --- the install pages -----------------------------------------------------------


def _login_redirect(path: str) -> RedirectResponse:
    return_to = settings.generate_external_url(path)
    return RedirectResponse(
        settings.generate_frontend_url(f"/login?return_to={quote(return_to, safe='')}"),
        303,
    )


def _page(title: str, body: str, status: int = 200) -> HTMLResponse:
    return HTMLResponse(
        f"<!doctype html><html><head><meta charset='utf-8'><title>{title}</title>"
        "<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:6rem auto;padding:0 1.5rem;color:#111}"
        "h1{font-size:1.4rem}</style></head>"
        f"<body><h1>{title}</h1><p>{body}</p></body></html>",
        status_code=status,
    )


async def _mint_state(redis: Redis, platform: str, user_id: UUID) -> str:
    state = secrets.token_urlsafe(24)
    await redis.set(
        f"sand:listeners:{platform}:state:{state}", str(user_id), ex=STATE_TTL_SECONDS
    )
    return state


async def _take_state(redis: Redis, platform: str, state: str | None) -> UUID | None:
    if not state:
        return None
    key = f"sand:listeners:{platform}:state:{state}"
    value = await redis.get(key)
    if value is None:
        return None
    await redis.delete(key)
    try:
        return UUID(value.decode() if isinstance(value, bytes) else str(value))
    except ValueError:
        return None


@router.get("/sand/slack/install", name="sand:slack_install", response_model=None)
async def slack_install(
    request: Request,
    auth_subject: WebUserOrAnonymous,
    redis: Redis = Depends(get_redis),
) -> RedirectResponse | HTMLResponse:
    if not is_user(auth_subject):
        return _login_redirect("/sand/slack/install")
    if not settings.SLACK_CLIENT_ID or not settings.SLACK_CLIENT_SECRET:
        log.warning("sand.listeners.slack_install_refused", reason=SLACK_NOT_REGISTERED)
        return _page("Slack is not available yet", SLACK_NOT_REGISTERED, status=503)
    state = await _mint_state(redis, "slack", auth_subject.subject.id)
    redirect_uri = settings.generate_external_url("/sand/slack/callback")
    return RedirectResponse(
        authorize_url(settings.SLACK_CLIENT_ID, redirect_uri, state), 303
    )


@router.get("/sand/slack/callback", name="sand:slack_callback", response_model=None)
async def slack_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> HTMLResponse:
    user_id = await _take_state(redis, "slack", state)
    if user_id is None:
        return _page(
            "Slack sign-in expired",
            "Open the connect card in Simeon again and retry.",
            status=400,
        )
    if error or not code:
        log.info(
            "sand.listeners.slack_install_denied", user_id=str(user_id), error=error
        )
        return _page(
            "Slack was not connected",
            f"Slack answered: {error or 'no code'}. Retry from the card in Simeon.",
            status=400,
        )
    try:
        grant = await slack_client.oauth_v2_access(
            client_id=settings.SLACK_CLIENT_ID,
            client_secret=settings.SLACK_CLIENT_SECRET,
            code=code,
            redirect_uri=settings.generate_external_url("/sand/slack/callback"),
        )
    except SlackApiError as failure:
        log.warning(
            "sand.listeners.slack_install_failed",
            user_id=str(user_id),
            error=failure.error,
        )
        return _page(
            "Slack was not connected",
            f"Slack answered: {failure.error}. Retry from the card in Simeon.",
            status=502,
        )
    team: dict[str, Any] = grant.get("team") or {}
    authed: dict[str, Any] = grant.get("authed_user") or {}
    if not isinstance(team, dict) or not isinstance(authed, dict):
        return _page(
            "Slack was not connected",
            "Slack's answer had an unexpected shape.",
            status=502,
        )
    team_id = str(team.get("id") or "")
    token = str(grant.get("access_token") or "")
    if not team_id or not token:
        return _page(
            "Slack was not connected",
            "Slack's answer named no workspace or no bot token.",
            status=502,
        )
    repository = SandListenerConnectionRepository.from_session(session)
    row = await repository.get_by_external("slack", team_id)
    values: dict[str, Any] = {
        "user_id": user_id,
        "external_name": str(team.get("name") or ""),
        "external_user_id": str(authed.get("id") or "") or None,
        "access_token": token,
        "extra": {
            "bot_user_id": str(grant.get("bot_user_id") or ""),
            "channels": [],
            "channels_refreshed_at": None,
        },
    }
    if row is None:
        row = await repository.create(
            SandListenerConnection(platform="slack", external_id=team_id, **values),
            flush=True,
        )
    else:
        row = await repository.update(row, update_dict=values, flush=True)
    await refresh_slack_channels(session, row, force=True)
    log.info(
        "sand.listeners.slack_connected",
        user_id=str(user_id),
        team_id=team_id,
        team=row.external_name,
    )
    return _page(
        "Slack is connected to Simeon",
        "You can close this page and go back to Simeon; the routine picks it up by itself.",
    )


@router.get("/sand/github/install", name="sand:github_install", response_model=None)
async def github_install(
    request: Request,
    auth_subject: WebUserOrAnonymous,
    redis: Redis = Depends(get_redis),
) -> RedirectResponse | HTMLResponse:
    if not is_user(auth_subject):
        return _login_redirect("/sand/github/install")
    if not settings.SAND_GITHUB_APP_SLUG:
        log.warning(
            "sand.listeners.github_install_refused", reason=GITHUB_NOT_REGISTERED
        )
        return _page("GitHub is not available yet", GITHUB_NOT_REGISTERED, status=503)
    state = await _mint_state(redis, "github", auth_subject.subject.id)
    return RedirectResponse(
        f"https://github.com/apps/{settings.SAND_GITHUB_APP_SLUG}/installations/new?state={quote(state, safe='')}",
        303,
    )


@router.get("/sand/github/callback", name="sand:github_callback", response_model=None)
async def github_callback(
    request: Request,
    installation_id: str | None = Query(default=None),
    setup_action: str | None = Query(default=None),
    state: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> HTMLResponse:
    user_id = await _take_state(redis, "github", state)
    if user_id is None:
        return _page(
            "GitHub install expired",
            "Open the connect card in Simeon again and retry.",
            status=400,
        )
    if not installation_id:
        return _page(
            "GitHub was not connected",
            "GitHub sent no installation id. Retry from the card in Simeon.",
            status=400,
        )
    repository = SandListenerConnectionRepository.from_session(session)
    row = await repository.get_by_external("github", installation_id)
    if row is None:
        row = await repository.create(
            SandListenerConnection(
                platform="github",
                external_id=installation_id,
                user_id=user_id,
                external_name="",
                extra={},
            ),
            flush=True,
        )
    else:
        await repository.update(row, update_dict={"user_id": user_id}, flush=True)
    log.info(
        "sand.listeners.github_connected",
        user_id=str(user_id),
        installation_id=installation_id,
        setup_action=setup_action,
    )
    return _page(
        "GitHub is connected to Simeon",
        "You can close this page and go back to Simeon; the routine picks it up by itself.",
    )


# --- resolving a subscription against the connections ---------------------------------


async def refresh_slack_channels(
    session: AsyncSession, row: SandListenerConnection, *, force: bool = False
) -> None:
    """Re-read the workspace's channel list when the cache is stale."""
    extra = dict(row.extra)
    refreshed_at = extra.get("channels_refreshed_at")
    if (
        not force
        and isinstance(refreshed_at, (int, float))
        and utc_now().timestamp() - refreshed_at < CHANNEL_CACHE_SECONDS
    ):
        return
    if not row.access_token:
        return
    try:
        channels = await slack_client.conversations_list(row.access_token)
    except (SlackApiError, Exception) as failure:  # the cache stands
        log.warning(
            "sand.listeners.slack_channels_failed",
            team_id=row.external_id,
            error=str(failure),
        )
        return
    extra["channels"] = channels
    extra["channels_refreshed_at"] = utc_now().timestamp()
    repository = SandListenerConnectionRepository.from_session(session)
    await repository.update(row, update_dict={"extra": extra}, flush=True)


def resolve_slack_channel(
    row: SandListenerConnection, scope: str
) -> dict[str, Any] | None:
    """`{id, name, isMember}` of the channel a listener names, or None."""
    cached = row.extra.get("channels")
    channels: list[Any] = cached if isinstance(cached, list) else []
    wanted = scope.lstrip("#").lower()
    for channel in channels:
        if not isinstance(channel, dict):
            continue
        if channel.get("id") == scope or str(channel.get("name", "")).lower() == wanted:
            return channel
    return None


async def describe_slack_subscription(
    session: AsyncSession, user_id: UUID, scopes: list[str]
) -> dict[str, Any]:
    repository = SandListenerConnectionRepository.from_session(session)
    rows = await repository.list_for_user(user_id, "slack")
    if not rows:
        return {"status": "not-linked", "teams": [], "unresolvedChannels": list(scopes)}
    teams: list[dict[str, Any]] = []
    for row in rows:
        named = [
            scope
            for scope in scopes
            if scope != ANY_SCOPE and not scope.startswith("@")
        ]
        if any(resolve_slack_channel(row, scope) is None for scope in named):
            await refresh_slack_channels(session, row)
        channels: list[dict[str, Any]] = []
        unresolved: list[str] = []
        for scope in named:
            channel = resolve_slack_channel(row, scope)
            if channel is None:
                unresolved.append(scope)
            else:
                channels.append(
                    {
                        "input": scope,
                        "channelId": channel.get("id"),
                        "isBotMember": channel.get("isMember") is True,
                    }
                )
        teams.append(
            {
                "teamId": row.external_id,
                "teamName": row.external_name,
                "channels": channels,
                "unresolvedChannels": unresolved,
            }
        )
    return {
        "status": "ok",
        "teams": teams,
        "unresolvedChannels": [
            scope for team in teams for scope in team["unresolvedChannels"]
        ],
    }


async def describe_github_subscription(
    session: AsyncSession, user_id: UUID, repos: list[str]
) -> dict[str, Any]:
    repository = SandListenerConnectionRepository.from_session(session)
    rows = await repository.list_for_user(user_id, "github")
    if not rows:
        return {
            "status": "not-connected",
            "repos": [{"repo": repo, "isSubscribed": False} for repo in repos],
        }
    known: set[str] = set()
    unknown = False
    for row in rows:
        covered = row.extra.get("repos")
        if isinstance(covered, list):
            known.update(str(name).lower() for name in covered)
        else:
            unknown = True
    entries = []
    for repo in repos:
        subscribed = unknown or repo.lower() in known
        entry: dict[str, Any] = {"repo": repo, "isSubscribed": subscribed}
        if not subscribed:
            entry["detail"] = (
                f"Give Simeon's GitHub App access to {repo} (GitHub → Settings → Applications → Simeon → Repository access)."
            )
        entries.append(entry)
    return {"status": "ok", "repos": entries}


router.include_router(service.router)
