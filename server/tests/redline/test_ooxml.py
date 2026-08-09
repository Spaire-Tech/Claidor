"""Editing a Word document without breaking it.

This is the component two well-funded teams — Vesence and Harvey — built
from scratch rather than bought, which is the best evidence available
about how easy it is to get wrong. The failure mode is quiet: numbering
restarts, styles flatten, an existing tracked change vanishes, and nobody
notices until a partner compares versions.

Two properties carry the whole thing.

**Untouched bytes stay untouched.** Not « equivalent », not
« re-serialised the same way » — identical. That is why nothing here
parses and re-serialises.

**A phrase you can see in Word is not a contiguous string in the XML.**
Word splits text across runs at formatting changes and spell-check
boundaries, so « Closing Date » is routinely two runs. Half the tests
below use a document built that way on purpose.

*A caveat on the corpus.* These packages are built here rather than saved
by Word, because there is no copy of Word in this environment. They are
valid OOXML and they reproduce the run-splitting that matters, but a file
Word itself wrote would be a better test and is on the list of things to
ask for.
"""

import zipfile
from io import BytesIO

import pytest

from polar.redline.ooxml import (
    DOCUMENT,
    CannotEdit,
    Edit,
    NotADocx,
    Package,
    read,
    replace_tracked,
    scan_runs,
)

NS = (
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    'mc:Ignorable="w14"'
)


def paragraph(*runs: str) -> str:
    return f"<w:p>{''.join(runs)}</w:p>"


def run(text: str, props: str = "") -> str:
    return f'<w:r>{props}<w:t xml:space="preserve">{text}</w:t></w:r>'


def document_xml(*paragraphs: str) -> bytes:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
        f"<w:document {NS}><w:body>{''.join(paragraphs)}"
        '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>'
        "</w:body></w:document>"
    ).encode()


def docx(document: bytes, extra: dict[str, bytes] | None = None) -> bytes:
    """A package with the parts Word requires, plus anything extra."""
    parts = {
        "[Content_Types].xml": (
            b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/'
            b'content-types"><Default Extension="xml" ContentType="application/'
            b'xml"/></Types>'
        ),
        "_rels/.rels": b'<?xml version="1.0"?><Relationships/>',
        "word/styles.xml": b'<?xml version="1.0"?><w:styles/>',
        "word/numbering.xml": b'<?xml version="1.0"?><w:numbering/>',
        DOCUMENT: document,
    }
    parts.update(extra or {})
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, payload in parts.items():
            archive.writestr(name, payload)
    return buffer.getvalue()


#: A document where the visible phrase « Closing Date » is split across two
#: runs, exactly as Word writes it after an edit or a spell-check pass.
SPLIT = document_xml(
    paragraph(run("The completion occurs on the "), run("Closing "), run("Date.")),
    paragraph(run("The price is payable then.")),
)

BOLD = "<w:rPr><w:b/></w:rPr>"


class TestOpeningAndSaving:
    def test_a_package_round_trips_with_every_part_identical(self) -> None:
        # The property the whole engine rests on. A part nobody edited must
        # come back byte-identical, because « close enough » is how styles
        # and numbering quietly die.
        payload = docx(SPLIT)
        package = Package.open(payload)
        saved = Package.open(package.save())

        assert saved.names == package.names
        for name in package.names:
            assert saved.part(name) == package.part(name), name

    def test_part_order_is_preserved(self) -> None:
        package = Package.open(docx(SPLIT))
        assert Package.open(package.save()).names == package.names

    def test_editing_the_document_leaves_the_other_parts_alone(self) -> None:
        package = Package.open(docx(SPLIT))
        before = {name: package.part(name) for name in package.names}

        package.document = package.document.replace(b"price", b"amount")
        saved = Package.open(package.save())

        for name in package.names:
            if name == DOCUMENT:
                continue
            assert saved.part(name) == before[name], name

    def test_something_that_is_not_a_zip_is_refused(self) -> None:
        with pytest.raises(NotADocx):
            Package.open(b"this is not a zip file at all")

    def test_a_zip_without_a_document_is_refused(self) -> None:
        buffer = BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("hello.txt", b"hi")
        with pytest.raises(NotADocx):
            Package.open(buffer.getvalue())


