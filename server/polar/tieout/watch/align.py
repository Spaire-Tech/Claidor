"""C2 — the dynamic-programming alignment (the RowColAlign shape).

SheetDiff's greedy hypothesis algorithm misaligns and can loop; the
amended plan replaced it with this: an order-preserving DP — the 2-D
extension of longest-common-subsequence — over row and column
signature lines, maximizing summed similarity. Rows and columns run
through the same code with roles swapped.

Similarity, threshold and weights are the registered constants
(`docs/pierce/logs/prism.md`, « C2 registration, part 1 »); they
move only through a written round. The pruning in `similarity` is
exact — it skips an LCS only when the registered formula could not
reach the threshold anyway, or when the answer is known without it —
so speed never changes a verdict.

Worst case is O(R²·C²) = O(n⁴) per sheet (every row pair an LCS over
columns); the measured cost on the biggest corpus file is in the
lane log, taken before anything depended on this module.
"""

from array import array
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

from .signature import Line, SheetGrid

#: A pair below this similarity never matches.
THRESHOLD = 0.5
#: With both labels present: half the verdict is the label, half the
#: shape sequence. A consequence worth knowing: two rows with
#: *different* labels can only match when their shape sequences are
#: identical (0.5·1 exactly meets the threshold).
LABEL_WEIGHT = 0.5


def lcs_length(a: Sequence[str], b: Sequence[str]) -> int:
    """Classic O(|a|·|b|) longest-common-subsequence length, two rows
    of memory."""
    if not a or not b:
        return 0
    previous = [0] * (len(b) + 1)
    for item in a:
        current = [0]
        for j, other in enumerate(b, start=1):
            if item == other:
                current.append(previous[j - 1] + 1)
            else:
                current.append(max(previous[j], current[-1]))
        previous = current
    return previous[-1]


def shape_similarity(a: tuple[str, ...], b: tuple[str, ...]) -> float:
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    return 2.0 * lcs_length(a, b) / (len(a) + len(b))


def similarity(x: Line, y: Line) -> float:
    """The registered formula, with exact pruning.

    Both labels present: sim = 0.5·label_eq + 0.5·shape_sim. Labels
    differing means sim ≥ THRESHOLD is only reachable at shape_sim
    = 1, i.e. identical sequences — checked without an LCS. Any
    label missing: sim = shape_sim, and a multiset-intersection
    bound (LCS can never exceed it) skips the LCS when the threshold
    is unreachable.
    """
    a, b = x.signatures, y.signatures
    if x.label and y.label:
        if x.label == y.label:
            return LABEL_WEIGHT + (1 - LABEL_WEIGHT) * shape_similarity(a, b)
        return LABEL_WEIGHT if a == b else 0.0
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    common = 0
    counts: dict[str, int] = {}
    for item in a:
        counts[item] = counts.get(item, 0) + 1
    for item in b:
        remaining = counts.get(item, 0)
        if remaining:
            counts[item] = remaining - 1
            common += 1
    bound = 2.0 * common / (len(a) + len(b))
    if bound < THRESHOLD:
        return 0.0
    return shape_similarity(a, b)


@dataclass(frozen=True)
class Match:
    old: int
    new: int
    similarity: float


@dataclass(frozen=True)
class LineAlignment:
    """Old and new indices are the real sheet row/column numbers."""

    matched: tuple[Match, ...]
    #: Old indices with no counterpart.
    deleted: tuple[int, ...]
    #: New indices with no counterpart.
    inserted: tuple[int, ...]

    @property
    def mapping(self) -> dict[int, int]:
        return {match.old: match.new for match in self.matched}


def _pair_similarity(
    x: Line,
    y: Line,
    x_counts: "Counter[str]",
    y_counts: "Counter[str]",
) -> float:
    """`similarity`, with the multiset bound served from per-line
    Counters built once per alignment (the timing round: rebuilding
    the counting dict per pair was 1.9 billion dict operations on a
    5k×5k alignment — a third of the wall time — while the answer
    only needs the counters' intersection). Same formula, same
    threshold semantics, same verdicts."""
    a, b = x.signatures, y.signatures
    if x.label and y.label:
        if x.label == y.label:
            return LABEL_WEIGHT + (1 - LABEL_WEIGHT) * shape_similarity(a, b)
        return LABEL_WEIGHT if a == b else 0.0
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    common = sum(min(count, y_counts[item]) for item, count in x_counts.items())
    bound = 2.0 * common / (len(a) + len(b))
    if bound < THRESHOLD:
        return 0.0
    return shape_similarity(a, b)


