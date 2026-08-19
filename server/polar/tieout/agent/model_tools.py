"""What the assistant may do inside one model.

The main-screen chat answers a different question from the review chat.
The review chat answers *why did you flag this*; this one answers *what
is this model* — asked by someone who did not build it. The person who
inherited a file, the auditor opening it for the first time, the fund in
week one of a secondary. They all currently open sheet one and click
cells for two days; the graph answers in seconds.

Six tools, one per question a stranger actually asks, plus a locator so
« the interest line » can become a cell before a walk starts:

- **locate** — find cells by the model's own words for them.
- **trace_back** — where does this number come from. The precedent
  graph, read upward, ending honestly at typed inputs and at references
  the file cannot resolve.
- **trace_forward** — if I change this, what moves. The dependents
  graph — the one question no general model can answer, because it does
  not have the graph. Reach, not recalculation: the tool names what
  reads the cell, it does not simulate the change.
- **inventory** — every typed input, every hardcode, every external
  link, filtered to a sheet when asked. Lists, because the filter is
  whatever the person asked and no dashboard can pre-build that.
- **structure** — the day-one questions: the sheets in the workbook's
  own order, each sheet's time axis, what is hidden, whether iterative
  calculation is declared.
- **versions** — what changed since the version before, from stored
  cells, never from memory.

The same discipline as every agent here: **nothing computes an answer
about a number** — every figure comes out of the stored graph the
engine read; **nothing writes**; **everything is scoped to one model**,
loaded once. A tool asked about anything outside the file says so.
"""

import re
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID

from polar.agent import ToolResult, Toolset

from ..audit import EXTERNAL, _buried, shown_number
from ..flows import dependents_index, flow
from ..workbook import Cell, Workbook

#: Rows handed back at once. Past this the useful answer is the count
#: and the shape — and the screen shows rows, not walls.
MAX_ROWS = 12

#: How many cells a forward reach may visit before reporting « at
#: least » instead of an exact count.
MAX_REACH = 5_000


@dataclass
class ModelWorkspace:
    """The one model this assistant may touch, already loaded."""

    dossier_id: UUID
    name: str
    filename: str
    version: int
    book: Workbook
    axes: dict[str, Any]
    dependents: dict[str, list[str]]
    versions: list[dict[str, Any]]
    diff: dict[str, Any] | None
    counts: dict[str, Any] = field(default_factory=dict)


def _refuse(summary: str) -> ToolResult:
    return ToolResult(ok=False, summary=summary, data={"error": summary})


def _value(cell: Cell | None) -> str:
    if cell is None or cell.value is None:
        return ""
    return shown_number(float(cell.value))


def _what(cell: Cell) -> str:
    """The model's own words for a cell, or the honest mechanical ones."""
    if cell.name:
        return cell.name
    if cell.formula:
        short = cell.formula if len(cell.formula) <= 60 else cell.formula[:57] + "…"
        return short
    return "typed value"


def _row(cell: Cell) -> dict[str, str]:
    return {"ref": cell.ref, "what": _what(cell), "value": _value(cell)}


def _resolve(workspace: ModelWorkspace, ref_or_name: str) -> list[Cell]:
    """A ref exactly, else the cells whose names carry every word."""
    book = workspace.book
    exact = book.cells.get(ref_or_name)
    if exact is not None:
        return [exact]
    #: A bare coordinate — « F44 » — tried on every sheet.
    if re.fullmatch(r"[A-Za-z]{1,3}\d{1,7}", ref_or_name):
        found = [
            cell
            for sheet in book.sheets
            if (cell := book.cells.get(f"{sheet}!{ref_or_name.upper()}")) is not None
        ]
        if found:
            return found
    words = [w for w in re.split(r"\W+", ref_or_name.lower()) if w]
    if not words:
        return []
    matches = [
        cell
        for cell in book.cells.values()
        if cell.name and all(w in cell.name.lower() for w in words)
    ]
    #: Labelled formula rows first — « Opex total » should beat a stray
    #: cell whose composed name happens to carry the words.
    matches.sort(key=lambda c: (c.formula is None, len(c.name)))
    return matches[:MAX_ROWS]


