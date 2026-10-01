"""Voice calls: the person talks to one of their agents, out loud.

The call itself runs between the Mac app and ElevenLabs Agents over
WebRTC (`@elevenlabs/client` in the app). Simeon's part is small and is
all here:

- **The key.** ElevenLabs is reached with Simeon's key
  (`ELEVENLABS_API_KEY`), which never leaves the server. For each call
  the app asks `POST /desktop/api/proxy/v1/voice/calls` and is handed a
  short-lived conversation token instead.
- **The platform agent.** One ElevenLabs agent, "Simeon voice", serves
  every Simeon agent: the app overrides its prompt, first message,
  language and voice per call, so a call to "Ada" sounds and behaves
  like Ada. The server finds it by name or creates it on first use, and
  keeps its configuration in step with `VOICE_AGENT_CONFIG_VERSION`
  (tagged on the agent) — bump the version and the next call rewrites it.
  `ELEVENLABS_AGENT_ID` names an agent managed by hand instead, which is
  then used as it is and never rewritten.
- **The two client tools.** `send_task {task, quote?}` and
  `recall_text_messages`, the upstream app's, are declared on the platform agent and
  answered by the app. The voice speaks as the person's agent; `send_task`
  relays the request to that agent over the call's `voice:<call>` channel,
  and what the agent sends on it comes back to the voice to say as its own.
- **The bill.** When the app hangs up it says so
  (`…/voice/calls/{conversation_id}/end`). The server asks ElevenLabs how
  long the call really lasted and bills those seconds on
  `VOICE_CALL_MODEL`, once per conversation (`DesktopVoiceCall`).
- **The voices.** A short curated list for the picker
  (`…/voice/voices`), cached for an hour.

Every ElevenLabs request goes through `ElevenLabsClient`, and the routes
reach it through `client()`, so tests replace the one function and no
request leaves the machine.
"""

from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Any
from urllib.parse import quote

import httpx
import structlog
from fastapi import Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.exc import IntegrityError

from simeon.config import settings
from simeon.models import DesktopVoiceCall
from simeon.postgres import AsyncSession, get_db_session
from simeon.routing import APIRouter

from .auth import ProxyCaller, get_proxy_caller
from .pricing import VOICE_CALL_MAX_SECONDS, VOICE_CALL_MODEL
from .proxy_common import budget_refusal, error_response
from .repository import DesktopVoiceCallRepository
from .service import (
    DesktopProvider,
    Usage,
    desktop,
    preferred_name,
    provider_api_key,
    provider_base_url,
    provider_configured,
)

log = structlog.get_logger()

router = APIRouter(include_in_schema=False)

# --- the platform agent's configuration --------------------------------------

#: The platform agent's name, which is also how the server finds it again.
VOICE_AGENT_NAME = "Simeon voice"

#: Bump when anything in `agent_config` or `CLIENT_TOOLS` changes: the next
#: call finds the agent without this version's tag and rewrites it.
VOICE_AGENT_CONFIG_VERSION = 6
VOICE_AGENT_VERSION_TAG = f"simeon-voice-config-v{VOICE_AGENT_CONFIG_VERSION}"
VOICE_AGENT_TAGS = ["simeon", "simeon-voice", VOICE_AGENT_VERSION_TAG]

#: The model that thinks during the call. Fast over clever: the call's
#: real work runs in the person's own agent behind the call (`send_task`), and a
#: pause before every sentence is what makes a voice feel broken.
VOICE_LLM = "gemini-2.5-flash"

#: ElevenLabs' low-latency voice model. An English agent must use a turbo or
#: flash v2 model: `eleven_flash_v2_5` is refused with "English Agents must use
#: turbo or flash v2" (seen on the first real call, 30 September 2026).
VOICE_TTS_MODEL = "eleven_flash_v2"

#: The voice a call speaks in when the app names none: the first of the
#: founder's voices (`CURATED_VOICES`). The agent is created with whichever
#: voice `_pick_voice` finds in the workspace, this one first; a voice
#: ElevenLabs cannot find fails the whole agent (`voice_not_found`, the first
#: real call, 30 September 2026).
VOICE_DEFAULT_VOICE_ID = "r1KmysJdVYZjJCm4mL3b"

