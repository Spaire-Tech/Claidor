"""C1 — the raw version diff, cell by cell, no opinions.

Two axes per cell, kept apart because they answer different
questions:

  content — the formula text where there is one, otherwise the typed
            literal. A content change is an authoring decision.
  value   — what Excel last cached, exactly as stored. A value change
            with no content change means an input somewhere else
            moved; the raw diff records the fact and claims nothing
            about the cause, because a saved file cannot support a
            causal chain (that needs a recalculation — Track B).

No tolerance anywhere: a tolerance is an opinion about materiality
and the raw diff has none. Values are compared type-tagged (the
number 1, the text « 1 » and the boolean TRUE are three different
stored things) and rendered through `repr`, which is canonical for
floats — two cached numbers compare equal exactly when the stored
doubles are equal.

Verified against `scripts/watch_handcheck.py` — an independent
stdlib-only reader of the raw sheet XML — under the protocol
registered in `docs/pierce/logs/prism.md` before results existed.
"""

from dataclasses import dataclass
from datetime import date, datetime, time

import openpyxl

#: Excel's own error values, as cached results. Mirrors the engine's
#: list (`polar.tieout.workbook.ERROR_VALUES`) rather than importing
#: it: the Watch's read path stands alone, and a frozen copy of seven
#: constants is cheaper than a dependency on an engine module.
_ERRORS = frozenset(
    {"#REF!", "#NAME?", "#VALUE!", "#NULL!", "#NUM!", "#N/A", "#DIV/0!"}
)


def _tag(value: object, *, under_formula: bool) -> str:
    """A stored value with its type on the front, so equality means
    « the same stored thing », never « Python happens to coerce them
    equal » — bool is an int in Python and TRUE is not 1 in a model."""
    if isinstance(value, bool):
        return f"b:{int(value)}"
    if isinstance(value, (int, float)):
        return f"n:{value!r}"
    if isinstance(value, (datetime, date, time)):
        return f"d:{value.isoformat()}"
    text = str(value)
    if text in _ERRORS:
        return f"e:{text}"
    return ("str:" if under_formula else "s:") + text


def _formula_text(value: object) -> str | None:
    """The formula as text, or None when the cell holds a literal.
    openpyxl hands back a plain string for ordinary formulas and an
    ArrayFormula object for CSE ones."""
    if isinstance(value, str) and value.startswith("="):
        return value
    text = getattr(value, "text", None)  # ArrayFormula and DataTableFormula
    if text is not None:
        return str(text)
    return None


def read_raw(path: str) -> tuple[dict[str, tuple[str, str]], list[str]]:
    """Every populated cell — « Sheet!D26 » -> (content, tagged value) —
    and the worksheet names, in tab order.

    Populated means the file stores a formula or a value there; a cell
    carrying only a style is furniture, not content. Read twice, once
    for what each cell says and once for what Excel last computed,
    because openpyxl will only surface one or the other.
    """
    formulas = openpyxl.load_workbook(path, data_only=False, read_only=True)
    values = openpyxl.load_workbook(path, data_only=True, read_only=True)
    cells: dict[str, tuple[str, str]] = {}
    try:
        sheets = [sheet.title for sheet in formulas.worksheets]
        cached: dict[str, dict[str, object]] = {}
        for sheet in values.worksheets:
            grid: dict[str, object] = {}
            for row in sheet.iter_rows():
                for cell in row:
                    if cell.value is not None:
                        grid[cell.coordinate] = cell.value
            cached[sheet.title] = grid

        for sheet in formulas.worksheets:
            sheet_values = cached.get(sheet.title, {})
            seen: set[str] = set()
            for row in sheet.iter_rows():
                for cell in row:
                    if cell.value is None:
                        continue
                    seen.add(cell.coordinate)
                    formula = _formula_text(cell.value)
                    stored = sheet_values.get(cell.coordinate)
                    if formula is not None:
                        content = "f:" + formula
                        value = (
                            _tag(stored, under_formula=True)
                            if stored is not None
                            else ""
                        )
                    else:
                        value = _tag(cell.value, under_formula=False)
                        content = value
                    cells[f"{sheet.title}!{cell.coordinate}"] = (content, value)
            # A formula whose text load came back None (openpyxl hides
            # nothing today, but read paths have surprised this codebase
            # before) would vanish silently; a cached value with no
            # stored content on the other load is at least recorded.
            for coordinate, stored in sheet_values.items():
                if coordinate not in seen:
                    value = _tag(stored, under_formula=False)
                    cells[f"{sheet.title}!{coordinate}"] = (value, value)
    finally:
        formulas.close()
        values.close()
    return cells, sheets


