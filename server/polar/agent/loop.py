"""The agent loop: read, search, check, answer.

Vesence shows what the agent did as it works — « Used 12 tools », then each
one named. That trace is most of why the thing reads as trustworthy rather
than magic, and it is also the only way a reader can tell an answer that
was looked up from one that was composed. So the trace is not logging here;
it is the return value, and every tool call lands in it whether it
succeeded or not.

Three properties are enforced rather than hoped for.

**Running out of steps is said out loud.** An agent that stops after
twenty-four tools and then answers as though it had finished is claiming a
completeness it does not have. When the budget runs out the outcome says
so, and the caller shows it.

**A failed tool stays in the trace.** « No such document » is a fact about
the run. Swallowing it leaves a trace that reads as though the agent went
straight to the answer.

**The model is injected.** Not constructed here, which is what makes the
whole loop testable without a network or a key: a fake client that returns
scripted responses drives every path, including the ones that only happen
when a model misbehaves.
"""

import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any, Protocol

import structlog

from .toolset import Toolset

log = structlog.get_logger()

AGENT_MODEL = "claude-opus-5"

#: Vesence's own screenshot says « Used 24 tools ». That is the right order
#: of magnitude for a transaction bundle: enough to list, read several
#: documents in windows and check each one, without a runaway loop reading
#: the same file forever.
MAX_STEPS = 24

#: Per model call. A checked document with forty findings is a large tool
#: result, and the answer that follows it needs room.
MAX_TOKENS = 4_000

#: How hard the model works before it answers. `high` is the API's own
#: default and what a review agent should have; a chat over a graph is a
#: different job — the tools do the finding, and the thinking between
#: calls is what a person watching a spinner is waiting on. Named here
#: so raising it is one edit and a visible decision.
EFFORT = "high"


class Message(Protocol):
    content: Sequence[Any]
    stop_reason: str | None
    usage: Any


class Stream(Protocol):
    """The SDK's streaming helper, in the two ways this loop uses it."""

    @property
    def text_stream(self) -> Any: ...

    async def get_final_message(self) -> Message: ...


class StreamManager(Protocol):
    async def __aenter__(self) -> Stream: ...
    async def __aexit__(self, *args: Any) -> None: ...


class Messages(Protocol):
    def stream(self, **kwargs: Any) -> StreamManager: ...


class Client(Protocol):
    """Only the sliver of the SDK this loop uses.

    `messages` is a read-only property rather than an attribute, because
    that is what `anthropic.AsyncAnthropic` actually exposes — declared as
    a plain attribute the protocol looks satisfied to a reader and is
    rejected by the type checker, which is the useful way round.

    **Streaming rather than a plain call**, and it is not an
    optimisation. The model writes its answer over several seconds; a
    non-streaming call holds all of it back and then puts a wall of text
    on the screen at once. The words have to leave as they are written,
    so `stream` is the only method here.
    """

    @property
    def messages(self) -> Messages: ...


@dataclass
class Step:
    """One tool call, as the trace shows it."""

    ordinal: int
    tool: str
    arguments: dict[str, Any]
    ok: bool
    #: One line: « Read Project_Atlas_SPA.docx ».
    summary: str
    milliseconds: int = 0
    #: The tool's own payload, verbatim. Screens that show structured
    #: rows read them from here — never from the model's narration —
    #: which is what keeps a listed figure a looked-up figure.
    data: dict[str, Any] = field(default_factory=dict)
    #: What the assistant said in the turn that made this call — its own
    #: status line, « Reading the debt schedule », written *before* the
    #: tool ran. Empty when it called the tool without a word, and empty
    #: on every call after the first in the same turn: one line covers
    #: the turn, and repeating it three times would read as three steps
    #: that all did the same thing.
    #:
    #: This is prose, and it is deliberately the one piece of model text
    #: a screen may show while work is in flight. It is not evidence and
    #: nothing is derived from it — the summary underneath is the tool's
    #: own, and that is what the trace keeps.
    said: str = ""


class Stopped:
    """Why the run ended. The first is the only good one."""

    answered = "answered"
    #: Ran out of tool calls. The answer, if any, is partial and says so.
    step_limit = "step_limit"
    #: The model errored. There is no answer, and none is invented.
    failed = "failed"


@dataclass
class Outcome:
    answer: str
    steps: list[Step] = field(default_factory=list)
    stopped: str = Stopped.answered
    input_tokens: int = 0
    output_tokens: int = 0
    #: Set when `stopped` is `failed`.
    error: str | None = None

    @property
    def complete(self) -> bool:
        return self.stopped == Stopped.answered

    def trace(self) -> str:
        """The « Used N tools » line and its steps, as plain text."""
        if not self.steps:
            return "Used no tools"
        lines = [f"Used {len(self.steps)} tool{'' if len(self.steps) == 1 else 's'}"]
        lines.extend(
            f"  {'' if step.ok else '(refused) '}{step.summary}" for step in self.steps
        )
        return "\n".join(lines)


def _text_of(message: Message) -> str:
    return "\n".join(
        block.text for block in message.content if getattr(block, "type", "") == "text"
    ).strip()


def _tool_uses(message: Message) -> list[Any]:
    return [
        block for block in message.content if getattr(block, "type", "") == "tool_use"
    ]


