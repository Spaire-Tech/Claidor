"""The engine's Responses calls on a Chat Completions provider (10 November
2026).

The engine writes every call on OpenAI's Responses wire (`@ai-sdk/openai`
1.3, `provider-session.ts`, a model's wire chosen by its name). Most of the
providers a person can bring a key for speak only OpenAI's older Chat
Completions (DeepSeek, Groq, Mistral, Together, Fireworks, Cerebras…). So
the relay writes the engine's request as a Chat Completions one
(`chat_request`) and the provider's answer back as the Responses events the
engine's SDK reads (`ChatToResponses`), the shapes read from
`@ai-sdk/openai` 1.3.24's own parser (`openaiResponsesChunkSchema`) and
checked against it (`ResponsesWriter`):

- `response.created` (`id`, `created_at`, `model`);
- a text item: `response.output_item.added` (`message`), then
  `response.output_text.delta`, then `response.output_item.done`;
- a tool call: `response.output_item.added` (`function_call`, `id`,
  `call_id`, `name`, `arguments: ""`), its `response.function_call_arguments.
  delta`s, then `response.output_item.done` with the whole call and
  `status: "completed"`;
- what the model thought, where the provider sends it
  (`reasoning_content` or `reasoning`): `response.reasoning_summary_text.
  delta`;
- `response.completed`, or `response.incomplete` cut at the length, with
  the usage (`input_tokens`, `output_tokens`, cached and reasoning tokens).

What the engine sends on the Responses wire (`convertToOpenAIResponses
Messages`): the brief as a `system` or `developer` message, the person's
words as `input_text` and `input_image` (and `input_file`, a PDF),
assistant text as `output_text`, a tool call as a `function_call` item and
its answer as a `function_call_output` one.

**What the engine can't carry back.** Some providers want something of
their own back with a tool call on the next call: DeepSeek, Kimi, MiniMax,
Xiaomi and GLM what the model thought (`reasoning_content`), Gemini a
signature on each call (`extra_content`), Claude its thinking blocks. The
engine's Responses wire drops all of it. So the writer gives it, by call id
(`ResponsesWriter.kept`); the relay keeps it a few hours and hands it back
(`kept=`) when the same calls come again.
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ChatDialect:
    """What one provider's Chat Completions takes, where they differ."""

    #: `reasoning_effort` from the agent's effort, where the provider reads it.
    effort: bool = False
    #: `stream_options: {include_usage: true}`, so the last chunk says the usage.
    stream_usage: bool = True
    #: The field the answer's length goes in.
    max_tokens_field: str = "max_tokens"
    #: Pictures in the person's words, where its models read them.
    images: bool = True
    #: A brief after the conversation started written as the person's words
    #: (`<system>…</system>`), for a provider that takes one brief, first.
    late_system_as_user: bool = False
    #: What the model thought, sent back with its tool calls
    #: (`reasoning_content`), for the providers that want it in a tool loop.
    reasoning_back: bool = False
    #: Each call's own `extra_content` sent back (Gemini's signatures).
    call_extras: bool = False


def _text_of(content: Any) -> str:
    """The words of a Responses content (a string, or its text parts)."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    words = []
    for part in content:
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            words.append(part["text"])
    return "\n".join(words)


_NO_PICTURE = "(A picture was here; this model can't see it.)"


def _no_file(name: str) -> str:
    return f"({name} was attached here; this model can't read files.)"


def _user_content(content: Any, dialect: ChatDialect) -> Any:
    """The person's words as Chat takes them: a plain string when it is only
    text (some providers take nothing else), else parts with the pictures."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[dict[str, Any]] = []
    for part in content:
        if not isinstance(part, dict):
            continue
        kind = part.get("type")
        if kind in ("input_text", "text", "output_text") and isinstance(
            part.get("text"), str
        ):
            parts.append({"type": "text", "text": part["text"]})
        elif kind == "input_image" and dialect.images:
            url = part.get("image_url")
            if isinstance(url, dict):
                url = url.get("url")
            if isinstance(url, str) and url:
                parts.append({"type": "image_url", "image_url": {"url": url}})
        elif kind == "input_image":
            parts.append({"type": "text", "text": _NO_PICTURE})
        elif kind == "input_file":
            name = part.get("filename") or "a file"
            parts.append({"type": "text", "text": _no_file(str(name))})
    if all(one["type"] == "text" for one in parts):
        return "\n".join(one["text"] for one in parts)
    return parts


