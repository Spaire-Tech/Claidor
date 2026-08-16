"""Reading formulas out of a `.xls`, which nothing else here can do.

Every corpus of real spreadsheets is legacy binary. EUSES is `.xls`. The
Enron archive is `.xls`. CUSTODES — the only collection where somebody has
marked by hand which cells are actually wrong, and therefore the only
place the published precision baselines mean anything — is `.xls`. Sixty-
nine of Aswath Damodaran's seventy-three teaching models are `.xls`. A
model auditor that reads only `.xlsx` can be measured against nothing.

**Neither obvious route worked.** LibreOffice is installed here and
refuses to load these files at all, on a headless server with no display
and no Java; the files themselves are ordinary BIFF8 and open fine
elsewhere, so that is an environment defeating a converter rather than a
format problem. `openpyxl` has never read `.xls`. `xlrd` reads them
perfectly — and exposes only *values*, because that is what a reader for
data does, and formulas are exactly what an audit needs.

**What xlrd does have is a formula decompiler**, written for defined names
and never wired to cells. The Excel file format stores a formula as a
postfix token stream — `RPN`, the same thing a calculator does — and
`xlrd.formula.decompile_formula` turns one back into text. So this module
walks the raw record stream for the cells, and hands each token stream to
a decompiler that has been in the package the whole time.

The rest is the file format being the file format:

- Sheets are found through `BOUNDSHEET` records, which carry the byte
  offset of each sheet's substream. Scanning for `BOF` records instead
  finds chart sheets and macro sheets too, and gets the order wrong.
- A record longer than 8,224 bytes is split across `CONTINUE` records, so
  a long formula arrives in pieces.
- **Shared formulas.** Excel stores a formula repeated across a range once,
  in a `SHRFMLA` record, and every cell in the range holds a stub pointing
  at it. This is not an optimisation to be tolerated — it is *the* thing
  the row-consistency check is about, since a shared formula is Excel's
  own statement that a range of cells holds one calculation.
"""

import re
import struct
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

import olefile
import xlrd
from xlrd.formula import FMLA_TYPE_CELL, FMLA_TYPE_SHARED, decompile_formula

#: The records this module cares about, from the BIFF8 specification.
BOF = 0x0809
EOF_RECORD = 0x000A
BOUNDSHEET = 0x0085
FORMULA = 0x0006
SHRFMLA = 0x04BC
ARRAY = 0x0221
CONTINUE = 0x003C
CALCCOUNT = 0x000C
ITERATION = 0x0011

#: `BOF` substream kinds. Only worksheets hold cells; a chart sheet and a
#: Visual Basic module both carry a `BOF` and neither has a grid.
WORKSHEET = 0x0010

#: xlrd's decompiler renders every area reference as a range, so a
#: reference to one cell comes back as `B2:B2`. It resolves correctly and
#: it is not what Excel shows, and every downstream rule that asks « is
#: this formula a single reference » would answer no.
DEGENERATE = re.compile(r"\b([A-Z]{1,3}\d+):([A-Z]{1,3}\d+)\b")

#: Set in a `FORMULA` record's flags when the cell's real formula lives in
#: a `SHRFMLA` record covering a range this cell falls inside.
SHARED_FLAG = 0x0008


class LegacyUnreadable(Exception):
    """The file is `.xls` and could not be read — encrypted, truncated, or
    a dialect older than the decompiler understands."""


@dataclass
class _Cell:
    """One cell, in the shape `openpyxl` hands one over."""

    value: Any = None


@dataclass
class _Sheet:
    """A worksheet presenting the small part of `openpyxl`'s surface that
    :mod:`polar.tieout.workbook` actually uses, so that one reader serves
    both formats and neither knows about the other."""

    title: str
    sheet_state: str = "visible"
    cells: dict[tuple[int, int], Any] = field(default_factory=dict)
    max_row: int = 0
    max_column: int = 0

    def cell(self, row: int, column: int) -> _Cell:
        return _Cell(self.cells.get((row, column)))


@dataclass
class _Calculation:
    iterate: bool = False


