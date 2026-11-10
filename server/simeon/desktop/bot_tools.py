"""What a bot can do for its person beyond talking on the network (10
November 2026, the founder, after another network's bot listed 171 tools:
"they have a lot more tools than us", then "ok go for all").

The MCP server (`mcp.py`) offers these beside `list_team`, `send_message`,
`check_inbox` and `set_status`. Each acts for the person who signed the bot
in, on their own agents only, never a colleague's:

- Agents: `create_agent`, `agent_status` (what each agent is doing now),
  `read_chat` (an agent's recent chat).
- Messages: `message_status` (did the computer take a message sent with
  `send_message`, is the agent on it, did it answer).
- Waiting cards: `list_waiting` (the questions and approvals the agents wait
  on), `answer_question`, `answer_approval` (approve once, or deny).
- Routines: `list_routines`, `create_routine`, `run_routine`, `pause_routine`.
- Files: `list_files`, `read_file`.
- Memory: `search_memory`, `read_memory`.
- Usage: `usage` (what is left of the plan).

What only the person may answer stays in the Simeon app: a purchase, a
1Password login, a password or a key, a form. `list_waiting` names those and
says so, and nothing here answers them.

Reading is from the server's own copy (the chats and agents the computer
sends, `chats.py`; the memory; the plan) and never wakes the computer. Doing
goes to the person's computer as the apps do (`POST /api/<method>` on its
gateway, `host/gateway-protocol.ts`), and only the commands named in
`COMMANDS`; a computer asleep is woken and the bot is told to call again in a
minute, so no request waits on a start.
"""

from __future__ import annotations

import base64
import re
import secrets
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import unquote, urlsplit
from uuid import UUID

import httpx
import structlog

from simeon.models import SandBox, User
from simeon.postgres import AsyncSession
from simeon.redis import Redis
from simeon.sand.box_hosts import GATEWAY_PORT
from simeon.sand.box_repository import SandBoxRepository
from simeon.sand.box_service import broker, dial_headers
from simeon.worker import enqueue_job

from .chat_repository import (
    DesktopChatAgentRepository,
    DesktopChatInboxRepository,
    DesktopChatLineRepository,
)
from .network import ms, spoken
from .network_repository import DesktopNetworkMessageRepository
from .service import desktop

log = structlog.get_logger()


class ToolRefusal(Exception):
    """A tool that could not do what was asked, said to the agent in words."""


# MARK: The person's computer

#: The gateway commands a bot may have the computer run, and nothing else:
#: each the call an app's own button makes (SimeonCore's `Store`).
COMMANDS = frozenset(
    {
        "listAgents",
        "createAgent",
        "respondToWidget",
        "resolveAutoReviewApproval",
        "listAllAutomations",
        "getAgentAutomations",
        "createAgentAutomation",
        "runAgentAutomationNow",
        "setAgentAutomationEnabled",
        "readAttachmentText",
        "readAttachmentImage",
    }
)

SLIM_AVATARS_HEADER = "x-sand-slim-avatars"
#: How long a command may take on the computer.
COMMAND_TIMEOUT_S = 20.0
#: A sleeping computer is asked to start at most this often per person.
WAKE_THROTTLE_SECONDS = 30
ASLEEP = (
    "Your Simeon computer was asleep: it is starting now. Call this again in "
    "about a minute."
)
NO_COMPUTER = (
    "Your Simeon computer isn't set up yet: send one of your agents a "
    "message first (send_message), then try again."
)
UNREACHABLE = "Your Simeon computer didn't answer: try again in a minute."


class ComputerRefused(ToolRefusal):
    """The computer answered the command with an error of its own."""


#: `(box, method, args)` → the command's answer; replaced in tests.
Send = Callable[[SandBox, str, dict[str, Any]], Awaitable[Any]]


async def gateway_send(box: SandBox, method: str, args: dict[str, Any]) -> Any:
    url = broker.internal_url(box, GATEWAY_PORT)
    if url is None:
        raise httpx.ConnectError("the box has no address")
    async with httpx.AsyncClient(timeout=COMMAND_TIMEOUT_S) as client:
        response = await client.post(
            f"{url}/api/{method}",
            headers={
                **dial_headers(box),
                "authorization": f"Bearer {box.gateway_token}",
                # Agents without their pictures inline (`gateway-wire.ts`).
                SLIM_AVATARS_HEADER: "1",
            },
            json=args,
        )
    if response.status_code in (502, 503, 504):
        # A proxy in front of a computer still starting.
        raise httpx.ConnectError(f"the box answered {response.status_code}")
    try:
        body = response.json()
    except ValueError:
        body = None
    if response.status_code >= 400:
        error = body.get("error") if isinstance(body, dict) else None
        raise ComputerRefused(
            str(error)[:300]
            if error
            else f"Your computer refused ({response.status_code})."
        )
    return body


_send: Send = gateway_send


def set_send_for_tests(send: Send | None) -> None:
    global _send
    _send = send or gateway_send


async def _ask_wake(redis: Redis | None, user_id: UUID) -> None:
    """The person's computer started (`sand.box.wake`), once per
    WAKE_THROTTLE_SECONDS however often a bot asks."""
    first: bool | None = True
    if redis is not None:
        try:
            first = await redis.set(
                f"sand:box:wake-asked:{user_id}",
                "1",
                ex=WAKE_THROTTLE_SECONDS,
                nx=True,
            )
        except Exception:
            first = True
    if first:
        enqueue_job("sand.box.wake", user_id=str(user_id))


