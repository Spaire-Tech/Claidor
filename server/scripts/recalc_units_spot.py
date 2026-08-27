"""Failure-hunting, not scoring: read what E2 said about real rows.

    cd server && uv run python -m scripts.recalc_units_spot MODEL.xlsm [N]

Twenty rows drawn from one closed-deal model, printed with the
evidence E2 saw and the label it produced, so a systematic failure
mode can be *named*. No accuracy number comes out of this — twenty
rows could not support one, and the registration forbids quoting
one on this corpus anyway.
"""

import random
import sys

from polar.tieout.units.inference import classify_sheet, orientation, rows_from_cells
from polar.tieout.workbook import read_workbook

path = sys.argv[1]
count = int(sys.argv[2]) if len(sys.argv) > 2 else 20
cells = read_workbook(path).cells
sheets = sorted({c.sheet for c in cells.values()})
pool = []
for sheet in sheets:
    rows = rows_from_cells(cells, sheet)
    if not rows:
        continue
    facing = orientation(rows)
    labels = classify_sheet(rows)
    by_row = {r.row: r for r in rows}
    for (s, n), label in labels.items():
        pool.append((facing, by_row[n], label))
rng = random.Random(11)
for facing, evidence, label in rng.sample(pool, min(count, len(pool))):
    print(f"--- {evidence.sheet}!{evidence.row}  [{facing}]")
    print(f"    label:   {evidence.row_label!r}")
    print(f"    headers: {list(evidence.column_labels)[:5]}")
    print(f"    formats: {list(evidence.number_formats)}")
    print(f"    values:  {[round(v, 4) for v in evidence.values[:5]]}")
    print(
        f"    E2 says: kind={label.kind} b5_type={label.b5_type} "
        f"cur={label.currency} scale={label.scale} "
        f"period={label.period} rate_form={label.rate_form}"
    )
    print(f"    why:     {label.why}")