@dataclass
class LegacyBook:
    sheetnames: list[str] = field(default_factory=list)
    sheets: dict[str, _Sheet] = field(default_factory=dict)
    calculation: _Calculation = field(default_factory=_Calculation)

    def __getitem__(self, name: str) -> _Sheet:
        return self.sheets[name]


def read_legacy(path: str) -> tuple[LegacyBook, LegacyBook]:
    """A `.xls` as two books — one of formulas, one of cached values.

    The same pair `openpyxl` gives from two `load_workbook` calls, and
    returned in the same order, so the caller does not branch.
    """
    try:
        values = xlrd.open_workbook(path, on_demand=False)
    except xlrd.XLRDError as error:
        raise LegacyUnreadable(f"{path}: {error}") from error
    except Exception as error:  # xlrd raises bare exceptions on bad files
        raise LegacyUnreadable(f"{path}: {type(error).__name__}: {error}") from error

    formulas = _formula_book(path, values)

    cached = LegacyBook(
        sheetnames=list(formulas.sheetnames),
        calculation=formulas.calculation,
    )
    for index, name in enumerate(values.sheet_names()):
        sheet = values.sheet_by_index(index)
        holder = _Sheet(
            title=name,
            #: xlrd visibility: 0 visible, 1 hidden, 2 very hidden —
            #: the same three states the modern format spells out.
            sheet_state=(
                "visible"
                if sheet.visibility == 0
                else "veryHidden"
                if sheet.visibility == 2
                else "hidden"
            ),
            max_row=sheet.nrows,
            max_column=sheet.ncols,
        )
        for row in range(sheet.nrows):
            for column in range(sheet.ncols):
                cell = sheet.cell(row, column)
                if cell.ctype == xlrd.XL_CELL_EMPTY:
                    continue
                if cell.ctype == xlrd.XL_CELL_ERROR:
                    holder.cells[(row + 1, column + 1)] = xlrd.error_text_from_code.get(
                        cell.value, "#N/A"
                    )
                else:
                    holder.cells[(row + 1, column + 1)] = cell.value
        cached.sheets[name] = holder
        if name not in cached.sheetnames:
            cached.sheetnames.append(name)

        # openpyxl's non-data workbook holds a formula where there is one
        # and the literal contents everywhere else, so the row labels down
        # column A are in *both* of its books. Mirror that: without it the
        # labels are missing from the formula side, every cell is named the
        # empty string, and the linker has nothing to match on.
        written = formulas.sheets[name]
        written.sheet_state = holder.sheet_state
        written.max_row = max(written.max_row, holder.max_row)
        written.max_column = max(written.max_column, holder.max_column)
        for address, value in holder.cells.items():
            written.cells.setdefault(address, value)

    return formulas, cached


def _formula_book(path: str, book: Any) -> LegacyBook:
    """Walk the record stream and decompile every cell formula in it."""
    stream = _workbook_stream(path)
    names = book.sheet_names()
    starts = _sheet_offsets(stream)

    out = LegacyBook(sheetnames=list(names), calculation=_Calculation())
    out.calculation.iterate = _iteration(stream)

    for index, name in enumerate(names):
        sheet = _Sheet(title=name)
        if index < len(starts):
            _read_substream(stream, starts[index], book, sheet)
        out.sheets[name] = sheet
    return out


def _workbook_stream(path: str) -> bytes:
    """The BIFF record stream, out of its OLE container if it is in one.

    Files old enough to predate the compound-document container are the
    stream on their own, and the first four bytes tell them apart.
    """
    with open(path, "rb") as handle:
        head = handle.read(8)
    if head[:8] != b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        with open(path, "rb") as handle:
            return handle.read()

    ole = olefile.OleFileIO(path)
    try:
        for candidate in ("Workbook", "Book"):
            if ole.exists(candidate):
                return bytes(ole.openstream(candidate).read())
    finally:
        ole.close()
    raise LegacyUnreadable(f"{path}: no Workbook or Book stream")


