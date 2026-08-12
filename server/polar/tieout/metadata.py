"""What a file carries that nobody meant to send.

Every other check in this package needs context: a model to compare the
deck against, a thread to read, a corpus to have measured. This one needs
nothing. It is a pure function from the bytes of an Office file to a list
of things in it that are not on the screen — which makes it the only piece
here a stranger can judge cold, on a file we have never seen, in thirty
seconds.

**The premise is that an Office file is a zip of XML, and the screen shows
a fraction of it.** A deck is what the slides draw; the file is that plus
the notes under it, plus whatever was dragged into the grey margin, plus
the whole of every photograph that was cropped to a corner, plus a
worksheet embedded behind a chart, plus the path the last person saved it
to. None of that is visible while you check the deck, and all of it
travels when you attach it.

The incidents this comes from are specific and dull:

- Notes under a slide reading « don't show them the downside case ».
- A shape parked off the canvas holding the previous week's numbers,
  because it was faster to drag it aside than to delete it.
- A photograph cropped to a headshot that still holds the full original
  frame, recoverable by dragging the crop handle back.
- A tab set to *very hidden*, which Excel's own right-click menu will not
  unhide and which most people therefore believe is gone.
- `xl/externalLinks/` — a link to another workbook stores the **full path
  it was linked from**, which is how `\\\\fs01\\Projects\\Falcon\\...`
  ends up inside a file sent to a different client. It also caches the
  values it last read from that workbook, so the numbers travel too.

**Nothing here is a judgement.** Each rule reports a fact about the file
that can be checked by opening it, and says where. Whether the notes are
sensitive is the sender's call; whether there are notes is not.

**Two grades, never added together.** A `leak` is content in the file that
the recipient can read and the sender did not put on the page. A `trace`
is identifying or process metadata — who, when, how many revisions, which
template. Both are worth knowing and they are not the same problem, and a
single number covering both would be worth nothing.

**Only OOXML, and it says so.** Every rule below reads the zip-of-XML
package that `.docx`, `.xlsx` and `.pptx` are. A legacy `.doc`, `.xls` or
`.ppt` is an OLE compound file with a different and larger set of leaks —
fast-save leaves whole deleted paragraphs in the stream — and none of
these rules apply to it. It is refused with a sentence saying so, because
a report that quietly covers less than it appears to is worse than no
report.
"""

import re
import zipfile
from dataclasses import dataclass, field
from io import BytesIO
from typing import Any

from lxml import etree

#: The OOXML namespaces this reads. Named rather than inlined because
#: every one of them appears in several checks and a typo in a namespace
#: produces silence, which is the failure mode this module exists to
#: object to.
NS = {
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "ep": "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
    "cust": "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties",
    "vt": "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
}

#: A `.docx` is a zip; a `.doc` is an OLE compound file, and so is an
#: OOXML file that has been encrypted with a password. Both start with
#: this, and telling the two apart matters because the advice differs.
OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

#: Refuse a package larger than this once decompressed. A real deal file
#: is tens of megabytes; a zip bomb is a few kilobytes that becomes a few
#: gigabytes, and this reads whatever it is handed.
MOST_BYTES = 400 * 1024 * 1024

#: Refuse a package with more parts than this. Same reason.
MOST_PARTS = 20_000

#: How many findings one rule may list before it stops naming them
#: individually. A deck with two hundred notes slides is one fact, not two
#: hundred, and the count is reported either way — never silently.
MOST_PER_RULE = 40

#: How much of a leaked string is quoted back. Enough to recognise, not
#: enough to reproduce the document in a report that gets emailed around.
EVIDENCE = 240

#: A crop this small is a rounding artefact from a drag, not a crop.
#: Expressed in the units OOXML uses for `a:srcRect`: thousandths of a
#: percent, so 1000 is one per cent.
CROP_FLOOR = 1000

#: A path that names a place rather than a website. UNC shares and drive
#: letters are the ones that carry a folder structure — and a folder
#: structure is how a client's name leaves the building.
LOCAL_PATH = re.compile(r"^(?:file:///|\\\\|[A-Za-z]:[\\/])")

#: One Microsoft sensitivity label, written as eight separate properties
#: sharing a GUID: `MSIP_Label_<guid>_Name`, `_SiteId`, `_SetDate` and so
#: on. The GUID is the label; the suffix is the field.
MSIP_LABEL = re.compile(r"^MSIP_Label_([0-9a-fA-F-]{36})_(\w+)$")

#: Fields whose run text is generated by PowerPoint rather than typed:
#: every notes slide carries a slide-number placeholder, and a notes slide
#: holding only that is an empty notes slide.
GENERATED_FIELD = f"{{{NS['a']}}}fld"


class NotAnOfficeFile(Exception):
    """The bytes are not an OOXML package, and the message says why."""


@dataclass(frozen=True)
class Finding:
    """One thing in the file that is not on the screen."""

    #: The check that fired, so a firm can count by kind or switch one off.
    rule: str
    #: `leak` — content the recipient can read that the sender did not put
    #: on the page. `trace` — identifying or process metadata. Never added.
    severity: str
    #: Where a person would look to see it for themselves: « slide 7 »,
    #: « sheet “Workings” », « docProps/core.xml ». A finding that cannot
    #: be checked by hand is a claim, and this product does not make those.
    where: str
    #: One sentence, in the words a reader would use.
    detail: str
    #: The thing itself, quoted and truncated. Empty where there is no
    #: text to quote — an off-canvas rectangle is a fact about geometry.
    evidence: str = ""


