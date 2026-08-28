"""C3 — the delta report in review language.

What a reviewer asks about a revision is not « which cells differ »
but: what broke, what was repaired, which assumptions moved, where
did the method change, and which results are materially different.
This module answers in those words, standing on the whole Watch:
C2's alignment maps positions so a row insert is one structural
change rather than a hundred false edits, and the engine — a
read-only library here — audits both sides through the same chain
the ingest path uses, so the defect delta is the revision-defect
study's own discipline (`docs/pierce/revision-defect-protocol.md`):
findings matched on rule + sheet + name, never the address, empty
names bucketed rather than guessed.

The classes, the fold, the ranking and the 1% materiality line are
registered in `docs/pierce/logs/prism.md` (« C3 registration »)
before any real pair produced a number.
"""

from collections import Counter
from dataclasses import dataclass, field, replace
from decimal import Decimal

from polar.tieout.audit import Finding, _shape, audit
from polar.tieout.structure import period_axes
from polar.tieout.workbook import Cell, Workbook, read_workbook

from .align import SheetAlignment, align_sheet, structural_changes
from .signature import _absolute, sheet_grids

#: Registered materiality line for « the output moved »: 1% relative,
#: scale = max(|old|, |new|). Moves only by a written round.
MATERIAL = Decimal("0.01")

_KIND_ORDER = [
    "new_defect",
    "class_change",
    "relabelled_line",
    "methodology_change",
    "moved_assumption",
    "emptied_cell",
    "filled_cell",
    "material_output",
    "structure",
    "repaired_defect",
]


def finding_key(finding: Finding) -> tuple[str, str, str] | None:
    """The study's matching key, or None for a finding that cannot be
    matched with confidence (empty name)."""
    name = (finding.name or "").strip()
    if not name:
        return None
    return (finding.rule, finding.sheet, name)


def keyed_findings(
    findings: list[Finding],
) -> tuple[
    Counter[tuple[str, str, str]], dict[tuple[str, str, str], list[Finding]], int
]:
    """Multiset of keys, the findings behind each key, and the
    unmatched count."""
    keys: Counter[tuple[str, str, str]] = Counter()
    behind: dict[tuple[str, str, str], list[Finding]] = {}
    unmatched = 0
    for finding in findings:
        key = finding_key(finding)
        if key is None:
            unmatched += 1
            continue
        keys[key] += 1
        behind.setdefault(key, []).append(finding)
    return keys, behind, unmatched