#: Eric, one of ElevenLabs' default voices, which every workspace has: the
#: voice of last resort when none of the founder's voices is in the account.
VOICE_FALLBACK_VOICE_ID = "cjVigY5qzO86Huf0OWal"

VOICE_DEFAULT_LANGUAGE = "en"
VOICE_DEFAULT_FIRST_MESSAGE = "Hi, it's me. What's up?"

#: The fallback prompt. The app overrides it on every call with the
#: agent's own (its name, its manner, what it is working on); this is
#: what a call says when it does not.
VOICE_BASE_PROMPT = """\
You are one of the person's Simeon agents, on a live phone call with them. \
Simeon is a team of always-on agents that work for them on their Mac and on \
a cloud computer of their own. Speak as yourself, in the first person ("I'll \
do that", "I've sent it"). Never mention another agent, an assistant, a \
system or a hand-off, and never say you are passing anything on.

How you speak:
- This is a phone call. Answer in one or two short sentences, the way a \
capable colleague talks. No lists, no headings, no markdown, no URLs read \
aloud, no emoji.
- Say numbers, dates and times the way a person says them.
- If you did not catch something, say so and ask again. Never guess at what \
they said.

How you get things done:
- Your work runs behind the call while you talk. For anything that needs \
doing or finding out, call `send_task` with what is needed in one clear \
sentence carrying every detail they gave; when their exact wording matters, \
put their words in `quote`. Say a few words, like "on it", and carry on.
- Never say something is done, sent, booked or found until a note tells you \
your work came back with it. When it does, tell them, briefly, as your own.
- When they refer to something you wrote to each other, call \
`recall_text_messages`.

Ending:
- When they say goodbye or are clearly done, say a short goodbye and call \
`end_call`.
- If they are talking to someone else, or nothing needs saying, call \
`skip_turn`.
"""

#: The voice's two client tools, the upstream app's: `send_task` relays a request to
#: the person's agent over the call's `voice:<call>` channel (the app answers
#: at once and the work goes on behind the call, so its timeout is short and
#: the voice always speaks before calling it), and `recall_text_messages`
#: reads the latest texts between the person and the agent. Ending the call
#: and staying silent are ElevenLabs' own `end_call` and `skip_turn`.
CLIENT_TOOLS: tuple[dict[str, Any], ...] = (
    {
        "type": "client",
        "name": "send_task",
        "description": (
            "Set your work going on what the caller needs, behind the call. "
            "Use it for anything that needs doing or finding out. Answers at "
            "once; what your work turns up comes back to you during the call."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": (
                        "What is needed, in one clear sentence, with every "
                        "detail the caller gave."
                    ),
                },
                "quote": {
                    "type": "string",
                    "description": (
                        "Optional. The caller's exact words, when the wording "
                        "matters (a message to send, a name, a date)."
                    ),
                },
            },
            "required": ["task"],
        },
        "expects_response": True,
        "response_timeout_secs": 20,
        "pre_tool_speech": "force",
    },
    {
        "type": "client",
        "name": "recall_text_messages",
        "description": (
            "Read the latest text messages between you and the caller in "
            "your chat, oldest first."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
        "expects_response": True,
    },
)


def _system_tool(name: str) -> dict[str, Any]:
    return {
        "type": "system",
        "name": name,
        "description": "",
        "params": {"system_tool_type": name},
    }


#: The call's recap in the person's chat, our own field on the agent's
#: analysis. ElevenLabs' built-in `transcript_summary` is written about "the
#: user" in the third person and its prompt is not ours to change (the
#: founder, 1 October 2026: "whats the deal with him calling me 'the user'").
#: The server puts the person's name in front (`recap_for`).
VOICE_RECAP_FIELD = "recap"
VOICE_RECAP_DESCRIPTION = (
    "A recap of this call for the chat between the agent and the person who "
    "called. Write it as the agent, speaking to the person directly: 'you' for "
    "them, 'I' for the agent. Start with 'You'. One or two short sentences: "
    "what they called about, and what the agent did or will do. Plain, warm, "
    "no greeting, no sign-off. Never write 'the user', 'the caller' or 'the "
    "customer', and never name the person."
)