@dataclass
class Report:
    """Everything found, and what the file turned out to be."""

    #: `word`, `excel`, `powerpoint`, or `office` when the package is a
    #: valid OOXML zip of a kind this does not have specific rules for.
    kind: str = "office"
    findings: list[Finding] = field(default_factory=list)
    #: How many parts the package holds. Reported because « nothing found »
    #: on a file with four parts and « nothing found » on one with six
    #: hundred are different statements.
    parts: int = 0

    @property
    def leaks(self) -> list[Finding]:
        return [one for one in self.findings if one.severity == "leak"]

    @property
    def traces(self) -> list[Finding]:
        return [one for one in self.findings if one.severity == "trace"]


def read_metadata(path: str) -> Report:
    """Everything an Office file carries that is not on its screen."""
    with open(path, "rb") as handle:
        return read_metadata_bytes(handle.read())


def read_metadata_bytes(payload: bytes) -> Report:
    package = _open(payload)
    report = Report(parts=len(package.names))
    report.kind = package.kind

    # **Order is part of the report.** What is on a slide that should not
    # be — the notes, the hidden slide, the shape parked in the margin —
    # is what a person needs first, and a report that opens with thirty
    # lines about `docProps` has already lost them. The format's own rules
    # run first; the ones every file shares come after.
    if package.kind == "word":
        _tracked_changes(package, report)
        _word_comments(package, report)
        _hidden_text(package, report)
    elif package.kind == "excel":
        _hidden_sheets(package, report)
        _external_workbooks(package, report)
        _cell_comments(package, report)
    elif package.kind == "powerpoint":
        _speaker_notes(package, report)
        _off_canvas(package, report)
        _hidden_slides(package, report)
        _slide_comments(package, report)

    _cropped_images(package, report)
    _embedded(package, report)
    _external_targets(package, report)
    _macros(package, report)
    _properties(package, report)
    _custom_properties(package, report)
    _custom_xml(package, report)

    return report


# --------------------------------------------------------------------------
# The package


@dataclass
class Package:
    """An opened OOXML zip, read once and asked many questions."""

    zip: zipfile.ZipFile
    names: list[str]
    kind: str

    def xml(self, name: str) -> Any:
        """One part parsed, or `None` if it is absent or unparseable.

        A malformed part is not a reason to refuse the file: Office itself
        repairs those, and the other forty parts still hold facts. It is a
        reason not to guess what the part said.
        """
        try:
            data = self.zip.read(name)
        except (KeyError, zipfile.BadZipFile, OSError):
            return None
        try:
            return etree.fromstring(data, parser=_PARSER)
        except etree.XMLSyntaxError:
            return None

    def matching(self, pattern: re.Pattern[str]) -> list[str]:
        return [one for one in self.names if pattern.match(one)]

    def size(self, name: str) -> int:
        try:
            return self.zip.getinfo(name).file_size
        except KeyError:
            return 0

    def rels_for(self, part: str) -> dict[str, tuple[str, str]]:
        """`{r:id: (Target, TargetMode)}` for a part's relationships.

        Relationships are where a file keeps the things it points at, and
        an external target is a path — which is the whole of the
        `xl/externalLinks/` leak and half of the others.
        """
        folder, _, leaf = part.rpartition("/")
        rels = f"{folder}/_rels/{leaf}.rels" if folder else f"_rels/{leaf}.rels"
        root = self.xml(rels)
        if root is None:
            return {}
        found: dict[str, tuple[str, str]] = {}
        for one in root.findall(f"{{{NS['pr']}}}Relationship"):
            found[one.get("Id", "")] = (
                one.get("Target", ""),
                one.get("TargetMode", "Internal"),
            )
        return found


def _which_ole(payload: bytes) -> str:
    """A legacy document and an encrypted one look identical from outside.

    Both are OLE compound files. Which one it is decides the advice — save
    a copy in the new format, or open it with the password first — and
    guessing means telling somebody their file is obsolete when it is
    locked. The compound file says which: an encrypted OOXML package is a
    single `EncryptedPackage` stream and nothing else.
    """
    import olefile

    try:
        with olefile.OleFileIO(BytesIO(payload)) as compound:
            encrypted = compound.exists("EncryptedPackage")
    except Exception:
        encrypted = False
    if encrypted:
        return (
            "this file is password protected. Open it with the password and "
            "save an unprotected copy, then upload that"
        )
    return (
        "this is a legacy Office file — .doc, .xls or .ppt. Open it and "
        "save it as .docx, .xlsx or .pptx, then upload that"
    )


#: Entities off, network off. These bytes arrive from a customer, and an
#: XML parser that resolves entities is a file-read primitive.
_PARSER = etree.XMLParser(
    resolve_entities=False, no_network=True, huge_tree=False, recover=False
)


