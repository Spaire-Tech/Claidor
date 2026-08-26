"""C4's cheap proof — verifying-trace fingerprints.

Build Systems à la Carte reads Excel as a build system; a verifying
trace is its receipt: the shape of the computation, the value it
last produced, and the values it consumed. Two versions matched by
C2's alignment: equal traces prove the cell's value did not change
between them, at hash cost, with no evaluation — shrinking the
suspect set the equivalence tiers work on, and keeping the solver
the crown rather than the foundation.

Soundness needs no volatile-function denylist and no perfect
precedent resolution, because the cell's own cached value is inside
the trace: whatever changed the output breaks the match — **when
the output is observable.** Round 1's gate caught the case where it
is not: a formula whose cached result is text reads `value=None`
in the numeric universe, so such cells are never proved (round 2,
registered). What a match does **not** claim: that the stored value
is *correct* — a value stale the same way on both sides matches;
single-version staleness is tier 2's territory. The registration,
the rounds and the one-violation-fails soundness gate live in
`docs/pierce/logs/prism.md` (« C4 registration, round 1 »).
"""

from dataclasses import dataclass, field
from hashlib import sha256

from polar.tieout.audit import _shape
from polar.tieout.workbook import Cell, Workbook

from .align import align_sheet
from .signature import LITERAL, _absolute, sheet_grids

#: The mark of an input the reader did not name — a blank, or a cell
#: outside the numeric universe. Present in the trace so « I could
#: not see this input » is part of the receipt, never elided.
UNSEEN = "∅"


def _cell_shape(cell: Cell) -> str:
    if cell.formula is None:
        return LITERAL
    shape = _shape(cell)
    if not shape:
        return cell.formula
    return _absolute(shape, cell.sheet, cell.row, cell.column)


def fingerprint(cell: Cell, book: Workbook) -> str:
    """One cell's verifying trace, as a SHA-256 hex digest."""
    parts = [_cell_shape(cell), "\x1f", repr(cell.value), "\x1f"]
    for ref in cell.precedents:
        input_cell = book.cells.get(ref)
        parts.append(UNSEEN if input_cell is None else repr(input_cell.value))
        parts.append("\x1e")
    for what, why in cell.unresolved:
        parts.append(f"{what}\x1d{why}\x1e")
    return sha256("".join(parts).encode()).hexdigest()


def fingerprints(book: Workbook) -> dict[str, str]:
    """Every cell's trace — the store a version carries from ingestion."""
    return {ref: fingerprint(cell, book) for ref, cell in book.cells.items()}


@dataclass
class Proof:
    """What the fingerprints prove about a version pair, per the
    registration: `proved` cells could not have changed; everything
    else in the new version is the suspect set the tiers inherit."""

    #: New-version refs proved unchanged, mapped from their old ref.
    proved: dict[str, str] = field(default_factory=dict)
    #: Every new-version ref not proved.
    suspects: set[str] = field(default_factory=set)
    #: sheet -> (proved, total new cells on sheet).
    per_sheet: dict[str, tuple[int, int]] = field(default_factory=dict)

    @property
    def proved_fraction(self) -> float:
        total = len(self.proved) + len(self.suspects)
        return len(self.proved) / total if total else 0.0


def proved_unchanged(old_book: Workbook, new_book: Workbook) -> Proof:
    """The cheap proof over a whole pair: aligned, matched, hashed.

    A new-version cell is proved exactly when the alignment matches
    its position to an old cell and the two traces are equal. A cell
    on an added sheet, an inserted line, or an unmatched position is
    a suspect by definition — the proof never guesses.
    """
    old_grids = sheet_grids(old_book)
    new_grids = sheet_grids(new_book)
    old_traces = fingerprints(old_book)
    new_traces = fingerprints(new_book)

    old_by_position = {
        (cell.sheet, cell.row, cell.column): ref for ref, cell in old_book.cells.items()
    }

    proof = Proof(suspects=set(new_book.cells.keys()))
    counts: dict[str, list[int]] = {}
    for ref, cell in new_book.cells.items():
        counts.setdefault(cell.sheet, [0, 0])[1] += 1

    def observable(cell: Cell) -> bool:
        """Round 2 (registered in the lane log): a formula cell whose
        own cached value the reader could not observe — a text result
        is `None` in the numeric universe — can carry no verifying
        trace. Its output is not inside the hash, so nothing proves
        it did not move; suspects by refusal."""
        return cell.formula is None or cell.value is not None

    for sheet, new_grid in new_grids.items():
        if sheet not in old_grids:
            continue
        alignment = align_sheet(old_grids[sheet], new_grid)
        row_map = {new: old for old, new in alignment.rows.mapping.items()}
        column_map = {new: old for old, new in alignment.columns.mapping.items()}
        for ref, cell in new_book.cells.items():
            if cell.sheet != sheet:
                continue
            old_row = row_map.get(cell.row)
            old_column = column_map.get(cell.column)
            if old_row is None or old_column is None:
                continue
            old_ref = old_by_position.get((sheet, old_row, old_column))
            if old_ref is None:
                continue
            if not observable(cell) or not observable(old_book.cells[old_ref]):
                continue
            if old_traces[old_ref] == new_traces[ref]:
                proof.proved[ref] = old_ref
                proof.suspects.discard(ref)
                counts[sheet][0] += 1

    proof.per_sheet = {
        sheet: (proved, total) for sheet, (proved, total) in counts.items()
    }
    return proof
