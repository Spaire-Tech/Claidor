#!/usr/bin/env python3
"""Phase 0 bake-off — step 4: prepare blind copies for scoring.

Copies proposals-a.md and proposals-b.md into blind/<slug>/set-1.md and
set-2.md in a RANDOM order, strips the variant labels, and records the
mapping in blind/<slug>/key.json. Scorers only ever see set-1 / set-2;
open key.json AFTER all scorecards are in.

Usage:
    python blind.py <slug>
"""

from __future__ import annotations

import json
import random
import re
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    slug = sys.argv[1]
    base = Path(__file__).parent
    data_dir = base / "data" / slug
    variants = {}
    for v in ("a", "b"):
        p = data_dir / f"proposals-{v}.md"
        if p.exists():
            variants[v] = p.read_text()
    if not variants:
        sys.exit(f"No proposals-*.md in {data_dir} — run generate_proposals.py first.")
    if len(variants) == 1:
        print(
            "Note: only one variant present — blind copy made, but there is "
            "nothing to compare until the other variant is generated."
        )

    order = list(variants.keys())
    random.shuffle(order)
    out = base / "blind" / slug
    out.mkdir(parents=True, exist_ok=True)
    key = {}
    for i, v in enumerate(order, 1):
        text = re.sub(
            r"^# Proposals \([AB]\)", f"# Proposals (set {i})", variants[v]
        )
        (out / f"set-{i}.md").write_text(text)
        key[f"set-{i}"] = f"variant-{v}"
    (out / "key.json").write_text(json.dumps(key, indent=1))
    print(f"Wrote {len(order)} blind set(s) to {out} — don't peek at key.json.")


if __name__ == "__main__":
    main()
