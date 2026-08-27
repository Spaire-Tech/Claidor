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
- **versions** — what changed since the version before, in the Watch's
  review language, never from memory.
- **sources** — where a typed number came from *outside* the model: the
  document and page a source read matched it to. The one question the
  graph alone cannot answer, because the answer is not in the file.

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
    #: Model ref -> the source document a read matched that typed input
    #: to. Built by the loader from links this deal already carries;
    #: empty when no source document has been read, which is a
    #: different answer from « nothing matched » and is said as one.
    sources: dict[str, dict[str, Any]] = field(default_factory=dict)
    #: Whether any source document has been read on this deal at all.
    sources_read: int = 0
    #: A zero-argument call returning the Watch's `DeltaReport` for this
    #: version against the one before, or None when there is no earlier
    #: version. **Deliberately not called by the loader**: it fetches
    #: two files and reads two workbooks, and a question about anything
    #: else must not pay for it. The `versions` tool calls it once and
    #: caches the answer in `_delta`.
    delta: Any = None
    _delta: Any = None
    _delta_done: bool = False
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


#: How the Watch's item kinds read in a sentence. The tool hands the
#: agent the kind *and* these words, so an answer never has to invent a
#: gloss for `methodology_change` and never gets it wrong.
#:
#: Three forms, because a row and a count want different sentences. The
#: row wants the whole gloss with its article (« a cell that changed
#: class — typed over a formula, or back »); a count wants it short and
#: article-free, in the reader's number (« 2 cells that changed class »).
#: « 1 a cell that changed class » was the giveaway when there was one
#: form doing both jobs.
DELTA_WORDS: dict[str, tuple[str, str, str]] = {
    "new_defect": (
        "a defect this revision introduced",
        "defect introduced",
        "defects introduced",
    ),
    "repaired_defect": (
        "a defect this revision fixed",
        "defect fixed",
        "defects fixed",
    ),
    "class_change": (
        "a cell that changed class — typed over a formula, or back",
        "cell that changed class",
        "cells that changed class",
    ),
    "relabelled_line": (
        "a line that was renamed",
        "line renamed",
        "lines renamed",
    ),
    "methodology_change": (
        "a formula rewritten to compute differently",
        "formula rewritten to compute differently",
        "formulas rewritten to compute differently",
    ),
    "moved_assumption": (
        "an assumption that was changed",
        "assumption changed",
        "assumptions changed",
    ),
    "material_output": (
        "an output that moved materially",
        "output moved materially",
        "outputs moved materially",
    ),
    "structure": (
        "rows or columns inserted, deleted or moved",
        "structural change",
        "structural changes",
    ),
    "emptied_cell": ("a cell that was emptied", "cell emptied", "cells emptied"),
    "filled_cell": (
        "a cell that was filled in",
        "cell filled in",
        "cells filled in",
    ),
    #: The study's three counts share the headline with the item kinds,
    #: under the keys `DeltaReport.summary` gives them.
    "new_defects": ("", "defect this revision introduced", "defects introduced"),
    "repaired_defects": ("", "defect this revision fixed", "defects fixed"),
    "persistent_defects": ("", "defect still open", "defects still open"),
}


def _said(kind: str) -> str:
    """The row's gloss — the whole sentence, with its article."""
    words = DELTA_WORDS.get(kind)
    return words[0] if words and words[0] else kind


def _counted(kind: str, count: int) -> str:
    """The gloss after a numeral — short, and in the right number."""
    words = DELTA_WORDS.get(kind)
    if words is None:
        return kind
    return words[1] if count == 1 else words[2]


def _item_ref(item: Any) -> str:
    """The item's place, as a reference a reviewer can select.

    One row and one column is a cell — « Model!F16 » — and saying so is
    the difference between a location and a coordinate pair.
    """
    if not item.first_row:
        return item.sheet
    rows = (
        str(item.first_row)
        if item.last_row <= item.first_row
        else f"{item.first_row}-{item.last_row}"
    )
    if len(item.columns) == 1 and item.last_row <= item.first_row:
        return f"{item.sheet}!{item.columns[0]}{item.first_row}"
    return f"{item.sheet}!{rows}"


