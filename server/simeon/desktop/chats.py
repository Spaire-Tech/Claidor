"""The copy of the agents and their chats on Simeon Labs' server (26 October
2026, the founder: the computer is a worker, not where the chats live).

The apps read the agents and their chats from the person's computer, so with
the computer asleep, being updated or out of reach they had nothing to show.
The computer now sends both here as they change (`host/extensions/chat-copy/`),
and the apps read them here while it is away:

- `POST /desktop/api/chats/copy`, from the computer with its own credential:
  the whole list (`agents`, which replaces the one held), the lines written
  or changed (`lines`), the lines taken out (`removed`) and the chats emptied
  (`cleared`).
- `GET /desktop/api/chats/state`, from the computer: each chat's newest line
  held, so a computer that starts sends again only the chats that moved.
- `GET /desktop/api/chats/agents`, from the apps: the list.
- `GET /desktop/api/chats/lines?agentId=…&limit=…`, from the apps: a chat's
  newest lines, oldest first, and whether older ones are held (`hasOlder`).

Kept: each agent's row without its inline picture and without what it was
doing at that moment, and its chat's newest `LINES_KEPT` lines as the
computer wrote them (a line still being written, as finished). A line larger
than `LINE_MAX_BYTES` is not kept; the computer still has it. An agent no
longer in the list takes its chat with it. Nothing of a chat goes to the
log. Delete Account removes all of it (`account_repository.py`).

Messages written while the computer is away land here too (the inbox):

- `POST /desktop/api/chats/send`, from the apps: a message for an agent,
  with what `sendPrompt` would have taken. It is kept, and the computer is
  woken to take it (`simeon.sand.notify.publish`, topic `chat-inbox`).
- `GET /desktop/api/chats/inbox`, from the computer: the messages waiting,
  oldest first.
- `POST /desktop/api/chats/inbox/ack`, from the computer: the ones it handed
  to their agents, which go.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import timedelta
from typing import Any
from uuid import UUID

import structlog
from fastapi import Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from simeon.kit.utils import utc_now
from simeon.models import DesktopSession, User
from simeon.postgres import AsyncSession, get_db_session
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter
from simeon.sand.notify import publish

from .auth import get_desktop_or_box_session, get_desktop_session
from .chat_repository import (
    DesktopChatAgentRepository,
    DesktopChatInboxRepository,
    DesktopChatLineRepository,
    IncomingLine,
)

log = structlog.get_logger()

# Mounted under the desktop router (`/desktop`), like the other features.
router = APIRouter(include_in_schema=False)

#: A chat's newest lines held; older ones stay on the computer.
LINES_KEPT = 500
#: A line larger than this is not kept (a tool's long output, an inline file).
LINE_MAX_BYTES = 256 * 1024
#: An agent's row larger than this is not kept.
ROW_MAX_BYTES = 64 * 1024
#: At most this many agents in a list, and lines in one copy.
AGENTS_MAX = 1000
LINES_PER_COPY = 1000
#: At most this many lines in one read.
READ_LIMIT_MAX = 500
AGENT_ID_MAX = 200
ENTRY_ID_MAX = 300

#: What a row says only of the moment it was sent: a list read later would
#: show the agent as still working.
MOMENT_FIELDS = frozenset(
    {"isRunningTurn", "isRunning", "isComposingMessage", "currentActivity"}
)

#: A waiting message larger than this stays on the device that wrote it.
MESSAGE_MAX_BYTES = 512 * 1024
#: At most this many messages wait for one person's computer.
WAITING_MAX = 200
#: At most this many waiting messages in one read, and ids in one ack.
INBOX_READ_MAX = 50
#: A message no computer took in this long goes (an agent deleted meanwhile).
INBOX_KEPT = timedelta(days=7)
NONCE_MAX = 200


class ChatLine(BaseModel):
    model_config = ConfigDict(extra="ignore")
    agentId: str = Field(min_length=1, max_length=AGENT_ID_MAX)
    entry: dict[str, Any]


class ChatRemoved(BaseModel):
    model_config = ConfigDict(extra="ignore")
    agentId: str = Field(min_length=1, max_length=AGENT_ID_MAX)
    id: str = Field(min_length=1, max_length=ENTRY_ID_MAX)


class ChatCopyBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    #: The whole list, which replaces the one held; absent leaves it alone.
    agents: list[dict[str, Any]] | None = Field(default=None, max_length=AGENTS_MAX)
    lines: list[ChatLine] = Field(default_factory=list, max_length=LINES_PER_COPY)
    removed: list[ChatRemoved] = Field(default_factory=list, max_length=LINES_PER_COPY)
    cleared: list[str] = Field(default_factory=list, max_length=AGENTS_MAX)


def _size(value: Any) -> int:
    return len(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode())


def _without_nul(value: Any) -> Any:
    """The same value with no NUL character in it: PostgreSQL's JSONB
    refuses one, and a tool's output can carry it."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, list):
        return [_without_nul(item) for item in value]
    if isinstance(value, dict):
        return {_without_nul(key): _without_nul(item) for key, item in value.items()}
    return value


