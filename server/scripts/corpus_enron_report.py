"""The Enron sweep's measures, computed exactly as registered.

Reads the JSONL the sweep wrote and prints the eight measures of
`docs/pierce/enron-sweep.md` in order, then draws the usefulness
sample under the registered seed and writes it beside the JSONL.

    cd server && uv run python -m scripts.corpus_enron_report SWEEP.jsonl

Nothing here reads a workbook; the sample's judging cards are built
by `corpus_enron_cards.py`, which re-fetches only the sampled files.
"""

from __future__ import annotations

import json
import random
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

SEED = 20260902
BANDS = (("thin", 1, 99), ("model", 100, 1499), ("deep", 1500, 10**9))
FLOOD = 200
SAMPLE_ACROSS = 40
SAMPLE_TIER_ONE = 20
RULE_FLOOR = 3


def band_of(formulas: int) -> str | None:
    for name, low, high in BANDS:
        if low <= formulas <= high:
            return name
    return None


def pct(part: int, whole: int) -> str:
    return f"{part:,} ({100 * part / whole:.1f}%)" if whole else f"{part:,}"


def quantile(values: list[float], share: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round(share * (len(ordered) - 1))))
    return ordered[index]


def main(argv: list[str]) -> int:
    source = Path(argv[1])
    rows: list[dict[str, Any]] = []
    with source.open() as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    total = len(rows)
    print(f"# Enron sweep report — {total:,} files recorded\n")

    # 1. Readability
    failed = [r for r in rows if "failed" in r]
    opened = [r for r in rows if "failed" not in r]
    print("## 1. Readability")
    print(f"opened and audited: {pct(len(opened), total)}")
    print(f"failed: {pct(len(failed), total)}")
    classes = Counter(r["failed"].split(":")[0] for r in failed)
    for name, count in classes.most_common():
        example = next(r["file"] for r in failed if r["failed"].startswith(name))
        print(f"  {name}: {count:,}   e.g. {example}")
    print()

    # 2. Formula-bearing files by band
    bearing = [r for r in opened if r.get("formulas", 0) > 0]
    print("## 2. Formula-bearing files")
    print(f"with at least one formula: {pct(len(bearing), len(opened))} of opened")
    by_band: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in bearing:
        by_band[band_of(r["formulas"]) or "?"].append(r)
    for name, _low, _high in BANDS:
        print(f"  {name}: {len(by_band[name]):,}")
    print()

    # 3. Findings
    print("## 3. Findings")
    all_findings = [f for r in bearing for f in r["findings"]]
    print(f"total on formula-bearing files: {len(all_findings):,}")
    rules = Counter(f["rule"] for f in all_findings)
    for rule, count in rules.most_common():
        print(f"  {rule}: {count:,}")
    tiers = Counter(str(f["tier"]) for f in all_findings)
    print("by tier: " + ", ".join(f"tier {t}: {c:,}" for t, c in sorted(tiers.items())))
    for name, _low, _high in BANDS:
        members = by_band[name]
        formulas = sum(r["formulas"] for r in members)
        findings = sum(len(r["findings"]) for r in members)
        rate = 1000 * findings / formulas if formulas else 0
        print(
            f"  {name}: {findings:,} findings over {formulas:,} formulas = {rate:.1f} per thousand"
        )
    floods = [r for r in bearing if len(r["findings"]) > FLOOD]
    print(f"floods (more than {FLOOD} findings): {len(floods):,}")
    for r in sorted(floods, key=lambda r: -len(r["findings"]))[:10]:
        top = Counter(f["rule"] for f in r["findings"]).most_common(1)[0]
        print(f"  {len(r['findings']):,}  {r['file']}  (mostly {top[0]}: {top[1]:,})")
    print()

    # 4. Silence
    print("## 4. Silence (formula-bearing files with zero findings)")
    for name, _low, _high in BANDS:
        members = by_band[name]
        silent = sum(1 for r in members if not r["findings"])
        print(f"  {name}: {pct(silent, len(members))}")
    print()

    # 5. Time
    print("## 5. Seconds per file")
    for name, _low, _high in BANDS:
        seconds = [float(r["seconds"]) for r in by_band[name]]
        if seconds:
            print(
                f"  {name}: median {statistics.median(seconds):.1f}s, "
                f"95th {quantile(seconds, 0.95):.1f}s, max {max(seconds):.1f}s"
            )
    print()

    # 6. Contamination
    held = [r for r in rows if r.get("held")]
    print("## 6. Contamination")
    print(f"files whose hash is already held here: {len(held):,}")
    for r in held[:20]:
        print(f"  {r['file']}")
    print()

    # 8. Reader defects (7 comes last because it writes a file)
    print("## 8. Reader defects (distinct exception types)")
    for name, count in classes.most_common():
        if name in ("timeout", "worker died", "not fetched"):
            continue
        example = next(r for r in failed if r["failed"].startswith(name))
        print(f"  {name} ×{count:,}: {example['failed'][:160]}   [{example['file']}]")
    print()

    # 7. The usefulness sample, seeded
    print("## 7. Usefulness sample")
    eligible_rows = [
        r
        for r in bearing
        if band_of(r["formulas"]) in ("model", "deep") and not r.get("held")
    ]
    pool: list[dict[str, Any]] = []
    for r in eligible_rows:
        for index, f in enumerate(r["findings"]):
            pool.append({"file": r["file"], "index": index, **f})
    print(
        f"eligible findings (model + deep bands, not held): {len(pool):,} on {len(eligible_rows):,} files"
    )
    rng = random.Random(SEED)
    by_rule: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in pool:
        by_rule[item["rule"]].append(item)
    # Proportional shares with a floor of RULE_FLOOR for rules with >= RULE_FLOOR.
    shares: dict[str, int] = {}
    if pool:
        for rule, items in by_rule.items():
            share = round(SAMPLE_ACROSS * len(items) / len(pool))
            if len(items) >= RULE_FLOOR:
                share = max(share, RULE_FLOOR)
            shares[rule] = min(share, len(items))
        # Trim the largest shares until the total is SAMPLE_ACROSS.
        while sum(shares.values()) > SAMPLE_ACROSS:
            biggest = max(shares, key=lambda k: shares[k])
            if shares[biggest] <= RULE_FLOOR:
                break
            shares[biggest] -= 1
    across: list[dict[str, Any]] = []
    for rule in sorted(shares):
        picked = rng.sample(by_rule[rule], shares[rule])
        across.extend({**item, "stratum": "across"} for item in picked)
    tier_one = [item for item in pool if str(item["tier"]) == "1"]
    chosen_keys = {(item["file"], item["index"]) for item in across}
    tier_pool = [
        item for item in tier_one if (item["file"], item["index"]) not in chosen_keys
    ]
    tier_pick = rng.sample(tier_pool, min(SAMPLE_TIER_ONE, len(tier_pool)))
    sample = across + [{**item, "stratum": "tier1"} for item in tier_pick]
    print(
        f"drawn: {len(across)} across rules "
        + str(dict(shares))
        + f", {len(tier_pick)} tier-1"
    )
    target = source.with_name("sample.json")
    target.write_text(json.dumps(sample, indent=1))
    print(f"written: {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
