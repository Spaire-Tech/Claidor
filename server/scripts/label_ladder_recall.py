"""Did the engine catch the planted label-column defects?

The step that refused `label-column-election.md`. It reported 0 of
12, and the reason was structural rather than a matter of degree:
the election keyed on a cell carrying a formula, and a typed-over
cell has none, so the defect was the one thing the change still
could not see.

Kept because the successor round needs the same measurement,
against the same planted files and the same truth.
"""

import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
from polar.tieout.audit import audit
from polar.tieout.structure import read_structure
from polar.tieout.workbook import read_workbook

planted_file, truth_file = Path(sys.argv[1]), Path(sys.argv[2])
truth = json.loads(truth_file.read_text())
book = read_workbook(str(planted_file))
result = audit(book, read_structure(book).axes)
by_ref = {}
for f in result.findings:
    by_ref.setdefault(getattr(f, "ref", ""), []).append(f)
    for extra in (getattr(f, "cells", "") or "").split(", "):
        if extra:
            by_ref.setdefault(extra.strip(), []).append(f)
caught = 0
for site in truth["planted"]:
    hits = by_ref.get(site["ref"], [])
    mark = "CAUGHT " if hits else "MISSED "
    caught += bool(hits)
    rules = ",".join(sorted({h.rule for h in hits})) or "-"
    print(
        f"  {mark}{site['ref']:<44} {site['kind']:<16} run={site['run_length']:<4} {rules}"
    )
print(f"{planted_file.name}: {caught}/{len(truth['planted'])} planted defects caught")