def kept_row(row: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """An agent's row as kept, with its id; None for one that can't be."""
    agent_id = row.get("id")
    if not isinstance(agent_id, str) or not 0 < len(agent_id) <= AGENT_ID_MAX:
        return None
    kept = {key: value for key, value in row.items() if key not in MOMENT_FIELDS}
    if kept.get("avatarDataUrl") is not None:
        kept["avatarDataUrl"] = None
    kept = _without_nul(kept)
    if _size(kept) > ROW_MAX_BYTES:
        return None
    return agent_id, kept


def kept_line(entry: dict[str, Any]) -> IncomingLine | None:
    """A chat's line as kept; None for one that can't be (no id or kind, or
    too large)."""
    entry_id = entry.get("id")
    if not isinstance(entry_id, str) or not 0 < len(entry_id) <= ENTRY_ID_MAX:
        return None
    if not isinstance(entry.get("kind"), str):
        return None
    kept = _without_nul(
        {key: value for key, value in entry.items() if key != "isStreaming"}
    )
    if _size(kept) > LINE_MAX_BYTES:
        return None
    stamp = entry.get("timestampMs")
    at_ms = (
        int(stamp)
        if isinstance(stamp, int | float)
        and not isinstance(stamp, bool)
        and math.isfinite(stamp)
        and 0 < stamp < 1e15
        else None
    )
    return IncomingLine(entry_id=entry_id, at_ms=at_ms, entry=kept)


async def copy_chats(
    session: AsyncSession, user: User, body: ChatCopyBody
) -> dict[str, int]:
    """One copy from the computer, applied in its order: the list, the
    chats emptied, the lines taken out, then the lines written."""
    agents = DesktopChatAgentRepository.from_session(session)
    lines = DesktopChatLineRepository.from_session(session)
    counts = {
        "agents": 0,
        "gone": 0,
        "lines": 0,
        "removed": 0,
        "cleared": 0,
        "skipped": 0,
    }
    if body.agents is not None:
        rows: dict[str, dict[str, Any]] = {}
        for row in body.agents:
            kept = kept_row(row)
            if kept is None:
                counts["skipped"] += 1
                continue
            rows[kept[0]] = kept[1]
        gone = await agents.replace_all(user.id, rows)
        # An agent no longer in the list takes its chat with it.
        await lines.clear(user.id, gone)
        counts["agents"] = len(rows)
        counts["gone"] = len(gone)
    cleared = {
        agent_id for agent_id in body.cleared if 0 < len(agent_id) <= AGENT_ID_MAX
    }
    await lines.clear(user.id, cleared)
    counts["cleared"] = len(cleared)
    removed: dict[str, list[str]] = defaultdict(list)
    for taken in body.removed:
        removed[taken.agentId].append(taken.id)
    for agent_id, entry_ids in removed.items():
        await lines.remove(user.id, agent_id, entry_ids)
        counts["removed"] += len(entry_ids)
    written: dict[str, list[IncomingLine]] = defaultdict(list)
    for sent in body.lines:
        line = kept_line(sent.entry)
        if line is None:
            counts["skipped"] += 1
            continue
        written[sent.agentId].append(line)
    for agent_id, incoming in written.items():
        await lines.upsert(user.id, agent_id, incoming)
        await lines.prune(user.id, agent_id, LINES_KEPT)
        counts["lines"] += len(incoming)
    return counts


@router.post("/api/chats/copy", name="desktop:chats_copy")
async def chats_copy(
    body: ChatCopyBody,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    counts = await copy_chats(session, desktop_session.user, body)
    log.info("desktop.chats.copy", user_id=str(desktop_session.user_id), **counts)
    return JSONResponse({"code": 0, "data": counts})


@router.get("/api/chats/state", name="desktop:chats_state")
async def chats_state(
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    newest = await DesktopChatLineRepository.from_session(session).newest_ids(
        desktop_session.user_id
    )
    held = await DesktopChatAgentRepository.from_session(session).list_by_user(
        desktop_session.user_id
    )
    return JSONResponse({"code": 0, "data": {"newest": newest, "agents": len(held)}})


@router.get("/api/chats/agents", name="desktop:chats_agents")
async def chats_agents(
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    held = await DesktopChatAgentRepository.from_session(session).list_by_user(
        desktop_session.user_id
    )
    return JSONResponse({"code": 0, "data": {"agents": [agent.row for agent in held]}})


@router.get("/api/chats/lines", name="desktop:chats_lines")
async def chats_lines(
    agent_id: str = Query(alias="agentId", min_length=1, max_length=AGENT_ID_MAX),
    limit: int = Query(default=300, ge=1, le=READ_LIMIT_MAX),
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    rows, has_older = await DesktopChatLineRepository.from_session(session).newest(
        desktop_session.user_id, agent_id, limit
    )
    return JSONResponse(
        {
            "code": 0,
            "data": {"entries": [row.entry for row in rows], "hasOlder": has_older},
        }
    )


class InboxSendBody(BaseModel):
    """A message for an agent, in `sendPrompt`'s own names (the apps send
    what they would have sent the computer, `LiveBackend.sendArguments`),
    so the computer hands it on exactly as written."""

    model_config = ConfigDict(extra="ignore")
    agentId: str = Field(min_length=1, max_length=AGENT_ID_MAX)
    clientNonce: str = Field(min_length=1, max_length=NONCE_MAX)
    prompt: str
    richText: str | None = None
    replyToId: str | None = Field(default=None, min_length=1, max_length=ENTRY_ID_MAX)
    isFork: bool = False
    composedAtMs: float | None = None
    attachmentPaths: list[str] = Field(default_factory=list)


class InboxAckBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ids: list[str] = Field(default_factory=list, max_length=INBOX_READ_MAX)


def _refuse(message: str, status: int) -> JSONResponse:
    """A refusal in the app's envelope (`SimeonAPI.data` reads `message`):
    the app keeps the message on the device, as before."""
    return JSONResponse({"code": status, "message": message}, status_code=status)


def waiting_message(body: InboxSendBody) -> dict[str, Any] | JSONResponse:
    """What is kept of a message, exactly as written (the computer knows a
    message sent both ways by its words as well as its nonce); or the
    refusal, for one that can't wait here."""
    if body.attachmentPaths:
        return _refuse("A message with files waits for your computer.", 422)
    if not body.prompt.strip():
        return _refuse("There is nothing to send.", 422)
    message: dict[str, Any] = {"prompt": body.prompt}
    if body.richText:
        message["richText"] = body.richText
    if body.replyToId is not None:
        message["replyToId"] = body.replyToId
    if body.isFork:
        message["isFork"] = True
    stamp = body.composedAtMs
    if stamp is not None and math.isfinite(stamp) and 0 < stamp < 1e15:
        message["composedAtMs"] = stamp
    # PostgreSQL's JSONB refuses a NUL, and taking it out would change the
    # words: such a message stays on the device.
    if any(
        "\x00" in text for text in (body.agentId, body.clientNonce, *_texts(message))
    ):
        return _refuse("This message can't wait on the server.", 422)
    if _size(message) > MESSAGE_MAX_BYTES:
        return _refuse("This message is too long to wait on the server.", 413)
    return message


def _texts(message: dict[str, Any]) -> list[str]:
    return [value for value in message.values() if isinstance(value, str)]


@router.post("/api/chats/send", name="desktop:chats_send")
async def chats_send(
    body: InboxSendBody,
    desktop_session: DesktopSession = Depends(get_desktop_session),
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> JSONResponse:
    message = waiting_message(body)
    if isinstance(message, JSONResponse):
        return message
    user_id = desktop_session.user_id
    inbox = DesktopChatInboxRepository.from_session(session)
    waiting = await inbox.count_waiting(user_id)
    if waiting >= WAITING_MAX:
        return _refuse("Too many messages are waiting for your computer.", 429)
    added = await inbox.add(
        user_id,
        agent_id=body.agentId,
        nonce=body.clientNonce,
        kind="prompt",
        message=message,
    )
    # The computer, awake, takes it now; asleep, it is woken and takes it
    # as it starts. The row lands when this request commits: a computer
    # woken first looks again a moment later (`chat-inbox.ts`).
    await publish(redis, user_id, "chat-inbox")
    log.info(
        "desktop.chats.inbox.queued",
        user_id=str(user_id),
        added=added,
        waiting=waiting + (1 if added else 0),
    )
    return JSONResponse({"code": 0, "data": {"queued": True}})


@router.get("/api/chats/inbox", name="desktop:chats_inbox")
async def chats_inbox(
    limit: int = Query(default=INBOX_READ_MAX, ge=1, le=INBOX_READ_MAX),
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    inbox = DesktopChatInboxRepository.from_session(session)
    expired = await inbox.remove_older_than(
        desktop_session.user_id, utc_now() - INBOX_KEPT
    )
    if expired:
        log.info(
            "desktop.chats.inbox.expired",
            user_id=str(desktop_session.user_id),
            removed=expired,
        )
    rows = await inbox.waiting(desktop_session.user_id, limit)
    messages = [
        {
            "id": str(row.id),
            "agentId": row.agent_id,
            "nonce": row.nonce,
            "kind": row.kind,
            "message": row.message,
            "atMs": int(row.created_at.timestamp() * 1000),
        }
        for row in rows
    ]
    return JSONResponse({"code": 0, "data": {"messages": messages}})


@router.post("/api/chats/inbox/ack", name="desktop:chats_inbox_ack")
async def chats_inbox_ack(
    body: InboxAckBody,
    desktop_session: DesktopSession = Depends(get_desktop_or_box_session),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    ids: list[UUID] = []
    for raw in body.ids:
        try:
            ids.append(UUID(raw))
        except ValueError:
            continue
    removed = await DesktopChatInboxRepository.from_session(session).remove(
        desktop_session.user_id, ids
    )
    log.info(
        "desktop.chats.inbox.delivered",
        user_id=str(desktop_session.user_id),
        removed=removed,
    )
    return JSONResponse({"code": 0, "data": {"removed": removed}})