def align_lines(
    old: Sequence[Line], new: Sequence[Line], threshold: float = THRESHOLD
) -> LineAlignment:
    """Order-preserving DP: score(i,j) = max(skip old, skip new,
    diagonal + sim) with the diagonal allowed only at sim ≥ threshold;
    traceback prefers the diagonal, then skip-old.

    Memory (the registered aligner memory round): the recurrence only
    ever reads the previous score row, so scores live in two
    `array('d')` rows — the full matrix of Python object pointers was
    the term that OOM-killed V3 on the PR24 models, ~8 bytes per cell
    across R×N cells. The move matrix stays whole for the traceback,
    at exactly one byte per cell.
    """
    height, width = len(old), len(new)
    old_counts = [Counter(line.signatures) for line in old]
    new_counts = [Counter(line.signatures) for line in new]
    above = array("d", bytes(8 * (width + 1)))
    row_scores = array("d", bytes(8 * (width + 1)))
    moves = [bytearray(width + 1) for _ in range(height + 1)]  # 1 diag 2 up 3 left
    for i in range(1, height + 1):
        above, row_scores = row_scores, above
        row_scores[0] = 0.0
        row_moves = moves[i]
        line = old[i - 1]
        line_counts = old_counts[i - 1]
        for j in range(1, width + 1):
            best, move = above[j], 2
            left = row_scores[j - 1]
            if left > best:
                best, move = left, 3
            pair = _pair_similarity(line, new[j - 1], line_counts, new_counts[j - 1])
            if pair >= threshold:
                diagonal = above[j - 1] + pair
                if diagonal >= best:
                    best, move = diagonal, 1
            row_scores[j], row_moves[j] = best, move
    matched: list[Match] = []
    i, j = height, width
    while i > 0 and j > 0:
        move = moves[i][j]
        if move == 1:
            matched.append(
                Match(
                    old[i - 1].index,
                    new[j - 1].index,
                    similarity(old[i - 1], new[j - 1]),
                )
            )
            i, j = i - 1, j - 1
        elif move == 2:
            i -= 1
        else:
            j -= 1
    matched.reverse()
    kept_old = {match.old for match in matched}
    kept_new = {match.new for match in matched}
    return LineAlignment(
        matched=tuple(matched),
        deleted=tuple(line.index for line in old if line.index not in kept_old),
        inserted=tuple(line.index for line in new if line.index not in kept_new),
    )


@dataclass(frozen=True)
class SheetAlignment:
    sheet: str
    rows: LineAlignment
    columns: LineAlignment


def align_sheet(old: SheetGrid, new: SheetGrid) -> SheetAlignment:
    return SheetAlignment(
        sheet=new.sheet,
        rows=align_lines(old.rows, new.rows),
        columns=align_lines(old.columns, new.columns),
    )


def _blocks(indices: Sequence[int]) -> list[tuple[int, int]]:
    """Consecutive indices folded to (first, last) runs."""
    runs: list[tuple[int, int]] = []
    for index in indices:
        if runs and index == runs[-1][1] + 1:
            runs[-1] = (runs[-1][0], index)
        else:
            runs.append((index, index))
    return runs


def structural_changes(alignment: SheetAlignment) -> list[dict[str, object]]:
    """The alignment in review language: one inserted block is one
    structural change, however many cells it shifted; a matched pair
    below similarity 1 is one changed line."""
    changes: list[dict[str, object]] = []
    for axis, lines in (("rows", alignment.rows), ("columns", alignment.columns)):
        for first, last in _blocks(lines.inserted):
            changes.append({"kind": f"inserted_{axis}", "first": first, "last": last})
        for first, last in _blocks(lines.deleted):
            changes.append({"kind": f"deleted_{axis}", "first": first, "last": last})
        for match in lines.matched:
            if match.similarity < 1.0:
                changes.append(
                    {
                        "kind": f"changed_{axis[:-1]}",
                        "old": match.old,
                        "new": match.new,
                        "similarity": round(match.similarity, 4),
                    }
                )
    return changes