async def computer(
    session: AsyncSession,
    redis: Redis | None,
    user_id: UUID,
    method: str,
    args: dict[str, Any],
) -> Any:
    """One command on the person's computer, as an app's button sends it."""
    if method not in COMMANDS:
        raise ValueError(f"not a bot command: {method}")
    box = await SandBoxRepository.from_session(session).get_by_user(user_id)
    if box is None or not box.gateway_token:
        raise ToolRefusal(NO_COMPUTER)
    if box.state != "running":
        await _ask_wake(redis, user_id)
        log.info("mcp.computer.asleep", user_id=str(user_id), method=method)
        raise ToolRefusal(ASLEEP)
    try:
        answer = await _send(box, method, args)
    except ComputerRefused:
        raise
    except httpx.HTTPError as error:
        # Frozen by its host since the row last heard of it: woken as well.
        await _ask_wake(redis, user_id)
        log.warning(
            "mcp.computer.unreachable",
            user_id=str(user_id),
            method=method,
            error=str(error)[:200],
        )
        raise ToolRefusal(UNREACHABLE) from error
    log.info("mcp.computer.command", user_id=str(user_id), method=method)
    return answer


# MARK: Reading the chats


#: How far back each chat is read for its waiting cards and its files.
SCAN_LINES = 80
CHAT_DEFAULT = 20
CHAT_MAX = 100
#: A text file is read up to this much (the computer's own preview cap).
TEXT_MAX_CHARS = 100_000
#: A picture larger than this is not handed over.
IMAGE_MAX_BYTES = 5 << 20
#: A routine runs at most this often.
ROUTINE_NAME_MAX = 80
PROMPT_MAX = 4000
MEMORY_HITS_MAX = 20
SNIPPET_CHARS = 240

#: Cards only the person answers, in the Simeon app.
APP_ONLY = {
    "secret-request": "a password or a key",
    "credential-request": "a 1Password login",
    "purchase": "a purchase",
    "user-form": "a form",
    "store-entry": "a Credentials Store entry",
    "flight-passengers": "the travellers' details",
    "onepassword-connect": "connecting 1Password",
}

CRON = re.compile(r"^\s*(\S+\s+){4}\S+\s*$")


def _text(value: object, limit: int = 2000) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text[:limit] if text else None


def _same(a: str, b: str) -> bool:
    return a.strip().casefold() == b.strip().casefold()


def _message(entry: dict[str, Any]) -> dict[str, Any] | None:
    if entry.get("kind") != "send-message":
        return None
    message = entry.get("message")
    return message if isinstance(message, dict) else None


