"""Units kept in a column of their own, with no header saying so.

Nine of 27 real models put units in a dedicated column beside the
value instead of in the row label (`corpus-sources.md`, 28 Aug fourth
addendum; 698 declarations extracted that way). An engine that parses
only labels finds nothing in those nine **and reports full coverage
on all of them** — silent blindness, which is the failure shape this
project likes least.

The detector deliberately does **not** require a `Units` header. The
models that need it do not have one, and a header-based finder
reported *zero* declarations across the eight closed-deal models
(lane log, 28 Aug) — a zero that may say more about the finder than
about the files.

What it looks for, and each condition is there because a column
without it is something else:

- **Narrow**: its entries are short. A units column holds « £m »,
  « % », « MWh », not sentences. Long entries mean a comment column.
- **Describing values**: its rows are rows that carry numbers
  somewhere on the sheet. Not *adjacent* to them — on ED2 the units
  sit by the labels and the numbers start forty columns away — but
  sharing their rows. Text with no numbers on its rows is a label
  column.
- **Repetitive, once there is enough to judge**: a model has few
  distinct units and many rows, so a long column with a different
  string on every row is a description. A six-row block with four
  units is still a units column, so the test only applies above ten
  entries.
- **Declaration-shaped**: its entries match the vocabulary of units
  *or* the switch words a real units column carries beside them —
  ED2's holds `text` and `flag` alongside `£m` and `%`, and only 13%
  of it is unit-shaped, so a « mostly units » bar rejects a real
  units column. Those entries are kept and reported as « declared,
  not a unit », never fed to arithmetic.
- **Unit-shaped**: its entries match the vocabulary of units —
  currency signs, percent, scale words, per-something, known
  physical units — or are short tokens repeated down the column.

Nothing here reads a row's *meaning*; a declaration is returned with
the column it came from so a reader can check it, and « declared but
not parseable » stays a reportable outcome rather than a guess.
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from openpyxl import load_workbook

#: Why this module opens the workbook itself, rather than using the
#: reader's cell map like everything else in E2: **the reader keeps
#: no text cells.** Measured on ED2's `AR` sheet — 410 cells, every
#: one a number or blank, not one string. A units column is text, so
#: no detector built on that map could ever see one. The engine is a
#: read-only library to this lane, so the case for it retaining text
#: is written in the lane log for the lead to route; meanwhile this
#: module reads what it needs for itself.


#: Longest an entry may be and still look like a unit rather than a
#: sentence. « £m 2020/21 prices » is 19; a comment is longer.
MAX_UNIT_LENGTH = 28

#: A units column must be at least this repetitive: distinct entries
#: divided by entries. A description column approaches 1.0.
MAX_DISTINCT_SHARE = 0.5

#: …but repetitiveness is only evidence once there is enough of it.
#: A six-row block with four different units is a perfectly good
#: units column; a sixty-row one with forty is a description.
MIN_ENTRIES_FOR_REPETITION = 10

#: How many rows a column must carry before it can be judged at all.
MIN_ENTRIES = 4

#: Text that looks like a unit. Deliberately broad — the classifier
#: decides what a unit *means*; this only decides that a column is
#: made of units.
UNIT_SHAPED = re.compile(
    r"(?<![A-Za-z0-9])("
    # A currency sign, optionally carrying its scale letter: « £m »,
    # « $bn ». Requiring whitespace around every token missed « £m
    # nominal » — 40 of the 62 entries in ED2's own units column.
    r"[£$€¥₹]\s*(?:mm|bn|cr|[mkb])?|"
    r"%|bps|x|scalar|"
    r"crore|lakh|千|百万|million|billion|thousand|units?|"
    r"[kmgt]?wh|[kmgt]w|wdc|wac|therms?|tonnes?|te|"
    r"years?|yrs?|months?|days?|hours?|hrs?|p\.a\.|"
    r"no\.|count|ratio|index|multiple"
    r")(?![A-Za-z0-9])",
    re.I,
)

#: Words that appear in real units columns and are **not units**:
#: `Choice`, `Index`, `Check`, `[1,0]`, `Toggle YES/NO` in the
#: research's corpus; `text` and `flag` in ED2's, which is why this
#: exists now rather than at build item (g). They are declarations —
#: the column is a units column — but they must never enter
#: dimensional arithmetic, so they are recognised, kept, and
#: reported as « declared, not a unit ».
NOT_A_UNIT = re.compile(
    r"^\[?\s*(text|flag|date|number|numeric|choice|index|check|toggle"
    r"|yes/no|y/n|true/false|boolean|bool|n/a|na|switch|selector|list"
    r"|0\s*,\s*1|1\s*,\s*0)\s*\]?$",
    re.I,
)

#: How much of a units column must be *unit*-shaped rather than a
#: switch word. ED2's is 13% units and the rest `text`/`flag`, so a
#: high bar rejects a real units column outright — measured, after an
#: 80% bar found nothing on a model whose answer I knew.
MIN_UNIT_SHARE = 0.05

#: Currency-and-scale shorthands that carry no separator at all.
UNIT_TOKEN = re.compile(
    r"^(£|\$|€|¥|₹)?\s?(m|k|bn|mm|b|cr)?\s?('000|000s)?$|^%$|^x$", re.I
)


@dataclass(frozen=True)
class Declaration:
    """One row's declared unit, and where it was read from."""

    sheet: str
    row: int
    text: str
    #: The column index the text came from, so a reader can look.
    column: int
    #: The column the values it describes sit in, for the same reason.
    values_column: int


