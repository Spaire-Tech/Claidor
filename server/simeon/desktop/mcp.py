"""Simeon as an MCP server (10 November 2026, the founder, with another
app's "Add a bot" as the reference: "i want it to talk to other agents like
dots, muse etc").

One address, `https://api.simeonlabs.com/mcp`, that a person gives to any bot
that can add an MCP server (ChatGPT's, Meta's, Claude…). The bot then
talks to the person's Simeon agents, as the person:

- `list_agents`: the agents and group chats, from the server's copy
  (`chats.py`), so a sleeping computer is not woken to answer.
- `send_message`: a message for one of them. It lands in the inbox like a
  message written in the apps while the computer is away, and the computer
  is woken to take it. The words start with the bot's name, so the agent and
  the person see who wrote them.
- `read_messages`: the chat's newest messages, and with `wait_seconds` the
  agent's answer as it comes.

The bot signs in with the server's own OAuth 2.1 (`simeon.oauth2`): it finds
it from this endpoint's 401 (`WWW-Authenticate: Bearer resource_metadata=…`)
and `/.well-known/oauth-protected-resource/mcp`, registers itself, and sends
the person to the consent page on app.simeonlabs.com. Its token carries the
`agents` scope and nothing else of the account is reachable through it.

Streamable HTTP, stateless: each POST is one JSON-RPC message (or a batch)
and gets a JSON answer; a notification gets 202. There is no stream to open
(GET answers 405). Nothing of a chat goes to the log, only which tool ran.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any
from uuid import uuid4

import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse, Response

from simeon.auth.scope import Scope
from simeon.config import settings
from simeon.models import OAuth2Token, User
from simeon.oauth2.service.oauth2_token import oauth2_token as oauth2_token_service
from simeon.postgres import AsyncSession, get_db_session
from simeon.redis import Redis, get_redis
from simeon.routing import APIRouter
from simeon.sand.notify import publish

from .chat_repository import (
    DesktopChatAgentRepository,
    DesktopChatInboxRepository,
    DesktopChatLineRepository,
)
from .chats import MESSAGE_MAX_BYTES, READ_LIMIT_MAX, WAITING_MAX

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

PATH = "/mcp"
#: The versions this server speaks; an unknown one is answered with the newest.
PROTOCOL_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
#: How long `read_messages` waits for an answer at most, and how often it looks.
WAIT_MAX_SECONDS = 25
WAIT_STEP_SECONDS = 2.0
READ_DEFAULT = 20
#: A bot's name as written before its message, at most this long.
CLIENT_NAME_MAX = 60

INSTRUCTIONS = (
    "Simeon is the person's team of AI agents, each with a cloud computer of "
    "its own. Use list_agents to see who is on the team, send_message to ask "
    "one of them for something (they act on it: research, browse, write, "
    "book), and read_messages with wait_seconds to get the answer. An agent "
    "can take a few minutes on a long task: read again later rather than "
    "sending the same message twice."
)

TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_agents",
        "title": "List the agents",
        "description": (
            "The person's Simeon agents and group chats: each one's id, name "
            "and role. Use the id or the name with send_message and read_messages."
        ),
        "inputSchema": {"type": "object", "properties": {}},
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
    {
        "name": "send_message",
        "title": "Message an agent",
        "description": (
            "Send a message to one of the person's Simeon agents (or a group "
            "chat), on the person's behalf. The agent works on it on its own "
            "cloud computer and answers in its chat. Returns at once; use "
            "read_messages with `since` set to the returned `sentAt` and "
            "`wait_seconds` to get the answer."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": {
                    "type": "string",
                    "description": "The agent's id or name, from list_agents.",
                },
                "message": {
                    "type": "string",
                    "description": "What to tell or ask the agent, in full.",
                },
            },
            "required": ["agent", "message"],
        },
        "annotations": {"readOnlyHint": False, "openWorldHint": True},
    },
    {
        "name": "read_messages",
        "title": "Read an agent's chat",
        "description": (
            "The newest messages in an agent's chat, oldest first: the "
            "person's and the bots' messages (`from: \"you\"`) and the agent's "
            "answers. With `since`, only the ones after it; with "
            "`wait_seconds`, waits up to that long for the agent to answer."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent": {
                    "type": "string",
                    "description": "The agent's id or name, from list_agents.",
                },
                "since": {
                    "type": "number",
                    "description": "Only messages after this time (milliseconds, as `sentAt` and `at` give it).",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "description": f"At most this many messages (default {READ_DEFAULT}).",
                },
                "wait_seconds": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": WAIT_MAX_SECONDS,
                    "description": "Wait up to this long for a new answer from the agent (default 0).",
                },
            },
            "required": ["agent"],
        },
        "annotations": {"readOnlyHint": True, "openWorldHint": False},
    },
]


# MARK: Where the sign-in is found


def resource_url() -> str:
    return f"{settings.BASE_URL.rstrip('/')}{PATH}"


def resource_metadata_url() -> str:
    return f"{settings.BASE_URL.rstrip('/')}/.well-known/oauth-protected-resource{PATH}"


def protected_resource_metadata() -> dict[str, Any]:
    """RFC 9728: what this endpoint is and which server signs its bots in."""
    from simeon.oauth2.constants import ISSUER

    return {
        "resource": resource_url(),
        "authorization_servers": [ISSUER],
        "scopes_supported": [Scope.agents.value],
        "bearer_methods_supported": ["header"],
        "resource_name": "Simeon",
    }


@router.get("/.well-known/oauth-protected-resource", name="mcp:resource_metadata")
@router.get(
    "/.well-known/oauth-protected-resource/mcp", name="mcp:resource_metadata_mcp"
)
async def resource_metadata() -> JSONResponse:
    return JSONResponse(protected_resource_metadata())


def _unauthorized(error: str | None = None) -> Response:
    """The 401 a bot starts its sign-in from (MCP's authorization spec)."""
    parts = [
        f'resource_metadata="{resource_metadata_url()}"',
        f'scope="{Scope.agents.value}"',
    ]
    if error is not None:
        parts.insert(0, f'error="{error}"')
    return JSONResponse(
        {"error": error or "unauthorized"},
        status_code=401,
        headers={"WWW-Authenticate": "Bearer " + ", ".join(parts)},
    )


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


async def _signed_in(request: Request, session: AsyncSession) -> OAuth2Token | Response:
    """The bot's token, when it is a person's, live and allowed to talk to
    their agents; the 401 otherwise."""
    value = _bearer(request)
    if value is None:
        return _unauthorized()
    token = await oauth2_token_service.get_by_access_token(session, value)
    if token is None or token.is_expired():
        return _unauthorized("invalid_token")
    if not isinstance(token.sub, User):
        return _unauthorized("invalid_token")
    if Scope.agents not in token.scopes:
        return JSONResponse(
            {"error": "insufficient_scope"},
            status_code=403,
            headers={
                "WWW-Authenticate": (
                    f'Bearer error="insufficient_scope", scope="{Scope.agents.value}", '
                    f'resource_metadata="{resource_metadata_url()}"'
                )
            },
        )
    return token


# MARK: The endpoint


@router.get(PATH, name="mcp:stream")
async def mcp_stream() -> Response:
    """No stream to open: every answer comes back on its own POST."""
    return Response(status_code=405, headers={"Allow": "POST"})


@router.post(PATH, name="mcp:post")
async def mcp_post(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    redis: Redis = Depends(get_redis),
) -> Response:
    signed_in = await _signed_in(request, session)
    if isinstance(signed_in, Response):
        return signed_in
    token = signed_in
    try:
        body = json.loads(await request.body())
    except ValueError:
        return JSONResponse(_error(None, -32700, "Parse error"), status_code=400)

    caller = Caller(token, session, redis)
    if isinstance(body, list):
        answers = [a for a in [await caller.answer(m) for m in body] if a is not None]
        return JSONResponse(answers) if answers else Response(status_code=202)
    answer = await caller.answer(body)
    return JSONResponse(answer) if answer is not None else Response(status_code=202)


def _error(id_: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}}