def _options(question: dict[str, Any]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for option in question.get("options") or []:
        if isinstance(option, str):
            found.append({"label": option})
        elif isinstance(option, dict) and _text(option.get("label")):
            shown: dict[str, Any] = {"label": _text(option.get("label"))}
            if _text(option.get("description")):
                shown["description"] = _text(option.get("description"), 300)
            if _text(option.get("value")):
                shown["value"] = _text(option.get("value"))
            found.append(shown)
    return found


def _questions(widget: dict[str, Any]) -> list[dict[str, Any]]:
    """Every question of a card, its own first (one, for a card that asks
    one), as SimeonCore's `QuestionCard` reads them."""
    several = [
        q
        for q in widget.get("questions") or []
        if isinstance(q, dict) and _text(q.get("prompt")) and _options(q)
    ]
    if len(several) > 1:
        return several
    return [widget]


def _question_open(entry: dict[str, Any]) -> bool:
    return (
        not _text(entry.get("respondedValue"))
        and entry.get("widgetDismissed") is not True
        and entry.get("widgetSkipped") is not True
    )


def _file_of(entry: dict[str, Any]) -> tuple[str, str, bool] | None:
    """A file a line carries: (path or URL, name, the person's own)."""
    if entry.get("kind") == "user-attachment":
        path = _text(entry.get("file_path")) or _text(entry.get("filePath"))
        if path is None:
            return None
        name = _text(entry.get("file_name")) or path.rsplit("/", 1)[-1]
        return path, name, True
    message = _message(entry)
    if message is None or message.get("type") != "attachment":
        return None
    url = _text(message.get("url"))
    if url is None or url.lower().startswith(("http:", "https:")):
        return None
    name = _text(message.get("file_name")) or url.rsplit("/", 1)[-1]
    return url, name, False


def _path_of(url: str) -> str:
    """What the computer's file reads take: a path (SimeonCore's `readFile`)."""
    if url.startswith("file://"):
        return unquote(urlsplit(url).path)
    return url


def _image_type(name: str) -> str | None:
    lowered = name.lower()
    for suffix, kind in (
        (".png", "image/png"),
        (".jpg", "image/jpeg"),
        (".jpeg", "image/jpeg"),
        (".gif", "image/gif"),
        (".webp", "image/webp"),
    ):
        if lowered.endswith(suffix):
            return kind
    return None


def _line(entry: dict[str, Any], name: str) -> dict[str, Any] | None:
    """A chat line for `read_chat`: what was said, or the card or file it is."""
    said = spoken(entry, name, {})
    at = entry.get("timestampMs")
    at_ms = at if isinstance(at, (int, float)) else None
    file = _file_of(entry)
    if file is not None:
        return {
            "id": entry.get("id"),
            "from": "you" if file[2] else name,
            "file": file[1],
            "at": at_ms,
        }
    if said is not None:
        return said
    message = _message(entry)
    if message is None:
        return None
    kind = message.get("type")
    if kind == "widget" and isinstance(message.get("widget"), dict):
        widget = message["widget"]
        shown: dict[str, Any] = {
            "id": entry.get("id"),
            "from": name,
            "card": "question",
            "text": _text(widget.get("prompt")) or "",
            "at": at_ms,
        }
        if _text(entry.get("respondedValue")):
            shown["answered"] = _text(entry.get("respondedValue"))
        elif _question_open(entry):
            shown["waiting"] = True
        return shown
    if kind == "auto-review-approval" and isinstance(message.get("approval"), dict):
        approval = message["approval"]
        return {
            "id": entry.get("id"),
            "from": name,
            "card": "approval",
            "text": _text(approval.get("summary")) or "",
            "status": approval.get("status") or "pending",
            "at": at_ms,
        }
    if isinstance(kind, str) and kind in APP_ONLY:
        return {
            "id": entry.get("id"),
            "from": name,
            "card": kind,
            "text": f"Asks for {APP_ONLY[kind]} (answered in the Simeon app).",
            "at": at_ms,
        }
    return None


# MARK: The tools


@dataclass
class Answer:
    """A tool's answer: what the bot reads as JSON, and more content beside
    it (a picture)."""

    found: dict[str, Any]
    content: list[dict[str, Any]] = field(default_factory=list)


def _agent_schema(
    description: str = "The agent's name (or id), from agent_status.",
) -> dict[str, Any]:
    return {"type": "string", "description": description}


TOOLS: list[dict[str, Any]] = [
    {
        "name": "agent_status",
        "title": "What your agents are doing",
        "description": (
            "Your own Simeon agents and what each is doing right now: working "
            "(and on what), waiting on you (and why), or idle, with its last "
            "message. Give agent for one; leave it out for all."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"agent": _agent_schema()},
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "read_chat",
        "title": "Read an agent's chat",
        "description": (
            "The newest lines of one of your agents' chats, oldest first: what "
            "you and it said, the files it sent and the cards it showed."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": _agent_schema(),
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": CHAT_MAX,
                    "description": f"At most this many lines (default {CHAT_DEFAULT}).",
                },
            },
            "required": ["agent"],
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "create_agent",
        "title": "Make a new agent",
        "description": (
            "A new Simeon agent for your user, always on, with its own cloud "
            "computer: its name, its role, and what it should do. It starts at "
            "once and introduces itself in its chat. Only when your user asked "
            "for a new agent."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Its first name, like Nora."},
                "role": {
                    "type": "string",
                    "description": "Its job in a few words, like Travel planner.",
                },
                "instructions": {
                    "type": "string",
                    "description": "What it is for and how to work: its first message's brief.",
                },
            },
            "required": ["name"],
        },
        "annotations": {"readOnlyHint": False, "openWorldHint": False},
    },
    {
        "name": "message_status",
        "title": "Where a message is",
        "description": (
            "What became of a message you sent with send_message (its id from "
            "that answer): waiting for the computer, taken by the agent, being "
            "worked on, answered, or read by the session it went to."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "The message's id."},
            },
            "required": ["id"],
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "list_waiting",
        "title": "What your agents wait on",
        "description": (
            "The questions and approvals your agents are waiting on you for, "
            "newest first, with the card's id to answer it (answer_question, "
            "answer_approval). A purchase, a login, a password or a form is "
            "listed too, but only your user answers those, in the Simeon app."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"agent": _agent_schema("Only this agent's.")},
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "answer_question",
        "title": "Answer a question card",
        "description": (
            "Answer a question one of your agents asked with a card (from "
            "list_waiting): an option's label, or your own words when the card "
            "allows them. For a card that asks several questions, give answers, "
            "one per question in order. Answer only what your user told you or "
            "clearly wants."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": _agent_schema(),
                "card": {"type": "string", "description": "The card's id."},
                "answer": {"type": "string", "description": "The answer."},
                "answers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "One answer per question, for a card that asks several.",
                },
            },
            "required": ["agent", "card"],
        },
        "annotations": {"readOnlyHint": False, "openWorldHint": False},
    },
    {
        "name": "answer_approval",
        "title": "Approve or deny",
        "description": (
            "Approve once, or deny, what one of your agents asked to do (an "
            "approval card from list_waiting: a command, a change). Only when "
            "your user said so."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": _agent_schema(),
                "card": {"type": "string", "description": "The card's id."},
                "decision": {"type": "string", "enum": ["approve", "deny"]},
            },
            "required": ["agent", "card", "decision"],
        },
        "annotations": {"readOnlyHint": False, "openWorldHint": False},
    },
    {
        "name": "list_routines",
        "title": "Your agents' routines",
        "description": (
            "The routines your agents run on a schedule: name, what it does, "
            "when it runs, whether it is paused, its last and next run."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"agent": _agent_schema("Only this agent's.")},
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "create_routine",
        "title": "Make a routine",
        "description": (
            "A routine for one of your agents: what it should do (prompt) and "
            "when, as a cron schedule in your user's time (like '0 9 * * 1' for "
            "Mondays at 9:00)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": _agent_schema(),
                "name": {"type": "string", "description": "A short name."},
                "prompt": {
                    "type": "string",
                    "description": "What the agent does each time, in full.",
                },
                "schedule": {
                    "type": "string",
                    "description": "Five-field cron: minute hour day month weekday.",
                },
            },
            "required": ["agent", "name", "prompt", "schedule"],
        },
        "annotations": {"readOnlyHint": False, "openWorldHint": False},
    },
    {
        "name": "run_routine",
        "title": "Run a routine now",
        "description": "Run one of your agents' routines now, outside its schedule.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": _agent_schema(),
                "routine": {
                    "type": "string",
                    "description": "The routine's id or name, from list_routines.",
                },
            },
            "required": ["agent", "routine"],
        },
        "annotations": {"readOnlyHint": False, "openWorldHint": True},
    },
    {
        "name": "pause_routine",
        "title": "Pause or resume a routine",
        "description": (
            "Pause one of your agents' routines (paused true, the default), or "
            "resume it (paused false)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": _agent_schema(),
                "routine": {
                    "type": "string",
                    "description": "The routine's id or name, from list_routines.",
                },
                "paused": {"type": "boolean"},
            },
            "required": ["agent", "routine"],
        },
        "annotations": {"readOnlyHint": False, "openWorldHint": False},
    },
    {
        "name": "list_files",
        "title": "Files in the chats",
        "description": (
            "The files your agents sent in their chats, and the ones your user "
            "attached, newest first: name, agent and when."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {"agent": _agent_schema("Only this agent's.")},
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "read_file",
        "title": "Read a file",
        "description": (
            "A file from list_files: a text file's words (up to 100,000 "
            "characters) or a picture. Other files are opened in the Simeon app."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": _agent_schema(),
                "file": {
                    "type": "string",
                    "description": "The file's name or path, from list_files.",
                },
            },
            "required": ["agent", "file"],
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "search_memory",
        "title": "Search your agents' memory",
        "description": (
            "What your agents remember about your user (facts, a profile, a "
            "note a day) matching some words, with where each was found."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "The words to look for."},
            },
            "required": ["text"],
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "read_memory",
        "title": "Read a memory file",
        "description": (
            "One memory file whole (MEMORY.md, USER.md, memory/2026-11-10.md); "
            "without a name, the list of them."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The file, from search_memory.",
                },
            },
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "usage",
        "title": "What is left of the plan",
        "description": (
            "Your user's Simeon plan: its name, the credits used and left this "
            "period, when it renews, and where to change it."
        ),
        "inputSchema": {"type": "object", "properties": {}},
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
]

