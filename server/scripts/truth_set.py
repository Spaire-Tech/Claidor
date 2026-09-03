"""The truth set: one registry of every labelled defect we hold
(`docs/pierce/truth-set.md`).

    PYTHONPATH=. uv run python scripts/truth_set.py count
    PYTHONPATH=. uv run python scripts/truth_set.py add ENTRY.json [ENTRY.json ...]
    PYTHONPATH=. uv run python scripts/truth_set.py candidates PAIR_LOG LABEL OUT.json

`count` prints the registry by grade and source. `add` appends
entries (one JSON object per file, or a JSON list) after checking
the required fields. `candidates` turns a `revision_diff` log into a
file of NEW findings a person can grade — each with an empty
`grade` a reader fills with `genuine`, `structure` or `artefact` —
which `add` then takes.

The registry is `docs/pierce/truth-set/registry.jsonl`, one JSON
object per line. Required fields: `id`, `grade` (independent-real,
engine-found-hand-verified, synthetic, external), `source`,
`description`, `added`. A defect on a held model also carries
`file` (name), `sha` (the file's content hash, first 16 hex of
SHA-256), `sheet`, and `cell` or `cells`. A set carries `count` and
`licence`. Files themselves are never committed.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REGISTRY = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "pierce"
    / "truth-set"
    / "registry.jsonl"
)
GRADES = ("independent-real", "engine-found-hand-verified", "synthetic", "external")
REQUIRED = ("id", "grade", "source", "description", "added")


def sha_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def load() -> list[dict[str, Any]]:
    if not REGISTRY.exists():
        return []
    return [
        json.loads(line) for line in REGISTRY.read_text().splitlines() if line.strip()
    ]


def check(entry: dict[str, Any]) -> None:
    missing = [field for field in REQUIRED if not entry.get(field)]
    if missing:
        raise ValueError(f"{entry.get('id', '?')}: missing {missing}")
    if entry["grade"] not in GRADES:
        raise ValueError(
            f"{entry['id']}: grade {entry['grade']!r} is not one of {GRADES}"
        )
    if "cell" in entry or "cells" in entry:
        for field in ("file", "sha", "sheet"):
            if not entry.get(field):
                raise ValueError(f"{entry['id']}: a labelled cell needs {field}")


def add(entries: list[dict[str, Any]]) -> int:
    existing = {one["id"] for one in load()}
    added = 0
    REGISTRY.parent.mkdir(parents=True, exist_ok=True)
    with REGISTRY.open("a", encoding="utf-8") as handle:
        for entry in entries:
            check(entry)
            if entry["id"] in existing:
                print("already registered:", entry["id"])
                continue
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
            existing.add(entry["id"])
            added += 1
    return added


def count() -> None:
    entries = load()
    by_grade: Counter[str] = Counter()
    by_source: Counter[str] = Counter()
    for one in entries:
        weight = int(one.get("count", 1)) if one["grade"] == "external" else 1
        by_grade[one["grade"]] += weight
        by_source[one["source"]] += weight
    print("registry lines:", len(entries))
    print("by grade (external sets weighted by their count):")
    for grade in GRADES:
        print(f"  {grade:28} {by_grade[grade]}")
    print("by source:")
    for source, n in by_source.most_common():
        print(f"  {source[:60]:60} {n}")


_NEW = re.compile(r"^\s+NEW \[(?P<rule>[^\]]+)\] (?P<where>.*) '(?P<name>.*)'$")
_PAIR = re.compile(r"^(?P<pair>\S+): draft=\d+ final=\d+ NEW=")


def _split_where(where: str) -> tuple[str, list[str]]:
    """`Sheet!Sheet!A1,Sheet!B2` → ('Sheet', ['A1', 'B2']); the sheet
    name may carry spaces, so it is taken up to the first `!` and
    stripped from each reference after it."""
    sheet, _, rest = where.partition("!")
    refs = [
        ref[len(sheet) + 1 :] if ref.startswith(sheet + "!") else ref
        for ref in rest.split(",")
        if ref
    ]
    return sheet, refs


def candidates(log: Path, label: str, out: Path) -> None:
    found = []
    pair = label
    for line in log.read_text().splitlines():
        summary = _PAIR.match(line)
        if summary:
            pair = summary.group("pair")
            continue
        match = _NEW.match(line)
        if match:
            sheet, refs = _split_where(match.group("where"))
            found.append(
                {
                    "pair": pair,
                    "rule": match.group("rule"),
                    "sheet": sheet,
                    "refs": refs,
                    "name": match.group("name"),
                    "grade": "",
                    "note": "",
                }
            )
    out.write_text(json.dumps(found, indent=1, ensure_ascii=False))
    print("candidates written:", len(found), "→", out)


def main(argv: list[str]) -> None:
    command = argv[1]
    if command == "count":
        count()
    elif command == "add":
        entries: list[dict[str, Any]] = []
        for path in argv[2:]:
            loaded = json.loads(Path(path).read_text())
            entries.extend(loaded if isinstance(loaded, list) else [loaded])
        print("added:", add(entries))
    elif command == "candidates":
        candidates(Path(argv[2]), argv[3], Path(argv[4]))
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv)