def tool_output(output: Any) -> str:
    """A tool's answer as one string, whatever shape the engine gave it."""
    if isinstance(output, str):
        return output
    if isinstance(output, list):
        return _text_of(output)
    return json.dumps(output)


def call_arguments(item: dict[str, Any]) -> str:
    arguments = item.get("arguments")
    return arguments if isinstance(arguments, str) else json.dumps(arguments or {})


def call_ids(payload: dict[str, Any]) -> list[str]:
    """The ids of the tool calls a Responses request carries back, in order:
    what to look up in what the relay kept (`ResponsesWriter.kept`)."""
    items = payload.get("input")
    out: list[str] = []
    for item in items if isinstance(items, list) else []:
        if isinstance(item, dict) and item.get("type") == "function_call":
            call_id = item.get("call_id")
            if isinstance(call_id, str) and call_id and call_id not in out:
                out.append(call_id)
    return out


def chat_messages(
    payload: dict[str, Any],
    dialect: ChatDialect,
    kept: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """The conversation of a Responses request as Chat messages; `kept`, what
    the provider wanted back with its earlier calls, by call id."""
    messages: list[dict[str, Any]] = []
    instructions = payload.get("instructions")
    if isinstance(instructions, str) and instructions.strip():
        messages.append({"role": "system", "content": instructions})
    raw = payload.get("input")
    items = [{"role": "user", "content": raw}] if isinstance(raw, str) else raw
    started = False
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        role = item.get("role")
        if kind == "function_call":
            call = {
                "id": str(item.get("call_id") or item.get("id") or _new_id("call")),
                "type": "function",
                "function": {
                    "name": str(item.get("name") or ""),
                    "arguments": call_arguments(item),
                },
            }
            # A call goes on the assistant turn just before it (its words, or
            # the calls made alongside); Chat says them as one turn.
            last = messages[-1] if messages else None
            if last is not None and last.get("role") == "assistant":
                last.setdefault("tool_calls", []).append(call)
            else:
                messages.append(
                    {"role": "assistant", "content": None, "tool_calls": [call]}
                )
            started = True
        elif kind == "function_call_output":
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": str(item.get("call_id") or ""),
                    "content": tool_output(item.get("output")),
                }
            )
            started = True
        elif kind in ("reasoning", "item_reference", "web_search_call"):
            # Kept by the Responses wire only; Chat has no place for them.
            continue
        elif role in ("system", "developer"):
            words = _text_of(item.get("content"))
            if not words.strip():
                continue
            if started and dialect.late_system_as_user:
                messages.append(
                    {"role": "user", "content": f"<system>\n{words}\n</system>"}
                )
            else:
                messages.append({"role": "system", "content": words})
        elif role == "assistant":
            words = _text_of(item.get("content"))
            messages.append({"role": "assistant", "content": words or None})
            started = True
        elif role == "user" or kind == "message":
            messages.append(
                {"role": "user", "content": _user_content(item.get("content"), dialect)}
            )
            started = True
    # An assistant turn with neither words nor calls is refused by the strict
    # providers (Mistral, Groq), and says nothing anyway.
    kept_messages = [
        one
        for one in messages
        if one["role"] != "assistant" or one.get("content") or one.get("tool_calls")
    ]
    if kept:
        _give_back(kept_messages, kept, dialect)
    return _merged_systems(kept_messages)


