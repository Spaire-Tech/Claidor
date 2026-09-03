"""The regularity check — one idea from ExceLint, over our own shapes.

Registered in `docs/pierce/regularity-check.md` before this file
existed. A formula is suspicious in proportion to how much it breaks
the rectangular regularity around it: a lone different cell inside a
tidy block of one shape is a strong signal, a different cell at the
edge of a ragged run a weak one. The engine already computes a shape
for every formula and already accuses a cell whose shape differs
from its row's family; this adds the size and tidiness of the region
it breaks, as a weight term. The registration also proposed one new
kind of finding — a formula island enclosed on four sides by a block
of one shape. Measured on 49 real models it never fired: an island
enclosed by a one-shape block always sits inside a row family the
row detector already accuses. The kind was not adopted; `islands`
stays as the input to the weight term.

No code is copied from ExceLint; the idea is theirs (Barowy, Berger,
Zorn — OOPSLA 2018) and is cited wherever the number is reported.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass

from .workbook import Cell, Workbook

#: A region must hold at least this many cells of one shape before it
#: can accuse an island. Registered.
REGION_MIN = 6
#: An island is at most this many cells of its own shape. Registered.
ISLAND_MAX = 2
#: The weight term: up to this much, in proportion to the region's
#: area against `REGION_FULL`. A break inside a 100-cell block earns
#: the whole bump; a 6-cell block earns a fifteenth of it.
REGULARITY_BUMP = 0.1
REGION_FULL = 100
#: Enclosure on all four sides by the same block was the proposed
#: kind's test (the first amendment said three; three admits an
#: island on a block's top or bottom row, which is an edge). The kind
#: was not adopted, so nothing reads this; it stays as the record of
#: what `Island.enclosed` was measured against.
ENCLOSED_SIDES = 4


@dataclass(frozen=True)
class Island:
    """One formula cell whose shape breaks the block around it."""

    ref: str
    sheet: str
    #: The one-shape region the island would join, by area.
    region_area: int
    #: A member of that region, as the example the finding shows.
    example: Cell
    #: How many of the island's four sides touch that region.
    enclosed: int
    #: The island's own shape, and the region's.
    own_shape: str
    region_shape: str


def _tile(
    cells: Mapping[tuple[int, int], tuple[str, Cell]],
) -> dict[tuple[int, int], int]:
    """A sheet's formula cells grouped into blocks: the connected
    components (four-neighbour) of cells sharing one shape. Returns
    cell → block id, ids assigned in row-major order of each block's
    first cell, so the result is deterministic.

    The registration's first draft said maximal rectangles; a row-major
    rectangle tiling fragments the block *around* an island into
    several rectangles, and an island in the middle of a tidy block
    then touched four different regions on one side each. A block is
    the component, which is what a reader means by « the block ».
    """
    region_of: dict[tuple[int, int], int] = {}
    next_id = 0
    for start in sorted(cells):
        if start in region_of:
            continue
        shape = cells[start][0]
        region_of[start] = next_id
        frontier = [start]
        while frontier:
            row, column = frontier.pop()
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nxt = (row + dr, column + dc)
                if nxt in cells and nxt not in region_of and cells[nxt][0] == shape:
                    region_of[nxt] = next_id
                    frontier.append(nxt)
        next_id += 1
    return region_of


def islands(book: Workbook, shape_of: Callable[[Cell], str]) -> list[Island]:
    """Every formula island that touches a region big enough to accuse it."""
    found: list[Island] = []
    by_sheet: dict[str, dict[tuple[int, int], tuple[str, Cell]]] = {}
    for cell in book.cells.values():
        if cell.formula is None:
            continue
        shape = shape_of(cell)
        if not shape:
            continue
        by_sheet.setdefault(cell.sheet, {})[(cell.row, cell.column)] = (shape, cell)

    for sheet, cells in by_sheet.items():
        region_of = _tile(cells)
        area: dict[int, int] = {}
        for region in region_of.values():
            area[region] = area.get(region, 0) + 1
        for (row, column), (shape, cell) in cells.items():
            own = region_of[(row, column)]
            if area[own] > ISLAND_MAX:
                continue
            touching: dict[int, int] = {}
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                neighbour = region_of.get((row + dr, column + dc))
                if neighbour is None or neighbour == own:
                    continue
                touching[neighbour] = touching.get(neighbour, 0) + 1
            if not touching:
                continue
            #: The region it would join: the largest touching one.
            best = max(touching, key=lambda r: (area[r], touching[r]))
            if area[best] < REGION_MIN:
                continue
            example = next(
                c
                for (r, k), (_s, c) in sorted(cells.items())
                if region_of[(r, k)] == best
            )
            found.append(
                Island(
                    ref=cell.ref,
                    sheet=sheet,
                    region_area=area[best],
                    example=example,
                    enclosed=touching[best],
                    own_shape=shape,
                    region_shape=cells[(example.row, example.column)][0],
                )
            )
    return found


def bump_for(island: Island) -> float:
    """The weight term for a break inside a region of this area."""
    return round(REGULARITY_BUMP * min(1.0, island.region_area / REGION_FULL), 3)
