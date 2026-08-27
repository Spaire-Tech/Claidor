"""D5's flood, measured before the finding exists.

The unsourced-number finding — a typed number with no confirmable
source — ships only after its flood is measured on real models (the
plan's own condition). This prints exactly the numbers the Scribe log
registers, per model, and nothing else:

- naive candidates (typed numeric cells: no formula, a value present)
- as a share of all numeric cells
- concentration: the top sheets by candidate count, and the share the
  top five sheets carry

The shape of the finding (per cell, per block, per sheet) is decided
*from* these numbers, never before them.

    uv run python -m scripts.corpus_documents_unsourced
"""

import warnings
from collections import Counter
from pathlib import Path

warnings.filterwarnings("ignore")

SCRIPTS = Path(__file__).parent

#: The registered model set: the three real regulator models the
#: committed fetcher serves from this container, and the two committed
#: fixture models — the deal-shaped ones closest to the product case.
MODELS = [
    SCRIPTS / "corpus_models" / "ofgem_ed2_pcfm_v5.xlsx",
    SCRIPTS / "corpus_models" / "ofgem_ed2_pcfm_v3_2023.xlsx",
    SCRIPTS / "corpus_models" / "ofgem_riio_et1_pcfm_2015.xlsm",
    SCRIPTS / "cascade" / "cascade_model.xlsx",
    SCRIPTS / "cascade" / "example_preapp_model.xlsx",
]


def main() -> int:
    from polar.models.tieout import ArtifactKind
    from polar.tieout.ingest import read_artifact

    for path in MODELS:
        if not path.exists():
            print(f"{path.name}: NOT FETCHED — run scripts.model_corpus first")
            continue
        got = read_artifact(path.read_bytes(), path.name, ArtifactKind.model)
        numeric = [c for c in got.cells if c.value is not None]
        typed = [c for c in numeric if c.formula is None]
        by_sheet = Counter(c.sheet for c in typed)
        top = by_sheet.most_common(8)
        top5_share = (
            sum(count for _, count in by_sheet.most_common(5)) / len(typed)
            if typed
            else 0.0
        )
        print(f"\n{path.name}")
        print(f"  numeric cells: {len(numeric):,}")
        print(
            f"  naive unsourced candidates (typed): {len(typed):,} "
            f"({len(typed) / len(numeric):.0%} of numeric)"
            if numeric
            else "  no numeric cells"
        )
        print(f"  sheets carrying candidates: {len(by_sheet)}")
        print(f"  top five sheets carry: {top5_share:.0%}")
        for sheet, count in top:
            print(f"    {sheet[:44]:44} {count:7,}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
