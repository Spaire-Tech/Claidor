"""Inside the 158 seconds: which half is it?

Refusing « compute the delta from stored cells » was right and is not
a finish line. Before proposing a successor, find out what the cost
actually *is* — the two audits, or the sheet alignment. The answer
decides which successors are even possible.
"""
import sys, time
sys.path.insert(0, "/home/user/Claidor/server")
from pathlib import Path
from polar.tieout.audit import audit
from polar.tieout.structure import period_axes
from polar.tieout.watch.signature import sheet_grids
from polar.tieout.watch.delta import align_sheet
from polar.tieout.workbook import read_workbook

S = Path("/home/user/Claidor/server/scripts/corpus_sft")
path = S / "levenmouth_model.xlsm"

t = time.monotonic(); book = read_workbook(str(path)); read = time.monotonic() - t
print(f"  read_workbook        {read:7.2f}s   {len(book.cells):,} cells")

t = time.monotonic(); axes = period_axes(book); axes_took = time.monotonic() - t
print(f"  period_axes          {axes_took:7.2f}s")

t = time.monotonic(); found = audit(book, axes=axes); audit_took = time.monotonic() - t
print(f"  audit (one side)     {audit_took:7.2f}s   {len(found.findings)} findings")

t = time.monotonic(); grids = sheet_grids(book); grids_took = time.monotonic() - t
print(f"  sheet_grids          {grids_took:7.2f}s   {len(grids)} sheets")

t = time.monotonic()
per_sheet = []
for name, grid in grids.items():
    s = time.monotonic()
    align_sheet(grid, grid)
    per_sheet.append((time.monotonic() - s, name, len(grid.lines) if hasattr(grid, "lines") else 0))
align_took = time.monotonic() - t
print(f"  align every sheet    {align_took:7.2f}s")
per_sheet.sort(reverse=True)
for took, name, lines in per_sheet[:8]:
    print(f"      {took:7.2f}s  {name}")
print(f"\n  so one transition ≈ 2×read + 2×audit + align ="
      f" {2*read + 2*audit_took + align_took:.0f}s")
