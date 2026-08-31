"""C2 — what a row *is*, said without its position or its values.

The amendment's point: alignment runs on row/column signatures of
label + formula shape, never on raw values, so the mapping between
two versions survives a full re-forecast. The shape comes from the
engine's frozen interface `polar.tieout.audit._shape` — used as a
library, never reimplemented, never changed from this package.

Registered in `docs/pierce/logs/prism.md` (« C2 registration,
part 1 ») before any corpus number existed.
"""

import re
from collections import Counter
from dataclasses import dataclass

from polar.tieout.audit import _shape
from polar.tieout.workbook import Workbook

#: The signature of a hardcoded literal. Any fixed marker works; the
#: point is that every literal looks the same, so a retyped input
#: cannot break a row match.
LITERAL = "•"

#: A sheet-qualified piece of a shape, with an optional range tail —
#: `SelectedInputs!R[-307]C[+0]` or `'Annual Inflation'!R[-1]C[+0]:R[+5]C[+0]`.
_QUALIFIED = re.compile(
    r"(?P<sheet>'[^']+'|[A-Za-z0-9_.]+)!"
    r"(?P<piece>R(?:\[[+-]?\d+\]|\d+)C(?:\[[+-]?\d+\]|[A-Z]{1,3})"
    r"(?::R(?:\[[+-]?\d+\]|\d+)C(?:\[[+-]?\d+\]|[A-Z]{1,3}))?)"
)
_RELATIVE = re.compile(r"(?P<kind>[RC])\[(?P<offset>[+-]?\d+)\]")


def _column_letters(number: int) -> str:
    letters = ""
    while number > 0:
        number, remainder = divmod(number - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _absolute(shape: str, sheet: str, row: int, column: int) -> str:
    """Round 3's amendment (registered in the lane log): a shape piece
    qualified with a *different* sheet's name gets its relative
    offsets rewritten to the absolute target, range tails included —
    because `=SelectedInputs!E64` does not move when its cell does,
    and encoding it relative to the cell made every pull-through row
    change shape under a plain row shift. Same-sheet and unqualified
    pieces stay relative: those really do shift with their cells
    under Excel's reference updating."""
    if "!" not in shape:
        return shape

    def fix_piece(match: re.Match[str]) -> str:
        name = match.group("sheet")
        if name.strip("'") == sheet:
            return match.group(0)

        def fix_ref(ref: re.Match[str]) -> str:
            offset = int(ref.group("offset"))
            if ref.group("kind") == "R":
                target = row + offset
                return f"R{target}" if target > 0 else ref.group(0)
            target = column + offset
            return f"C{_column_letters(target)}" if target > 0 else ref.group(0)

        return name + "!" + _RELATIVE.sub(fix_ref, match.group("piece"))

    return _QUALIFIED.sub(fix_piece, shape)


def _normal(text: str) -> str:
    return " ".join(text.split()).lower()


@dataclass(frozen=True)
class Line:
    """One row (or one column — the aligner never cares which)."""

    #: The row number, or the column number.
    index: int
    #: Normalized label text; empty when the sheet offers none.
    label: str
    #: (position across the line, cell signature), in order.
    cells: tuple[tuple[int, str], ...]
    #: The signature sequence, materialized once at construction —
    #: the aligner reads it R×N times per sheet, and rebuilding the
    #: tuple per read was measurable churn in the memory round.
    signatures: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.signatures and self.cells:
            object.__setattr__(
                self, "signatures", tuple(signature for _, signature in self.cells)
            )


@dataclass(frozen=True)
class SheetGrid:
    sheet: str
    rows: tuple[Line, ...]
    columns: tuple[Line, ...]


def cell_signature(
    formula: str | None, shape: str, sheet: str = "", row: int = 0, column: int = 0
) -> str:
    """A cell's signature from its formula and its engine shape: the
    literal marker, the shape with its cross-sheet pieces made
    absolute, or — when the shape machinery returns empty for an
    unparseable formula — the raw formula text, which is still
    deterministic and still position-blind enough to compare."""
    if formula is None:
        return LITERAL
    if not shape:
        return formula
    return _absolute(shape, sheet, row, column)


def sheet_grids(book: Workbook) -> dict[str, SheetGrid]:
    """Row and column signature lines for every sheet with cells.

    A row with no populated cells is invisible here: there is nothing
    to align. Its index gap is what the alignment later reports as a
    shift. Row labels prefer the engine's `row_words` (which holds
    label text even for rows the labeller gave no numeric cell);
    column labels take the most common non-empty `column_label` down
    the column.
    """
    per_sheet: dict[str, dict[int, dict[int, str]]] = {}
    row_label_fallback: dict[str, dict[int, str]] = {}
    column_votes: dict[str, dict[int, Counter[str]]] = {}

    for cell in book.cells.values():
        signature = cell_signature(
            cell.formula, _shape(cell), cell.sheet, cell.row, cell.column
        )
        per_sheet.setdefault(cell.sheet, {}).setdefault(cell.row, {})[cell.column] = (
            signature
        )
        if cell.row_label:
            row_label_fallback.setdefault(cell.sheet, {}).setdefault(
                cell.row, cell.row_label
            )
        if cell.column_label:
            column_votes.setdefault(cell.sheet, {}).setdefault(cell.column, Counter())[
                cell.column_label
            ] += 1

    grids: dict[str, SheetGrid] = {}
    for sheet, by_row in per_sheet.items():
        words = book.row_words.get(sheet, {})
        fallback = row_label_fallback.get(sheet, {})
        votes = column_votes.get(sheet, {})

        rows = []
        by_column: dict[int, list[tuple[int, str]]] = {}
        for row_index in sorted(by_row):
            cells = tuple(sorted(by_row[row_index].items()))
            for column_index, signature in cells:
                by_column.setdefault(column_index, []).append((row_index, signature))
            label = words.get(row_index) or fallback.get(row_index, "")
            rows.append(Line(row_index, _normal(label), cells))

        columns = []
        for column_index in sorted(by_column):
            vote = votes.get(column_index)
            label = vote.most_common(1)[0][0] if vote else ""
            columns.append(
                Line(column_index, _normal(label), tuple(by_column[column_index]))
            )

        grids[sheet] = SheetGrid(sheet, tuple(rows), tuple(columns))
    return grids
