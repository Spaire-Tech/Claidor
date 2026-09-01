"""The agent loop, driven by a scripted model.

No network and no API key: the loop takes its client as an argument, so a
fake that returns prepared responses can walk it through every path —
including the three that only happen when something goes wrong, which are
the ones worth testing and the hardest to provoke against a real model.

What is asserted here is mostly about honesty, because that is what the
loop is for. The tools decide what can be known; the loop decides what is
admitted when the answer is incomplete.
"""

from typing import Any
from uuid import uuid4

import pytest

from polar.agent import Stopped, run
from polar.dossier.agent.tools import TOOLSET, Workspace
from polar.models.dossier import DossierDocument


class FakeBlock:
    def __init__(self, **fields: Any) -> None:
        self.__dict__.update(fields)


class FakeUsage:
    def __init__(self, input_tokens: int = 10, output_tokens: int = 5) -> None:
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class FakeMessage:
    def __init__(self, content: list[Any], stop_reason: str = "end_turn") -> None:
        self.content = content
        self.stop_reason = stop_reason
        self.usage = FakeUsage()


def says(text: str) -> FakeMessage:
    return FakeMessage([FakeBlock(type="text", text=text)])


def calls(name: str, arguments: dict[str, Any] | None = None) -> FakeMessage:
    return FakeMessage(
        [
            FakeBlock(
                type="tool_use",
                id=f"call_{name}",
                name=name,
                input=arguments or {},
            )
        ],
        stop_reason="tool_use",
    )


def calls_many(*names: str) -> FakeMessage:
    return FakeMessage(
        [
            FakeBlock(type="tool_use", id=f"call_{i}", name=name, input={})
            for i, name in enumerate(names)
        ],
        stop_reason="tool_use",
    )