def _result(id_: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": id_, "result": result}


class ToolRefusal(Exception):
    """A tool that could not do what was asked, said to the bot in words."""


class Caller:
    """One request's bot: the person it acts for and what it may call."""

    def __init__(self, token: OAuth2Token, session: AsyncSession, redis: Redis) -> None:
        self.token = token
        self.user_id = token.sub.id
        self.session = session
        self.redis = redis

    @property
    def client_name(self) -> str:
        name = ""
        client = self.token.client
        if client is not None:
            name = str(client.client_metadata.get("client_name") or "").strip()
        return (name or "A bot")[:CLIENT_NAME_MAX]

    async def answer(self, message: Any) -> dict[str, Any] | None:
        if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
            return _error(None, -32600, "Invalid Request")
        method = message.get("method")
        id_ = message.get("id")
        if "id" not in message:
            # A notification (`notifications/initialized`…): nothing to say.
            return None
        if not isinstance(method, str):
            return _error(id_, -32600, "Invalid Request")
        params = message.get("params") or {}
        if not isinstance(params, dict):
            return _error(id_, -32602, "Invalid params")
        if method == "initialize":
            asked = params.get("protocolVersion")
            version = asked if asked in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
            return _result(
                id_,
                {
                    "protocolVersion": version,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {
                        "name": "simeon",
                        "title": "Simeon",
                        "version": "1.0.0",
                    },
                    "instructions": INSTRUCTIONS,
                },
            )
        if method == "ping":
            return _result(id_, {})
        if method == "tools/list":
            return _result(id_, {"tools": TOOLS})
        if method == "tools/call":
            return await self.call(id_, params)
        return _error(id_, -32601, f"Method not found: {method}")

    async def call(self, id_: Any, params: dict[str, Any]) -> dict[str, Any]:
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not isinstance(arguments, dict):
            return _error(id_, -32602, "Invalid params")
        tools = {
            "list_agents": self.list_agents,
            "send_message": self.send_message,
            "read_messages": self.read_messages,
        }
        tool = tools.get(name) if isinstance(name, str) else None
        if tool is None:
            return _error(id_, -32602, f"Unknown tool: {name}")
        log.info(
            "mcp.tool",
            tool=name,
            user_id=str(self.user_id),
            client_id=self.token.client_id,
        )
        try:
            found = await tool(arguments)
        except ToolRefusal as refusal:
            return _result(
                id_,
                {"content": [{"type": "text", "text": str(refusal)}], "isError": True},
            )
        return _result(
            id_,
            {
                "content": [
                    {"type": "text", "text": json.dumps(found, ensure_ascii=False)}
                ],
                "structuredContent": found,
            },
        )

    # MARK: The tools

    async def _agents(self) -> list[dict[str, Any]]:
        held = await DesktopChatAgentRepository.from_session(self.session).list_by_user(
            self.user_id
        )
        return [agent.row for agent in held if isinstance(agent.row, dict)]

    async def list_agents(self, _: dict[str, Any]) -> dict[str, Any]:
        rows = await self._agents()
        names = {str(row.get("id")): str(row.get("name") or "") for row in rows}
        agents: list[dict[str, Any]] = []
        for row in rows:
            agent: dict[str, Any] = {
                "id": str(row.get("id")),
                "name": str(row.get("name") or ""),
            }
            if row.get("title"):
                agent["role"] = str(row["title"])
            if row.get("isGroup"):
                agent["group"] = True
                members = row.get("memberIds")
                if isinstance(members, list):
                    agent["members"] = [names.get(str(m), str(m)) for m in members]
            agents.append(agent)
        if not agents:
            return {
                "agents": [],
                "note": "No agents yet: the person makes their first one in the Simeon app.",
            }
        return {"agents": agents}

    async def _agent(self, arguments: dict[str, Any]) -> dict[str, Any]:
        """The agent named by id or name (letter case aside)."""
        asked = arguments.get("agent")
        if not isinstance(asked, str) or not asked.strip():
            raise ToolRefusal("Say which agent: its id or name, from list_agents.")
        asked = asked.strip()
        rows = await self._agents()
        for row in rows:
            if str(row.get("id")) == asked:
                return row
        named = [
            row
            for row in rows
            if str(row.get("name") or "").casefold() == asked.casefold()
        ]
        if len(named) == 1:
            return named[0]
        known = (
            ", ".join(str(row.get("name") or row.get("id")) for row in rows)
            or "none yet"
        )
        if named:
            raise ToolRefusal(
                f"More than one agent is called {asked}: use the id from list_agents."
            )
        raise ToolRefusal(f"No agent called {asked}. The agents: {known}.")

    async def send_message(self, arguments: dict[str, Any]) -> dict[str, Any]:
        agent = await self._agent(arguments)
        words = arguments.get("message")
        if not isinstance(words, str) or not words.strip():
            raise ToolRefusal("There is nothing to send: write the message.")
        if "\x00" in words:
            raise ToolRefusal("This message can't be sent.")
        prompt = f"{self.client_name}: {words.strip()}"
        if len(prompt.encode()) > MESSAGE_MAX_BYTES:
            raise ToolRefusal("This message is too long.")
        inbox = DesktopChatInboxRepository.from_session(self.session)
        if await inbox.count_waiting(self.user_id) >= WAITING_MAX:
            raise ToolRefusal(
                "Too many messages are waiting for the person's computer: try again later."
            )
        sent_at = int(time.time() * 1000)
        await inbox.add(
            self.user_id,
            agent_id=str(agent["id"]),
            nonce=f"mcp-{uuid4()}",
            kind="prompt",
            message={"prompt": prompt, "composedAtMs": sent_at},
        )
        # As from the apps (`chats.chats_send`): the computer, awake, takes
        # it now; asleep, it is woken and takes it as it starts.
        await publish(self.redis, self.user_id, "chat-inbox")
        return {
            "sent": True,
            "agent": {"id": str(agent["id"]), "name": str(agent.get("name") or "")},
            "sentAt": sent_at,
            "next": "Call read_messages with since=sentAt and wait_seconds to get the answer.",
        }

    async def read_messages(self, arguments: dict[str, Any]) -> dict[str, Any]:
        agent = await self._agent(arguments)
        since = arguments.get("since")
        since_ms = float(since) if isinstance(since, (int, float)) else None
        limit = arguments.get("limit")
        count = limit if isinstance(limit, int) and 1 <= limit <= 100 else READ_DEFAULT
        wait = arguments.get("wait_seconds")
        wait_s = wait if isinstance(wait, int) and 0 < wait <= WAIT_MAX_SECONDS else 0
        names = {
            str(row.get("id")): str(row.get("name") or "")
            for row in await self._agents()
        }
        lines = DesktopChatLineRepository.from_session(self.session)
        deadline = time.monotonic() + wait_s
        while True:
            rows, _ = await lines.newest(self.user_id, str(agent["id"]), READ_LIMIT_MAX)
            said = [
                spoken
                for row in rows
                if (spoken := _spoken(row.entry, str(agent.get("name") or ""), names))
                is not None
                and (
                    since_ms is None or spoken["at"] is None or spoken["at"] > since_ms
                )
            ]
            answered = any(m["from"] != "you" for m in said)
            if answered or time.monotonic() >= deadline:
                break
            await asyncio.sleep(WAIT_STEP_SECONDS)
        found: dict[str, Any] = {
            "agent": {"id": str(agent["id"]), "name": str(agent.get("name") or "")},
            "messages": said[-count:],
        }
        if wait_s and not answered:
            found["note"] = (
                "No answer yet: the agent may still be working. Read again in a minute."
            )
        return found


def _spoken(
    entry: Any, agent_name: str, names: dict[str, str]
) -> dict[str, Any] | None:
    """A chat line as a bot reads it: who, what, when; None for what isn't
    words (tools, cards, the working line)."""
    if not isinstance(entry, dict):
        return None
    at = entry.get("timestampMs")
    at_ms = at if isinstance(at, (int, float)) else None
    kind = entry.get("kind")
    if kind == "message":
        content = entry.get("content")
        if not isinstance(content, str) or not content.strip():
            return None
        who = "you" if entry.get("role") == "user" else agent_name
        return {"id": entry.get("id"), "from": who, "text": content, "at": at_ms}
    if kind in ("user-message", "human-message"):
        content = entry.get("content")
        if not isinstance(content, str) or not content.strip():
            return None
        return {"id": entry.get("id"), "from": "you", "text": content, "at": at_ms}
    if kind == "send-message":
        message = entry.get("message")
        if not isinstance(message, dict):
            return None
        sender = next(
            (
                names[str(entry[key])]
                for key in ("senderAgentId", "fromAgentId", "agentId")
                if entry.get(key) is not None and str(entry[key]) in names
            ),
            agent_name,
        )
        if message.get("type") == "text":
            content = message.get("content")
            if not isinstance(content, str) or not content.strip():
                return None
            return {"id": entry.get("id"), "from": sender, "text": content, "at": at_ms}
        if message.get("type") == "attachment":
            title = message.get("name") or message.get("url") or "a file"
            return {
                "id": entry.get("id"),
                "from": sender,
                "text": f"[sent {title}]",
                "at": at_ms,
            }
    return None
