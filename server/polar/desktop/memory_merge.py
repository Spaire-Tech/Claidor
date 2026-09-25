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

A fourth rule, added 25 September 2026 for the Grok Bot reconstruction's
own layout (`desktop/source/host/extensions/memory/memory-service.ts`):

- **facts** (`agents/<id>/memory/profile.md`, `…/log/YYYY-MM.md`, the
  user-memory and project shards): a file of lines
  `- (YYYY-MM-DD) <fact>`. Two lines are the same fact when their ids
  match, and the id is the app's own `memoryIdFor`: sha1 of the content
  with whitespace collapsed, trimmed, cut at 500 characters and
  lowercased, first 16 hex digits. The date is not part of it, so a fact
  learned on two machines on two days is stored once. Our lines in
  order, then theirs that we do not have.

There is no database and no I/O here on purpose: every rule is a pure
function of two strings.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date
from enum import StrEnum

__all__ = [
    "DAILY_NOTE_NAME",
    "MEMORY_FILE_RULES",
    "MEMORY_NAME_MAX_LENGTH",
    "MemoryRule",
    "fact_id",
    "fingerprint",
    "is_accepted_memory_name",
    "merge_document",
    "merge_fact_file",
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


# --- the app's fact files ----------------------------------------------------

#: `FACT_LINE` in `memory-service.ts`: `- (YYYY-MM-DD) <fact>`.
_FACT_LINE = re.compile(r"^-\s+\((\d{4}-\d{2}-\d{2})\)\s+(.+?)\s*$")
#: `MEMORY_MAX_CONTENT_LENGTH` in `host/runner/sand-memory.ts`.
_FACT_MAX_CONTENT_LENGTH = 500


def fact_id(content: str) -> str:
    """The app's `memoryIdFor`: sha1 of `memoryDedupeKey(content)`, the
    first 16 hex digits. The key is `normalizeMemoryContent` (whitespace
    collapsed to one space, trimmed, cut at 500 characters) lowercased.
    Two machines that learn the same fact on different days agree on
    this id and disagree on the date, which is why the date is left out.
    """
    normalised = " ".join(content.split())[:_FACT_MAX_CONTENT_LENGTH].lower()
    return hashlib.sha1(normalised.encode("utf-8")).hexdigest()[:16]


def _fact_line_id(line: str) -> str | None:
    match = _FACT_LINE.match(line)
    if match is None:
        return None
    content = " ".join(match.group(2).split())
    return fact_id(content) if content else None


def merge_fact_file(ours: str, theirs: str) -> str:
    """The app's fact files: our lines in order, then every fact line of
    theirs whose id we do not have, appended after our last line that
    says something. Their header and blank lines are structure and are
    not copied; ours are kept as they are."""
    if not ours.strip():
        return theirs
    if not theirs.strip():
        return ours

    kept = ours.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    while kept and kept[-1].strip() == "":
        kept.pop()
    known = {
        identifier
        for identifier in (_fact_line_id(line) for line in kept)
        if identifier is not None
    }

    for line in theirs.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        identifier = _fact_line_id(line)
        if identifier is None or identifier in known:
            continue
        known.add(identifier)
        kept.append(line.rstrip())

    return "\n".join(kept) + "\n"


# --- which rule a file uses --------------------------------------------------


class MemoryRule(StrEnum):
    """The four ways a memory file merges."""

    LIST = "list"
    LINES = "lines"
    DOCUMENT = "document"
    FACTS = "facts"


#: The name a daily note takes, with its date spelled out. It is a
#: template, not a file: `rule_for` matches any real date in that shape.
DAILY_NOTE_NAME = "memory/YYYY-MM-DD.md"

#: The app's own layout under the sand root, as templates
#: (`memory-service.ts`: `getAgentMemoryDir`, `getUserMemoryShardDir`,
#: `getProjectMemoryShardDir`; `agent-state.ts` writes `project.md`).
AGENT_PROFILE_NAME = "agents/<agentId>/memory/profile.md"
AGENT_LOG_NAME = "agents/<agentId>/memory/log/YYYY-MM.md"
USER_SHARD_PROFILE_NAME = "user-memory/agents/<agentId>/profile.md"
USER_SHARD_LOG_NAME = "user-memory/agents/<agentId>/log/YYYY-MM.md"
PROJECT_SHARD_PROFILE_NAME = "projects/<slug>/memory/agents/<agentId>/profile.md"
PROJECT_SHARD_LOG_NAME = "projects/<slug>/memory/agents/<agentId>/log/YYYY-MM.md"
PROJECT_DOCUMENT_NAME = "projects/<slug>/project.md"

#: The longest name the wire takes (`MemorySyncFile.name`).
MEMORY_NAME_MAX_LENGTH = 200

#: Every accepted name, and the rule it merges by. Nothing else is
#: accepted, here or on the wire.
MEMORY_FILE_RULES: Mapping[str, MemoryRule] = {
    "MEMORY.md": MemoryRule.LIST,
    "USER.md": MemoryRule.DOCUMENT,
    DAILY_NOTE_NAME: MemoryRule.LINES,
    AGENT_PROFILE_NAME: MemoryRule.FACTS,
    AGENT_LOG_NAME: MemoryRule.FACTS,
    USER_SHARD_PROFILE_NAME: MemoryRule.FACTS,
    USER_SHARD_LOG_NAME: MemoryRule.FACTS,
    PROJECT_SHARD_PROFILE_NAME: MemoryRule.FACTS,
    PROJECT_SHARD_LOG_NAME: MemoryRule.FACTS,
    PROJECT_DOCUMENT_NAME: MemoryRule.DOCUMENT,
}

#: `\Z`, not `$`: `$` also matches just before a trailing newline, which
#: would let `"memory/2026-09-11.md\n"` through and become a path.
_DAILY_NOTE = re.compile(r"^memory/(\d{4})-(\d{2})-(\d{2})\.md\Z")

#: One folder name as the app makes them (`isSafeFolderId`, and the
#: agent ids and project slugs it hands out): no slash, no backslash, no
#: leading dot — so `.`, `..` and the `.dreaming/` metadata folder match
#: nothing. Kept to a character class the file system and a URL both
#: take, and short.
_FOLDER = r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}"
_MONTH = r"(\d{4})-(\d{2})"
_APP_NAMES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(rf"^agents/{_FOLDER}/memory/profile\.md\Z"), AGENT_PROFILE_NAME),
    (re.compile(rf"^agents/{_FOLDER}/memory/log/{_MONTH}\.md\Z"), AGENT_LOG_NAME),
    (
        re.compile(rf"^user-memory/agents/{_FOLDER}/profile\.md\Z"),
        USER_SHARD_PROFILE_NAME,
    ),
    (
        re.compile(rf"^user-memory/agents/{_FOLDER}/log/{_MONTH}\.md\Z"),
        USER_SHARD_LOG_NAME,
    ),
    (
        re.compile(rf"^projects/{_FOLDER}/memory/agents/{_FOLDER}/profile\.md\Z"),
        PROJECT_SHARD_PROFILE_NAME,
    ),
    (
        re.compile(rf"^projects/{_FOLDER}/memory/agents/{_FOLDER}/log/{_MONTH}\.md\Z"),
        PROJECT_SHARD_LOG_NAME,
    ),
    (re.compile(rf"^projects/{_FOLDER}/project\.md\Z"), PROJECT_DOCUMENT_NAME),
)


def _canonical(name: str) -> str | None:
    """The key of `MEMORY_FILE_RULES` a name stands for, or None.

    This is a security boundary: the name becomes a path inside a
    workspace on our servers and on every machine that syncs, so it is
    matched whole against a fixed list of shapes. A name carrying `..`,
    a leading slash, a backslash, a further path segment or a folder
    starting with a dot matches nothing and is refused.
    """
    if len(name) > MEMORY_NAME_MAX_LENGTH:
        return None
    if name in ("MEMORY.md", "USER.md"):
        return name
    match = _DAILY_NOTE.match(name)
    if match is not None:
        year, month, day = (int(part) for part in match.groups())
        try:
            date(year, month, day)
        except ValueError:
            return None
        return DAILY_NOTE_NAME
    for pattern, key in _APP_NAMES:
        match = pattern.match(name)
        if match is None:
            continue
        if match.groups():
            year, month = (int(part) for part in match.groups())
            try:
                date(year, month, 1)
            except ValueError:
                return None
        return key
    return None


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
    MemoryRule.FACTS: lambda ours, theirs, _: merge_fact_file(ours, theirs),
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
