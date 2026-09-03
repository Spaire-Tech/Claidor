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
        self.formats: dict[tuple[int, int], str] = {}


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
    formats: dict[int, str],
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
            elif isinstance(written, str) and written.startswith("="):
                #: Typed text that looks like a formula — a « Key » sheet
                #: listing where each name points, as words — is stored
                #: the way Excel's own formula bar shows it, behind a
                #: quote, so nothing downstream reads it as arithmetic
                #: (reader-label-formulas.md: 61 such cells on the FHWA
                #: tool were counted as formulas).
                written = "'" + written

            if written is not None:
                out.written[(row, column)] = written
                out.formats[(row, column)] = formats.get(style_id, "General")
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


def _formats_by_style(book: Any) -> dict[int, str]:
    """Style id to number-format code, resolved once for the workbook.

    The same two-branch rule `ReadOnlyCell.number_format` applies —
    builtin codes below the boundary, the workbook's own table above it —
    computed once per style rather than once per cell.
    """
    from openpyxl.styles.numbers import BUILTIN_FORMATS, BUILTIN_FORMATS_MAX_SIZE

    out: dict[int, str] = {}
    for index, style in enumerate(book._cell_styles):
        number = style.numFmtId
        if number < BUILTIN_FORMATS_MAX_SIZE:
            out[index] = BUILTIN_FORMATS.get(number, "General")
        else:
            try:
                out[index] = (
                    book._number_formats[number - BUILTIN_FORMATS_MAX_SIZE] or "General"
                )
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
    epoch = book.epoch

    out: dict[str, SheetCells] = {}
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        if "xl/styles.xml" in names:
            formats, date_styles = number_formats(archive)
        else:
            formats, date_styles = (
                _formats_by_style(book),
                set(getattr(book, "_date_formats", ()) or ()),
            )
        # Timedelta styles stay openpyxl's: they are a rare subset of the
        # date styles and it costs nothing to take the set it computed.
        timedelta_styles = set(getattr(book, "_timedelta_formats", ()) or ())
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


#: Excel's own numbering: format ids below this are the builtin codes,
#: ids at or above it index the workbook's own `<numFmt>` table.
CUSTOM_FORMAT_BASE = 164


def number_formats(archive: zipfile.ZipFile) -> tuple[dict[int, str], set[int]]:
    """Each cell format's number-format code, and which are dates.

    **This exists because reading a workbook's styles is the single most
    expensive thing openpyxl does, and we need one attribute out of it.**
    A real regulator model carries a 13.5 MB `styles.xml` with 55,808
    `<xf>` records; openpyxl builds a font, a fill, a border, an
    alignment and a colour object for every one, which measured at
    **5.62 s of a 9.2 s read — and it parses no cell data at all.** All
    that is wanted here is `numFmtId` per record, plus the workbook's
    own format codes, which is two attributes and a small table.

    Date detection is openpyxl's `is_date_format` on the resolved code,
    the same test its loader applies, so a serial number becomes a
    datetime in the same cells it did before.

    **A workbook may redefine a builtin format id, and its own table
    wins.** Real corpus models declare `<numFmt numFmtId="43">` and
    `numFmtId="44"` — ids that already have builtin meanings — at the top
    of their `<numFmts>` block. Resolving builtins first and only then
    consulting the workbook, which is the obvious reading, gets those
    cells wrong; openpyxl's `_normalise_numbers` looks in the custom
    table at every id and falls back to the builtin, and that order is
    reproduced here. The differential test caught this on two files,
    which is exactly what it is for.
    """
    from openpyxl.styles.numbers import BUILTIN_FORMATS, is_date_format

    custom: dict[int, str] = {}
    codes: dict[int, str] = {}
    dates: set[int] = set()

    with archive.open("xl/styles.xml") as source:
        index = 0
        in_cell_xfs = False
        in_num_fmts = False
        for event, element in etree.iterparse(
            source,
            events=("start", "end"),
            tag=(
                f"{{{MAIN}}}numFmts",
                f"{{{MAIN}}}numFmt",
                f"{{{MAIN}}}cellXfs",
                f"{{{MAIN}}}xf",
            ),
        ):
            tag = element.tag
            if tag == f"{{{MAIN}}}numFmts":
                # `<numFmt>` also appears inside `<dxfs>`; only the ones
                # in this block are the workbook's own format table.
                in_num_fmts = event == "start"
                if event == "end":
                    element.clear()
                continue
            if tag == f"{{{MAIN}}}cellXfs":
                # `<xf>` appears in `cellStyleXfs` too, and only the ones
                # inside `cellXfs` are what a cell's `s=` points at.
                in_cell_xfs = event == "start"
                if event == "end":
                    element.clear()
                continue
            if event != "end":
                continue
            if tag == f"{{{MAIN}}}numFmt":
                if in_num_fmts:
                    identifier = element.get("numFmtId")
                    if identifier is not None:
                        custom[int(identifier)] = element.get("formatCode") or "General"
            elif in_cell_xfs:
                identifier = int(element.get("numFmtId") or 0)
                # The workbook's own table wins at *any* id, including a
                # builtin one — see the note above.
                code = custom.get(identifier) or BUILTIN_FORMATS.get(
                    identifier, "General"
                )
                codes[index] = code
                if is_date_format(code):
                    dates.add(index)
                index += 1
            element.clear()

    return codes, dates


def open_workbook(path: str) -> Any:
    """A read-only openpyxl workbook without its stylesheet.

    openpyxl's own reader, stage by stage, with `apply_stylesheet`
    omitted — see :func:`number_formats` for why. Everything fiddly
    (sheet order and state, defined names and their scopes, the epoch)
    is still openpyxl's own code producing openpyxl's own objects, so
    nothing downstream sees a different workbook; it simply never pays
    for 13.5 MB of fonts and borders nobody reads.
    """
    from openpyxl.reader.excel import ExcelReader

    reader = ExcelReader(path, read_only=True, data_only=False, rich_text=False)
    reader.read_manifest()
    reader.read_strings()
    reader.read_workbook()
    reader.read_properties()
    reader.read_custom()
    reader.read_theme()
    reader.read_worksheets()
    reader.parser.assign_names()
    return reader.wb
