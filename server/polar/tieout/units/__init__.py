"""Unit inference — one component, two tracks (E1/E2, and B5's typing).

A spreadsheet's numbers carry units nobody wrote down in a form a
machine can read: `43.1` is £43.1 million in 2020/21 prices, `0.0523`
is 5.23% a year, `45961` is a date, `2033` is a year label. A human
modeller reads the row label, the column header, the number format
and the neighbourhood, and knows. This module does the same reading,
and — the part that matters — **abstains when the evidence does not
decide**.

Two tracks consume it and neither of them is a user:

- **B5** needs `kind` (continuous or categorical) to know what may be
  perturbed and what must be held. Round 1b measured what happens
  without it: hand-typing reached 10 of 193 cells on one model and
  is impossible on a model with 21,638 constants, so the rule sets
  were artifacts of the corner that moved.
- **Track E** needs currency, scale, period and rate-form, and E3's
  mismatch checks are armed only where this inference is measured
  accurate.

**This module reports nothing to anyone.** It is a library; only
Sentinel turns anything into a finding. That is the lane rule and it
is also the honest engineering: an inference this uncertain has no
business speaking to a banker directly.

Two things E1's hand pass forced into the design:

1. **Orientation is decided before typing.** A financial model sheet
   reads down the side and across the top; a data table reads the
   other way, and its rows are records — `Date | Maturity | rate` —
   with no single unit. Typing such a row would be a lie.
2. **A `Units` column, where a model has one, is the model telling
   you.** This module can read it (`declared=True`), and deliberately
   does not when it is being measured against it.
"""

from .inference import (
    Conflict,
    Dimension,
    Orientation,
    UnitLabel,
    classify_columns,
    classify_sheet,
    columns_from_cells,
    orientation,
    propagate,
    sheet_reading,
)

__all__ = [
    "Conflict",
    "Dimension",
    "Orientation",
    "UnitLabel",
    "classify_columns",
    "classify_sheet",
    "columns_from_cells",
    "orientation",
    "propagate",
    "sheet_reading",
]