def agent_config(
    tool_ids: list[str], voice_id: str = VOICE_DEFAULT_VOICE_ID
) -> dict[str, Any]:
    """The whole of the platform agent, as `POST /v1/convai/agents/create`
    and `PATCH /v1/convai/agents/{id}` take it."""
    return {
        "name": VOICE_AGENT_NAME,
        "tags": VOICE_AGENT_TAGS,
        "conversation_config": {
            "agent": {
                "first_message": VOICE_DEFAULT_FIRST_MESSAGE,
                "language": VOICE_DEFAULT_LANGUAGE,
                "prompt": {
                    "prompt": VOICE_BASE_PROMPT,
                    "llm": VOICE_LLM,
                    "tool_ids": tool_ids,
                    "built_in_tools": {
                        "end_call": _system_tool("end_call"),
                        "skip_turn": _system_tool("skip_turn"),
                    },
                },
            },
            "tts": {
                "model_id": VOICE_TTS_MODEL,
                "voice_id": voice_id,
            },
            "turn": {
                "turn_timeout": 7,
                "silence_end_call_timeout": 25,
                # Faster replies (the founder, 1 October 2026): answer soon
                # after the caller stops, and start thinking during the pause.
                "turn_eagerness": "eager",
                "speculative_turn": True,
            },
            "conversation": {"max_duration_seconds": VOICE_CALL_MAX_SECONDS},
        },
        "platform_settings": {
            # A conversation opens only with a token Simeon minted.
            "auth": {"enable_auth": True},
            # What the app may set per call, and nothing else.
            "overrides": {
                "conversation_config_override": {
                    "agent": {
                        "prompt": {"prompt": True},
                        "first_message": True,
                        "language": True,
                    },
                    "tts": {"voice_id": True},
                }
            },
            "privacy": {"record_voice": False},
            "data_collection": {
                VOICE_RECAP_FIELD: {
                    "type": "string",
                    "description": VOICE_RECAP_DESCRIPTION,
                }
            },
        },
    }


#: The voices the picker offers, in this order, shown by these names only
#: (the founder's own list, 1 October 2026: "the voice description / name
#: makes no sense. should be just names"). Each must be added to the
#: ElevenLabs account ("Add to my voices"); one the account does not have is
#: skipped, and with none of them the picker offers ElevenLabs' defaults.
CURATED_VOICES: tuple[tuple[str, str], ...] = (
    (VOICE_DEFAULT_VOICE_ID, "Jessica"),
    ("ljX1ZrXuDIIRVcmiVSyR", "Michael"),
    ("1t1EeRixsJrKbiF1zwM6", "Jerry"),
    ("XcXEQzuLXRU9RcfWzEJt", "Veda"),
    ("s3TPKV1kjDlVtZbl4Ksh", "Adam"),
    ("UgBBYS2sOqTuMpoF3BR0", "Mark"),
    ("6OzrBCQf8cjERkYgzSg8", "Jamal"),
    ("mhOEe36rlKIS1ExMEOyo", "Kass"),
    ("Cz0K1kOv9tD8l0b5Qu53", "Jon"),
    ("WI5pMmcGGS32yI7yttoP", "Amanda"),
    ("snyKKuaGYk1VUEh42zbW", "Chris"),
    ("gfRt6Z3Z8aTbpLfexQ7N", "Boyd"),
    ("NHRgOEwqx5WZNClv5sat", "Chelsea"),
    ("5u41aNhyCU6hXOcjPPv0", "Hope"),
)
VOICES_CACHE_SECONDS = 3600.0

#: ElevenLabs' conversation ids are `conv_` and letters and digits; this
#: is looser than that and strict enough that the id is safe on a path.
CONVERSATION_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


# --- the ElevenLabs client ----------------------------------------------------


class ElevenLabsError(Exception):
    """ElevenLabs answered, and not with success, or could not be reached
    (`status` 0)."""

    def __init__(self, status: int, body: str, path: str) -> None:
        self.status = status
        self.body = body
        self.path = path
        super().__init__(f"ElevenLabs {path} answered {status}: {body[:300]}")