def _open(payload: bytes) -> Package:
    if payload[:8] == OLE_MAGIC:
        raise NotAnOfficeFile(_which_ole(payload))
    try:
        archive = zipfile.ZipFile(BytesIO(payload))
    except zipfile.BadZipFile as problem:
        raise NotAnOfficeFile(
            f"this is not an Office file this can read ({problem})"
        ) from problem

    entries = archive.infolist()
    if len(entries) > MOST_PARTS:
        raise NotAnOfficeFile(
            f"this file holds {len(entries):,} parts, which is more than an "
            "Office document has. It has not been read"
        )
    if sum(one.file_size for one in entries) > MOST_BYTES:
        raise NotAnOfficeFile(
            "this file expands to more than this can safely read. It has not been read"
        )

    names = [one.filename for one in entries]
    if "[Content_Types].xml" not in names:
        raise NotAnOfficeFile(
            "this is a zip file but not an Office document — it has no "
            "content types part"
        )

    if "word/document.xml" in names:
        kind = "word"
    elif "xl/workbook.xml" in names:
        kind = "excel"
    elif "ppt/presentation.xml" in names:
        kind = "powerpoint"
    else:
        kind = "office"
    return Package(zip=archive, names=names, kind=kind)


# --------------------------------------------------------------------------
# Helpers


def _quote(text: str) -> str:
    flat = re.sub(r"\s+", " ", text).strip()
    return flat if len(flat) <= EVIDENCE else f"{flat[:EVIDENCE].rstrip()}…"


def _add(
    report: Report,
    rule: str,
    severity: str,
    entries: list[tuple[str, str, str]],
) -> None:
    """Add findings for one rule, capping the list but never the count.

    A deck with two hundred notes slides is one fact. Listing all two
    hundred buries everything else in the report; listing forty and
    stopping is the same silent truncation this package spent a day
    removing from the formula reader. So it lists forty and says how many
    it did not list.
    """
    for where, detail, evidence in entries[:MOST_PER_RULE]:
        report.findings.append(
            Finding(
                rule=rule,
                severity=severity,
                where=where,
                detail=detail,
                evidence=evidence,
            )
        )
    remainder = len(entries) - MOST_PER_RULE
    if remainder > 0:
        report.findings.append(
            Finding(
                rule=rule,
                severity=severity,
                where="the rest of the file",
                detail=(
                    f"and {remainder:,} more of the same, not listed "
                    f"individually — {len(entries):,} in total"
                ),
            )
        )


def _text_of(node: Any, tag: str, *, skip_fields: bool = False) -> str:
    """Every run of text under a node, in document order."""
    pieces: list[str] = []
    for run in node.iter(tag):
        if skip_fields:
            parent = run.getparent()
            if parent is not None and parent.tag == GENERATED_FIELD:
                continue
        if run.text:
            pieces.append(run.text)
    return " ".join(pieces)


def _pixels(payload: bytes) -> tuple[int, int] | None:
    """A bitmap's dimensions from its header, without decoding it.

    Only PNG and JPEG, which is what a deck contains. The point of the
    number is to say how much of a photograph is still in the file behind
    a crop, and « 4,032 × 3,024 » says it in a way « 2.1 MB » does not.
    """
    if payload[:8] == b"\x89PNG\r\n\x1a\n" and payload[12:16] == b"IHDR":
        return (
            int.from_bytes(payload[16:20], "big"),
            int.from_bytes(payload[20:24], "big"),
        )
    if payload[:2] == b"\xff\xd8":
        at = 2
        while at + 9 < len(payload):
            if payload[at] != 0xFF:
                at += 1
                continue
            marker = payload[at + 1]
            # Start-of-frame markers carry the dimensions. The four
            # excluded are not frames: DHT, JPG, DAC and the restarts.
            if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                return (
                    int.from_bytes(payload[at + 7 : at + 9], "big"),
                    int.from_bytes(payload[at + 5 : at + 7], "big"),
                )
            length = int.from_bytes(payload[at + 2 : at + 4], "big")
            if length < 2:
                return None
            at += 2 + length
    return None


def _resolve(base: str, target: str) -> str:
    """A relationship target, relative to the part that declared it."""
    if target.startswith("/"):
        return target.lstrip("/")
    folder = base.rpartition("/")[0]
    parts: list[str] = []
    for piece in f"{folder}/{target}".split("/"):
        if piece in ("", "."):
            continue
        if piece == "..":
            if parts:
                parts.pop()
            continue
        parts.append(piece)
    return "/".join(parts)


# --------------------------------------------------------------------------
# Rules that apply to every format


#: What `docProps/core.xml` holds that names a person or an occasion, and
#: what to call each one to somebody who has never opened the XML.
CORE_FIELDS = [
    (f"{{{NS['dc']}}}creator", "the author recorded in the file"),
    (f"{{{NS['cp']}}}lastModifiedBy", "the last person to save it"),
    (f"{{{NS['dc']}}}title", "the title recorded in the file"),
    (f"{{{NS['dc']}}}subject", "the subject recorded in the file"),
    (f"{{{NS['cp']}}}keywords", "keywords recorded in the file"),
    (f"{{{NS['dc']}}}description", "a comment recorded in the file"),
    (f"{{{NS['cp']}}}category", "the category recorded in the file"),
    (f"{{{NS['cp']}}}contentStatus", "the content status recorded in the file"),
]

APP_FIELDS = [
    (f"{{{NS['ep']}}}Company", "the company recorded in the file"),
    (f"{{{NS['ep']}}}Manager", "the manager recorded in the file"),
    (f"{{{NS['ep']}}}Template", "the template it was built from"),
]