def locate(workspace: ModelWorkspace, query: str) -> ToolResult:
    """Find cells by the model's own labels, before walking anywhere."""
    found = _resolve(workspace, query)
    if not found:
        return _refuse(f"Nothing in {workspace.filename} is named like « {query} »")
    rows = [_row(cell) for cell in found[:MAX_ROWS]]
    return ToolResult(
        ok=True,
        summary=f"Found {len(rows)} cells named like « {query} »",
        data={"rows": rows},
    )


def trace_back(workspace: ModelWorkspace, ref: str) -> ToolResult:
    """Where a number comes from: the precedent graph, read upward."""
    found = _resolve(workspace, ref)
    if not found:
        return _refuse(f"« {ref} » is not in {workspace.filename}")
    start = found[0]
    book = workspace.book

    rows: list[dict[str, str]] = [_row(start)]
    ends: list[str] = []
    seen = {start.ref}
    queue = deque([(start, 0)])
    while queue and len(rows) < MAX_ROWS:
        cell, depth = queue.popleft()
        if cell.formula is None:
            if cell.ref != start.ref:
                ends.append(f"{cell.ref} is a typed input — nothing behind it")
            continue
        for reason in cell.unresolved[:2]:
            ends.append(f"{cell.ref} reads something unreachable: {reason[1]}")
        if depth >= 3:
            continue
        for parent_ref in cell.precedents[:4]:
            if parent_ref in seen:
                continue
            seen.add(parent_ref)
            parent = book.cells.get(parent_ref)
            if parent is None:
                continue
            rows.append(_row(parent))
            queue.append((parent, depth + 1))
            if len(rows) >= MAX_ROWS:
                break

    total = len(start.precedents)
    return ToolResult(
        ok=True,
        summary=f"Walked back from {start.ref} ({total} direct inputs)",
        data={
            "rows": rows,
            "direct_inputs": total,
            "chain_ends": ends[:4],
            "formula": start.formula or "typed value",
        },
    )


def trace_forward(workspace: ModelWorkspace, ref: str) -> ToolResult:
    """What moves if this changes: the dependents graph, walked down.

    Reach, not recalculation — the rows are what reads the cell, and
    the counts are how far it travels. Nothing simulates the change.
    """
    found = _resolve(workspace, ref)
    if not found:
        return _refuse(f"« {ref} » is not in {workspace.filename}")
    start = found[0]
    book = workspace.book
    index = workspace.dependents

    direct = index.get(start.ref, [])
    rows = [
        _row(cell)
        for one in direct[:MAX_ROWS]
        if (cell := book.cells.get(one)) is not None
    ]

    #: The full reach: every cell the value touches, and the sheets.
    seen: set[str] = set()
    queue = deque([start.ref])
    sheets: set[str] = set()
    while queue and len(seen) < MAX_REACH:
        for one in index.get(queue.popleft(), ()):
            if one in seen:
                continue
            seen.add(one)
            sheets.add(one.split("!", 1)[0])
            queue.append(one)
    named = flow(book, index, start.ref)

    if not direct:
        return ToolResult(
            ok=True,
            summary=f"Nothing in the model reads {start.ref}",
            data={
                "rows": [_row(start)],
                "reach_cells": 0,
                "note": "No formula in this file reads this cell.",
            },
        )
    return ToolResult(
        ok=True,
        summary=(
            f"{start.ref} reaches {len(seen)}"
            f"{'+' if len(seen) >= MAX_REACH else ''} cells "
            f"across {len(sheets)} sheets"
        ),
        data={
            "rows": rows,
            "reach_cells": len(seen),
            "reach_capped": len(seen) >= MAX_REACH,
            "reach_sheets": sorted(sheets),
            "flows_into": named,
        },
    )


