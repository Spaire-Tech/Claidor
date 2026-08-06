"""Extract and normalize article text from acquired PDF acts.

Usage: ``uv run python -m scripts.corpus_extract_pdfs``

Each PDF source prints article headings its own way (``Art.39.-`` at
Droit-Afrique, ``ARTICLE 1`` in the WTO copy of the 1999 arbitration act,
inline ``…isateurs. Article 2 Sont…`` at LegalRDC). This script extracts
the text with pypdf and rewrites headings into the one canonical layout the
parser understands (``Article N`` alone on a line), saving the result as
``<stem>-extracted.txt`` next to each PDF — committed, so the exact text
that entered the database is inspectable forever. Content is never altered;
only heading layout is normalized, and each transform is a visible regex
below, not a silent cleanup.

Expected article counts act as an integrity gate: a source that does not
yield exactly the published number of articles fails loudly.
"""

import re
from pathlib import Path

from pypdf import PdfReader

from polar.corpus.pdf_act import parse_pdf_act_text

RAW = Path(__file__).parent.parent.parent / "corpus" / "raw" / "acts-pdf"


def _droit_afrique(text: str) -> str:
    """``Art.39.-`` (also ``Art.premier.-``) → ``\\n\\nArticle 39\\n``."""
    text = re.sub(
        r"(?m)^\s*Art\.\s*(\d+[\w-]*|premier)\s*\.?\s*[-–—]\s*",
        lambda m: f"\n\nArticle {m.group(1)}\n",
        text,
    )
    return text


def _uppercase_heading(text: str) -> str:
    """``ARTICLE 1`` alone on a line → ``Article 1``."""
    return re.sub(
        r"(?m)^\s*ARTICLE\s+(\d+[\w-]*)\s*$",
        lambda m: f"\n\nArticle {m.group(1)}\n",
        text,
    )


def _inline_capitalized(text: str) -> str:
    """``…générales Article 2 Sont…`` → break the heading onto its own line.

    In this rendering headings are capitalized ``Article N`` followed by a
    capitalized word (article text, or ``Abrogé`` for slots the act itself
    abrogates); cross-references are always lowercase ("à l'article 8").
    """
    # A heading at a page boundary has the page number between it and the
    # body ("Article 9 \n \n 4 \nLa régularité…") — consumed and dropped.
    return re.sub(
        r"(?<!['’])\bArticle\s+(\d+(?:-\d+)?)\s+(?:\d{1,3}\s+)?(?=[A-ZÉÈÀÙÔ])",
        lambda m: f"\n\nArticle {m.group(1)}\n",
        text,
    )


SOURCES: tuple[tuple[str, object, int], ...] = (
    ("aus-1997-droitafrique.pdf", _droit_afrique, 151),
    ("auscgie-1997-wto.pdf", _droit_afrique, 920),
    ("aupc-1998-juriscope.pdf", lambda t: t, 258),
    ("aua-1999-wto.pdf", _uppercase_heading, 36),
    ("audcif-2017-legalrdc.pdf", _inline_capitalized, 123),
)


def main() -> None:
    for filename, normalize, expected in SOURCES:
        path = RAW / filename
        reader = PdfReader(str(path))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        text = normalize(text)  # type: ignore[operator]
        articles = parse_pdf_act_text(text)
        status = "OK" if len(articles) == expected else "MISMATCH"
        print(f"{filename}: {len(articles)} articles (expected {expected}) {status}")
        if len(articles) != expected:
            numbers = [a.number for a in articles]
            print("  first:", numbers[:10], "last:", numbers[-10:])
            raise SystemExit(f"{filename}: article count mismatch — refusing to save")
        out = path.with_name(path.stem + "-extracted.txt")
        out.write_text(text)


if __name__ == "__main__":
    main()
