"""Write cells into an xlsx without breaking anything — Track A.

The write path (clone-plan.md, Track A). The rule the whole track
lives by: everything the edit does not touch keeps its exact bytes.
Resaving through a spreadsheet library rewrites the entire file —
cached values, styles, quirks and all — so this writer performs
surgery on the xlsx zip instead, the discipline the defect planter
proved: replace one cell's XML element, copy every other archive
member through untouched.

Scope so far: replace the formula and/or cached value of a cell
that already exists (A1), including members of shared-formula groups,
which are safely expanded to plain per-cell formulas first (A3).
Creation of new cells and rows is A2; array formulas are refused.
"""

import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import escape, unescape

#: Attribute order differs by producer — Excel and openpyxl disagree —
#: so sheets and relationships are parsed element-first, attributes
#: second, never by position.
SHEET_ELEMENT = re.compile(r"<sheet\s[^>]*>")
REL_ELEMENT = re.compile(r"<Relationship\s[^>]*>")
ATTR = {
    key: re.compile(rf'{key}="([^"]*)"') for key in ("name", "r:id", "Id", "Target")
}
CELL = re.compile(r'<c r="([A-Z]+\d+)"[^>]*?(?:/>|>.*?</c>)', re.DOTALL)
#: Both forms: a paired <f ...>text</f> and the self-closing
#: <f t="shared" si="0"/> a shared member carries.
FORMULA = re.compile(r"<f(?:\s([^>]*?))?\s*(?:/>|>(.*?)</f>)", re.DOTALL)
VALUE = re.compile(r"<v>(.*?)</v>", re.DOTALL)
HEAD = re.compile(r'<c r="[A-Z]+\d+"[^>]*?(?=/>|>)')
TYPE = re.compile(r'\st="[^"]*"')


class WriteRefused(Exception):
    """The writer will not perform an edit it cannot do safely."""


@dataclass
class Edit:
    sheet: str
    ref: str
    formula: str | None
    value: str
    before_formula: str | None = None
    before_value: str | None = None


