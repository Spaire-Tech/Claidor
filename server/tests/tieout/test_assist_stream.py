"""What the streaming answer puts on the wire.

The screen draws a run from these objects, so the shapes are the
contract and this is where they are pinned. Three properties matter.

**The two routes cannot disagree.** `/assist` and `/assist/stream`
differ in *when* a screen learns what happened, never in what happened —
so both build their payload with the same function, and the trace and
the run are two views of one list of steps rather than two lists.

**One line is one object.** The stream is newline-delimited JSON, and a
summary carrying a newline — a tool's own sentence, which nothing stops
from wrapping — would split one event into two unparseable halves.

**Empty stays empty.** A step that produced nothing named sends an empty
`art`, and the design draws its skeleton there. Filling it with the
workbook's name would be this file inventing a result.
"""

import asyncio
import json
from typing import Any
from uuid import UUID, uuid4

import pytest

from polar.agent import Outcome, Step
from polar.tieout.endpoints import _as_they_happen, _asked, _ndjson, _stage


class FakeTask:
    """The stored record, as `_asked` reads it."""

    def __init__(self, answer: str = "It balances.") -> None:
        self.id: UUID = uuid4()
        self.prompt = "Does it balance?"
        self.answer = answer
        self.stopped = "answered"
        self.error: str | None = None


class FakeArtifact:
    def __init__(self, filename: str, version: int) -> None:
        self.filename = filename
        self.version = version


def a_step(
    ordinal: int,
    tool: str = "trace_back",
    *,
    ok: bool = True,
    summary: str = "Walked back from Debt!F44 (6 direct inputs)",
    data: dict[str, Any] | None = None,
    said: str = "",
) -> Step:
    return Step(
        ordinal=ordinal,
        tool=tool,
        arguments={"ref": "Debt!F44"},
        ok=ok,
        summary=summary,
        milliseconds=12,
        data=data or {},
        said=said,
    )


def an_outcome(*steps: Step) -> Outcome:
    return Outcome(answer="It balances.", steps=list(steps))


class TestTheTraceAndTheRunAreTheSameRun:
    def test_there_is_one_stage_for_every_step(self) -> None:
        answer = _asked(
            FakeTask(),
            an_outcome(a_step(1), a_step(2, "structure"), a_step(3, "sources")),
            FakeArtifact("Northbank.xlsx", 22),
            [],
        )

        assert len(answer.stages) == len(answer.steps) == 3

    def test_they_agree_on_the_order_and_on_what_was_said(self) -> None:
        #: The trace is what a reader opens to check the answer and the
        #: run is what they watched happen. Two lists that could drift
        #: would let one of those be wrong without the other showing it.
        answer = _asked(
            FakeTask(),
            an_outcome(a_step(1), a_step(2, "structure", summary="7 sheets mapped")),
            FakeArtifact("Northbank.xlsx", 22),
            [],
        )

        assert [one.ordinal for one in answer.stages] == [
            one.ordinal for one in answer.steps
        ]
        assert [one.summary for one in answer.stages] == [
            one.summary for one in answer.steps
        ]

    def test_a_refused_step_is_kept_in_both(self) -> None:
        #: « No such cell » is a fact about the run. A run that showed
        #: only what worked would read as though it went straight to the
        #: answer.
        answer = _asked(
            FakeTask(),
            an_outcome(a_step(1, "locate", ok=False, summary="Nothing named that")),
            None,
            [],
        )

        assert len(answer.stages) == 1
        assert answer.stages[0].ok is False
        assert answer.steps[0].ok is False


class TestWhatTheRunSaysItProduced:
    def test_the_workbook_is_named_with_its_version(self) -> None:
        one = _stage(a_step(1, "structure"), "Northbank.xlsx", 22)

        assert one.art == "Northbank.xlsx v22"

    def test_a_deal_with_no_model_names_nothing(self) -> None:
        answer = _asked(FakeTask(), an_outcome(a_step(1)), None, [])

        assert answer.stages[0].art == ""
        assert answer.model is None

    def test_the_assistants_own_line_reaches_the_screen(self) -> None:
        one = _stage(a_step(1, said="Reading the debt schedule"), "Northbank.xlsx", 22)

        assert one.sub == "Reading the debt schedule"

    def test_a_silent_step_still_names_the_cell(self) -> None:
        one = _stage(a_step(1), "Northbank.xlsx", 22)

        assert one.sub == "Walking back from Debt!F44"


