"""Draw the usefulness-audit sample — seeded, stratified, committed.

Protocol: docs/pierce/findings-usefulness-audit.md. Strata are
(file-family x rule); allocation min(size, max(2, round(size * 120 /
population))); seed 20260818. Run from the repo root:

    python server/scripts/usefulness_sample.py \
        docs/pierce/corpus-golden-master.json \
        docs/pierce/findings-usefulness-sample.json
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


def main(baseline: Path, out: Path) -> None:
    rows = json.loads(baseline.read_text())
    strata: dict[tuple[str, str], list[dict]] = defaultdict(list)
    population = 0
    for row in rows:
        fam = family_of(row["file"])
        for finding in row.get("findings", []):
            strata[(fam, finding["rule"])].append({"file": row["file"], **finding})
            population += 1

    rng = random.Random(20260818)
    sample = []
    for (fam, rule), members in sorted(strata.items()):
        want = min(len(members), max(2, round(len(members) * 120 / population)))
        picked = rng.sample(members, want)
        for one in picked:
            sample.append({"family": fam, "stratum": len(members), **one})

    out.write_text(json.dumps(sample, indent=1))
    print(f"population {population}, strata {len(strata)}, sampled {len(sample)}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
