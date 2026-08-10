"""Build the Cascade memo, and a version of it that has gone stale.

A memo is the document most likely to have been written first and updated
last: nobody re-reads the investment committee paper when the model moves.
So the pair here is the realistic one, not a typo hunt — `cascade_memo.docx`
quotes the model correctly, and `cascade_memo_stale.docx` is the same memo
against a model that has since changed.

Every figure below is read out of `cascade_model.xlsx` at build time rather
than typed here. A fixture with hand-copied numbers is a fixture that
disagrees with its own model the first time either is touched, and then the
test measures the transcription rather than the checker — which is how the
« clean » deck in this same folder came to contain eight real errors nobody
knew about.

    uv run python -m scripts.cascade.build_memo_fixture

A `.docx` is a zip of XML parts, and only three of them are needed for a
document Word will open and `polar.redline.ooxml` will read. It is written
by hand because `python-docx` is not a dependency and adding one to
generate a test fixture is a poor trade.
"""

import zipfile
from decimal import Decimal
from pathlib import Path

from polar.tieout.provenance import outputs_from_workbook
from polar.tieout.workbook import read_workbook

HERE = Path(__file__).resolve().parent
MODEL = HERE / "cascade_model.xlsx"

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""


def money(value: Decimal, places: int = 1) -> str:
    return f"${value:.{places}f}mm"


def percent(value: Decimal, places: int = 1) -> str:
    return f"{value * 100:.{places}f}%"


def paragraphs(book: dict[str, Decimal], stale: bool) -> list[str]:
    """The memo's text.

    Written the way a paper actually reads — figures inside sentences,
    named by the clause before them — because that is the case the prose
    reader exists for and the case a table would not exercise.
    """
    revenue = book["Model!D6"]
    growth = book["Model!D7"]
    wacc = book["Assumptions!B19"]
    terminal = book["Assumptions!B20"]
    debt = book["Assumptions!B24"]
    cash = book["Assumptions!B25"]
    shares = book["Assumptions!B26"]

    if stale:
        # Two figures the model has since moved past — a headline the
        # committee will read and an assumption the whole valuation turns
        # on. Both are the realistic failure: a paper written against last
        # week's model, not a fat-fingered digit.
        revenue = revenue + Decimal("6.4")
        wacc = wacc + Decimal("0.004")

    return [
        "PROJECT CASCADE",
        "INVESTMENT COMMITTEE MEMORANDUM",
        "1 BACKGROUND",
        (
            "Cascade Industrial Holdings is a manufacturer of precision flow "
            "control equipment. The business is owned by its founding family "
            "and management has approached us regarding a sale."
        ),
        "2 FINANCIAL PERFORMANCE",
        (
            f"The business generated {money(revenue)} of revenue in FY2025A, "
            f"representing revenue growth of {percent(growth)} on the prior year."
        ),
        (
            f"The capital structure carries total debt of {money(debt)} against "
            f"cash and equivalents of {money(cash)}, and there are "
            f"{shares:.1f}mm diluted shares outstanding."
        ),
        "3 VALUATION",
        (
            f"The discounted cash flow is run at a WACC of {percent(wacc)} and a "
            f"terminal growth rate of {percent(terminal)}, consistent with the "
            "assumptions agreed at the last committee."
        ),
        (
            "The comparable companies analysis and the discounted cash flow are "
            "set out in full in the accompanying model."
        ),
        "4 RECOMMENDATION",
        (
            "We recommend proceeding to a confirmatory diligence phase on the "
            "terms set out above."
        ),
    ]


def document(lines: list[str]) -> str:
    body = "".join(
        f'<w:p><w:r><w:t xml:space="preserve">{_escape(line)}</w:t></w:r></w:p>'
        for line in lines
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{body}</w:body></w:document>"
    )


def _escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def write(path: Path, lines: list[str]) -> None:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("_rels/.rels", RELS)
        archive.writestr("word/document.xml", document(lines))


def main() -> None:
    book = read_workbook(str(MODEL))
    values = {
        output.source: output.value
        for output in outputs_from_workbook(book)
        if output.value is not None
    }

    for stale, name in (
        (False, "cascade_memo.docx"),
        (True, "cascade_memo_stale.docx"),
    ):
        path = HERE / name
        write(path, paragraphs(values, stale))
        print(f"  {name:28} {path.stat().st_size:>6} bytes")


if __name__ == "__main__":
    main()
