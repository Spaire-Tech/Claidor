"""C2's planted-edit harness — the planter discipline applied to diff.

Registered in `docs/pierce/logs/prism.md` (« C2 registration,
part 2 ») before any recovery number was looked at. The paper behind
the alignment claims zero error; that is its authors' number, not
ours, until this harness reproduces something like it on our corpus.

One instance = one known edit planted into a real corpus sheet with
Excel's own semantics (references shift on insert and delete — an
edit planted without that would test a file no version of Excel
ever saves), then the aligner runs old-vs-planted and is judged
against ground truth it never sees:

  · structural report exactly the planted change and nothing else;
  · row/column mapping correct for every surviving line;
  · exact recovery = both at once.

Edit classes: insert_blank_row, insert_copied_row, delete_row,
insert_copied_column, delete_column, retype_literals (no structural
change may be reported), rewrite_formula (same), and
insert_row_and_retype (the combination). Positions are the quartile
row/column indices of the sheet's populated lines — deterministic,
no cherry-picking.

Stated approximations, from the registration: only references
written on the edited sheet (unqualified or self-qualified) are
shifted — the judged sheet is the edited one, so references from
other sheets into it are left as text; whole-row ranges (`5:10`)
are not shifted; on delete, a range endpoint equal to the deleted
line keeps its index (Excel's common-case behaviour) and a single
reference to it becomes #REF!.

    uv run python -m scripts.watch_plant BASE.xlsx SHEET OUT.json
"""

import json
import re
import sys
import tempfile
import time
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import openpyxl
from openpyxl.worksheet.worksheet import Worksheet

from polar.tieout.audit import _shape_of
from polar.tieout.watch import (
    SheetGrid,
    align_sheet,
    sheet_grids,
    structural_changes,
)
from polar.tieout.workbook import read_workbook, tokens_of
from scripts.watch_handcheck import _column_letters, _column_number, translate

_REF = re.compile(
    r"(?P<sheet>(?:'[^']+'|[A-Za-z0-9_.]+)!)?"
    r"(?P<colanchor>\$?)(?P<col>[A-Z]{1,3})(?P<rowanchor>\$?)(?P<row>[0-9]{1,7})"
    r"(?![0-9A-Z_(])"
)


def _walk(formula: str) -> Iterator[tuple[str, str]]:
    """Yield (kind, text) pieces: strings and quoted names pass through
    as « skip »; everything else is « code » for the rewriter."""
    position, length = 0, len(formula)
    while position < length:
        char = formula[position]
        if char == '"':
            end = position + 1
            while end < length:
                if formula[end] == '"':
                    if end + 1 < length and formula[end + 1] == '"':
                        end += 2
                        continue
                    break
                end += 1
            yield "skip", formula[position : end + 1]
            position = end + 1
        else:
            end = formula.find('"', position)
            end = length if end == -1 else end
            yield "code", formula[position:end]
            position = end


def _shift_refs(formula: str, sheet: str, *, axis: str, at: int, delta: int) -> str:
    """Excel's reference update for an insert (delta=+1) or delete
    (delta=-1) at line `at`, applied to one formula on `sheet`."""

    def move(index: int, *, endpoint: bool) -> int | None:
        if delta > 0:
            return index + delta if index >= at else index
        if index > at:
            return index - 1
        if index == at:
            return at if endpoint else None  # None: #REF!
        return index

    def rewrite(code: str) -> str:
        out = []
        position = 0
        matches = list(_REF.finditer(code))
        for k, match in enumerate(matches):
            out.append(code[position : match.start()])
            position = match.end()
            qualifier = match.group("sheet") or ""
            own = qualifier == "" or qualifier.strip("!").strip("'") == sheet
            #: A colon on either side makes this ref a range endpoint.
            before = code[: match.start()].rstrip()
            after = code[match.end() :].lstrip()
            endpoint = before.endswith(":") or after.startswith(":")
            if not own:
                out.append(match.group(0))
                continue
            row = int(match.group("row"))
            column = _column_number(match.group("col"))
            index = row if axis == "row" else column
            moved = move(index, endpoint=endpoint)
            if moved is None:
                out.append("#REF!")
                continue
            if axis == "row":
                row = moved
            else:
                column = moved
            out.append(
                f"{qualifier}{match.group('colanchor')}{_column_letters(column)}"
                f"{match.group('rowanchor')}{row}"
            )
        out.append(code[position:])
        return "".join(out)

    return "".join(
        piece if kind == "skip" else rewrite(piece) for kind, piece in _walk(formula)
    )


def _formula_of(value: object) -> str | None:
    if isinstance(value, str) and value.startswith("="):
        return value
    return None


