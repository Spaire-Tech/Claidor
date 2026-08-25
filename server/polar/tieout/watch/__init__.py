"""The Watch — what changed between two versions of a model.

Track C of the plan (`docs/pierce/swens-plan.md`). C1 is the raw
version diff: every stored cell, compared by content and by cached
value, deliberately blind to row and column shifts — one inserted
row honestly reads as hundreds of changed cells. C2's alignment is
what turns that into « one structural change ».

The engine (`polar.tieout.audit`, `polar.tieout.workbook`) is a
read-only library to this package; the raw diff does not even need
it, reading the files through its own openpyxl path so that a cell
the engine's labeller skips is still a cell the Watch reports.
"""

from .diff import CellDelta, VersionDiff, diff_paths, diff_raw, read_raw

__all__ = ["CellDelta", "VersionDiff", "diff_paths", "diff_raw", "read_raw"]
