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


# --- flow or stock: the row decides, and then it is judged on that ---

#: The relative spread at or below which a series counts as frozen —
#: `recalc/mine.py`'s triviality rule, applied here for the reason it
#: was written there: a relation among constants is arithmetic, not a
#: fact about the model.
#:
#: **This is the correction that killed the previous design.** Its
#: coincidence control failed at 503 of 655 — 77% of deliberately
#: mismatched pairs still « aggregated » — because most rows are
#: mostly zeros and `0 = 0 + 0 + …` holds for forty periods. Any
#: sparse row paired with any other sparse row cleared the bar, so
#: the bar measured nothing.
FROZEN_SPREAD = 1e-12

#: What a row turned out to be. Three readings, not two: a **closing**
#: balance carries the last value of its window and an **opening**
#: balance carries the first, and calling both « stock by last » made
#: every b/f row look broken. Read from behaviour, never from the
#: words « b/f » — nothing in this module reads a header word.
FLOW = "flow"
CLOSING = "closing"
OPENING = "opening"


def varies(values: Sequence[float]) -> bool:
    """True when a series actually moves.

    Same rule as `recalc.mine.varying`, on a series rather than across
    runs: relative spread above `FROZEN_SPREAD`.
    """
    if not values:
        return False
    spread = max(values) - min(values)
    scale = max(abs(value) for value in values) or 1.0
    return spread / scale > FROZEN_SPREAD


@dataclass(frozen=True)
class RowPattern:
    """What a row does across periods, read from the row itself.

    A **flow** satisfies `coarse = sum(fine)` — revenue, opex, interest
    paid. A **closing** balance satisfies `coarse = last(fine)`, an
    **opening** balance `coarse = first(fine)`. The design before this
    demanded the flow reading of every row and duly reported retained
    earnings, MRA and cash at bank as broken. A closing balance is not
    the sum of twelve months, and a check that says so has told a
    banker it does not understand accounting.
    """

    kind: str
    #: Coarse positions obeying the row's own kind, counted only where
    #: the readings actually disagree — see `_discriminating`.
    kept: tuple[int, ...]
    #: Positions that break the kind **and** equal one fine cell in
    #: their window — the flagship defect, « took one month where it
    #: takes twelve ».
    single_period: tuple[int, ...]
    #: Positions that match neither the kind nor a single cell. Never a
    #: finding; reported as coverage, because « we looked and could not
    #: explain this one » is an honest thing to say and a false alarm
    #: is not.
    unexplained: tuple[int, ...]

    @property
    def broken(self) -> bool:
        return bool(self.single_period)


def _discriminating(window: Sequence[float]) -> bool:
    """True when this window can tell the three readings apart.

    A window of zeros satisfies `sum`, `first` and `last` at once, so
    it votes for every kind and decides nothing. **Counting such
    periods is what let « cash bank carried forward » — a balance by
    its own name — be classified as a flow**, on a margin made of
    periods that were all zero. Measured on Kelso: it produced 2 of
    the 10 false alarms directly and muddied the rest.
    """
    if not window:
        return False
    total = sum(window)
    return not (_close(total, window[0]) and _close(total, window[-1]))


def _readings(window: Sequence[float]) -> dict[str, float]:
    return {FLOW: sum(window), OPENING: window[0], CLOSING: window[-1]}