def _rewrite_sheet(
    sheet: Worksheet, worksheet_name: str, *, axis: str, at: int, delta: int
) -> None:
    for row in sheet.iter_rows():
        for cell in row:
            formula = _formula_of(cell.value)
            if formula:
                cell.value = "=" + _shift_refs(
                    formula[1:], worksheet_name, axis=axis, at=at, delta=delta
                )


@dataclass
class Planted:
    """Ground truth for one instance."""

    kind: str
    axis: str  # "rows" | "columns" | "none"
    at: int
    delta: int  # +1 insert, -1 delete, 0 none


def _plant(
    base: Path, sheet_name: str, kind: str, at_row: int, at_column: int, out: Path
) -> Planted:
    book = openpyxl.load_workbook(base)
    sheet = book[sheet_name]

    if kind == "insert_blank_row":
        sheet.insert_rows(at_row)
        _rewrite_sheet(sheet, sheet_name, axis="row", at=at_row, delta=1)
        planted = Planted(kind, "rows", at_row, 1)
    elif kind in ("insert_copied_row", "insert_row_and_retype"):
        copied = [
            (cell.column, cell.value)
            for cell in sheet[at_row]
            if cell.value is not None
        ]
        sheet.insert_rows(at_row)
        _rewrite_sheet(sheet, sheet_name, axis="row", at=at_row, delta=1)
        for column, value in copied:
            formula = _formula_of(value)
            #: A copy pasted one row up keeps its relative shape —
            #: Excel copy semantics, i.e. the shared-formula translate.
            sheet.cell(row=at_row, column=column).value = (
                "=" + translate(formula[1:], -1, 0) if formula else value
            )
        planted = Planted(kind, "rows", at_row, 1)
    elif kind == "delete_row":
        sheet.delete_rows(at_row)
        _rewrite_sheet(sheet, sheet_name, axis="row", at=at_row, delta=-1)
        planted = Planted(kind, "rows", at_row, -1)
    elif kind == "insert_copied_column":
        copied = [
            (cell.row, cell.value)
            for row in sheet.iter_rows(min_col=at_column, max_col=at_column)
            for cell in row
            if cell.value is not None
        ]
        sheet.insert_cols(at_column)
        _rewrite_sheet(sheet, sheet_name, axis="column", at=at_column, delta=1)
        for row_index, value in copied:
            formula = _formula_of(value)
            sheet.cell(row=row_index, column=at_column).value = (
                "=" + translate(formula[1:], 0, -1) if formula else value
            )
        planted = Planted(kind, "columns", at_column, 1)
    elif kind == "delete_column":
        sheet.delete_cols(at_column)
        _rewrite_sheet(sheet, sheet_name, axis="column", at=at_column, delta=-1)
        planted = Planted(kind, "columns", at_column, -1)
    elif kind in ("retype_literals", "rewrite_formula"):
        planted = Planted(kind, "none", 0, 0)
    else:
        raise ValueError(kind)

    if kind in ("retype_literals", "insert_row_and_retype"):
        retyped = 0
        for row in sheet.iter_rows():
            for cell in row:
                if retyped >= 5:
                    break
                if isinstance(cell.value, (int, float)) and not isinstance(
                    cell.value, bool
                ):
                    cell.value = cell.value + 7
                    retyped += 1
    if kind == "rewrite_formula":
        done = False
        for row in sheet.iter_rows():
            for cell in row:
                formula = _formula_of(cell.value)
                if formula and not done:
                    #: A genuine structural rewrite: wrap in an extra
                    #: SUM so the shape changes under every
                    #: normalization.
                    cell.value = "=SUM(" + formula[1:] + ",0)"
                    done = True

    book.save(out)
    return planted


def _truth_variants(
    indices: list[int], planted: Planted, axis: str
) -> list[tuple[dict[int, int], list[dict[str, object]]]]:
    """(expected mapping, expected structural report) — usually one
    variant, two for a *copied* insert, where the copy and the
    original are indistinguishable by construction and matching the
    old line to either position is equally right."""
    if planted.axis != axis or planted.delta == 0:
        return [({index: index for index in indices}, [])]
    at = planted.at
    if planted.delta > 0:
        shifted = {index: index + 1 if index >= at else index for index in indices}
        blank = planted.kind == "insert_blank_row"
        block: list[dict[str, object]] = (
            []
            if blank
            else [{"kind": f"inserted_{planted.axis}", "first": at, "last": at}]
        )
        variants = [(shifted, block)]
        if not blank and at in indices:
            keep = dict(shifted)
            keep[at] = at
            variants.append(
                (
                    keep,
                    [
                        {
                            "kind": f"inserted_{planted.axis}",
                            "first": at + 1,
                            "last": at + 1,
                        }
                    ],
                )
            )
        return variants
    mapping = {
        index: index - 1 if index > at else index for index in indices if index != at
    }
    block = (
        [{"kind": f"deleted_{planted.axis}", "first": at, "last": at}]
        if at in indices
        else []
    )
    return [(mapping, block)]