NAMES = tuple(tool["name"] for tool in TOOLS)


class BotTools:
    """The tools, for one request's person."""

    def __init__(self, session: AsyncSession, redis: Redis | None, user: User) -> None:
        self.session = session
        self.redis = redis
        self.user = user
        self._rows: list[dict[str, Any]] | None = None

    def handlers(self) -> dict[str, Callable[[dict[str, Any]], Awaitable[Any]]]:
        return {name: getattr(self, name) for name in NAMES}

    async def _computer(self, method: str, args: dict[str, Any]) -> Any:
        return await computer(self.session, self.redis, self.user.id, method, args)

    # MARK: Agents

    async def _agents(self) -> list[dict[str, Any]]:
        if self._rows is None:
            held = await DesktopChatAgentRepository.from_session(
                self.session
            ).list_by_user(self.user.id)
            self._rows = [
                agent.row
                for agent in held
                if isinstance(agent.row, dict)
                and agent.row.get("id")
                and str(agent.row.get("name") or "").strip()
            ]
        return self._rows

    async def _agent(self, arguments: dict[str, Any]) -> dict[str, Any]:
        text = _text(arguments.get("agent"), 200)
        rows = await self._agents()
        if not rows:
            raise ToolRefusal("Your user has no Simeon agents yet.")
        if text is None:
            raise ToolRefusal(f"Say which agent: {self._names(rows)}.")
        # An address (`ana/Nora`) names the agent after the slash.
        wanted = text.rsplit("/", 1)[-1]
        found = [
            r
            for r in rows
            if str(r.get("id")) == wanted or _same(str(r.get("name")), wanted)
        ]
        if len(found) == 1:
            return found[0]
        if found:
            raise ToolRefusal(
                f"More than one agent is called {wanted}: use its id "
                f"({', '.join(str(r['id']) for r in found)})."
            )
        raise ToolRefusal(
            f"No agent of your user's is called {wanted}. Theirs: {self._names(rows)}."
        )

    @staticmethod
    def _names(rows: list[dict[str, Any]]) -> str:
        return ", ".join(str(r.get("name")).strip() for r in rows[:30])

    async def _awake(self) -> bool:
        box = await SandBoxRepository.from_session(self.session).get_by_user(
            self.user.id
        )
        return box is not None and box.state == "running"

    async def _live(self) -> dict[str, dict[str, Any]] | None:
        """The agents as the computer has them this moment (what each is
        doing is not kept in the server's copy: it would go stale), when it
        is awake; None when it sleeps, and nothing runs. Never woken for it."""
        if not await self._awake():
            return None
        try:
            answer = await self._computer("listAgents", {})
        except ToolRefusal:
            return None
        rows = answer if isinstance(answer, list) else (answer or {}).get("agents")
        return {
            str(r["id"]): r
            for r in rows or []
            if isinstance(r, dict) and r.get("id") is not None
        }

    @staticmethod
    def _status_of(
        row: dict[str, Any], live: dict[str, dict[str, Any]] | None
    ) -> dict[str, Any]:
        now = (live or {}).get(str(row["id"]))
        if now is not None:
            row = {**row, **now}
        activity = row.get("currentActivity") if now is not None else None
        awaiting = row.get("awaitingUserResponse")
        running = now is not None and (
            now.get("isRunning") is True or now.get("isRunningTurn") is True
        )
        entry: dict[str, Any] = {
            "id": str(row["id"]),
            "name": str(row.get("name")).strip(),
        }
        if _text(row.get("title")):
            entry["role"] = _text(row.get("title"), 120)
        if row.get("isGroup"):
            entry["group"] = True
        if awaiting not in (None, False):
            entry["status"] = "waiting on you"
            reason = awaiting.get("reason") if isinstance(awaiting, dict) else None
            if _text(reason):
                entry["waitingFor"] = _text(reason, 300)
        elif running:
            entry["status"] = "working"
            if isinstance(activity, dict):
                doing = _text(activity.get("label")) or _text(activity.get("detail"))
                if doing:
                    entry["doing"] = doing[:300]
        else:
            entry["status"] = "idle"
        if _text(row.get("lastMessagePreview")):
            entry["lastMessage"] = _text(row.get("lastMessagePreview"), 300)
        last = row.get("lastActivityAt")
        if isinstance(last, (int, float)) and last > 0:
            entry["lastActivityAt"] = int(last)
        return entry

    async def agent_status(self, arguments: dict[str, Any]) -> dict[str, Any]:
        one = await self._agent(arguments) if _text(arguments.get("agent")) else None
        live = await self._live()
        computer_is = "awake" if live is not None else "asleep"
        if one is not None:
            return {"agent": self._status_of(one, live), "computer": computer_is}
        return {
            "agents": [self._status_of(row, live) for row in await self._agents()],
            "computer": computer_is,
        }

    async def read_chat(self, arguments: dict[str, Any]) -> dict[str, Any]:
        row = await self._agent(arguments)
        limit = arguments.get("limit")
        count = (
            limit if isinstance(limit, int) and 1 <= limit <= CHAT_MAX else CHAT_DEFAULT
        )
        name = str(row.get("name")).strip()
        lines, older = await DesktopChatLineRepository.from_session(
            self.session
        ).newest(self.user.id, str(row["id"]), count * 3)
        shown = [
            line
            for line in (
                _line(held.entry, name)
                for held in lines
                if isinstance(held.entry, dict)
            )
            if line is not None
        ][-count:]
        return {
            "agent": name,
            "lines": shown,
            **({"older": True} if older or len(shown) == count else {}),
        }

    async def create_agent(self, arguments: dict[str, Any]) -> dict[str, Any]:
        name = _text(arguments.get("name"), 40)
        if name is None:
            raise ToolRefusal("Give the new agent a name.")
        args: dict[str, Any] = {
            "name": name,
            "description": _text(arguments.get("instructions"), PROMPT_MAX) or "",
            "isKickstartRequested": True,
            "origin": "user",
            "clientNonce": f"mcp-{secrets.token_hex(12)}",
        }
        role = _text(arguments.get("role"), 80)
        if role:
            args["title"] = role
        answer = await self._computer("createAgent", args)
        agent = answer.get("agent") if isinstance(answer, dict) else None
        if not isinstance(agent, dict) or not agent.get("id"):
            raise ToolRefusal("The agent wasn't made: try again.")
        self._rows = None
        return {
            "agent": {
                "id": str(agent["id"]),
                "name": str(agent.get("name") or name),
                **({"role": role} if role else {}),
            },
            "next": (
                "It is starting and will introduce itself in its chat. Message it "
                "with send_message by its name."
            ),
        }

    # MARK: Messages

    async def message_status(self, arguments: dict[str, Any]) -> dict[str, Any]:
        raw = _text(arguments.get("id"), 200)
        try:
            message_id = UUID((raw or "").split(":", 1)[0])
        except ValueError:
            raise ToolRefusal("Give the id send_message answered with.") from None
        message = await DesktopNetworkMessageRepository.from_session(
            self.session
        ).sent_by(self.user.id, message_id)
        if message is None:
            raise ToolRefusal("No message of yours has this id (they are kept a week).")
        found: dict[str, Any] = {
            "id": str(message.id),
            "to": message.to_address,
            "sentAt": ms(message.created_at),
        }
        if message.to_agent_id is None:
            found["status"] = "read" if message.read_at is not None else "not read yet"
            if message.read_at is not None:
                found["readAt"] = ms(message.read_at)
            return found
        line = None
        if message.nonce is not None:
            line = await DesktopChatLineRepository.from_session(
                self.session
            ).with_nonce(message.to_user_id, message.to_agent_id, message.nonce)
        if message.answered_ms is not None:
            found["status"] = "answered"
            found["answeredAt"] = message.answered_ms
            found["next"] = "Its answer is in your inbox (check_inbox)."
        elif line is None:
            waiting = (
                message.nonce is not None
                and await DesktopChatInboxRepository.from_session(
                    self.session
                ).is_waiting(message.to_user_id, message.nonce)
            )
            found["status"] = (
                "waiting for the computer" if waiting else "not taken by the computer"
            )
            if waiting:
                found["note"] = "The agent's computer is starting to take it."
        else:
            found["takenAt"] = line.at_ms
            found["status"] = "taken"
            if message.to_user_id == self.user.id:
                rows = await self._agents()
                row = next(
                    (r for r in rows if str(r.get("id")) == message.to_agent_id), None
                )
                if row is not None:
                    status = self._status_of(row, await self._live())
                    if status["status"] == "working":
                        found["status"] = "being worked on"
                        if "doing" in status:
                            found["doing"] = status["doing"]
        return found

    # MARK: Waiting cards

    async def _waiting(self, row: dict[str, Any]) -> list[dict[str, Any]]:
        name = str(row.get("name")).strip()
        lines, _ = await DesktopChatLineRepository.from_session(self.session).newest(
            self.user.id, str(row["id"]), SCAN_LINES
        )
        found: list[dict[str, Any]] = []
        for line in reversed(lines):
            entry = line.entry
            if not isinstance(entry, dict):
                continue
            message = _message(entry)
            if message is None:
                continue
            kind = message.get("type")
            at = entry.get("timestampMs")
            base = {
                "agent": name,
                "card": str(entry.get("id") or line.entry_id),
                "at": int(at) if isinstance(at, (int, float)) else line.at_ms,
            }
            if kind == "widget" and isinstance(message.get("widget"), dict):
                if not _question_open(entry):
                    continue
                widget = message["widget"]
                questions = _questions(widget)
                found.append(
                    {
                        **base,
                        "kind": "question",
                        "questions": [
                            {
                                "prompt": _text(q.get("prompt")) or "",
                                "options": _options(q),
                                **({"ownAnswer": True} if q.get("allowCustom") else {}),
                                **(
                                    {"severalPicks": True}
                                    if q.get("multiSelect")
                                    else {}
                                ),
                            }
                            for q in questions
                        ],
                        "answerWith": "answer_question",
                    }
                )
            elif kind == "auto-review-approval" and isinstance(
                message.get("approval"), dict
            ):
                approval = message["approval"]
                if (approval.get("status") or "pending") != "pending":
                    continue
                found.append(
                    {
                        **base,
                        "kind": "approval",
                        "summary": _text(approval.get("summary")) or "",
                        **(
                            {"reason": _text(approval.get("reason"))}
                            if _text(approval.get("reason"))
                            else {}
                        ),
                        **(
                            {"command": _text(approval.get("command"), 1000)}
                            if _text(approval.get("command"))
                            else {}
                        ),
                        "answerWith": "answer_approval",
                    }
                )
            elif kind == "secret-request":
                if (
                    entry.get("secretProvided") is True
                    or entry.get("widgetDismissed") is True
                ):
                    continue
                found.append(
                    {**base, "kind": APP_ONLY[kind], "answerIn": "the Simeon app"}
                )
            elif kind == "credential-request":
                if entry.get("credentialState") not in (None, "open"):
                    continue
                found.append(
                    {**base, "kind": APP_ONLY[kind], "answerIn": "the Simeon app"}
                )
        awaiting = row.get("awaitingUserResponse")
        if not found and awaiting not in (None, False):
            reason = awaiting.get("reason") if isinstance(awaiting, dict) else None
            found.append(
                {
                    "agent": name,
                    "kind": "waiting on your user",
                    **({"reason": _text(reason, 300)} if _text(reason) else {}),
                    "answerIn": "the Simeon app",
                }
            )
        return found

    async def list_waiting(self, arguments: dict[str, Any]) -> dict[str, Any]:
        rows = (
            [await self._agent(arguments)]
            if _text(arguments.get("agent"))
            else await self._agents()
        )
        found: list[dict[str, Any]] = []
        for row in rows:
            found += await self._waiting(row)
        found.sort(key=lambda card: -int(card.get("at") or 0))
        answer: dict[str, Any] = {"waiting": found}
        if not found:
            answer["note"] = "Nothing is waiting on your user."
        return answer

    async def _open_card(
        self, row: dict[str, Any], card: str, kind: str
    ) -> dict[str, Any]:
        for waiting in await self._waiting(row):
            if waiting.get("card") == card:
                if waiting.get("kind") != kind:
                    if waiting.get("answerIn"):
                        raise ToolRefusal(
                            f"This card asks for {waiting['kind']}: only your user "
                            "answers it, in the Simeon app."
                        )
                    raise ToolRefusal(
                        f"This card is {waiting.get('kind')}: answer it with "
                        f"{waiting.get('answerWith')}."
                    )
                return waiting
        raise ToolRefusal(
            "This card isn't waiting any more (answered, closed or too old): "
            "list_waiting shows what is."
        )

    async def answer_question(self, arguments: dict[str, Any]) -> dict[str, Any]:
        row = await self._agent(arguments)
        card = _text(arguments.get("card"), 300)
        if card is None:
            raise ToolRefusal("Give the card's id, from list_waiting.")
        waiting = await self._open_card(row, card, "question")
        questions: list[dict[str, Any]] = waiting["questions"]
        given = arguments.get("answers")
        if isinstance(given, list):
            answers = [a if isinstance(a, str) else None for a in given]
        else:
            answers = [
                arguments.get("answer")
                if isinstance(arguments.get("answer"), str)
                else None
            ]
        if not any(a and a.strip() for a in answers):
            raise ToolRefusal(
                "Give the answer (answers, for a card that asks several)."
            )
        picked: list[str | None] = []
        for index, question in enumerate(questions):
            text = (answers[index] or "").strip() if index < len(answers) else ""
            if not text:
                picked.append(None)
                continue
            picked.append(self._pick(question, text))
        if len(questions) == 1:
            value = picked[0]
        else:
            value = "\n".join(
                self._line_of(q["prompt"], a) for q, a in zip(questions, picked)
            )
        if not value:
            raise ToolRefusal("Give the answer.")
        await self._computer(
            "respondToWidget",
            {"agentId": str(row["id"]), "entryId": card, "value": value},
        )
        return {"answered": True, "agent": waiting["agent"], "value": value}

    @staticmethod
    def _pick(question: dict[str, Any], text: str) -> str:
        """The value a card takes for an answer: each option picked by its
        label (one per line for several), else the bot's own words when the
        card allows them."""
        options: list[dict[str, Any]] = question.get("options") or []

        def value_of(words: str) -> str | None:
            for option in options:
                if _same(option["label"], words) or _same(
                    str(option.get("value") or ""), words
                ):
                    return str(option.get("value") or option["label"])
            return None

        if question.get("severalPicks"):
            parts = [p.strip() for p in re.split(r"[\n,]", text) if p.strip()]
            values = [value_of(p) for p in parts]
            if parts and all(v is not None for v in values):
                return "\n".join(v for v in values if v is not None)
        else:
            one = value_of(text)
            if one is not None:
                return one
        if question.get("ownAnswer") or not options:
            return text
        labels = ", ".join(o["label"] for o in options)
        raise ToolRefusal(f"Pick one of the options: {labels}.")

    @staticmethod
    def _line_of(prompt: str, answer: str | None) -> str:
        """One question's line in a several-question reply (SimeonCore's
        `QuestionCard.reply`): the question, then its answer."""
        words = (
            ", ".join(p.strip() for p in answer.split("\n") if p.strip())
            if answer
            else "(skipped)"
        )
        head = prompt.strip()
        joint = " " if head and head[-1] in "?:？：" else ": "
        return head + joint + words

    async def answer_approval(self, arguments: dict[str, Any]) -> dict[str, Any]:
        row = await self._agent(arguments)
        card = _text(arguments.get("card"), 300)
        decision = arguments.get("decision")
        if card is None:
            raise ToolRefusal("Give the card's id, from list_waiting.")
        if decision not in ("approve", "deny"):
            raise ToolRefusal("Say approve or deny.")
        await self._open_card(row, card, "approval")
        lines, _ = await DesktopChatLineRepository.from_session(self.session).newest(
            self.user.id, str(row["id"]), SCAN_LINES
        )
        approval: dict[str, Any] = {}
        for line in lines:
            entry = line.entry
            message = _message(entry) if isinstance(entry, dict) else None
            if message is not None and str(entry.get("id") or line.entry_id) == card:
                approval = message.get("approval") or {}
        request_id = _text(approval.get("requestId"), 300)
        if request_id is None:
            raise ToolRefusal("This approval can only be answered in the Simeon app.")
        resolution = "approved" if decision == "approve" else "denied"
        await self._computer(
            "resolveAutoReviewApproval",
            {
                "requestId": request_id,
                "resolution": resolution,
                "entryId": card,
                "agentId": str(row["id"]),
            },
        )
        return {"agent": str(row.get("name")).strip(), "decision": resolution}

    # MARK: Routines

    @staticmethod
    def _routine(record: dict[str, Any], names: dict[str, str]) -> dict[str, Any]:
        raw = record.get("trigger")
        trigger: dict[str, Any] = raw if isinstance(raw, dict) else {}
        runs = [r for r in record.get("runs") or [] if isinstance(r, dict)]
        shown: dict[str, Any] = {
            "id": str(record.get("id")),
            "name": _text(record.get("name"), 200) or "",
            "prompt": _text(record.get("prompt"), PROMPT_MAX) or "",
            "paused": record.get("isEnabled") is False,
        }
        agent_id = record.get("agentId") or record.get("sandAgentId")
        if agent_id is not None:
            shown["agent"] = names.get(str(agent_id), str(agent_id))
        when = _text(record.get("triggerDescription")) or _text(trigger.get("schedule"))
        if when:
            shown["when"] = when
        if trigger.get("type") and trigger.get("type") != "cron":
            shown["trigger"] = trigger.get("type")
        for key in ("lastRunAt", "nextRunAt"):
            if isinstance(record.get(key), (int, float)):
                shown[key] = int(record[key])
        if runs:
            last = runs[0]
            shown["lastRun"] = {
                k: last[k]
                for k in ("status", "at", "finishedAt", "detail")
                if k in last
            }
        return shown

    async def list_routines(self, arguments: dict[str, Any]) -> dict[str, Any]:
        rows = await self._agents()
        names = {str(r["id"]): str(r.get("name")).strip() for r in rows}
        if _text(arguments.get("agent")):
            row = await self._agent(arguments)
            records = await self._computer(
                "getAgentAutomations", {"id": str(row["id"])}
            )
            found = [
                {**self._routine(r, names), "agent": names[str(row["id"])]}
                for r in records or []
                if isinstance(r, dict)
            ]
        else:
            records = await self._computer("listAllAutomations", {})
            found = [
                self._routine(r, names) for r in records or [] if isinstance(r, dict)
            ]
        answer: dict[str, Any] = {"routines": found}
        if not found:
            answer["note"] = "No routines yet: create_routine makes one."
        return answer

    async def _routine_of(
        self, row: dict[str, Any], arguments: dict[str, Any]
    ) -> dict[str, Any]:
        wanted = _text(arguments.get("routine"), 200)
        if wanted is None:
            raise ToolRefusal("Say which routine, from list_routines.")
        records = await self._computer("getAgentAutomations", {"id": str(row["id"])})
        records = [r for r in records or [] if isinstance(r, dict)]
        found = [
            r
            for r in records
            if str(r.get("id")) == wanted or _same(str(r.get("name") or ""), wanted)
        ]
        if len(found) == 1:
            return found[0]
        name = str(row.get("name")).strip()
        if found:
            raise ToolRefusal(
                f"{name} has more than one routine called {wanted}: use its id."
            )
        listed = ", ".join(str(r.get("name")) for r in records) or "none"
        raise ToolRefusal(
            f"{name} has no routine called {wanted}. Its routines: {listed}."
        )

    async def create_routine(self, arguments: dict[str, Any]) -> dict[str, Any]:
        row = await self._agent(arguments)
        name = _text(arguments.get("name"), ROUTINE_NAME_MAX)
        prompt = _text(arguments.get("prompt"), PROMPT_MAX)
        schedule = _text(arguments.get("schedule"), 100)
        if name is None or prompt is None:
            raise ToolRefusal("Give the routine a name and say what it does (prompt).")
        if schedule is None or not CRON.match(schedule):
            raise ToolRefusal(
                "Give the schedule as five-field cron, like '0 9 * * 1' (Mondays at 9:00)."
            )
        before = {
            str(r.get("id"))
            for r in await self._computer("getAgentAutomations", {"id": str(row["id"])})
            or []
            if isinstance(r, dict)
        }
        records = await self._computer(
            "createAgentAutomation",
            {
                "id": str(row["id"]),
                "spec": {
                    "name": name,
                    "prompt": prompt,
                    "trigger": {"type": "cron", "schedule": " ".join(schedule.split())},
                    "isEnabled": True,
                },
            },
        )
        made = [
            r
            for r in records or []
            if isinstance(r, dict) and str(r.get("id")) not in before
        ]
        if not made:
            raise ToolRefusal(
                f"The routine wasn't made ({row.get('name')} may have the most it can keep)."
            )
        names = {str(row["id"]): str(row.get("name")).strip()}
        return {
            "routine": {**self._routine(made[0], names), "agent": names[str(row["id"])]}
        }

    async def run_routine(self, arguments: dict[str, Any]) -> dict[str, Any]:
        row = await self._agent(arguments)
        routine = await self._routine_of(row, arguments)
        await self._computer(
            "runAgentAutomationNow",
            {"id": str(row["id"]), "automationId": str(routine["id"])},
        )
        return {
            "started": True,
            "routine": _text(routine.get("name")) or str(routine["id"]),
            "agent": str(row.get("name")).strip(),
            "next": "It runs in the agent's chat: read_chat or agent_status to follow it.",
        }

    async def pause_routine(self, arguments: dict[str, Any]) -> dict[str, Any]:
        row = await self._agent(arguments)
        routine = await self._routine_of(row, arguments)
        paused = arguments.get("paused") is not False
        await self._computer(
            "setAgentAutomationEnabled",
            {
                "id": str(row["id"]),
                "automationId": str(routine["id"]),
                "isEnabled": not paused,
            },
        )
        return {
            "routine": _text(routine.get("name")) or str(routine["id"]),
            "agent": str(row.get("name")).strip(),
            "paused": paused,
        }

    # MARK: Files

    async def _files(self, row: dict[str, Any]) -> list[dict[str, Any]]:
        name = str(row.get("name")).strip()
        lines, _ = await DesktopChatLineRepository.from_session(self.session).newest(
            self.user.id, str(row["id"]), SCAN_LINES * 2
        )
        found: list[dict[str, Any]] = []
        for line in reversed(lines):
            if not isinstance(line.entry, dict):
                continue
            file = _file_of(line.entry)
            if file is None:
                continue
            at = line.entry.get("timestampMs")
            found.append(
                {
                    "name": file[1],
                    "path": _path_of(file[0]),
                    "agent": name,
                    "from": "you" if file[2] else name,
                    "at": int(at) if isinstance(at, (int, float)) else line.at_ms,
                }
            )
        return found

    async def list_files(self, arguments: dict[str, Any]) -> dict[str, Any]:
        rows = (
            [await self._agent(arguments)]
            if _text(arguments.get("agent"))
            else await self._agents()
        )
        found: list[dict[str, Any]] = []
        for row in rows:
            found += await self._files(row)
        found.sort(key=lambda f: -int(f.get("at") or 0))
        answer: dict[str, Any] = {"files": found[:100]}
        if not found:
            answer["note"] = "No files in your agents' recent chats."
        return answer

    async def read_file(self, arguments: dict[str, Any]) -> Answer:
        row = await self._agent(arguments)
        wanted = _text(arguments.get("file"), 1000)
        if wanted is None:
            raise ToolRefusal("Say which file, from list_files.")
        files = await self._files(row)
        file = next(
            (f for f in files if f["path"] == wanted or _same(f["name"], wanted)), None
        )
        if file is None:
            raise ToolRefusal(
                f"No file called {wanted} in {row.get('name')}'s recent chat: list_files shows them."
            )
        shown = {"name": file["name"], "agent": file["agent"]}
        image = _image_type(file["name"])
        if image is not None:
            answer = await self._computer("readAttachmentImage", {"path": file["path"]})
            data_url = answer.get("dataUrl") if isinstance(answer, dict) else None
            if not isinstance(data_url, str) or "," not in data_url:
                raise ToolRefusal("This picture couldn't be read from the computer.")
            head, data = data_url.split(",", 1)
            if len(data) * 3 // 4 > IMAGE_MAX_BYTES:
                raise ToolRefusal(
                    "This picture is too large to hand over: open it in the Simeon app."
                )
            try:
                base64.b64decode(data, validate=True)
            except ValueError:
                raise ToolRefusal(
                    "This picture couldn't be read from the computer."
                ) from None
            kind = head.removeprefix("data:").split(";", 1)[0] or image
            return Answer(
                {**shown, "kind": "picture"},
                [{"type": "image", "data": data, "mimeType": kind}],
            )
        answer = await self._computer(
            "readAttachmentText", {"path": file["path"], "agentId": str(row["id"])}
        )
        if not isinstance(answer, dict):
            raise ToolRefusal("This file couldn't be read from the computer.")
        if answer.get("kind") != "text" or not isinstance(answer.get("text"), str):
            size = answer.get("bytes")
            return Answer(
                {
                    **shown,
                    "kind": "binary",
                    **({"bytes": size} if isinstance(size, int) else {}),
                    "note": "It isn't text: open it in the Simeon app.",
                }
            )
        text: str = answer["text"]
        return Answer(
            {
                **shown,
                "kind": "text",
                "text": text[:TEXT_MAX_CHARS],
                **(
                    {"truncated": True}
                    if answer.get("truncated") or len(text) > TEXT_MAX_CHARS
                    else {}
                ),
            }
        )

    # MARK: Memory

    async def search_memory(self, arguments: dict[str, Any]) -> dict[str, Any]:
        text = _text(arguments.get("text"), 200)
        if text is None:
            raise ToolRefusal("Say what to look for.")
        words = [w.casefold() for w in text.split() if w.strip()]
        hits: list[dict[str, Any]] = []
        for file in await desktop.list_memory_files(self.session, self.user):
            content = file.content or ""
            folded = content.casefold()
            if not all(w in folded or w in file.name.casefold() for w in words):
                continue
            at = folded.find(words[0]) if words else -1
            start = max(0, at - SNIPPET_CHARS // 3) if at >= 0 else 0
            snippet = " ".join(content[start : start + SNIPPET_CHARS].split())
            hits.append({"name": file.name, "snippet": snippet})
        hits.sort(key=lambda h: h["name"], reverse=True)
        answer: dict[str, Any] = {"found": hits[:MEMORY_HITS_MAX]}
        if not hits:
            answer["note"] = "Nothing in your agents' memory matches."
        return answer

    async def read_memory(self, arguments: dict[str, Any]) -> dict[str, Any]:
        files = await desktop.list_memory_files(self.session, self.user)
        name = _text(arguments.get("name"), 300)
        if name is None:
            return {
                "files": [
                    {"name": f.name, "chars": len(f.content or "")} for f in files
                ]
            }
        file = next((f for f in files if f.name == name or _same(f.name, name)), None)
        if file is None:
            listed = ", ".join(f.name for f in files[-20:]) or "none yet"
            raise ToolRefusal(f"No memory file called {name}. There are: {listed}.")
        content = file.content or ""
        return {
            "name": file.name,
            "text": content[:TEXT_MAX_CHARS],
            **({"truncated": True} if len(content) > TEXT_MAX_CHARS else {}),
        }

    # MARK: Usage

    async def usage(self, arguments: dict[str, Any]) -> dict[str, Any]:
        quota = await desktop.quota(self.session, self.user)
        keys = (
            "planName",
            "subscriptionStatus",
            "creditsLimit",
            "creditsUsed",
            "creditsRemaining",
            "periodStart",
            "periodEnd",
            "trialEndsAt",
            "extraCredits",
            "paymentFailed",
            "upgradeUrl",
        )
        return {key: quota[key] for key in keys if quota.get(key) is not None}
