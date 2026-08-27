"""The assistant's tools, on a workbook small enough to check by hand.

The assistant answers « what is this model » for someone who did not
build it, and every claim in an answer must come out of these tools.
What is covered here is the property that makes an answer trustworthy:
the rows are the graph's own facts, the walks end honestly at typed
inputs, and questions the file cannot answer are refused with a
sentence rather than approximated.

No database and no network — the tools are pure functions over a
workspace loaded before the loop starts, which is also the reason they
cannot reach another model.
"""

from uuid import uuid4

import pytest

from polar.tieout.agent.model_tools import (
    ModelWorkspace,
    build_workspace,
    run_tool,
)
from polar.tieout.structure import period_axes
from polar.tieout.workbook import Cell, Workbook


def _cell(
    ref: str,
    *,
    value: float | None = None,
    row_label: str = "",
    column_label: str = "",
    formula: str | None = None,
    precedents: tuple[str, ...] = (),
) -> Cell:
    from decimal import Decimal

    sheet, coordinate = ref.split("!")
    column = "".join(ch for ch in coordinate if ch.isalpha())
    row = int("".join(ch for ch in coordinate if ch.isdigit()))
    return Cell(
        sheet=sheet,
        ref=ref,
        row=row,
        column=ord(column) - ord("A") + 1,
        value=None if value is None else Decimal(str(value)),
        formula=formula,
        row_label=row_label,
        column_label=column_label,
        precedents=precedents,
        unresolved=(),
    )


@pytest.fixture
def model() -> ModelWorkspace:
    book = Workbook()
    cells = [
        _cell("Inputs!B2", value=0.027, row_label="Indexation"),
        _cell("Opex!C4", value=18_099, row_label="Opex", column_label="FY2028"),
        _cell(
            "Opex!D4",
            value=18_587.7,
            row_label="Opex",
            column_label="FY2029",
            formula="=C4*(1+Inputs!$B$2)",
            precedents=("Opex!C4", "Inputs!B2"),
        ),
        _cell(
            "Opex!C9",
            value=20_199,
            row_label="Opex total",
            formula="=SUM(C4:C8)",
            precedents=("Opex!C4",),
        ),
        _cell(
            "Returns!B2",
            value=0.104,
            row_label="Equity IRR",
            formula="=Opex!C9*$B$1",
            precedents=("Opex!C9", "Returns!B1"),
        ),
        _cell("Returns!B1", value=0.0000031, row_label="Unit"),
        _cell(
            "Debt!C4",
            value=128_400_000,
            row_label="Senior interest",
        ),
    ]
    for cell in cells:
        book.cells[cell.ref] = cell
    book.sheets = ["Inputs", "Opex", "Debt", "Returns"]
    return build_workspace(
        dossier_id=uuid4(),
        name="Harbour PFI",
        filename="harbour.xlsx",
        version=2,
        book=book,
        axes=period_axes(book),
        versions_list=[
            {"version": 2, "by": "d", "when": "17 August"},
            {"version": 1, "by": "d", "when": "16 August"},
        ],
        diff={
            "from_version": 1,
            "to_version": 2,
            "changed": [{"ref": "Opex!C4", "was": "17,900", "now": "18,099"}],
            "added": 0,
            "removed": 0,
        },
        sources_map={
            "Inputs!B2": {
                "document": "audited_accounts_fy24.pdf",
                "location": "page 42",
                "label": "audited_accounts_fy24.pdf · page 42",
                "printed": "2.7%",
                "context": "RPI indexation for the year to 31 December 2024",
                "state": "confirmed",
                "note": "confirmed by someone on this deal",
            }
        },
        sources_read=1,
    )


@pytest.fixture
def ungrounded(model: ModelWorkspace) -> ModelWorkspace:
    """The same model on a deal where no source document was ever read."""
    model.sources = {}
    model.sources_read = 0
    return model


class TestTraceBack:
    def test_reaches_the_typed_inputs(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "trace_back", {"ref": "Returns!B2"})
        assert result.ok
        refs = [row["ref"] for row in result.data["rows"]]
        assert refs[0] == "Returns!B2"
        assert "Opex!C9" in refs
        #: The walk says where it stops, in words.
        assert any("typed input" in end for end in result.data["chain_ends"])

    def test_a_label_resolves_before_walking(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "trace_back", {"ref": "Equity IRR"})
        assert result.ok
        assert result.data["rows"][0]["ref"] == "Returns!B2"

    def test_a_missing_cell_is_refused(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "trace_back", {"ref": "Nope!Z99"})
        assert not result.ok
        assert "not in harbour.xlsx" in result.summary


