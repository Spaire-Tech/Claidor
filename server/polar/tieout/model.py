"""The model's Outputs tab: the interface the deck is checked against.

A banker's model has five tabs and two hundred formulas, and almost none
of it appears in the deck. What appears is a couple of dozen figures, and
a well-built model names them in one place — an Outputs tab, one row per
figure, each with the cell it comes from and the basis it is presented on.

Reconciling against the Outputs tab rather than against the whole workbook
is not a shortcut, it is the correct scope. A deck figure that matches
some cell somewhere in a 200-formula model has matched nothing; there is
always a cell that happens to hold 48.9. What makes a figure right is that
it agrees with *the cell it came from*, and the Outputs tab is where a
model says which cell that is.

**Basis is why this tab exists.** FY2025A reported EBITDA is $41.2mm and
FY2025A adjusted EBITDA is $48.9mm. Both are correct, both appear in the
deck, and a checker without the basis column has no way to know that
comparing one against the other is meaningless rather than a finding.

Models that have no Outputs tab are the common case in the wild, and
handling them is a separate problem — inferring the interface instead of
reading it. That is not this module.
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from openpyxl import load_workbook

#: The sheet a model is expected to publish its deck figures on.
OUTPUTS_SHEET = "Outputs"

#: The header row's columns, in the order they must appear.
COLUMNS = ("Ref", "Figure", "Value", "Source", "Basis")


class OutputsMissing(Exception):
    """The workbook has no Outputs tab, or none this module can read."""


@dataclass(frozen=True)
class Output:
    """One figure the model publishes for the deck to print."""

    #: The model's own name for it: « O5 ». Quoted in findings so a banker
    #: can go to the row rather than to the number.
    ref: str
    #: What the model calls it: « FY2025A adjusted EBITDA ». Linking to a
    #: deck label happens on these words.
    name: str
    #: Full precision, as the model holds it — 9.90401938065649, not 9.9.
    #: Rounding happens at comparison time, to the precision the *deck*
    #: chose, and never here.
    value: Decimal
    #: The cell behind it: « Model!D25 ». The end of the chain a finding
    #: has to be able to show.
    source: str
    #: « Reported », « Adjusted - see bridge », « Trading comps ». The
    #: false-positive guard: two figures on different bases are not in
    #: disagreement, they are answers to different questions.
    basis: str


def read_outputs(path: str) -> list[Output]:
    """Load the Outputs tab, or say why it could not be loaded.

    Values are read as computed, not as formulas, so the workbook must
    have been recalculated by something that writes cached values —
    openpyxl itself does not calculate.
    """
    workbook = load_workbook(path, data_only=True, read_only=True)
    try:
        if OUTPUTS_SHEET not in workbook.sheetnames:
            raise OutputsMissing(
                f"the workbook has no « {OUTPUTS_SHEET} » sheet; "
                f"it has {', '.join(workbook.sheetnames)}"
            )
        rows = [
            tuple(row) for row in workbook[OUTPUTS_SHEET].iter_rows(values_only=True)
        ]
    finally:
        workbook.close()

    header = _header_row(rows)
    if header is None:
        raise OutputsMissing(
            f"the « {OUTPUTS_SHEET} » sheet has no header row naming "
            f"{', '.join(COLUMNS)}"
        )

    outputs: list[Output] = []
    for row in rows[header + 1 :]:
        ref = _text(row, 0)
        name = _text(row, 1)
        value = _number(row, 2)
        if not ref or not name or value is None:
            continue
        outputs.append(
            Output(
                ref=ref,
                name=name,
                value=value,
                source=_text(row, 3),
                basis=_text(row, 4),
            )
        )
    return outputs


def _header_row(rows: list[tuple[Any, ...]]) -> int | None:
    """Where the table starts. A tab usually opens with a title and a note."""
    for index, row in enumerate(rows):
        cells = [str(cell).strip().lower() for cell in row if cell is not None]
        if all(column.lower() in cells for column in COLUMNS):
            return index
    return None


def _text(row: tuple[Any, ...], index: int) -> str:
    if index >= len(row) or row[index] is None:
        return ""
    return str(row[index]).strip()


def _number(row: tuple[Any, ...], index: int) -> Decimal | None:
    if index >= len(row) or row[index] is None:
        return None
    cell = row[index]
    if isinstance(cell, bool):
        return None
    if isinstance(cell, int | float):
        # Through `repr`, not `Decimal(float)`: 0.098 as a float is
        # 0.09799999999999999822..., and carrying those digits into a
        # comparison the deck makes to one decimal place is noise.
        return Decimal(repr(cell))
    if isinstance(cell, Decimal):
        return cell
    return None


__all__ = ["COLUMNS", "OUTPUTS_SHEET", "Output", "OutputsMissing", "read_outputs"]