def _properties(package: Package, report: Report) -> None:
    """Who made it, who touched it last, and what it was built from."""
    entries: list[tuple[str, str, str]] = []

    core = package.xml("docProps/core.xml")
    if core is not None:
        for tag, said in CORE_FIELDS:
            node = core.find(tag)
            if node is not None and (node.text or "").strip():
                entries.append(("docProps/core.xml", said, _quote(node.text or "")))
        revision = core.find(f"{{{NS['cp']}}}revision")
        if revision is not None and (revision.text or "").strip():
            entries.append(
                (
                    "docProps/core.xml",
                    "how many times it has been saved",
                    _quote(revision.text or ""),
                )
            )

    app = package.xml("docProps/app.xml")
    if app is not None:
        for tag, said in APP_FIELDS:
            node = app.find(tag)
            if node is not None and (node.text or "").strip():
                entries.append(("docProps/app.xml", said, _quote(node.text or "")))
        minutes = app.find(f"{{{NS['ep']}}}TotalTime")
        if minutes is not None and (minutes.text or "").strip("0 "):
            entries.append(
                (
                    "docProps/app.xml",
                    "how long it has been open and edited, in minutes",
                    _quote(minutes.text or ""),
                )
            )

    _add(report, "document-properties", "trace", entries)


def _custom_properties(package: Package, report: Report) -> None:
    """Fields a document management system wrote into the file.

    iManage, NetDocuments and SharePoint all stamp their own columns here,
    and a column is a client name or a matter number often enough to be
    worth reading every time.

    **Graded a trace, and the grading was measured rather than reasoned
    to.** On 83 public Office files, 55 of them carried custom properties
    and 309 properties were found — `ContentTypeId` 48 times, `Order`,
    `SharedWithUsers`, `_dlc_DocIdItemGuid`. Graded a leak, those swamp
    the leaks that are actually content: the notes, the hidden slides, the
    folder paths. The cost is real and is stated here rather than hidden —
    a matter number naming another client is graded the same as a
    `ContentTypeId`, and the only thing separating them is reading them.
    Every one is reported; none is ranked above a speaker note.

    **A sensitivity label is one fact and Microsoft writes it as eight.**
    `MSIP_Label_<guid>_Name`, `_SetDate`, `_SiteId`, `_ActionId` and four
    more are one action by one person, so they are folded into one finding
    that keeps the name and the site.
    """
    root = package.xml("docProps/custom.xml")
    if root is None:
        return
    entries: list[tuple[str, str, str]] = []
    labels: dict[str, dict[str, str]] = {}
    for prop in root.findall(f"{{{NS['cust']}}}property"):
        name = prop.get("name", "")
        value = " ".join(one.text or "" for one in prop).strip()
        if not value:
            continue
        label = MSIP_LABEL.match(name)
        if label:
            labels.setdefault(label.group(1), {})[label.group(2)] = value
            continue
        entries.append(
            (
                "docProps/custom.xml",
                f"a custom property named « {name} », usually written by a "
                "document management system",
                _quote(value),
            )
        )
    for guid, fields in labels.items():
        entries.append(
            (
                "docProps/custom.xml",
                "a Microsoft sensitivity label applied to this file, which "
                "names the label and the tenant it was applied in",
                _quote(
                    ", ".join(
                        f"{key} {value}"
                        for key, value in fields.items()
                        if key in ("Name", "SiteId", "SetDate")
                    )
                    or guid
                ),
            )
        )
    _add(report, "custom-property", "trace", entries)


def _custom_xml(package: Package, report: Report) -> None:
    """Whole XML documents carried alongside, invisible in the editor."""
    parts = package.matching(re.compile(r"customXml/item\d*\.xml$"))
    entries = []
    for part in sorted(parts):
        root = package.xml(part)
        if root is None:
            continue
        # **The root element is the useful half of this finding.** These
        # parts are written by systems, not people, and their text is
        # often a schema rather than data — `contentTypeSchema` on an
        # Ofgem workbook is fourteen kilobytes of field definitions whose
        # words say nothing at all. What it *is* — a SharePoint content
        # type, a Boldon James classification record — is the fact.
        _, _, name = str(root.tag).rpartition("}")
        entries.append(
            (
                part,
                f"a « {name} » record stored inside this file and shown "
                "nowhere in it — usually written by a document management "
                "system or a classification tool",
                _quote(" ".join(root.itertext())),
            )
        )
    # A trace for the same reason as a custom property: this is how the
    # file was filed, not what is on its page. 54 of 83 public files carry
    # one, and grading them leaks buries the speaker notes.
    _add(report, "custom-xml", "trace", entries)


def _macros(package: Package, report: Report) -> None:
    parts = [one for one in package.names if one.endswith("vbaProject.bin")]
    _add(
        report,
        "macros",
        "leak",
        [
            (
                part,
                "this file contains VBA macro code, which travels with it "
                f"and is not visible on any page ({package.size(part):,} bytes)",
                "",
            )
            for part in sorted(parts)
        ],
    )