def inventory(
    workspace: ModelWorkspace, kind: str, sheet: str | None = None
) -> ToolResult:
    """Lists with the person's own filter: typed inputs, hardcodes,
    external links."""
    book = workspace.book
    cells = [
        cell
        for cell in book.cells.values()
        if sheet is None or cell.sheet.lower() == sheet.lower()
    ]
    if sheet is not None and not cells:
        return _refuse(
            f"{workspace.filename} has no sheet called « {sheet} » — "
            f"its sheets are {', '.join(book.sheets[:12])}"
        )

    if kind == "typed":
        found = [c for c in cells if c.formula is None and c.value is not None]
        what = "typed inputs"
    elif kind == "hardcodes":
        found = [c for c in cells if c.formula and _buried(c.formula)]
        what = "formulas with a number typed inside"
    elif kind == "external-links":
        found = [c for c in cells if c.formula and EXTERNAL.search(c.formula)]
        what = "references into other workbooks"
    else:
        return _refuse("kind must be one of: typed, hardcodes, external-links")

    by_sheet: dict[str, int] = {}
    for cell in found:
        by_sheet[cell.sheet] = by_sheet.get(cell.sheet, 0) + 1
    #: The biggest figures first — the hardcode worth asking about is
    #: rarely the smallest one.
    found.sort(
        key=lambda c: abs(float(c.value)) if c.value is not None else 0,
        reverse=True,
    )
    return ToolResult(
        ok=True,
        summary=(
            f"{len(found)} {what}"
            + (f" on {sheet}" if sheet else f" across {len(by_sheet)} sheets")
        ),
        data={
            "rows": [_row(cell) for cell in found[:MAX_ROWS]],
            "total": len(found),
            "by_sheet": dict(sorted(by_sheet.items(), key=lambda kv: -kv[1])[:10]),
        },
    )


def structure(workspace: ModelWorkspace) -> ToolResult:
    """The day-one questions: sheets, time axes, what is hidden."""
    book = workspace.book
    per_sheet: dict[str, dict[str, int]] = {}
    for cell in book.cells.values():
        entry = per_sheet.setdefault(cell.sheet, {"cells": 0, "formulas": 0})
        entry["cells"] += 1
        if cell.formula:
            entry["formulas"] += 1

    rows = []
    for name in book.sheets:
        entry = per_sheet.get(name, {"cells": 0, "formulas": 0})
        axis = workspace.axes.get(name)
        span = ""
        if axis is not None and axis.labels:
            span = f"{axis.labels[0]}–{axis.labels[-1]}"
            if axis.per_year > 1:
                span += f", {axis.per_year} columns per year"
        rows.append(
            {
                "ref": name,
                "what": span or "no period axis recognised",
                "value": f"{entry['formulas']} formulas",
            }
        )

    return ToolResult(
        ok=True,
        summary=f"{len(book.sheets)} sheets mapped",
        data={
            "rows": rows[:MAX_ROWS],
            "sheet_count": len(book.sheets),
            "iterative_calculation": book.iterative,
            "hidden_sheets": list(book.hidden_sheets),
            "very_hidden_sheets": list(book.very_hidden_sheets),
            "cells": len(book.cells),
        },
    )