def _delta_report(workspace: ModelWorkspace) -> Any:
    """The Watch's report, fetched once and only if asked."""
    if workspace._delta_done:
        return workspace._delta
    workspace._delta_done = True
    if workspace.delta is None:
        return None
    try:
        workspace._delta = workspace.delta()
    except Exception:
        #: A version whose bytes were dropped, or a reader that refused
        #: the file. The cell diff below is still a true answer, and
        #: losing the whole tool would be a worse one.
        workspace._delta = None
    return workspace._delta


def versions(workspace: ModelWorkspace) -> ToolResult:
    """What this revision did, in the Watch's review language.

    Two sources, and they answer different halves. The **Watch** reads
    both files and reports authoring decisions — what broke, what
    changed class, where the method moved, which assumptions moved,
    which outputs moved materially, the structure, then the repairs.
    The **stored-cell diff** knows something the Watch cannot: how many
    figures in this deal's own deliverables a changed cell has just
    made stale. So the report leads and the diff supplies the staleness.

    This tool used to hand back the raw cell moves alone — « B12 4.1 →
    3.8 » — which is a true answer to « what changed » in the sense
    that a diff is a true answer, and the wrong register for a reviewer
    asking what the revision *did*.
    """
    rows = [
        {
            "ref": f"v{one['version']}",
            "what": one.get("by") or "uploaded",
            "value": one.get("when", ""),
        }
        for one in workspace.versions[:MAX_ROWS]
    ]
    diff = workspace.diff
    report = _delta_report(workspace)
    if diff is None and report is None:
        return ToolResult(
            ok=True,
            summary=f"{len(workspace.versions)} versions, nothing to compare",
            data={
                "rows": rows,
                "note": "This is the first version — there is nothing "
                "earlier in Swens to compare against.",
            },
        )

    changed = list((diff or {}).get("changed", []))
    stale = {
        str(one.get("ref", "")): int(one.get("stale_figures", 0) or 0)
        for one in changed
    }
    stale_total = sum(stale.values())

    if report is None:
        #: The files are gone but the rows are not. Say which answer
        #: this is — a reviewer told « 40 cells changed » will not
        #: guess that the reviewed reading was unavailable.
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
                f"v{(diff or {}).get('from_version')} → "
                f"v{(diff or {}).get('to_version')}: {len(changed)} cells "
                f"changed (values only — the reviewed reading is not available)"
            ),
            data={
                "rows": sample or rows,
                "changed": len(changed),
                "added": (diff or {}).get("added", 0),
                "removed": (diff or {}).get("removed", 0),
                "stale_figures": stale_total,
                "by_sheet": dict(sorted(by_sheet.items(), key=lambda kv: -kv[1])),
                "from_version": (diff or {}).get("from_version"),
                "to_version": (diff or {}).get("to_version"),
                "note": "The two versions' files could not both be read, so "
                "this is the change in stored values only, not the reviewed "
                "reading of what the revision did.",
            },
        )

    #: The engine ranks its own items; the order received is the order
    #: reported, and nothing here re-ranks them.
    items = [
        {
            "ref": _item_ref(item),
            "what": f"{_said(item.kind)} — {item.detail}"
            if item.detail
            else _said(item.kind),
            "value": ", ".join(item.columns[:6]),
        }
        for item in report.items[:MAX_ROWS]
    ]
    counts = {kind: value for kind, value in report.summary.items() if value}
    headline = ", ".join(
        f"{value} {_counted(kind, value)}"
        for kind, value in report.summary.items()
        if value and kind in DELTA_WORDS
    )
    return ToolResult(
        ok=True,
        summary=(
            f"v{(diff or {}).get('from_version', '?')} → "
            f"v{(diff or {}).get('to_version', '?')}: "
            + (headline or "no reviewed change")
        ),
        data={
            "rows": items or rows,
            "counts": counts,
            "kinds": {
                kind: _counted(kind, counts[kind])
                for kind in counts
                if kind in DELTA_WORDS
            },
            "items_shown": len(items),
            "items_total": len(report.items),
            "new_defects": report.new_defects,
            "repaired_defects": report.repaired_defects,
            "persistent_defects": report.persistent_defects,
            "sheets_added": list(report.sheets_added),
            "sheets_removed": list(report.sheets_removed),
            "cells_changed": len(changed),
            #: The half the Watch cannot see: this deal's own deliverables.
            "stale_figures": stale_total,
            "from_version": (diff or {}).get("from_version"),
            "to_version": (diff or {}).get("to_version"),
        },
    )