def _records(stream: bytes, start: int = 0) -> Iterator[tuple[int, bytes]]:
    """Every record from `start`, with its `CONTINUE` blocks joined on.

    A record's payload is capped at 8,224 bytes and anything longer is
    continued, which for this module's purposes means a long formula
    arrives split down the middle of its token stream.
    """
    position = start
    pending: tuple[int, bytearray] | None = None
    while position + 4 <= len(stream):
        code, size = struct.unpack("<HH", stream[position : position + 4])
        payload = stream[position + 4 : position + 4 + size]
        position += 4 + size
        if code == CONTINUE and pending is not None:
            pending[1].extend(payload)
            continue
        if pending is not None:
            yield pending[0], bytes(pending[1])
        pending = (code, bytearray(payload))
    if pending is not None:
        yield pending[0], bytes(pending[1])


def _sheet_offsets(stream: bytes) -> list[int]:
    """Where each worksheet's substream begins, from `BOUNDSHEET`."""
    offsets = []
    for code, payload in _records(stream):
        if code == BOUNDSHEET and len(payload) >= 6:
            offsets.append(struct.unpack("<I", payload[0:4])[0])
        elif code == EOF_RECORD and offsets:
            break
    return offsets


def _iteration(stream: bytes) -> bool:
    for code, payload in _records(stream):
        if code == ITERATION and len(payload) >= 2:
            return bool(struct.unpack("<H", payload[0:2])[0])
        if code == EOF_RECORD:
            break
    return False


def _read_substream(stream: bytes, start: int, book: Any, sheet: _Sheet) -> None:
    """Every formula in one worksheet, decompiled.

    Shared formulas are resolved in a second pass: a `SHRFMLA` record can
    appear after the first `FORMULA` that points at it, so the stubs are
    collected and expanded once the whole sheet has been read.
    """
    shared: list[tuple[int, int, int, int, bytes]] = []
    stubs: list[tuple[int, int]] = []

    for code, payload in _records(stream, start):
        if code == EOF_RECORD:
            break
        if (
            code == BOF
            and payload[2:4]
            and struct.unpack("<H", payload[2:4])[0] != WORKSHEET
        ):
            continue

        if code == SHRFMLA and len(payload) >= 10:
            first_row, last_row, first_column, last_column = struct.unpack(
                "<HHBB", payload[0:6]
            )
            length = struct.unpack("<H", payload[8:10])[0]
            shared.append(
                (
                    first_row,
                    last_row,
                    first_column,
                    last_column,
                    payload[10 : 10 + length],
                )
            )
            continue

        if code != FORMULA or len(payload) < 22:
            continue

        row, column = struct.unpack("<HH", payload[0:4])
        flags = struct.unpack("<H", payload[14:16])[0]
        length = struct.unpack("<H", payload[20:22])[0]
        tokens = payload[22 : 22 + length]

        sheet.max_row = max(sheet.max_row, row + 1)
        sheet.max_column = max(sheet.max_column, column + 1)

        if flags & SHARED_FLAG:
            stubs.append((row, column))
            continue

        text = _decompile(book, tokens, row, column, FMLA_TYPE_CELL)
        if text:
            sheet.cells[(row + 1, column + 1)] = text

    for row, column in stubs:
        borrowed = _covering(shared, row, column)
        if borrowed is None:
            continue
        text = _decompile(book, borrowed, row, column, FMLA_TYPE_SHARED)
        if text:
            sheet.cells[(row + 1, column + 1)] = text


def _covering(
    shared: list[tuple[int, int, int, int, bytes]], row: int, column: int
) -> bytes | None:
    for first_row, last_row, first_column, last_column, tokens in shared:
        if first_row <= row <= last_row and first_column <= column <= last_column:
            return tokens
    return None


def _decompile(
    book: Any, tokens: bytes, row: int, column: int, kind: int
) -> str | None:
    """One token stream, as text, or nothing if it cannot be read.

    A formula this fails on is a formula the audit does not see, which is
    a gap in coverage. It is never a wrong answer, so it is swallowed here
    rather than stopping a whole workbook — one unreadable token in a
    nine-thousand-cell model should not cost the other eight thousand.
    """
    if not tokens:
        return None
    try:
        text = decompile_formula(
            book, tokens, len(tokens), kind, browx=row, bcolx=column
        )
    except Exception:
        return None
    if not text or not isinstance(text, str):
        return None
    return "=" + DEGENERATE.sub(lambda m: m[1] if m[1] == m[2] else m[0], text)


__all__ = ["LegacyBook", "LegacyUnreadable", "read_legacy"]