class FakeStream:
    """The SDK's streaming helper, faked to the two things the loop uses.

    Text comes out in pieces on purpose. The loop's contract is that
    prose leaves *as it is written*, and a fake that handed over one
    whole string would pass a test the real thing could fail.
    """

    def __init__(self, message: Any) -> None:
        self.message = message

    @property
    def text_stream(self) -> Any:
        async def pieces() -> Any:
            for block in self.message.content:
                if getattr(block, "type", "") != "text":
                    continue
                text = block.text
                cut = max(1, len(text) // 2)
                yield text[:cut]
                if text[cut:]:
                    yield text[cut:]

        return pieces()

    async def get_final_message(self) -> Any:
        return self.message


class FakeStreamManager:
    def __init__(self, messages: "FakeMessages", kwargs: dict[str, Any]) -> None:
        self.messages = messages
        self.kwargs = kwargs

    async def __aenter__(self) -> FakeStream:
        self.messages.calls.append(self.kwargs)
        if not self.messages.script:
            raise AssertionError("the loop asked for more turns than were scripted")
        nxt = self.messages.script.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return FakeStream(nxt)

    async def __aexit__(self, *args: Any) -> None:
        return None


class FakeMessages:
    def __init__(self, script: list[Any]) -> None:
        self.script = list(script)
        self.calls: list[dict[str, Any]] = []

    def stream(self, **kwargs: Any) -> FakeStreamManager:
        return FakeStreamManager(self, kwargs)


class FakeClient:
    def __init__(self, *script: Any) -> None:
        self.messages = FakeMessages(list(script))


def document(text: str | None, *, title: str = "SPA"):
    return DossierDocument(
        id=uuid4(),
        dossier_id=uuid4(),
        file_id=uuid4(),
        uploaded_by_id=uuid4(),
        title=title,
        piece_number=1,
        extracted_text=text,
    )


def workspace(*documents: DossierDocument) -> Workspace:
    return Workspace(dossier_id=uuid4(), documents=tuple(documents))


@pytest.mark.asyncio
class TestTheHappyPath:
    async def test_an_answer_with_no_tools_is_still_an_answer(self) -> None:
        client = FakeClient(says("Nothing in this matter bears on that."))

        outcome = await run(client, TOOLSET, workspace(), "Anything?")

        assert outcome.complete
        assert outcome.steps == []
        assert "Nothing in this matter" in outcome.answer

    async def test_every_tool_call_lands_in_the_trace_in_order(self) -> None:
        client = FakeClient(
            calls("list_documents"),
            calls("search_documents", {"query": "indemnity"}),
            says("No indemnity."),
        )

        outcome = await run(
            client, TOOLSET, workspace(document("nothing here")), "Indemnity?"
        )

        assert [step.tool for step in outcome.steps] == [
            "list_documents",
            "search_documents",
        ]
        assert [step.ordinal for step in outcome.steps] == [1, 2]
        assert outcome.complete

    async def test_several_tools_in_one_turn_are_all_recorded(self) -> None:
        client = FakeClient(
            calls_many("list_documents", "list_documents"), says("Done.")
        )

        outcome = await run(client, TOOLSET, workspace(document("x")), "Go")

        assert len(outcome.steps) == 2

    async def test_the_trace_reads_as_vesence_shows_it(self) -> None:
        client = FakeClient(calls("list_documents"), says("Done."))

        outcome = await run(client, TOOLSET, workspace(document("x")), "Go")

        assert outcome.trace().startswith("Used 1 tool")

    async def test_tokens_are_added_up_across_turns(self) -> None:
        client = FakeClient(calls("list_documents"), says("Done."))

        outcome = await run(client, TOOLSET, workspace(document("x")), "Go")

        assert outcome.input_tokens == 20
        assert outcome.output_tokens == 10


@pytest.mark.asyncio
class TestWhenItCannotFinish:
    """The three ways a run ends badly, and what it must admit."""

    async def test_running_out_of_steps_is_said_not_hidden(self) -> None:
        # An agent that stops after its budget and answers as though it had
        # finished is claiming a completeness it does not have.
        client = FakeClient(*[calls("list_documents") for _ in range(10)])

        outcome = await run(
            client, TOOLSET, workspace(document("x")), "Check everything", max_steps=3
        )

        assert outcome.stopped == Stopped.step_limit
        assert outcome.complete is False
        assert len(outcome.steps) <= 3

    async def test_the_budget_is_checked_before_spending_it(self) -> None:
        # A run that has spent its steps must not perform one more and then
        # report having stopped — the trace would show four calls under a
        # limit of three.
        client = FakeClient(
            calls_many("list_documents", "list_documents"),
            calls_many("list_documents", "list_documents"),
            says("never reached"),
        )

        outcome = await run(
            client, TOOLSET, workspace(document("x")), "Go", max_steps=3
        )

        assert len(outcome.steps) == 2
        assert outcome.stopped == Stopped.step_limit

    async def test_a_model_error_invents_no_answer(self) -> None:
        client = FakeClient(RuntimeError("the provider is down"))

        outcome = await run(client, TOOLSET, workspace(), "Anything?")

        assert outcome.stopped == Stopped.failed
        assert outcome.answer == ""
        assert outcome.error is not None
        assert "provider is down" in outcome.error

    async def test_an_error_partway_through_keeps_the_steps_already_taken(self) -> None:
        # What was done is still true, and the reader should see it.
        client = FakeClient(calls("list_documents"), RuntimeError("timeout"))

        outcome = await run(client, TOOLSET, workspace(document("x")), "Go")

        assert outcome.stopped == Stopped.failed
        assert len(outcome.steps) == 1


@pytest.mark.asyncio
class TestWhenTheModelMisbehaves:
    async def test_an_invented_tool_is_recorded_and_the_run_continues(self) -> None:
        # Swallowing it would leave a trace that reads as though the agent
        # went straight to the answer.
        client = FakeClient(calls("delete_everything"), says("Sorry, I tried that."))

        outcome = await run(client, TOOLSET, workspace(), "Go")

        assert outcome.complete
        assert len(outcome.steps) == 1
        assert outcome.steps[0].ok is False
        assert "no tool called" in outcome.steps[0].summary

    async def test_a_refused_tool_is_marked_in_the_trace(self) -> None:
        client = FakeClient(
            calls("read_document", {"document_id": str(uuid4())}), says("Cannot.")
        )

        outcome = await run(client, TOOLSET, workspace(document("x")), "Read it")

        assert outcome.steps[0].ok is False
        assert "(refused)" in outcome.trace()

    async def test_bad_arguments_do_not_end_the_run(self) -> None:
        client = FakeClient(calls("read_document", {"nonsense": 1}), says("Recovered."))

        outcome = await run(client, TOOLSET, workspace(document("x")), "Go")

        assert outcome.complete
        assert outcome.steps[0].ok is False


@pytest.mark.asyncio
class TestWhatTheModelIsGiven:
    async def test_the_tools_offered_are_the_tools_that_exist(self) -> None:
        from polar.dossier.agent.tools import TOOLS

        client = FakeClient(says("Done."))
        await run(client, TOOLSET, workspace(), "Go")

        offered = {tool["name"] for tool in client.messages.calls[0]["tools"]}
        assert offered == set(TOOLS)

    async def test_the_system_prompt_is_sent(self) -> None:
        client = FakeClient(says("Done."))
        await run(client, TOOLSET, workspace(), "Go")

        system = client.messages.calls[0]["system"]
        assert "list_documents" in system[0]["text"]

    async def test_the_prompt_carries_a_cache_breakpoint(self) -> None:
        #: The tools and the system prompt are the same bytes on every
        #: turn of every conversation — thousands of tokens re-read from
        #: scratch each time without this. Marked, they are read from
        #: cache, and the person waits less.
        client = FakeClient(says("Done."))
        await run(client, TOOLSET, workspace(), "Go")

        system = client.messages.calls[0]["system"]
        assert system[-1]["cache_control"] == {"type": "ephemeral"}

    async def test_the_history_carries_a_moving_breakpoint(self) -> None:
        #: And **only one**: the mark moves to the newest tool result
        #: rather than accumulating. Four breakpoints is the API's
        #: limit, so a run of twelve steps that left every mark behind
        #: would be rejected outright.
        client = FakeClient(
            calls("list_documents"),
            calls("list_documents"),
            calls("list_documents"),
            calls("list_documents"),
            calls("list_documents"),
            says("Done."),
        )
        await run(client, TOOLSET, workspace(document("x")), "Go")

        sent = client.messages.calls[-1]["messages"]
        marked = [
            block
            for message in sent
            if isinstance(message["content"], list)
            for block in message["content"]
            if isinstance(block, dict) and "cache_control" in block
        ]
        assert len(marked) == 1

    async def test_the_effort_is_stated_rather_than_left_to_the_default(self) -> None:
        client = FakeClient(says("Done."))
        await run(client, TOOLSET, workspace(), "Go", effort="low")

        assert client.messages.calls[0]["output_config"] == {"effort": "low"}

    async def test_tool_results_are_fed_back(self) -> None:
        client = FakeClient(calls("list_documents"), says("Done."))
        await run(client, TOOLSET, workspace(document("x")), "Go")

        # Turn two carries the assistant's tool_use and the tool's result.
        second = client.messages.calls[1]["messages"]
        assert second[-1]["role"] == "user"
        assert second[-1]["content"][0]["type"] == "tool_result"


@pytest.mark.asyncio
class TestTheFakeIsNotLying:
    """Drive the loop with the SDK's own response objects.

    Every test above uses a hand-written fake. If that fake's shape drifts
    from the real `anthropic.types.Message` — a renamed field, a block that
    stopped carrying `.input` — those tests keep passing and the loop
    breaks the first time it meets a real model.

    So this one builds genuine SDK objects and runs the loop on them. It is
    the control for the whole file.
    """

    async def test_the_loop_reads_real_sdk_messages(self) -> None:
        from anthropic.types import Message, TextBlock, ToolUseBlock, Usage

        def message(content: list[Any], stop_reason: str) -> Message:
            return Message(
                id="msg_1",
                content=content,
                model="claude-opus-5",
                role="assistant",
                stop_reason=stop_reason,
                type="message",
                usage=Usage(input_tokens=11, output_tokens=7),
            )

        class RealShapedMessages:
            def __init__(self) -> None:
                self.script = [
                    message(
                        [
                            ToolUseBlock(
                                id="toolu_1",
                                input={},
                                name="list_documents",
                                type="tool_use",
                            )
                        ],
                        "tool_use",
                    ),
                    message(
                        [TextBlock(text="One document.", type="text", citations=None)],
                        "end_turn",
                    ),
                ]

            def stream(self, **kwargs: Any) -> Any:
                return FakeStreamManager(self, kwargs)  # type: ignore[arg-type]

            #: `FakeStreamManager` reads these two off whatever it is
            #: given; the messages it hands back are the SDK's own.
            calls: list[dict[str, Any]] = []

        class RealShapedClient:
            def __init__(self) -> None:
                self.messages = RealShapedMessages()

        outcome = await run(RealShapedClient(), TOOLSET, workspace(document("x")), "Go")

        assert outcome.complete
        assert [step.tool for step in outcome.steps] == ["list_documents"]
        assert outcome.answer == "One document."
        assert outcome.input_tokens == 22
        assert outcome.output_tokens == 14


def says_and_calls(text: str, name: str, arguments: dict[str, Any] | None = None):
    """A turn where the assistant speaks *and* reaches for a tool.

    The shape the founder's status lines actually arrive in: « Reading
    the debt schedule », then the call that reads it.
    """
    return FakeMessage(
        [
            FakeBlock(type="text", text=text),
            FakeBlock(
                type="tool_use",
                id=f"call_{name}",
                name=name,
                input=arguments or {},
            ),
        ],
        stop_reason="tool_use",
    )


@pytest.mark.asyncio
class TestWatchingTheRunHappen:
    """The run reaches the screen while it runs, not after it.

    A model question takes tens of seconds and several tool calls. The
    founder's design does not draw a spinner over that — it draws the
    steps, live. That is only possible if the loop says something as
    each one finishes, which is what `on_step` is.
    """

    async def test_each_step_is_announced_as_it_finishes(self) -> None:
        client = FakeClient(
            calls("list_documents"),
            calls("search_documents", {"query": "indemnity"}),
            says("No indemnity."),
        )
        seen: list[str] = []

        outcome = await run(
            client,
            TOOLSET,
            workspace(document("nothing here")),
            "Indemnity?",
            on_step=lambda step: seen.append(step.tool),
        )

        assert seen == ["list_documents", "search_documents"]
        assert [step.tool for step in outcome.steps] == seen

    async def test_the_announcement_carries_the_finished_step(self) -> None:
        #: Announced *after* the tool ran, not before: a step handed
        #: over with no summary would put an empty line on the screen
        #: and call it progress.
        client = FakeClient(calls("list_documents"), says("Done."))
        seen: list[Any] = []

        await run(
            client,
            TOOLSET,
            workspace(document("x")),
            "Go",
            on_step=seen.append,
        )

        assert len(seen) == 1
        assert seen[0].summary
        assert seen[0].ordinal == 1

    async def test_a_run_that_is_not_watched_behaves_identically(self) -> None:
        script = [calls("list_documents"), says("Done.")]
        watched = await run(
            FakeClient(*script),
            TOOLSET,
            workspace(document("x")),
            "Go",
            on_step=lambda step: None,
        )
        alone = await run(
            FakeClient(*[calls("list_documents"), says("Done.")]),
            TOOLSET,
            workspace(document("x")),
            "Go",
        )

        assert watched.answer == alone.answer
        assert [s.tool for s in watched.steps] == [s.tool for s in alone.steps]


@pytest.mark.asyncio
class TestTheAssistantsOwnStatusLine:
    """What it said before it called the tool, kept with the call.

    The founder asks the assistant for « one short status line per
    step ». It arrives as text in the same turn as the tool call, and
    the loop is the only place that can pair the two.
    """

    async def test_what_it_said_travels_with_the_call(self) -> None:
        client = FakeClient(
            says_and_calls("Reading the documents", "list_documents"),
            says("Done."),
        )

        outcome = await run(client, TOOLSET, workspace(document("x")), "Go")

        assert outcome.steps[0].said == "Reading the documents"

    async def test_a_silent_call_says_nothing_rather_than_something(self) -> None:
        client = FakeClient(calls("list_documents"), says("Done."))

        outcome = await run(client, TOOLSET, workspace(document("x")), "Go")

        assert outcome.steps[0].said == ""

    async def test_one_line_covers_the_turn_it_was_written_for(self) -> None:
        #: Two calls in one turn share one status line, and repeating it
        #: on both would draw two steps that claim to be doing the same
        #: thing. The first carries it; the second is honest about
        #: having none of its own.
        turn = FakeMessage(
            [
                FakeBlock(type="text", text="Reading the documents"),
                FakeBlock(type="tool_use", id="a", name="list_documents", input={}),
                FakeBlock(type="tool_use", id="b", name="list_documents", input={}),
            ],
            stop_reason="tool_use",
        )
        client = FakeClient(turn, says("Done."))

        outcome = await run(client, TOOLSET, workspace(document("x")), "Go")

        assert [step.said for step in outcome.steps] == ["Reading the documents", ""]


@pytest.mark.asyncio
class TestTheProseLeavesAsItIsWritten:
    """The answer appears while it is being written, not after.

    A model call takes tens of seconds. Holding every word back and
    then putting the whole answer on screen at once is the difference
    between reading along and staring at a spinner — and it is the
    thing the founder saw and called out.
    """

    async def test_the_answer_arrives_in_pieces(self) -> None:
        client = FakeClient(says("Nothing in this matter bears on that."))
        pieces: list[str] = []

        outcome = await run(
            client,
            TOOLSET,
            workspace(),
            "Anything?",
            on_text=pieces.append,
        )

        assert len(pieces) > 1
        assert "".join(pieces) == outcome.answer

    async def test_a_status_line_is_written_before_its_tool_runs(self) -> None:
        #: The prose of a turn that ends in a tool call is the status
        #: line, and it reaches the screen before the tool has run —
        #: which is the whole point of saying it.
        client = FakeClient(
            says_and_calls("Reading the documents", "list_documents"),
            says("Done."),
        )
        order: list[str] = []

        await run(
            client,
            TOOLSET,
            workspace(document("x")),
            "Go",
            on_text=lambda piece: order.append(f"text:{piece}"),
            on_step=lambda step: order.append(f"step:{step.tool}"),
        )

        assert order.index("step:list_documents") > 0
        assert order[0].startswith("text:")

    async def test_a_run_nobody_is_reading_answers_the_same(self) -> None:
        watched = await run(
            FakeClient(says("Done.")),
            TOOLSET,
            workspace(),
            "Go",
            on_text=lambda _: None,
        )
        alone = await run(FakeClient(says("Done.")), TOOLSET, workspace(), "Go")

        assert watched.answer == alone.answer == "Done."
