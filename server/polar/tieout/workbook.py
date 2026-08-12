"""Reading a model the way a banker reads it: labels, not coordinates.

`Model!D26` means nothing. « FY2025A adjusted EBITDA » means something,
and the workbook already says so — the words are in column A and row 4,
which is where every financial model in the world puts them. A model is a
grid with its own names written down the side and along the top, and
reading those names turns two hundred anonymous cells into two hundred
named figures.

This matters for two separate reasons.

**The Outputs tab is a link in the chain, not the end of it.** Cascade's
Outputs tab says FY2025A adjusted EBITDA lives at `Model!D25`. It lives at
`Model!D26`; D25 is blank. Four of its twenty-three references are off by
one row, all in the adjustments block, which is what happens when a row is
inserted after the tab was written. The values are right and the pointers
are stale — so a checker that trusts them sends a banker to an empty cell,
and a checker that cannot read the workbook has no way to know.

**Most models have no Outputs tab.** Cascade has one because it was built
well. If a cell can be named from its own labels, then the same matcher
that links a deck figure to an output row links it to a *cell*, and the
Outputs tab becomes an optimisation rather than a requirement.

**Precedents come from the formulas.** `=D16+D24` says adjusted EBITDA is
reported EBITDA plus total adjustments, and openpyxl already ships
Microsoft's own published formula tokenizer, so the arithmetic behind a
figure is readable without a calculation engine and without taking on a
copyleft dependency. What is *not* here is evaluation: Excel stores its
last computed values in the file, and reading them is both sufficient and
honest — the model's own answer, not a re-derivation of it.
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from openpyxl import load_workbook
from openpyxl.formula.tokenizer import Tokenizer
from openpyxl.utils import get_column_letter

from .legacy import read_legacy

#: How many text cells a row must have, outside the label column, before
#: it is read as the header naming the columns. Two is enough to tell a
#: period header — « FY2023A FY2024A FY2025A » — from a stray note, and
#: low enough that a two-year table still qualifies.
HEADER_TEXTS = 2

#: How far down a sheet the header row can be. Models open with a title, a
#: units note and a blank line; past this it is data, not a heading.
HEADER_SEARCH = 12

#: Row labels that name a derivation of the row above rather than a line
#: item of their own — the workbook's version of the same rule the deck
#: reader applies to `% margin`. Indentation says the same thing and is
#: also read, but not every model indents.
DERIVED_ROW = re.compile(
    r"^\s*(?:%\s*)?(?:as\s+%\s+of\s+)?(margin|growth|change|yield|%)\b",
    re.IGNORECASE,
)

#: How many cells a range in a formula is expanded to. `SUM(A1:A20)` is
#: worth knowing cell by cell; `SUM(A1:IV65536)` is sixteen million
#: strings and says nothing the first two hundred do not. The cap bounds
#: the work on a workbook built by somebody who selected whole columns,
#: which is most workbooks in the wild and none of the models seen so far.
MAX_RANGE = 200

#: A whole column — `$M:$M`, `A:C`. Real models are full of them: the
#: 2026 Ofgem distribution model averages over `'Monthly Inflation'!$M:$M`
#: 570 times. Expanded against the sheet's used extent rather than to the
#: format's 1,048,576 rows.
WHOLE_COLUMN = re.compile(r"^\$?(?P<first>[A-Z]{1,3}):\$?(?P<last>[A-Z]{1,3})$")
WHOLE_ROW = re.compile(r"^\$?(?P<first>\d+):\$?(?P<last>\d+)$")

#: A defined name, as it appears where a reference could. Excel's rules:
#: starts with a letter, underscore or backslash, no spaces, not a cell
#: address.
DEFINED_NAME = re.compile(r"^[A-Za-z_\\][A-Za-z0-9_.\\]*$")

#: A cell or range inside a formula, with an optional sheet. Quoted sheet
#: names — 'Cash Flow'!B4 — are the reason this is not a two-line split.
REFERENCE = re.compile(
    r"""
    (?:(?P<sheet>'[^']+'|[A-Za-z0-9_.]+)!)?
    \$?(?P<column>[A-Z]{1,3})\$?(?P<row>\d+)
    (?:
      :
      (?:(?P<sheet2>'[^']+'|[A-Za-z0-9_.]+)!)?
      \$?(?P<column2>[A-Z]{1,3})\$?(?P<row2>\d+)
    )?
    """,
    re.VERBOSE,
)


@dataclass(frozen=True)
class Cell:
    """One numeric cell, and the words the model uses for it."""

    sheet: str
    #: « Model!D26 ».
    ref: str
    row: int
    column: int
    #: The cached value, as Excel last computed it — or None when there
    #: is none. A workbook written by a generator and never opened in
    #: Excel has formulas and no values at all, which makes it invisible
    #: to anything that keys on values and perfectly readable to the
    #: audit, which only needs the formulas.
    value: Decimal | None
    #: The formula, when there is one. `None` for a hardcoded input — which
    #: is itself worth knowing, and is most of the model audit.
    formula: str | None
    #: Column A: « Adjusted EBITDA ».
    row_label: str
    #: Row 4: « FY2025A ». Empty on sheets laid out as label/value pairs.
    column_label: str
    #: The workbook's own format code — `0.0%`, `#,##0.0`, `"$"#,##0`.
    #: Presentation rather than data, and the only thing that can tell a
    #: screen that `0.1222587719` is meant to read `12.2%`. Read here
    #: rather than reconstructed later, because it is in the file and a
    #: guess from the value never can be. See `numbers.show`.
    number_format: str | None = None
    #: The cells this one is computed from, in the order they appear.
    precedents: tuple[str, ...] = ()
    #: What this cell reads that could not be resolved to a cell, each with
    #: a sentence saying why — an external workbook, a defined name left
    #: pointing at `#REF!`, a table reference. Kept because a chain missing
    #: an input while looking complete is the one failure this product
    #: cannot afford, and because on a real model it is not rare: 11.7% of
    #: formulas in the 2015 Ofgem transmission model were in that state
    #: before names were read.
    unresolved: tuple[tuple[str, str], ...] = ()
    #: Set when the whole formula is a single reference — `=Model!D26`,
    #: `=F13`. Such a cell restates a figure rather than being one, and
    #: Cascade has six of them: the comps bridge pulls adjusted EBITDA from
    #: the Model tab, the DCF pulls free cash flow, and so on. Left in the
    #: candidate set they produce several cells with one name and one
    #: value, which is exactly the ambiguity the matcher refuses to
    #: resolve — so a figure that is a pointer is followed to what it
    #: points at.
    alias_of: str | None = None

    @property
    def name(self) -> str:
        """« FY2025A Adjusted EBITDA » — the same shape as an output row's
        name, deliberately, so one matcher serves both."""
        if not self.column_label:
            return self.row_label
        if self.column_label.lower() in self.row_label.lower():
            return self.row_label
        return f"{self.column_label} {self.row_label}".strip()

    @property
    def hardcoded(self) -> bool:
        """A number typed into a row that is otherwise computed. The single
        most common real defect in a banker's model."""
        return self.formula is None


#: Excel's own error values. `#REF!` and `#NAME?` are always defects —
#: a deleted row, a typo'd function. `#N/A` and `#DIV/0!` are frequently
#: deliberate in a template with empty inputs, which is why the audit
#: grades them differently rather than counting them together.
ERROR_VALUES = frozenset(
    {"#REF!", "#NAME?", "#VALUE!", "#NULL!", "#NUM!", "#N/A", "#DIV/0!"}
)


@dataclass(frozen=True)
class Names:
    """The workbook's defined names and the extent of each sheet.

    **Scope is not decoration.** Excel lets the same name mean different
    cells on different sheets, and sheet scope beats workbook scope. The
    2026 Ofgem distribution model carries 594 sheet-scoped names beside
    791 workbook-scoped ones, so a single name-to-reference map would not
    merely miss things — it would resolve a name to the wrong cell and
    report the answer with confidence. That is worse than the silent drop
    it replaced, which is why the two maps are kept apart.
    """

    #: name → what it points at, for names visible everywhere.
    book: dict[str, str] = field(default_factory=dict)
    #: (sheet, name) → what it points at. Wins over `book`.
    sheet: dict[tuple[str, str], str] = field(default_factory=dict)
    #: sheet → (last row, last column) actually used. What a whole-column
    #: reference is expanded against.
    extent: dict[str, tuple[int, int]] = field(default_factory=dict)

    def lookup(self, name: str, sheet: str) -> str | None:
        return self.sheet.get((sheet, name)) or self.book.get(name)


@dataclass(frozen=True)
class Precedents:
    """What a formula reads, and what could not be read.

    Both halves, always. A formula that loses one of its precedents
    produces a chain short by exactly the input that decided the answer
    and looks complete — measured at 11.7% of formulas on a real Ofgem
    transmission model, where the dropped name was the switch selecting
    which company the whole model was calculating for. Rule 3: what was
    not checked is part of the answer.
    """

    refs: tuple[str, ...] = ()
    #: (what it said, why it could not be resolved). Phrased for a reader.
    unresolved: tuple[tuple[str, str], ...] = ()

    def __bool__(self) -> bool:
        return bool(self.refs or self.unresolved)


@dataclass
class Workbook:
    cells: dict[str, Cell] = field(default_factory=dict)
    sheets: list[str] = field(default_factory=list)
    #: Cells whose cached value is one of Excel's error values.
    errors: dict[str, str] = field(default_factory=dict)
    #: Sheets Excel is hiding. Concealment is a repeated cause in every
    #: published catalogue of spreadsheet disasters, so it is recorded
    #: even though hiding a working sheet is often perfectly innocent.
    hidden_sheets: tuple[str, ...] = ()
    #: True when the workbook has iterative calculation switched on, which
    #: is a model saying its circular references are deliberate.
    iterative: bool = False

    def get(self, ref: str) -> Cell | None:
        return self.cells.get(ref)

    def named(self, name: str) -> list[Cell]:
        wanted = name.strip().lower()
        return [cell for cell in self.cells.values() if cell.name.lower() == wanted]


def read_workbook(path: str) -> Workbook:
    """Every numeric cell in the model, named and with its precedents.

    Reads `.xlsx` through openpyxl and `.xls` through
    :mod:`polar.tieout.legacy`, which presents the same surface. Which
    one a model is in decides nothing else: the labels, the precedents
    and every rule downstream are the same either way, and they have to
    be, because the corpora with real spreadsheets in them are all the
    old format and the models a bank sends are all the new one.
    """
    if path.lower().endswith((".xls", ".xlt")):
        formulas, values = read_legacy(path)
    else:
        formulas = load_workbook(path, data_only=False)
        values = load_workbook(path, data_only=True)

    book = Workbook(
        sheets=list(formulas.sheetnames),
        hidden_sheets=tuple(
            name
            for name in formulas.sheetnames
            if getattr(formulas[name], "sheet_state", "visible") != "visible"
        ),
        iterative=bool(getattr(formulas.calculation, "iterate", False)),
    )
    names = _names_of(formulas)
    for name in formulas.sheetnames:
        sheet = formulas[name]
        # A chart sheet is a sheet in the file format and a picture to
        # everybody else: no cells, no grid, no `max_row`. Real models
        # have them and the Cascade test pair does not, which is the sort
        # of thing only a real model tells you.
        if not hasattr(sheet, "max_row"):
            continue
        _read_sheet(book, name, sheet, values[name], names)
    return book


def _names_of(formulas: Any) -> Names:
    """Defined names and sheet extents, in one pass.

    Read from the *formula* workbook. A legacy `.xls` read through
    :mod:`polar.tieout.legacy` has no defined names to give, and asks for
    nothing: the maps come back empty and every name falls through to
    `unresolved` with a sentence saying so, which is the honest state
    rather than a silent one.
    """
    names = Names()
    for name, one in (getattr(formulas, "defined_names", {}) or {}).items():
        names.book[str(name)] = str(getattr(one, "value", one))
    for title in formulas.sheetnames:
        sheet = formulas[title]
        for name, one in (getattr(sheet, "defined_names", {}) or {}).items():
            names.sheet[(title, str(name))] = str(getattr(one, "value", one))
        if hasattr(sheet, "max_row"):
            names.extent[title] = (
                int(sheet.max_row or 0),
                int(getattr(sheet, "max_column", 0) or 0),
            )
    return names


def _read_sheet(
    book: Workbook, name: str, sheet: Any, cached: Any, names: Names | None = None
) -> None:
    header_row = _header_row(sheet)
    label_column = _label_column(sheet)

    #: The last row label that named a line item rather than a derivation
    #: of one, so « % growth » reads as « growth of that ».
    subject = ""
    labels: dict[int, str] = {}
    for row in range(1, sheet.max_row + 1):
        raw = sheet.cell(row, label_column).value
        named = _label(raw)
        text = named.strip() if named else ""
        if not text:
            continue
        indented = isinstance(raw, str) and raw[:1].isspace()
        derived = DERIVED_ROW.match(text) is not None or (indented and subject)
        if derived and subject and subject.lower() not in text.lower():
            labels[row] = f"{subject} {text}"
        elif derived and subject:
            labels[row] = text
        else:
            subject = text
            labels[row] = text

    headers: dict[int, str] = {}
    if header_row is not None:
        for column in range(1, sheet.max_column + 1):
            named = _label(sheet.cell(header_row, column).value)
            if named:
                headers[column] = named.strip()

    for row in range(1, sheet.max_row + 1):
        for column in range(1, sheet.max_column + 1):
            shown = cached.cell(row, column).value
            if isinstance(shown, str) and shown.strip() in ERROR_VALUES:
                book.errors[f"{name}!{get_column_letter(column)}{row}"] = shown.strip()

    for row in range(1, sheet.max_row + 1):
        if row == header_row:
            continue
        numeric = [
            column
            for column in range(1, sheet.max_column + 1)
            if column != label_column
            and (
                _decimal(cached.cell(row, column).value) is not None
                or _formula(sheet.cell(row, column).value) is not None
            )
        ]
        # A row carrying one number is a label and a value — « Enterprise
        # value | 489.5 » in a valuation bridge. A row carrying several is
        # a series, and only then does the header above a column name
        # anything about it. Without this, every figure in the bridge under
        # a DCF's forecast grid inherits « FY2026E » and claims to be about
        # a year it has nothing to do with.
        series = len(numeric) > 1

        for column in numeric:
            number = _decimal(cached.cell(row, column).value)
            formula = _formula(sheet.cell(row, column).value)
            read = references_of(formula, name, names) if formula else Precedents()
            references = read.refs
            ref = f"{name}!{get_column_letter(column)}{row}"
            book.cells[ref] = Cell(
                sheet=name,
                ref=ref,
                row=row,
                column=column,
                value=number,
                formula=formula,
                row_label=labels.get(row, ""),
                column_label=headers.get(column, "") if series else "",
                # Off the *formula* book: the value book is loaded with
                # `data_only`, and a legacy `.xls` read through xlrd has no
                # format on its cells at all, which is why this is asked for
                # rather than assumed to be there.
                number_format=getattr(sheet.cell(row, column), "number_format", None),
                precedents=references,
                unresolved=read.unresolved,
                alias_of=_alias(formula, references),
            )


def precedents_of(
    formula: str, sheet: str, names: Names | None = None
) -> tuple[str, ...]:
    """The cells a formula reads, expanded from ranges, in order."""
    return references_of(formula, sheet, names).refs


def references_of(formula: str, sheet: str, names: Names | None = None) -> Precedents:
    """Everything a formula reads, and everything it reads that we cannot.

    Parsed through openpyxl's bundled tokenizer, which is a port of the
    grammar Microsoft published, so `SUM(D20:D23)` and `'Cash Flow'!B4`
    and a string literal containing a colon are all told apart properly
    rather than by a regex over the whole formula.

    Without `names` this resolves plain references only, which is what it
    did before there was anything else. With them it resolves defined
    names in scope and expands whole-column and whole-row references
    against the sheet's real extent.
    """
    found: list[str] = []
    seen: set[str] = set()
    missing: list[tuple[str, str]] = []
    said: set[str] = set()

    def keep(refs: list[str]) -> None:
        for ref in refs:
            if ref not in seen:
                seen.add(ref)
                found.append(ref)

    def give_up(text: str, why: str) -> None:
        if text not in said:
            said.add(text)
            missing.append((text, why))

    for token in Tokenizer(formula).items:
        if token.type != "OPERAND" or token.subtype != "RANGE":
            continue
        text = token.value.strip()
        refs = _expand(text, sheet, names, give_up)
        if refs:
            keep(refs)

    return Precedents(refs=tuple(found), unresolved=tuple(missing))


def _expand(
    text: str, sheet: str, names: Names | None, give_up: Any, depth: int = 0
) -> list[str]:
    """One operand, as the cells it stands for."""
    where, rest = _split_sheet(text)

    # A reference into another workbook. The path is in the file and the
    # cells are not, so this can never resolve here — but saying so is the
    # point: an external link is the one precedent most likely to be stale,
    # because nobody re-opens the workbook it points at.
    if where.strip("'").startswith("[") or rest.startswith("["):
        if "]" in rest and not rest.startswith("["):
            give_up(text, "a table reference, which this does not read yet")
        else:
            give_up(text, "in another workbook, which is not in this deal")
        return []

    if "[" in rest:
        give_up(text, "a table reference, which this does not read yet")
        return []

    match = REFERENCE.fullmatch(text)
    if match is not None:
        return _capped(
            text,
            _cells(
                (match.group("sheet") or sheet).strip("'"),
                match.group("column"),
                int(match.group("row")),
                match.group("column2"),
                int(match.group("row2") or 0),
            ),
            give_up,
        )

    here = where.strip("'") or sheet

    column = WHOLE_COLUMN.match(rest)
    if column:
        rows = names.extent.get(here, (0, 0))[0] if names else 0
        if not rows:
            give_up(text, "a whole column, and that sheet is not in this workbook")
            return []
        return _capped(
            text,
            _cells(here, column.group("first"), 1, column.group("last"), rows),
            give_up,
        )

    row = WHOLE_ROW.match(rest)
    if row:
        columns = names.extent.get(here, (0, 0))[1] if names else 0
        if not columns:
            give_up(text, "a whole row, and that sheet is not in this workbook")
            return []
        return _capped(
            text,
            _cells(
                here,
                "A",
                int(row.group("first")),
                get_column_letter(max(columns, 1)),
                int(row.group("last")),
            ),
            give_up,
        )

    if DEFINED_NAME.fullmatch(rest) and names is not None:
        points_at = names.lookup(rest, sheet)
        if points_at is None:
            give_up(text, "a name this workbook does not define")
            return []
        if points_at.startswith("#"):
            # A defined name left pointing at a deleted row. Nine of them
            # sit in a published Ofgem model. Not a parse failure — a
            # defect in the workbook, and worth saying so.
            give_up(text, f"a defined name pointing at {points_at}")
            return []
        if depth >= 2:
            give_up(text, "a name defined in terms of other names")
            return []
        # A name can point at anything, including another name or a
        # formula. Following it once more covers the real cases and the
        # depth cap stops a name defined in terms of itself.
        #
        # The recursion reports nothing of its own. What a person needs to
        # be told is « Switch could not be followed », not
        # « OFFSET(Model!$A$1,1,1) is a reference this does not understand » —
        # the second is this module talking about itself.
        resolved = _expand(points_at.lstrip("="), sheet, names, _quiet, depth + 1)
        if not resolved:
            give_up(text, "a name that is a formula rather than a cell")
        return resolved

    if DEFINED_NAME.fullmatch(rest):
        give_up(text, "a defined name, and this workbook's names were not read")
        return []

    give_up(text, "a reference this does not understand")
    return []


def _quiet(text: str, why: str) -> None:
    """Swallow a reason raised inside a name's own definition."""


def _capped(text: str, answer: tuple[list[str], int], give_up: Any) -> list[str]:
    """Say so when the cap bit."""
    refs, span = answer
    if span > len(refs):
        give_up(
            text,
            f"{span:,} cells, of which the first {len(refs):,} were followed",
        )
    return refs


def _split_sheet(token: str) -> tuple[str, str]:
    """« 'Live Results (SO)'!C15 » → the sheet and the rest.

    A quoted sheet name may contain brackets, spaces, even exclamation
    marks. Splitting naively is how `'Live Results (SO)'!$C$15` gets
    called a table reference, which is a mistake this module's own
    measurement script made first.
    """
    if token.startswith("'"):
        end = token.find("'", 1)
        while end != -1 and token[end : end + 2] == "''":
            end = token.find("'", end + 2)
        if end != -1 and token[end + 1 : end + 2] == "!":
            return token[: end + 1], token[end + 2 :]
    if "!" in token:
        where, _, rest = token.rpartition("!")
        return where, rest
    return "", token


def _cells(
    where: str, column: str, row: int, column2: str | None, row2: int
) -> tuple[list[str], int]:
    """The cells a reference stands for, and how many there were in all.

    The second number is not decoration. `MAX_RANGE` exists so that
    `SUM(A1:IV65536)` does not become sixteen million strings, and a cap
    that truncates without saying so is the same silent loss this module
    was just fixed for — moved from « dropped » to « quietly shortened ».
    """
    if not row2:
        return [f"{where}!{column}{row}"], 1
    first_column = _column_index(column)
    last_column = _column_index(column2 or "")
    span = (row2 - row + 1) * max(last_column - first_column + 1, 0)
    refs: list[str] = []
    for one in range(row, row2 + 1):
        for two in range(first_column, last_column + 1):
            if len(refs) >= MAX_RANGE:
                return refs, span
            refs.append(f"{where}!{get_column_letter(two)}{one}")
    return refs, span


def _alias(formula: str | None, references: tuple[str, ...]) -> str | None:
    """The cell this one merely restates, if that is all it does.

    `=Model!D26` and `=F13` are pointers. `=B18*B19` is a figure. The test
    is that stripping the one reference out of the formula leaves nothing
    but the equals sign — no arithmetic, no function, no second operand.
    """
    if formula is None or len(references) != 1:
        return None
    match = REFERENCE.fullmatch(formula[1:].strip())
    if match is not None and match.group("row2") is None:
        return references[0]
    return None


def _column_index(letters: str) -> int:
    index = 0
    for letter in letters:
        index = index * 26 + (ord(letter.upper()) - 64)
    return index


def _header_row(sheet: Any) -> int | None:
    """The row whose text names the columns. Usually the period header."""
    best: tuple[int, int] | None = None
    for row in range(1, min(sheet.max_row, HEADER_SEARCH) + 1):
        texts = sum(
            1
            for column in range(2, sheet.max_column + 1)
            if _label(sheet.cell(row, column).value)
        )
        if texts >= HEADER_TEXTS and (best is None or texts > best[1]):
            best = (row, texts)
    return best[0] if best else None


def _label_column(sheet: Any) -> int:
    """The column holding the row names. Column A in every real model, but
    found rather than assumed, because a model with a spacer column at the
    left would otherwise name every one of its rows the empty string."""
    best, most = 1, -1
    for column in range(1, min(sheet.max_column, 4) + 1):
        texts = sum(
            1
            for row in range(1, sheet.max_row + 1)
            if _label(sheet.cell(row, column).value)
        )
        if texts > most:
            best, most = column, texts
    return best


def _formula(value: Any) -> str | None:
    return value if isinstance(value, str) and value.startswith("=") else None


def _label(value: Any) -> str | None:
    """A cell's text, when the text is a name and not a calculation.

    A formula is a string, so a column full of formulas counts as a column
    full of labels unless this says otherwise — and then every figure on
    the sheet is named after the arithmetic in the column beside it. The
    Cascade model never showed it because nothing in its column A is
    calculated; a real model with a formula down the left-hand side shows
    it immediately.
    """
    if not isinstance(value, str) or value.startswith("="):
        return None
    return value if value.strip() else None


def _decimal(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool | str):
        return None
    if isinstance(value, int | float):
        # Through `repr`: 0.098 as a float carries fifteen digits of noise
        # that mean nothing to a figure printed to one decimal place.
        return Decimal(repr(value))
    if isinstance(value, Decimal):
        return value
    return None


__all__ = [
    "DERIVED_ROW",
    "HEADER_TEXTS",
    "Cell",
    "Names",
    "Precedents",
    "Workbook",
    "precedents_of",
    "read_workbook",
    "references_of",
]
