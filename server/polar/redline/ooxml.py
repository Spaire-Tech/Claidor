"""Reading a .docx without disturbing it.

A `.docx` is a zip of XML parts. The text is in `word/document.xml`, but
the styles are in `styles.xml`, the list numbering in `numbering.xml`,
cross-references are field codes and bookmarks, and tracked changes are
`w:ins` / `w:del` marks wrapped around runs. Anything that reads the
visible text and writes it back destroys everything it did not model, and
for a law firm that is not a bug — it is the end of the trial.

**Nothing here parses and re-serialises.** Feeding `document.xml` through
an XML library and writing it out again rewrites the whole file: stdlib
ElementTree renames every namespace prefix to `ns0`, and even a faithful
serialiser changes self-closing-tag style and attribute order. Word
tolerates most of that, but « most » is not a property to build a redline
engine on, and `mc:Ignorable` refers to prefixes *by name*.

So this scans the bytes, records offsets, and edits by splicing. Every
byte nobody touched stays byte-identical **by construction**, which is a
guarantee rather than a hope.

The other thing that has to be modelled is that **a phrase you can see in
Word does not exist as a contiguous string in the XML**. Word splits text
across runs at revision marks, spell-check boundaries and formatting
changes, so « Closing Date » is routinely `<w:t>Closing </w:t>` in one run
and `<w:t>Date</w:t>` in the next. Searching the raw XML for it finds
nothing. Everything here therefore works on a *sequence of runs* with a
map from document text back into them.
"""

import re
import zipfile
from dataclasses import dataclass
from io import BytesIO

DOCUMENT = "word/document.xml"

#: One run: `<w:r>` with optional properties and a text element. Captured
#: separately because a replacement has to keep the properties and swap
#: only the text.
_RUN = re.compile(
    rb"<w:r(?:\s[^>]*)?>(?P<body>.*?)</w:r>|<w:r(?:\s[^>]*)?/>",
    re.DOTALL,
)
_TEXT = re.compile(rb"<w:t(?P<attrs>(?:\s[^>]*)?)>(?P<text>.*?)</w:t>", re.DOTALL)
_PROPS = re.compile(rb"<w:rPr>.*?</w:rPr>|<w:rPr\s*/>", re.DOTALL)
#: The start of a paragraph, in both forms Word writes. A blank line is
#: `<w:p wp14:paraId="…" />` — self-closing, with no `</w:p>` anywhere —
#: so counting closing tags loses every empty paragraph and silently
#: welds two clauses together. A real Word file exposed this immediately.
#:
#: The lookahead is what keeps `<w:pPr>` out: it also begins with `<w:p`.
_PARAGRAPH_START = re.compile(rb"<w:p(?=[ />])")

#: XML entities that appear in Word's text. Word writes `&amp;` and
#: friends; everything else it leaves alone.
_UNESCAPE = ((b"&lt;", "<"), (b"&gt;", ">"), (b"&quot;", '"'), (b"&apos;", "'"))


class NotADocx(Exception):
    """The bytes are not a Word document we can read."""


def unescape(raw: bytes) -> str:
    """XML text as a reader sees it. `&amp;` last, or it double-decodes."""
    value = raw.decode("utf-8")
    for entity, character in _UNESCAPE:
        value = value.replace(entity.decode(), character)
    return value.replace("&amp;", "&")


def escape(value: str) -> bytes:
    """A string as Word's XML wants it. `&` first, for the same reason."""
    escaped = value.replace("&", "&amp;")
    escaped = escaped.replace("<", "&lt;").replace(">", "&gt;")
    return escaped.encode("utf-8")


@dataclass(frozen=True)
class Run:
    """One `<w:r>`, and where its pieces sit in the XML."""

    #: Byte span of the whole `<w:r>…</w:r>`.
    start: int
    end: int
    #: Byte span of the text *inside* `<w:t>`, or ``None`` for a run with
    #: no text at all — a break, a drawing, a field character.
    text_start: int | None
    text_end: int | None
    #: The `<w:rPr>…</w:rPr>` bytes, kept verbatim so a replacement can
    #: carry the same formatting.
    props: bytes
    #: What the run says, unescaped.
    text: str
    #: Index of the paragraph this run belongs to.
    paragraph: int


