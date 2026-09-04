"""A formula in the version before, typed over now
(`docs/pierce/overwritten-since.md`).

The cell-diff round left fourteen independent labels on one pair —
links to the inputs sheet at draft, typed values at final — and the
row rules found five: the other nine sit on rows with no series of
formulas beside them, so nothing in the *file* says the cell was ever
a formula. The version before does. This rule reads it.

Cells are matched by **meaning, not address**: the sheet, the row's
label, the occurrence of that label within the sheet counted
top-down, and the column's header where the row is a series (the
column letter where it is not). A row inserted above a line does not
turn the line into a change. A cell that holds a typed value here
and a formula at the same meaning in the version before is the
finding; the previous formula is the evidence, and where it was a
plain link to one cell, what that cell holds *now* is said too — a
`2` typed over a link to an input that now says `1` is the case the
round was built on.
"""

from __future__ import annotations

import re
from collections import defaultdict
from decimal import Decimal

from openpyxl.utils import column_index_from_string, get_column_letter

from .workbook import Cell, Workbook, tokens_of

RULE = "formula-overwritten"

#: The abstention sentences, in the file's own terms.
FIRST_VERSION = "This is the first version we hold; the check needs the one before."
NO_MATCH = (
    "No line of the version before could be matched to this one by its label, "
    "so nothing could be compared."
)

Key = tuple[str, str, int, str]

#: A formula that is one reference and nothing else — a link.
_LINK = re.compile(
    r"^=\s*(?:(?P<sheet>'[^']+'|[^'!=\s()+\-*/,]+)!)?"
    r"\$?(?P<col>[A-Za-z]{1,3})\$?(?P<row>\d+)\s*$"
)


class Meaning:
    """One version's cells by meaning key."""

    def __init__(self, book: Workbook) -> None:
        labels: dict[tuple[str, int], str] = {}
        for cell in book.cells.values():
            label = (cell.row_label or "").strip().lower()
            if label:
                labels[(cell.sheet, cell.row)] = label
        occurrence: dict[tuple[str, str], list[int]] = defaultdict(list)
        for (sheet, row), label in sorted(labels.items()):
            occurrence[(sheet, label)].append(row)
        self.row_key: dict[tuple[str, int], tuple[str, int]] = {}
        for (sheet, label), rows in occurrence.items():
            for position, row in enumerate(rows):
                self.row_key[(sheet, row)] = (label, position)
        self.headers: dict[tuple[str, int], str] = {}
        for cell in book.cells.values():
            if cell.column_label and (cell.sheet, cell.column) not in self.headers:
                self.headers[(cell.sheet, cell.column)] = (
                    cell.column_label.strip().lower()
                )
        self.cells: dict[Key, Cell] = {}
        for cell in book.cells.values():
            key = self.key_of(cell.sheet, cell.row, cell.column)
            if key is not None:
                self.cells[key] = cell

    def column_key(self, sheet: str, column: int) -> str:
        return self.headers.get((sheet, column)) or get_column_letter(column)

    def key_of(self, sheet: str, row: int, column: int) -> Key | None:
        named = self.row_key.get((sheet, row))
        if named is None:
            return None
        return (sheet, named[0], named[1], self.column_key(sheet, column))


def link_target(formula: str, sheet: str) -> tuple[str, int, int] | None:
    """(sheet, row, column) of the one cell a link reads, or None when
    the formula reads more than one cell or none.

    A link is a formula whose every reference is the same single cell:
    `=Inputs!B2`, and also Ofwat's blank-guarded form
    `=IF(F_Inputs!T1586="",0,F_Inputs!T1586)`, which reads one cell
    twice and nothing else. The Affinity pair's fourteen overwrites are
    all the guarded form, so a plain-text test would have said nothing
    about where any of them came from."""
    pieces: set[str] = set()
    try:
        for token in tokens_of(formula):
            if token.type == "OPERAND" and token.subtype == "RANGE":
                pieces.add(token.value.strip())
    except Exception:
        return None
    if len(pieces) != 1:
        return None
    match = _LINK.match("=" + next(iter(pieces)))
    if match is None:
        return None
    target = (match.group("sheet") or sheet).strip("'")
    try:
        column = column_index_from_string(match.group("col").upper())
    except ValueError:
        return None
    return target, int(match.group("row")), column


def shown(value: Decimal | None) -> str:
    if value is None:
        return "nothing"
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return f"{int(value):,}"
        return f"{value.normalize():f}"
    return str(value)


def overwritten_since(book: Workbook, previous: Workbook | None, result) -> None:  # type: ignore[no-untyped-def]
    """The rule. `result` is the audit's `Audit`; imported lazily so
    this module and the audit can each name the other."""
    from .audit import Abstention, Finding, _roster

    if previous is None:
        result.abstentions.append(Abstention(rule=RULE, why=FIRST_VERSION))
        return
    now, before = Meaning(book), Meaning(previous)
    matched_typed = 0
    hits: dict[tuple[str, int], list[tuple[Cell, Cell]]] = defaultdict(list)
    for key, cell in now.cells.items():
        if cell.formula is not None or cell.value is None:
            continue
        was = before.cells.get(key)
        if was is None:
            continue
        matched_typed += 1
        if was.formula is None:
            continue
        hits[(cell.sheet, cell.row)].append((cell, was))
    if matched_typed == 0:
        result.abstentions.append(Abstention(rule=RULE, why=NO_MATCH))
        return
    overwritten = sum(len(pairs) for pairs in hits.values())
    result.tallies[RULE] = {
        "total": matched_typed,
        "clean": matched_typed - overwritten,
    }

    for (sheet, row), pairs in sorted(hits.items()):
        pairs.sort(key=lambda pair: pair[0].column)
        cell, was = pairs[0]
        label = cell.row_label or f"row {row}"
        if len(pairs) == 1:
            source = _source_now(was, before, now)
            if source is None:
                detail = "It will not follow its inputs any more."
            elif source != cell.value:
                detail = (
                    f"The cell it used to read now holds {shown(source)}, so this "
                    f"one will not follow it."
                )
            else:
                detail = (
                    f"The cell it used to read still holds {shown(source)}, so this "
                    f"one will not move with it."
                )
            kind, figure = "one", shown(cell.value)
            unit = "typed where the version before held a formula"
        else:
            detail = "They will not follow their inputs any more."
            kind, figure = "row", str(len(pairs))
            unit = "cells typed over the version before's formulas"
        result.findings.append(
            Finding(
                #: The literal, not the constant: the category-map guard
                #: finds a rule by scanning for `rule="…"` in the engine.
                rule="formula-overwritten",
                severity="error",
                ref=cell.ref,
                sheet=sheet,
                name=cell.name,
                detail=detail,
                formula=shown(cell.value),
                against=was.formula or "",
                source="FAST, ICAEW P12",
                figure=figure,
                figure_unit=unit,
                kind=kind,
                cells=_roster([one.ref for one, _ in pairs]),
            )
        )


def _source_now(was: Cell, before: Meaning, now: Meaning) -> Decimal | None:
    """What the one cell a link read holds in this version, found by
    the meaning it had in the version before; None when the formula
    was more than a link or the cell cannot be matched."""
    target = link_target(was.formula or "", was.sheet)
    if target is None:
        return None
    sheet, row, column = target
    key = before.key_of(sheet, row, column)
    if key is None:
        return None
    cell = now.cells.get(key)
    if cell is None:
        return None
    return cell.value


__all__ = ["FIRST_VERSION", "NO_MATCH", "RULE", "Meaning", "overwritten_since"]
