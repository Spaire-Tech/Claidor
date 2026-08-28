"""Did the engine catch the planted currency mismatches?"""

import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

from polar.tieout.audit import Audit, _unit_mismatch
from polar.tieout.workbook import read_workbook

planted, truth_file = Path(sys.argv[1]), Path(sys.argv[2])
truth = json.loads(truth_file.read_text())
book = read_workbook(str(planted))
result = Audit(examined=len(book.cells))
_unit_mismatch(book, result)
raised = {f.ref: f for f in result.findings if f.rule == "currency-mismatch"}
caught = 0
for site in truth["planted"]:
    hit = raised.get(site["sum_ref"])
    caught += bool(hit)
    print(
        f"  {'CAUGHT ' if hit else 'MISSED '}{site['sum_ref']:<44} "
        f"flip row {site['flip_row']}" + (f"  :: {hit.detail[:70]}" if hit else "")
    )
extra = [r for r in raised if r not in {s["sum_ref"] for s in truth["planted"]}]
print(
    f"{planted.name}: {caught}/{len(truth['planted'])} planted caught, "
    f"{len(extra)} other findings"
)
for ref in extra[:5]:
    print(f"    other: {ref} :: {raised[ref].detail[:70]}")
