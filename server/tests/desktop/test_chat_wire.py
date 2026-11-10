"""The engine's Responses calls on a Chat Completions provider
(`simeon.desktop.chat_wire`): the request written for Chat, and the Chat
answer read back as the Responses events `@ai-sdk/openai` 1.3 parses."""

from __future__ import annotations

import json
from typing import Any

from simeon.desktop import chat_wire
from simeon.desktop.chat_wire import ChatDialect, ChatToResponses

PLAIN = ChatDialect()


def _sse(*chunks: Any) -> bytes:
    lines = [f"data: {json.dumps(one)}\n\n" for one in chunks]
    return "".join(lines).encode()


def _events(raw: list[bytes]) -> list[dict[str, Any]]:
    """The events as the SDK reads them: the `data:` of each, in order."""
    out = []
    for piece in raw:
        text = piece.decode()
        kind_line, data_line = text.strip().split("\n")
        body = json.loads(data_line.removeprefix("data: "))
        assert kind_line == f"event: {body['type']}"
        out.append(body)
    return out


def _types(events: list[dict[str, Any]]) -> list[str]:
    return [one["type"] for one in events]


def _chunk(
    delta: dict[str, Any], finish: str | None = None, **extra: Any
) -> dict[str, Any]:
    return {
        "id": "chatcmpl-1",
        "model": "deepseek-chat",
        "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
        **extra,
    }


