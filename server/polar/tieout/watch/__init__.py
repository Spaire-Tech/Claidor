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

from .align import (
    LineAlignment,
    Match,
    SheetAlignment,
    align_lines,
    align_sheet,
    structural_changes,
)
from .delta import (
    DeltaItem,
    DeltaReport,
    delta_of,
    delta_report,
    keyed_findings,
    unchanged_report,
)
from .diff import CellDelta, VersionDiff, diff_paths, diff_raw, read_raw
from .document import DeckDelta, DeckItem, compare_tieouts, deck_delta
from .fragment import Eligibility, classify, eligible_pair
from .profile import (
    Profile,
    Transition,
    describe,
    profile_by_declaration,
    profile_of,
    unusual,
)
from .signature import LITERAL, Line, SheetGrid, sheet_grids
from .tiers import Ladder, Tier2Answer, Verdict, build_ladder, gate_violations
from .version import Declaration, declared_version, step

__all__ = [
    "LITERAL",
    "CellDelta",
    "DeckDelta",
    "DeckItem",
    "Declaration",
    "DeltaItem",
    "DeltaReport",
    "Eligibility",
    "Ladder",
    "Line",
    "LineAlignment",
    "Match",
    "Profile",
    "SheetAlignment",
    "SheetGrid",
    "Tier2Answer",
    "Transition",
    "Verdict",
    "VersionDiff",
    "align_lines",
    "align_sheet",
    "build_ladder",
    "classify",
    "compare_tieouts",
    "deck_delta",
    "declared_version",
    "delta_of",
    "delta_report",
    "describe",
    "diff_paths",
    "diff_raw",
    "eligible_pair",
    "gate_violations",
    "keyed_findings",
    "profile_by_declaration",
    "profile_of",
    "read_raw",
    "sheet_grids",
    "step",
    "structural_changes",
    "unchanged_report",
    "unusual",
]
