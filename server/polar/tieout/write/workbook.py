"""Writing a fix into a workbook, and proving nothing else moved.

The one write this product makes into a model: putting a row's own
formula back into a cell somebody typed over. The edit is surgical — the
sheet part's XML for that one cell, nothing else — and it is only half
the job. The other half is the proof: the corrected copy is re-read by
the same reader that read the original, and **every cell is compared**.
One cell different — the target, changed exactly as asked — or the write
is refused and the original stands. A writer that says « done » without
that comparison is a writer trusted on its word, which is the one thing
this product exists not to ask for.

What the fixed copy honestly is: the formula is in the cell and Excel
computes it on next open (the cached answer is gone with the typed value,
and the calculation chain is dropped so Excel rebuilds it). The reader
sees the formula and no cached value — which is precisely what the
verification expects of the target, and only of the target.
"""

import re
import tempfile
import zipfile
from collections.abc import Sequence
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from .edit import CannotWrite, Edit

#: Parts whose only job is caching what Excel last calculated. Dropped so
#: Excel rebuilds them on open — stale ones are how a repaired workbook
#: greets its owner with « we found a problem with some content ».
CALC_CHAIN = "xl/calcChain.xml"


def write_workbook(payload: bytes, edits: Sequence[Edit]) -> bytes:
    """The workbook with each edit's cell now holding its formula.

    Every edit names a cell through its anchor (`sheet`, `ref`), the
    typed value expected there (`before`), and the formula to write
    (`after`). Raises :class:`CannotWrite` — with the reason in words —
    when the cell is not where the anchor says, does not hold `before`,
    already calculates, or when the re-read comparison finds any cell
    beyond the targets changed.
    """
    try:
        archive = zipfile.ZipFile(BytesIO(payload))
    except zipfile.BadZipFile as error:
        raise CannotWrite("Not a zip archive; an .xlsx is a zip.") from error
    names = [info.filename for info in archive.infolist()]
    if "xl/workbook.xml" not in names:
        raise CannotWrite("No xl/workbook.xml; this is not an Excel workbook.")
    parts = {name: archive.read(name) for name in names}
    compression = {info.filename: info.compress_type for info in archive.infolist()}

    sheets = _sheet_parts(parts)
    for edit in edits:
        sheet, cell = _place(edit)
        part = sheets.get(sheet)
        if part is None:
            raise CannotWrite(f"this workbook has no sheet called « {sheet} »")
        parts[part] = _rewrite_cell(parts[part], sheet, cell, edit)

    #: The cached calculation order refers to cells by position; after an
    #: edit it is stale, and Excel rebuilds it from the formulas anyway.
    if CALC_CHAIN in parts:
        del parts[CALC_CHAIN]
        names.remove(CALC_CHAIN)
        for meta in ("[Content_Types].xml", "xl/_rels/workbook.xml.rels"):
            if meta in parts:
                parts[meta] = re.sub(
                    rb"<[^<>]*calcChain\.xml[^<>]*/>", b"", parts[meta]
                )
    #: Ask Excel for a full pass on open, so the fixed cell's dependents
    #: shed their stale cached answers too. Only set where a `calcPr`
    #: already exists — inventing one risks the schema's element order.
    workbook_xml = parts["xl/workbook.xml"]
    if b"<calcPr" in workbook_xml and b"fullCalcOnLoad" not in workbook_xml:
        parts["xl/workbook.xml"] = workbook_xml.replace(
            b"<calcPr", b'<calcPr fullCalcOnLoad="1"', 1
        )

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as rebuilt:
        for name in names:
            rebuilt.writestr(
                name,
                parts[name],
                compress_type=compression.get(name, zipfile.ZIP_DEFLATED),
            )
    written = buffer.getvalue()

    _verify(payload, written, edits)
    return written


def _place(edit: Edit) -> tuple[str, str]:
    anchor = edit.anchor or {}
    ref = str(anchor.get("ref") or "")
    sheet = str(anchor.get("sheet") or "")
    if "!" in ref:
        named, ref = ref.rsplit("!", 1)
        sheet = sheet or named.strip("'").replace("''", "'")
    if not sheet or not re.fullmatch(r"\$?[A-Z]{1,3}\$?\d+", ref):
        raise CannotWrite("this finding does not name a cell to write into")
    return sheet, ref.replace("$", "")


