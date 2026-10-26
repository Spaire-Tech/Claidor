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
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from typing import Any

import structlog
from fastapi import Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from simeon.models import DesktopSession, User
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .auth import get_desktop_or_box_session, get_desktop_session
from .chat_repository import (
    DesktopChatAgentRepository,
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
