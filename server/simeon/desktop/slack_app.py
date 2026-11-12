"""An agent in Slack through Simeon's own Slack app (12 November 2026).

The founder: the upstream app's Slack connects with Slack's own sign-in,
while an agent's Slack channel asked the person to make a Slack app and paste
its tokens. Now an agent's Channels tab has Connect Slack, which opens Slack's
sign-in for the app Simeon Labs registered (the one routines already use,
`simeon.sand.listeners_connections`), and the agent then talks in that
workspace with no token on the person's side.

- `POST /desktop/api/channels/slack/link`, from an app: a one-time address
  of Slack's sign-in for one agent (`/sand/slack/install?ticket=`). Once
  Slack answers, the agent is listed on the workspace's connection
  (`extra.agents`; the first one answers when no other is named).
- What people say to the app, a direct message or a mention in a channel
  it is in, comes through the Events API (`/sand/ingress/slack/events`):
  `route_event` picks the agent (one named at the start of the message,
  else the one that answered last in that conversation, else the first
  one), puts the message in the person's inbox (kind `channel`, the shape
  the computer's channels runtime reads) and wakes the computer.
- `POST /desktop/api/channels/slack/send`, from the computer: the agent's
  answer, posted by the app under the agent's name (`chat:write.customize`)
  in the thread it belongs to, or a file. The workspace's token never
  leaves this server.
- `POST /desktop/api/channels/slack/disconnect`: the agent stops talking
  there (the workspace stays connected for routines).
- The computer learns which of its agents talk in Slack from its channels
  sync (`hosted_for`, `channel_bots.channels_sync`).

Nothing a person wrote goes to the log, only ids and sizes.
"""

from __future__ import annotations

import base64
import binascii
import html
import re
from typing import Any
from uuid import UUID

import structlog
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from simeon.config import settings
from simeon.models import DesktopSession, SandListenerConnection
from simeon.postgres import AsyncSession, get_db_session
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter
from simeon.sand.listeners_connections import (
    mint_slack_ticket,
    slack_agents,
)
from simeon.sand.listeners_connections import (
    slack_client as listeners_slack_client,
)
from simeon.sand.listeners_repository import SandListenerConnectionRepository
from simeon.sand.listeners_slack import SlackApiError, SlackWebClient
from simeon.sand.notify import publish

from .auth import get_desktop_or_box_session, get_desktop_session
from .chat_repository import DesktopChatAgentRepository, DesktopChatInboxRepository
from .chats import WAITING_MAX

log = structlog.get_logger()

# Mounted under the desktop router (`/desktop`).
router = APIRouter(include_in_schema=False)

PLATFORM = "slack"
#: A message Slack sends twice (its retries) is kept once.
SEEN_TTL_SECONDS = 24 * 60 * 60
#: Who answered last in a conversation, so a reply without a name goes to them.
LAST_TTL_SECONDS = 30 * 24 * 60 * 60
#: Which workspace a conversation is in, for the answer.
CHAT_TTL_SECONDS = 30 * 24 * 60 * 60
NAME_TTL_SECONDS = 24 * 60 * 60
TEXT_MAX = 40_000
FILE_MAX_BYTES = 10 * 1024 * 1024

#: Replaceable in tests (an `httpx.MockTransport` behind it); the routines'
#: own client by default, so one stand-in serves both.
slack_client: SlackWebClient = listeners_slack_client

NOT_REGISTERED = "Slack isn't available yet."


def registered() -> bool:
    return bool(settings.SLACK_CLIENT_ID and settings.SLACK_CLIENT_SECRET)


def _key(*parts: str) -> str:
    return "sand:channels:slack:" + ":".join(parts)


async def _redis_text(redis: Redis, key: str) -> str | None:
    value = await redis.get(key)
    if value is None:
        return None
    return value.decode() if isinstance(value, bytes) else str(value)


async def _connections(
    session: AsyncSession, user_id: UUID
) -> list[SandListenerConnection]:
    repository = SandListenerConnectionRepository.from_session(session)
    return [
        row
        for row in await repository.list_for_user(user_id, PLATFORM)
        if row.access_token
    ]


