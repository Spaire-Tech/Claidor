"""One picture of the model, resolved once and read by every answer.

The founder's rule, from `docs/pierce/house-style/findings-voice.md`:

> Resolve the model's structure once and store it. Every answer reads
> from that stored picture. If one answer says the income statement is
> conventional and the next says there is no depreciation line on it,
> both answers lose their value.

That was written after three answers about one model contradicted each
other. The cause was not the wording: every question built its own
reading from the tools, so nothing carried between them. This is the
reading, derived from the file rather than from the last conversation,
so two answers about one file cannot disagree about what the file is.

**Everything here is marked by how it was got.** The founder's other
rule, and the one that keeps the picture honest:

> If you read the asset name off a cover cell, state it plainly. If you
> worked it out from sheet names or file names, show it as unconfirmed
> and ask me. Don't ask on files where you actually read the answer.
> And if you can't get a part at all, leave it blank. An empty field I
> can fill is fine. A confident wrong one is not.

So `Known` carries a value, how it was got, and where. Nothing is
filled in to look complete.
"""

import re
from dataclasses import dataclass, field
from typing import Any

from ..structure import PeriodAxis
from ..workbook import Workbook

#: How a thing was got. `READ` means it is on the page; `WORKED_OUT`
#: means it was inferred and must be shown as unconfirmed; empty means
#: it is not known and the field stays blank.
READ = "read"
WORKED_OUT = "worked out"

#: Sheets whose names say « the assumptions live here ».
INPUT_NAMES = re.compile(
    r"control|assumption|input|driver|dashboard|panel|switch", re.IGNORECASE
)
#: Sheets whose names say « this is a statement or a result ».
OUTPUT_NAMES = re.compile(
    r"income statement|profit|p&l|balance sheet|cash ?flow|statement|output|"
    r"summary|result|return|covenant|dscr",
    re.IGNORECASE,
)
#: A tab that exists to separate the bands, not to compute.
DIVIDER_NAMES = re.compile(
    r"^[\s\-–—>»<|.]*$|^(?:section|divider|band)\b", re.IGNORECASE
)

#: The rows a model puts its answer on. Read as labels, never computed.
BOTTOM_LINE = re.compile(
    r"\b(?:equity irr|project irr|irr|npv|dscr|llcr|adscr|payback|"
    r"net present value|internal rate of return|free cash ?flow|"
    r"net income|ebitda|distributions? to equity)\b",
    re.IGNORECASE,
)

#: A cover line is prose, not a column heading and not a number.
_TITLE = re.compile(r"[A-Za-z]{3,}")
_VERSIONISH = re.compile(
    r"\bv?\d+([._]\d+)*\b|\bdraft\b|\bfinal\b|\bcopy\b", re.IGNORECASE
)


@dataclass(frozen=True)
class Known:
    """One thing known about the model, and how it came to be known."""

    value: str = ""
    #: `read`, `worked out`, or empty for « not known ».
    how: str = ""
    #: The cell or the reasoning — « Control Panel row 3 », « the file
    #: name ». Shown beside the value so a person can check it.
    where: str = ""

    @property
    def known(self) -> bool:
        return bool(self.value)

    @property
    def confirmed(self) -> bool:
        """Read off the page. **Do not ask about these** — the founder:
        « Don't ask on files where you actually read the answer. »"""
        return self.how == READ

    def said(self) -> str:
        if not self.value:
            return ""
        if self.confirmed:
            return f"{self.value} (read from {self.where})"
        return f"{self.value} — unconfirmed, worked out from {self.where}"


@dataclass(frozen=True)
class Sheet:
    name: str
    #: `inputs` · `calculations` · `statements` · `divider`.
    role: str
    formulas: int
    hidden: str = ""


@dataclass
class Picture:
    """What is known about one model, once."""

    filename: str = ""
    version: int = 0
    #: The asset or company the model is about.
    name: Known = field(default_factory=Known)
    #: What it produces at the bottom — « an equity IRR ».
    produces: Known = field(default_factory=Known)
    #: The period it covers, off the time axis. Never guessed.
    term: Known = field(default_factory=Known)
    sheets: list[Sheet] = field(default_factory=list)
    cells: int = 0
    formulas: int = 0
    #: The sheets carrying the most formulas — where the work is.
    heaviest: list[tuple[str, int]] = field(default_factory=list)
    #: True when a time axis was found on at least one sheet. **False
    #: means it was not found**, which is a fact about the reading.
    axis_found: bool = False
    axis_sheets: list[str] = field(default_factory=list)
    circular: bool = False
    hidden_sheets: list[str] = field(default_factory=list)
    very_hidden_sheets: list[str] = field(default_factory=list)
    macros: list[str] = field(default_factory=list)
    values_only: bool = False

    def to_ask(self) -> list[str]:
        """The parts worth asking a person to confirm.

        Only the ones that were worked out. A part that was read is
        settled, and a part that is blank has nothing to confirm — it
        is an empty field waiting to be filled.
        """
        return [
            label
            for label, one in (("name", self.name), ("produces", self.produces))
            if one.known and not one.confirmed
        ]


