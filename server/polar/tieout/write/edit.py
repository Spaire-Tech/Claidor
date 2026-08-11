"""One change, expressed in the coordinates the reader recorded.

An edit is deliberately dumb: a place, the characters expected to be
there, and the characters to put in their place. Everything that decides
*what* a correction should say happens before this — in
:func:`replacement_for` and in the proposal — so that a writer's only job
is to put a known string in a known place or refuse.
"""

from dataclasses import dataclass
from typing import Any


class CannotWrite(Exception):
    """The change cannot be written where it was supposed to go.

    Always carries a sentence a person can act on: which figure, where it
    was expected, and what is there instead. A writer raises this rather
    than writing something approximate, because a correction that lands in
    the wrong place is the one failure this product cannot recover from —
    the deck goes out with a number nobody chose.
    """


@dataclass(frozen=True)
class Edit:
    """Replace `before` with `after`, at the anchor the reader recorded."""

    #: Slide number for a deck; ignored by the memo writer, which has no
    #: pages and locates by paragraph.
    page: int
    #: `Figure.anchor` as stored: `kind`, `shape_id`, and whatever
    #: identifies a position in that kind of shape.
    anchor: dict[str, Any]
    #: What the document says now — checked before anything is written.
    before: str
    #: What it should say.
    after: str


def replacement_for(printed: str, expected: str) -> str:
    """The text to write, given what the deck printed and what the model says.

    Almost always just `expected`: the comparison already dresses the
    model's value the way the deck dressed its own, so `$48.9mm` replaces
    `$49.6mm` and the units, the prefix and the precision all match.

    **The exception is a parenthesised figure, and getting it wrong would
    invert a number.** A bridge prints « Less: total debt (96.4) », where
    the parentheses mean « subtracted here » rather than « this cell is
    negative » — so the comparison takes both sides in absolute value and
    the expected string comes back as `96.4`. Writing that over `(96.4)`
    would turn a subtraction into an addition on a slide that was only ever
    out by a rounding. The printed shape is the deck's convention and it
    survives the correction; only the digits change.
    """
    if printed.startswith("(") and printed.endswith(")"):
        if not (expected.startswith("(") and expected.endswith(")")):
            return f"({expected})"
    return expected


__all__ = ["CannotWrite", "Edit", "replacement_for"]