async def _agent_names(session: AsyncSession, user_id: UUID) -> dict[str, str]:
    """Each agent's name as the person's computer last listed it."""
    names: dict[str, str] = {}
    for row in await DesktopChatAgentRepository.from_session(session).list_by_user(
        user_id
    ):
        name = row.row.get("name") if isinstance(row.row, dict) else None
        if isinstance(name, str) and name.strip():
            names[row.agent_id] = name.strip()
    return names


async def hosted_for(session: AsyncSession, user_id: UUID) -> list[dict[str, str]]:
    """The person's agents that talk in Slack, with the workspace's name,
    for the computer's channels sync."""
    hosted: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in await _connections(session, user_id):
        for agent_id in slack_agents(row):
            if agent_id in seen:
                continue
            seen.add(agent_id)
            hosted.append(
                {
                    "agentId": agent_id,
                    "platform": PLATFORM,
                    "label": row.external_name or "Slack",
                }
            )
    return hosted


async def _set_agents(
    session: AsyncSession, row: SandListenerConnection, agents: list[str]
) -> None:
    repository = SandListenerConnectionRepository.from_session(session)
    await repository.update(
        row, update_dict={"extra": {**(row.extra or {}), "agents": agents}}
    )


# --- what people say to the app ---------------------------------------------------


def heard_text(event: dict[str, Any], bot_user_id: str) -> str:
    """The message as the agent reads it: the app's own mention taken out,
    Slack's escapes undone, each file as a line with its address."""
    given = event.get("text")
    raw: str = given if isinstance(given, str) else ""
    if bot_user_id:
        raw = re.sub(rf"<@{re.escape(bot_user_id)}(?:\|[^>]*)?>", "", raw)
    text = html.unescape(raw).strip()
    lines = [text] if text else []
    for file in event.get("files") or []:
        if not isinstance(file, dict):
            continue
        address = file.get("permalink") or file.get("url_private")
        if isinstance(address, str) and address:
            name = file.get("name")
            lines.append(
                f"[attachment{f' {name}' if isinstance(name, str) and name else ''}: {address}]"
            )
    return "\n".join(lines)[:TEXT_MAX]


def named_agent(text: str, names: dict[str, str], agents: list[str]) -> str | None:
    """The agent the message opens with ("Nora, …", "@Nora …"), the longest
    name winning; none when it opens with no agent's name."""
    best: tuple[int, str] | None = None
    for agent_id in agents:
        name = names.get(agent_id)
        if not name:
            continue
        if re.match(rf"^\s*@?{re.escape(name)}(?![\w'])", text, flags=re.IGNORECASE):
            if best is None or len(name) > best[0]:
                best = (len(name), agent_id)
    return best[1] if best is not None else None


async def _sender_name(redis: Redis, token: str, team_id: str, user: str) -> str:
    key = _key("name", team_id, user)
    cached = await _redis_text(redis, key)
    if cached:
        return cached
    name = user
    try:
        found = await slack_client.user_name(token, user)
        if found:
            name = found
    except SlackApiError:
        pass
    await redis.set(key, name, ex=NAME_TTL_SECONDS)
    return name