class TestRequest:
    def test_brief_words_and_settings(self) -> None:
        payload = {
            "model": "own:deepseek:deepseek-chat",
            "input": [
                {"role": "developer", "content": "You are Nora."},
                {"role": "system", "content": "The person is in Paris."},
                {"role": "user", "content": [{"type": "input_text", "text": "Hello"}]},
            ],
            "max_output_tokens": 4096,
            "temperature": 0.3,
            "top_p": 0.9,
            "stream": True,
        }

        body = chat_wire.chat_request(payload, "deepseek-chat", PLAIN)

        assert body["model"] == "deepseek-chat"
        assert body["stream"] is True
        assert body["stream_options"] == {"include_usage": True}
        assert body["max_tokens"] == 4096
        assert body["temperature"] == 0.3
        assert body["top_p"] == 0.9
        # The briefs before the conversation are one, first; the person's
        # words are a plain string (some providers take nothing else).
        assert body["messages"] == [
            {"role": "system", "content": "You are Nora.\n\nThe person is in Paris."},
            {"role": "user", "content": "Hello"},
        ]
        assert "tools" not in body
        assert "reasoning_effort" not in body

    def test_instructions_and_a_plain_string_input(self) -> None:
        body = chat_wire.chat_request(
            {"instructions": "Be brief.", "input": "What time is it?"}, "m", PLAIN
        )

        assert body["messages"] == [
            {"role": "system", "content": "Be brief."},
            {"role": "user", "content": "What time is it?"},
        ]

    def test_pictures_and_files(self) -> None:
        content = [
            {"type": "input_text", "text": "What is this?"},
            {"type": "input_image", "image_url": "data:image/png;base64,AAAA"},
            {"type": "input_file", "filename": "plan.pdf", "file_data": "data:..."},
        ]
        payload = {"input": [{"role": "user", "content": content}]}

        seen = chat_wire.chat_messages(payload, PLAIN)
        blind = chat_wire.chat_messages(payload, ChatDialect(images=False))

        assert seen == [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is this?"},
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,AAAA"},
                    },
                    {
                        "type": "text",
                        "text": "(plan.pdf was attached here; this model can't read files.)",
                    },
                ],
            }
        ]
        # A model that can't see is told a picture was there, in words.
        assert blind == [
            {
                "role": "user",
                "content": "What is this?\n(A picture was here; this model can't see it.)\n"
                "(plan.pdf was attached here; this model can't read files.)",
            }
        ]

    def test_tool_calls_and_answers(self) -> None:
        payload = {
            "input": [
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": "Weather?"}],
                },
                {
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": "Looking."}],
                },
                {
                    "type": "function_call",
                    "call_id": "call_a",
                    "name": "Weather",
                    "arguments": '{"city":"Paris"}',
                },
                {
                    "type": "function_call",
                    "call_id": "call_b",
                    "name": "Weather",
                    "arguments": '{"city":"Lyon"}',
                },
                {
                    "type": "function_call_output",
                    "call_id": "call_a",
                    "output": '"Sunny"',
                },
                {
                    "type": "function_call_output",
                    "call_id": "call_b",
                    "output": '"Rain"',
                },
                {"type": "reasoning", "id": "rs_1", "summary": []},
                {
                    "type": "function_call",
                    "call_id": "call_c",
                    "name": "Map",
                    "arguments": "{}",
                },
                {"type": "function_call_output", "call_id": "call_c", "output": "[]"},
            ]
        }

        messages = chat_wire.chat_messages(payload, PLAIN)

        assert messages == [
            {"role": "user", "content": "Weather?"},
            # The words and the calls made with them are one assistant turn.
            {
                "role": "assistant",
                "content": "Looking.",
                "tool_calls": [
                    {
                        "id": "call_a",
                        "type": "function",
                        "function": {
                            "name": "Weather",
                            "arguments": '{"city":"Paris"}',
                        },
                    },
                    {
                        "id": "call_b",
                        "type": "function",
                        "function": {"name": "Weather", "arguments": '{"city":"Lyon"}'},
                    },
                ],
            },
            {"role": "tool", "tool_call_id": "call_a", "content": '"Sunny"'},
            {"role": "tool", "tool_call_id": "call_b", "content": '"Rain"'},
            # A call after the answers is a new turn of its own.
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_c",
                        "type": "function",
                        "function": {"name": "Map", "arguments": "{}"},
                    }
                ],
            },
            {"role": "tool", "tool_call_id": "call_c", "content": "[]"},
        ]

    def test_an_empty_assistant_turn_is_left_out(self) -> None:
        payload = {
            "input": [
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": [{"type": "output_text", "text": ""}]},
                {"role": "user", "content": "Still there?"},
            ]
        }

        assert chat_wire.chat_messages(payload, PLAIN) == [
            {"role": "user", "content": "Hi"},
            {"role": "user", "content": "Still there?"},
        ]

    def test_a_late_brief(self) -> None:
        payload = {
            "input": [
                {"role": "system", "content": "Brief."},
                {"role": "user", "content": "Hi"},
                {"role": "system", "content": "The person went quiet."},
            ]
        }

        kept = chat_wire.chat_messages(payload, PLAIN)
        said = chat_wire.chat_messages(payload, ChatDialect(late_system_as_user=True))

        assert kept[-1] == {"role": "system", "content": "The person went quiet."}
        assert said[0] == {"role": "system", "content": "Brief."}
        assert said[-1] == {
            "role": "user",
            "content": "<system>\nThe person went quiet.\n</system>",
        }

    def test_tools_effort_and_format(self) -> None:
        payload = {
            "input": "Hi",
            "tools": [
                {
                    "type": "function",
                    "name": "SendMessage",
                    "description": "Send a message.",
                    "parameters": {
                        "type": "object",
                        "properties": {"text": {"type": "string"}},
                    },
                    "strict": False,
                },
                {"type": "web_search_preview"},
            ],
            "tool_choice": {"type": "function", "name": "SendMessage"},
            "reasoning": {"effort": "medium"},
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "reply",
                    "schema": {"type": "object"},
                    "strict": True,
                }
            },
        }
        dialect = ChatDialect(effort=True, max_tokens_field="max_completion_tokens")

        body = chat_wire.chat_request(
            {**payload, "max_output_tokens": 100}, "m", dialect
        )

        # Only function tools: Chat has no search of its own.
        assert body["tools"] == [
            {
                "type": "function",
                "function": {
                    "name": "SendMessage",
                    "description": "Send a message.",
                    "parameters": {
                        "type": "object",
                        "properties": {"text": {"type": "string"}},
                    },
                },
            }
        ]
        assert body["tool_choice"] == {
            "type": "function",
            "function": {"name": "SendMessage"},
        }
        assert body["reasoning_effort"] == "medium"
        assert body["max_completion_tokens"] == 100
        assert "max_tokens" not in body
        assert body["response_format"] == {
            "type": "json_schema",
            "json_schema": {
                "name": "reply",
                "schema": {"type": "object"},
                "strict": True,
            },
        }

    def test_the_agents_effort(self) -> None:
        dialect = ChatDialect(effort=True)
        asked = {"input": "Hi", "reasoning": {"effort": "medium"}}
        quick = {"input": "Hi", "reasoning": {"effort": "low"}}

        # The person's effort for the agent wins over the engine's default…
        assert (
            chat_wire.chat_request(asked, "m", dialect, "high")["reasoning_effort"]
            == "high"
        )
        # …but a call the engine wants quick (a title) stays quick.
        assert (
            chat_wire.chat_request(quick, "m", dialect, "high")["reasoning_effort"]
            == "low"
        )
        # And a provider that reads no effort is never sent one.
        assert "reasoning_effort" not in chat_wire.chat_request(
            asked, "m", PLAIN, "high"
        )

    def test_no_usage_option_where_refused(self) -> None:
        body = chat_wire.chat_request(
            {"input": "Hi"}, "m", ChatDialect(stream_usage=False)
        )

        assert "stream_options" not in body