def _cover_line(book: Workbook) -> tuple[str, str]:
    """The model's own title, off the top of a front sheet.

    Read, not guessed: this is text somebody typed at the top of the
    workbook. Returns the line and where it was found, or two blanks —
    and two blanks is a real answer.
    """
    candidates = [
        name
        for name in book.sheets
        if INPUT_NAMES.search(name) or name == (book.sheets[0] if book.sheets else "")
    ]
    for sheet in candidates:
        words = book.row_words.get(sheet, {})
        for row in sorted(one for one in words if one <= 12):
            text = (words.get(row) or "").strip()
            if len(text) < 8 or len(text) > 120:
                continue
            if len(_TITLE.findall(text)) < 2:
                continue
            #: A column heading or a units note is not a title.
            if re.fullmatch(r"[\d\s%,.()£$€-]+", text):
                continue
            return text, f"{sheet} row {row}"
    return "", ""


def _from_filename(filename: str) -> str:
    """The name a file gives itself, cleaned up. **Worked out.**"""
    stem = re.sub(r"\.[A-Za-z]{2,5}$", "", filename)
    stem = re.sub(r"[_-]+", " ", stem)
    stem = _VERSIONISH.sub(" ", stem)
    stem = re.sub(r"\b(?:model|fin(?:ancial)?|bid|master)\b", " ", stem, flags=re.I)
    return re.sub(r"\s+", " ", stem).strip(" -–—")


def _role(name: str, formulas: int, populated: int) -> str:
    if DIVIDER_NAMES.match(name) or (populated <= 3 and formulas == 0):
        return "divider"
    if OUTPUT_NAMES.search(name):
        return "statements"
    if INPUT_NAMES.search(name):
        return "inputs"
    return "calculations"


def _produces(book: Workbook) -> Known:
    """What the model answers, off the labels of its output sheets."""
    found: list[tuple[str, str]] = []
    for cell in book.cells.values():
        label = cell.row_label or ""
        if not label or not BOTTOM_LINE.search(label):
            continue
        if not OUTPUT_NAMES.search(cell.sheet):
            continue
        found.append((label.strip(), cell.ref))
        if len(found) >= 3:
            break
    if not found:
        return Known()
    names = ", ".join(dict.fromkeys(one for one, _ in found))
    return Known(value=names, how=READ, where=found[0][1])


def _term(axes: dict[str, PeriodAxis]) -> Known:
    """The span of the time axis, where there is one.

    Never worked out. A model's term guessed from a column count is the
    kind of confident wrong answer the founder ruled out.
    """
    for sheet, axis in axes.items():
        labels = list(getattr(axis, "labels", ()) or ())
        if len(labels) >= 2:
            return Known(
                value=f"{labels[0]} to {labels[-1]}",
                how=READ,
                where=f"the time axis on {sheet}",
            )
    return Known()


def picture_of(
    book: Workbook,
    *,
    filename: str = "",
    version: int = 0,
    axes: dict[str, PeriodAxis] | None = None,
    macros: list[str] | None = None,
) -> Picture:
    """Read the model once, and say only what was actually found."""
    axes = axes or {}
    per_sheet: dict[str, int] = {}
    for cell in book.cells.values():
        if cell.formula:
            per_sheet[cell.sheet] = per_sheet.get(cell.sheet, 0) + 1

    sheets = [
        Sheet(
            name=name,
            role=_role(name, per_sheet.get(name, 0), book.populated.get(name, 0)),
            formulas=per_sheet.get(name, 0),
            hidden=(
                "very hidden"
                if name in book.very_hidden_sheets
                else "hidden"
                if name in book.hidden_sheets
                else ""
            ),
        )
        for name in book.sheets
    ]

    line, where = _cover_line(book)
    if line:
        name = Known(value=line, how=READ, where=where)
    elif filename and _from_filename(filename):
        name = Known(
            value=_from_filename(filename), how=WORKED_OUT, where="the file name"
        )
    else:
        name = Known()

    formulas = sum(per_sheet.values())
    return Picture(
        filename=filename,
        version=version,
        name=name,
        produces=_produces(book),
        term=_term(axes),
        sheets=sheets,
        cells=len(book.cells),
        formulas=formulas,
        heaviest=sorted(per_sheet.items(), key=lambda kv: -kv[1])[:3],
        axis_found=bool(axes),
        axis_sheets=sorted(axes),
        circular=book.iterative,
        hidden_sheets=list(book.hidden_sheets),
        very_hidden_sheets=list(book.very_hidden_sheets),
        macros=list(macros or []),
        values_only=bool(book.cells) and formulas * 100 < len(book.cells),
    )


