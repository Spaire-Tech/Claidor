"""A model states its periods in its arithmetic, not in its labels.

Twelve monthly columns summed into one annual column is a monthly
row, and it says so without a single word. Every earlier attempt at
`period` in this lane read words — row labels, column headers, units
text — and none was ever armable; the last round showed the reader
can hand a labeller the wrong header row entirely.

**And the same machinery is the flagship check.** « A monthly figure
in an annual line » is a *broken aggregation*: an annual cell that
takes one month where it should take twelve. Inferring the period
and detecting the defect are one computation.

Nothing here reads a header word. Blocks are found by counting
columns and spanning dates; the relationship between two blocks is
read from how many cells of one a formula in the other consumes.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

#: Months, quarters and halves per year — the ratios a correct
#: aggregation may take.
RATIOS: dict[tuple[str, str], int] = {
    ("monthly", "annual"): 12,
    ("monthly", "quarterly"): 3,
    ("monthly", "half-yearly"): 6,
    ("quarterly", "annual"): 4,
    ("half-yearly", "annual"): 2,
    ("quarterly", "half-yearly"): 2,
}

#: How coarse each granularity is, for « is this block coarser? ».
COARSENESS = {
    "monthly": 1,
    "quarterly": 3,
    "half-yearly": 6,
    "annual": 12,
}


@dataclass(frozen=True)
class Block:
    """A run of columns on one sheet sharing a granularity."""

    sheet: str
    columns: tuple[int, ...]
    granularity: str
    why: str


@dataclass(frozen=True)
class Aggregation:
    """One formula cell, and how many cells of a finer block it takes."""

    ref: str
    sheet: str
    row: int
    from_granularity: str
    to_granularity: str
    cells_taken: int
    cells_expected: int

    @property
    def is_broken(self) -> bool:
        return self.cells_taken < self.cells_expected


def granularity_of(count: int, years: float | None) -> tuple[str, str] | None:
    """A block's granularity from its column count and the years it spans.

    No header word is read. 120 columns over ten years is monthly by
    arithmetic; 40 columns over 40 years is annual.
    """
    if not count or not years or years <= 0:
        return None
    per_year = count / years
    for name, expected in (
        ("monthly", 12),
        ("quarterly", 4),
        ("half-yearly", 2),
        ("annual", 1),
    ):
        if abs(per_year - expected) <= expected * 0.25:
            return name, (
                f"{count} columns spanning {years:g} years is {per_year:.1f} "
                f"per year — {name}"
            )
    return None


def blocks_from_dates(
    dates_by_column: Mapping[str, Mapping[int, float]],
) -> list[Block]:
    """One block per sheet, from a row of date serials across its columns.

    `dates_by_column` is `{sheet: {column: excel date serial}}` — the
    axis a model writes above its numbers. The span in years and the
    count of columns give the granularity between them.
    """
    found: list[Block] = []
    for sheet, dates in dates_by_column.items():
        if len(dates) < 4:
            continue
        ordered = [dates[c] for c in sorted(dates)]
        years = (max(ordered) - min(ordered)) / 365.25
        decided = granularity_of(len(ordered), years)
        if decided is None:
            continue
        name, why = decided
        found.append(
            Block(
                sheet=sheet,
                columns=tuple(sorted(dates)),
                granularity=name,
                why=why,
            )
        )
    return found


def aggregations(
    cells: Mapping[str, Any], blocks: Sequence[Block]
) -> list[Aggregation]:
    """Every formula that takes cells of a finer block into a coarser one.

    A cell in an annual block taking twelve cells of a monthly block
    is a correct aggregation. Taking fewer is the defect this exists
    to find — and taking *more* is not flagged here, because a
    rolling or cumulative line legitimately takes many.
    """
    by_sheet = {block.sheet: block for block in blocks}
    found: list[Aggregation] = []
    for ref, cell in cells.items():
        if getattr(cell, "formula", None) is None:
            continue
        target = by_sheet.get(cell.sheet)
        if target is None or cell.column not in target.columns:
            continue
        taken: dict[str, int] = {}
        for precedent in getattr(cell, "precedents", ()) or ():
            source = cells.get(precedent)
            if source is None:
                continue
            block = by_sheet.get(source.sheet)
            if block is None or source.column not in block.columns:
                continue
            if COARSENESS[block.granularity] >= COARSENESS[target.granularity]:
                continue
            taken[block.granularity] = taken.get(block.granularity, 0) + 1
        for granularity, count in taken.items():
            expected = RATIOS.get((granularity, target.granularity))
            if expected is None:
                continue
            found.append(
                Aggregation(
                    ref=ref,
                    sheet=cell.sheet,
                    row=cell.row,
                    from_granularity=granularity,
                    to_granularity=target.granularity,
                    cells_taken=count,
                    cells_expected=expected,
                )
            )
    return found


# --- aggregation read from values, where there are no formulas ------

#: Same tolerance as everywhere in this lane.
RELATIVE = 1e-9
FLOOR = 1e-12

#: How many coarse periods must agree before a pair counts. Six is
#: the registered bar: fewer invites coincidence, and a model that
#: aggregates a row for only five of forty years is not aggregating
#: it.
MIN_PERIODS = 6


@dataclass(frozen=True)
class ValueAggregation:
    """A row that adds up, period by period, with its exceptions."""

    label: str
    fine_sheet: str
    fine_row: int
    coarse_sheet: str
    coarse_row: int
    ratio: int
    matched: tuple[int, ...]
    #: Coarse columns where the sum does not match **and** the value
    #: equals a single fine cell — the flagship defect.
    single_period: tuple[int, ...]
    #: Coarse columns that match nothing recognisable.
    unexplained: tuple[int, ...]


def _close(a: float, b: float) -> bool:
    return abs(a - b) <= max(FLOOR, RELATIVE * max(abs(a), abs(b)))


def aggregate_by_value(
    fine: Sequence[float],
    coarse: Sequence[float],
    ratio: int,
) -> tuple[list[int], list[int], list[int]]:
    """(matched, single-period, unexplained) coarse positions.

    `fine` is the finer series in order; `coarse` the coarser one.
    Position *i* of `coarse` is compared with the `ratio` fine values
    that belong to it.
    """
    matched: list[int] = []
    single: list[int] = []
    unexplained: list[int] = []
    for index, value in enumerate(coarse):
        window = fine[index * ratio : (index + 1) * ratio]
        if len(window) < ratio:
            break
        if _close(value, sum(window)):
            matched.append(index)
        elif any(_close(value, one) for one in window):
            single.append(index)
        else:
            unexplained.append(index)
    return matched, single, unexplained
