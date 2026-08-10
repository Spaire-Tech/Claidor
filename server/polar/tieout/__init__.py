"""Reconciling a deliverable against the model behind it.

The chain a bank actually cares about runs source document → model →
deliverable, and the place it breaks is the last link: a model is revised
and the deck that quotes it is not. Nobody notices until a buyer does.

This package holds the deck end of that chain. Give it a `.pptx` and the
`.xlsx` behind it and it says which printed figures no longer agree with
the cells they came from, and — much harder — stays silent about the ones
that do.

    from polar.tieout.check import tie_out

    result = tie_out("pitchbook.pptx", "model.xlsx")
    for drift in result.drifts:
        print(drift.slide, drift.printed, "should be", drift.expected)

`result.checked` is the number that makes the silence mean something. A
run that reconciled nothing reports no drifts either.

Two passes run and merge. One reconciles against the figures the model
*publishes* — an Outputs tab, if it has one — which is narrow, confident,
and named by a human. The other reconciles against every cell in the
workbook, named from the row and column labels beside it. The second is
what makes the product work on a model that was not built for it, and on
Cascade it is also what found six wrong figures in the deck supplied as
the clean reference.
"""

from .check import Drift, TieOut, tie_out, tie_out_against
from .deck import read_deck
from .figures import Figure
from .link import Link, Unlinked, link
from .model import Output, OutputsMissing, read_outputs
from .provenance import BadReference, chain, outputs_from_workbook, verify_outputs
from .workbook import Cell, Workbook, read_workbook

__all__ = [
    "BadReference",
    "Cell",
    "Drift",
    "Figure",
    "Link",
    "Output",
    "OutputsMissing",
    "TieOut",
    "Unlinked",
    "Workbook",
    "chain",
    "link",
    "outputs_from_workbook",
    "read_deck",
    "read_outputs",
    "read_workbook",
    "tie_out",
    "tie_out_against",
    "verify_outputs",
]