async def route_event(
    session: AsyncSession,
    redis: Redis,
    connection: SandListenerConnection,
    team_id: str,
    event: dict[str, Any],
) -> bool:
    """One Events API event for an agent that talks in this workspace: a
    direct message to the app, or a mention of it in a channel. True when it
    went to the person's inbox."""
    if connection.user_id is None or not connection.access_token:
        return False
    agents = slack_agents(connection)
    if not agents:
        return False
    kind = event.get("type")
    direct = kind == "message" and event.get("channel_type") == "im"
    if kind != "app_mention" and not direct:
        return False
    bot_user_id = str((connection.extra or {}).get("bot_user_id") or "")
    user = event.get("user")
    if (
        event.get("bot_id")
        or event.get("subtype") not in (None, "file_share", "thread_broadcast")
        or not isinstance(user, str)
        or not user
        or user == bot_user_id
    ):
        return False
    chat = event.get("channel")
    ts = event.get("ts")
    if not isinstance(chat, str) or not chat or not isinstance(ts, str) or not ts:
        return False
    text = heard_text(event, bot_user_id)
    if not text:
        return False
    # Slack retries a delivery it thinks was lost: kept once.
    if not await redis.set(
        _key("seen", team_id, chat, ts), "1", ex=SEEN_TTL_SECONDS, nx=True
    ):
        return False
    thread_ts = (
        event.get("thread_ts") if isinstance(event.get("thread_ts"), str) else None
    )
    # In a channel the answer goes under the message that asked; in a direct
    # message, in the main conversation unless it was asked in a thread.
    thread = thread_ts or (None if direct else ts)
    user_id = connection.user_id
    names = await _agent_names(session, user_id)
    last_key = _key("last", str(user_id), team_id, chat, thread or "-")
    agent_id = named_agent(text, names, agents)
    if agent_id is None:
        last = await _redis_text(redis, last_key)
        agent_id = last if last in agents else agents[0]
    await redis.set(last_key, agent_id, ex=LAST_TTL_SECONDS)
    await redis.set(_key("chat", str(user_id), chat), team_id, ex=CHAT_TTL_SECONDS)
    try:
        stamp = int(float(ts) * 1000)
    except ValueError:
        stamp = 0
    envelope: dict[str, Any] = {
        "address": {"platform": PLATFORM, "chat": chat},
        "sender": await _sender_name(redis, connection.access_token, team_id, user),
        "text": text,
        "timestampMs": stamp,
        "messageId": f"{chat}:{ts}",
        # Answered through this server (`/desktop/api/channels/slack/send`), not a bot the computer holds.
        "app": True,
        **({"thread": thread} if thread else {}),
    }
    inbox = DesktopChatInboxRepository.from_session(session)
    if await inbox.count_waiting(user_id) >= WAITING_MAX:
        log.info("desktop.channels.slack_dropped", team_id=team_id, reason="inbox full")
        return False
    added = await inbox.add(
        user_id,
        agent_id=agent_id,
        nonce=f"slack-app:{team_id}:{chat}:{ts}"[:200],
        kind="channel",
        message=envelope,
    )
    if added:
        await publish(redis, user_id, "chat-inbox")
    log.info(
        "desktop.channels.slack_heard",
        team_id=team_id,
        agent_id=agent_id,
        direct=direct,
        chars=len(text),
        queued=added,
    )
    return added


# --- the app's Connect Slack ------------------------------------------------------


class LinkBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    agentId: str = Field(min_length=1, max_length=200)


