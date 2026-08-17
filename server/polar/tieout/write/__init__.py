"""Writing a correction back into the document that printed it.

Everything else in :mod:`polar.tieout` *finds* things. This package is the
other half: « slide 3 says $49.6mm and the model says $48.9mm » becomes
slide 3 saying $48.9mm, in the file, reversibly.

**The rule the whole package is built on: refuse rather than approximate.**
Every writer here checks that the characters it is about to replace are the
characters the reader recorded, and raises :class:`CannotWrite` when they
are not. A search-and-replace that lands on the second `$48.9mm` on the
slide, or on a number inside a sentence it was never asked about, is worse
than a button that says it could not do it — the banker sends the deck.

Three files, three different problems, and they are not variations of one:

**A deck** has no revision model. `.pptx` never had `w:ins` / `w:del` and
PowerPoint's own Compare stores nothing; see `docs/pierce/writing-pptx.md`.
So a correction is written as the value itself, and reversibility lives in
the database — which holds both sides of every change already. The file
stays a file PowerPoint has always understood, which is worth more than a
revision mark: a banker sends it out and it opens on a machine that has
never heard of us.

**A memo** does have one, and it is the convention the reader of a memo
expects. So a memo correction is a tracked change — `w:del` around the old
figure, `w:ins` carrying the new one — through
:func:`polar.redline.ooxml.replace_tracked`, which the redline engine
already uses for the same purpose in a different product.

**A model gets exactly one kind of write: the fix.** A cell somebody typed
over a calculated row gets the row's own formula back — the formula the
audit derived from the cell's neighbours, not a number anybody chose. The
old refusal (« whoever owns the model owns the number ») was right about
numbers and wrong about this: restoring the row's formula is not choosing
a number, it is undoing the choosing of one. The write is surgical, and
the corrected copy is re-read and compared **cell by cell** against the
original — one cell changed, exactly as asked, or the write is refused
whole. See :mod:`.workbook`.
"""

from .deck import write_deck
from .edit import CannotWrite, Edit, replacement_for
from .memo import write_memo
from .workbook import write_workbook

__all__ = [
    "CannotWrite",
    "Edit",
    "replacement_for",
    "write_deck",
    "write_memo",
    "write_workbook",
]
