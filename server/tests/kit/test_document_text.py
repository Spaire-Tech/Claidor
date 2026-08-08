"""Reading a document must fail loudly rather than quietly return nothing.

An empty extraction that passes for a document is how a scanned exhibit
ends up reported as « aucune référence » — a clean bill of health for a
page nobody read.
"""

import io
import zipfile

import pytest

from polar.kit.document_text import UnsupportedDocument, read_document

DOCX_XML = (
    '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>'
    "<w:p><w:r><w:t>Attendu que l</w:t><w:t>'article 170 AUPSRVE</w:t></w:r></w:p>"
    "<w:p><w:r><w:t>PAR CES MOTIFS</w:t></w:r></w:p>"
    "</w:body></w:document>"
)


def _docx(xml: str = DOCX_XML) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", xml)
    return buffer.getvalue()


class TestWord:
    def test_paragraphs_come_out_as_lines(self) -> None:
        document = read_document(
            _docx(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        assert document.text.splitlines() == [
            "Attendu que l'article 170 AUPSRVE",
            "PAR CES MOTIFS",
        ]

    def test_runs_inside_a_paragraph_are_not_split(self) -> None:
        # Word splits a sentence across runs at every formatting change;
        # joining them wrongly would break « l'article 170 » in two and the
        # citation with it.
        document = read_document(
            _docx(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        assert "l'article 170" in document.text

    def test_word_files_have_no_page_count(self) -> None:
        document = read_document(
            _docx(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        assert document.page_count is None


class TestPlainText:
    def test_text_is_decoded(self) -> None:
        document = read_document(b"l'article 49 AUPSRVE", "text/plain")
        assert document.text == "l'article 49 AUPSRVE"


class TestDeclaredType:
    def test_a_generic_type_falls_back_to_the_filename(self) -> None:
        # Browsers and mail clients send application/octet-stream often
        # enough that refusing on the declared type alone would turn a
        # perfectly readable filing away.
        document = read_document(
            _docx(), "application/octet-stream", filename="conclusions.docx"
        )
        assert "PAR CES MOTIFS" in document.text

    def test_a_specific_declared_type_wins_over_the_filename(self) -> None:
        document = read_document(
            _docx(),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename="mislabelled.pdf",
        )
        assert "PAR CES MOTIFS" in document.text


class TestUnsupported:
    def test_an_unknown_type_raises_rather_than_returning_nothing(self) -> None:
        with pytest.raises(UnsupportedDocument):
            read_document(b"\x00\x01", "application/msword")

    def test_an_unreadable_extension_raises_too(self) -> None:
        # Legacy .doc is a binary format we do not parse; saying so beats
        # returning an empty document that reads as « aucune référence ».
        with pytest.raises(UnsupportedDocument):
            read_document(b"\x00\x01", "application/octet-stream", filename="scan.doc")