class TestReadingTheText:
    def test_a_phrase_split_across_runs_reads_as_one_phrase(self) -> None:
        # The thing that breaks naive engines: searching the raw XML for
        # « Closing Date » finds nothing, because it is two runs.
        assert b"Closing Date" not in SPLIT
        assert "Closing Date" in read(SPLIT).text

    def test_paragraphs_are_separated_by_a_single_break(self) -> None:
        reading = read(SPLIT)
        assert reading.text == (
            "The completion occurs on the Closing Date.\nThe price is payable then."
        )

    def test_every_character_maps_back_to_a_run(self) -> None:
        reading = read(SPLIT)
        assert len(reading.offsets) == len(reading.text)
        for position, character in enumerate(reading.text):
            index, within = reading.offsets[position]
            if index < 0:
                assert character == "\n"
            else:
                assert reading.runs[index].text[within] == character

    def test_a_span_resolves_to_the_runs_it_touches(self) -> None:
        reading = read(SPLIT)
        start = reading.text.index("Closing Date")
        covered = reading.runs_covering(start, start + len("Closing Date"))
        assert len(covered) == 2

    def test_a_run_with_no_text_is_still_scanned(self) -> None:
        xml = document_xml(paragraph("<w:r><w:br/></w:r>", run("After the break.")))
        runs = scan_runs(xml)
        assert len(runs) == 2
        assert runs[0].text == ""

    def test_escaped_characters_are_read_as_written(self) -> None:
        xml = document_xml(paragraph(run("Smith &amp; Jones &lt;the Firm&gt;")))
        assert read(xml).text == "Smith & Jones <the Firm>"


class TestReplacingAsATrackedChange:
    def test_the_replacement_is_marked_as_an_insertion(self) -> None:
        reading = read(SPLIT)
        start = reading.text.index("Closing Date")
        edited = replace_tracked(
            SPLIT, [Edit(start, start + len("Closing Date"), "Completion Date")]
        )

        assert b"<w:ins " in edited
        assert b"Completion Date" in edited

    def test_the_original_is_marked_as_a_deletion(self) -> None:
        reading = read(SPLIT)
        start = reading.text.index("Closing Date")
        edited = replace_tracked(
            SPLIT, [Edit(start, start + len("Closing Date"), "Completion Date")]
        )

        assert b"<w:del " in edited
        # Inside a deletion the element is w:delText. Getting this wrong
        # shows the deleted words as though they were never removed.
        assert b"<w:delText" in edited
        assert b"Closing Date" in edited.replace(b"<w:delText", b"<w:t")

    def test_the_edited_document_reads_back_correctly(self) -> None:
        reading = read(SPLIT)
        start = reading.text.index("Closing Date")
        edited = replace_tracked(
            SPLIT, [Edit(start, start + len("Closing Date"), "Completion Date")]
        )

        after = read(edited).text
        assert "Completion Date" in after

    def test_text_either_side_of_the_edit_survives(self) -> None:
        # Replacing three words in the middle of a sentence must leave the
        # rest of that run exactly as it was.
        xml = document_xml(paragraph(run("Pay the Closing Date amount now.")))
        reading = read(xml)
        start = reading.text.index("Closing Date")
        edited = replace_tracked(
            xml, [Edit(start, start + len("Closing Date"), "Completion Date")]
        )

        after = read(edited).text
        assert after.startswith("Pay the ")
        assert after.endswith(" amount now.")

    def test_formatting_is_carried_onto_the_replacement(self) -> None:
        xml = document_xml(paragraph(run("The ", BOLD), run("Closing Date", BOLD)))
        reading = read(xml)
        start = reading.text.index("Closing Date")
        edited = replace_tracked(
            xml, [Edit(start, start + len("Closing Date"), "Completion Date")]
        )

        insertion = edited[edited.index(b"<w:ins ") : edited.index(b"</w:ins>")]
        assert b"<w:b/>" in insertion

    def test_a_deletion_with_no_replacement_leaves_only_a_deletion(self) -> None:
        xml = document_xml(paragraph(run("Delete this clause entirely now.")))
        reading = read(xml)
        start = reading.text.index("entirely ")
        edited = replace_tracked(xml, [Edit(start, start + len("entirely "), "")])

        assert b"<w:del " in edited
        assert b"<w:ins " not in edited
        # read() gives the document as it would read with every change
        # accepted, so deleted words are gone from it. See
        # TestWhatReadMeans.
        assert read(edited).text == "Delete this clause now."

    def test_several_edits_all_land(self) -> None:
        xml = document_xml(
            paragraph(run("Alpha and Beta and Gamma are the three terms."))
        )
        reading = read(xml)
        edits = [
            Edit(reading.text.index("Alpha"), reading.text.index("Alpha") + 5, "Delta"),
            Edit(reading.text.index("Gamma"), reading.text.index("Gamma") + 5, "Omega"),
        ]
        edited = replace_tracked(xml, edits)

        assert b"Delta" in edited
        assert b"Omega" in edited
        assert edited.count(b"<w:ins ") == 2

    def test_revision_ids_are_unique(self) -> None:
        import re

        xml = document_xml(paragraph(run("Alpha and Beta and Gamma here.")))
        reading = read(xml)
        edited = replace_tracked(
            xml,
            [
                Edit(reading.text.index("Alpha"), reading.text.index("Alpha") + 5, "A"),
                Edit(reading.text.index("Gamma"), reading.text.index("Gamma") + 5, "G"),
            ],
        )
        ids = re.findall(rb'w:id="(\d+)"', edited)
        assert len(ids) == len(set(ids))

    def test_a_replacement_containing_xml_characters_is_escaped(self) -> None:
        xml = document_xml(paragraph(run("Replace the party name here.")))
        reading = read(xml)
        start = reading.text.index("party name")
        edited = replace_tracked(
            xml, [Edit(start, start + len("party name"), "Smith & Jones <LLP>")]
        )

        assert b"Smith &amp; Jones &lt;LLP&gt;" in edited
        assert "Smith & Jones <LLP>" in read(edited).text