def _sheet_parts(parts: dict[str, bytes]) -> dict[str, str]:
    """Sheet name → part path, from the workbook's own tables."""
    book = parts["xl/workbook.xml"].decode("utf-8", errors="replace")
    rels = parts.get("xl/_rels/workbook.xml.rels", b"").decode(
        "utf-8", errors="replace"
    )
    by_rid: dict[str, str] = {}
    for match in re.finditer(r"<Relationship\b[^>]*/?>", rels):
        tag = match.group(0)
        rid = re.search(r'Id="([^"]+)"', tag)
        target = re.search(r'Target="([^"]+)"', tag)
        if rid is None or target is None:
            continue
        where = target.group(1)
        #: Targets come relative to xl/ (« worksheets/sheet2.xml »),
        #: package-absolute (« /xl/worksheets/sheet2.xml »), or already
        #: prefixed — normalise all three to the archive's own names.
        if where.startswith("/"):
            where = where.lstrip("/")
        elif not where.startswith("xl/"):
            where = f"xl/{where}"
        by_rid[rid.group(1)] = where
    found: dict[str, str] = {}
    for match in re.finditer(r"<sheet\b[^>]*/?>", book):
        tag = match.group(0)
        name = re.search(r'name="([^"]*)"', tag)
        rid = re.search(r'r:id="([^"]*)"', tag)
        if name and rid and rid.group(1) in by_rid:
            found[_unescape(name.group(1))] = by_rid[rid.group(1)]
    return found


def _unescape(value: str) -> str:
    return (
        value.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&amp;", "&")
    )


def _rewrite_cell(xml: bytes, sheet: str, cell: str, edit: Edit) -> bytes:
    """The sheet part with one cell's typed value replaced by a formula."""
    pattern = re.compile(
        rb'<c\b[^>]*\br="' + cell.encode() + rb'"[^>]*(?:/>|>.*?</c>)',
        re.DOTALL,
    )
    matches = list(pattern.finditer(xml))
    if not matches:
        raise CannotWrite(
            f"« {sheet}!{cell} » is not in the workbook — the model has "
            "moved since this was found"
        )
    if len(matches) > 1:
        raise CannotWrite(
            f"« {sheet}!{cell} » appears more than once in the sheet's "
            "XML, which this will not guess about"
        )
    found = matches[0].group(0)
    if b"<f" in found:
        raise CannotWrite(
            f"« {sheet}!{cell} » already calculates — the typed value this "
            "fix replaces is no longer there"
        )
    held = re.search(rb"<v>([^<]*)</v>", found)
    if not _same_number(held.group(1).decode() if held else "", edit.before):
        shown = held.group(1).decode() if held else "nothing"
        raise CannotWrite(
            f"« {sheet}!{cell} » holds {shown}, not {edit.before} — the "
            "model has moved since this was found"
        )

    formula = edit.after.lstrip("=").strip()
    if not formula:
        raise CannotWrite("this fix carries no formula to write")
    #: The style stays; the typed value and any type attribute go — the
    #: cell is a numeric formula cell now, and its answer is Excel's to
    #: compute on open.
    opening = re.match(rb"<c\b[^>]*?(?=/>|>)", found)
    attrs = opening.group(0) if opening else b"<c"
    attrs = re.sub(rb'\st="[^"]*"', b"", attrs)
    return (
        xml[: matches[0].start()]
        + attrs
        + b">"
        + b"<f>"
        + escape(formula).encode()
        + b"</f></c>"
        + xml[matches[0].end() :]
    )


def _same_number(held: str, expected: str) -> bool:
    try:
        return abs(float(held) - float(expected.replace(",", ""))) <= max(
            1e-9, abs(float(expected.replace(",", ""))) * 1e-9
        )
    except ValueError:
        return held.strip() == expected.strip()


def _verify(original: bytes, written: bytes, edits: Sequence[Edit]) -> None:
    """Read both copies with the product's own reader; compare every cell.

    The targets must have become exactly their formulas, value pending
    Excel's recalculation. Everything else — every value, every formula,
    every cell present in either copy — must be identical, or the write
    is refused whole.
    """
    from ..workbook import read_workbook

    wanted: dict[str, str] = {}
    for edit in edits:
        sheet, cell = _place(edit)
        wanted[f"{sheet}!{cell}"] = edit.after.lstrip("=").strip()

    with tempfile.TemporaryDirectory(prefix="tieout-verify-") as folder:
        one = Path(folder) / "original.xlsx"
        two = Path(folder) / "written.xlsx"
        one.write_bytes(original)
        two.write_bytes(written)
        was = read_workbook(str(one))
        now = read_workbook(str(two))

    problems: list[str] = []
    for ref in set(was.cells) | set(now.cells):
        if ref in wanted:
            fixed = now.cells.get(ref)
            if fixed is None or (fixed.formula or "").lstrip("=") != wanted[ref]:
                problems.append(f"{ref} did not come back holding the fix's formula")
            continue
        before = was.cells.get(ref)
        after = now.cells.get(ref)
        if before is None or after is None:
            problems.append(f"{ref} is in one copy and not the other")
        elif before.value != after.value or before.formula != after.formula:
            problems.append(f"{ref} changed, and it was not the fix's cell")
        if len(problems) >= 4:
            break

    if problems:
        raise CannotWrite(
            "the corrected copy did not verify — "
            + "; ".join(problems[:3])
            + ". The original stands untouched."
        )


__all__ = ["write_workbook"]