class ElevenLabsClient:
    """The dozen ElevenLabs calls Simeon makes, and nothing else."""

    def __init__(self, api_key: str, base_url: str, *, timeout: float = 30.0) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    @property
    def cache_key(self) -> tuple[str, str]:
        """Which ElevenLabs workspace this is, for the in-process caches:
        a changed key or address is a different set of agents."""
        return (self.base_url, self.api_key)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as http:
                response = await http.request(
                    method,
                    f"{self.base_url}{path}",
                    params=params,
                    json=json,
                    headers={"xi-api-key": self.api_key},
                )
        except httpx.HTTPError as error:
            raise ElevenLabsError(0, str(error), path) from error
        if response.status_code >= 400:
            raise ElevenLabsError(
                response.status_code,
                response.content.decode(errors="replace"),
                path,
            )
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as error:
            raise ElevenLabsError(
                response.status_code, "The answer is not JSON.", path
            ) from error

    # agents

    async def find_agents(self, search: str) -> list[dict[str, Any]]:
        answer = await self._request(
            "GET", "/v1/convai/agents", params={"search": search, "page_size": 100}
        )
        agents = answer.get("agents") if isinstance(answer, dict) else None
        return [one for one in agents or [] if isinstance(one, dict)]

    async def get_agent(self, agent_id: str) -> dict[str, Any]:
        answer = await self._request("GET", f"/v1/convai/agents/{quote(agent_id)}")
        return answer if isinstance(answer, dict) else {}

    async def create_agent(self, config: dict[str, Any]) -> str:
        answer = await self._request("POST", "/v1/convai/agents/create", json=config)
        agent_id = answer.get("agent_id") if isinstance(answer, dict) else None
        if not isinstance(agent_id, str) or not agent_id:
            raise ElevenLabsError(200, "No agent_id in the answer.", "agents/create")
        return agent_id

    async def update_agent(self, agent_id: str, config: dict[str, Any]) -> None:
        await self._request(
            "PATCH", f"/v1/convai/agents/{quote(agent_id)}", json=config
        )

    # tools

    async def list_tools(self) -> list[dict[str, Any]]:
        answer = await self._request("GET", "/v1/convai/tools")
        tools = answer.get("tools") if isinstance(answer, dict) else None
        return [one for one in tools or [] if isinstance(one, dict)]

    async def create_tool(self, tool_config: dict[str, Any]) -> str:
        answer = await self._request(
            "POST", "/v1/convai/tools", json={"tool_config": tool_config}
        )
        tool_id = answer.get("id") if isinstance(answer, dict) else None
        if not isinstance(tool_id, str) or not tool_id:
            raise ElevenLabsError(200, "No id in the answer.", "tools")
        return tool_id

    async def update_tool(self, tool_id: str, tool_config: dict[str, Any]) -> None:
        await self._request(
            "PATCH",
            f"/v1/convai/tools/{quote(tool_id)}",
            json={"tool_config": tool_config},
        )

    # conversations

    async def conversation_token(self, agent_id: str) -> dict[str, Any]:
        answer = await self._request(
            "GET", "/v1/convai/conversation/token", params={"agent_id": agent_id}
        )
        return answer if isinstance(answer, dict) else {}

    async def get_conversation(self, conversation_id: str) -> dict[str, Any]:
        answer = await self._request(
            "GET", f"/v1/convai/conversations/{quote(conversation_id)}"
        )
        return answer if isinstance(answer, dict) else {}

    # voices

    async def list_voices_by_id(self, voice_ids: list[str]) -> list[dict[str, Any]]:
        """The account's voices among `voice_ids` (at most 100)."""
        answer = await self._request(
            "GET",
            "/v2/voices",
            params={"voice_ids": voice_ids[:100], "page_size": 100},
        )
        voices = answer.get("voices") if isinstance(answer, dict) else None
        return [one for one in voices or [] if isinstance(one, dict)]

    async def list_default_voices(self) -> list[dict[str, Any]]:
        answer = await self._request(
            "GET",
            "/v2/voices",
            params={
                "include_live_moderated": "false",
                "voice_type": "default",
                "page_size": 100,
            },
        )
        voices = answer.get("voices") if isinstance(answer, dict) else None
        return [one for one in voices or [] if isinstance(one, dict)]


def client() -> ElevenLabsClient:
    """The client the routes use. Tests replace this function."""
    return ElevenLabsClient(
        provider_api_key(DesktopProvider.elevenlabs),
        provider_base_url(DesktopProvider.elevenlabs),
    )


# --- finding and syncing the platform agent -----------------------------------

