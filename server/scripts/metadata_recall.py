"""How much does the metadata checker miss?

    uv run python -m scripts.document_corpus     # fetch, once
    uv run python -m scripts.metadata_recall

`metadata_survey.py` says what the checker *finds* in real files. It cannot
say what it misses, because nobody has labelled those files — and « I don't
know what it misses » is not a state to leave a check in.

**So the misses are manufactured.** One known leak is planted into a real
file that was silent about that rule before, the file is checked again, and
the answer is either « found it » or a miss with a name. This is the method
already used for the model audit, where 150 defects were planted into real
EUSES spreadsheets: a planted defect has ground truth by construction,
which is the whole point, and the surrounding file is still somebody else's
real work rather than a fixture built to be found.

**What this measures and what it does not.** It measures whether a rule
fires on the thing it is for, inside a real file, next to real content.
It does not measure whether real people leave leaks in the shapes planted
here — that is what `metadata_survey.py` is for, and between them the two
answer « does it fire » and « does it fire too often ».

**Two strengths of plant, and the report says which is which.** A plant
written by `python-pptx` or `openpyxl` produces the XML a real writer
produces, so finding it proves the rule reads what Office writes. A plant
written by hand produces the XML *I* believed Office writes, so finding it
proves only that the rule reads what I wrote. The second is weaker
evidence and is labelled `hand` in the output. Where a library could
express the plant, it was used.

**Collateral is counted too.** Planting one thing must not make a
different rule fire. A plant that produces a second finding is reported,
because a check that invents a neighbour every time it is right is not
right.
"""

import io
import re
import struct
import sys
import zipfile
import zlib
from collections.abc import Callable
from pathlib import Path

from polar.tieout.metadata import read_metadata_bytes

HERE = Path(__file__).parent / "corpus_documents"

#: How many files each rule is planted into. Enough that one strange file
#: does not decide a rule's number, small enough to run in a minute.
PER_RULE = 12

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
PR = "http://schemas.openxmlformats.org/package/2006/relationships"


# --------------------------------------------------------------------------
# Rewriting a package


def _repack(
    payload: bytes,
    *,
    add: dict[str, bytes] | None = None,
    edit: dict[str, Callable[[bytes], bytes]] | None = None,
) -> bytes:
    """The same package with parts added and parts rewritten.

    Everything untouched is copied byte for byte, so the file around the
    plant stays exactly the real file it was.
    """
    add, edit = add or {}, edit or {}
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(payload)) as source:
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as target:
            for item in source.infolist():
                data = source.read(item.filename)
                if item.filename in edit:
                    data = edit[item.filename](data)
                target.writestr(item.filename, data)
            for name, data in add.items():
                target.writestr(name, data)
    return buffer.getvalue()


def _png() -> bytes:
    """A valid one-pixel PNG, so a picture can be planted and cropped."""

    def chunk(kind: bytes, body: bytes) -> bytes:
        return (
            struct.pack(">I", len(body))
            + kind
            + body
            + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff"))
        + chunk(b"IEND", b"")
    )


# --------------------------------------------------------------------------
# The plants. Each returns a mutated package, or None if this file cannot
# host that plant — a deck with no pictures cannot host a cropped one.


def _plant_speaker_notes(payload: bytes) -> bytes | None:
    from pptx import Presentation

    deck = Presentation(io.BytesIO(payload))
    if not deck.slides:
        return None
    deck.slides[0].notes_slide.notes_text_frame.text = (
        "Do not show them the downside case until after the fee is agreed."
    )
    out = io.BytesIO()
    deck.save(out)
    return out.getvalue()


def _plant_off_canvas(payload: bytes) -> bytes | None:
    from pptx import Presentation

    deck = Presentation(io.BytesIO(payload))
    if not deck.slides:
        return None
    box = deck.slides[0].shapes.add_textbox(
        -deck.slide_width * 2, 0, deck.slide_width // 2, deck.slide_height // 6
    )
    box.text_frame.text = "last week's number: 4.1x — delete before sending"
    out = io.BytesIO()
    deck.save(out)
    return out.getvalue()


def _plant_cropped_image(payload: bytes) -> bytes | None:
    from pptx import Presentation

    deck = Presentation(io.BytesIO(payload))
    if not deck.slides:
        return None
    picture = deck.slides[0].shapes.add_picture(
        io.BytesIO(_png()), 0, 0, deck.slide_width // 4, deck.slide_height // 4
    )
    picture.crop_left = 0.3
    picture.crop_bottom = 0.2
    out = io.BytesIO()
    deck.save(out)
    return out.getvalue()


