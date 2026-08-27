import json
from pathlib import Path
from polar.tieout.units.inference import (
    DIMENSIONS, Orientation, RowEvidence, classify_row, orientation, sheet_reading,
)
from polar.tieout.workbook import read_workbook
from scripts.recalc_units_e1 import MODEL_PATHS, TRUTH, as_used

rows = json.loads(Path(TRUTH).read_text())
cache = {}
readings = {}
for row in rows:
    ev = RowEvidence(sheet=row["sheet"], row=row["row"], row_label=row.get("row_label",""),
                     column_labels=row.get("column_labels",()), number_formats=row.get("number_formats",()),
                     values=row.get("values",()))
    iso = classify_row(ev, orientation([ev]))
    used = as_used(row, cache)
    if used is None:
        continue
    path = MODEL_PATHS.get(row["model"])
    if path and Path(path).exists():
        key = (row["model"], row["sheet"])
        if key not in readings:
            readings[key] = sheet_reading(read_workbook(path).cells, row["sheet"])
    for d in DIMENSIONS:
        t = row["labels"].get(d)
        a, b = iso.get(d), used.get(d)
        if a == t and b != t and b not in ("unknown", "untyped"):
            print(f"{d}: {row['model']} {row['sheet']}!{row['row']} "
                  f"[{readings.get((row['model'], row['sheet']))}] "
                  f"{a!r} -> {b!r} (truth {t!r})  label={row.get('row_label','')[:36]!r}")
            print(f"    why: {used.why[:100]}")
