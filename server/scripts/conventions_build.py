"""Build the conventions data file from the pattern mine
(`docs/pierce/convention-check.md`).

    PYTHONPATH=. uv run python scripts/conventions_build.py OUT.json.gz MINE.json [MINE.json ...] [--hold-out NAME ...]

A convention: a normalised row label computed the same way (the
`meaning.patterns` bag) in at least three files from at least two
independent families, by a strict majority of the files that use the
label with a formula, and not a plain link. Independence is by
author: the Ofwat PR24 financial models (drafts and finals) are one
family, every other corpus folder is one, and each project-finance
model is its own. `--hold-out` drops a file (by its name) from the
pool, for the leave-one-out measurement.

The file carries label words and shapes only — nothing from any
model's numbers.
"""

from __future__ import annotations

import gzip
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from polar.tieout.meaning.conventions import is_axis_label, is_block_sum
from polar.tieout.meaning.patterns import is_link

MIN_FILES = 3
MIN_FAMILIES = 2

#: The one template held twice: drafts under `corpus_pr24dd`, finals
#: under `corpus_regulator` as `PR24-FD-FM02-Financial-model-*`.
PR24_FM = "PR24-FD-FM02-Financial-model-"


def family_of(folder: str, file: str) -> str:
    if folder == "corpus_pr24dd" or file.startswith(PR24_FM):
        return "pr24-fm"
    if folder in ("held-out", "pf"):
        return Path(file).stem.split("_")[0].lower()
    return folder


def build(mines: list[list[dict[str, Any]]], hold_out: set[str]) -> dict[str, Any]:
    seen: set[str] = set()
    files_per_label: dict[str, set[str]] = defaultdict(set)
    families_per_label: dict[str, set[str]] = defaultdict(set)
    votes: dict[str, dict[tuple[str, ...], set[str]]] = defaultdict(
        lambda: defaultdict(set)
    )
    pool_files = 0
    pool_families: set[str] = set()
    family_by_sha: dict[str, str] = {}
    for mine in mines:
        for one in mine:
            if one["sha"] in seen or one["file"] in hold_out:
                continue
            seen.add(one["sha"])
            family = family_of(one["folder"], one["file"])
            family_by_sha[one["sha"]] = family
            pool_files += 1
            pool_families.add(family)
            for row in one["rows"]:
                label = row["label"]
                if is_axis_label(label):
                    continue
                files_per_label[label].add(one["sha"])
                families_per_label[label].add(family)
                votes[label][tuple(row["pattern"])].add(one["sha"])
    labels: dict[str, Any] = {}
    for label, files in files_per_label.items():
        if len(files) < MIN_FILES or len(families_per_label[label]) < MIN_FAMILIES:
            continue
        best, agreeing = max(votes[label].items(), key=lambda kv: len(kv[1]))
        if len(agreeing) * 2 <= len(files) or is_link(best) or is_block_sum(best):
            continue
        #: Families among the agreeing files — the convention's own
        #: independence, not the label's: thirty-two copies of one
        #: template agreeing with each other is one author's habit.
        agreeing_families = {
            family_by_sha[sha] for sha in agreeing if sha in family_by_sha
        }
        if len(agreeing) < MIN_FILES or len(agreeing_families) < MIN_FAMILIES:
            continue
        labels[label] = {
            "pattern": list(best),
            "files": len(files),
            "agreeing": len(agreeing),
            "families": len(agreeing_families),
        }
    return {
        "pool": {"files": pool_files, "families": sorted(pool_families)},
        "labels": labels,
    }


def main(argv: list[str]) -> None:
    out = Path(argv[1])
    mines: list[list[dict[str, Any]]] = []
    hold_out: set[str] = set()
    rest = argv[2:]
    while rest:
        item = rest.pop(0)
        if item == "--hold-out":
            hold_out.add(rest.pop(0))
        else:
            mines.append(json.loads(Path(item).read_text()))
    data = build(mines, hold_out)
    with gzip.open(out, "wt", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False)
    labels = data["labels"]
    tiers = Counter(min(one["families"], 3) for one in labels.values())
    print(
        f"pool: {data['pool']['files']} files, {len(data['pool']['families'])} families "
        f"| conventions: {len(labels)} | three or more families: {tiers[3]} "
        f"| held out: {sorted(hold_out) or 'none'} → {out}"
    )


if __name__ == "__main__":
    main(sys.argv)