def _plant_hidden_slide(payload: bytes) -> bytes | None:
    names = zipfile.ZipFile(io.BytesIO(payload)).namelist()
    slide = next((one for one in names if re.match(r"ppt/slides/slide\d+\.xml$", one)), None)
    if slide is None:
        return None

    def hide(data: bytes) -> bytes:
        return re.sub(rb"<p:sld ([^>]*?)>", rb'<p:sld \1 show="0">', data, count=1)

    return _repack(payload, edit={slide: hide})


def _sheet_state(payload: bytes, state: str) -> bytes | None:
    """Set the last sheet's state, which is one attribute in one part."""
    book = zipfile.ZipFile(io.BytesIO(payload))
    if "xl/workbook.xml" not in book.namelist():
        return None
    data = book.read("xl/workbook.xml")
    sheets = re.findall(rb"<sheet [^>]*/>", data)
    if len(sheets) < 2:
        return None
    last = sheets[-1]
    if b"state=" in last:
        return None
    replaced = last.replace(b"<sheet ", b'<sheet state="' + state.encode() + b'" ', 1)
    return _repack(payload, edit={"xl/workbook.xml": lambda _: data.replace(last, replaced)})


def _plant_very_hidden(payload: bytes) -> bytes | None:
    return _sheet_state(payload, "veryHidden")


def _plant_hidden_sheet(payload: bytes) -> bytes | None:
    return _sheet_state(payload, "hidden")


EXTERNAL_LINK = (
    '<?xml version="1.0"?><externalLink xmlns="' + S + '"><externalBook>'
    "<sheetDataSet><sheetData><row><cell><v>228.9</v></cell>"
    "<cell><v>41.2</v></cell><cell><v>96.4</v></cell></row>"
    "</sheetData></sheetDataSet></externalBook></externalLink>"
).encode()

EXTERNAL_RELS = (
    '<?xml version="1.0"?><Relationships xmlns="' + PR + '">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/'
    'officeDocument/2006/relationships/externalLinkPath" '
    'Target="file:///\\\\fs01\\Projects\\Falcon\\Bid model v12.xlsx" '
    'TargetMode="External"/></Relationships>'
).encode()


def _plant_external_workbook(payload: bytes) -> bytes | None:
    if "xl/workbook.xml" not in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None
    return _repack(
        payload,
        add={
            "xl/externalLinks/externalLink1.xml": EXTERNAL_LINK,
            "xl/externalLinks/_rels/externalLink1.xml.rels": EXTERNAL_RELS,
        },
    )


def _plant_cell_comment(payload: bytes) -> bytes | None:
    if "xl/workbook.xml" not in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None
    return _repack(
        payload,
        add={
            "xl/comments99.xml": (
                '<?xml version="1.0"?><comments xmlns="' + S + '">'
                "<authors><author>A. Analyst</author></authors><commentList>"
                '<comment ref="B4" authorId="0"><text><t>this is the number '
                "the client disputed</t></text></comment></commentList>"
                "</comments>"
            ).encode()
        },
    )


def _plant_macros(payload: bytes) -> bytes | None:
    folder = _folder(payload)
    if folder is None:
        return None
    return _repack(payload, add={f"{folder}/vbaProject.bin": b"\xd0\xcf\x11\xe0" * 64})


def _plant_embedded_file(payload: bytes) -> bytes | None:
    folder = _folder(payload)
    if folder is None:
        return None
    return _repack(
        payload,
        add={f"{folder}/embeddings/Project Falcon working file.xlsx": b"PK\x03\x04junk"},
    )


def _folder(payload: bytes) -> str | None:
    names = zipfile.ZipFile(io.BytesIO(payload)).namelist()
    for folder, marker in (
        ("word", "word/document.xml"),
        ("xl", "xl/workbook.xml"),
        ("ppt", "ppt/presentation.xml"),
    ):
        if marker in names:
            return folder
    return None


def _plant_tracked_changes(payload: bytes) -> bytes | None:
    if "word/document.xml" not in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None

    def inject(data: bytes) -> bytes:
        revision = (
            b'<w:p><w:del w:id="9001" w:author="Jo Reviewer" '
            b'w:date="2026-08-12T09:00:00Z"><w:r><w:delText>the vendor will '
            b"accept 6.5x</w:delText></w:r></w:del></w:p>"
        )
        return data.replace(b"</w:body>", revision + b"</w:body>", 1)

    return _repack(payload, edit={"word/document.xml": inject})