def _judge(
    base_grid: SheetGrid, planted_grid: SheetGrid, planted: Planted
) -> dict[str, object]:
    alignment = align_sheet(base_grid, planted_grid)
    structure = [
        change
        for change in structural_changes(alignment)
        if not str(change["kind"]).startswith("changed")
    ]

    best: dict[str, object] | None = None
    row_variants = _truth_variants(
        [line.index for line in base_grid.rows], planted, "rows"
    )
    column_variants = _truth_variants(
        [line.index for line in base_grid.columns], planted, "columns"
    )
    for row_truth, row_block in row_variants:
        for column_truth, column_block in column_variants:
            expected = row_block + column_block
            row_mapping = alignment.rows.mapping
            column_mapping = alignment.columns.mapping
            row_right = sum(
                1 for old, new in row_truth.items() if row_mapping.get(old) == new
            )
            column_right = sum(
                1 for old, new in column_truth.items() if column_mapping.get(old) == new
            )
            row_score = row_right / len(row_truth) if row_truth else 1.0
            column_score = column_right / len(column_truth) if column_truth else 1.0
            structure_right = structure == expected
            verdict: dict[str, object] = {
                "kind": planted.kind,
                "at": planted.at,
                "structure_right": structure_right,
                "structure": structure[:6],
                "expected": expected,
                "row_mapping": round(row_score, 4),
                "column_mapping": round(column_score, 4),
                "exact": structure_right and row_score == 1.0 and column_score == 1.0,
            }
            if best is None or (
                (verdict["exact"], structure_right, row_score + column_score)
                > (best["exact"], best["structure_right"], best["_score"])
            ):
                verdict["_score"] = row_score + column_score
                best = verdict
    assert best is not None
    best.pop("_score", None)
    return best


CLASSES = [
    "insert_blank_row",
    "insert_copied_row",
    "delete_row",
    "insert_copied_column",
    "delete_column",
    "retype_literals",
    "rewrite_formula",
    "insert_row_and_retype",
]


def main() -> int:
    base_path, sheet_name, out_path = sys.argv[1:4]
    base_book = read_workbook(base_path)
    base_grid = sheet_grids(base_book)[sheet_name]
    _shape_of.cache_clear()
    tokens_of.cache_clear()

    row_indices = [line.index for line in base_grid.rows]
    column_indices = [line.index for line in base_grid.columns]

    def quartiles(seq: list[int]) -> list[int]:
        return sorted({seq[len(seq) // 4], seq[len(seq) // 2], seq[3 * len(seq) // 4]})

    results: list[dict[str, object]] = []
    started = time.monotonic()
    with tempfile.TemporaryDirectory() as scratch:
        for kind in CLASSES:
            positions = (
                quartiles(column_indices)
                if "column" in kind
                else quartiles(row_indices)
            )
            for position in positions:
                at_row = position if "column" not in kind else row_indices[0]
                at_column = position if "column" in kind else column_indices[0]
                target = Path(scratch) / f"{kind}_{position}.xlsx"
                planted = _plant(
                    Path(base_path), sheet_name, kind, at_row, at_column, target
                )
                planted_book = read_workbook(str(target))
                planted_grid = sheet_grids(planted_book)[sheet_name]
                verdict = _judge(base_grid, planted_grid, planted)
                verdict["position"] = position
                results.append(verdict)
                _shape_of.cache_clear()
                tokens_of.cache_clear()
                print(
                    f"[{'ok' if verdict['exact'] else 'MISS'}] "
                    f"{kind} @ {position}  rows={verdict['row_mapping']} "
                    f"columns={verdict['column_mapping']} "
                    f"structure={'right' if verdict['structure_right'] else 'wrong'}"
                )

    by_class: dict[str, dict[str, float]] = {}
    for verdict in results:
        bucket = by_class.setdefault(str(verdict["kind"]), {"instances": 0, "exact": 0})
        bucket["instances"] += 1
        bucket["exact"] += 1 if verdict["exact"] else 0

    payload = {
        "base": base_path,
        "sheet": sheet_name,
        "rows": len(row_indices),
        "columns": len(column_indices),
        "seconds": round(time.monotonic() - started, 1),
        "by_class": by_class,
        "exact_total": sum(1 for v in results if v["exact"]),
        "instances_total": len(results),
        "instances": results,
    }
    Path(out_path).write_text(json.dumps(payload, indent=1))
    print(json.dumps({k: v for k, v in payload.items() if k != "instances"}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