def _embedded(package: Package, report: Report) -> None:
    """Whole files carried inside this one.

    A chart pasted from Excel brings the worksheet it was built from —
    every row of it, including the rows the chart does not plot. So does
    an object dragged into a Word document. The recipient opens it by
    double-clicking the chart.

    **A chart's own worksheet is one finding for the whole file.** A
    survey deck in the corpus carries thirty-one of them, one per chart,
    and thirty-one lines saying the same sentence pushed its hidden slide
    and its speaker notes off the bottom of the report. « Every chart
    carries the worksheet it was built from » is the fact; which chart is
    not. Anything embedded that no chart points at was put there by a
    person, and keeps its own line.
    """
    charted: set[str] = set()
    for rels in package.matching(re.compile(r"\w+/charts/_rels/.*\.rels$")):
        owner = rels.replace("_rels/", "").removesuffix(".rels")
        for target, mode in package.rels_for(owner).values():
            if mode != "External" and "embeddings/" in target:
                charted.add(_resolve(owner, target))

    entries = []
    behind_charts = 0
    for part in sorted(package.matching(re.compile(r"(?:word|xl|ppt)/embeddings/"))):
        leaf = part.rpartition("/")[2]
        # A zip records the folder itself as an entry of zero bytes. It is
        # not a file anybody embedded, and reported as one it becomes
        # « «  » is a complete file embedded in this one (0 bytes) », which
        # is the sort of finding that teaches a reader to skim.
        if not leaf:
            continue
        if part in charted:
            behind_charts += 1
            continue
        entries.append(
            (
                part,
                f"« {leaf} » is a complete file embedded in this one "
                f"({package.size(part):,} bytes) — a recipient can open it "
                "and read everything in it, not only the part shown here",
                "",
            )
        )
    if behind_charts:
        entries.insert(
            0,
            (
                "behind the charts",
                (
                    f"{behind_charts} charts in this file each carry the "
                    "worksheet they were built from"
                    if behind_charts > 1
                    else "a chart in this file carries the worksheet it was "
                    "built from"
                )
                + " — every row of it, including the rows the chart does not "
                "plot. A recipient reads them by double-clicking a chart",
                "",
            ),
        )
    _add(report, "embedded-file", "leak", entries)


def _external_targets(package: Package, report: Report) -> None:
    """Relationships pointing at a place on somebody's disk or network.

    A hyperlink to a website is a hyperlink. A relationship whose target
    is `\\\\fs01\\Projects\\...` or `C:\\Users\\...` is a folder structure,
    and a folder structure names the deals and the clients that sit beside
    this one.
    """
    entries: list[tuple[str, str, str]] = []
    for rels in sorted(package.matching(re.compile(r".*_rels/.*\.rels$"))):
        # A link to another workbook is the same path said twice — once
        # here and once by `external-workbook`, which also knows the
        # numbers came with it. Two findings, one fact, and the weaker
        # sentence is the one to drop.
        if rels.startswith("xl/externalLinks/"):
            continue
        root = package.xml(rels)
        if root is None:
            continue
        owner = rels.replace("_rels/", "").removesuffix(".rels")
        for one in root.findall(f"{{{NS['pr']}}}Relationship"):
            target = one.get("Target", "")
            if one.get("TargetMode") != "External" or not LOCAL_PATH.match(target):
                continue
            entries.append(
                (
                    owner,
                    "this file points at a location on a disk or a network "
                    "share, and the link carries the whole folder path",
                    _quote(target),
                )
            )
    _add(report, "local-path", "leak", entries)


def _cropped_images(package: Package, report: Report) -> None:
    """Pictures cropped on the page and whole in the file.

    A crop in Office is a viewport, not an edit: `a:srcRect` says which
    part of the picture to draw and the picture part still holds all of
    it. Dragging the crop handle outward brings back what was hidden, and
    so does unzipping the file.

    **A negative `srcRect` side is not a crop.** It scales the picture
    *out* beyond its frame — padding, not hiding — and Office writes one
    whenever a picture is nudged inside a placeholder. Measured on 29
    public decks, reading « any side set » as « cropped » produced findings
    reading *« cropped to 100% of itself »*, which is a sentence about
    nothing. The fraction actually hidden is what decides it.

    **The same picture cropped the same way is one finding.** A logo
    cropped in a slide layout appears in every layout that inherits it —
    six identical findings on one deck, all about one image — so findings
    are folded by the image part and the crop, and the count is said.
    """
    #: `(image part, hidden fraction) → (first place seen, other places)`
    folded: dict[tuple[str, int], tuple[str, list[str]]] = {}
    drawings = [
        one
        for one in package.names
        if one.endswith(".xml")
        and (
            one.startswith("ppt/slides/slide")
            or one.startswith("word/document")
            or one.startswith("xl/drawings/")
            or one.startswith("ppt/slideMasters/")
            or one.startswith("ppt/slideLayouts/")
        )
    ]
    for part in sorted(drawings):
        root = package.xml(part)
        if root is None:
            continue
        rels = package.rels_for(part)
        for rect in root.iter(f"{{{NS['a']}}}srcRect"):
            try:
                sides = {
                    side: int(rect.get(side, "0") or 0) for side in ("l", "t", "r", "b")
                }
            except ValueError:
                continue
            # Negative sides scale the picture out of its frame; they hide
            # nothing, and clamping is what makes « 100% shown » impossible
            # to report as a crop.
            across = max(0, sides["l"]) + max(0, sides["r"])
            down = max(0, sides["t"]) + max(0, sides["b"])
            if across + down < CROP_FLOOR:
                continue
            shown = (100_000 - across) * (100_000 - down) / 100_000 / 1000
            fill = rect.getparent()
            blip = None if fill is None else fill.find(f"{{{NS['a']}}}blip")
            embed = None if blip is None else blip.get(f"{{{NS['r']}}}embed")
            target = rels.get(embed or "", ("", ""))[0]
            image = _resolve(part, target) if target else ""
            key = (image, round(shown))
            if key in folded:
                folded[key][1].append(_place_of(part))
                continue
            folded[key] = (_place_of(part), [])

    entries: list[tuple[str, str, str]] = []
    for (image, shown_at), (place, elsewhere) in folded.items():
        size = package.size(image) if image else 0
        dimensions = ""
        if image:
            try:
                found = _pixels(package.zip.read(image)[:4096])
            except (KeyError, OSError):
                found = None
            if found:
                dimensions = f", {found[0]:,} × {found[1]:,} pixels in full"
        entries.append(
            (
                place,
                f"a picture is cropped to {shown_at}% of itself on the page, "
                "and the whole of it is still in the file — dragging the crop "
                "handle back shows what was hidden"
                f" ({image or 'image'}, {size:,} bytes{dimensions})"
                + (f", and in {len(elsewhere)} other places" if elsewhere else ""),
                "",
            )
        )
    _add(report, "cropped-image", "leak", entries)


