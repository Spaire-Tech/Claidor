"""The engine's Responses calls on Claude's own Messages wire, for a person's
Anthropic key (10 November 2026), and for MiniMax, whose Claude-shaped wire
is the one it recommends.

Why not Anthropic's OpenAI-compatible door, as for the other providers
(`chat_wire.py`)? Anthropic calls it "not considered a long-term or
production-ready solution", it says nothing of what Claude thought, and it
caches nothing. An agent sends its whole brief and conversation on every
call; on the person's own key, Claude's prompt cache makes those calls
cost about a tenth. So the request is written the way Claude reads it
(`messages_request`):

- the brief as `system`, with a cache breakpoint at its end (the tools,
  which come before it, are cached with it), and a second one on the last
  block of the conversation, so each call reads the one before from the
  cache;
- the person's words, pictures and PDFs as Claude's blocks; tool calls as
  `tool_use`, their answers as `tool_result`, first in the next turn;
- adaptive thinking, summarized so the person sees what Claude thought, and
  the agent's effort as `output_config.effort`;
- no `temperature` or `top_p` (Claude 4.7 and later take only their
  defaults) and no forced `tool_choice` (Opus 5.5, Sonnet 5.5 and Fable 5.1
  refuse it);
- the thinking blocks Claude wrote with its tool calls handed back on the
  turn that made them, signatures and all (`chat_wire.ResponsesWriter.kept`):
  the engine's Responses wire drops them, and Claude needs them back to go
  on.

Claude's stream is written back as the Responses events the engine reads
(`MessagesToResponses`), with the same writer as the Chat providers.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from .chat_wire import (
    QUICK_EFFORTS,
    ResponsesWriter,
    call_arguments,
    effort_of,
    function_tools,
    responses_usage,
    tool_output,
)

#: The efforts Claude takes (`output_config.effort`).
CLAUDE_EFFORTS = ("low", "medium", "high", "xhigh", "max")
#: The answer's length when the engine names none, and the most Claude
#: writes (thinking included).
DEFAULT_MAX_TOKENS = 32_000
MOST_TOKENS = 128_000
_CACHE = {"type": "ephemeral"}
_DATA_URL = re.compile(r"^data:([\w.+-]+/[\w.+-]+);base64,(.*)$", re.DOTALL)
_TOOL_ID = re.compile(r"[^a-zA-Z0-9_-]")


def _tool_id(call_id: Any) -> str:
    """A call's id as Claude takes it (letters, digits, `_` and `-`): a
    conversation begun on another model may carry others."""
    return _TOOL_ID.sub("_", str(call_id or "call")) or "call"


def _picture(url: str) -> dict[str, Any] | None:
    found = _DATA_URL.match(url)
    if found is not None:
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": found[1], "data": found[2]},
        }
    if url.startswith(("https://", "http://")):
        return {"type": "image", "source": {"type": "url", "url": url}}
    return None


def _file(part: dict[str, Any]) -> dict[str, Any]:
    name = str(part.get("filename") or "a file")
    found = _DATA_URL.match(str(part.get("file_data") or ""))
    if found is not None and found[1] == "application/pdf":
        return {
            "type": "document",
            "source": {
                "type": "base64",
                "media_type": "application/pdf",
                "data": found[2],
            },
            "title": name,
        }
    return {
        "type": "text",
        "text": f"({name} was attached here; Claude can't read it.)",
    }


def _user_blocks(content: Any) -> list[dict[str, Any]]:
    if isinstance(content, str):
        return [{"type": "text", "text": content}] if content else []
    blocks: list[dict[str, Any]] = []
    for part in content if isinstance(content, list) else []:
        if not isinstance(part, dict):
            continue
        kind = part.get("type")
        if kind in ("input_text", "text", "output_text"):
            if isinstance(part.get("text"), str) and part["text"]:
                blocks.append({"type": "text", "text": part["text"]})
        elif kind == "input_image":
            url = part.get("image_url")
            if isinstance(url, dict):
                url = url.get("url")
            picture = _picture(url) if isinstance(url, str) else None
            if picture is not None:
                blocks.append(picture)
        elif kind == "input_file":
            blocks.append(_file(part))
    return blocks


def _words(content: Any) -> str:
    if isinstance(content, str):
        return content
    parts = content if isinstance(content, list) else []
    words = [
        part["text"]
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
    ]
    return "\n".join(words)


def _append(
    messages: list[dict[str, Any]], role: str, blocks: list[dict[str, Any]]
) -> None:
    """One more turn's blocks, merged into the last turn when it is the same
    role's (Claude wants the turns to alternate)."""
    if not blocks:
        return
    if messages and messages[-1]["role"] == role:
        messages[-1]["content"].extend(blocks)
    else:
        messages.append({"role": role, "content": list(blocks)})