@router.post("/api/channels/slack/state", name="desktop:channels_slack_state")
async def channels_slack_state(
    body: LinkBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Slack's row in an agent's profile (12 November 2026): whether Slack
    can be connected here, and whether this agent talks in a workspace and
    which. Read from this server, so the profile never wakes the computer."""
    workspace: str | None = None
    for row in await _connections(session, desktop_session.user_id):
        if body.agentId in slack_agents(row):
            workspace = row.external_name or "Slack"
            break
    return JSONResponse(
        {
            "code": 0,
            "data": {
                "available": registered(),
                "connected": workspace is not None,
                "workspace": workspace,
            },
        }
    )


@router.post("/api/channels/slack/link", name="desktop:channels_slack_link")
async def channels_slack_link(
    body: LinkBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    if not registered():
        log.warning("desktop.channels.slack_link_refused", reason="app not registered")
        return JSONResponse({"code": 1, "message": NOT_REGISTERED}, status_code=503)
    ticket = await mint_slack_ticket(redis, desktop_session.user_id, body.agentId)
    url = settings.generate_external_url(f"/sand/slack/install?ticket={ticket}")
    log.info(
        "desktop.channels.slack_link",
        user_id=str(desktop_session.user_id),
        agent_id=body.agentId,
    )
    return JSONResponse({"code": 0, "data": {"url": url}})


# --- the computer's answers -------------------------------------------------------


class SentFile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(min_length=1, max_length=255)
    #: The file's bytes in base64.
    data: str = Field(min_length=1)


class SendBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    agentId: str = Field(min_length=1, max_length=200)
    chat: str = Field(min_length=1, max_length=64)
    thread: str | None = Field(default=None, max_length=64)
    text: str | None = Field(default=None, max_length=TEXT_MAX)
    file: SentFile | None = None
    caption: str | None = Field(default=None, max_length=TEXT_MAX)


def _refused(message: str, status: int) -> JSONResponse:
    return JSONResponse({"code": 1, "message": message}, status_code=status)


@router.post("/api/channels/slack/send", name="desktop:channels_slack_send")
async def channels_slack_send(
    body: SendBody,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    user_id = desktop_session.user_id
    if not body.text and body.file is None:
        return _refused("Nothing to send.", 400)
    data: bytes | None = None
    if body.file is not None:
        try:
            data = base64.b64decode(body.file.data, validate=True)
        except (binascii.Error, ValueError):
            return _refused("The file isn't valid base64.", 400)
        if len(data) > FILE_MAX_BYTES:
            return _refused("The file is too big for Slack here (10 MB at most).", 413)
    rows = [
        row
        for row in await _connections(session, user_id)
        if body.agentId in slack_agents(row)
    ]
    if not rows:
        return _refused("Slack isn't connected for this agent.", 404)
    # The workspace the conversation was heard in first; else each in turn.
    team = await _redis_text(redis, _key("chat", str(user_id), body.chat))
    rows.sort(key=lambda row: 0 if row.external_id == team else 1)
    name = (await _agent_names(session, user_id)).get(body.agentId)
    last_error = "channel_not_found"
    for row in rows:
        token = row.access_token or ""
        try:
            if data is not None and body.file is not None:
                await slack_client.upload_file(
                    token,
                    channel=body.chat,
                    name=body.file.name,
                    data=data,
                    comment=body.caption or None,
                    thread_ts=body.thread,
                )
            else:
                await slack_client.post_message(
                    token,
                    channel=body.chat,
                    text=body.text or "",
                    thread_ts=body.thread,
                    username=name,
                )
        except SlackApiError as failure:
            last_error = failure.error
            if (
                failure.error in ("channel_not_found", "not_in_channel")
                and row is not rows[-1]
            ):
                continue
            log.warning(
                "desktop.channels.slack_send_failed",
                team_id=row.external_id,
                agent_id=body.agentId,
                error=failure.error,
            )
            return _refused(f"Slack answered: {failure.error}.", 502)
        await redis.set(
            _key("chat", str(user_id), body.chat), row.external_id, ex=CHAT_TTL_SECONDS
        )
        log.info(
            "desktop.channels.slack_sent",
            team_id=row.external_id,
            agent_id=body.agentId,
            kind="file" if data is not None else "text",
            size=len(data) if data is not None else len(body.text or ""),
            thread=body.thread is not None,
        )
        return JSONResponse({"code": 0, "data": {"ok": True}})
    return _refused(f"Slack answered: {last_error}.", 502)


class DisconnectBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    agentId: str = Field(min_length=1, max_length=200)


@router.post("/api/channels/slack/disconnect", name="desktop:channels_slack_disconnect")
async def channels_slack_disconnect(
    body: DisconnectBody,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    removed = 0
    for row in await _connections(session, desktop_session.user_id):
        agents = slack_agents(row)
        if body.agentId in agents:
            await _set_agents(
                session, row, [agent for agent in agents if agent != body.agentId]
            )
            removed += 1
    log.info(
        "desktop.channels.slack_disconnected",
        user_id=str(desktop_session.user_id),
        agent_id=body.agentId,
        workspaces=removed,
    )
    return JSONResponse({"code": 0, "data": {"removed": removed}})
