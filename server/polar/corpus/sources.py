"""Reading acquired corpus files, identically on every machine.

The corpus is French, and every source file on disk is UTF-8. Reading one
with :meth:`pathlib.Path.read_text` asks the *platform* what encoding to
use, which is a question no corpus file has ever had an opinion about: a
container without a locale answers ASCII, and every accented character
silently becomes a replacement character.

That is not a cosmetic failure. It changed what the avis detector saw —
« séance » and « formation plénière » stopped matching, so four of the
CCJA's advisory opinions were read as ordinary judgments on the server and
as avis on a laptop, from byte-identical files. Same code, same input,
different answer, decided by an environment variable.

So corpus files are read as bytes and decoded here, explicitly. Nothing in
the corpus pipeline may depend on the locale it happens to run under.
"""

from pathlib import Path

#: Replacement is deliberate over failure: one unreadable byte in a
#: harvested page should cost that character, not the whole harvest. The
#: encoding, however, is never in question.
ENCODING = "utf-8"
ERRORS = "replace"


def read_corpus_text(path: Path) -> str:
    """The file's text, decoded as UTF-8 whatever the machine thinks."""
    return path.read_bytes().decode(ENCODING, errors=ERRORS)