def _tool_answers_first(message: dict[str, Any]) -> None:
    """A turn's tool answers before its words: Claude reads them in order."""
    content = message["content"]
    answers = [one for one in content if one.get("type") == "tool_result"]
    if answers and content[: len(answers)] != answers:
        message["content"] = answers + [
            one for one in content if one.get("type") != "tool_result"
        ]


def messages_body(
    payload: dict[str, Any],
    kept: dict[str, dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """The brief (`system` blocks) and the conversation (`messages`) of a
    Responses request, as Claude reads them."""
    system: list[dict[str, Any]] = []
    instructions = payload.get("instructions")
    if isinstance(instructions, str) and instructions.strip():
        system.append({"type": "text", "text": instructions})
    raw = payload.get("input")
    items = [{"role": "user", "content": raw}] if isinstance(raw, str) else raw
    messages: list[dict[str, Any]] = []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        role = item.get("role")
        if kind == "function_call":
            try:
                given = json.loads(call_arguments(item))
            except ValueError:
                given = {}
            _append(
                messages,
                "assistant",
                [
                    {
                        "type": "tool_use",
                        "id": _tool_id(item.get("call_id") or item.get("id")),
                        "name": str(item.get("name") or ""),
                        "input": given if isinstance(given, dict) else {},
                    }
                ],
            )
        elif kind == "function_call_output":
            answer: dict[str, Any] = {
                "type": "tool_result",
                "tool_use_id": _tool_id(item.get("call_id")),
            }
            said = tool_output(item.get("output"))
            if said:
                answer["content"] = said
            _append(messages, "user", [answer])
        elif kind in ("reasoning", "item_reference", "web_search_call"):
            continue
        elif role in ("system", "developer"):
            words = _words(item.get("content"))
            if not words.strip():
                continue
            if not messages:
                system.append({"type": "text", "text": words})
            else:
                # A brief that came later, said where it came: the cached
                # brief before the conversation stays as it was.
                _append(
                    messages,
                    "user",
                    [
                        {
                            "type": "text",
                            "text": f"<system-reminder>\n{words}\n</system-reminder>",
                        }
                    ],
                )
        elif role == "assistant":
            words = _words(item.get("content"))
            if words:
                _append(messages, "assistant", [{"type": "text", "text": words}])
        elif role == "user" or kind == "message":
            _append(messages, "user", _user_blocks(item.get("content")))
    if messages and messages[0]["role"] != "user":
        messages.insert(0, {"role": "user", "content": [{"type": "text", "text": "…"}]})
    for message in messages:
        if message["role"] == "user":
            _tool_answers_first(message)
        elif kept:
            _thinking_back(message, kept)
    return system, messages


THINKING = frozenset({"thinking", "redacted_thinking"})


def _thinking_back(message: dict[str, Any], kept: dict[str, dict[str, Any]]) -> None:
    """Claude's thinking blocks given back on the turn whose calls it wrote
    them with, as they came and where they came: the turn is laid out as
    Claude wrote it (`MessagesToResponses` keeps a mark for its words and
    each call between the thinking blocks)."""
    content = message["content"]
    turn = None
    for block in content:
        if block.get("type") == "tool_use":
            found = (kept.get(block["id"]) or {}).get("blocks")
            if isinstance(found, list):
                turn = found
                break
    if not turn or not any(one.get("type") in THINKING for one in turn):
        return
    texts = [one for one in content if one.get("type") == "text"]
    calls = {one["id"]: one for one in content if one.get("type") == "tool_use"}
    laid: list[dict[str, Any]] = []
    for one in turn:
        kind = one.get("type")
        if kind in THINKING:
            laid.append({key: value for key, value in one.items()})
        elif kind == "text" and texts:
            laid.append(texts.pop(0))
        elif kind == "tool_use" and one.get("id") in calls:
            laid.append(calls.pop(one["id"]))
    placed = {id(one) for one in laid}
    message["content"] = laid + [one for one in content if id(one) not in placed]


def _cache_points(
    system: list[dict[str, Any]],
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
) -> None:
    """Two breakpoints: the end of the brief (with the tools before it), and
    the last block of the conversation, so each call reads the last one's."""
    if system:
        system[-1]["cache_control"] = _CACHE
    elif tools:
        tools[-1]["cache_control"] = _CACHE
    if messages:
        last = messages[-1]["content"]
        for block in reversed(last):
            if block.get("type") not in ("thinking", "redacted_thinking"):
                block["cache_control"] = _CACHE
                break


def claude_effort(effort: str | None) -> str | None:
    if effort is None:
        return None
    if effort in QUICK_EFFORTS:
        return "low"
    return effort if effort in CLAUDE_EFFORTS else None


def messages_request(
    payload: dict[str, Any],
    model: str,
    effort: str | None = None,
    *,
    kept: dict[str, dict[str, Any]] | None = None,
    plain: bool = False,
    thinking: bool = True,
) -> dict[str, Any]:
    """The engine's Responses request as Claude's Messages request, always
    streamed. `plain`: without thinking, effort, format or the thinking
    blocks given back, for a model that refused them. `thinking`: whether
    the provider takes Claude's thinking settings (MiniMax thinks its own
    way)."""
    system, messages = messages_body(payload, None if plain else kept)
    tools = [
        {
            "name": tool["name"],
            "description": tool["description"],
            "input_schema": tool["parameters"],
        }
        for tool in function_tools(payload.get("tools"))
    ]
    _cache_points(system, messages, tools)
    length = payload.get("max_output_tokens")
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": min(length, MOST_TOKENS)
        if isinstance(length, int) and length > 0
        else DEFAULT_MAX_TOKENS,
        "messages": messages,
        "stream": True,
    }
    if system:
        body["system"] = system
    if tools:
        body["tools"] = tools
        choice = payload.get("tool_choice")
        body["tool_choice"] = {"type": "none" if choice == "none" else "auto"}
    if plain or not thinking:
        return body
    body["thinking"] = {"type": "adaptive", "display": "summarized"}
    config: dict[str, Any] = {}
    chosen = claude_effort(effort_of(payload, effort))
    if chosen is not None:
        config["effort"] = chosen
    text = payload.get("text")
    form = text.get("format") if isinstance(text, dict) else None
    if isinstance(form, dict) and form.get("type") == "json_schema":
        config["format"] = {"type": "json_schema", "schema": form.get("schema") or {}}
    if config:
        body["output_config"] = config
    return body


@dataclass
class _Block:
    kind: str
    thinking: str = ""
    signature: str = ""
    data: str = ""
    given: dict[str, Any] | None = None
    streamed: bool = False


@dataclass
class MessagesToResponses(ResponsesWriter):
    """Claude's Messages stream, read as it comes, written back as the
    Responses events the engine's SDK reads."""

    _buffer: str = ""
    _blocks_open: dict[int, _Block] | None = None
    _input: int = 0
    _cache_write: int = 0
    _cache_read: int = 0
    _output_tokens: int = 0

    def _open(self) -> dict[int, _Block]:
        if self._blocks_open is None:
            self._blocks_open = {}
        return self._blocks_open

    def _count(self, usage: Any) -> None:
        if not isinstance(usage, dict):
            return
        for key, name in (
            ("input_tokens", "_input"),
            ("cache_creation_input_tokens", "_cache_write"),
            ("cache_read_input_tokens", "_cache_read"),
            ("output_tokens", "_output_tokens"),
        ):
            value = usage.get(key)
            if isinstance(value, int) and value >= getattr(self, name):
                setattr(self, name, value)
        self.usage(
            responses_usage(
                self._input + self._cache_write + self._cache_read,
                self._output_tokens,
                self._cache_read,
            )
        )

    def _start_block(self, index: int, block: dict[str, Any]) -> list[bytes]:
        kind = str(block.get("type") or "")
        open_blocks = self._open()
        if kind == "tool_use":
            call_id = str(block.get("id") or "")
            open_blocks[index] = _Block(kind, given=block.get("input") or {})
            # A mark of where the call came, between the thinking blocks.
            self.keep_block({"type": "tool_use", "id": call_id})
            return self.open_call(index, call_id, str(block.get("name") or ""))
        if kind == "redacted_thinking":
            self.keep_block(
                {"type": "redacted_thinking", "data": block.get("data") or ""}
            )
            return self.start()
        open_blocks[index] = _Block(kind, thinking=str(block.get("thinking") or ""))
        out = self.start()
        if kind == "text":
            self.keep_block({"type": "text"})
            if block.get("text"):
                out += self.text(str(block["text"]))
        return out

    def _delta(self, index: int, delta: dict[str, Any]) -> list[bytes]:
        block = self._open().get(index)
        kind = delta.get("type")
        if kind == "text_delta" and isinstance(delta.get("text"), str):
            return self.text(delta["text"])
        if kind == "thinking_delta" and isinstance(delta.get("thinking"), str):
            if block is not None:
                block.thinking += delta["thinking"]
            return self.reasoning(delta["thinking"]) if delta["thinking"] else []
        if kind == "signature_delta" and block is not None:
            block.signature += str(delta.get("signature") or "")
            return []
        if kind == "input_json_delta" and isinstance(delta.get("partial_json"), str):
            if block is not None:
                block.streamed = True
            return self.call_arguments(index, delta["partial_json"])
        return []

    def _stop_block(self, index: int) -> list[bytes]:
        block = self._open().pop(index, None)
        if block is None:
            return []
        if block.kind == "tool_use":
            out: list[bytes] = []
            if not block.streamed and block.given:
                out += self.call_arguments(index, json.dumps(block.given))
            return out + self.close_call(index)
        if block.kind == "thinking":
            self.keep_block(
                {
                    "type": "thinking",
                    "thinking": block.thinking,
                    "signature": block.signature,
                }
            )
            return self.end_reasoning()
        return []

    def _event_of(self, event: dict[str, Any]) -> list[bytes]:
        kind = event.get("type")
        if kind == "message_start":
            message = event.get("message") or {}
            if isinstance(message.get("model"), str) and message["model"]:
                self.model = message["model"]
            if isinstance(message.get("id"), str) and message["id"]:
                self.response_id = f"resp_{message['id']}"[:80]
            self._count(message.get("usage"))
            return self.start()
        index = event.get("index")
        if kind == "content_block_start" and isinstance(index, int):
            return self._start_block(index, event.get("content_block") or {})
        if kind == "content_block_delta" and isinstance(index, int):
            return self._delta(index, event.get("delta") or {})
        if kind == "content_block_stop" and isinstance(index, int):
            return self._stop_block(index)
        if kind == "message_delta":
            delta = event.get("delta") or {}
            self.ended(delta.get("stop_reason"))
            self._count(event.get("usage"))
            return []
        if kind == "message_stop":
            return self.finish()
        if kind == "error":
            error = event.get("error") or {}
            return self.fail(
                str(error.get("type") or "api_error"),
                str(error.get("message") or "Claude refused."),
            )
        return []

    def feed(self, data: bytes) -> list[bytes]:
        if self._finished:
            return []
        self._buffer += data.decode("utf-8", errors="replace")
        out: list[bytes] = []
        while "\n" in self._buffer and not self._finished:
            line, self._buffer = self._buffer.split("\n", 1)
            out += self._line(line)
        return out

    def _line(self, line: str) -> list[bytes]:
        line = line.strip()
        if not line.startswith("data:"):
            return []
        try:
            event = json.loads(line[5:].strip())
        except ValueError:
            return []
        return self._event_of(event) if isinstance(event, dict) else []

    def finish(self) -> list[bytes]:
        out: list[bytes] = []
        if self._buffer.strip() and not self._finished:
            rest, self._buffer = self._buffer, ""
            out += self._line(rest)
        return out + super().finish()
