"""The semantic shape of a formula: what a row is made of, in labels.

Registered in `docs/pierce/label-patterns.md` before this file
existed. The audit's shape makes references relative and erases
numbers, so two copies of one formula compare equal. This shape goes
one step further out: every reference becomes **the label of the row
it reads**, so `=C5*C6` under « Revenue » becomes « volume × tariff »
wherever the two rows sit. Sixteen models that each compute revenue
as volume times tariff then agree on one pattern, and a seventeenth
that computes it otherwise can be seen to differ — the check that
this makes possible is its own round.

The pattern is a bag on purpose — sorted functions, sorted operators,
sorted operand labels — because the question is what a row is made
of, not how it is written.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass

from ..workbook import Workbook, tokens_of
from .vocabulary import GENERIC, normalise

_REF = re.compile(
    r"^(?:(?P<sheet>'[^']+'|[^'!]+)!)?\$?(?P<col>[A-Za-z]{1,3})\$?(?P<row>\d+)"
    r"(?::\$?(?P<col2>[A-Za-z]{1,3})\$?(?P<row2>\d+))?$"
)
_COLS = re.compile(
    r"^(?:(?P<sheet>'[^']+'|[^'!]+)!)?\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}$"
)
_ROWS = re.compile(r"^(?:(?P<sheet>'[^']+'|[^'!]+)!)?\$?(?P<row>\d+):\$?\d+$")


def label_of(book: Workbook, sheet: str, row: int) -> str:
    """The row's label as the dictionary keys it, or empty."""
    text = book.row_words.get(sheet, {}).get(row, "")
    return normalise(text) if text else ""


def operand_label(book: Workbook, sheet: str, row: int, reference: str) -> str:
    """One reference as a label: `self` for the formula's own row (its
    prior period, or the same line elsewhere), `range:<label>` for a
    range, `?` for a row nobody labelled."""
    text = reference.strip()
    match = _REF.match(text)
    if match is None:
        if _COLS.match(text):
            return "range:?"
        rows = _ROWS.match(text)
        if rows:
            target_sheet = (rows.group("sheet") or sheet).strip("'")
            return "range:" + (
                label_of(book, target_sheet, int(rows.group("row"))) or "?"
            )
        return "?"
    target_sheet = (match.group("sheet") or sheet).strip("'")
    target_row = int(match.group("row"))
    if match.group("row2") is not None:
        first = label_of(book, target_sheet, target_row) or "?"
        if int(match.group("row2")) == target_row:
            #: A horizontal range on one row is that row.
            return first
        return "range:" + first
    if target_row == row and target_sheet == sheet:
        return "self"
    label = label_of(book, target_sheet, target_row)
    if not label:
        return "?"
    if label == label_of(book, sheet, row):
        return "self"
    return label


Pattern = tuple[str, str, str]


def cell_pattern(book: Workbook, sheet: str, row: int, formula: str) -> Pattern | None:
    """The bag: `f:` functions, `o:` operators, `r:` operand labels."""
    try:
        tokens = tokens_of(formula)
    except Exception:
        return None
    functions: list[str] = []
    operators: list[str] = []
    operands: list[str] = []
    for token in tokens:
        if token.type == "OPERAND":
            if token.subtype == "RANGE":
                operands.append(operand_label(book, sheet, row, token.value))
            elif token.subtype == "NUMBER":
                operands.append("#")
            elif token.subtype == "TEXT":
                operands.append('"…"')
            else:
                operands.append(token.value.lower())
        elif token.type == "FUNC" and token.subtype == "OPEN":
            functions.append(token.value.rstrip("(").upper().replace("_XLFN.", ""))
        elif token.type in ("OPERATOR-INFIX", "OPERATOR-PREFIX"):
            operators.append(token.value)
    return (
        "f:" + " ".join(sorted(functions)),
        "o:" + " ".join(sorted(operators)),
        "r:" + " | ".join(sorted(operands)),
    )


def is_link(pattern: Pattern) -> bool:
    """A single operand with no operator or function: where a row comes
    from, not what it is. Recorded, never « confident »."""
    functions, operators, operands = pattern
    return functions == "f:" and operators == "o:" and " | " not in operands[2:]


@dataclass(frozen=True)
class RowPattern:
    sheet: str
    row: int
    label: str
    pattern: Pattern
    #: How many cells along the row share the pattern.
    cells: int


def row_patterns(book: Workbook) -> list[RowPattern]:
    """One pattern per labelled formula row — the commonest along the
    row, so a fill counts once. Schedule words are skipped."""
    by_row: dict[tuple[str, int], Counter[Pattern]] = {}
    for cell in book.cells.values():
        if cell.formula is None:
            continue
        label = label_of(book, cell.sheet, cell.row)
        if not label or label in GENERIC:
            continue
        pattern = cell_pattern(book, cell.sheet, cell.row, cell.formula)
        if pattern is None:
            continue
        by_row.setdefault((cell.sheet, cell.row), Counter())[pattern] += 1
    found: list[RowPattern] = []
    for (sheet, row), patterns in by_row.items():
        pattern, cells = patterns.most_common(1)[0]
        found.append(RowPattern(sheet, row, label_of(book, sheet, row), pattern, cells))
    return found