class TestRefusingRatherThanGuessing:
    """A redline that lands in the wrong place is worse than one that
    refuses. Every one of these raises instead of writing something
    approximate."""

    def test_overlapping_edits_are_refused(self) -> None:
        reading = read(SPLIT)
        start = reading.text.index("Closing Date")
        with pytest.raises(CannotEdit):
            replace_tracked(
                SPLIT,
                [Edit(start, start + 12, "A"), Edit(start + 5, start + 15, "B")],
            )

    def test_a_span_outside_the_document_is_refused(self) -> None:
        with pytest.raises(CannotEdit):
            replace_tracked(SPLIT, [Edit(0, 10_000, "x")])

    def test_an_empty_span_is_refused(self) -> None:
        with pytest.raises(CannotEdit):
            replace_tracked(SPLIT, [Edit(5, 5, "x")])

    def test_a_span_covering_only_a_paragraph_break_is_refused(self) -> None:
        reading = read(SPLIT)
        at = reading.text.index("\n")
        with pytest.raises(CannotEdit):
            replace_tracked(SPLIT, [Edit(at, at + 1, "x")])

    def test_no_edits_leaves_the_document_byte_identical(self) -> None:
        assert replace_tracked(SPLIT, []) == SPLIT


class TestThePackageEndToEnd:
    def test_an_edit_survives_a_save_and_reopen(self) -> None:
        package = Package.open(docx(SPLIT))
        reading = package.read()
        start = reading.text.index("Closing Date")

        package.document = replace_tracked(
            package.document,
            [Edit(start, start + len("Closing Date"), "Completion Date")],
        )
        reopened = Package.open(package.save())

        assert "Completion Date" in reopened.read().text
        assert b"<w:ins " in reopened.document

    def test_the_styles_part_is_untouched_by_an_edit(self) -> None:
        # Styles dying is the classic failure and it is silent.
        package = Package.open(docx(SPLIT))
        styles_before = package.part("word/styles.xml")
        numbering_before = package.part("word/numbering.xml")

        reading = package.read()
        start = reading.text.index("Closing")
        package.document = replace_tracked(
            package.document, [Edit(start, start + 7, "Completion")]
        )
        reopened = Package.open(package.save())

        assert reopened.part("word/styles.xml") == styles_before
        assert reopened.part("word/numbering.xml") == numbering_before