def _plant_hidden_text(payload: bytes) -> bytes | None:
    if "word/document.xml" not in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None

    def inject(data: bytes) -> bytes:
        run = (
            b"<w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>internal only \xe2\x80\x94 "
            b"walk-away price is 4.2x</w:t></w:r></w:p>"
        )
        return data.replace(b"</w:body>", run + b"</w:body>", 1)

    return _repack(payload, edit={"word/document.xml": inject})


def _plant_comment(payload: bytes) -> bytes | None:
    names = zipfile.ZipFile(io.BytesIO(payload)).namelist()
    if "word/document.xml" not in names or "word/comments.xml" in names:
        return None
    return _repack(
        payload,
        add={
            "word/comments.xml": (
                f'<?xml version="1.0"?><w:comments xmlns:w="{W}">'
                f'<w:comment w:id="1" w:author="Jo Reviewer" '
                f'w:date="2026-08-12T09:00:00Z"><w:p><w:r><w:t>can we really '
                f"say this?</w:t></w:r></w:p></w:comment></w:comments>"
            ).encode()
        },
    )


def _plant_local_path(payload: bytes) -> bytes | None:
    folder = _folder(payload)
    if folder is None:
        return None
    owner = {
        "word": "word/_rels/document.xml.rels",
        "xl": "xl/_rels/workbook.xml.rels",
        "ppt": "ppt/_rels/presentation.xml.rels",
    }[folder]
    if owner not in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None

    def inject(data: bytes) -> bytes:
        rel = (
            b'<Relationship Id="rIdPlanted" Type="http://schemas.'
            b'openxmlformats.org/officeDocument/2006/relationships/hyperlink" '
            b'Target="\\\\fs01\\Projects\\Falcon\\Board pack.pptx" '
            b'TargetMode="External"/>'
        )
        return data.replace(b"</Relationships>", rel + b"</Relationships>", 1)

    return _repack(payload, edit={owner: inject})


def _plant_custom_property(payload: bytes) -> bytes | None:
    if "docProps/custom.xml" in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None
    return _repack(
        payload,
        add={
            "docProps/custom.xml": (
                b'<?xml version="1.0"?><Properties xmlns="http://schemas.'
                b'openxmlformats.org/officeDocument/2006/custom-properties" '
                b'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/'
                b'2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-'
                b'9397-08002B2CF9AE}" pid="2" name="Matter"><vt:lpwstr>'
                b"Falcon / Harbourline 2026</vt:lpwstr></property></Properties>"
            )
        },
    )


def _plant_custom_xml(payload: bytes) -> bytes | None:
    if any(
        one.startswith("customXml/")
        for one in zipfile.ZipFile(io.BytesIO(payload)).namelist()
    ):
        return None
    return _repack(
        payload,
        add={
            "customXml/item1.xml": (
                b'<?xml version="1.0"?><matter xmlns="urn:example:dms">'
                b"<client>Harbourline</client><code>FALCON-2026</code></matter>"
            )
        },
    )


def _plant_document_properties(payload: bytes) -> bytes | None:
    if "docProps/core.xml" in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None
    return _repack(
        payload,
        add={
            "docProps/core.xml": (
                b'<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://'
                b'schemas.openxmlformats.org/package/2006/metadata/core-'
                b'properties" xmlns:dc="http://purl.org/dc/elements/1.1/">'
                b"<dc:creator>A. Analyst</dc:creator><cp:lastModifiedBy>"
                b"MD, Coverage</cp:lastModifiedBy></cp:coreProperties>"
            )
        },
    )


# --------------------------------------------------------------------------
# Awkward plants
#
# A canonical plant is the shape I had in mind while writing the rule, so
# finding it proves very little — the first run of this harness returned
# 100% on 204 of them, which is a statement about my imagination rather
# than about the checker. These are the same leaks spelled the other
# legitimate ways: the attribute Office also accepts, the element nested
# where a real document nests it, the newer part that replaced the old one.
# This is where a recall number is actually earned.


