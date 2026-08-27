"""D1's promise, held against a PDF whose geometry is known exactly.

The fixture is a three-page PDF assembled by hand, byte by byte, in this
file — no authoring library, so the tests know precisely what was put
where: a text page with four numbers at set coordinates, a page that is
one full-page image (a scan, as far as any extractor can tell), and a
blank page. The assertions are the contract: every number with its page
and a box that covers it, the scan refused in words naming the page, the
blank page yielding nothing and refusing nothing.

``extract.py`` is imported by file location rather than through
``polar.tieout.chain``: the package trips ``polar.tieout``'s own imports
(pptx, openpyxl, the whole engine), and these tests must also run in a
bare environment holding only pdfplumber — the chain's dependencies are
proposed but not yet installed in the server env, where the pdfplumber
tests skip with a sentence instead.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

_EXTRACT = (
    Path(__file__).resolve().parents[2] / "polar" / "tieout" / "chain" / "extract.py"
)
_spec = importlib.util.spec_from_file_location("chain_extract", _EXTRACT)
assert _spec is not None
assert _spec.loader is not None
extract = importlib.util.module_from_spec(_spec)
sys.modules["chain_extract"] = extract  # dataclasses resolve through here
_spec.loader.exec_module(extract)


# --- the parser, token by token ------------------------------------------


@pytest.mark.parametrize(
    ("token", "value"),
    [
        ("1,234.5", 1234.5),
        ("1234", 1234.0),
        ("0.75", 0.75),
        ("(2,340)", -2340.0),
        ("(2,340).", -2340.0),
        ("-12.5", -12.5),
        ("–7", -7.0),
        ("45%", 45.0),
        ("£1,200", 1200.0),
        ("$3.4m", 3.4),
        ("€2bn", 2.0),
        ("3.4bn", 3.4),
        ("1,234,567", 1234567.0),
        ("99,", 99.0),
    ],
)
def test_tokens_that_are_numbers(token: str, value: float) -> None:
    assert extract.parse_number(token) == value


@pytest.mark.parametrize(
    "token",
    [
        "Revenue",
        "2022/23",  # a fiscal-year range parses as nothing, not as a guess
        "COVID-19",
        "A4",
        "1,23",  # broken thousands grouping is not a number
        "(1,000",  # an unbalanced parenthesis is punctuation, not a sign
        "1.2.3",
        "",
        "12-14",
    ],
)
def test_tokens_that_are_not(token: str) -> None:
    assert extract.parse_number(token) is None


# --- the fixture PDF, assembled by hand ----------------------------------

_LETTER = (612, 792)


def _obj(number: int, body: bytes) -> bytes:
    return b"%d 0 obj\n" % number + body + b"\nendobj\n"


def _stream(number: int, payload: bytes, extra: bytes = b"") -> bytes:
    head = b"<< /Length %d %s>>\nstream\n" % (len(payload), extra)
    return _obj(number, head + payload + b"\nendstream")


def _pdf(objects: list[bytes]) -> bytes:
    """Assemble numbered objects into a PDF with a correct xref table."""
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for body in objects:
        offsets.append(len(out))
        out += body
    xref_at = len(out)
    count = len(objects) + 1
    out += b"xref\n0 %d\n0000000000 65535 f \n" % count
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (
        count,
        xref_at,
    )
    return bytes(out)


def _fixture_pdf() -> bytes:
    width, height = _LETTER
    box = b"[0 0 %d %d]" % (width, height)
    text = (
        b"BT /F1 12 Tf 72 700 Td (Revenue 1,234.5) Tj ET "
        b"BT /F1 12 Tf 72 680 Td (Loss \\(2,340\\) recorded) Tj ET "
        b"BT /F1 12 Tf 72 660 Td (Margin 45% up 3 points) Tj ET"
    )
    scan = b"q %d 0 0 %d 0 0 cm /Im1 Do Q" % (width, height)
    return _pdf(
        [
            _obj(1, b"<< /Type /Catalog /Pages 2 0 R >>"),
            _obj(2, b"<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>"),
            _obj(
                3,
                b"<< /Type /Page /Parent 2 0 R /MediaBox "
                + box
                + b" /Resources << /Font << /F1 4 0 R >> >> /Contents 8 0 R >>",
            ),
            _obj(4, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
            _obj(
                5,
                b"<< /Type /Page /Parent 2 0 R /MediaBox "
                + box
                + b" /Resources << /XObject << /Im1 6 0 R >> >> /Contents 9 0 R >>",
            ),
            _stream(
                6,
                b"\x80",
                b"/Type /XObject /Subtype /Image /Width 1 /Height 1 "
                b"/ColorSpace /DeviceGray /BitsPerComponent 8 ",
            ),
            _obj(
                7,
                b"<< /Type /Page /Parent 2 0 R /MediaBox " + box + b" >>",
            ),
            _stream(8, text),
            _stream(9, scan),
        ]
    )


@pytest.fixture(scope="module")
def extraction():
    pytest.importorskip(
        "pdfplumber",
        reason="pdfplumber is proposed in the Scribe log, not yet installed",
    )
    import io

    return extract.extract_pdf(io.BytesIO(_fixture_pdf()))


# --- the contract, held --------------------------------------------------


def test_every_number_with_its_value(extraction) -> None:
    assert [(n.text, n.value) for n in extraction.numbers] == [
        ("1,234.5", 1234.5),
        ("(2,340)", -2340.0),
        ("45%", 45.0),
        ("3", 3.0),
    ]
    assert all(n.page == 1 for n in extraction.numbers)


def test_boxes_sit_where_the_text_was_drawn(extraction) -> None:
    width, height = _LETTER
    first = extraction.numbers[0]  # 1,234.5, baseline at y=700
    assert first.box.x0 > 72  # it follows the word "Revenue"
    assert first.box.x1 > first.box.x0
    # Top-left origin: baseline 700 from the bottom lands the glyph top
    # a little above height-700 from the top.
    assert height - 700 - 12 < first.box.top < height - 700
    assert first.box.bottom > first.box.top
    assert first.box.x1 < width


def test_each_number_knows_its_printed_line(extraction) -> None:
    assert [n.line for n in extraction.numbers] == [
        "Revenue 1,234.5",
        "Loss (2,340) recorded",
        "Margin 45% up 3 points",
        "Margin 45% up 3 points",
    ]


def test_boxes_are_ordered_like_the_page(extraction) -> None:
    tops = [n.box.top for n in extraction.numbers]
    assert tops == sorted(tops)  # 700, 680, 660 from the top down


def test_the_scan_is_refused_in_words(extraction) -> None:
    assert len(extraction.refusals) == 1
    refusal = extraction.refusals[0]
    assert refusal.page == 2
    assert "Page 2" in refusal.reason
    assert "scan" in refusal.reason
    assert "refused" in refusal.reason


def test_the_blank_page_is_neither_read_nor_refused(extraction) -> None:
    assert [p.page for p in extraction.pages] == [1, 2, 3]
    assert all(n.page != 3 for n in extraction.numbers)
    assert all(r.page != 3 for r in extraction.refusals)


def test_page_sizes_travel_with_the_boxes(extraction) -> None:
    assert [(p.width, p.height) for p in extraction.pages] == [_LETTER] * 3


# --- the router, over HTTP (skips until the dependency is approved) ------


def test_router_serves_the_extraction() -> None:
    pytest.importorskip(
        "pdfplumber",
        reason="pdfplumber is proposed in the Scribe log, not yet installed",
    )
    fastapi = pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    from polar.tieout import auth
    from polar.tieout.chain.router import router

    app = fastapi.FastAPI()
    app.include_router(router)
    app.dependency_overrides[auth._TieOutRead] = lambda: object()

    client = TestClient(app)
    response = client.post(
        "/chain/extract", files={"file": ("fixture.pdf", _fixture_pdf())}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "fixture.pdf"
    assert [n["value"] for n in body["numbers"]] == [1234.5, -2340.0, 45.0, 3.0]
    assert body["refusals"][0]["page"] == 2
    assert len(body["pages"]) == 3

    refused = client.post("/chain/extract", files={"file": ("notes.txt", b"hello")})
    assert refused.status_code == 415
    assert "not a PDF" in refused.json()["detail"]



# --- round V: baselines separated, scripts kept ---------------------------


def _round_v_pdf() -> bytes:
    """One page holding both cases round V has to get right.

    Line A and line B are drawn 3.0 points apart — the leading that
    pdfplumber's default tolerance merges, zipping two texts together
    by x. Line C carries a subscript 2.5 points below its base, which
    must stay part of its word.
    """
    width, height = _LETTER
    box = b"[0 0 %d %d]" % (width, height)
    # two rows 3.0pt apart, interleaved in x — the zip case
    zip_rows = (
        b"BT /F1 6 Tf 72 700 Td (Alpha 1,234) Tj ET "
        b"BT /F1 6 Tf 120 700 Td (Beta 5,678) Tj ET "
        b"BT /F1 6 Tf 72 697 Td (Gamma 9,012) Tj ET "
        b"BT /F1 6 Tf 120 697 Td (Delta 3,456) Tj ET "
    )
    # a base with a smaller run 2.5pt below it — the subscript case
    script = b"BT /F1 10 Tf 72 660 Td (RPE) Tj ET BT /F1 6 Tf 88 657.5 Td (t) Tj ET "
    return _pdf(
        [
            _obj(1, b"<< /Type /Catalog /Pages 2 0 R >>"),
            _obj(2, b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
            _obj(
                3,
                b"<< /Type /Page /Parent 2 0 R /MediaBox "
                + box
                + b" /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            ),
            _obj(4, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
            _stream(5, zip_rows + script),
        ]
    )


@pytest.fixture(scope="module")
def round_v_extraction():
    pytest.importorskip(
        "pdfplumber",
        reason="pdfplumber is proposed in the Scribe log, not yet installed",
    )
    import io

    return extract.extract_pdf(io.BytesIO(_round_v_pdf()))


def test_two_baselines_three_points_apart_stay_apart(round_v_extraction) -> None:
    """The zip case: neither row's numbers may land on the other's line."""
    lines = {number.line for number in round_v_extraction.numbers}
    zipped = [line for line in lines if "Alpha" in line and "Gamma" in line]
    assert zipped == [], f"two rows merged into one line: {zipped}"


def test_the_numbers_survive_the_separation(round_v_extraction) -> None:
    """Separating the rows must not shred them: whole numbers, not digits."""
    texts = sorted(number.text for number in round_v_extraction.numbers)
    assert texts == ["1,234", "3,456", "5,678", "9,012"]


def test_a_subscript_stays_part_of_its_word() -> None:
    """The script case: « RPE » and « t » are one word, not two.

    Read off `_words` rather than off the extraction, because no number
    sits on that line — asserting against the facts would pass whatever
    the rule did, which is not a test.

    At pdfplumber's default tolerance this fixture's two data rows come
    back as `AGlapmham`, `293,0412`, `53,,647586` — the zip — and at
    1.5 alone the subscript comes back as its own word `t`. Only both
    halves of round V give `RPEt`.
    """
    pytest.importorskip("pdfplumber")
    import io

    import pdfplumber

    with pdfplumber.open(io.BytesIO(_round_v_pdf())) as pdf:
        page = pdf.pages[0]
        assert "RPEt" in [word["text"] for word in extract._words(page)]
        # and the same page at the old tolerance is the defect itself
        loose = [word["text"] for word in page.extract_words()]
        assert "1,234" not in loose and "AGlapmham" in loose