def _give_back(
    messages: list[dict[str, Any]],
    kept: dict[str, dict[str, Any]],
    dialect: ChatDialect,
) -> None:
    """What the provider wanted back with each of its calls, on the turn
    that made them."""
    for message in messages:
        calls = message.get("tool_calls") or []
        if message["role"] != "assistant" or not calls:
            continue
        found = [kept.get(call["id"]) or {} for call in calls]
        thought = next(
            (
                one["reasoning"]
                for one in found
                if isinstance(one.get("reasoning"), str)
            ),
            None,
        )
        if dialect.reasoning_back and thought:
            message["reasoning_content"] = thought
        if dialect.call_extras:
            for call, one in zip(calls, found, strict=True):
                if isinstance(one.get("extra"), dict):
                    call["extra_content"] = one["extra"]


def _merged_systems(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The briefs before the conversation as one, first."""
    head = []
    rest = list(messages)
    while rest and rest[0].get("role") == "system":
        head.append(rest.pop(0)["content"])
    if not head:
        return rest
    return [{"role": "system", "content": "\n\n".join(head)}, *rest]


def function_tools(tools: Any) -> list[dict[str, Any]]:
    """The engine's function tools (name, description, parameters): Chat and
    Claude have no web search or code tools of their own."""
    out = []
    for tool in tools if isinstance(tools, list) else []:
        if not isinstance(tool, dict) or tool.get("type") != "function":
            continue
        if not isinstance(tool.get("name"), str) or not tool["name"]:
            continue
        out.append(
            {
                "name": tool["name"],
                "description": tool.get("description") or "",
                "parameters": tool.get("parameters")
                or {"type": "object", "properties": {}},
            }
        )
    return out


def _chat_tools(tools: Any) -> list[dict[str, Any]]:
    out = []
    for tool in function_tools(tools):
        function: dict[str, Any] = {"name": tool["name"]}
        if tool["description"]:
            function["description"] = tool["description"]
        function["parameters"] = tool["parameters"]
        out.append({"type": "function", "function": function})
    return out


def _tool_choice(choice: Any) -> Any:
    if isinstance(choice, str) and choice in ("auto", "none", "required"):
        return choice
    if isinstance(choice, dict) and choice.get("type") == "function":
        return {"type": "function", "function": {"name": choice.get("name")}}
    return None


_EFFORTS = {
    "none": "low",
    "minimal": "low",
    "low": "low",
    "medium": "medium",
    "high": "high",
    "xhigh": "high",
    "max": "high",
}
#: The engine's own efforts for its machinery: a title, a summary. The
#: person's effort never replaces those.
QUICK_EFFORTS = frozenset({"none", "minimal", "low"})


def effort_of(payload: dict[str, Any], chosen: str | None) -> str | None:
    """How hard the model thinks: the person's effort for the agent's real
    thinking, the engine's own for its machinery; None when neither says."""
    reasoning = payload.get("reasoning")
    asked = reasoning.get("effort") if isinstance(reasoning, dict) else None
    if chosen is not None and asked not in QUICK_EFFORTS:
        return chosen
    return asked if isinstance(asked, str) else None


def chat_request(
    payload: dict[str, Any],
    model: str,
    dialect: ChatDialect,
    effort: str | None = None,
    *,
    kept: dict[str, dict[str, Any]] | None = None,
    plain: bool = False,
) -> dict[str, Any]:
    """The engine's Responses request as a Chat Completions one, always
    streamed (an answer the engine wanted whole is built from the stream).
    `plain`: only what every provider takes, for one that refused the rest
    (no effort, usage option, answer format, pictures or kept thoughts)."""
    if plain:
        dialect = ChatDialect(
            max_tokens_field=dialect.max_tokens_field,
            images=False,
            late_system_as_user=dialect.late_system_as_user,
            stream_usage=False,
        )
    body: dict[str, Any] = {
        "model": model,
        "messages": chat_messages(payload, dialect, None if plain else kept),
        "stream": True,
    }
    if dialect.stream_usage:
        body["stream_options"] = {"include_usage": True}
    tools = _chat_tools(payload.get("tools"))
    if tools:
        body["tools"] = tools
        choice = _tool_choice(payload.get("tool_choice"))
        if choice is not None:
            body["tool_choice"] = choice
    length = payload.get("max_output_tokens")
    if isinstance(length, int) and length > 0:
        body[dialect.max_tokens_field] = length
    for key in ("temperature", "top_p"):
        value = payload.get(key)
        if isinstance(value, int | float) and not isinstance(value, bool):
            body[key] = value
    chosen = effort_of(payload, effort)
    if dialect.effort and chosen in _EFFORTS:
        body["reasoning_effort"] = _EFFORTS[chosen]
    text = payload.get("text")
    form = text.get("format") if isinstance(text, dict) else None
    if plain:
        form = None
    if isinstance(form, dict) and form.get("type") == "json_schema":
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": form.get("name") or "answer",
                "schema": form.get("schema") or {},
                "strict": bool(form.get("strict", False)),
            },
        }
    elif isinstance(form, dict) and form.get("type") == "json_object":
        body["response_format"] = {"type": "json_object"}
    return body