def _place_of(part: str) -> str:
    """A part name said the way somebody looking at the file would say it."""
    slide = re.match(r"ppt/slides/slide(\d+)\.xml$", part)
    if slide:
        return f"slide {slide.group(1)}"
    if part.startswith("word/document"):
        return "the document"
    return part


# --------------------------------------------------------------------------
# Word


#: The revision marks. `w:ins` and `w:del` are inserted and deleted text;
#: the `*Change` elements are formatting and property edits, which a
#: reader never sees and which carry an author's name just the same.
REVISIONS = [
    (f"{{{NS['w']}}}ins", "inserted text"),
    (f"{{{NS['w']}}}del", "deleted text"),
    (f"{{{NS['w']}}}moveFrom", "text moved from here"),
    (f"{{{NS['w']}}}moveTo", "text moved to here"),
    (f"{{{NS['w']}}}rPrChange", "a formatting change"),
    (f"{{{NS['w']}}}pPrChange", "a paragraph change"),
    (f"{{{NS['w']}}}tblPrChange", "a table change"),
    (f"{{{NS['w']}}}sectPrChange", "a section change"),
]


def _tracked_changes(package: Package, report: Report) -> None:
    """Edits still marked up, and the names of everyone who made them.

    **Deleted text is still in the file.** `w:del` holds the words that
    were removed in `w:delText`, so a paragraph struck out before sending
    is a paragraph the recipient can read by turning off « show markup ».
    """
    root = package.xml("word/document.xml")
    if root is None:
        return
    authors: dict[str, int] = {}
    kinds: dict[str, int] = {}
    deleted: list[str] = []
    for tag, said in REVISIONS:
        for node in root.iter(tag):
            kinds[said] = kinds.get(said, 0) + 1
            who = node.get(f"{{{NS['w']}}}author", "").strip()
            if who:
                authors[who] = authors.get(who, 0) + 1
            if tag.endswith("}del"):
                text = _text_of(node, f"{{{NS['w']}}}delText")
                if text.strip():
                    deleted.append(text)
    if not kinds:
        return

    total = sum(kinds.values())
    named = ", ".join(f"« {who} » ({count})" for who, count in sorted(authors.items()))
    _add(
        report,
        "tracked-changes",
        "leak",
        [
            (
                "the document",
                f"{total:,} tracked changes are still in this document "
                + (
                    f"({', '.join(f'{count:,} {said}' for said, count in kinds.items())})"
                )
                + (f", by {named}" if named else ""),
                "",
            )
        ]
        + [
            (
                "the document",
                "text deleted with track changes on is still in the file "
                "and a recipient can read it",
                _quote(one),
            )
            for one in deleted
        ],
    )


def _word_comments(package: Package, report: Report) -> None:
    entries: list[tuple[str, str, str]] = []
    root = package.xml("word/comments.xml")
    if root is not None:
        for node in root.findall(f"{{{NS['w']}}}comment"):
            who = node.get(f"{{{NS['w']}}}author", "").strip() or "someone"
            when = node.get(f"{{{NS['w']}}}date", "")
            text = _text_of(node, f"{{{NS['w']}}}t")
            entries.append(
                (
                    "the document",
                    f"a comment by « {who} »" + (f", {when}" if when else ""),
                    _quote(text),
                )
            )
    _add(report, "comment", "leak", entries)


def _hidden_text(package: Package, report: Report) -> None:
    """Text formatted as hidden — present, printable, and not on screen."""
    root = package.xml("word/document.xml")
    if root is None:
        return
    entries: list[tuple[str, str, str]] = []
    for run in root.iter(f"{{{NS['w']}}}r"):
        props = run.find(f"{{{NS['w']}}}rPr")
        if props is None:
            continue
        vanish = props.find(f"{{{NS['w']}}}vanish")
        if vanish is None or vanish.get(f"{{{NS['w']}}}val") in ("0", "false"):
            continue
        text = _text_of(run, f"{{{NS['w']}}}t")
        if text.strip():
            entries.append(
                (
                    "the document",
                    "text formatted as hidden — it is in the file and shows "
                    "when hidden text is turned on",
                    _quote(text),
                )
            )
    _add(report, "hidden-text", "leak", entries)


# --------------------------------------------------------------------------
# Excel


def _sheets_of(package: Package) -> list[tuple[str, str, str]]:
    """`(name, state, part)` for every sheet, in workbook order."""
    root = package.xml("xl/workbook.xml")
    if root is None:
        return []
    rels = package.rels_for("xl/workbook.xml")
    found: list[tuple[str, str, str]] = []
    for sheet in root.iter(f"{{{NS['s']}}}sheet"):
        rid = sheet.get(f"{{{NS['r']}}}id", "")
        target = rels.get(rid, ("", ""))[0]
        found.append(
            (
                sheet.get("name", ""),
                sheet.get("state", "visible"),
                _resolve("xl/workbook.xml", target) if target else "",
            )
        )
    return found