class TestTraceForward:
    def test_reach_is_counted_from_real_edges(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "trace_forward", {"ref": "Opex!C4"})
        assert result.ok
        #: C4 → D4, C9 → Returns!B2: three cells, three sheets... two
        #: sheets beyond Opex. The numbers are checkable by hand.
        assert result.data["reach_cells"] == 3
        assert "Returns" in result.data["reach_sheets"]

    def test_a_cell_nothing_reads_says_so(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "trace_forward", {"ref": "Debt!C4"})
        assert result.ok
        assert result.data["reach_cells"] == 0
        assert "Nothing in the model reads" in result.summary


class TestInventory:
    def test_typed_inputs_are_listed(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "inventory", {"kind": "typed"})
        assert result.ok
        refs = {row["ref"] for row in result.data["rows"]}
        assert "Inputs!B2" in refs
        assert "Debt!C4" in refs
        #: Formula cells are not typed inputs.
        assert "Opex!D4" not in refs

    def test_an_unknown_sheet_is_refused_with_the_real_ones(
        self, model: ModelWorkspace
    ) -> None:
        result = run_tool(model, "inventory", {"kind": "typed", "sheet": "Nope"})
        assert not result.ok
        assert "Opex" in result.summary

    def test_an_unknown_kind_is_refused(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "inventory", {"kind": "everything"})
        assert not result.ok


class TestStructureAndVersions:
    def test_sheets_come_in_the_workbook_order(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "structure", {})
        assert result.ok
        assert [row["ref"] for row in result.data["rows"]] == [
            "Inputs",
            "Opex",
            "Debt",
            "Returns",
        ]

    def test_versions_fall_back_to_the_diff_when_the_files_are_gone(
        self, model: ModelWorkspace
    ) -> None:
        """No Watch reading available — and the answer says so.

        A reviewer told « 1 cell changed » will not guess that the
        reviewed reading was the thing that failed, so the note is the
        point of this test, not the count.
        """
        result = run_tool(model, "versions", {})
        assert result.ok
        assert result.data["changed"] == 1
        assert result.data["rows"][0]["ref"] == "Opex!C4"
        assert "not the reviewed reading" in result.data["note"]

    def test_versions_speak_the_watchs_review_language(
        self, model: ModelWorkspace
    ) -> None:
        """The revision's authoring decisions, not its cell moves.

        « Opex!C4 17,900 → 18,099 » is a true answer to « what changed »
        the way a diff is a true answer. What a reviewer asked is what
        the revision *did*, which is the Watch's own reading.
        """

        class _Item:
            kind = "methodology_change"
            sheet = "Opex"
            first_row = 4
            last_row = 4
            columns = ("C",)
            detail = "indexation moved from a typed rate to Inputs!B2"
            weight = 1.0
            findings = ()

        class _Report:
            items = [_Item()]
            new_defects = 0
            repaired_defects = 1
            persistent_defects = 2
            sheets_added = ()
            sheets_removed = ()
            summary = {
                "new_defects": 0,
                "repaired_defects": 1,
                "persistent_defects": 2,
                "methodology_change": 1,
            }

        model.delta = lambda: _Report()
        result = run_tool(model, "versions", {})
        assert result.ok
        assert "formula rewritten to compute differently" in result.summary
        assert result.data["counts"]["methodology_change"] == 1
        assert result.data["rows"][0]["ref"] == "Opex!C4"
        assert "indexation moved" in result.data["rows"][0]["what"]
        #: The half the Watch cannot see — this deal's own deliverables —
        #: still rides along.
        assert result.data["cells_changed"] == 1

    def test_a_watch_that_cannot_read_does_not_lose_the_tool(
        self, model: ModelWorkspace
    ) -> None:
        """Dropped bytes cost the reviewed reading, not the answer."""

        def _boom() -> None:
            raise RuntimeError("the stored file was not kept")

        model.delta = _boom
        result = run_tool(model, "versions", {})
        assert result.ok
        assert result.data["changed"] == 1
        assert "not the reviewed reading" in result.data["note"]

    def test_the_watch_is_not_read_until_versions_is_asked(
        self, model: ModelWorkspace
    ) -> None:
        """Two file reads must not ride on « what feeds equity IRR ».

        The workspace loads before the loop starts, so anything eager
        there is paid by every question. This is the guard on that.
        """
        calls = []

        def _delta() -> None:
            calls.append(1)
            raise RuntimeError("no report here")

        model.delta = _delta
        run_tool(model, "trace_back", {"ref": "Returns!B2"})
        run_tool(model, "inventory", {"kind": "typed"})
        assert calls == []
        run_tool(model, "versions", {})
        run_tool(model, "versions", {})
        #: Once, and cached — not once per question.
        assert calls == [1]