def versions(workspace: ModelWorkspace) -> ToolResult:
    """What changed since the version before, from stored cells."""
    rows = [
        {
            "ref": f"v{one['version']}",
            "what": one.get("by") or "uploaded",
            "value": one.get("when", ""),
        }
        for one in workspace.versions[:MAX_ROWS]
    ]
    diff = workspace.diff
    if diff is None:
        return ToolResult(
            ok=True,
            summary=f"{len(workspace.versions)} versions, nothing to compare",
            data={
                "rows": rows,
                "note": "This is the first version — there is nothing "
                "earlier in Ances to compare against.",
            },
        )
    changed = diff.get("changed", [])
    by_sheet: dict[str, int] = {}
    for one in changed:
        sheet = str(one.get("ref", "")).split("!", 1)[0]
        by_sheet[sheet] = by_sheet.get(sheet, 0) + 1
    sample = [
        {
            "ref": str(one.get("ref", "")),
            "what": f"{one.get('was', '')} → {one.get('now', '')}",
            "value": "",
        }
        for one in changed[:MAX_ROWS]
    ]
    return ToolResult(
        ok=True,
        summary=(
            f"v{diff.get('from_version')} → v{diff.get('to_version')}: "
            f"{len(changed)} cells changed"
        ),
        data={
            "rows": sample or rows,
            "changed": len(changed),
            "added": diff.get("added", 0),
            "removed": diff.get("removed", 0),
            "by_sheet": dict(sorted(by_sheet.items(), key=lambda kv: -kv[1])),
            "from_version": diff.get("from_version"),
            "to_version": diff.get("to_version"),
        },
    )


DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "locate",
        "description": (
            "Find cells by the model's own labels — use this first when "
            "the question names a line in words rather than a cell."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "trace_back",
        "description": (
            "Where a number comes from: the precedent graph read upward "
            "from one cell, ending at typed inputs and unreachable "
            "references. Takes a ref like Debt!F44 or a label."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"ref": {"type": "string"}},
            "required": ["ref"],
        },
    },
    {
        "name": "trace_forward",
        "description": (
            "What moves if this cell changes: everything that reads it, "
            "how far it reaches, and the named rows it flows into. Reach, "
            "not recalculation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"ref": {"type": "string"}},
            "required": ["ref"],
        },
    },
    {
        "name": "inventory",
        "description": (
            "List typed inputs, hardcodes buried in formulas, or external "
            "links — optionally on one sheet. kind: typed | hardcodes | "
            "external-links."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string"},
                "sheet": {"type": "string"},
            },
            "required": ["kind"],
        },
    },
    {
        "name": "structure",
        "description": (
            "How the model is laid out: every sheet in the workbook's own "
            "order, each sheet's time axis, what is hidden, whether "
            "iterative calculation is declared."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "versions",
        "description": (
            "The model's versions, and what changed between the latest "
            "and the one before — counted from stored cells."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]


def run_tool(
    workspace: ModelWorkspace, name: str, arguments: dict[str, Any]
) -> ToolResult:
    if name == "locate":
        return locate(workspace, str(arguments.get("query", "")))
    if name == "trace_back":
        return trace_back(workspace, str(arguments.get("ref", "")))
    if name == "trace_forward":
        return trace_forward(workspace, str(arguments.get("ref", "")))
    if name == "inventory":
        sheet = arguments.get("sheet")
        return inventory(
            workspace,
            str(arguments.get("kind", "")),
            str(sheet) if sheet else None,
        )
    if name == "structure":
        return structure(workspace)
    if name == "versions":
        return versions(workspace)
    return _refuse(f"No tool called {name}")


MODEL_TOOLSET = Toolset(
    name="model-assistant",
    definitions=DEFINITIONS,
    run=run_tool,
    prompt_path=Path(__file__).parent / "prompt_model.md",
)


def build_workspace(
    *,
    dossier_id: UUID,
    name: str,
    filename: str,
    version: int,
    book: Workbook,
    axes: dict[str, Any],
    versions_list: list[dict[str, Any]],
    diff: dict[str, Any] | None,
) -> ModelWorkspace:
    """The workspace, with the dependents index built once up front."""
    return ModelWorkspace(
        dossier_id=dossier_id,
        name=name,
        filename=filename,
        version=version,
        book=book,
        axes=axes,
        dependents=dependents_index(book),
        versions=versions_list,
        diff=diff,
    )


__all__ = [
    "DEFINITIONS",
    "MODEL_TOOLSET",
    "ModelWorkspace",
    "build_workspace",
    "run_tool",
]
