"""Reading the text out of a document a lawyer actually has.

Pièces arrive as PDFs and Word files, and both have to be read before
anything can be checked against the corpus. The reader is deliberately
conservative: when it cannot see a text layer it says so, because an empty
extraction that silently becomes an empty document is how a scanned
exhibit ends up "having no citations".
"""

import io
import re
import zipfile
from dataclasses import dataclass

PDF_MIME_TYPES = ("application/pdf",)
DOCX_MIME_TYPES = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
)
TEXT_MIME_PREFIXES = ("text/",)

#: Word writes one ``<w:p>`` per paragraph and ``<w:br>`` for a soft break;
#: everything else in the XML is formatting we do not need.
_DOCX_PARAGRAPH = re.compile(r"</w:p>|<w:br\s*/>")
_XML_TAG = re.compile(r"<[^>]+>")
_ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'"}


class UnsupportedDocument(Exception):
    """The file is not one we can read text from."""


@dataclass(frozen=True)
class ReadDocument:
    text: str
    #: Pages, when the format has them — PDFs do, Word files do not until
    #: they are laid out, so the count is absent rather than guessed.
    page_count: int | None


def _read_pdf(payload: bytes) -> ReadDocument:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(payload))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    return ReadDocument(text=text, page_count=len(reader.pages))


def _read_docx(payload: bytes) -> ReadDocument:
    """Word text without a Word dependency: .docx is a zip of XML."""
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        xml = archive.read("word/document.xml").decode("utf-8", errors="replace")
    paragraphs = _DOCX_PARAGRAPH.split(xml)
    lines = []
    for paragraph in paragraphs:
        line = _XML_TAG.sub("", paragraph)
        for entity, character in _ENTITIES.items():
            line = line.replace(entity, character)
        line = line.strip()
        if line:
            lines.append(line)
    return ReadDocument(text="\n".join(lines), page_count=None)


#: Browsers and mail clients send « application/octet-stream » often
#: enough that refusing on the declared type alone would turn a perfectly
#: readable filing away.
_BY_SUFFIX = {
    ".pdf": PDF_MIME_TYPES[0],
    ".docx": DOCX_MIME_TYPES[0],
    ".txt": "text/plain",
    ".md": "text/plain",
}


def read_document(
    payload: bytes, mime_type: str, *, filename: str | None = None
) -> ReadDocument:
    """The document's text, or :class:`UnsupportedDocument`.

    Raises rather than returning an empty string: the difference between
    "this document cites nothing" and "we could not read this document" is
    the whole difference between a useful check and a false clean bill.
    """
    if filename and mime_type not in PDF_MIME_TYPES + DOCX_MIME_TYPES:
        for suffix, declared in _BY_SUFFIX.items():
            if filename.lower().endswith(suffix):
                mime_type = declared
                break
    if mime_type in PDF_MIME_TYPES:
        return _read_pdf(payload)
    if mime_type in DOCX_MIME_TYPES:
        return _read_docx(payload)
    if mime_type.startswith(TEXT_MIME_PREFIXES):
        return ReadDocument(
            text=payload.decode("utf-8", errors="replace"), page_count=None
        )
    raise UnsupportedDocument(mime_type)