# --- the answer, back on the Responses wire ---------------------------------


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


def responses_usage(
    input_tokens: Any,
    output_tokens: Any,
    cached: Any = None,
    reasoning: Any = None,
) -> dict[str, Any]:
    """The usage as the Responses wire says it (input counts the cached)."""
    taken = input_tokens if isinstance(input_tokens, int) else 0
    given = output_tokens if isinstance(output_tokens, int) else 0
    return {
        "input_tokens": taken,
        "input_tokens_details": {
            "cached_tokens": cached if isinstance(cached, int) else 0
        },
        "output_tokens": given,
        "output_tokens_details": {
            "reasoning_tokens": reasoning if isinstance(reasoning, int) else 0
        },
        "total_tokens": taken + given,
    }


def _chat_usage(chat: Any) -> dict[str, Any]:
    usage = chat if isinstance(chat, dict) else {}
    cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens")
    if cached is None:
        # DeepSeek's own spelling.
        cached = usage.get("prompt_cache_hit_tokens")
    return responses_usage(
        usage.get("prompt_tokens"),
        usage.get("completion_tokens"),
        cached,
        (usage.get("completion_tokens_details") or {}).get("reasoning_tokens"),
    )


#: How an answer ended, as the Responses wire says it: completed, or cut
#: short and why.
_ENDINGS: dict[str, tuple[str, dict[str, str] | None]] = {
    "length": ("incomplete", {"reason": "max_output_tokens"}),
    "max_tokens": ("incomplete", {"reason": "max_output_tokens"}),
    "content_filter": ("incomplete", {"reason": "content_filter"}),
    "refusal": ("incomplete", {"reason": "content_filter"}),
}


def _ending(finish_reason: Any) -> tuple[str, dict[str, str] | None]:
    if isinstance(finish_reason, str) and finish_reason in _ENDINGS:
        return _ENDINGS[finish_reason]
    return "completed", None


@dataclass
class _Call:
    output_index: int
    item_id: str
    call_id: str
    name: str
    arguments: str = ""
    #: What the provider wants back with this call (Gemini's signature).
    extra: dict[str, Any] | None = None


