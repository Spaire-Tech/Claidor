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
    )


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

    def test_versions_carry_the_diff(self, model: ModelWorkspace) -> None:
        result = run_tool(model, "versions", {})
        assert result.ok
        assert result.data["changed"] == 1
        assert result.data["rows"][0]["ref"] == "Opex!C4"


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
        ]:
            result = run_tool(model, name, args)
            assert result.ok, name
            for row in result.data["rows"]:
                assert set(row) == {"ref", "what", "value"}, name