@dataclass(frozen=True)
class CellDelta:
    """One cell's difference between the two versions."""

    ref: str
    #: « added » | « removed » | « changed ».
    kind: str
    #: For « changed »: which axes moved. A retyped literal moves both.
    formula_changed: bool = False
    value_changed: bool = False
    before_content: str | None = None
    after_content: str | None = None
    before_value: str | None = None
    after_value: str | None = None


@dataclass(frozen=True)
class VersionDiff:
    old: str
    new: str
    sheets_added: tuple[str, ...]
    sheets_removed: tuple[str, ...]
    deltas: tuple[CellDelta, ...]
    populated_old: int
    populated_new: int
    unchanged: int

    def refs(self, kind: str) -> list[str]:
        return [delta.ref for delta in self.deltas if delta.kind == kind]

    @property
    def summary(self) -> dict[str, int]:
        counts = {
            "added": 0,
            "removed": 0,
            "changed": 0,
            "formula_changed": 0,
            "value_changed": 0,
        }
        for delta in self.deltas:
            counts[delta.kind] += 1
            if delta.formula_changed:
                counts["formula_changed"] += 1
            if delta.value_changed:
                counts["value_changed"] += 1
        counts["unchanged"] = self.unchanged
        counts["populated_old"] = self.populated_old
        counts["populated_new"] = self.populated_new
        return counts


def diff_raw(
    old: dict[str, tuple[str, str]],
    new: dict[str, tuple[str, str]],
    *,
    old_sheets: list[str] | None = None,
    new_sheets: list[str] | None = None,
    old_name: str = "old",
    new_name: str = "new",
) -> VersionDiff:
    deltas: list[CellDelta] = []
    unchanged = 0
    for ref in sorted(old.keys() | new.keys()):
        before, after = old.get(ref), new.get(ref)
        if before is None:
            assert after is not None
            deltas.append(
                CellDelta(
                    ref,
                    "added",
                    after_content=after[0],
                    after_value=after[1],
                )
            )
        elif after is None:
            deltas.append(
                CellDelta(
                    ref,
                    "removed",
                    before_content=before[0],
                    before_value=before[1],
                )
            )
        elif before != after:
            deltas.append(
                CellDelta(
                    ref,
                    "changed",
                    formula_changed=before[0] != after[0],
                    value_changed=before[1] != after[1],
                    before_content=before[0],
                    after_content=after[0],
                    before_value=before[1],
                    after_value=after[1],
                )
            )
        else:
            unchanged += 1
    before_sheets = old_sheets or []
    after_sheets = new_sheets or []
    return VersionDiff(
        old=old_name,
        new=new_name,
        sheets_added=tuple(s for s in after_sheets if s not in before_sheets),
        sheets_removed=tuple(s for s in before_sheets if s not in after_sheets),
        deltas=tuple(deltas),
        populated_old=len(old),
        populated_new=len(new),
        unchanged=unchanged,
    )


def diff_paths(old_path: str, new_path: str) -> VersionDiff:
    """The raw diff between two saved versions, straight from disk."""
    old, old_sheets = read_raw(old_path)
    new, new_sheets = read_raw(new_path)
    return diff_raw(
        old,
        new,
        old_sheets=old_sheets,
        new_sheets=new_sheets,
        old_name=old_path,
        new_name=new_path,
    )