class TestOneLineIsOneObject:
    def test_a_summary_that_wraps_does_not_split_the_event(self) -> None:
        line = _ndjson(
            {
                "kind": "stage",
                **_stage(
                    a_step(1, summary="Walked back\nand found six inputs"),
                    "Northbank.xlsx",
                    22,
                ).model_dump(),
            }
        )

        assert line.count("\n") == 1
        assert line.endswith("\n")
        assert json.loads(line)["summary"] == "Walked back\nand found six inputs"

    def test_the_finished_answer_survives_the_round_trip(self) -> None:
        #: The `done` event carries the whole answer, and it goes
        #: through `model_dump(mode="json")` so a UUID and a datetime
        #: are strings by the time `json.dumps` sees them.
        answer = _asked(
            FakeTask(),
            an_outcome(a_step(1)),
            FakeArtifact("Northbank.xlsx", 22),
            [FakeArtifact("Macro.xlsm", 3)],
        )
        read = json.loads(_ndjson({"kind": "done", **answer.model_dump(mode="json")}))

        assert read["kind"] == "done"
        assert read["model"] == "Northbank.xlsx"
        assert read["other_models"] == ["Macro.xlsm (v3)"]
        assert read["stages"][0]["title"] == "Tracing the number back"


class TestTheClarifyStillComesThrough:
    def test_a_question_back_travels_with_the_rest(self) -> None:
        asked = a_step(
            1,
            "ask_the_person",
            summary="Asked: chain only, or everything upstream?",
            data={
                "await_person": True,
                "question": "Chain only, or everything upstream?",
                "card": {"title": "Targeted Check", "blurb": "Every check"},
                "options": ["Chain only", "Everything upstream"],
            },
        )

        answer = _asked(FakeTask(), an_outcome(asked), None, [])

        assert answer.clarify is not None
        assert answer.clarify.options == ["Chain only", "Everything upstream"]
        #: And it is a step of the run like any other — the person saw
        #: it happen.
        assert answer.stages[0].tool == "ask_the_person"


class TestTheStepsLeaveBeforeTheRunEnds:
    """The interleaving, driven on its own.

    Everything else in this file is about shapes. This is about timing,
    which is the part the streaming route exists for: a step has to
    reach the client while the run is still going, and a step queued in
    the same instant the run finished must not be lost.
    """

    @pytest.mark.asyncio
    async def test_a_step_arrives_while_the_run_is_still_going(self) -> None:
        queue: asyncio.Queue[Step] = asyncio.Queue()
        started = asyncio.Event()

        async def slow() -> Outcome:
            queue.put_nowait(a_step(1))
            await started.wait()
            return an_outcome(a_step(1))

        runner = asyncio.ensure_future(slow())
        seen: list[Step] = []
        async for step in _as_they_happen(runner, queue):
            seen.append(step)
            #: The first step is in hand and the run has not returned:
            #: exactly the state the screen is drawn from.
            assert not runner.done()
            started.set()

        assert [one.ordinal for one in seen] == [1]

    @pytest.mark.asyncio
    async def test_a_step_queued_as_the_run_ended_is_still_sent(self) -> None:
        #: The last tool call and the model's closing answer land within
        #: milliseconds of each other, so this is the normal case.
        queue: asyncio.Queue[Step] = asyncio.Queue()

        async def quick() -> Outcome:
            queue.put_nowait(a_step(1))
            queue.put_nowait(a_step(2))
            return an_outcome(a_step(1), a_step(2))

        runner = asyncio.ensure_future(quick())
        await runner

        seen = [step async for step in _as_they_happen(runner, queue)]

        assert [one.ordinal for one in seen] == [1, 2]

    @pytest.mark.asyncio
    async def test_a_run_with_no_steps_sends_none(self) -> None:
        queue: asyncio.Queue[Step] = asyncio.Queue()

        async def straight() -> Outcome:
            return an_outcome()

        runner = asyncio.ensure_future(straight())

        assert [step async for step in _as_they_happen(runner, queue)] == []
