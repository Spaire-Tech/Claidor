"""Where a cell's value goes — the dependents walk.

The provenance chain answers « where does this number come from ». A
finding needs the other direction too: a typed value matters because of
what reads it. « Flows into “Opex total”, then “Cashflow”, then “Equity
IRR” » is the consequence said in the model's own words, and it is the
difference between a defect a banker triages and one they scroll past.

The walk is exact where it can be and silent where it cannot. Every
formula's precedents are already expanded to single cells by the reader,
so inverting them gives the true dependents of any cell — no regex over
formulas, no guessed ranges. What is *chosen* along the walk is editorial:
at each step the nearest dependent with a label of its own becomes the
next word in the sentence, because a chain of coordinates is exactly the
kind of evidence-as-claim this layer exists to end.
"""

from collections import deque

from .workbook import Workbook

#: How many cells one hop may explore before giving up on finding a
#: named dependent. A value that flows through more than this many
#: unnamed intermediates has a story too diffuse to tell in a sentence.
EXPLORED = 500

#: How many named stops the sentence carries. Three is the design's own
#: number — « Opex total → Cashflow → Equity IRR » — and a fourth adds
#: words without adding a decision.
HOPS = 3


def dependents_index(book: Workbook) -> dict[str, list[str]]:
    """`ref -> the cells whose formulas read it`. The precedents, inverted."""
    index: dict[str, list[str]] = {}
    for cell in book.cells.values():
        for fed in cell.precedents:
            index.setdefault(fed, []).append(cell.ref)
    return index


def flow(
    book: Workbook, index: dict[str, list[str]], ref: str, hops: int = HOPS
) -> list[str]:
    """Up to `hops` named places this cell's value reaches, nearest first.

    Each entry is a row label the model itself wrote — or, when a hop
    crosses to a sheet whose cells carry no labels, the sheet's own name.
    Empty when nothing downstream reads the cell, which is itself worth
    knowing: a typed-over value nothing reads is a different conversation.
    """
    cell = book.cells.get(ref)
    taken: list[str] = []
    used = {_plain(cell.row_label)} if cell is not None else set()
    used.discard("")
    here = ref
    seen: set[str] = {ref}
    for _ in range(hops):
        stop = _next_named(book, index, here, used, seen)
        if stop is None:
            break
        label, here = stop
        taken.append(label)
        used.add(_plain(label))
    return taken


def _next_named(
    book: Workbook,
    index: dict[str, list[str]],
    start: str,
    used: set[str],
    seen: set[str],
) -> tuple[str, str] | None:
    """The nearest dependent with a name of its own, breadth-first.

    A row usually flows along itself before it flows anywhere else —
    FY2033 feeds FY2034 — so labels already in the sentence (and the
    finding's own) are stepped through, not repeated.
    """
    queue = deque([start])
    explored = 0
    fallback: tuple[str, str] | None = None
    start_sheet = start.split("!", 1)[0]
    while queue and explored < EXPLORED:
        explored += 1
        for ref in index.get(queue.popleft(), ()):
            if ref in seen:
                continue
            seen.add(ref)
            cell = book.cells.get(ref)
            if cell is None:
                continue
            label = _plain(cell.row_label)
            if label and label not in used:
                return cell.row_label.strip(), ref
            #: No label of its own, but the walk just left the sheet —
            #: « Cashflow » the tab is a real place in the model's own
            #: vocabulary, kept as the answer of last resort.
            if (
                fallback is None
                and cell.sheet != start_sheet
                and _plain(cell.sheet) not in used
            ):
                fallback = (cell.sheet, ref)
            queue.append(ref)
    return fallback


def _plain(label: str) -> str:
    return " ".join(label.split()).lower()


__all__ = ["EXPLORED", "HOPS", "dependents_index", "flow"]