async def run(
    client: Client,
    toolset: Toolset,
    workspace: Any,
    prompt: str,
    *,
    model: str = AGENT_MODEL,
    max_steps: int = MAX_STEPS,
    effort: str = EFFORT,
    known: str = "",
    on_step: Callable[[Step], None] | None = None,
    on_text: Callable[[str], None] | None = None,
) -> Outcome:
    """Work the prompt with one toolset, and report what was done.

    The toolset carries the tools, their definitions and the system prompt
    that explains them, so this loop is the same loop whether it is
    reconciling a deck or reading a contract. What differs between the two
    products is *what the agent can do*, and that belongs in a toolset
    rather than in a second copy of the control flow.

    `on_step` is called with each step **as it finishes** and `on_text`
    with each piece of prose **as it is written**, which together are
    what let a screen show the work happening rather than a spinner and
    then everything at once. Both are notifications and nothing more:
    the outcome returned at the end is unchanged by them, and a caller
    that passes neither gets the same answer it always did. They are
    called inside the loop, so neither may block — the streaming
    endpoint hands what it is given to a queue and returns.

    `effort` is how hard the model works before it answers, and it is
    the honest lever on how long a person waits. It is not a smaller
    model: the same model runs, and thinks for less of the wait.
    """
    outcome = Outcome(answer="")
    messages: list[dict[str, Any]] = [{"role": "user", "content": prompt}]
    ordinal = 0
    #: The tool-result block currently carrying the moving cache
    #: breakpoint; see where it is set, below.
    marked: dict[str, Any] | None = None

    while True:
        try:
            async with client.messages.stream(
                model=model,
                max_tokens=MAX_TOKENS,
                #: A list rather than a string so the prompt can carry a
                #: cache breakpoint. Tools are rendered before the
                #: system prompt, so one mark here covers both — and
                #: both are the same bytes on every turn of every
                #: conversation, which is what makes them cacheable.
                system=[
                    {
                        "type": "text",
                        "text": toolset.prompt(known),
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                tools=toolset.definitions,
                messages=messages,
                output_config={"effort": effort},
            ) as stream:
                async for piece in stream.text_stream:
                    if on_text is not None:
                        on_text(piece)
                response = await stream.get_final_message()
        except Exception as error:
            # No answer is invented. A run that could not finish reports
            # that it could not finish.
            outcome.stopped = Stopped.failed
            outcome.error = str(error)
            log.warning("agent.failed", toolset=toolset.name, error=str(error))
            return outcome

        outcome.input_tokens += getattr(response.usage, "input_tokens", 0)
        outcome.output_tokens += getattr(response.usage, "output_tokens", 0)

        uses = _tool_uses(response)
        if not uses:
            outcome.answer = _text_of(response)
            outcome.stopped = Stopped.answered
            return outcome

        # The budget is checked before running the calls, not after: a run
        # that has spent its steps should not perform one more and then
        # report having stopped.
        if ordinal + len(uses) > max_steps:
            outcome.answer = _text_of(response)
            outcome.stopped = Stopped.step_limit
            log.info(
                "agent.step_limit",
                toolset=toolset.name,
                steps=len(outcome.steps),
                max_steps=max_steps,
            )
            return outcome

        messages.append({"role": "assistant", "content": response.content})
        results: list[dict[str, Any]] = []
        #: The assistant's own words in this turn — its status line for
        #: the work it is about to do. Carried on the first step of the
        #: turn only; see `Step.said`.
        said = _text_of(response)

        for use in uses:
            ordinal += 1
            started = time.monotonic()
            arguments = dict(use.input) if isinstance(use.input, dict) else {}
            result = toolset.run(workspace, use.name, arguments)
            elapsed = int((time.monotonic() - started) * 1000)

            step = Step(
                ordinal=ordinal,
                tool=use.name,
                arguments=arguments,
                ok=result.ok,
                summary=result.summary,
                milliseconds=elapsed,
                data=result.data,
                said=said,
            )
            said = ""
            outcome.steps.append(step)
            if on_step is not None:
                on_step(step)
            results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": use.id,
                    "content": _serialise(result.data),
                    "is_error": not result.ok,
                }
            )

        #: A second, moving cache breakpoint at the end of what has
        #: happened so far. Every turn re-sends the whole conversation
        #: — a four-call answer sends three rounds of tool payloads
        #: again on the fourth — and those bytes are identical each
        #: time, so marking the newest one means the model reads the
        #: history from cache instead of afresh. The previous mark is
        #: cleared first: the API allows four breakpoints per request,
        #: and a run of twelve steps would otherwise exceed it.
        if marked is not None:
            marked.pop("cache_control", None)
        results[-1]["cache_control"] = {"type": "ephemeral"}
        marked = results[-1]

        messages.append({"role": "user", "content": results})


def _serialise(data: dict[str, Any]) -> str:
    import json

    return json.dumps(data, ensure_ascii=False, default=str)


__all__ = [
    "AGENT_MODEL",
    "EFFORT",
    "MAX_STEPS",
    "Client",
    "Outcome",
    "Step",
    "Stopped",
    "Toolset",
    "run",
]
