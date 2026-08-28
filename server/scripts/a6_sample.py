"""The registered sample — drawn exactly as `a6-xls-routes.md` fixes it."""
import random
import sys
from pathlib import Path

ROOT = Path(__file__).parent / "custodes_work"
names = sorted(str(p) for p in ROOT.rglob("*.xls"))
print(f"population: {len(names)} .xls files", file=sys.stderr)
sample = random.Random(20260828).sample(names, 60)
for one in sample:
    print(one)
