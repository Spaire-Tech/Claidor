"""Plain-text act parser for PDF-extracted uniform acts (the 1998 texts).

Splits extracted text on ``Article N`` headings. PDF extraction is noisier
than AKN: spacing artifacts occur and are recorded in provenance rather than
silently "fixed" — cleanup happens in the human verification pass, never at
parse time.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

_HEADING = re.compile(r"(?m)^\s*Article\s+(\d+[\w-]*|premier)\s*\.?\s*$")


@dataclass(frozen=True)
class PdfArticle:
    number: str
    text: str
    alineas: list[str] = field(default_factory=list)


def _clean_line(line: str) -> str:
    line = unicodedata.normalize("NFC", line)
    return re.sub(r"[ \t\xa0]+", " ", line).strip()


def parse_pdf_act_text(text: str) -> list[PdfArticle]:
    """Split PDF-extracted act text into articles by ``Article N`` headings."""
    matches = list(_HEADING.finditer(text))
    articles: list[PdfArticle] = []
    seen: set[str] = set()
    for i, m in enumerate(matches):
        number = m.group(1).strip().rstrip(".")
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end]
        # Alinéas: blank-line separated blocks; inside a block, join wrapped
        # lines with spaces.
        blocks: list[str] = []
        for raw_block in re.split(r"\n\s*\n", body):
            joined = _clean_line(" ".join(raw_block.split("\n")))
            if joined:
                blocks.append(joined)
        full = "\n".join(blocks).strip()
        if not full or number in seen:
            continue
        seen.add(number)
        articles.append(PdfArticle(number=number, text=full, alineas=blocks))
    return articles
