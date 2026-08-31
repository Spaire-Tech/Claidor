"""The run as the person watches it — the founder's status lines.

The rule being pinned is the founder's own, quoted in
`prompt_voice.md`: « one short status line per step. Present tense,
three to six words, **naming the real object**. Good: "Reading the debt
schedule". Bad: "Analyzing your data" ».

Two properties carry that, and both are here.

**The assistant's own line wins.** It writes one before it calls the
tool, and that is what the screen shows — it knows what it is doing
better than a lookup table does.

**Silence still names the object.** When it calls a tool without a word,
the line is built from the arguments it actually passed, so the screen
shows « Walking back from Debt!F44 » and never a template with the
model's name pasted into it.
"""

from typing import Any

from polar.agent import Step
from polar.tieout.agent.status import TITLES, derived_line, stage


def a_step(
    tool: str,
    arguments: dict[str, Any] | None = None,
    *,
    ok: bool = True,
    summary: str = "did the thing",
    said: str = "",
    data: dict[str, Any] | None = None,
) -> Step:
    return Step(
        ordinal=1,
        tool=tool,
        arguments=arguments or {},
        ok=ok,
        summary=summary,
        data=data or {},
        said=said,
    )


class TestTheLineNamesTheRealObject:
    """No branch may answer with a sentence that fits every run."""

    def test_a_search_says_what_was_searched_for(self) -> None:
        assert derived_line("locate", {"query": "debt service"}) == (
            "Looking for « debt service »"
        )

    def test_a_walk_back_says_which_cell(self) -> None:
        assert derived_line("trace_back", {"ref": "Debt!F44"}) == (
            "Walking back from Debt!F44"
        )

    def test_a_walk_forward_says_which_cell(self) -> None:
        assert derived_line("trace_forward", {"ref": "Debt!F44"}) == (
            "Following Debt!F44 downstream"
        )

    def test_an_inventory_says_which_sheet_and_which_kind(self) -> None:
        line = derived_line(
            "inventory", {"kind": "hardcodes", "sheet": "Debt Schedule"}
        )

        assert line == "Listing the buried numbers on Debt Schedule"

    def test_an_inventory_without_a_sheet_does_not_invent_one(self) -> None:
        assert derived_line("inventory", {"kind": "typed"}) == (
            "Listing the typed inputs"
        )

    def test_a_source_check_says_which_number(self) -> None:
        assert derived_line("sources", {"ref": "Assumptions!C31"}) == (
            "Checking where Assumptions!C31 came from"
        )

    def test_every_line_is_short_enough_to_read_at_a_glance(self) -> None:
        #: « three to six words » is the founder's rule. The derived
        #: lines carry a ref or a label, which counts as one, so the
        #: measurable version is: no line runs long enough to wrap.
        for tool, arguments in (
            ("locate", {"query": "cash available for debt service"}),
            ("trace_back", {"ref": "Debt!F44"}),
            ("trace_forward", {"ref": "Debt!F44"}),
            ("inventory", {"kind": "external-links", "sheet": "Ops"}),
            ("structure", {}),
            ("versions", {}),
            ("sources", {"ref": "Assumptions!C31"}),
        ):
            assert len(derived_line(tool, arguments)) <= 60, tool

    def test_no_line_is_one_of_the_founders_bad_examples(self) -> None:
        banned = ("analy", "thinking", "almost done", "working on", "processing")
        for tool in TITLES:
            line = derived_line(tool, {}).lower()
            assert not any(word in line for word in banned), line


class TestWhoseWordsTheseAre:
    def test_the_assistants_own_line_is_the_one_shown(self) -> None:
        one = stage(
            a_step("trace_back", {"ref": "Debt!F44"}, said="Reading the debt schedule")
        )

        assert one.sub == "Reading the debt schedule"

    def test_silence_falls_back_to_the_arguments(self) -> None:
        one = stage(a_step("trace_back", {"ref": "Debt!F44"}))

        assert one.sub == "Walking back from Debt!F44"

    def test_the_tools_own_summary_is_kept_beside_it(self) -> None:
        #: The line is prose and the summary is evidence. Showing one
        #: must never cost the other: the trace is what a person opens
        #: to check the answer.
        one = stage(a_step("trace_back", summary="Walked back from F44 (6 inputs)"))

        assert one.summary == "Walked back from F44 (6 inputs)"


class TestTheCardUnderTheStep:
    """« Empty » is a state the design draws, not a gap to fill."""

    def test_the_workbook_is_named_with_its_version(self) -> None:
        one = stage(a_step("structure"), model="Northbank Bid Model.xlsx", version=22)

        assert one.art == "Northbank Bid Model.xlsx v22"

    def test_an_unnamed_workbook_leaves_the_skeleton(self) -> None:
        assert stage(a_step("structure")).art == ""

    def test_a_source_step_names_the_document_not_the_workbook(self) -> None:
        one = stage(
            a_step("sources", data={"document": "Credit Agreement (Amended)"}),
            model="Northbank Bid Model.xlsx",
            version=22,
        )

        assert one.art == "Credit Agreement (Amended)"

    def test_a_source_step_that_found_nothing_names_nothing(self) -> None:
        one = stage(a_step("sources"), model="Northbank.xlsx", version=22)

        assert one.art == ""

    def test_a_refused_step_produced_nothing(self) -> None:
        one = stage(
            a_step("locate", ok=False, summary="Nothing is named like that"),
            model="Northbank.xlsx",
            version=22,
        )

        assert one.art == ""
        assert not one.ok

    def test_a_question_back_is_not_a_thing_produced(self) -> None:
        one = stage(a_step("ask_the_person"), model="Northbank.xlsx", version=22)

        assert one.art == ""


class TestTheIcon:
    def test_the_workbook_tools_show_the_workbook(self) -> None:
        assert stage(a_step("trace_back")).kind == "model"

    def test_the_one_tool_that_leaves_the_model_says_so(self) -> None:
        #: `sources` is the only tool here that reads something other
        #: than the workbook, and the icon beside it has to agree.
        assert stage(a_step("sources")).kind == "source"


class TestTheTitle:
    def test_every_tool_has_one(self) -> None:
        from polar.tieout.agent.model_tools import DEFINITIONS

        for one in DEFINITIONS:
            assert one["name"] in TITLES, one["name"]

    def test_the_title_is_the_activity_and_the_sub_is_the_object(self) -> None:
        #: The design holds the title still while sub-lines pass beneath
        #: it. Two calls to the same tool must therefore share a title
        #: and differ in the line under it.
        first = stage(a_step("locate", {"query": "DSCR"}))
        second = stage(a_step("locate", {"query": "debt service"}))

        assert first.title == second.title == "Reading the workbook"
        assert first.sub != second.sub