def scan_runs(xml: bytes) -> list[Run]:
    """Every run in the document, in order, with byte offsets."""
    paragraph_starts = [match.start() for match in _PARAGRAPH_START.finditer(xml)]
    runs: list[Run] = []

    for match in _RUN.finditer(xml):
        body = match.group("body")
        if body is None:  # `<w:r/>` — a run with nothing in it.
            body = b""
            text_start = text_end = None
            text = ""
        else:
            found = _TEXT.search(body)
            if found is None:
                text_start = text_end = None
                text = ""
            else:
                text_start = match.start("body") + found.start("text")
                text_end = match.start("body") + found.end("text")
                text = unescape(found.group("text"))

        props_match = _PROPS.search(body)
        props = props_match.group(0) if props_match else b""

        # Which paragraph this run is in: how many paragraphs opened
        # before it. Counting openings rather than closings is what makes
        # an empty self-closing paragraph count as the blank line it is.
        paragraph = sum(1 for start in paragraph_starts if start < match.start())

        runs.append(
            Run(
                start=match.start(),
                end=match.end(),
                text_start=text_start,
                text_end=text_end,
                props=props,
                text=text,
                paragraph=paragraph,
            )
        )
    return runs


@dataclass(frozen=True)
class Reading:
    """The document as text, with a way back into the XML.

    ``text`` is what a reader sees and what the checks are run against.
    ``offsets`` maps each character of it to the run that produced it, so a
    finding's span can be turned into a set of runs to edit.
    """

    text: str
    runs: list[Run]
    #: For each character in ``text``: (run index, offset within that run's
    #: own text). Paragraph breaks map to ``(-1, 0)``.
    offsets: list[tuple[int, int]]

    def runs_covering(self, start: int, end: int) -> list[int]:
        """Indices of the runs a text span touches, in order."""
        seen: list[int] = []
        for position in range(start, min(end, len(self.offsets))):
            index, _ = self.offsets[position]
            if index >= 0 and (not seen or seen[-1] != index):
                seen.append(index)
        return seen


#: What separates two paragraphs in the text we assemble. The same
#: character the add-in uses when it builds text from `body.paragraphs`,
#: so an offset means the same thing on both sides.
PARAGRAPH_BREAK = "\n"


def read(xml: bytes) -> Reading:
    """The document's text, and the map back to the runs it came from."""
    runs = scan_runs(xml)
    pieces: list[str] = []
    offsets: list[tuple[int, int]] = []
    previous_paragraph: int | None = None

    for index, run in enumerate(runs):
        if previous_paragraph is not None and run.paragraph != previous_paragraph:
            for _ in range(run.paragraph - previous_paragraph):
                pieces.append(PARAGRAPH_BREAK)
                offsets.append((-1, 0))
        previous_paragraph = run.paragraph

        for position, character in enumerate(run.text):
            pieces.append(character)
            offsets.append((index, position))

    return Reading(text="".join(pieces), runs=runs, offsets=offsets)


class Package:
    """A .docx, held as its parts so that untouched parts stay untouched.

    Every entry is kept as raw bytes in its original order with its
    original compression. Saving rebuilds the archive from those bytes, so
    a part nobody edited is byte-identical — not « equivalent », not
    « re-serialised the same way », identical.
    """

    __slots__ = ("_compression", "_names", "_parts")

    def __init__(
        self, parts: dict[str, bytes], names: list[str], compression: dict[str, int]
    ):
        self._parts = parts
        self._names = names
        self._compression = compression

    @classmethod
    def open(cls, payload: bytes) -> "Package":
        try:
            archive = zipfile.ZipFile(BytesIO(payload))
        except zipfile.BadZipFile as error:
            raise NotADocx("Not a zip archive; a .docx is a zip.") from error

        names = [info.filename for info in archive.infolist()]
        if DOCUMENT not in names:
            raise NotADocx(f"No {DOCUMENT}; this is not a Word document.")

        parts = {name: archive.read(name) for name in names}
        compression = {info.filename: info.compress_type for info in archive.infolist()}
        return cls(parts=parts, names=names, compression=compression)

    def save(self) -> bytes:
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            for name in self._names:
                archive.writestr(
                    name,
                    self._parts[name],
                    compress_type=self._compression.get(name, zipfile.ZIP_DEFLATED),
                )
        return buffer.getvalue()

    @property
    def names(self) -> list[str]:
        return list(self._names)

    def part(self, name: str) -> bytes:
        return self._parts[name]

    @property
    def document(self) -> bytes:
        return self._parts[DOCUMENT]

    @document.setter
    def document(self, value: bytes) -> None:
        self._parts[DOCUMENT] = value

    def read(self) -> Reading:
        """The document's text, with the map back into its runs."""
        return read(self.document)