def _column_letters(number: int) -> str:
    letters = ""
    while number > 0:
        number, remainder = divmod(number - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


@dataclass(frozen=True)
class DeltaItem:
    """One reviewed change — one authoring decision where possible."""

    kind: str
    sheet: str
    #: Old-side row block for row-shaped items; 0 when not row-shaped.
    first_row: int = 0
    last_row: int = 0
    #: Column letters touched, old-side, in order.
    columns: tuple[str, ...] = ()
    detail: str = ""
    #: Orders items inside their kind; engine finding weight where the
    #: item is a finding, magnitude otherwise.
    weight: float = 0.0
    #: The finding keys folded into this item, when it carries any.
    findings: tuple[str, ...] = ()


@dataclass
class DeltaReport:
    old: str
    new: str
    #: The study-comparable numbers, exactly revision_diff's semantics.
    new_defects: int = 0
    repaired_defects: int = 0
    persistent_defects: int = 0
    unmatched_old: int = 0
    unmatched_new: int = 0
    #: Review-language items, ranked: what broke, what changed class,
    #: where the method moved, which assumptions moved, which outputs
    #: moved materially, the structure, then the repairs.
    items: list[DeltaItem] = field(default_factory=list)
    sheets_added: tuple[str, ...] = ()
    sheets_removed: tuple[str, ...] = ()

    @property
    def summary(self) -> dict[str, int]:
        counts: dict[str, int] = {
            "new_defects": self.new_defects,
            "repaired_defects": self.repaired_defects,
            "persistent_defects": self.persistent_defects,
            "unmatched_old": self.unmatched_old,
            "unmatched_new": self.unmatched_new,
        }
        for item in self.items:
            counts[item.kind] = counts.get(item.kind, 0) + 1
        return counts


def _signature(cell: Cell) -> str:
    if cell.formula is None:
        return ""
    shape = _shape(cell)
    if not shape:
        return cell.formula
    return _absolute(shape, cell.sheet, cell.row, cell.column)


def _shown(cell: Cell) -> str:
    """What a reviewer needs to see of a cell that appeared or went:
    its formula if it has one, else its value."""
    if cell.formula is not None:
        return cell.formula[:80]
    return str(cell.value)


def _material(old: Decimal | None, new: Decimal | None) -> Decimal | None:
    """The relative move past the registered line, or None."""
    if old is None or new is None or old == new:
        return None
    scale = max(abs(old), abs(new))
    if scale == 0:
        return None
    move = abs(new - old) / scale
    return move if move >= MATERIAL else None


def _fold(
    events: dict[tuple[str, str], dict[int, list[tuple[int, str, float]]]],
) -> list[DeltaItem]:
    """Per (kind, sheet): cells fold to rows, contiguous rows to one
    block — one authoring decision, one item."""
    items: list[DeltaItem] = []
    for (kind, sheet), rows in events.items():
        block: list[int] = []
        for row in sorted(rows):
            if block and row == block[-1] + 1:
                block.append(row)
            else:
                if block:
                    items.append(_block_item(kind, sheet, block, rows))
                block = [row]
        if block:
            items.append(_block_item(kind, sheet, block, rows))
    return items


def _block_item(
    kind: str,
    sheet: str,
    block: list[int],
    rows: dict[int, list[tuple[int, str, float]]],
) -> DeltaItem:
    cells = [entry for row in block for entry in rows[row]]
    columns = tuple(
        _column_letters(column) for column in sorted({c for c, _, _ in cells})
    )
    details = [d for _, d, _ in cells if d]
    detail = details[0] if details else ""
    #: A folded block reports its first cell's story, which reads as
    #: one cell when it may be two dozen — twelve months of outturn
    #: typed into a sheet came back as « a cell that was empty now
    #: holds 121.2 ». The extent belongs in the line.
    if detail and len(cells) > 1:
        detail = f"{detail} ({len(cells)} cells)"
    return DeltaItem(
        kind=kind,
        sheet=sheet,
        first_row=block[0],
        last_row=block[-1],
        columns=columns,
        detail=detail,
        weight=max((w for _, _, w in cells), default=0.0),
    )


def delta_report(old_path: str, new_path: str) -> DeltaReport:
    old_book = read_workbook(old_path)
    new_book = read_workbook(new_path)
    return delta_of(old_book, new_book, old_name=old_path, new_name=new_path)


def delta_of(
    old_book: Workbook,
    new_book: Workbook,
    *,
    old_name: str = "old",
    new_name: str = "new",
) -> DeltaReport:
    old_findings = audit(old_book, axes=period_axes(old_book)).findings
    new_findings = audit(new_book, axes=period_axes(new_book)).findings

    old_keys, old_behind, unmatched_old = keyed_findings(old_findings)
    new_keys, new_behind, unmatched_new = keyed_findings(new_findings)
    new_only = new_keys - old_keys
    old_only = old_keys - new_keys

    report = DeltaReport(
        old=old_name,
        new=new_name,
        new_defects=sum(new_only.values()),
        repaired_defects=sum(old_only.values()),
        persistent_defects=sum((old_keys & new_keys).values()),
        unmatched_old=unmatched_old,
        unmatched_new=unmatched_new,
    )

    old_grids = sheet_grids(old_book)
    new_grids = sheet_grids(new_book)
    report.sheets_added = tuple(s for s in new_grids if s not in old_grids)
    report.sheets_removed = tuple(s for s in old_grids if s not in new_grids)

    old_cells = {(c.sheet, c.row, c.column): c for c in old_book.cells.values()}
    new_cells = {(c.sheet, c.row, c.column): c for c in new_book.cells.values()}

    #: (kind, sheet) -> old row -> [(old column, detail, weight)]
    events: dict[tuple[str, str], dict[int, list[tuple[int, str, float]]]] = {}
    structure: list[DeltaItem] = []
    class_change_refs: dict[str, set[str]] = {}

    def record(
        kind: str, sheet: str, row: int, column: int, detail: str, weight: float
    ) -> None:
        events.setdefault((kind, sheet), {}).setdefault(row, []).append(
            (column, detail, weight)
        )

    for sheet in old_grids:
        if sheet not in new_grids:
            continue
        alignment: SheetAlignment = align_sheet(old_grids[sheet], new_grids[sheet])
        row_map = alignment.rows.mapping
        column_map = alignment.columns.mapping

        for change in structural_changes(alignment):
            kind = str(change["kind"])
            if kind.startswith(("inserted", "deleted")):
                structure.append(
                    DeltaItem(
                        kind="structure",
                        sheet=sheet,
                        first_row=int(str(change["first"])),
                        last_row=int(str(change["last"])),
                        detail=kind.replace("_", " "),
                    )
                )

        #: Class 7 (the written amendment in the lane log): a matched
        #: line whose label changed is its own review item — v5 of the
        #: ED2 model turned « Spare » rows into « Connections Reform
        #: Costs » without touching a value, and that rename is
        #: exactly what a reviewer must see.
        for axis_name, lines, old_lines, new_lines in (
            ("row", alignment.rows, old_grids[sheet].rows, new_grids[sheet].rows),
            (
                "column",
                alignment.columns,
                old_grids[sheet].columns,
                new_grids[sheet].columns,
            ),
        ):
            old_labels = {line.index: line.label for line in old_lines}
            new_labels = {line.index: line.label for line in new_lines}
            for match in lines.matched:
                before_label = old_labels.get(match.old, "")
                after_label = new_labels.get(match.new, "")
                if before_label and after_label and before_label != after_label:
                    where = match.old if axis_name == "row" else 0
                    detail = f"« {before_label} » → « {after_label} »"
                    if axis_name == "column":
                        detail = f"column {_column_letters(match.old)}: {detail}"
                    structure.append(
                        DeltaItem(
                            kind="relabelled_line",
                            sheet=sheet,
                            first_row=where,
                            last_row=where,
                            detail=detail[:180],
                            weight=0.6,
                        )
                    )

        for old_row, new_row in row_map.items():
            for old_column, new_column in column_map.items():
                before = old_cells.get((sheet, old_row, old_column))
                after = new_cells.get((sheet, new_row, new_column))
                #: The C3 deferral, now due: a cell that exists on one
                #: side only *at a matched position* — the new period's
                #: actual typed into an existing row. The row and column
                #: are matched by construction here, so an inserted
                #: line's cells stay `structure` and are never counted
                #: twice.
                if before is None and after is None:
                    continue
                if before is None:
                    assert after is not None
                    record(
                        "filled_cell",
                        sheet,
                        old_row,
                        old_column,
                        f"a cell that was empty now holds {_shown(after)}",
                        0.55,
                    )
                    continue
                if after is None:
                    record(
                        "emptied_cell",
                        sheet,
                        old_row,
                        old_column,
                        f"a cell holding {_shown(before)} is now empty",
                        0.65,
                    )
                    continue
                was_formula = before.formula is not None
                is_formula = after.formula is not None
                if was_formula != is_formula:
                    direction = (
                        "a live formula became a typed constant"
                        if was_formula
                        else "a typed constant became a formula"
                    )
                    record("class_change", sheet, old_row, old_column, direction, 1.0)
                    class_change_refs.setdefault(sheet, set()).update(
                        {before.ref, after.ref}
                    )
                elif not was_formula:
                    if before.value != after.value:
                        record(
                            "moved_assumption",
                            sheet,
                            old_row,
                            old_column,
                            f"{before.value} → {after.value}",
                            0.5,
                        )
                elif _signature(before) != _signature(after):
                    #: Both shapes, not just the fact of the change:
                    #: « the calculation changed shape » is true and
                    #: nearly useless on the specimen that motivated
                    #: this — a vertical sum that became a horizontal
                    #: one, where the shapes say it in one line and
                    #: the formula text would drown the reader in
                    #: absolute references.
                    record(
                        "methodology_change",
                        sheet,
                        old_row,
                        old_column,
                        f"{_signature(before)[:70]} → {_signature(after)[:70]}",
                        0.75,
                    )
                else:
                    moved = _material(before.value, after.value)
                    if moved is not None:
                        record(
                            "material_output",
                            sheet,
                            old_row,
                            old_column,
                            f"moved {float(moved):.1%}",
                            float(moved),
                        )

    items = _fold(events)

    #: The class-change join, registered: a repaired finding and a new
    #: finding landing on a class-changed position are one event — the
    #: « repaired cell, hardcoded tail » case. The joined keys ride on
    #: the class-change item rather than standing as separate news.
    joined: set[tuple[str, str, str]] = set()
    for index, item in enumerate(items):
        if item.kind != "class_change":
            continue
        refs = class_change_refs.get(item.sheet, set())
        touching: list[tuple[tuple[str, str, str], str]] = []
        for source, keyset, word in (
            (new_behind, new_only, "new"),
            (old_behind, old_only, "repaired"),
        ):
            for key, group in source.items():
                if (
                    key in keyset
                    and key[1] == item.sheet
                    and any(f.ref in refs for f in group)
                ):
                    touching.append((key, f"{word}: {key[0]}"))
        if touching:
            joined.update(key for key, _ in touching)
            items[index] = replace(
                item, findings=tuple(sorted({label for _, label in touching}))
            )

    for key in new_only:
        if key in joined:
            continue
        group = new_behind[key]
        best = max(group, key=lambda f: f.weight)
        items.append(
            DeltaItem(
                kind="new_defect",
                sheet=key[1],
                detail=f"[{key[0]}] {key[2]}"[:180],
                weight=best.weight,
                findings=(key[0],),
            )
        )
    for key in old_only:
        if key in joined:
            continue
        items.append(
            DeltaItem(
                kind="repaired_defect",
                sheet=key[1],
                detail=f"[{key[0]}] {key[2]}"[:180],
                weight=0.0,
                findings=(key[0],),
            )
        )

    items.extend(structure)
    items.sort(key=lambda item: (_KIND_ORDER.index(item.kind), -item.weight))
    report.items = items
    return report