class TestStream:
    def test_words(self) -> None:
        reader = ChatToResponses(model="deepseek-chat")
        raw = reader.feed(
            _sse(
                _chunk({"role": "assistant", "content": ""}),
                _chunk({"content": "Hel"}),
                _chunk({"content": "lo."}),
                _chunk({}, "stop"),
                {
                    "id": "chatcmpl-1",
                    "choices": [],
                    "usage": {
                        "prompt_tokens": 12,
                        "completion_tokens": 3,
                        "prompt_tokens_details": {"cached_tokens": 8},
                    },
                },
            )
            + b"data: [DONE]\n\n"
        )
        events = _events(raw)

        assert _types(events) == [
            "response.created",
            "response.output_item.added",
            "response.content_part.added",
            "response.output_text.delta",
            "response.output_text.delta",
            "response.output_text.done",
            "response.content_part.done",
            "response.output_item.done",
            "response.completed",
        ]
        assert [one["sequence_number"] for one in events] == list(range(1, 10))
        created = events[0]["response"]
        assert created["id"] == "resp_chatcmpl-1"
        assert created["model"] == "deepseek-chat"
        assert isinstance(created["created_at"], int)
        assert [
            one["delta"] for one in events if one["type"].endswith("text.delta")
        ] == [
            "Hel",
            "lo.",
        ]
        assert events[1]["item"]["type"] == "message"
        done = events[-1]["response"]
        assert done["status"] == "completed"
        assert done["incomplete_details"] is None
        assert done["usage"] == {
            "input_tokens": 12,
            "input_tokens_details": {"cached_tokens": 8},
            "output_tokens": 3,
            "output_tokens_details": {"reasoning_tokens": 0},
            "total_tokens": 15,
        }
        assert done["output"] == [
            {
                "id": events[1]["item"]["id"],
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [
                    {"type": "output_text", "text": "Hello.", "annotations": []}
                ],
            }
        ]
        # The usage came after the finish reason, and still counted; the end
        # is said once whatever else closes the stream.
        assert reader.finish() == []
        assert reader.final == done

    def test_thinking_then_words(self) -> None:
        reader = ChatToResponses(model="deepseek-reasoner")
        events = _events(
            reader.feed(
                _sse(
                    _chunk({"reasoning_content": "The person "}),
                    _chunk({"reasoning_content": "greets."}),
                    _chunk({"content": "Hi!"}, "stop"),
                    {
                        "choices": [],
                        "usage": {
                            "prompt_tokens": 5,
                            "completion_tokens": 9,
                            "prompt_cache_hit_tokens": 4,
                            "completion_tokens_details": {"reasoning_tokens": 6},
                        },
                    },
                )
            )
            + reader.finish()
        )

        thoughts = [
            one
            for one in events
            if one["type"] == "response.reasoning_summary_text.delta"
        ]
        assert [one["delta"] for one in thoughts] == ["The person ", "greets."]
        assert all(
            set(one) >= {"item_id", "output_index", "summary_index"} for one in thoughts
        )
        # The thought is closed before the words start.
        kinds = _types(events)
        assert kinds.index("response.output_item.done") < kinds.index(
            "response.output_text.delta"
        )
        done = events[-1]["response"]
        assert [one["type"] for one in done["output"]] == ["reasoning", "message"]
        assert done["output"][0]["summary"] == [
            {"type": "summary_text", "text": "The person greets."}
        ]
        # DeepSeek's own spelling of the cached words.
        assert done["usage"]["input_tokens_details"] == {"cached_tokens": 4}
        assert done["usage"]["output_tokens_details"] == {"reasoning_tokens": 6}

    def test_tool_calls(self) -> None:
        reader = ChatToResponses(model="m")
        raw = reader.feed(
            _sse(
                _chunk({"content": "Checking."}),
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_a",
                                "type": "function",
                                "function": {"name": "Weather", "arguments": ""},
                            }
                        ]
                    }
                ),
                _chunk(
                    {
                        "tool_calls": [
                            {"index": 0, "function": {"arguments": '{"city":'}}
                        ]
                    }
                ),
                _chunk(
                    {
                        "tool_calls": [
                            {"index": 0, "function": {"arguments": '"Paris"}'}}
                        ]
                    }
                ),
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 1,
                                "id": "call_b",
                                "function": {"name": "Map", "arguments": "{}"},
                            }
                        ]
                    }
                ),
                _chunk({}, "tool_calls"),
            )
        )
        events = _events(raw + reader.finish())

        added = [one for one in events if one["type"] == "response.output_item.added"]
        assert [one["item"]["type"] for one in added] == [
            "message",
            "function_call",
            "function_call",
        ]
        first, second = added[1]["item"], added[2]["item"]
        assert first["call_id"] == "call_a"
        assert first["name"] == "Weather"
        assert first["arguments"] == ""
        assert second["call_id"] == "call_b"
        deltas = [
            one
            for one in events
            if one["type"] == "response.function_call_arguments.delta"
        ]
        assert [(one["output_index"], one["delta"]) for one in deltas] == [
            (1, '{"city":'),
            (1, '"Paris"}'),
            (2, "{}"),
        ]
        assert all(one["item_id"] == first["id"] for one in deltas[:2])
        calls = [
            one["item"]
            for one in events
            if one["type"] == "response.output_item.done"
            and one["item"]["type"] == "function_call"
        ]
        assert calls == [
            {
                "id": first["id"],
                "type": "function_call",
                "call_id": "call_a",
                "name": "Weather",
                "arguments": '{"city":"Paris"}',
                "status": "completed",
            },
            {
                "id": second["id"],
                "type": "function_call",
                "call_id": "call_b",
                "name": "Map",
                "arguments": "{}",
                "status": "completed",
            },
        ]
        # The words are closed before the first call opens.
        kinds = _types(events)
        assert kinds.index("response.output_text.done") < kinds.index(
            "response.function_call_arguments.delta"
        )
        done = events[-1]
        assert done["type"] == "response.completed"
        assert [one["type"] for one in done["response"]["output"]] == [
            "message",
            "function_call",
            "function_call",
        ]
        # No usage said (a provider without `include_usage`): zeros, never absent.
        assert done["response"]["usage"]["input_tokens"] == 0

    def test_tool_calls_without_an_index(self) -> None:
        reader = ChatToResponses(model="m")
        raw = reader.feed(
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "id": "call_a",
                                "function": {"name": "A", "arguments": "{"},
                            }
                        ]
                    }
                ),
                _chunk({"tool_calls": [{"function": {"arguments": "}"}}]}),
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "id": "call_b",
                                "function": {"name": "B", "arguments": {"x": 1}},
                            }
                        ]
                    }
                ),
                _chunk({}, "tool_calls"),
            )
        )
        events = _events(raw + reader.finish())

        calls = [
            one["item"]
            for one in events
            if one["type"] == "response.output_item.done"
            and one["item"]["type"] == "function_call"
        ]
        assert [(one["call_id"], one["name"], one["arguments"]) for one in calls] == [
            ("call_a", "A", "{}"),
            ("call_b", "B", '{"x": 1}'),
        ]

    def test_a_call_with_no_arguments(self) -> None:
        reader = ChatToResponses(model="m")
        reader.feed(
            _sse(
                _chunk(
                    {
                        "tool_calls": [
                            {"index": 0, "id": "c", "function": {"name": "Now"}}
                        ]
                    }
                )
            )
        )

        events = _events(reader.finish())

        call = next(
            one["item"] for one in events if one["type"] == "response.output_item.done"
        )
        assert call["arguments"] == "{}"

    def test_cut_at_the_length(self) -> None:
        reader = ChatToResponses(model="m")
        events = _events(
            reader.feed(_sse(_chunk({"content": "A long"}, "length"))) + reader.finish()
        )

        done = events[-1]
        assert done["type"] == "response.incomplete"
        assert done["response"]["incomplete_details"] == {"reason": "max_output_tokens"}

    def test_a_refusal_in_the_stream(self) -> None:
        reader = ChatToResponses(model="m")
        events = _events(
            reader.feed(_sse({"error": {"message": "Rate limit reached", "code": 429}}))
            + reader.finish()
        )

        assert _types(events) == ["response.created", "error"]
        assert events[1]["code"] == "429"
        assert events[1]["message"] == "Rate limit reached"
        assert reader.error == {"code": "429", "message": "Rate limit reached"}
        assert reader.final is None

    def test_bytes_split_anywhere(self) -> None:
        whole = (
            _sse(
                _chunk({"content": "Bonjour "}),
                _chunk({"content": "à toi."}, "stop"),
            )
            + b": keep-alive\n\ndata: [DONE]\n\n"
        )
        reader = ChatToResponses(model="m")

        raw: list[bytes] = []
        for at in range(0, len(whole), 7):
            raw += reader.feed(whole[at : at + 7])
        raw += reader.finish()
        events = _events(raw)

        # A letter cut between two reads is whole again.
        words = "".join(
            one["delta"]
            for one in events
            if one["type"] == "response.output_text.delta"
        )
        assert words == "Bonjour à toi."
        assert _types(events).count("response.completed") == 1

    def test_a_last_line_without_its_newline(self) -> None:
        reader = ChatToResponses(model="m")
        raw = reader.feed(
            b'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":"stop"}]}'
        )

        events = _events(raw + reader.finish())

        assert [
            one["delta"]
            for one in events
            if one["type"] == "response.output_text.delta"
        ] == ["Hi"]
        assert events[-1]["type"] == "response.completed"

    def test_nothing_said(self) -> None:
        reader = ChatToResponses(model="m")

        events = _events(reader.finish())

        assert _types(events) == ["response.created", "response.completed"]
        assert events[-1]["response"]["output"] == []