def _hidden_sheets(package: Package, report: Report) -> None:
    """Tabs that are not there when you look at the tab strip.

    `hidden` and `veryHidden` are different findings and are reported
    separately. A hidden sheet is one right-click away from visible, so
    everybody knows it is there. A **very hidden** sheet does not appear
    in Excel's unhide list at all — it can only be revealed from the VBA
    editor — which means it is routinely believed to be deleted.
    """
    hidden: list[tuple[str, str, str]] = []
    very: list[tuple[str, str, str]] = []
    for name, state, _ in _sheets_of(package):
        if state == "hidden":
            hidden.append(
                (
                    f"sheet « {name} »",
                    "this sheet is hidden — it is in the workbook and a "
                    "recipient can unhide it by right-clicking a tab",
                    "",
                )
            )
        elif state == "veryHidden":
            very.append(
                (
                    f"sheet « {name} »",
                    "this sheet is **very hidden** — it does not appear in "
                    "Excel's unhide list, so it is easy to believe it was "
                    "deleted. It was not, and anyone can reveal it",
                    "",
                )
            )
    _add(report, "very-hidden-sheet", "leak", very)
    _add(report, "hidden-sheet", "trace", hidden)


def _external_workbooks(package: Package, report: Report) -> None:
    """Links to other workbooks: the path, and the numbers they last read.

    Two findings from one place, and the second is the one people do not
    know about. `xl/externalLinks/externalLinkN.xml` caches the **values**
    the link last returned, so a workbook linked to a model on a different
    deal carries that model's numbers even when the recipient cannot reach
    the file itself and the cells all show `#REF!`.
    """
    paths: list[tuple[str, str, str]] = []
    cached: list[tuple[str, str, str]] = []
    for part in sorted(package.matching(re.compile(r"xl/externalLinks/\w+\.xml$"))):
        for target, mode in package.rels_for(part).values():
            if mode == "External" and target:
                paths.append(
                    (
                        part,
                        "this workbook links to another workbook, and the "
                        "link stores the whole path it was linked from",
                        _quote(target),
                    )
                )
        root = package.xml(part)
        if root is None:
            continue
        values = [
            one.text or ""
            for one in root.iter(f"{{{NS['s']}}}v")
            if (one.text or "").strip()
        ]
        if values:
            cached.append(
                (
                    part,
                    f"{len(values):,} values read from that other workbook "
                    "are cached inside this one — they travel with the file "
                    "whether or not the recipient can reach the original",
                    _quote(", ".join(values[:12])),
                )
            )
    _add(report, "external-workbook", "leak", paths)
    _add(report, "external-cached-values", "leak", cached)


def _cell_comments(package: Package, report: Report) -> None:
    """Notes attached to cells, and the names on them."""
    where: dict[str, str] = {}
    for name, _, part in _sheets_of(package):
        if not part:
            continue
        for target, _mode in package.rels_for(part).values():
            resolved = _resolve(part, target)
            if "comments" in resolved:
                where[resolved] = name

    entries: list[tuple[str, str, str]] = []
    pattern = re.compile(r"xl/(?:threadedComments/)?\w*[Cc]omments\d*\.xml$")
    for part in sorted(package.matching(pattern)):
        root = package.xml(part)
        if root is None:
            continue
        sheet = where.get(part, "")
        place = f"sheet « {sheet} »" if sheet else part
        for node in root.iter(f"{{{NS['s']}}}comment"):
            text = _text_of(node, f"{{{NS['s']}}}t")
            if not text.strip():
                continue
            entries.append(
                (
                    f"{place}, cell {node.get('ref', '')}".rstrip(", "),
                    "a note attached to a cell",
                    _quote(text),
                )
            )
    _add(report, "cell-comment", "leak", entries)


# --------------------------------------------------------------------------
# PowerPoint


def _slide_of(package: Package, notes: str) -> str:
    """Which slide a notes page belongs to, by its own relationship."""
    for target, _mode in package.rels_for(notes).values():
        resolved = _resolve(notes, target)
        found = re.match(r"ppt/slides/slide(\d+)\.xml$", resolved)
        if found:
            return f"slide {found.group(1)}"
    return notes


def _speaker_notes(package: Package, report: Report) -> None:
    """The notes under the slides.

    Every slide in a deck built from a template has a notes page whether
    or not anybody typed in it, and every notes page carries a slide
    number placeholder. So the text is read with generated fields left
    out, and a notes page with nothing else in it is not reported — which
    is the difference between « this deck has notes » and « this deck has
    forty-one notes pages », only one of which is true of most decks.
    """
    entries: list[tuple[str, str, str]] = []
    for part in sorted(
        package.matching(re.compile(r"ppt/notesSlides/notesSlide\d+\.xml$")),
        key=lambda one: int(re.findall(r"\d+", one)[-1]),
    ):
        root = package.xml(part)
        if root is None:
            continue
        text = _text_of(root, f"{{{NS['a']}}}t", skip_fields=True)
        if not text.strip():
            continue
        entries.append(
            (
                _slide_of(package, part),
                "there are speaker notes under this slide — they are in the "
                "file and a recipient can read them",
                _quote(text),
            )
        )
    _add(report, "speaker-notes", "leak", entries)


#: The shapes that sit directly on a slide and carry their own position.
SHAPES = [f"{{{NS['p']}}}{one}" for one in ("sp", "pic", "graphicFrame", "grpSp")]


