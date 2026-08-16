"""Round harness for the structure layer — Phase 1 of the analytical
checks (`docs/pierce/analytical-checks-protocol.md`).

Runs `read_structure` over every corpus model on disk and prints, per
model: the sheets with period axes (and a sample of each axis), the
located blocks with their anchors, the opening/closing pairs, and the
abstentions. The output is what gets hand-verified — a located block
with wrong anchors is a round failure; an abstention never is.

Usage:  uv run python scripts/structure_survey.py [substring…]
        (substrings filter which models run; none runs all)
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from polar.tieout.structure import read_structure
from polar.tieout.workbook import read_workbook

HERE = Path(__file__).parent
CORPORA = [HERE / "corpus_pr24dd", HERE / "corpus_sft"]


def models() -> list[Path]:
    found: list[Path] = []
    for corpus in CORPORA:
        if not corpus.exists():
            continue
        for path in sorted(corpus.iterdir()):
            if path.suffix.lower() in (".xlsx", ".xlsm", ".xls"):
                found.append(path)
    return found


def survey(path: Path) -> None:
    started = time.monotonic()
    try:
        book = read_workbook(str(path))
    except Exception as problem:
        print(f"\n=== {path.name}: UNREADABLE — {problem}")
        return
    structure = read_structure(book)
    took = time.monotonic() - started

    print(f"\n=== {path.name} ({len(book.cells):,} cells · {took:.0f}s)")
    if structure.values_pasted:
        print("  VALUES-PASTED: this copy carries (almost) no formulas")
    print(f"  sheets with a period axis: {len(structure.axes)} of {len(book.sheets)}")
    non_unique = [s for s, a in structure.axes.items() if not a.unique_labels]
    if non_unique:
        sample = structure.axes[non_unique[0]]
        print(
            f"  non-unique axis labels on {len(non_unique)} sheets"
            f" (e.g. {non_unique[0]}: {sample.per_year or '?'} columns/year)"
        )
    for sheet, axis in list(structure.axes.items())[:4]:
        labels = axis.labels
        head = " · ".join(labels[:4])
        print(f"    {sheet}: {len(labels)} periods  [{head} …]")
    if len(structure.axes) > 4:
        print(f"    … and {len(structure.axes) - 4} more sheets")

    print(f"  sections (model's own sums): {len(structure.sections)}")
    print(f"  opening/closing pairs: {len(structure.pairs)}")
    for pair in structure.pairs[:5]:
        print(
            f"    {pair.sheet}: rows {pair.opening_row}/{pair.closing_row}"
            f"  « {pair.label} »  ({pair.how})"
        )
    if len(structure.pairs) > 5:
        print(f"    … and {len(structure.pairs) - 5} more")

    for block in structure.located:
        print(f"  LOCATED {block.kind}: {block.sheet}  ← {'; '.join(block.anchors)}")
    for kind, why in structure.unlocated:
        print(f"  abstains ({kind}): {why}")


if __name__ == "__main__":
    wanted = [w.lower() for w in sys.argv[1:]]
    for path in models():
        if wanted and not any(w in path.name.lower() for w in wanted):
            continue
        survey(path)
