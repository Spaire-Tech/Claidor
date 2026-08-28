"""Pair every sampled original with a unique converted path.

Two files in the population share a basename while differing in
content (`grades_Spring04_Geol%#A8A32.xls`, in `subjects/` and in the
Tasi tree). A flat conversion directory silently overwrote one with
the other, so pairing by basename would have measured one file
against another file's conversion. Every original gets its own
indexed directory instead, and the pairing is this manifest.
"""
import json
import sys
from pathlib import Path

listing, root, out = (Path(a) for a in sys.argv[1:4])
rows = []
for index, line in enumerate(listing.read_text().splitlines()):
    original = Path(line.strip())
    if not original.name:
        continue
    rows.append({
        "index": index,
        "original": str(original),
        "outdir": str(root / f"{index:03d}"),
        "converted": str(root / f"{index:03d}" / (original.stem + ".xlsx")),
    })
out.write_text(json.dumps(rows, indent=1))
print(f"{len(rows)} pairs written to {out}")