class TestGivenBack:
    """What a provider wants back with its tool calls, which the engine's
    wire drops: kept from the answer, given back on the next call."""

    def test_thought_and_signatures_are_kept(self) -> None:
        reader = ChatToResponses(model="gemini-3.8-flash")
        reader.feed(
            _sse(
                _chunk({"reasoning_content": "Weather first."}),
                _chunk(
                    {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_a",
                                "function": {"name": "Weather", "arguments": "{}"},
                                "extra_content": {
                                    "google": {"thought_signature": "sig"}
                                },
                            }
                        ]
                    }
                ),
                _chunk({}, "tool_calls"),
            )
        )
        reader.finish()

        assert reader.kept() == {
            "call_a": {
                "reasoning": "Weather first.",
                "extra": {"google": {"thought_signature": "sig"}},
            }
        }

    def test_nothing_kept_without_calls(self) -> None:
        reader = ChatToResponses(model="m")
        reader.feed(
            _sse(
                _chunk({"reasoning_content": "Hm."}), _chunk({"content": "Hi"}, "stop")
            )
        )
        reader.finish()

        assert reader.kept() == {}

    def test_given_back_on_the_turn_that_made_them(self) -> None:
        payload = {
            "input": [
                {"role": "user", "content": "Weather?"},
                {
                    "type": "function_call",
                    "call_id": "call_a",
                    "name": "Weather",
                    "arguments": "{}",
                },
                {
                    "type": "function_call_output",
                    "call_id": "call_a",
                    "output": "Sunny",
                },
            ]
        }
        kept = {
            "call_a": {
                "reasoning": "Weather first.",
                "extra": {"google": {"thought_signature": "sig"}},
            }
        }

        assert chat_wire.call_ids(payload) == ["call_a"]
        both = ChatDialect(reasoning_back=True, call_extras=True)
        turn = chat_wire.chat_request(payload, "m", both, kept=kept)["messages"][1]
        assert turn["reasoning_content"] == "Weather first."
        assert turn["tool_calls"][0]["extra_content"] == {
            "google": {"thought_signature": "sig"}
        }
        # A provider that wants neither is sent neither…
        bare = chat_wire.chat_request(payload, "m", PLAIN, kept=kept)["messages"][1]
        assert "reasoning_content" not in bare
        assert "extra_content" not in bare["tool_calls"][0]
        # …and the plain request never carries them.
        plain = chat_wire.chat_request(payload, "m", both, kept=kept, plain=True)
        assert "reasoning_content" not in plain["messages"][1]

    def test_the_plain_request(self) -> None:
        payload = {
            "input": [
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "Look"},
                        {
                            "type": "input_image",
                            "image_url": "data:image/png;base64,AA",
                        },
                    ],
                }
            ],
            "reasoning": {"effort": "high"},
            "text": {"format": {"type": "json_object"}},
            "max_output_tokens": 50,
        }
        dialect = ChatDialect(effort=True, max_tokens_field="max_completion_tokens")

        body = chat_wire.chat_request(payload, "m", dialect, plain=True)

        assert body == {
            "model": "m",
            "messages": [
                {
                    "role": "user",
                    "content": "Look\n(A picture was here; this model can't see it.)",
                }
            ],
            "stream": True,
            "max_completion_tokens": 50,
        }
