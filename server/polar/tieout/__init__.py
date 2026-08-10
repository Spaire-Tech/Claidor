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
"""

from .check import Drift, TieOut, tie_out
from .deck import read_deck
from .figures import Figure
from .link import Link, Unlinked, link
from .model import Output, OutputsMissing, read_outputs

__all__ = [
    "Drift",
    "Figure",
    "Link",
    "Output",
    "OutputsMissing",
    "TieOut",
    "Unlinked",
    "link",
    "read_deck",
    "read_outputs",
    "tie_out",
]