class TestWhatReadMeans:
    """``read()`` shows the document as it would read with every tracked
    change accepted — Word's « No Markup » view.

    That is the right thing for the checks to see. A defined term struck
    out by an earlier reviewer is not a term this document uses, and
    reporting it would be checking a document nobody is going to sign.

    It is a real decision rather than an accident of implementation, so it
    is tested rather than left to be discovered.
    """

    def test_a_tracked_deletion_is_not_read(self) -> None:
        xml = document_xml(
            paragraph(
                run("The price is "),
                '<w:del w:id="1" w:author="A" w:date="2026-01-01T00:00:00Z">'
                '<w:r><w:delText xml:space="preserve">five </w:delText></w:r>'
                "</w:del>",
                run("six million."),
            )
        )
        assert read(xml).text == "The price is six million."

    def test_a_tracked_insertion_is_read(self) -> None:
        xml = document_xml(
            paragraph(
                run("The price is "),
                '<w:ins w:id="2" w:author="A" w:date="2026-01-01T00:00:00Z">'
                '<w:r><w:t xml:space="preserve">six </w:t></w:r>'
                "</w:ins>",
                run("million."),
            )
        )
        assert read(xml).text == "The price is six million."

    def test_an_incoming_documents_revisions_survive_our_edit(self) -> None:
        # A document already under review must not lose somebody else's
        # tracked changes because we added one of our own.
        theirs = (
            '<w:ins w:id="7" w:author="Opposing" w:date="2026-01-01T00:00:00Z">'
            '<w:r><w:t xml:space="preserve">jointly </w:t></w:r></w:ins>'
        )
        xml = document_xml(
            paragraph(run("The parties shall "), theirs, run("agree the Closing Date."))
        )
        reading = read(xml)
        start = reading.text.index("Closing Date")
        edited = replace_tracked(
            xml, [Edit(start, start + len("Closing Date"), "Completion Date")]
        )

        assert b'w:author="Opposing"' in edited
        assert b"jointly " in edited
        assert "jointly" in read(edited).text


class TestARealWordFile:
    """A document Microsoft Word actually saved.

    ``word_blank.docx`` is a blank document straight out of Word. It has
    no text at all, which made it look useless — and it found a bug within
    a minute, because a blank Word document contains exactly the thing my
    generated fixtures never did.

    Word writes an empty paragraph as ``<w:p wp14:paraId="…" />``:
    self-closing, with no ``</w:p>`` anywhere. Paragraph counting looked
    for closing tags, so every blank line vanished and two clauses either
    side of one were welded into a single line. In a real agreement that
    would have shifted every offset after the first blank line, and every
    « Go to » and every tracked change with them.

    It also carries what real Word output looks like and my fixtures do
    not: a byte-order mark, sixteen namespace declarations, inline
    namespace declarations on individual elements, a 29 KB styles part,
    and no numbering part at all.
    """

    def test_it_round_trips_with_every_part_identical(self, word_blank: bytes) -> None:
        package = Package.open(word_blank)
        saved = Package.open(package.save())

        assert saved.names == package.names
        for name in package.names:
            assert saved.part(name) == package.part(name), name

    def test_a_blank_document_reads_as_no_text(self, word_blank: bytes) -> None:
        # Zero runs is the right answer here, not a failure to find them.
        reading = Package.open(word_blank).read()
        assert reading.text == ""
        assert reading.runs == []

    def test_a_byte_order_mark_does_not_break_reading(self, word_blank: bytes) -> None:
        assert Package.open(word_blank).document.startswith(b"\xef\xbb\xbf")

    def test_a_self_closing_paragraph_is_still_a_paragraph(self) -> None:
        # The bug the blank file found. A blank line between two clauses
        # is a self-closing <w:p/>, and losing it joins them.
        xml = document_xml(
            paragraph(run("First clause.")),
            '<w:p wp14:paraId="2C078E63" wp14:textId="5678BA89" />',
            paragraph(run("Second clause.")),
        )
        assert read(xml).text == "First clause.\n\nSecond clause."

    def test_paragraph_properties_are_not_counted_as_paragraphs(self) -> None:
        # <w:pPr> also begins with "<w:p". Counting it would insert a
        # phantom break before every formatted paragraph.
        xml = document_xml(
            '<w:p><w:pPr><w:jc w:val="both"/></w:pPr>'
            + run("Only one paragraph here.")
            + "</w:p>"
        )
        assert read(xml).text == "Only one paragraph here."