class TestSources:
    """« Where is this from » — the one answer that leaves the workbook.

    Every other tool reads the model. This one reports a fact the model
    cannot hold: that a typed input was matched to a figure printed on
    a page. The tests below are mostly about what it must *not* say,
    because a guess at provenance is the one claim a banker would
    repeat to a client without checking.
    """

    def test_a_grounded_input_names_its_document_and_page(
        self, model: ModelWorkspace
    ) -> None:
        result = run_tool(model, "sources", {"ref": "Inputs!B2"})
        assert result.ok
        assert "audited_accounts_fy24.pdf · page 42" in result.summary
        assert result.data["location"] == "page 42"
        assert result.data["state"] == "confirmed"
        #: The sentence as printed, not the label the matcher used.
        assert "31 December 2024" in result.data["context"]

    def test_a_label_resolves_the_same_as_a_ref(self, model: ModelWorkspace) -> None:
        """A reviewer asks « where is the indexation from », not « B2 »."""
        result = run_tool(model, "sources", {"ref": "Indexation"})
        assert result.ok
        assert result.data["document"] == "audited_accounts_fy24.pdf"

    def test_a_calculated_cell_walks_to_the_typed_inputs_behind_it(
        self, model: ModelWorkspace
    ) -> None:
        """The question is almost always asked about a computed line.

        Declining it because the cell is a formula would be correct and
        useless: the provenance is one walk away, through the same
        precedent graph every other tool here reads.
        """
        result = run_tool(model, "sources", {"ref": "Opex!D4"})
        assert result.ok
        assert result.data["calculated"] is True
        assert [row["ref"] for row in result.data["rows"]] == ["Inputs!B2"]
        #: Opex!C4 is typed and carries nothing — counted, not hidden.
        assert result.data["ungrounded_inputs"] == 1

    def test_a_typed_input_with_no_document_says_which_kind_of_nothing(
        self, model: ModelWorkspace
    ) -> None:
        result = run_tool(model, "sources", {"ref": "Debt!C4"})
        assert result.ok
        assert "no source document backs it" in result.summary
        #: Documents *were* read here — so the answer is « none matched »,
        #: which is a different fact from « nobody looked ».
        assert "was matched to it" in result.data["note"]

    def test_a_deal_with_no_source_document_says_that_instead(
        self, ungrounded: ModelWorkspace
    ) -> None:
        """« Nothing matched » and « nobody looked » are different answers.

        Flattening them would tell a reviewer the documents disagree
        with the model when nobody has read one.
        """
        result = run_tool(ungrounded, "sources", {"ref": "Debt!C4"})
        assert result.ok
        assert "no source document has been read" in result.data["note"]
        listing = run_tool(ungrounded, "sources", {})
        assert listing.ok
        assert "No source document has been read" in listing.data["note"]

    def test_listing_says_what_is_sourced_at_all(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "sources", {})
        assert result.ok
        assert result.data["grounded"] == 1
        assert result.data["rows"][0]["ref"] == "Inputs!B2"

    def test_a_cell_outside_the_model_is_refused_not_guessed(
        self, model: ModelWorkspace
    ) -> None:
        result = run_tool(model, "sources", {"ref": "Nowhere!Z99"})
        assert not result.ok
        assert "harbour.xlsx" in result.summary

    def test_a_values_pasted_copy_says_so_before_it_says_nothing(
        self, ungrounded: ModelWorkspace
    ) -> None:
        """« Typed, nothing behind it » is a libel on a stripped copy.

        A published copy with the formulas removed answers every
        provenance question the same way, and a reader takes that for a
        finding about the model. Found on a real corpus model whose
        blended equity IRR — a computed line in anybody's model — came
        back as a typed value with nothing behind it, because the copy
        holds 224 formulas in 432,596 cells.
        """
        ungrounded.counts = {"cells": 432_596, "formulas": 224}
        result = run_tool(ungrounded, "sources", {"ref": "Debt!C4"})
        assert result.ok
        assert "224 of 432,596" in result.data["values_only"]
        listing = run_tool(ungrounded, "sources", {})
        assert "values only" in listing.data["values_only"]

    def test_a_working_copy_carries_no_such_qualification(
        self, ungrounded: ModelWorkspace
    ) -> None:
        ungrounded.counts = {"cells": 3_000, "formulas": 1_900}
        result = run_tool(ungrounded, "sources", {"ref": "Debt!C4"})
        assert "values_only" not in result.data


class TestRows:
    def test_every_tool_row_is_ref_what_value(self, model: ModelWorkspace) -> None:
        """One shape, so the screen draws every answer the same way and
        the rows never need the language model to re-type them."""
        for name, args in [
            ("locate", {"query": "Opex"}),
            ("trace_back", {"ref": "Returns!B2"}),
            ("trace_forward", {"ref": "Opex!C4"}),
            ("inventory", {"kind": "typed"}),
            ("structure", {}),
            ("versions", {}),
            ("sources", {}),
            ("sources", {"ref": "Inputs!B2"}),
        ]:
            result = run_tool(model, name, args)
            assert result.ok, name
            for row in result.data["rows"]:
                assert set(row) == {"ref", "what", "value"}, name
