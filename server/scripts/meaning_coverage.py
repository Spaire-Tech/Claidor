"""Measure 1 and 3 of `docs/pierce/taxonomy-coverage.md`: how many money
rows of a corpus the dictionary can name, by sheet class, per file.

    PYTHONPATH=. uv run python scripts/meaning_coverage.py CORPUS_DIR OUT.json [--sample OUT_SAMPLE.json]

A *money row* is a labelled row carrying at least one number on a
sheet the measure reads. Sheet classes are by name, fixed in the
registration. The optional sample draws sixty mapped rows (seed
20260902, thirty exact and thirty filers) for the precision judgement.
"""

from __future__ import annotations

import json
import random
import re
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

from polar.tieout.meaning import vocabulary
from polar.tieout.workbook import read_workbook

STATEMENT = re.compile(r"^(FinStat|Exec Summary|Dashboard)", re.IGNORECASE)
PLUMBING = re.compile(
    r"^(Cover|Map & Key|FAST|Contents|Dictionary|Report lookups|PowerBi table|"
    r"OBXValues|Output|F_Inputs|F_Outputs|InpS|Active inputs|Model Checks and Alerts)",
    re.IGNORECASE,
)


def sheet_class(name: str) -> str:
    if STATEMENT.match(name.strip()):
        return "statements"
    if PLUMBING.match(name.strip()):
        return "plumbing"
    return "calculations"


def money_rows(book: Any) -> dict[tuple[str, int], str]:
    """(sheet, row) → label, for labelled rows carrying a number."""
    numeric: set[tuple[str, int]] = set()
    for cell in book.cells.values():
        if isinstance(cell.value, int | float) and not isinstance(cell.value, bool):
            numeric.add((cell.sheet, cell.row))
        elif cell.value is not None and type(cell.value).__name__ == "Decimal":
            numeric.add((cell.sheet, cell.row))
    rows: dict[tuple[str, int], str] = {}
    for sheet, words in book.row_words.items():
        for row, label in words.items():
            if label and label.strip() and (sheet, row) in numeric:
                rows[(sheet, row)] = label.strip()
    return rows


def measure(path: Path) -> dict[str, Any]:
    started = time.time()
    book = read_workbook(str(path))
    read_seconds = round(time.time() - started, 1)
    rows = money_rows(book)
    started = time.time()
    vocab = vocabulary()
    by_class: dict[str, Counter[str]] = {}
    mapped: list[dict[str, Any]] = []
    for (sheet, row), label in rows.items():
        klass = sheet_class(sheet)
        if klass == "plumbing":
            continue
        match = vocab.match(label)
        by_class.setdefault(klass, Counter())[match.tier] += 1
        if match.named and match.concept is not None:
            mapped.append(
                {
                    "sheet": sheet,
                    "row": row,
                    "label": label,
                    "tier": match.tier,
                    "concept": f"{match.concept.source}:{match.concept.name}",
                    "why": match.why,
                }
            )
    return {
        "file": path.name,
        "read_seconds": read_seconds,
        "match_seconds": round(time.time() - started, 2),
        "by_class": {k: dict(v) for k, v in by_class.items()},
        "mapped": mapped,
    }


def main(argv: list[str]) -> None:
    corpus, out = Path(argv[1]), Path(argv[2])
    sample_out = Path(argv[argv.index("--sample") + 1]) if "--sample" in argv else None
    results = []
    for path in sorted(corpus.rglob("*.xls[xm]")):
        one = measure(path)
        results.append(one)
        pooled = Counter()
        for tiers in one["by_class"].values():
            pooled.update(tiers)
        total = sum(pooled.values())
        named = pooled["exact"] + pooled["filers"]
        print(
            f"done {path.name}: {named}/{total} money rows named "
            f"({100 * named / max(total, 1):.1f}%) in {one['match_seconds']}s",
            flush=True,
        )
        out.write_text(json.dumps(results, indent=1))
    if sample_out is not None and sample_out.exists():
        #: The sample is drawn once and kept by row, so a second run
        #: under changed rules re-judges the *same* rows (the first
        #: round of taxonomy-coverage.md lost its sixty to a re-draw).
        print("sample kept:", sample_out)
    elif sample_out is not None:
        rng = random.Random(20260902)
        pool = [(r["file"], m) for r in results for m in r["mapped"]]
        exact = [one for one in pool if one[1]["tier"] == "exact"]
        filers = [one for one in pool if one[1]["tier"] == "filers"]
        sample = rng.sample(exact, min(30, len(exact))) + rng.sample(
            filers, min(30, len(filers))
        )
        sample_out.write_text(
            json.dumps([{"file": f, **m, "judgement": ""} for f, m in sample], indent=1)
        )
        print("sample written:", len(sample))
    print("measure complete:", len(results), "files")


if __name__ == "__main__":
    main(sys.argv)