#: Below this share of formulas a workbook is a values-pasted copy, not
#: a model — the same threshold the report and the document panel use.
FORMULA_SHARE_FLOOR = 0.01


def _values_only(workspace: ModelWorkspace) -> str:
    """The sentence a values-pasted copy needs, or nothing.

    A published copy with the formulas stripped answers every question
    here the same way — « typed input, nothing behind it » — and that
    reads as a devastating finding about the model when it is a fact
    about the *copy*. Ingest counted both numbers; saying them is the
    difference between an answer and a libel.
    """
    cells = int(workspace.counts.get("cells", 0) or 0)
    formulas = int(workspace.counts.get("formulas", 0) or 0)
    if cells <= 0 or formulas / cells >= FORMULA_SHARE_FLOOR:
        return ""
    return (
        f"This copy carries values only — {formulas:,} of {cells:,} cells "
        "hold a formula — so almost everything in it reads as typed. That "
        "is a fact about this copy, not about how the model was built. Ask "
        "for the working copy if where the numbers come from matters."
    )


def sources(workspace: ModelWorkspace, ref: str = "") -> ToolResult:
    """Where a number came from *outside* the model.

    Every other tool here reads the workbook. This one reads the only
    fact the workbook cannot hold: that a typed input was matched to a
    figure printed on page 42 of the audited accounts. Without it the
    honest answer to « where is this from » stops at « somebody typed
    it », which is where a reviewer's real question starts.

    Nothing is inferred, and the difference between « nobody read a
    source document » and « the reads found nothing for this cell » is
    reported, never flattened — a guess at provenance is the one claim
    a banker would repeat to a client without checking.

    Called with no ref it says what *is* grounded, which is how the
    assistant learns whether the question can be answered at all.
    """
    grounded = workspace.sources
    blind = _values_only(workspace)
    if not ref:
        if not grounded:
            return ToolResult(
                ok=True,
                summary="No number in this model is matched to a source document",
                data={
                    "rows": [],
                    "sources_read": workspace.sources_read,
                    "note": (
                        f"{workspace.sources_read} source documents have been "
                        "read on this deal, and none of their figures matched "
                        "a typed input in this model."
                        if workspace.sources_read
                        else "No source document has been read on this deal, "
                        "so nothing in this model can be traced past the cell "
                        "somebody typed it into."
                    ),
                    **({"values_only": blind} if blind else {}),
                },
            )
        rows = [
            {"ref": at, "what": one["label"], "value": one["printed"]}
            for at, one in list(grounded.items())[:MAX_ROWS]
        ]
        return ToolResult(
            ok=True,
            summary=f"{len(grounded)} typed inputs carry a source document",
            data={"rows": rows, "grounded": len(grounded), "shown": len(rows)},
        )

    found = _resolve(workspace, ref)
    if not found:
        return _refuse(f"« {ref} » is not in {workspace.filename}")
    start = found[0]

    here = grounded.get(start.ref)
    if here is not None:
        return ToolResult(
            ok=True,
            summary=f"{start.ref} came off {here['label']}",
            data={
                "rows": [
                    {
                        "ref": start.ref,
                        "what": here["label"],
                        "value": here["printed"],
                    }
                ],
                "document": here["document"],
                "location": here["location"],
                #: The sentence as printed on the page, not the label the
                #: matcher normalised it to.
                "context": here["context"],
                "state": here["state"],
                "note": here["note"],
            },
        )

    if start.formula is None:
        return ToolResult(
            ok=True,
            summary=f"{start.ref} is typed, and no source document backs it",
            data={
                "rows": [_row(start)],
                "sources_read": workspace.sources_read,
                "note": (
                    "This is a typed input. No figure in the source documents "
                    "read on this deal was matched to it, so where it came "
                    "from is not recorded anywhere in Swens — the person who "
                    "typed it is the only answer."
                    if workspace.sources_read
                    else "This is a typed input, and no source document has "
                    "been read on this deal, so nothing here can say where it "
                    "came from."
                ),
                **({"values_only": blind} if blind else {}),
            },
        )

    #: A calculated cell has no source of its own, but the typed inputs
    #: behind it may. Walking to them is the difference between
    #: declining the question and answering it.
    book = workspace.book
    backed: list[dict[str, str]] = []
    bare = 0
    seen = {start.ref}
    queue = deque([(start, 0)])
    while queue and len(backed) < MAX_ROWS:
        cell, depth = queue.popleft()
        if cell.formula is None:
            found_here = grounded.get(cell.ref)
            if found_here is not None:
                backed.append(
                    {
                        "ref": cell.ref,
                        "what": found_here["label"],
                        "value": found_here["printed"],
                    }
                )
            elif cell.ref != start.ref:
                bare += 1
            continue
        if depth >= 3:
            continue
        for parent_ref in cell.precedents[:4]:
            if parent_ref in seen:
                continue
            seen.add(parent_ref)
            parent = book.cells.get(parent_ref)
            if parent is not None:
                queue.append((parent, depth + 1))

    if backed:
        return ToolResult(
            ok=True,
            summary=(
                f"{start.ref} is calculated; {len(backed)} of the typed "
                f"inputs behind it "
                f"{'carries' if len(backed) == 1 else 'carry'} "
                "a source document"
            ),
            data={
                "rows": backed,
                "calculated": True,
                "formula": start.formula,
                "ungrounded_inputs": bare,
                "note": (
                    "This cell is calculated, so it has no source of its "
                    "own. These are the typed inputs it stands on that were "
                    "matched to a document"
                    + (
                        f"; {bare} more typed "
                        f"{'input' if bare == 1 else 'inputs'} behind it "
                        f"{'carries' if bare == 1 else 'carry'} none."
                        if bare
                        else "."
                    )
                ),
            },
        )
    return ToolResult(
        ok=True,
        summary=f"{start.ref} is calculated, and nothing behind it is sourced",
        data={
            "rows": [_row(start)],
            "calculated": True,
            "formula": start.formula,
            "ungrounded_inputs": bare,
            "sources_read": workspace.sources_read,
            "note": (
                f"This cell is calculated. Of the typed inputs behind it, "
                f"{bare} {'was' if bare == 1 else 'were'} reached and none "
                "was matched to a source document, so this figure cannot be "
                "traced past the model."
                if bare
                else "This cell is calculated, and the walk reached no typed "
                "input within three steps — trace_back will show where it goes."
            ),
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
            "The model's versions, and what the latest revision did to "
            "the one before it — in review language: what broke, what "
            "changed class, where the method moved, which assumptions "
            "moved, which outputs moved materially, then the repairs."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "sources",
        "description": (
            "Where a number came from outside the model: the document "
            "and page a source read matched a typed input to. Use this "
            "for « where is this from » — trace_back walks the model, "
            "this leaves it. Takes a ref or a label; called with "
            "neither, lists what is sourced at all."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"ref": {"type": "string"}},
        },
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
    if name == "sources":
        return sources(workspace, str(arguments.get("ref", "") or ""))
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
    sources_map: dict[str, dict[str, Any]] | None = None,
    sources_read: int = 0,
    delta: Any = None,
    counts: dict[str, Any] | None = None,
) -> ModelWorkspace:
    """The workspace, with the dependents index built once up front.

    `delta` is a *callable*, not a report: the Watch's reading costs two
    file reads and belongs to one question out of six.
    """
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
        sources=sources_map or {},
        sources_read=sources_read,
        delta=delta,
        counts=counts or {},
    )


__all__ = [
    "DEFINITIONS",
    "DELTA_WORDS",
    "MODEL_TOOLSET",
    "ModelWorkspace",
    "build_workspace",
    "run_tool",
    "sources",
    "versions",
]