def _canvas(package: Package) -> tuple[int, int] | None:
    root = package.xml("ppt/presentation.xml")
    if root is None:
        return None
    size = root.find(f"{{{NS['p']}}}sldSz")
    if size is None:
        return None
    try:
        return int(size.get("cx", "0")), int(size.get("cy", "0"))
    except ValueError:
        return None


def _off_canvas(package: Package, report: Report) -> None:
    """Shapes parked in the grey margin beside the slide.

    Not a rendering bug — a habit. Dragging last week's chart off the side
    is faster than deleting it, and it stays in the file, and it prints
    nowhere, and it is still there when the deck goes out.

    **Only a shape with no overlap at all with the slide is reported.** A
    logo bleeding over the edge is a design decision and there are several
    on every professionally-built deck; a shape whose box does not touch
    the canvas is not a design decision. A shape with no `a:xfrm` of its
    own inherits its position from a layout and cannot be judged here, so
    it is left alone rather than guessed at.

    **And only a shape that carries something.** Measured on 29 public
    decks: the three off-canvas shapes found were all empty text boxes
    left beside the slide by a Google Slides export — off the canvas,
    correctly identified, and holding nothing at all. The finding is that
    content is parked beside the page. An empty box is not content, and
    reporting it is how a rule earns the reputation that stops it being
    read. A picture, a table, a chart or a group is content whether or not
    it has words in it; a plain shape has to have some.
    """
    canvas = _canvas(package)
    if canvas is None:
        return
    width, height = canvas
    entries: list[tuple[str, str, str]] = []
    for part in sorted(
        package.matching(re.compile(r"ppt/slides/slide\d+\.xml$")),
        key=lambda one: int(re.findall(r"\d+", one)[-1]),
    ):
        root = package.xml(part)
        if root is None:
            continue
        tree = root.find(f".//{{{NS['p']}}}spTree")
        if tree is None:
            continue
        for shape in tree:
            if shape.tag not in SHAPES:
                continue
            frame = shape.find(f".//{{{NS['a']}}}xfrm")
            if frame is None:
                continue
            off = frame.find(f"{{{NS['a']}}}off")
            ext = frame.find(f"{{{NS['a']}}}ext")
            if off is None or ext is None:
                continue
            try:
                x, y = int(off.get("x", "0")), int(off.get("y", "0"))
                cx, cy = int(ext.get("cx", "0")), int(ext.get("cy", "0"))
            except ValueError:
                continue
            if cx <= 0 or cy <= 0:
                continue
            if not (x + cx <= 0 or x >= width or y + cy <= 0 or y >= height):
                continue
            text = _text_of(shape, f"{{{NS['a']}}}t", skip_fields=True)
            if not text.strip() and shape.tag == f"{{{NS['p']}}}sp":
                continue
            side = (
                "to the left of"
                if x + cx <= 0
                else "to the right of"
                if x >= width
                else "above"
                if y + cy <= 0
                else "below"
            )
            entries.append(
                (
                    _place_of(part),
                    f"a shape sits entirely {side} the slide, off the canvas "
                    "— it is in the file, it does not print, and it is not "
                    "visible unless you scroll the editor",
                    _quote(text),
                )
            )
    _add(report, "off-canvas-shape", "leak", entries)


def _hidden_slides(package: Package, report: Report) -> None:
    """Slides set not to show. Still in the file, still readable."""
    entries: list[tuple[str, str, str]] = []
    for part in sorted(
        package.matching(re.compile(r"ppt/slides/slide\d+\.xml$")),
        key=lambda one: int(re.findall(r"\d+", one)[-1]),
    ):
        root = package.xml(part)
        if root is None or root.get("show") not in ("0", "false"):
            continue
        entries.append(
            (
                _place_of(part),
                "this slide is hidden — it does not show when the deck is "
                "presented, and it is in the file the recipient opens",
                _quote(_text_of(root, f"{{{NS['a']}}}t", skip_fields=True)),
            )
        )
    _add(report, "hidden-slide", "leak", entries)


def _slide_comments(package: Package, report: Report) -> None:
    """Comments on slides, modern and legacy, and who left them."""
    authors: dict[str, str] = {}
    people = package.xml("ppt/authors.xml")
    if people is not None:
        for one in people:
            authors[one.get("id", "")] = one.get("name", "")

    entries: list[tuple[str, str, str]] = []
    #: Legacy comments are `ppt/comments/comment1.xml`; the modern
    #: threaded ones are `ppt/comments/modernComment_<guid>.xml`. Both
    #: live in the one folder, and both use a `cm` element.
    pattern = re.compile(r"ppt/comments/.*\.xml$")
    for part in sorted(package.matching(pattern)):
        root = package.xml(part)
        if root is None:
            continue
        for node in root.iter():
            if not str(node.tag).endswith("}cm"):
                continue
            who = (
                authors.get(node.get("authorId", ""), "")
                or node.get("authorId", "")
                or "someone"
            )
            text = " ".join(
                one.text or ""
                for one in node.iter()
                if str(one.tag).endswith("}text") or str(one.tag).endswith("}t")
            )
            entries.append(
                (part, f"a comment by « {who} »", _quote(text)),
            )
    _add(report, "comment", "leak", entries)


__all__ = [
    "Finding",
    "NotAnOfficeFile",
    "Report",
    "read_metadata",
    "read_metadata_bytes",
]
