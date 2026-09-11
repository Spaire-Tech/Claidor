"""How two copies of one memory file become one.

The assistant's memory is a handful of small text files in its
workspace, and two sides write them: the app on the person's computer,
and later the cloud runner. Nobody locks anything, so Claidor merges,
and it is the only side that does — the app and the runner cannot
disagree about a merge they never perform (`docs/maties/cloud.md`,
section 3).

Three rules, one per kind of file:

- **a list** (`MEMORY.md`, the durable facts): keep every block the
  server has, in its order, then append the blocks the client has and
  the server does not. A block is a top-level markdown bullet with its
  continuation lines; everything else — headings, blank lines, fenced
  code, HTML comments — is structure, kept verbatim from the server's
  copy.
- **lines** (`memory/YYYY-MM-DD.md`, the daily notes): the same at line
  level. The server's lines in order, then the client's lines that are
  not there already.
- **a document** (`USER.md`, the profile): the newer text wins whole.
  It has one owner, the app.

Two blocks are the same fact when their fingerprints match: lowercased,
every character that is not a letter, a digit or whitespace turned into
a space, whitespace collapsed, trimmed. That is exactly what the app
does in `desktop/src/main/libs/openclawMemoryFile.ts`, so a fact
written on either side is recognised as the same fact. (The app hashes
the normalised text; comparing the normalised text itself answers the
same question.)

There is no database and no I/O here on purpose: every rule is a pure
function of two strings.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum

__all__ = [
    "DAILY_NOTE_NAME",
    "MEMORY_FILE_RULES",
    "MemoryRule",
    "fingerprint",
    "is_accepted_memory_name",
    "merge_document",
    "merge_line_file",
    "merge_list_file",
    "merge_memory_file",
    "rule_for",
]


# --- the fingerprint ---------------------------------------------------------


def fingerprint(text: str) -> str:
    """What makes two blocks the same fact.

    Lowercase, every character that is not a letter, a digit or
    whitespace becomes a space, whitespace collapses, ends trimmed.
    """
    lowered = text.lower()
    kept = "".join(
        character if (character.isalnum() or character.isspace()) else " "
        for character in lowered
    )
    return " ".join(kept.split())


# --- reading a list file -----------------------------------------------------

#: A top-level markdown bullet at column 0: `- text`.
_TOP_BULLET = re.compile(r"^-\s+\S")
#: Any bullet line, indented or not; the text after the marker.
_ANY_BULLET = re.compile(r"^\s*-\s+(.*)$")
#: A column-0 ATX heading.
_HEADING = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
#: A fenced-code delimiter.
_FENCE = re.compile(r"^\s*(```|~~~)")
#: A column-0 HTML comment opener (metadata markers).
_HTML_COMMENT_OPEN = re.compile(r"^<!--")


@dataclass
class _Segment:
    """A run of lines: either one memory block, or structure to keep."""

    kind: str  # "entry" or "verbatim"
    lines: list[str]
    #: The `##`-or-deeper heading in force, when there is one.
    section: str | None = None
    fingerprint: str = ""


@dataclass
class _Parser:
    """The app's own reading of a memory file, line by line.

    Mirrors `parseMemorySegments` in
    `desktop/src/main/libs/openclawMemoryFile.ts`, with one addition: a
    heading starts a segment of its own, so every segment sits under
    exactly one heading and a new block can be filed under the heading
    it came from.
    """

    segments: list[_Segment] = field(default_factory=list)
    _verbatim: list[str] = field(default_factory=list)
    _block: list[str] | None = None
    _section: str | None = None
    _block_section: str | None = None
    _fence: str | None = None
    _in_comment: bool = False

    def _flush_verbatim(self) -> None:
        if self._verbatim:
            self.segments.append(
                _Segment("verbatim", self._verbatim, section=self._section)
            )
            self._verbatim = []

    def _close_block(self) -> None:
        if self._block is not None:
            text = _block_text(self._block)
            self.segments.append(
                _Segment(
                    "entry",
                    self._block,
                    section=self._block_section,
                    fingerprint=fingerprint(text),
                )
            )
            self._block = None

    def _open_block(self, line: str) -> None:
        self._close_block()
        self._flush_verbatim()
        self._block_section = self._section
        self._block = [line]

    def feed(self, line: str) -> None:
        if self._fence == "block":
            assert self._block is not None
            self._block.append(line)
            if _FENCE.match(line):
                self._fence = None
            return
        if self._fence == "verbatim":
            self._verbatim.append(line)
            if _FENCE.match(line):
                self._fence = None
            return

        if self._in_comment:
            self._verbatim.append(line)
            if "-->" in line:
                self._in_comment = False
            return

        # A top-level HTML comment is a metadata marker, never a block.
        if _HTML_COMMENT_OPEN.match(line):
            self._close_block()
            self._verbatim.append(line)
            if "-->" not in line:
                self._in_comment = True
            return

        if _FENCE.match(line):
            # An indented fence inside an open block belongs to it; a
            # top-level fence is opaque structure.
            if self._block is not None and line[:1].isspace():
                self._block.append(line)
                self._fence = "block"
            else:
                self._close_block()
                self._verbatim.append(line)
                self._fence = "verbatim"
            return

        if line.strip() == "":
            self._close_block()
            self._verbatim.append(line)
            return

        heading = _HEADING.match(line)
        if heading is not None:
            self._close_block()
            self._flush_verbatim()
            self._section = (
                heading.group(2).strip() if len(heading.group(1)) >= 2 else None
            )
            self.segments.append(_Segment("verbatim", [line], section=self._section))
            return

        if _TOP_BULLET.match(line):
            self._open_block(line)
            return

        if self._block is not None:
            # Indented children and lazy continuations stay in the block.
            self._block.append(line)
            return

        # An orphan content line starts a prose block.
        self._open_block(line)

    def finish(self) -> list[_Segment]:
        self._close_block()
        self._flush_verbatim()
        return self.segments


def _block_text(lines: list[str]) -> str:
    """A block as the app displays it: the bullet marker off the first
    line, the rest untouched."""
    first, *rest = lines
    match = _ANY_BULLET.match(first)
    return "\n".join([match.group(1) if match else first, *rest])


def _parse(content: str) -> list[_Segment]:
    parser = _Parser()
    for line in content.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        parser.feed(line)
    return parser.finish()


def _serialise(segments: list[_Segment]) -> str:
    text = "\n".join(line for segment in segments for line in segment.lines)
    return text if text.endswith("\n") else f"{text}\n"


# --- the three rules ---------------------------------------------------------


def merge_list_file(ours: str, theirs: str) -> str:
    """The durable facts: a union of blocks, ours first.

    Every block the server has stays where it is, and so does every
    heading, blank line and fenced block around it. A block the client
    has and the server does not is appended under the heading it came
    from when the server's copy has that heading, and at the end when it
    does not.
    """
    if not ours.strip():
        return theirs
    if not theirs.strip():
        return ours

    segments = _parse(ours)
    known = {
        segment.fingerprint
        for segment in segments
        if segment.kind == "entry" and segment.fingerprint
    }

    for incoming in _parse(theirs):
        if incoming.kind != "entry" or not incoming.fingerprint:
            continue
        if incoming.fingerprint in known:
            continue
        known.add(incoming.fingerprint)
        _insert(segments, incoming)

    return _serialise(segments)


def _end_of_content(segments: list[_Segment]) -> int:
    """Where « at the end » is: after the last segment that says
    something, so a block lands under the text and not under the blank
    lines a file happens to end with."""
    at = len(segments)
    while at > 0 and all(line.strip() == "" for line in segments[at - 1].lines):
        at -= 1
    return at


def _insert(segments: list[_Segment], block: _Segment) -> None:
    """Put a new block under its heading, or at the end.

    Under the heading means after the last block already filed there, so
    the facts of a section stay one list; when the heading is there but
    holds nothing yet, right after the heading itself.
    """
    at = _end_of_content(segments)
    if block.section is not None:
        under = [
            index
            for index, segment in enumerate(segments)
            if segment.section == block.section
        ]
        entries = [index for index in under if segments[index].kind == "entry"]
        if entries:
            at = entries[-1] + 1
        elif under:
            at = under[0] + 1
        else:
            block.section = None

    previous = segments[at - 1] if at > 0 else None
    if (
        previous is not None
        and previous.kind != "entry"
        and previous.lines
        and previous.lines[-1].strip() != ""
    ):
        segments.insert(at, _Segment("verbatim", [""], section=block.section))
        at += 1
    segments.insert(at, block)


def merge_line_file(ours: str, theirs: str) -> str:
    """The daily notes: the server's lines, then the client's new ones.

    A line is already present when some line of the server's copy has
    the same text once trimmed. A blank line is never « already
    present »: blanks are kept as the server wrote them and the client's
    are dropped, so the same note appended on both sides keeps both
    lines and gains no empty ones.
    """
    if not ours.strip():
        return theirs
    if not theirs.strip():
        return ours

    kept = ours.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    while kept and kept[-1].strip() == "":
        kept.pop()
    known = {line.strip() for line in kept if line.strip()}

    for line in theirs.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        trimmed = line.strip()
        if not trimmed or trimmed in known:
            continue
        known.add(trimmed)
        kept.append(line)

    return "\n".join(kept) + "\n"


def merge_document(ours: str, theirs: str, ours_is_newer: bool) -> str:
    """A single document with one owner: the newer text wins whole."""
    return ours if ours_is_newer else theirs


# --- which rule a file uses --------------------------------------------------


class MemoryRule(StrEnum):
    """The three ways a memory file merges."""

    LIST = "list"
    LINES = "lines"
    DOCUMENT = "document"


#: The name a daily note takes, with its date spelled out. It is a
#: template, not a file: `rule_for` matches any real date in that shape.
DAILY_NOTE_NAME = "memory/YYYY-MM-DD.md"

#: Every accepted name, and the rule it merges by. Nothing else is
#: accepted, here or on the wire.
MEMORY_FILE_RULES: Mapping[str, MemoryRule] = {
    "MEMORY.md": MemoryRule.LIST,
    "USER.md": MemoryRule.DOCUMENT,
    DAILY_NOTE_NAME: MemoryRule.LINES,
}

#: `\Z`, not `$`: `$` also matches just before a trailing newline, which
#: would let `"memory/2026-09-11.md\n"` through and become a path.
_DAILY_NOTE = re.compile(r"^memory/(\d{4})-(\d{2})-(\d{2})\.md\Z")


def _canonical(name: str) -> str | None:
    """The key of `MEMORY_FILE_RULES` a name stands for, or None.

    This is a security boundary: the name becomes a path inside a
    workspace on our servers, so it is matched whole against a fixed
    list. A name carrying `..`, a leading slash, a backslash or a
    further path segment matches nothing and is refused.
    """
    if name in ("MEMORY.md", "USER.md"):
        return name
    match = _DAILY_NOTE.match(name)
    if match is None:
        return None
    year, month, day = (int(part) for part in match.groups())
    try:
        date(year, month, day)
    except ValueError:
        return None
    return DAILY_NOTE_NAME


def is_accepted_memory_name(name: str) -> bool:
    """Whether Claidor stores a file under this name at all."""
    return _canonical(name) is not None


def rule_for(name: str) -> MemoryRule | None:
    """The rule a name merges by, or None when the name is refused."""
    key = _canonical(name)
    return None if key is None else MEMORY_FILE_RULES[key]


_MERGERS: Mapping[MemoryRule, Callable[[str, str, bool], str]] = {
    MemoryRule.LIST: lambda ours, theirs, _: merge_list_file(ours, theirs),
    MemoryRule.LINES: lambda ours, theirs, _: merge_line_file(ours, theirs),
    MemoryRule.DOCUMENT: merge_document,
}


def merge_memory_file(
    name: str, ours: str, theirs: str, *, ours_is_newer: bool = True
) -> str:
    """Merge two copies of one named file by that file's rule.

    `ours` is what Claidor holds, `theirs` what the client sent. Raises
    `ValueError` for a name Claidor does not accept.
    """
    rule = rule_for(name)
    if rule is None:
        raise ValueError(f"{name!r} is not a memory file Claidor keeps.")
    return _MERGERS[rule](ours, theirs, ours_is_newer)