@dataclass
class WorkbookWriter:
    """One workbook opened for surgery; edits accumulate, save writes.

    Every archive member the edits do not touch is copied through with
    its exact bytes. `edits` records before and after for each cell —
    the raw material of Track A's changeset.
    """

    path: Path
    members: dict[str, bytes] = field(default_factory=dict)
    order: list[zipfile.ZipInfo] = field(default_factory=list)
    sheet_paths: dict[str, str] = field(default_factory=dict)
    edits: list[Edit] = field(default_factory=list)
    touched: set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        self.path = Path(self.path)
        with zipfile.ZipFile(self.path) as archive:
            self.order = archive.infolist()
            self.members = {
                item.filename: archive.read(item.filename) for item in self.order
            }
        book = self.members["xl/workbook.xml"].decode("utf-8")
        rels = self.members["xl/_rels/workbook.xml.rels"].decode("utf-8")
        targets: dict[str, str] = {}
        for element in REL_ELEMENT.findall(rels):
            rel_id = ATTR["Id"].search(element)
            rel_target = ATTR["Target"].search(element)
            if rel_id and rel_target:
                targets[rel_id.group(1)] = rel_target.group(1)
        for element in SHEET_ELEMENT.findall(book):
            name = ATTR["name"].search(element)
            rid = ATTR["r:id"].search(element)
            if not name or not rid:
                continue
            target = targets.get(rid.group(1), "")
            if not target:
                continue
            if target.startswith("/"):
                target = target[1:]
            elif not target.startswith("xl/"):
                target = "xl/" + target
            self.sheet_paths[name.group(1).replace("&amp;", "&")] = target

    def _sheet_xml(self, sheet: str) -> tuple[str, str]:
        if sheet not in self.sheet_paths:
            raise WriteRefused(f"no sheet named « {sheet} »")
        member = self.sheet_paths[sheet]
        return member, self.members[member].decode("utf-8")

    def set_cell(
        self, sheet: str, ref: str, *, formula: str | None, value: str
    ) -> Edit:
        """Replace an existing cell's formula and cached value.

        `formula=None` makes the cell a typed constant. The cell's
        style index and — for formulas — its cached-value type are
        preserved, so a formula whose result is text stays `t="str"`.
        """
        member, xml = self._sheet_xml(sheet)
        cells = {m.group(1): m.group(0) for m in CELL.finditer(xml)}
        if ref not in cells:
            raise WriteRefused(f"{sheet}!{ref} does not exist — creating cells is A2")
        old = cells[ref]
        found = FORMULA.search(old)
        if found and "t=" in (found.group(1) or ""):
            attrs = found.group(1) or ""
            kind = re.search(r't="(\w+)"', attrs)
            if kind and kind.group(1) == "shared":
                #: A shared member cannot be edited in place, but the
                #: group can be expanded to plain formulas first — each
                #: member gets the master's formula translated to its
                #: own position. After that the edit is ordinary.
                si = re.search(r'si="(\d+)"', attrs)
                if si is None:
                    raise WriteRefused(
                        f"{sheet}!{ref}: shared formula with no group id"
                    )
                self._unshare(sheet, si.group(1))
                member, xml = self._sheet_xml(sheet)
                cells = {m.group(1): m.group(0) for m in CELL.finditer(xml)}
                old = cells[ref]
                found = FORMULA.search(old)
            else:
                raise WriteRefused(
                    f"{sheet}!{ref} belongs to an array formula group — "
                    f"editing it would corrupt its siblings"
                )
        head = HEAD.match(old).group(0)  # type: ignore[union-attr]
        kept_type = TYPE.search(head)
        head = TYPE.sub("", head)
        if formula is not None and kept_type:
            head += kept_type.group(0)
        #: The sheet XML stores formulas without their leading « = »;
        #: the writer speaks the reader's dialect (with it) and
        #: translates at the boundary, both directions.
        body = ""
        if formula is not None:
            body += f"<f>{escape(formula.removeprefix('='))}</f>"
        body += f"<v>{escape(value)}</v>"
        new = f"{head}>{body}</c>"
        self.members[member] = xml.replace(old, new, 1).encode("utf-8")
        self.touched.add(member)
        edit = Edit(
            sheet=sheet,
            ref=ref,
            formula=formula,
            value=value,
            before_formula=(
                "=" + unescape(found.group(2)) if found and found.group(2) else None
            ),
            before_value=(unescape(m.group(1)) if (m := VALUE.search(old)) else None),
        )
        self.edits.append(edit)
        return edit

    def _unshare(self, sheet: str, si: str) -> None:
        """Expand one shared-formula group into plain formulas.

        Excel stores the group once: the master cell carries
        `<f t="shared" ref="..." si="N">formula</f>` and every other
        member just `<f t="shared" si="N"/>`. Editing any member in
        place corrupts the rest, so the group is dissolved first —
        openpyxl's Translator shifts the master's relative references
        to each member's own position, exactly as Excel would have
        filled them. Cached values are untouched.
        """
        from openpyxl.formula.translate import Translator

        member, xml = self._sheet_xml(sheet)
        master_formula = None
        master_ref = None
        group = []
        for match in CELL.finditer(xml):
            cell_xml = match.group(0)
            f = FORMULA.search(cell_xml)
            if not f:
                continue
            attrs = f.group(1) or ""
            if "shared" not in attrs:
                continue
            got = re.search(r'si="(\d+)"', attrs)
            if got is None or got.group(1) != si:
                continue
            group.append((match.group(1), cell_xml, f))
            if f.group(2):
                master_formula = unescape(f.group(2))
                master_ref = match.group(1)
        if master_formula is None or master_ref is None:
            raise WriteRefused(
                f"shared group {si} on « {sheet} » has no master formula"
            )
        for ref, cell_xml, f in group:
            translated = (
                master_formula
                if ref == master_ref
                else Translator("=" + master_formula, origin=master_ref)
                .translate_formula(ref)
                .removeprefix("=")
            )
            plain = f"<f>{escape(translated)}</f>"
            new_cell = cell_xml.replace(f.group(0), plain, 1)
            xml = xml.replace(cell_xml, new_cell, 1)
        self.members[member] = xml.encode("utf-8")
        self.touched.add(member)

    def save(self, out: Path | str) -> Path:
        """Write the workbook; untouched members keep their bytes.

        Excel's cached calculation chain describes the file before the
        edit, so any formula write drops it — Excel and LibreOffice
        rebuild it on open (clone-plan A6).
        """
        out = Path(out)
        drop_chain = any(edit.formula is not None for edit in self.edits)
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
            for item in self.order:
                if drop_chain and item.filename == "xl/calcChain.xml":
                    continue
                data = self.members[item.filename]
                archive.writestr(item, data)
        if drop_chain and "xl/calcChain.xml" in self.members:
            self._drop_chain_reference(out)
        return out

    def _drop_chain_reference(self, out: Path) -> None:
        """[Content_Types].xml must not advertise the dropped chain."""
        with zipfile.ZipFile(out) as archive:
            order = archive.infolist()
            members = {i.filename: archive.read(i.filename) for i in order}
        kinds = members["[Content_Types].xml"].decode("utf-8")
        kinds = re.sub(r"<Override[^>]*calcChain[^>]*/>", "", kinds)
        members["[Content_Types].xml"] = kinds.encode("utf-8")
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
            for item in order:
                archive.writestr(item, members[item.filename])