def _plant_hidden_slide_false(payload: bytes) -> bytes | None:
    """`show="false"` — the other spelling of the same boolean."""
    names = zipfile.ZipFile(io.BytesIO(payload)).namelist()
    slide = next(
        (one for one in names if re.match(r"ppt/slides/slide\d+\.xml$", one)), None
    )
    if slide is None:
        return None

    def hide(data: bytes) -> bytes:
        return re.sub(rb"<p:sld ([^>]*?)>", rb'<p:sld \1 show="false">', data, count=1)

    return _repack(payload, edit={slide: hide})


def _plant_tracked_change_in_a_table(payload: bytes) -> bytes | None:
    """A deletion inside a table cell, which is where they actually live.

    A rule that walks paragraphs rather than the whole tree finds the one
    in the body and misses every one in a table — and a banker's document
    keeps its numbers in tables.
    """
    if "word/document.xml" not in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None

    def inject(data: bytes) -> bytes:
        cell = (
            b"<w:tbl><w:tr><w:tc><w:p>"
            b'<w:del w:id="9002" w:author="Deep In A Table" '
            b'w:date="2026-08-12T09:00:00Z"><w:r><w:delText>4.2x</w:delText>'
            b"</w:r></w:del></w:p></w:tc></w:tr></w:tbl>"
        )
        return data.replace(b"</w:body>", cell + b"</w:body>", 1)

    return _repack(payload, edit={"word/document.xml": inject})


def _plant_hidden_text_true(payload: bytes) -> bytes | None:
    """`<w:vanish w:val="true"/>` — hidden, said explicitly."""
    if "word/document.xml" not in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None

    def inject(data: bytes) -> bytes:
        run = (
            b'<w:p><w:r><w:rPr><w:vanish w:val="true"/></w:rPr>'
            b"<w:t>reserve price 3.8x</w:t></w:r></w:p>"
        )
        return data.replace(b"</w:body>", run + b"</w:body>", 1)

    return _repack(payload, edit={"word/document.xml": inject})


def _plant_threaded_comment(payload: bytes) -> bytes | None:
    """The comment Excel has written since 2018.

    A threaded comment is a different part in a different namespace from
    the note this rule was written against, and it is what a recent Excel
    produces when somebody clicks « New Comment ». If the rule only knows
    the old one it misses the one people actually make.
    """
    if "xl/workbook.xml" not in zipfile.ZipFile(io.BytesIO(payload)).namelist():
        return None
    return _repack(
        payload,
        add={
            "xl/threadedComments/threadedComment1.xml": (
                b'<?xml version="1.0"?><ThreadedComments xmlns="http://schemas.'
                b'microsoft.com/office/spreadsheetml/2018/threadedcomments">'
                b'<threadedComment ref="D12" dT="2026-08-12T09:00:00Z" '
                b'personId="{1}" id="{2}"><text>are we sure about this '
                b"number?</text></threadedComment></ThreadedComments>"
            )
        },
    )


def _plant_off_canvas_picture(payload: bytes) -> bytes | None:
    """A picture parked off the canvas, with no words in it at all.

    The rule requires a plain shape to carry text, because empty boxes off
    the edge are what slide exporters leave behind. A picture carries
    something whether or not it has words, and this is the plant that says
    whether that distinction was implemented or only written down.
    """
    from pptx import Presentation

    deck = Presentation(io.BytesIO(payload))
    if not deck.slides:
        return None
    deck.slides[0].shapes.add_picture(
        io.BytesIO(_png()),
        -deck.slide_width * 2,
        0,
        deck.slide_width // 4,
        deck.slide_height // 4,
    )
    out = io.BytesIO()
    deck.save(out)
    return out.getvalue()


