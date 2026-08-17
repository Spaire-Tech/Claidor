"""The dependents walk, on a workbook small enough to check by hand.

The fixture is the design's own sentence: a typed cell in an Opex row
that flows into « Opex total », then across a sheet into « Equity IRR ».
The negative case matters as much — a cell nothing reads walks nowhere,
and saying so is the honest answer, not a gap.
"""

from polar.tieout.flows import dependents_index, flow
from polar.tieout.workbook import Cell, Workbook


def _cell(
    ref: str,
    *,
    row_label: str = "",
    formula: str | None = None,
    precedents: tuple[str, ...] = (),
) -> Cell:
    sheet, coordinate = ref.split("!")
    column = "".join(ch for ch in coordinate if ch.isalpha())
    row = int("".join(ch for ch in coordinate if ch.isdigit()))
    return Cell(
        sheet=sheet,
        ref=ref,
        row=row,
        column=ord(column) - ord("A") + 1,
        value=None,
        formula=formula,
        row_label=row_label,
        column_label="",
        precedents=precedents,
        unresolved=(),
    )


def _book(*cells: Cell) -> Workbook:
    book = Workbook()
    for cell in cells:
        book.cells[cell.ref] = cell
    book.sheets = list(dict.fromkeys(cell.sheet for cell in cells))
    return book


def test_the_walk_names_where_the_value_goes() -> None:
    book = _book(
        _cell("Opex!C4", row_label="Opex"),
        _cell(
            "Opex!C9",
            row_label="Opex total",
            formula="=SUM(C4:C8)",
            precedents=("Opex!C4", "Opex!C5", "Opex!C6", "Opex!C7", "Opex!C8"),
        ),
        _cell(
            "Returns!C2",
            row_label="Equity IRR",
            formula="=Opex!C9*2",
            precedents=("Opex!C9",),
        ),
    )
    index = dependents_index(book)
    assert flow(book, index, "Opex!C4") == ["Opex total", "Equity IRR"]


def test_a_row_is_not_said_to_flow_into_itself() -> None:
    """FY2033 feeds FY2034 along the same row. The walk steps through
    the row's own label to what actually differs downstream."""
    book = _book(
        _cell("M!B2", row_label="Revenue"),
        _cell("M!C2", row_label="Revenue", formula="=B2*1.02", precedents=("M!B2",)),
        _cell("M!C5", row_label="EBITDA", formula="=C2-C3", precedents=("M!C2",)),
    )
    index = dependents_index(book)
    assert flow(book, index, "M!B2") == ["EBITDA"]


def test_a_cell_nothing_reads_walks_nowhere() -> None:
    book = _book(
        _cell("M!B2", row_label="Orphan"),
        _cell("M!B3", row_label="Total", formula="=B4", precedents=("M!B4",)),
    )
    index = dependents_index(book)
    assert flow(book, index, "M!B2") == []


def test_an_unnamed_sheet_crossing_falls_back_to_the_sheet_name() -> None:
    book = _book(
        _cell("Inputs!B2", row_label="Base rate"),
        _cell("Databook!D9", formula="=Inputs!B2", precedents=("Inputs!B2",)),
    )
    index = dependents_index(book)
    assert flow(book, index, "Inputs!B2") == ["Databook"]
