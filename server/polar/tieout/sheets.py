"""One pass over a workbook's XML, for both the formulas and the values.

**Why this exists.** `read_workbook` opened every model twice — once
with `data_only=False` for the formulas and once with `data_only=True`
for the cached values — because that is the only way openpyxl will give
you both. Two full parses of the same file. On a median regulator model
(`ofgem_ed2/v4_2025-01.xlsx`) that is **16.4 s of a 19.5 s read, 84% of
it**, and the audit that follows takes 2 s. The reader was the product's
speed, and half of the reader was reading the file a second time.

Both layers are in the same place in the file. A cell is

    <c r="D26" s="12" t="n"><f>D16+D24</f><v>48.9</v></c>

and `<f>` and `<v>` are siblings: openpyxl throws one away depending on
a flag. Iterating the sheet XML once with lxml and keeping both is
**1.6 s at 119 MB** against openpyxl's 16.4 s at 356 MB — measured
before this module was written, on the same file (`docs/pierce/`
worklog, 28 Aug).

**This module does not re-invent Excel's semantics, and must not.**
Every value conversion — number casting, the serial-to-date rule, shared
strings, booleans, inline strings, ISO dates, shared and array formulas —
is done by importing *openpyxl's own helpers* and calling them in
openpyxl's own order, transcribed from `WorkSheetParser.parse_cell` and
`parse_formula`. What is replaced is the iteration machinery, which is
where the time was; what is kept is the meaning, which is where the
risk is. A differential test compares this reader against openpyxl cell
by cell across the whole corpus (`tests/tieout/test_sheets.py`).

Anything it is not sure about, it declines: a workbook this cannot open
falls back to openpyxl and nothing downstream can tell the difference
except by how long it waited.
"""

import zipfile
from typing import Any

from lxml import etree
from openpyxl.utils import coordinate_to_tuple
from openpyxl.worksheet._reader import (
    Text,
    Translator,
    _cast_number,
    from_excel,
    from_ISO8601,
)
from openpyxl.worksheet.formula import ArrayFormula, DataTableFormula

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
CELL = f"{{{MAIN}}}c"
FORMULA = f"{{{MAIN}}}f"
VALUE = f"{{{MAIN}}}v"
INLINE = f"{{{MAIN}}}is"
ROW = f"{{{MAIN}}}row"


class Unsupported(Exception):
    """This workbook is not one we can read quickly; use openpyxl."""


class SheetCells:
    """One sheet's cells, both layers, from one pass.

    `written` is what the formula load would have given — a formula
    where there is one, the literal otherwise. `values` is what the
    value load would have given. `formats` is the number format code.
    The three dictionaries are exactly what :func:`_grid_of` fills.
    """

    __slots__ = ("formats", "values", "written")

    def __init__(self) -> None:
        self.written: dict[tuple[int, int], Any] = {}
        self.values: dict[tuple[int, int], Any] = {}
        self.formats: dict[tuple[int, int], str | None] = {}


def _shared_strings(archive: zipfile.ZipFile) -> list[str]:
    """The workbook's string table, in order.

    Read with the same `Text` parser openpyxl uses, so rich text collapses
    to the same plain string rather than to a near-miss of it.
    """
    try:
        source = archive.open("xl/sharedStrings.xml")
    except KeyError:
        return []
    strings: list[str] = []
    with source:
        for _, element in etree.iterparse(source, tag=f"{{{MAIN}}}si", events=("end",)):
            strings.append(Text.from_tree(element).content)
            element.clear()
    return strings