#: `rule → [(what plants it, how the plant was written, what it is)]`.
#: `library` means a real Office-compatible writer produced the XML, so
#: finding it proves the rule reads what Office writes. `hand` means I
#: wrote the XML, so finding it proves the rule reads what I believe
#: Office writes — weaker, and labelled.
PLANTS: dict[str, list[tuple[Callable[[bytes], bytes | None], str, str]]] = {
    "speaker-notes": [(_plant_speaker_notes, "library", "notes under a slide")],
    "off-canvas-shape": [
        (_plant_off_canvas, "library", "a text box beside the slide"),
        (_plant_off_canvas_picture, "library", "a picture, no words in it"),
    ],
    "cropped-image": [(_plant_cropped_image, "library", "cropped left and bottom")],
    "hidden-slide": [
        (_plant_hidden_slide, "hand", 'show="0"'),
        (_plant_hidden_slide_false, "hand", 'show="false"'),
    ],
    "very-hidden-sheet": [(_plant_very_hidden, "hand", "state on the last sheet")],
    "hidden-sheet": [(_plant_hidden_sheet, "hand", "state on the last sheet")],
    "external-workbook": [(_plant_external_workbook, "hand", "a UNC path")],
    "external-cached-values": [(_plant_external_workbook, "hand", "three cached")],
    "cell-comment": [
        (_plant_cell_comment, "hand", "a note, the old kind"),
        (_plant_threaded_comment, "hand", "a threaded comment, 2018 onward"),
    ],
    "macros": [(_plant_macros, "hand", "a vbaProject")],
    "embedded-file": [(_plant_embedded_file, "hand", "a workbook, not behind a chart")],
    "tracked-changes": [
        (_plant_tracked_changes, "hand", "a deletion in the body"),
        (_plant_tracked_change_in_a_table, "hand", "a deletion inside a table"),
    ],
    "hidden-text": [
        (_plant_hidden_text, "hand", "<w:vanish/>"),
        (_plant_hidden_text_true, "hand", '<w:vanish w:val="true"/>'),
    ],
    "comment": [(_plant_comment, "hand", "a comment with an author")],
    "local-path": [(_plant_local_path, "hand", "a hyperlink to a UNC share")],
    "custom-property": [(_plant_custom_property, "hand", "a matter number")],
    "custom-xml": [(_plant_custom_xml, "hand", "a DMS record")],
    "document-properties": [(_plant_document_properties, "hand", "an author")],
}

#: Rules that one plant fires together, so neither counts as the other's
#: collateral. Planting an external link necessarily produces both the
#: path and the values cached behind it — that is the point of it.
TOGETHER = [{"external-workbook", "external-cached-values"}]


def _rules_of(payload: bytes) -> set[str] | None:
    try:
        return {one.rule for one in read_metadata_bytes(payload).findings}
    except Exception:  # a crash is a miss, not a skip
        return None


def main() -> int:
    if not HERE.exists():
        print(f"No corpus. Run:  uv run python -m scripts.document_corpus\n{HERE}")
        return 1

    files: list[tuple[Path, bytes, set[str]]] = []
    for path in sorted(one for one in HERE.iterdir() if one.is_file()):
        payload = path.read_bytes()
        before = _rules_of(payload)
        if before is not None:
            files.append((path, payload, before))
    print(f"{len(files)} readable files in the corpus\n", file=sys.stderr)

    print(
        f"{'rule':<24}{'plant':<34}{'by':<9}{'n':>4}{'found':>7}"
        f"{'recall':>8}{'collateral':>12}"
    )
    total_planted = total_found = total_collateral = 0
    unplantable: list[str] = []

    for rule, variants in PLANTS.items():
        siblings = next((one for one in TOGETHER if rule in one), {rule})
        hosted = False
        for plant, kind, what in variants:
            planted = found = collateral = 0
            misses: list[str] = []
            for path, payload, before in files:
                if planted >= PER_RULE:
                    break
                # Only into a file that was silent about this rule.
                # Otherwise « found it » might be the finding that was
                # already there before anything was planted.
                if rule in before:
                    continue
                try:
                    mutated = plant(payload)
                except Exception:
                    continue
                if mutated is None:
                    continue
                planted += 1
                after = _rules_of(mutated)
                if after is None:
                    misses.append(f"{path.name} — unreadable after planting")
                    continue
                if rule in after:
                    found += 1
                else:
                    misses.append(path.name)
                collateral += len(after - before - siblings)

            if not planted:
                continue
            hosted = True
            total_planted += planted
            total_found += found
            total_collateral += collateral
            recall = f"{100 * found / planted:.0f}%"
            print(
                f"{rule:<24}{what:<34}{kind:<9}{planted:>4}{found:>7}"
                f"{recall:>8}{collateral:>12}"
            )
            for one in misses[:2]:
                print(f"    MISSED: {one}")
        if not hosted:
            unplantable.append(rule)

    if total_planted:
        print(
            f"\n{total_found} of {total_planted} planted leaks found "
            f"({100 * total_found / total_planted:.1f}%), "
            f"{total_collateral} collateral findings"
        )
    if unplantable:
        print(f"\nNo corpus file could host a plant for: {', '.join(unplantable)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
