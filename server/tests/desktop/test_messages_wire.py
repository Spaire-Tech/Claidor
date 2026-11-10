"""The engine's Responses calls on Claude's Messages wire
(`simeon.desktop.messages_wire`): the request as Claude reads it, with its
prompt cache, and Claude's stream back as the Responses events
`@ai-sdk/openai` 1.3 parses."""

from __future__ import annotations

import json
from typing import Any

from simeon.desktop import messages_wire
from simeon.desktop.messages_wire import MessagesToResponses

CACHE = {"type": "ephemeral"}


def _sse(*events: dict[str, Any]) -> bytes:
    return "".join(
        f"event: {one['type']}\ndata: {json.dumps(one)}\n\n" for one in events
    ).encode()


def _events(raw: list[bytes]) -> list[dict[str, Any]]:
    out = []
    for piece in raw:
        _, data_line = piece.decode().strip().split("\n")
        out.append(json.loads(data_line.removeprefix("data: ")))
    return out


def _conversation() -> dict[str, Any]:
    return {
        "model": "own:anthropic:claude-opus-5-5",
        "input": [
            {"role": "developer", "content": "You are Nora."},
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": "What's this?"},
                    {"type": "input_image", "image_url": "data:image/png;base64,AAAA"},
                    {
                        "type": "input_file",
                        "filename": "plan.pdf",
                        "file_data": "data:application/pdf;base64,JVBE",
                    },
                ],
            },
            {
                "role": "assistant",
                "content": [{"type": "output_text", "text": "Checking."}],
            },
            {
                "type": "function_call",
                "call_id": "toolu_a",
                "name": "Weather",
                "arguments": '{"city":"Paris"}',
            },
            {
                "type": "function_call",
                "call_id": "call.b",
                "name": "Map",
                "arguments": "{}",
            },
            {"type": "function_call_output", "call_id": "toolu_a", "output": "Sunny"},
            {"type": "function_call_output", "call_id": "call.b", "output": ""},
            {"role": "system", "content": "The person went quiet."},
        ],
        "tools": [
            {
                "type": "function",
                "name": "Weather",
                "description": "The weather.",
                "parameters": {
                    "type": "object",
                    "properties": {"city": {"type": "string"}},
                },
                "strict": True,
            },
            {"type": "web_search_preview"},
        ],
        "tool_choice": "required",
        "max_output_tokens": 4000,
        "temperature": 0.2,
        "reasoning": {"effort": "medium"},
        "stream": True,
    }


class TestRequest:
    def test_as_claude_reads_it(self) -> None:
        body = messages_wire.messages_request(
            _conversation(), "claude-opus-5-5", "high"
        )

        assert body["model"] == "claude-opus-5-5"
        assert body["max_tokens"] == 4000
        assert body["stream"] is True
        # Claude 4.7 and later take only their own sampling.
        assert "temperature" not in body
        # The brief cached at its end, the tools with it.
        assert body["system"] == [
            {"type": "text", "text": "You are Nora.", "cache_control": CACHE}
        ]
        assert body["tools"] == [
            {
                "name": "Weather",
                "description": "The weather.",
                "input_schema": {
                    "type": "object",
                    "properties": {"city": {"type": "string"}},
                },
            }
        ]
        # Forced tool use is refused by Opus 5.5: Claude chooses.
        assert body["tool_choice"] == {"type": "auto"}
        assert body["thinking"] == {"type": "adaptive", "display": "summarized"}
        # The person's effort on the agent's real thinking.
        assert body["output_config"] == {"effort": "high"}
        user, assistant, answers = body["messages"]
        assert user == {
            "role": "user",
            "content": [
                {"type": "text", "text": "What's this?"},
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": "AAAA",
                    },
                },
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": "JVBE",
                    },
                    "title": "plan.pdf",
                },
            ],
        }
        # Words and calls as one turn; an id Claude can't take, made one.
        assert assistant == {
            "role": "assistant",
            "content": [
                {"type": "text", "text": "Checking."},
                {
                    "type": "tool_use",
                    "id": "toolu_a",
                    "name": "Weather",
                    "input": {"city": "Paris"},
                },
                {"type": "tool_use", "id": "call_b", "name": "Map", "input": {}},
            ],
        }
        # The answers first in the next turn, the late brief after them,
        # and the conversation's end cached.
        assert answers == {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": "toolu_a", "content": "Sunny"},
                {"type": "tool_result", "tool_use_id": "call_b"},
                {
                    "type": "text",
                    "text": "<system-reminder>\nThe person went quiet.\n</system-reminder>",
                    "cache_control": CACHE,
                },
            ],
        }

    def test_the_machinery_stays_quick(self) -> None:
        quick = {"input": "Title this.", "reasoning": {"effort": "none"}}

        body = messages_wire.messages_request(quick, "claude-haiku-5-5", "max")

        assert body["output_config"] == {"effort": "low"}
        assert body["max_tokens"] == messages_wire.DEFAULT_MAX_TOKENS
        assert body["messages"] == [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Title this.", "cache_control": CACHE}
                ],
            }
        ]
        assert "tools" not in body

    def test_plain_and_without_thinking(self) -> None:
        plain = messages_wire.messages_request(_conversation(), "m", "high", plain=True)
        minimax = messages_wire.messages_request(
            _conversation(), "m", "high", thinking=False
        )

        for body in (plain, minimax):
            assert "thinking" not in body
            assert "output_config" not in body

    def test_a_format(self) -> None:
        payload = {
            "input": "List three.",
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "x",
                    "schema": {"type": "object"},
                }
            },
        }

        body = messages_wire.messages_request(payload, "m")

        assert body["output_config"] == {
            "format": {"type": "json_schema", "schema": {"type": "object"}}
        }


