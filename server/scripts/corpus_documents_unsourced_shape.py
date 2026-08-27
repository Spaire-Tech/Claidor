"""D5 round 2: does the local-rule shape flood, and at what budget?

Round 1 measured the naive unsourced class and its own number killed
it — half of every regulator model. The replacement fires only where
sourcing is the **local** rule: a typed cell with no confirmed source
inside a block whose *other* typed cells are confirmed to a degree.

That can be measured with zero confirmed links in existence, because
it is a property of the model's own block structure crossed with a
person's confirmation budget. Blocks are the engine's own
`structure.sections()` — « rows the model itself totals », declared
by the workbook's own SUM formulas, never a heuristic of mine.

Prints, per model and exactly as registered in the Scribe log:

- sections declared, and the typed cells that sit inside them
- for each threshold (any / half / all-but-this-one) and each
  confirmation budget B, the findings that would fire under
  **greedy adversarial** placement (how bad can it get) and under
  **seeded random** placement, 20 trials, mean and max

    uv run python -m scripts.corpus_documents_unsourced_shape          # round 2
    uv run python -m scripts.corpus_documents_unsourced_shape deals    # round 3
"""

import random
import warnings
from collections import defaultdict
from math import ceil
from pathlib import Path

warnings.filterwarnings("ignore")

SCRIPTS = Path(__file__).parent

#: Registered in the log before any result.
SEED = 3141592
TRIALS = 20
BUDGETS = (10, 25, 50, 100)

#: Round 2's registered model set — regulator models plus two small
#: deal-shaped ones. Unchanged, so round 2 stays reproducible.
MODELS = [
    SCRIPTS / "corpus_models" / "ofgem_ed2_pcfm_v5.xlsx",
    SCRIPTS / "corpus_models" / "ofgem_ed2_pcfm_v3_2023.xlsx",
    SCRIPTS / "corpus_models" / "ofgem_riio_et1_pcfm_2015.xlsm",
    SCRIPTS / "cascade" / "cascade_model.xlsx",
    SCRIPTS / "cascade" / "example_preapp_model.xlsx",
]

#: Round 3's population: the eight readable Scottish Futures Trust
#: closed-deal models, which is the market the founder chose. Round 2's
#: own write-up named this round and could not run it — the only
#: deal-shaped models this lane held were an 85-cell fixture and a
#: 230-cell example. The three .xlsb/.xls files the portal also
#: publishes are format-blocked by our reader; they are absent here and
#: counted in the write-up, never quietly dropped.
DEALS = [
    SCRIPTS / "corpus_sft" / f"{stem}_model.xlsm"
    for stem in (
        "baldragon",
        "glasgow_college",
        "forfar",
        "inverurie_foresterhill",
        "kelso",
        "levenmouth",
        "newbattle",
        "oban_campbeltown",
    )
]


def _needed(typed: int, threshold: str) -> int:
    """Confirmations that unlock one section of `typed` typed cells."""
    if threshold == "any":
        return 1
    if threshold == "half":
        return ceil(typed / 2)
    return typed - 1  # all but this one


def _findings(sizes: list[int], placed: list[int], threshold: str) -> int:
    """Findings fired, given how many confirmations each section got.

    A section fires its remaining unconfirmed typed cells once its
    confirmations reach the threshold — and never fires the cells
    that are themselves confirmed.
    """
    total = 0
    for typed, confirmed in zip(sizes, placed):
        if confirmed == 0 or confirmed >= typed:
            continue  # nothing unlocked, or nothing left unsourced
        if confirmed >= _needed(typed, threshold):
            total += typed - confirmed
    return total


def _greedy(sizes: list[int], budget: int, threshold: str) -> int:
    """Spend the budget to maximise findings; greedy, so a lower bound.

    Sections are taken in order of findings unlocked per confirmation
    spent — greedy, which may understate the true adversarial maximum.
    Said in the registration, said again here.
    """
    order = sorted(
        range(len(sizes)),
        key=lambda i: -(
            (sizes[i] - _needed(sizes[i], threshold))
            / max(1, _needed(sizes[i], threshold))
        ),
    )
    placed = [0] * len(sizes)
    left = budget
    for index in order:
        cost = _needed(sizes[index], threshold)
        if cost > left or sizes[index] - cost <= 0:
            continue
        placed[index] = cost
        left -= cost
        if left <= 0:
            break
    return _findings(sizes, placed, threshold)


def _random(sizes: list[int], budget: int, threshold: str, rng) -> int:
    """One trial: the budget scattered over typed cells inside sections."""
    population = [i for i, typed in enumerate(sizes) for _ in range(typed)]
    if not population:
        return 0
    placed = [0] * len(sizes)
    for index in rng.sample(population, min(budget, len(population))):
        placed[index] += 1
    return _findings(sizes, placed, threshold)


def _sections_of(path: Path):
    """(section sizes in typed cells, totals) for one model."""
    from polar.models.tieout import ArtifactKind
    from polar.tieout.ingest import read_artifact
    from polar.tieout.structure import sections
    from polar.tieout.workbook import Workbook

    got = read_artifact(path.read_bytes(), path.name, ArtifactKind.model)
    book = Workbook()
    for cell in got.cells:
        book.cells[cell.ref] = cell
    book.sheets = list(dict.fromkeys(cell.sheet for cell in got.cells))

    typed_by_sheet_row = defaultdict(list)
    for cell in got.cells:
        if cell.formula is None and cell.value is not None:
            typed_by_sheet_row[cell.sheet].append(cell)

    found = sections(book)
    sizes = []
    for section in found:
        inside = [
            cell
            for cell in typed_by_sheet_row.get(section.sheet, [])
            if section.first_row <= cell.row <= section.last_row
        ]
        if len(inside) >= 2:  # a section of one has no « other » cells
            sizes.append(len(inside))
    typed_total = sum(len(v) for v in typed_by_sheet_row.values())
    return sizes, len(found), typed_total


def main(which: str = "round2") -> int:
    models = DEALS if which == "deals" else MODELS
    for path in models:
        if not path.exists():
            print(
                f"\n{path.name}: NOT FETCHED — run scripts.corpus_sft_models "
                "(deals) or scripts.model_corpus (round 2's set)"
            )
            continue
        sizes, declared, typed_total = _sections_of(path)
        inside = sum(sizes)
        print(f"\n{path.name}")
        print(f"  sections the model declares: {declared:,}")
        print(
            f"  typed cells: {typed_total:,} total, {inside:,} inside a usable "
            f"section ({inside / typed_total:.0%})"
            if typed_total
            else "  no typed cells"
        )
        if not sizes:
            print("  no usable sections — this shape has nothing to stand on here")
            continue
        print(f"  usable sections: {len(sizes):,}, largest {max(sizes):,} typed cells")
        for threshold in ("any", "half", "all-but-this-one"):
            print(f"  threshold « {threshold} »")
            for budget in BUDGETS:
                rng = random.Random(SEED + budget)
                trials = [_random(sizes, budget, threshold, rng) for _ in range(TRIALS)]
                greedy = _greedy(sizes, budget, threshold)
                print(
                    f"    B={budget:4}  adversarial {greedy:7,}   "
                    f"random mean {sum(trials) / TRIALS:9,.1f}  max {max(trials):7,}"
                )
    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main(sys.argv[1] if len(sys.argv) > 1 else "round2"))