@dataclass
class ResponsesWriter:
    """The Responses events the engine's SDK reads, written as a provider's
    answer comes in: a reader for each wire (`ChatToResponses`, the Claude
    one in `messages_wire`) says what came, this writes it. `finish` closes
    what is open and says the answer is done (once, however it ended)."""

    model: str
    response_id: str = field(default_factory=lambda: _new_id("resp"))
    created_at: int = field(default_factory=lambda: int(time.time()))
    #: A refusal said in the stream, passed on.
    error: dict[str, Any] | None = None
    #: The whole answer once `finish` has run, for a call the engine wanted
    #: whole (`stream: false`): the relay reads the stream, then gives this.
    final: dict[str, Any] | None = None
    _sequence: int = 0
    _started: bool = False
    _finished: bool = False
    _output: list[dict[str, Any]] = field(default_factory=list)
    _text_item: dict[str, Any] | None = None
    _text: str = ""
    _reasoning_item: dict[str, Any] | None = None
    _reasoning: str = ""
    #: Every word thought in the answer, for the turn's calls (`kept`).
    _thought: str = ""
    #: The provider's own thinking blocks, signatures and all (Claude's).
    _blocks: list[dict[str, Any]] = field(default_factory=list)
    _calls: dict[Any, _Call] = field(default_factory=dict)
    _made: list[_Call] = field(default_factory=list)
    _finish_reason: str | None = None
    _usage: dict[str, Any] | None = None

    def feed(self, data: bytes) -> list[bytes]:
        """The events for the provider's next bytes: each wire's reader."""
        raise NotImplementedError

    def _event(self, kind: str, **fields: Any) -> bytes:
        self._sequence += 1
        body = {"type": kind, "sequence_number": self._sequence, **fields}
        return f"event: {kind}\ndata: {json.dumps(body)}\n\n".encode()

    def _response(self, status: str, **extra: Any) -> dict[str, Any]:
        return {
            "id": self.response_id,
            "object": "response",
            "created_at": self.created_at,
            "model": self.model,
            "status": status,
            "output": [one for one in self._output if one],
            **extra,
        }

    def start(self) -> list[bytes]:
        if self._started:
            return []
        self._started = True
        return [self._event("response.created", response=self._response("in_progress"))]

    def _close_reasoning(self) -> list[bytes]:
        item = self._reasoning_item
        if item is None:
            return []
        self._reasoning_item = None
        index = item["_index"]
        done = {
            "id": item["id"],
            "type": "reasoning",
            "summary": [{"type": "summary_text", "text": self._reasoning}],
        }
        self._output[index] = done
        self._reasoning = ""
        return [self._event("response.output_item.done", output_index=index, item=done)]

    def _close_text(self) -> list[bytes]:
        item = self._text_item
        if item is None:
            return []
        self._text_item = None
        index = item["_index"]
        done = {
            "id": item["id"],
            "type": "message",
            "role": "assistant",
            "status": "completed",
            "content": [{"type": "output_text", "text": self._text, "annotations": []}],
        }
        self._output[index] = done
        self._text = ""
        return [
            self._event(
                "response.output_text.done",
                item_id=item["id"],
                output_index=index,
                content_index=0,
                text=done["content"][0]["text"],
            ),
            self._event(
                "response.content_part.done",
                item_id=item["id"],
                output_index=index,
                content_index=0,
                part=done["content"][0],
            ),
            self._event("response.output_item.done", output_index=index, item=done),
        ]

    def _close_calls(self) -> list[bytes]:
        out: list[bytes] = []
        for key in list(self._calls):
            call = self._calls.pop(key)
            item = {
                "id": call.item_id,
                "type": "function_call",
                "call_id": call.call_id,
                "name": call.name,
                "arguments": call.arguments or "{}",
                "status": "completed",
            }
            self._output[call.output_index] = item
            out.append(
                self._event(
                    "response.function_call_arguments.done",
                    item_id=call.item_id,
                    output_index=call.output_index,
                    arguments=item["arguments"],
                )
            )
            out.append(
                self._event(
                    "response.output_item.done",
                    output_index=call.output_index,
                    item=item,
                )
            )
        return out

    def reasoning(self, words: str) -> list[bytes]:
        """Words the model thought."""
        out = self.start()
        if self._reasoning_item is None:
            index = len(self._output)
            self._reasoning_item = {"id": _new_id("rs"), "_index": index}
            item = {
                "id": self._reasoning_item["id"],
                "type": "reasoning",
                "summary": [],
            }
            self._output.append(item)
            out.append(
                self._event("response.output_item.added", output_index=index, item=item)
            )
        self._reasoning += words
        self._thought += words
        out.append(
            self._event(
                "response.reasoning_summary_text.delta",
                item_id=self._reasoning_item["id"],
                output_index=self._reasoning_item["_index"],
                summary_index=0,
                delta=words,
            )
        )
        return out

    def end_reasoning(self) -> list[bytes]:
        """The thought is over (Claude says so; Chat by moving on)."""
        return self._close_reasoning()

    def keep_block(self, block: dict[str, Any]) -> None:
        """One of the provider's thinking blocks, to give back as it came."""
        self._blocks.append(block)

    def text(self, words: str) -> list[bytes]:
        """Words of the answer."""
        out = self.start() + self._close_reasoning()
        if self._text_item is None:
            index = len(self._output)
            self._text_item = {"id": _new_id("msg"), "_index": index}
            item = {
                "id": self._text_item["id"],
                "type": "message",
                "role": "assistant",
                "status": "in_progress",
                "content": [],
            }
            self._output.append(item)
            out.append(
                self._event("response.output_item.added", output_index=index, item=item)
            )
            out.append(
                self._event(
                    "response.content_part.added",
                    item_id=item["id"],
                    output_index=index,
                    content_index=0,
                    part={"type": "output_text", "text": "", "annotations": []},
                )
            )
        self._text += words
        out.append(
            self._event(
                "response.output_text.delta",
                item_id=self._text_item["id"],
                output_index=self._text_item["_index"],
                content_index=0,
                delta=words,
            )
        )
        return out

    def has_call(self, key: Any) -> bool:
        return key in self._calls

    def open_call(self, key: Any, call_id: str | None, name: str) -> list[bytes]:
        """A tool call starts; `key` is the reader's own name for it."""
        out = self.start() + self._close_reasoning() + self._close_text()
        output_index = len(self._output)
        call = _Call(
            output_index=output_index,
            item_id=_new_id("fc"),
            call_id=call_id or _new_id("call"),
            name=name,
        )
        self._calls[key] = call
        self._made.append(call)
        self._output.append({})
        out.append(
            self._event(
                "response.output_item.added",
                output_index=output_index,
                item={
                    "id": call.item_id,
                    "type": "function_call",
                    "call_id": call.call_id,
                    "name": call.name,
                    "arguments": "",
                    "status": "in_progress",
                },
            )
        )
        return out

    def name_call(self, key: Any, name: str) -> None:
        call = self._calls.get(key)
        if call is not None and not call.name:
            call.name = name

    def call_extra(self, key: Any, extra: dict[str, Any]) -> None:
        call = self._calls.get(key)
        if call is not None:
            call.extra = extra

    def call_arguments(self, key: Any, piece: str) -> list[bytes]:
        call = self._calls.get(key)
        if call is None or not piece:
            return []
        call.arguments += piece
        return [
            self._event(
                "response.function_call_arguments.delta",
                item_id=call.item_id,
                output_index=call.output_index,
                delta=piece,
            )
        ]

    def close_call(self, key: Any) -> list[bytes]:
        """One call is whole (Claude says so; Chat closes all at the end)."""
        call = self._calls.get(key)
        if call is None:
            return []
        rest = {k: v for k, v in self._calls.items() if k != key}
        self._calls = {key: call}
        out = self._close_calls()
        self._calls = rest
        return out

    def ended(self, finish_reason: str | None) -> None:
        if finish_reason:
            self._finish_reason = finish_reason

    def usage(self, usage: dict[str, Any]) -> None:
        """The usage as the Responses wire says it (`responses_usage`)."""
        self._usage = usage

    def fail(self, code: str, message: str) -> list[bytes]:
        """A refusal in the stream: said once, and the answer ends there."""
        out = self.start()
        if self.error is None:
            self.error = {"code": code, "message": message}
            out.append(self._event("error", code=code, message=message))
        return out

    def finish(self) -> list[bytes]:
        """Closes what is open and says the answer is done; nothing twice."""
        if self._finished:
            return []
        self._finished = True
        if self.error is not None:
            return []
        out = self.start() + self._close_reasoning() + self._close_text()
        out += self._close_calls()
        status, incomplete = _ending(self._finish_reason)
        kind = "response.completed" if status == "completed" else "response.incomplete"
        self.final = self._response(
            status,
            incomplete_details=incomplete,
            usage=self._usage or responses_usage(0, 0),
        )
        out.append(self._event(kind, response=self.final))
        return out

    def kept(self) -> dict[str, dict[str, Any]]:
        """What the provider wants back with this answer's calls, by call id:
        what it thought (`reasoning`), its thinking blocks (`blocks`), each
        call's own extra (`extra`). Empty when it wants nothing."""
        if not self._made:
            return {}
        # Claude's blocks, with the marks of its words and calls between
        # them, only when it thought: the marks alone say nothing.
        thought_blocks = any(
            one.get("type") in ("thinking", "redacted_thinking") for one in self._blocks
        )
        out: dict[str, dict[str, Any]] = {}
        for call in self._made:
            one: dict[str, Any] = {}
            if self._thought:
                one["reasoning"] = self._thought
            if thought_blocks:
                one["blocks"] = self._blocks
            if call.extra:
                one["extra"] = call.extra
            if one:
                out[call.call_id] = one
        return out


