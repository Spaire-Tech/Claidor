"""The measures of `docs/pierce/label-patterns.md`, from the mine's output.

    PYTHONPATH=. uv run python scripts/label_patterns_report.py MINE.json HELDOUT.json SAMPLE.json

MINE.json is the corpora's mine, HELDOUT.json the founder's model
(held out of the counting), SAMPLE.json the forty confident patterns
kept by label for the judgement (drawn once; kept if it exists).
"""

from __future__ import annotations

import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from polar.tieout.meaning.patterns import is_link

MIN_FILES = 3
MIN_FOLDERS = 2


def aggregate(mine: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """label → its patterns, by file and folder."""
    seen: set[str] = set()
    files_per_label: dict[str, set[str]] = defaultdict(set)
    folders_per_label: dict[str, set[str]] = defaultdict(set)
    files_per_pattern: dict[str, dict[tuple[str, ...], set[str]]] = defaultdict(
        lambda: defaultdict(set)
    )
    rows_per_pattern: dict[str, Counter[tuple[str, ...]]] = defaultdict(Counter)
    for one in mine:
        if one["sha"] in seen:
            continue
        seen.add(one["sha"])
        for row in one["rows"]:
            label = row["label"]
            pattern = tuple(row["pattern"])
            files_per_label[label].add(one["sha"])
            folders_per_label[label].add(one["folder"])
            files_per_pattern[label][pattern].add(one["sha"])
            rows_per_pattern[label][pattern] += 1
    table: dict[str, dict[str, Any]] = {}
    for label, files in files_per_label.items():
        votes = {p: len(f) for p, f in files_per_pattern[label].items()}
        best, best_votes = max(votes.items(), key=lambda kv: kv[1])
        eligible = (
            len(files) >= MIN_FILES and len(folders_per_label[label]) >= MIN_FOLDERS
        )
        confident = eligible and best_votes * 2 > len(files) and not is_link(best)
        table[label] = {
            "files": len(files),
            "folders": sorted(folders_per_label[label]),
            "patterns": len(votes),
            "best": list(best),
            "best_files": best_votes,
            "rows": rows_per_pattern[label][best],
            "eligible": eligible,
            "confident": confident,
        }
    return table


def main(argv: list[str]) -> None:
    mine = json.loads(Path(argv[1]).read_text())
    heldout = json.loads(Path(argv[2]).read_text())
    sample_path = Path(argv[3])
    table = aggregate(mine)
    files = len({one["sha"] for one in mine})
    rows = sum(len(one["rows"]) for one in mine)
    eligible = {k: v for k, v in table.items() if v["eligible"]}
    confident = {k: v for k, v in table.items() if v["confident"]}
    print(
        f"files {files} | labelled formula rows {rows} | distinct labels {len(table)}"
    )
    print(
        f"labels in >= {MIN_FILES} files from >= {MIN_FOLDERS} folders: {len(eligible)} "
        f"| confident: {len(confident)} ({100 * len(confident) / max(1, len(eligible)):.1f}%)"
    )
    print("mine seconds per file (max):", max(one["mine_seconds"] for one in mine))
    print("\nTOP 30 confident patterns by files:")
    for label, v in sorted(confident.items(), key=lambda kv: -kv[1]["best_files"])[:30]:
        print(
            f"  {label[:40]:40} = {' '.join(v['best'])[:70]:70} "
            f"({v['best_files']}/{v['files']} files, {len(v['folders'])} folders)"
        )
    if sample_path.exists():
        sample = json.loads(sample_path.read_text())
        print("\nsample kept:", len(sample))
    else:
        rng = random.Random(20260902)
        labels = sorted(confident)
        sample = [
            {"label": one, **confident[one], "judgement": ""}
            for one in rng.sample(labels, min(40, len(labels)))
        ]
        sample_path.write_text(json.dumps(sample, indent=1))
        print("\nsample written:", len(sample))
    print("\nSAMPLE:")
    for i, one in enumerate(sample):
        print(
            f"{i:2} {one['label'][:38]:38} = {' '.join(one['best'])[:80]:80} "
            f"({one['best_files']}/{one['files']}, {len(one['folders'])} folders)"
        )
    # The preview on the held-out model
    held_rows = [row for one in heldout for row in one["rows"]]
    with_label = [row for row in held_rows if row["label"] in confident]
    agree = [
        row
        for row in with_label
        if tuple(row["pattern"]) == tuple(confident[row["label"]]["best"])
    ]
    print(
        f"\nHELD-OUT MODEL: labelled formula rows {len(held_rows)} | with a confident label "
        f"{len(with_label)} ({100 * len(with_label) / max(1, len(held_rows)):.1f}%) | agreeing "
        f"{len(agree)} ({100 * len(agree) / max(1, len(with_label)):.1f}%)"
    )
    for row in with_label[:20]:
        mark = (
            "="
            if tuple(row["pattern"]) == tuple(confident[row["label"]]["best"])
            else "≠"
        )
        print(
            f"  {mark} {row['sheet'][:14]:14} {row['label'][:30]:30} model: "
            f"{' '.join(row['pattern'])[:45]:45} corpus: {' '.join(confident[row['label']]['best'])[:45]}"
        )


if __name__ == "__main__":
    main(sys.argv)