def _looks_like_a_unit(text: str) -> bool:
    stripped = text.strip()
    if not stripped or len(stripped) > MAX_UNIT_LENGTH:
        return False
    if NOT_A_UNIT.match(stripped):
        return False
    return bool(UNIT_TOKEN.match(stripped) or UNIT_SHAPED.search(stripped))


def is_a_declaration(text: str) -> bool:
    """Unit-shaped, or a switch word a units column legitimately holds."""
    stripped = text.strip()
    if not stripped or len(stripped) > MAX_UNIT_LENGTH:
        return False
    return _looks_like_a_unit(stripped) or bool(NOT_A_UNIT.match(stripped))


@dataclass(frozen=True)
class TextCell:
    """The little a units column needs: where a string sits."""

    sheet: str
    row: int
    column: int
    value: Any


def cells_with_text(path: str) -> dict[str, TextCell]:
    """Every string and number in a workbook, by reference.

    Built with openpyxl because the project reader drops text; kept
    to the same shape the rest of this module takes so a caller can
    substitute either.
    """
    book = load_workbook(path, read_only=True, data_only=True)
    out: dict[str, TextCell] = {}
    try:
        for sheet in book.worksheets:
            for row in sheet.iter_rows():
                for cell in row:
                    value = cell.value
                    if value is None or isinstance(value, bool):
                        continue
                    if isinstance(value, str) and not value.strip():
                        continue
                    out[f"{sheet.title}!{cell.coordinate}"] = TextCell(
                        sheet=sheet.title,
                        row=cell.row,
                        column=cell.column,
                        value=value,
                    )
    finally:
        book.close()
    return out


def find_units_columns(cells: Mapping[str, Any], sheet: str) -> list[Declaration]:
    """Every row's declared unit on one sheet, from a units column.

    Returns an empty list when no column qualifies — which is the
    right answer for a model that puts units in its labels, and must
    not be confused with « this model declares nothing ».
    """
    text_by_column: dict[int, dict[int, str]] = {}
    numbers_by_column: dict[int, set[int]] = {}
    for _ref, cell in cells.items():
        if cell.sheet != sheet:
            continue
        value = cell.value
        if isinstance(value, str) and value.strip():
            text_by_column.setdefault(cell.column, {})[cell.row] = value.strip()
        elif not isinstance(value, str) and not isinstance(value, bool):
            try:
                float(value)
            except (TypeError, ValueError):
                continue
            numbers_by_column.setdefault(cell.column, set()).add(cell.row)
    found: list[Declaration] = []
    for column, entries in sorted(text_by_column.items()):
        if len(entries) < MIN_ENTRIES:
            continue
        if (
            len(entries) >= MIN_ENTRIES_FOR_REPETITION
            and len(set(entries.values())) / len(entries) > MAX_DISTINCT_SHARE
        ):
            continue
        declarations = [t for t in entries.values() if is_a_declaration(t)]
        units = [t for t in entries.values() if _looks_like_a_unit(t)]
        if len(declarations) < len(entries) * 0.8:
            continue
        if len(units) < len(entries) * MIN_UNIT_SHARE:
            continue
        # It must describe values: a column of numbers sharing its
        # rows, on either side, preferring the one on the right.
        neighbour = _values_beside(column, entries, numbers_by_column)
        if neighbour is None:
            continue
        found.extend(
            Declaration(
                sheet=sheet,
                row=row,
                text=text,
                column=column,
                values_column=neighbour,
            )
            for row, text in sorted(entries.items())
            if row in numbers_by_column.get(neighbour, ())
        )
    return found


def _values_beside(
    column: int,
    entries: Mapping[int, str],
    numbers_by_column: Mapping[int, set[int]],
) -> int | None:
    """The nearest column of numbers sharing this column's rows.

    **Not adjacent**, deliberately. The obvious rule — « the column
    immediately right of the values » — finds nothing on ED2 and GD3,
    where the units sit near the labels on the left and the numbers
    begin some forty columns away in the year block. Measured: 0
    declarations against a header-based finder's 5,954 (lane log,
    28 Aug). What matters is that the column *describes* values, not
    that it touches them, so every numeric column is considered and
    the nearest qualifying one wins.
    """
    rows = set(entries)
    needed = max(MIN_ENTRIES, len(rows) * 0.5)
    best: tuple[int, int] | None = None
    for candidate, numeric_rows in numbers_by_column.items():
        shared = len(rows & numeric_rows)
        if shared < needed:
            continue
        distance = abs(candidate - column)
        if best is None or distance < best[0]:
            best = (distance, candidate)
    return best[1] if best else None


def declarations_by_row(
    cells: Mapping[str, Any], sheets: Sequence[str] | None = None
) -> dict[tuple[str, int], str]:
    """`{(sheet, row): units text}` across a workbook."""
    out: dict[tuple[str, int], str] = {}
    for sheet in sheets or sorted({cell.sheet for cell in cells.values()}):
        for declaration in find_units_columns(cells, sheet):
            out[(declaration.sheet, declaration.row)] = declaration.text
    return out