class TestStream:
    def _answer(self) -> list[dict[str, Any]]:
        return [
            {
                "type": "message_start",
                "message": {
                    "id": "msg_1",
                    "model": "claude-opus-5-5",
                    "usage": {
                        "input_tokens": 10,
                        "cache_creation_input_tokens": 200,
                        "cache_read_input_tokens": 5000,
                        "output_tokens": 1,
                    },
                },
            },
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "thinking", "thinking": "", "signature": ""},
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "thinking_delta", "thinking": "Weather "},
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "thinking_delta", "thinking": "first."},
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "signature_delta", "signature": "c2ln"},
            },
            {"type": "content_block_stop", "index": 0},
            {"type": "ping"},
            {
                "type": "content_block_start",
                "index": 1,
                "content_block": {"type": "text", "text": ""},
            },
            {
                "type": "content_block_delta",
                "index": 1,
                "delta": {"type": "text_delta", "text": "Checking."},
            },
            {"type": "content_block_stop", "index": 1},
            {
                "type": "content_block_start",
                "index": 2,
                "content_block": {
                    "type": "tool_use",
                    "id": "toolu_a",
                    "name": "Weather",
                    "input": {},
                },
            },
            {
                "type": "content_block_delta",
                "index": 2,
                "delta": {"type": "input_json_delta", "partial_json": '{"city":'},
            },
            {
                "type": "content_block_delta",
                "index": 2,
                "delta": {"type": "input_json_delta", "partial_json": '"Paris"}'},
            },
            {"type": "content_block_stop", "index": 2},
            {
                "type": "message_delta",
                "delta": {"stop_reason": "tool_use"},
                "usage": {"output_tokens": 42},
            },
            {"type": "message_stop"},
        ]

    def test_thinking_words_and_a_call(self) -> None:
        reader = MessagesToResponses(model="claude-opus-5-5")
        events = _events(reader.feed(_sse(*self._answer())) + reader.finish())

        kinds = [one["type"] for one in events]
        assert kinds[0] == "response.created"
        assert events[0]["response"]["id"] == "resp_msg_1"
        assert [
            one["delta"] for one in events if one["type"].endswith("summary_text.delta")
        ] == [
            "Weather ",
            "first.",
        ]
        assert [
            one["delta"]
            for one in events
            if one["type"] == "response.output_text.delta"
        ] == ["Checking."]
        args = [
            one["delta"] for one in events if one["type"].endswith("arguments.delta")
        ]
        assert "".join(args) == '{"city":"Paris"}'
        call = next(
            one["item"]
            for one in events
            if one["type"] == "response.output_item.done"
            and one["item"]["type"] == "function_call"
        )
        assert call["call_id"] == "toolu_a"
        assert call["arguments"] == '{"city":"Paris"}'
        assert kinds.count("response.completed") == 1
        done = events[-1]["response"]
        assert [one["type"] for one in done["output"]] == [
            "reasoning",
            "message",
            "function_call",
        ]
        # Input counts the cached, as on the Responses wire.
        assert done["usage"]["input_tokens"] == 5210
        assert done["usage"]["input_tokens_details"] == {"cached_tokens": 5000}
        assert done["usage"]["output_tokens"] == 42

    def test_the_thinking_kept_and_given_back_where_it_came(self) -> None:
        reader = MessagesToResponses(model="claude-opus-5-5")
        reader.feed(_sse(*self._answer()))
        reader.finish()

        kept = reader.kept()
        blocks = kept["toolu_a"]["blocks"]
        assert blocks == [
            {"type": "thinking", "thinking": "Weather first.", "signature": "c2ln"},
            {"type": "text"},
            {"type": "tool_use", "id": "toolu_a"},
        ]
        # The next call carries the engine's copy of that turn: Claude's
        # block goes back first, as it came, the turn's words and call after.
        payload = {
            "input": [
                {"role": "user", "content": "Weather?"},
                {
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "Checking."}],
                },
                {
                    "type": "function_call",
                    "call_id": "toolu_a",
                    "name": "Weather",
                    "arguments": '{"city":"Paris"}',
                },
                {
                    "type": "function_call_output",
                    "call_id": "toolu_a",
                    "output": "Sunny",
                },
            ]
        }
        body = messages_wire.messages_request(payload, "claude-opus-5-5", kept=kept)

        assert body["messages"][1]["content"] == [
            {"type": "thinking", "thinking": "Weather first.", "signature": "c2ln"},
            {"type": "text", "text": "Checking."},
            {
                "type": "tool_use",
                "id": "toolu_a",
                "name": "Weather",
                "input": {"city": "Paris"},
            },
        ]
        plain = messages_wire.messages_request(payload, "m", kept=kept, plain=True)
        assert plain["messages"][1]["content"][0]["type"] == "text"

    def test_cut_short_and_refused(self) -> None:
        for stop, reason in (
            ("max_tokens", "max_output_tokens"),
            ("refusal", "content_filter"),
        ):
            reader = MessagesToResponses(model="m")
            events = _events(
                reader.feed(
                    _sse(
                        {
                            "type": "message_start",
                            "message": {"id": "msg_2", "usage": {}},
                        },
                        {
                            "type": "message_delta",
                            "delta": {"stop_reason": stop},
                            "usage": {},
                        },
                        {"type": "message_stop"},
                    )
                )
            )

            assert events[-1]["type"] == "response.incomplete"
            assert events[-1]["response"]["incomplete_details"] == {"reason": reason}

    def test_an_error_in_the_stream(self) -> None:
        reader = MessagesToResponses(model="m")
        events = _events(
            reader.feed(
                _sse(
                    {"type": "message_start", "message": {"id": "msg_3", "usage": {}}},
                    {
                        "type": "error",
                        "error": {"type": "overloaded_error", "message": "Overloaded"},
                    },
                )
            )
            + reader.finish()
        )

        assert [one["type"] for one in events] == ["response.created", "error"]
        assert events[1]["code"] == "overloaded_error"
        assert reader.final is None

    def test_a_call_given_whole(self) -> None:
        reader = MessagesToResponses(model="m")
        events = _events(
            reader.feed(
                _sse(
                    {"type": "message_start", "message": {"id": "msg_4", "usage": {}}},
                    {
                        "type": "content_block_start",
                        "index": 0,
                        "content_block": {
                            "type": "tool_use",
                            "id": "toolu_b",
                            "name": "Now",
                            "input": {"zone": "Paris"},
                        },
                    },
                    {"type": "content_block_stop", "index": 0},
                    {"type": "message_stop"},
                )
            )
        )

        call = next(
            one["item"] for one in events if one["type"] == "response.output_item.done"
        )
        assert call["arguments"] == '{"zone": "Paris"}'

    def test_redacted_thinking_is_kept(self) -> None:
        reader = MessagesToResponses(model="m")
        reader.feed(
            _sse(
                {"type": "message_start", "message": {"id": "msg_5", "usage": {}}},
                {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {"type": "redacted_thinking", "data": "b3BhcXVl"},
                },
                {"type": "content_block_stop", "index": 0},
                {
                    "type": "content_block_start",
                    "index": 1,
                    "content_block": {
                        "type": "tool_use",
                        "id": "toolu_c",
                        "name": "A",
                        "input": {},
                    },
                },
                {"type": "content_block_stop", "index": 1},
                {"type": "message_stop"},
            )
        )

        assert reader.kept()["toolu_c"]["blocks"][0] == {
            "type": "redacted_thinking",
            "data": "b3BhcXVl",
        }