@dataclass
class ChatToResponses(ResponsesWriter):
    """A Chat Completions stream, read as it comes, written back as the
    Responses events the engine's SDK reads. `feed` takes the provider's
    bytes and gives the events' bytes; `finish` ends it."""

    _buffer: str = ""
    _named: bool = False

    def _call_key(self, piece: dict[str, Any]) -> int:
        """Which call a piece is of: its `index`, or for a provider that
        names none, a new id is a new call and no id the call before."""
        index = piece.get("index")
        if isinstance(index, int):
            return index
        given = piece.get("id")
        for key, call in self._calls.items():
            if given and call.call_id == given:
                return int(key)
        if not given and self._calls:
            return int(max(self._calls))
        return len(self._made)

    def _call_piece(self, piece: dict[str, Any]) -> list[bytes]:
        function = piece.get("function") or {}
        key = self._call_key(piece)
        out: list[bytes] = []
        if not self.has_call(key):
            given = piece.get("id")
            out += self.open_call(
                key, str(given) if given else None, str(function.get("name") or "")
            )
        elif function.get("name"):
            self.name_call(key, str(function["name"]))
        extra = piece.get("extra_content")
        if isinstance(extra, dict):
            self.call_extra(key, extra)
        arguments = function.get("arguments")
        if isinstance(arguments, dict):
            arguments = json.dumps(arguments)
        if isinstance(arguments, str):
            out += self.call_arguments(key, arguments)
        return out

    def _chunk(self, chunk: dict[str, Any]) -> list[bytes]:
        error = chunk.get("error")
        if isinstance(error, dict | str):
            said = error if isinstance(error, dict) else {"message": error}
            return self.fail(
                str(said.get("code") or said.get("type") or "provider_error"),
                str(said.get("message") or "The provider refused."),
            )
        if not self._named:
            self._named = True
            if isinstance(chunk.get("model"), str) and chunk["model"]:
                self.model = chunk["model"]
            if isinstance(chunk.get("id"), str) and chunk["id"]:
                self.response_id = f"resp_{chunk['id']}"[:80]
        if isinstance(chunk.get("usage"), dict):
            self.usage(_chat_usage(chunk["usage"]))
        out: list[bytes] = []
        for choice in chunk.get("choices") or []:
            if not isinstance(choice, dict):
                continue
            delta = choice.get("delta") or choice.get("message") or {}
            thought = delta.get("reasoning_content") or delta.get("reasoning")
            if isinstance(thought, str) and thought:
                out += self.reasoning(thought)
            words = delta.get("content")
            if isinstance(words, str) and words:
                out += self.text(words)
            for piece in delta.get("tool_calls") or []:
                if isinstance(piece, dict):
                    out += self._call_piece(piece)
            if choice.get("finish_reason"):
                self.ended(str(choice["finish_reason"]))
        return out or self.start()

    def feed(self, data: bytes) -> list[bytes]:
        """The events for the provider's next bytes."""
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
        body = line[5:].strip()
        if not body:
            return []
        if body == "[DONE]":
            return self.finish()
        try:
            chunk = json.loads(body)
        except ValueError:
            return []
        return self._chunk(chunk) if isinstance(chunk, dict) else []

    def finish(self) -> list[bytes]:
        out: list[bytes] = []
        if self._buffer.strip() and not self._finished:
            # The last line, sent without its newline.
            rest, self._buffer = self._buffer, ""
            out += self._line(rest)
        return out + super().finish()