_agent_ids: dict[tuple[str, str], str] = {}
_agent_lock = asyncio.Lock()


def forget_agent() -> None:
    """Drop what this process knows about the platform agent, so the next
    call looks it up again. For tests, and after ElevenLabs says the
    agent is gone."""
    _agent_ids.clear()


async def _ensure_tools(api: ElevenLabsClient) -> list[str]:
    """The ids of `CLIENT_TOOLS` in the workspace, each created or
    rewritten to this version's configuration."""
    existing: dict[str, str] = {}
    for tool in await api.list_tools():
        config = tool.get("tool_config")
        tool_id = tool.get("id")
        if (
            isinstance(config, dict)
            and config.get("type") == "client"
            and isinstance(config.get("name"), str)
            and isinstance(tool_id, str)
        ):
            existing.setdefault(config["name"], tool_id)
    ids: list[str] = []
    for config in CLIENT_TOOLS:
        name = config["name"]
        if name in existing:
            await api.update_tool(existing[name], dict(config))
            ids.append(existing[name])
        else:
            ids.append(await api.create_tool(dict(config)))
    return ids


def _oldest(agents: list[dict[str, Any]]) -> str | None:
    """Of the agents named exactly `VOICE_AGENT_NAME`, the one created
    first: two API processes racing on a first call can each create one,
    and every later lookup must settle on the same."""
    named = [
        one
        for one in agents
        if one.get("name") == VOICE_AGENT_NAME and isinstance(one.get("agent_id"), str)
    ]
    if not named:
        return None
    named.sort(key=lambda one: one.get("created_at_unix_secs") or 0)
    return str(named[0]["agent_id"])


async def _available_voices(api: ElevenLabsClient) -> list[dict[str, Any]]:
    """The curated voices the account has, else ElevenLabs' defaults."""
    curated = await api.list_voices_by_id([voice_id for voice_id, _ in CURATED_VOICES])
    if any(one.get("voice_id") in dict(CURATED_VOICES) for one in curated):
        return curated
    return await api.list_default_voices()


async def _pick_voice(api: ElevenLabsClient) -> str:
    """A voice the workspace has, for the agent's own: the first curated one
    it has, else the first default voice, else Eric."""
    try:
        listed = [
            one["voice_id"]
            for one in await _available_voices(api)
            if isinstance(one.get("voice_id"), str)
        ]
    except ElevenLabsError as error:
        log.warning("desktop.voice.voices_unlisted", status=error.status)
        return VOICE_FALLBACK_VOICE_ID
    for voice_id, _ in CURATED_VOICES:
        if voice_id in listed:
            return voice_id
    return listed[0] if listed else VOICE_FALLBACK_VOICE_ID


async def _sync_agent(api: ElevenLabsClient) -> str:
    agent_id = _oldest(await api.find_agents(VOICE_AGENT_NAME))
    if agent_id is not None:
        tags = (await api.get_agent(agent_id)).get("tags") or []
        if VOICE_AGENT_VERSION_TAG in tags:
            log.info("desktop.voice.agent_ready", agent_id=agent_id)
            return agent_id
    voice_id = await _pick_voice(api)
    config = agent_config(await _ensure_tools(api), voice_id)
    if agent_id is None:
        agent_id = await api.create_agent(config)
        log.info(
            "desktop.voice.agent_created",
            agent_id=agent_id,
            voice_id=voice_id,
            version=VOICE_AGENT_CONFIG_VERSION,
        )
    else:
        await api.update_agent(agent_id, config)
        log.info(
            "desktop.voice.agent_synced",
            agent_id=agent_id,
            voice_id=voice_id,
            version=VOICE_AGENT_CONFIG_VERSION,
        )
    return agent_id


async def ensure_agent(api: ElevenLabsClient) -> str:
    """The platform agent's id: `ELEVENLABS_AGENT_ID` when set, otherwise
    Simeon's own, found or created and brought to this version once per
    process."""
    if settings.ELEVENLABS_AGENT_ID:
        return settings.ELEVENLABS_AGENT_ID
    known = _agent_ids.get(api.cache_key)
    if known is not None:
        return known
    async with _agent_lock:
        known = _agent_ids.get(api.cache_key)
        if known is not None:
            return known
        agent_id = await _sync_agent(api)
        _agent_ids[api.cache_key] = agent_id
        return agent_id