def as_prompt(picture: Picture) -> str:
    """The picture as the assistant is given it.

    Written in the words the assistant should reuse, and marked so it
    cannot pass a guess off as a reading: anything worked out is
    labelled, and anything missing says « not known » rather than being
    left out, because a field that is simply absent reads as a field
    that did not matter.
    """
    lines = ["## What is already known about this model", ""]
    lines.append(f"File: {picture.filename} (version {picture.version})")

    lines.append(
        f"What it is about: {picture.name.said()}"
        if picture.name.known
        else "What it is about: **not known** — say so rather than guessing "
        "from the sheet names."
    )
    lines.append(
        f"What it produces: {picture.produces.said()}"
        if picture.produces.known
        else "What it produces: **not known** — you may look for it, and say "
        "so if you cannot find it."
    )
    lines.append(
        f"Period covered: {picture.term.said()}"
        if picture.term.known
        else "Period covered: **not known** — I could not find a time axis. "
        "Say « I could not find the period axis », never « the model has no "
        "period axis »."
    )

    lines.append("")
    lines.append(
        f"Size: {picture.formulas:,} formula cells in {picture.cells:,} cells "
        f"across {len(picture.sheets)} sheets."
    )
    if picture.values_only:
        lines.append(
            "This copy carries values with almost no formulas, so nothing in "
            "it can be walked back. That is a fact about this copy, not about "
            "how the model was built."
        )
    if picture.heaviest:
        heavy = "; ".join(f"{name} holds {count:,}" for name, count in picture.heaviest)
        lines.append(f"Where the work is: {heavy}.")

    bands: dict[str, list[str]] = {}
    for sheet in picture.sheets:
        bands.setdefault(sheet.role, []).append(sheet.name)
    for role in ("inputs", "calculations", "statements", "divider"):
        if bands.get(role):
            lines.append(f"Sheets — {role}: {', '.join(bands[role])}.")

    lines.append("")
    lines.append(
        "Circular calculation is on in this file."
        if picture.circular
        else "Circular calculation is off, so there is no loop in the file."
    )
    if not picture.axis_found:
        lines.append(
            "I could not find a time axis on any sheet, so I cannot say which "
            "column is which year."
        )
    else:
        lines.append(f"Time axis found on: {', '.join(picture.axis_sheets)}.")
    if picture.very_hidden_sheets:
        lines.append(
            f"Very hidden sheets: {', '.join(picture.very_hidden_sheets)} — "
            "absent from Excel's unhide menu."
        )
    if picture.hidden_sheets:
        lines.append(f"Hidden sheets: {', '.join(picture.hidden_sheets)}.")
    if picture.macros:
        lines.append(
            f"Code in the file: {', '.join(picture.macros)} — **not read**. "
            "Say it has not been read; never say what it does."
        )
    return "\n".join(lines)


def as_dict(picture: Picture) -> dict[str, Any]:
    """The picture as it is stored and as a screen draws it."""
    return {
        "filename": picture.filename,
        "version": picture.version,
        "name": {
            "value": picture.name.value,
            "how": picture.name.how,
            "where": picture.name.where,
        },
        "produces": {
            "value": picture.produces.value,
            "how": picture.produces.how,
            "where": picture.produces.where,
        },
        "term": {
            "value": picture.term.value,
            "how": picture.term.how,
            "where": picture.term.where,
        },
        "sheets": [
            {
                "name": one.name,
                "role": one.role,
                "formulas": one.formulas,
                "hidden": one.hidden,
            }
            for one in picture.sheets
        ],
        "cells": picture.cells,
        "formulas": picture.formulas,
        "heaviest": [list(one) for one in picture.heaviest],
        "axis_found": picture.axis_found,
        "axis_sheets": picture.axis_sheets,
        "circular": picture.circular,
        "hidden_sheets": picture.hidden_sheets,
        "very_hidden_sheets": picture.very_hidden_sheets,
        "macros": picture.macros,
        "values_only": picture.values_only,
        "to_ask": picture.to_ask(),
    }


__all__ = [
    "READ",
    "WORKED_OUT",
    "Known",
    "Picture",
    "Sheet",
    "as_dict",
    "as_prompt",
    "picture_of",
]