def read_sheet(
    archive: zipfile.ZipFile,
    part: str,
    strings: list[str],
    date_styles: set[int],
    timedelta_styles: set[int],
    epoch: Any,
    formats: dict[int, str | None],
) -> SheetCells:
    """Every populated cell of one sheet, formulas and values together.

    Transcribed from `WorkSheetParser.parse_cell` and `.parse_formula`,
    in their order, with their helpers. The one deliberate difference is
    that both layers are kept instead of one being discarded.
    """
    out = SheetCells()
    shared_formulae: dict[str, Translator] = {}
    row_counter = 0
    column_counter = 0

    with archive.open(part) as source:
        for _, element in etree.iterparse(
            source, tag=(CELL, ROW), events=("end",), huge_tree=False
        ):
            if element.tag == ROW:
                # A row without cells still moves the implicit counter,
                # exactly as openpyxl's parser tracks `row_counter`.
                index = element.get("r")
                row_counter = int(index) if index else row_counter + 1
                column_counter = 0
                element.clear()
                continue

            kind = element.get("t", "n")
            coordinate = element.get("r")
            style = element.get("s", 0)
            style_id = int(style) if style else 0

            if coordinate:
                row, column = coordinate_to_tuple(coordinate)
                column_counter = column
            else:
                column_counter += 1
                row, column = row_counter, column_counter

            raw = None if kind == "inlineStr" else element.findtext(VALUE, None) or None
            formula_element = element.find(FORMULA)

            # --- the value layer, openpyxl's `parse_cell` with data_only
            value: Any = raw
            if raw is not None:
                if kind == "n":
                    value = _cast_number(raw)
                    if style_id in date_styles:
                        try:
                            value = from_excel(
                                value,
                                epoch,
                                timedelta=style_id in timedelta_styles,
                            )
                        except (OverflowError, ValueError):
                            # openpyxl warns and calls it an error cell.
                            value = "#VALUE!"
                elif kind == "s":
                    try:
                        value = strings[int(raw)]
                    except (IndexError, ValueError) as error:
                        raise Unsupported(f"string index {raw!r}") from error
                elif kind == "b":
                    value = bool(int(raw))
                elif kind == "d":
                    value = from_ISO8601(raw)
                # 'str' and 'e' keep the text exactly as openpyxl does.
            elif kind == "inlineStr":
                child = element.find(INLINE)
                value = Text.from_tree(child).content if child is not None else None

            # --- the formula layer, openpyxl's `parse_formula`
            written: Any = value
            if formula_element is not None:
                written = _formula(formula_element, coordinate, shared_formulae)

            if written is not None:
                out.written[(row, column)] = written
                out.formats[(row, column)] = formats.get(style_id)
            if value is not None:
                out.values[(row, column)] = value

            element.clear()

    return out


def _formula(
    element: Any, coordinate: str | None, shared: dict[str, Translator]
) -> Any:
    """`parse_formula`, transcribed. Shared formulas are translated by
    openpyxl's own `Translator`, so a copied row reads identically to the
    way it read before."""
    kind = element.get("t")
    text = "="
    if element.text is not None:
        text += element.text

    if kind == "array":
        return ArrayFormula(ref=element.get("ref"), text=text)
    if kind == "shared":
        index = element.get("si")
        if index in shared:
            return shared[index].translate_formula(coordinate)
        if text != "=":
            shared[index] = Translator(text, coordinate)
        return text
    if kind == "dataTable":
        return DataTableFormula(**element.attrib)
    return text


def _formats_by_style(book: Any) -> dict[int, str | None]:
    """Style id to number-format code, resolved once for the workbook.

    The same two-branch rule `ReadOnlyCell.number_format` applies —
    builtin codes below the boundary, the workbook's own table above it —
    computed once per style rather than once per cell.
    """
    from openpyxl.styles.numbers import BUILTIN_FORMATS, BUILTIN_FORMATS_MAX_SIZE

    out: dict[int, str | None] = {}
    for index, style in enumerate(book._cell_styles):
        number = style.numFmtId
        if number < BUILTIN_FORMATS_MAX_SIZE:
            out[index] = BUILTIN_FORMATS.get(number, "General")
        else:
            try:
                out[index] = book._number_formats[number - BUILTIN_FORMATS_MAX_SIZE]
            except IndexError:
                out[index] = "General"
    return out


def cells_of(path: str, book: Any) -> dict[str, SheetCells]:
    """Every sheet's cells, by sheet name, in one pass over the file.

    `book` is an already-open read-only openpyxl workbook, used only for
    what is cheap there and fiddly here: the sheet order and their parts,
    the style table, the date-format style ids and the epoch. No sheet is
    iterated through openpyxl, which is the entire point.

    Raises :class:`Unsupported` for anything this cannot do, and the
    caller falls back to openpyxl.
    """
    formats = _formats_by_style(book)
    date_styles = set(getattr(book, "_date_formats", ()) or ())
    timedelta_styles = set(getattr(book, "_timedelta_formats", ()) or ())
    epoch = book.epoch

    out: dict[str, SheetCells] = {}
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        strings = _shared_strings(archive)
        for sheet in book.worksheets:
            # A read-only worksheet names its part `_worksheet_path`,
            # sometimes absolute (`/xl/worksheets/sheet1.xml`) and
            # sometimes relative to `xl/`. Both spellings appear in real
            # files, so both are tried against the archive's own listing
            # rather than assumed.
            raw_part = str(getattr(sheet, "_worksheet_path", "") or "")
            part = raw_part.lstrip("/")
            if part not in names and f"xl/{part}" in names:
                part = f"xl/{part}"
            if part not in names:
                raise Unsupported(f"cannot locate the part for {sheet.title!r}")
            out[sheet.title] = read_sheet(
                archive,
                part,
                strings,
                date_styles,
                timedelta_styles,
                epoch,
                formats,
            )
    return out
