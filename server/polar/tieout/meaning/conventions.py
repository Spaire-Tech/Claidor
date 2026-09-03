"""« This line is computed differently from every model we hold. »

Registered in `docs/pierce/convention-check.md` before this file
existed. The pattern mine (`label-patterns.md`) showed that a row
label reaching three independent model families is computed one way,
and that way reads as the line's definition: revenue is volume times
price, interest is rate times balance, tax is rate times profit. This
module holds those conventions as product data and, for a model under
review, says which labelled formula rows are computed unlike them.

A departure is a reviewer's question, not an error: the model may be
right and the convention wrong for it. The sentence says what the
row is made of here, what it is made of everywhere else we hold, and
how many models agree.
"""

from __future__ import annotations

import gzip
import json
import re
from collections import Counter
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from ..workbook import Workbook
from .patterns import Pattern, RowPattern, cell_pattern, is_link, label_of
from .vocabulary import GENERIC

DATA = Path(__file__).parent / "data" / "conventions.json.gz"

#: A row named for the time axis — « Financial year ending », « Period »,
#: « Model year » — is a header repeated at the top of every block, not
#: a line with a computation, and the FHWA tool carries seventy-six of
#: them (convention-check.md, measure 3: the reader question named in
#: the patterns round, answered where it bites). Skipped in the mine
#: and in the check alike.
AXIS_LABEL = re.compile(
    r"^(?:(?:financial|fiscal|model|calendar|regulatory|price control) )?"
    r"(?:year|years|period|periods|date|dates|month|months|quarter|quarters)"
    r"(?: (?:ending|ended|end|number|counter|flag|start|index|no))?$"
)


def is_axis_label(label: str) -> bool:
    return AXIS_LABEL.match(label) is not None


def is_block_sum(pattern: Pattern) -> bool:
    """`SUM` over one range and nothing else: « the block above, added
    up ». True of every total line in every model, and different in
    every one only by the block's first label — so it is neither a
    convention nor a computation the bag can judge (convention-check.md,
    the Cascade « Total adjustments » case)."""
    functions, operators, operands = pattern
    return (
        functions == "f:SUM"
        and operators == "o:"
        and operands.startswith("r:range:")
        and " | " not in operands
    )


@dataclass(frozen=True)
class Convention:
    label: str
    pattern: Pattern
    #: Files that use the label with a formula, and how many of them
    #: compute it this way, from how many independent families.
    files: int
    agreeing: int
    families: int


@dataclass(frozen=True)
class Conventions:
    labels: dict[str, Convention]
    pool_files: int
    pool_families: int

    def get(self, label: str) -> Convention | None:
        return self.labels.get(label)


@cache
def load(path: Path = DATA) -> Conventions:
    if not path.exists():
        return Conventions({}, 0, 0)
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        raw = json.load(handle)
    labels = {
        label: Convention(
            label=label,
            pattern=tuple(one["pattern"]),  # type: ignore[arg-type]
            files=int(one["files"]),
            agreeing=int(one["agreeing"]),
            families=int(one["families"]),
        )
        for label, one in raw["labels"].items()
    }
    return Conventions(labels, int(raw["pool"]["files"]), len(raw["pool"]["families"]))


@dataclass(frozen=True)
class Reached:
    """One labelled formula row whose label has a convention."""

    row: RowPattern
    convention: Convention

    @property
    def agrees(self) -> bool:
        return self.row.pattern == self.convention.pattern


def reach(book: Workbook, conventions: Conventions | None = None) -> list[Reached]:
    """Every labelled formula row of the model whose label we hold a
    convention for, with whether it agrees."""
    held = conventions if conventions is not None else load()
    if not held.labels:
        return []
    #: Only the rows whose label we hold anything for are shaped: the
    #: bag costs a tokenise per cell, and a 780,000-formula model has
    #: a few hundred such rows, not 16,000 (convention-check.md,
    #: measure 5).
    by_row: dict[tuple[str, int], Counter[Pattern]] = {}
    labels: dict[tuple[str, int], str] = {}
    for cell in book.cells.values():
        if cell.formula is None:
            continue
        at = (cell.sheet, cell.row)
        label = labels.get(at)
        if label is None:
            label = labels[at] = label_of(book, cell.sheet, cell.row)
        if (
            not label
            or label in GENERIC
            or is_axis_label(label)
            or held.get(label) is None
        ):
            continue
        pattern = cell_pattern(book, cell.sheet, cell.row, cell.formula)
        if pattern is not None:
            by_row.setdefault(at, Counter())[pattern] += 1
    found = []
    for (sheet, row), patterns in by_row.items():
        pattern, cells = patterns.most_common(1)[0]
        #: A row that merely links to the line (`='P3 Financing'!F301`)
        #: says where it comes from, not how it is computed: no
        #: convention was ever mined from a link, and none is judged
        #: against one.
        if is_link(pattern) or is_block_sum(pattern):
            continue
        label = labels[(sheet, row)]
        convention = held.get(label)
        if convention is not None:
            found.append(
                Reached(RowPattern(sheet, row, label, pattern, cells), convention)
            )
    return found


def words(pattern: Pattern) -> str:
    """The bag in a reviewer's words: « volume and tariff, multiplied ».

    Sorted, like the bag: the sentence says what the row is made of,
    not how it is written.
    """
    functions = pattern[0][2:].split()
    operators = pattern[1][2:].split()
    operands = [one for one in pattern[2][2:].split(" | ") if one]
    parts = []
    for one in operands:
        if one == "self":
            parts.append("its own row")
        elif one == "#":
            parts.append("a typed number")
        elif one == "?":
            parts.append("an unlabelled row")
        elif one.startswith("range:"):
            parts.append(f"the range from « {one[6:]} »")
        elif one == '"…"':
            parts.append("a text")
        else:
            parts.append(f"« {one} »")
    made = (
        ", ".join(parts[:-1]) + (" and " if len(parts) > 1 else "") + parts[-1]
        if parts
        else "nothing it reads"
    )
    named = {
        "*": "multiplied",
        "/": "divided",
        "+": "added",
        "-": "subtracted",
        "^": "raised to a power",
        "&": "joined as text",
    }
    how = sorted({named.get(op, op) for op in operators})
    sentence = made
    if how:
        sentence += f", {' and '.join(how)}"
    if functions:
        sentence += f", through {', '.join(sorted(set(functions)))}"
    return sentence
