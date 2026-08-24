"""Draw the usefulness-audit sample — seeded, stratified, committed.

Protocol: docs/pierce/findings-usefulness-audit.md. Strata are
(file-family x rule); allocation min(size, max(2, round(size * 120 /
population))); the seed is the third argument (the first round drew
with 20260818, the post-fix re-measure with 20260819 — each draw's
seed is recorded in the protocol document). Run from the repo root:

    python server/scripts/usefulness_sample.py \
        docs/pierce/corpus-golden-master.json \
        docs/pierce/findings-usefulness-sample.json \
        20260818
"""

import json
import random
import sys
from collections import defaultdict
from pathlib import Path


def family_of(name: str) -> str:
    if "new_debt" in name:
        return "h7_debt"
    if "h7_pcm" in name:
        return "h7_pcm"
    if "ofgem_ed2" in name:
        return "ed2"
    if "BPFM" in name or "bpfm" in name:
        return "riio3_bpfm"
    if "PCFM" in name:
        return "riio3_pcfm"
    if "wacc" in name.lower():
        return "riio3_wacc"
    return "riio3_other"


def main(baseline: Path, out: Path, seed: int = 20260818, rule_floor: int = 0) -> None:
    """With `rule_floor` 0, the original draw: every (family x rule)
    stratum contributes min(size, max(2, round(size * 120 / pop))).

    With a positive `rule_floor`, the per-detector draw the third
    measurement uses: each *rule* is guaranteed min(rule size,
    rule_floor) picks — so the small detectors (four inconsistent
    rows) are judged whole and the big ones cannot crowd them out —
    distributed over that rule's family strata proportionally, every
    non-empty stratum getting at least one. The estimate then answers
    « how good is each detector », not only « how good is the report ».
    """
    rows = json.loads(baseline.read_text())
    strata: dict[tuple[str, str], list[dict]] = defaultdict(list)
    population = 0
    for row in rows:
        fam = family_of(row["file"])
        for finding in row.get("findings", []):
            strata[(fam, finding["rule"])].append({"file": row["file"], **finding})
            population += 1

    rng = random.Random(seed)
    sample = []
    if not rule_floor:
        for (fam, rule), members in sorted(strata.items()):
            want = min(len(members), max(2, round(len(members) * 120 / population)))
            picked = rng.sample(members, want)
            for one in picked:
                sample.append({"family": fam, "stratum": len(members), **one})
    else:
        by_rule: dict[str, list[tuple[str, list[dict]]]] = defaultdict(list)
        for (fam, rule), members in sorted(strata.items()):
            by_rule[rule].append((fam, members))
        for rule, families in sorted(by_rule.items()):
            rule_size = sum(len(members) for _, members in families)
            target = min(
                rule_size, max(rule_floor, round(rule_size * 120 / population))
            )
            for fam, members in families:
                share = max(1, round(target * len(members) / rule_size))
                picked = rng.sample(members, min(len(members), share))
                for one in picked:
                    sample.append({"family": fam, "stratum": len(members), **one})

    out.write_text(json.dumps(sample, indent=1))
    print(f"population {population}, strata {len(strata)}, sampled {len(sample)}")


if __name__ == "__main__":
    main(
        Path(sys.argv[1]),
        Path(sys.argv[2]),
        int(sys.argv[3]) if len(sys.argv) > 3 else 20260818,
        int(sys.argv[4]) if len(sys.argv) > 4 else 0,
    )