def classify_row(
    fine: Sequence[float],
    coarse: Sequence[float],
    ratio: int,
    *,
    min_periods: int = MIN_PERIODS,
) -> RowPattern | None:
    """What this row is, and where it departs from being that.

    `None` when the row does not decide: either series frozen, too few
    discriminating periods, or two readings tied. **A tie is no kind,
    and no kind is no finding** — a row that sums as often as it
    carries has not established a pattern to break.
    """
    if not varies(fine) or not varies(coarse):
        return None

    votes: dict[str, list[int]] = {FLOW: [], OPENING: [], CLOSING: []}
    windows: list[tuple[int, Sequence[float], float, bool]] = []
    for index, value in enumerate(coarse):
        window = fine[index * ratio : (index + 1) * ratio]
        if len(window) < ratio:
            break
        decides = _discriminating(window)
        windows.append((index, window, value, decides))
        if not decides:
            continue
        for kind, expected in _readings(window).items():
            if _close(value, expected):
                votes[kind].append(index)

    ranked = sorted(votes.items(), key=lambda item: -len(item[1]))
    (kind, kept), (_, second) = ranked[0], ranked[1]
    if len(kept) < min_periods or len(kept) == len(second):
        return None

    keeping = set(kept)
    single: list[int] = []
    unexplained: list[int] = []
    for index, window, value, decides in windows:
        if index in keeping:
            continue
        if not decides:
            #: The row's own kind is unreadable here and the period
            #: agrees with every reading. Silence, not a finding.
            continue
        if _matches_one_cell(value, window):
            single.append(index)
        else:
            unexplained.append(index)
    return RowPattern(
        kind=kind,
        kept=tuple(kept),
        single_period=tuple(single),
        unexplained=tuple(unexplained),
    )


def _matches_one_cell(value: float, window: Sequence[float]) -> bool:
    """« This period took one fine cell instead of the whole window. »

    **Zero does not count.** A coarse zero sitting beside a window that
    contains a zero matches « one cell » trivially, and on Kelso that
    manufactured 2 of the 10 false alarms outright — `spv admin costs`
    and `equity bridge facility`, both reported for taking « one
    month » when the month in question was 0.0 and so was the year.
    The claim this finding makes is that a real figure was carried
    where an aggregate belonged, so both ends must be real.
    """
    if _close(value, 0.0):
        return False
    return any(_close(value, one) and not _close(one, 0.0) for one in window)


# --- one authoring decision, one finding ----------------------------


@dataclass(frozen=True)
class PeriodFinding:
    """One broken aggregation, with every row that carries it.

    `swens.md`'s first non-negotiable principle: « A formula dragged
    across four hundred cells is one decision by one person, not four
    hundred problems. » The same holds down a reporting stack. Kelso
    prints its cash balance on two lines of one sheet — `cash bank` and
    `cash bank carried forward`, identical values, rows 83 and 200 —
    and round 1 reported the same break twice because they are
    different cells. They are one number, published twice.
    """

    label: str
    fine: str
    coarse: str
    ratio: int
    kind: str
    kept: int
    single_period: tuple[int, ...]
    #: The other places the same broken number appears, as
    #: `fine -> coarse` pairs. Evidence on one finding, never findings.
    also: tuple[str, ...] = ()


def _identity(
    coarse_values: Sequence[float], breaks: Sequence[int], ratio: int
) -> tuple[Any, ...]:
    """What makes two reports the same authoring decision.

    The *numbers*, not the cells: two rows holding the same series and
    breaking in the same periods are one decision however far apart
    they sit. Rounded to twelve significant figures so that a display
    copy of a number is recognised as the same number.
    """
    return (
        ratio,
        tuple(breaks),
        tuple(float(f"{value:.12g}") for value in coarse_values),
    )


def fold(
    found: Sequence[tuple[PeriodFinding, Sequence[float]]],
) -> list[PeriodFinding]:
    """Collapse reports of one decision into one finding.

    Takes `(finding, its coarse series)` pairs because the series is
    the identity and the finding does not carry it. The first report in
    each group is kept and the rest become its `also` list — so the
    evidence survives and the count is honest.
    """
    groups: dict[tuple[Any, ...], list[PeriodFinding]] = {}
    for finding, coarse_values in found:
        key = _identity(coarse_values, finding.single_period, finding.ratio)
        groups.setdefault(key, []).append(finding)
    folded: list[PeriodFinding] = []
    for members in groups.values():
        first = members[0]
        others = tuple(f"{one.fine} -> {one.coarse}" for one in members[1:])
        folded.append(
            PeriodFinding(
                label=first.label,
                fine=first.fine,
                coarse=first.coarse,
                ratio=first.ratio,
                kind=first.kind,
                kept=first.kept,
                single_period=first.single_period,
                also=others,
            )
        )
    return folded
