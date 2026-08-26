"""The recalculator (Track B) — Dynamo's lane.

Everything here treats the engine as a read-only library: cells come
in through the frozen reader surface (`read_workbook`, `Workbook.cells`,
`Cell`), and nothing in this package changes what the engine reports.

The pieces, in the order the plan names them:

- `pool` — the worker pool behind a `Calculator` interface (B1). The
  real UNO wiring is one adapter class when a machine with
  LibreOffice ≥ 25.8 and Calc exists; today only the fake exists, and
  no recalculation result is claimed anywhere.
- `denylist` — the prescan that routes files a free engine cannot
  honestly recalculate (LAMBDA, CUBE*, RTD, UDFs, external links) to
  the arbiter or a refusal in words (B2).
- `gate` — the fidelity gate's comparison rules: stored value against
  recalculated value, cell by cell, relative tolerance on plain
  chains, convergence-based tolerance inside iterative cycles (B2).
- `laws` — the behavioural laws (B4), registered before any result:
  zero-input, proportionality, scale invariance, consolidation.
"""

from .denylist import DenylistHit, Route, prescan
from .gate import CalcSettings, CellDiff, FileFidelity, gate_file, iterative_cells
from .pool import Calculator, CalculatorError, FakeCalculator, RecalcResult, WorkerPool
from .volatile import volatile_cone

__all__ = [
    "CalcSettings",
    "Calculator",
    "CalculatorError",
    "CellDiff",
    "DenylistHit",
    "FakeCalculator",
    "FileFidelity",
    "RecalcResult",
    "Route",
    "WorkerPool",
    "gate_file",
    "iterative_cells",
    "prescan",
    "volatile_cone",
]