# --- the routes ---------------------------------------------------------------


def _not_configured() -> JSONResponse:
    return error_response(
        "api_error", "Voice calls are not switched on on this server.", 503
    )


def _upstream_failed(error: ElevenLabsError, what: str) -> JSONResponse:
    """Write down what ElevenLabs said, in full, once, and answer the app
    with a sentence. The body carries no key: the key goes up in a header."""
    if error.status == 0:
        log.warning(
            "desktop.voice.upstream_unreachable", path=error.path, error=error.body
        )
        return error_response(
            "api_error", "The voice service could not be reached.", 502
        )
    log.warning(
        "desktop.voice.upstream_refused",
        path=error.path,
        status=error.status,
        body=error.body[:1000] or "(empty)",
    )
    return error_response("api_error", f"The voice service refused {what}.", 502)


@router.post(
    "/api/proxy/v1/voice/calls", name="desktop:voice_call_start", response_model=None
)
async def start_call(
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """Open one call: `{token, conversation_id, agent_id}` out.

    The token opens one WebRTC conversation with the platform agent and
    expires in minutes; the app passes it to `Conversation.startSession`
    with its overrides. `conversation_id` is null when ElevenLabs does not
    name the conversation before it starts; the SDK reports it once
    connected, and that is the id the app ends the call with.
    """
    if not provider_configured(DesktopProvider.elevenlabs):
        return _not_configured()
    refused = await budget_refusal(session, caller.user)
    if refused is not None:
        return refused

    api = client()
    try:
        agent_id = await ensure_agent(api)
        try:
            answer = await api.conversation_token(agent_id)
        except ElevenLabsError as error:
            if error.status != 404 or settings.ELEVENLABS_AGENT_ID:
                raise
            # The agent was deleted behind this process's back: find or
            # create it again, once.
            forget_agent()
            agent_id = await ensure_agent(api)
            answer = await api.conversation_token(agent_id)
    except ElevenLabsError as error:
        return _upstream_failed(error, "the call")

    token = answer.get("token")
    if not isinstance(token, str) or not token:
        log.warning("desktop.voice.upstream_refused", path="token", body="no token")
        return error_response("api_error", "The voice service sent no token.", 502)
    conversation_id = answer.get("conversation_id")
    log.info(
        "desktop.voice.call_started",
        user_id=str(caller.user.id),
        agent_id=agent_id,
        conversation_id=conversation_id,
    )
    return JSONResponse(
        {
            "token": token,
            "conversation_id": conversation_id
            if isinstance(conversation_id, str)
            else None,
            "agent_id": agent_id,
        },
        headers={"cache-control": "no-store"},
    )


def _summary(conversation: dict[str, Any] | None) -> str | None:
    """The call's recap from our `recap` field, or None while ElevenLabs has
    not written it. ElevenLabs' own `transcript_summary` is not used: it
    speaks of "the user"."""
    analysis = conversation.get("analysis") if conversation else None
    results = (
        analysis.get("data_collection_results") if isinstance(analysis, dict) else None
    )
    field = results.get(VOICE_RECAP_FIELD) if isinstance(results, dict) else None
    if field is None and isinstance(analysis, dict):
        # The same results as a list, which the API also answers with.
        listed = analysis.get("data_collection_results_list")
        field = next(
            (
                one
                for one in (listed if isinstance(listed, list) else [])
                if isinstance(one, dict)
                and one.get("data_collection_id") == VOICE_RECAP_FIELD
            ),
            None,
        )
    value = field.get("value") if isinstance(field, dict) else None
    return value.strip() if isinstance(value, str) and value.strip() else None


#: The most lines of a call's transcript handed back for its record.
VOICE_TRANSCRIPT_MAX_LINES = 400


def _transcript(conversation: dict[str, Any] | None) -> list[dict[str, str]]:
    """What was said on the call, `{speaker, text}` oldest first, for the
    record the agent keeps in its voice-calls/ folder."""
    lines = conversation.get("transcript") if conversation else None
    out: list[dict[str, str]] = []
    for line in lines if isinstance(lines, list) else []:
        if not isinstance(line, dict):
            continue
        message = line.get("message")
        if not isinstance(message, str) or not message.strip():
            continue
        speaker = "agent" if line.get("role") == "agent" else "user"
        out.append({"speaker": speaker, "text": message.strip()})
    return out[:VOICE_TRANSCRIPT_MAX_LINES]


def recap_for(recap: str | None, name: str | None) -> str | None:
    """The recap with the person's name in front: "Bass, you asked me to…"."""
    if recap is None or not name:
        return recap
    if recap[:3].lower() == "you" and (len(recap) == 3 or not recap[3].isalpha()):
        return f"{name}, {recap[:1].lower()}{recap[1:]}"
    return recap


def _person_name(user: Any) -> str | None:
    """The name the person asked to be called, else Google's first name."""
    return preferred_name(user) or (
        str((user.meta or {}).get("given_name") or "").strip() or None
    )


def _reported_seconds(conversation: dict[str, Any] | None) -> int | None:
    metadata = conversation.get("metadata") if conversation else None
    value = metadata.get("call_duration_secs") if isinstance(metadata, dict) else None
    if isinstance(value, bool) or not isinstance(value, int | float) or value < 0:
        return None
    return min(int(value + 0.999), VOICE_CALL_MAX_SECONDS)


def _app_seconds(value: Any) -> int | None:
    if value is None:
        return 0
    if isinstance(value, bool) or not isinstance(value, int | float) or value < 0:
        return None
    return min(int(value + 0.999), VOICE_CALL_MAX_SECONDS)


async def _fetch_conversation(
    api: ElevenLabsClient, conversation_id: str
) -> dict[str, Any] | None:
    try:
        return await api.get_conversation(conversation_id)
    except ElevenLabsError as error:
        log.warning(
            "desktop.voice.conversation_unread",
            conversation_id=conversation_id,
            status=error.status,
            body=error.body[:1000] or "(empty)",
        )
        return None


async def _expected_agent(api: ElevenLabsClient) -> str | None:
    try:
        return await ensure_agent(api)
    except ElevenLabsError:
        return None


@router.post(
    "/api/proxy/v1/voice/calls/{conversation_id}/end",
    name="desktop:voice_call_end",
    response_model=None,
)
async def end_call(
    conversation_id: str,
    request: Request,
    caller: ProxyCaller = Depends(get_proxy_caller),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    """The app hung up: `{seconds}` in, `{seconds, summary}` out.

    Billed once per conversation. The seconds are ElevenLabs' own
    (`metadata.call_duration_secs`) when it reports them, and the app's
    count, capped at `VOICE_CALL_MAX_SECONDS`, when it does not. Asked
    again, the route bills nothing and answers with the seconds already
    billed and the summary, which ElevenLabs writes a little after the
    call ends — so asking again later is how the app gets it.
    """
    if not CONVERSATION_ID.match(conversation_id):
        return error_response(
            "invalid_request_error", "That is not a conversation id.", 400
        )
    raw = await request.body()
    try:
        payload = json.loads(raw or b"{}")
    except ValueError:
        return error_response("invalid_request_error", "The body is not JSON.", 400)
    if not isinstance(payload, dict):
        return error_response(
            "invalid_request_error", "The body must be an object.", 400
        )
    app_seconds = _app_seconds(payload.get("seconds"))
    if app_seconds is None:
        return error_response(
            "invalid_request_error", "seconds is a number of seconds.", 400
        )
    if not provider_configured(DesktopProvider.elevenlabs):
        return _not_configured()

    repository = DesktopVoiceCallRepository.from_session(session)
    api = client()
    billed = await repository.get_by_conversation_id(conversation_id)
    if billed is not None:
        if billed.user_id != caller.user.id:
            return error_response("not_found_error", "No such call.", 404)
        conversation = await _fetch_conversation(api, conversation_id)
        return JSONResponse(
            {
                "seconds": billed.seconds,
                "summary": recap_for(_summary(conversation), _person_name(caller.user)),
                "transcript": _transcript(conversation),
            },
            headers={"cache-control": "no-store"},
        )

    conversation = await _fetch_conversation(api, conversation_id)
    if conversation is not None:
        # A conversation of another ElevenLabs agent is not a Simeon call
        # and is not the caller's to claim.
        owner = conversation.get("agent_id")
        expected = await _expected_agent(api)
        if isinstance(owner, str) and expected is not None and owner != expected:
            log.warning(
                "desktop.voice.foreign_conversation",
                conversation_id=conversation_id,
                agent_id=owner,
                user_id=str(caller.user.id),
            )
            return error_response("not_found_error", "No such call.", 404)

    reported = _reported_seconds(conversation)
    seconds = reported if reported is not None else app_seconds
    source = "provider" if reported is not None else "app"

    try:
        async with session.begin_nested():
            await repository.create(
                DesktopVoiceCall(
                    user_id=caller.user.id,
                    session_id=caller.session_id,
                    conversation_id=conversation_id,
                    seconds=seconds,
                    duration_source=source,
                ),
                flush=True,
            )
            await desktop.record_usage(
                session,
                user_id=caller.user.id,
                session_id=caller.session_id,
                model=VOICE_CALL_MODEL,
                usage=Usage(input_tokens=seconds),
                stream=False,
                upstream_status=200,
            )
    except IntegrityError:
        # The same call ended twice at once; the other request billed it.
        billed = await repository.get_by_conversation_id(conversation_id)
        if billed is None or billed.user_id != caller.user.id:
            return error_response("not_found_error", "No such call.", 404)
        seconds = billed.seconds

    log.info(
        "desktop.voice.call_ended",
        user_id=str(caller.user.id),
        conversation_id=conversation_id,
        seconds=seconds,
        source=source,
        app_seconds=app_seconds,
    )
    return JSONResponse(
        {
            "seconds": seconds,
            "summary": recap_for(_summary(conversation), _person_name(caller.user)),
            "transcript": _transcript(conversation),
        },
        headers={"cache-control": "no-store"},
    )


_voices: dict[tuple[str, str], tuple[float, list[dict[str, Any]]]] = {}


def forget_voices() -> None:
    """Drop the cached voice list. For tests."""
    _voices.clear()


def _voice_row(voice: dict[str, Any], name: str | None = None) -> dict[str, Any]:
    """A picker row. A curated voice is shown by its name only; ElevenLabs'
    own description and labels are left out."""
    if name is not None:
        return {
            "id": voice.get("voice_id"),
            "name": name,
            "description": None,
            "labels": {},
            "preview_url": voice.get("preview_url"),
        }
    return {
        "id": voice.get("voice_id"),
        "name": voice.get("name"),
        "description": None,
        "labels": {},
        "preview_url": voice.get("preview_url"),
    }


def curate(voices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The curated voices among `voices`, in `CURATED_VOICES`' order and by
    their names. Should none of them be there, every voice listed rather than
    an empty picker."""
    by_id = {one.get("voice_id"): one for one in voices}
    picked = [
        _voice_row(by_id[voice_id], name)
        for voice_id, name in CURATED_VOICES
        if voice_id in by_id
    ]
    if picked:
        return picked
    return [_voice_row(one) for one in voices if isinstance(one.get("voice_id"), str)]


@router.get(
    "/api/proxy/v1/voice/voices",
    name="desktop:voice_voices",
    response_model=None,
    dependencies=[Depends(get_proxy_caller)],
)
async def list_voices() -> Response:
    """The voice picker: `[{id, name, description, labels, preview_url}]`."""
    if not provider_configured(DesktopProvider.elevenlabs):
        return _not_configured()
    api = client()
    cached = _voices.get(api.cache_key)
    now = time.monotonic()
    if cached is not None and cached[0] > now:
        return JSONResponse(
            cached[1], headers={"cache-control": "private, max-age=3600"}
        )
    try:
        voices = curate(await _available_voices(api))
    except ElevenLabsError as error:
        return _upstream_failed(error, "the list of voices")
    _voices[api.cache_key] = (now + VOICES_CACHE_SECONDS, voices)
    return JSONResponse(voices, headers={"cache-control": "private, max-age=3600"})


__all__ = [
    "CLIENT_TOOLS",
    "CURATED_VOICES",
    "VOICE_AGENT_CONFIG_VERSION",
    "VOICE_AGENT_NAME",
    "VOICE_LLM",
    "VOICE_TTS_MODEL",
    "ElevenLabsClient",
    "ElevenLabsError",
    "agent_config",
    "client",
    "ensure_agent",
    "forget_agent",
    "forget_voices",
    "router",
]