#: Word requires every revision to carry an id, an author and a date.
#: The id only has to be unique within the document.
REVISION_AUTHOR = "Simeon"


def _revision_attrs(revision: int, author: str, when: str) -> bytes:
    return (
        f'w:id="{revision}" w:author="{escape(author).decode()}" w:date="{when}"'
    ).encode()


def _run_xml(props: bytes, text: str, *, deleted: bool = False) -> bytes:
    """One run carrying ``text``, with ``props`` verbatim.

    Inside a deletion the text element is ``w:delText``, not ``w:t`` — get
    that wrong and Word shows the deleted words as if they were still
    there. ``xml:space="preserve"`` matters because a replacement often
    begins or ends with a space.
    """
    tag = b"w:delText" if deleted else b"w:t"
    return (
        b"<w:r>"
        + props
        + b"<"
        + tag
        + b' xml:space="preserve">'
        + escape(text)
        + b"</"
        + tag
        + b">"
        + b"</w:r>"
    )


@dataclass(frozen=True)
class Edit:
    """One replacement, expressed in document-text offsets."""

    start: int
    end: int
    replacement: str


class CannotEdit(Exception):
    """The span cannot be edited safely, so nothing is written."""


def replace_tracked(
    xml: bytes,
    edits: list[Edit],
    *,
    author: str = REVISION_AUTHOR,
    when: str = "2026-01-01T00:00:00Z",
    first_revision: int = 900_000,
) -> bytes:
    """Apply replacements as tracked changes, splicing the bytes.

    Each edit becomes a `<w:del>` around the original runs and a `<w:ins>`
    carrying the new text with the first original run's formatting. Runs
    only partly covered are split, so replacing three words in the middle
    of a sentence leaves the rest of that run alone.

    Edits are applied last-first so that every offset stays valid while
    the earlier ones are still pending.

    Raises :class:`CannotEdit` rather than writing something approximate.
    A redline that silently lands in the wrong place is worse than one
    that refuses.
    """
    if not edits:
        return xml

    reading = read(xml)
    ordered = sorted(edits, key=lambda edit: edit.start)
    for earlier, later in zip(ordered, ordered[1:], strict=False):
        if later.start < earlier.end:
            raise CannotEdit("Two edits overlap; that cannot be tracked coherently.")

    result = xml
    revision = first_revision

    for edit in reversed(ordered):
        if edit.start < 0 or edit.end > len(reading.text) or edit.start >= edit.end:
            raise CannotEdit(f"Span {edit.start}:{edit.end} is not in the document.")

        covered = reading.runs_covering(edit.start, edit.end)
        if not covered:
            raise CannotEdit(
                f"Span {edit.start}:{edit.end} covers no text — it may be a "
                f"paragraph break."
            )

        first = reading.runs[covered[0]]
        last = reading.runs[covered[-1]]

        # How much of the first and last runs sits outside the edit and
        # has to survive untouched.
        _, offset_in_first = reading.offsets[edit.start]
        _, offset_in_last = reading.offsets[edit.end - 1]
        head = first.text[:offset_in_first]
        tail = last.text[offset_in_last + 1 :]

        removed = "".join(reading.runs[index].text for index in covered)
        removed = removed[len(head) : len(removed) - len(tail) or None]

        pieces: list[bytes] = []
        if head:
            pieces.append(_run_xml(first.props, head))
        attrs = _revision_attrs(revision, author, when)
        revision += 1
        if removed:
            pieces.append(
                b"<w:del "
                + attrs
                + b">"
                + _run_xml(first.props, removed, deleted=True)
                + b"</w:del>"
            )
        if edit.replacement:
            attrs = _revision_attrs(revision, author, when)
            revision += 1
            pieces.append(
                b"<w:ins "
                + attrs
                + b">"
                + _run_xml(first.props, edit.replacement)
                + b"</w:ins>"
            )
        if tail:
            pieces.append(_run_xml(last.props, tail))

        result = result[: first.start] + b"".join(pieces) + result[last.end :]

    return result
