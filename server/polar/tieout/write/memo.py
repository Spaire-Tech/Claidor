"""Writing a corrected figure into a `.docx`, as a tracked change.

Unlike a deck, a memo has a revision model, and it is the one its readers
already expect: legal and finance both review a memo in Word with track
changes on. So a correction here is not written as a fait accompli — it is
`w:del` around `$42.6m` and `w:ins` carrying `$41.9m`, which the next
person to open the file sees, and accepts or rejects in Word itself.

**None of the machinery for that is new.** :mod:`polar.redline.ooxml`
already splices tracked changes into a `.docx` without re-serialising it,
because the redline engine has the same requirement for a different reason,
and :mod:`polar.tieout.memo` already reads a memo through it. Using the
same reader on both sides is what makes an offset mean the same thing in
both: a figure found at characters 41–47 is edited at characters 41–47, and
there is no second implementation of « what does this document say » to
drift by a character and put every correction one word out.
"""

from collections.abc import Sequence
from datetime import datetime

from polar.redline.ooxml import PARAGRAPH_BREAK, Package, replace_tracked
from polar.redline.ooxml import CannotEdit as CannotSplice
from polar.redline.ooxml import Edit as Splice

from .edit import CannotWrite, Edit

#: Who Word shows as the author of the change. Not the banker who accepted
#: it: the correction was proposed by this product and a person let it
#: through, and a tracked change signed with their name would read as
#: something they typed.
AUTHOR = "Simeon"


def write_memo(
    payload: bytes,
    edits: Sequence[Edit],
    *,
    author: str = AUTHOR,
    when: datetime | None = None,
) -> bytes:
    """The memo, with every correction in it as a tracked change."""
    if not edits:
        return payload

    package = Package.open(payload)
    reading = package.read()
    #: Every paragraph of the document, in the same split the reader used,
    #: so that « paragraph 9 » means the same thing on both sides.
    paragraphs = reading.text.split(PARAGRAPH_BREAK)
    starts = _paragraph_starts(paragraphs)

    splices: list[Splice] = []
    for edit in edits:
        index = int(edit.anchor.get("paragraph", 0))
        if index >= len(paragraphs):
            raise CannotWrite(
                f"This memo no longer has a paragraph {index + 1}. Upload it "
                "again and re-run the check."
            )
        line = paragraphs[index]
        lead = len(line) - len(line.lstrip())
        start = starts[index] + lead + int(edit.anchor.get("start", 0))
        end = starts[index] + lead + int(edit.anchor.get("end", 0))

        found = reading.text[start:end]
        if found != edit.before:
            raise CannotWrite(
                f"Paragraph {index + 1} now reads « {found or 'nothing'} » "
                f"where « {edit.before} » was read. Somebody has edited the "
                "memo since. Upload it again and re-run the check."
            )
        splices.append(Splice(start=start, end=end, replacement=edit.after))

    try:
        package.document = replace_tracked(
            package.document,
            splices,
            author=author,
            when=(when or datetime.now()).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
    except CannotSplice as problem:
        # The splicer's own sentences are written for a person too, and it
        # knows things this does not — that two corrections overlap, or
        # that a span falls on a paragraph break.
        raise CannotWrite(str(problem)) from problem

    return package.save()


def _paragraph_starts(paragraphs: Sequence[str]) -> list[int]:
    """Where each paragraph begins in the document's own text."""
    starts: list[int] = []
    cursor = 0
    for line in paragraphs:
        starts.append(cursor)
        cursor += len(line) + len(PARAGRAPH_BREAK)
    return starts


__all__ = ["AUTHOR", "write_memo"]
