"""Reading formulas out of a `.xls`.

The unit tests run always. The tests against a real workbook run only
after `scripts/audit_eval.py` has downloaded one, because a corpus of
somebody else's teaching models is not ours to vendor — and they are
skipped rather than silently passing, so an empty cache reads as
« not run » and not as « fine ».
"""

import struct
from pathlib import Path

import pytest

from polar.tieout.audit import audit
from polar.tieout.legacy import DEGENERATE, _records, read_legacy
from polar.tieout.workbook import read_workbook

CACHE = Path(__file__).resolve().parents[2] / ".model-cache"
REAL = CACHE / "apv.xls"
missing = pytest.mark.skipif(
    not REAL.exists(), reason="run scripts/audit_eval.py to fetch a real .xls"
)


def record(code: int, payload: bytes) -> bytes:
    return struct.pack("<HH", code, len(payload)) + payload


def test_a_record_split_across_continues_arrives_whole() -> None:
    """A payload over 8,224 bytes is continued, which for a formula means
    its token stream arrives in pieces. Joined wrongly, the tokens
    decompile to nonsense rather than to nothing."""
    stream = record(0x0006, b"abc") + record(0x003C, b"def") + record(0x000A, b"")
    assert list(_records(stream)) == [(0x0006, b"abcdef"), (0x000A, b"")]


def test_records_without_continues_are_untouched() -> None:
    stream = record(0x0085, b"one") + record(0x0085, b"two")
    assert list(_records(stream)) == [(0x0085, b"one"), (0x0085, b"two")]


def test_a_reference_to_one_cell_is_not_written_as_a_range() -> None:
    """xlrd's decompiler renders every area as a range, so a reference to
    a single cell comes back as `B2:B2` — which resolves correctly and is
    not what Excel shows, and makes every « is this one reference » rule
    answer no."""
    collapse = lambda text: DEGENERATE.sub(  # noqa: E731
        lambda m: m[1] if m[1] == m[2] else m[0], text
    )
    assert collapse("Inputs!B2:B2*2") == "Inputs!B2*2"
    assert collapse("SUM(D20:D23)") == "SUM(D20:D23)"


@missing
def test_a_real_workbook_gives_up_its_formulas() -> None:
    formulas, values = read_legacy(str(REAL))
    assert len(formulas.sheetnames) == 8
    written = sum(
        1
        for sheet in formulas.sheets.values()
        for value in sheet.cells.values()
        if isinstance(value, str) and value.startswith("=")
    )
    assert written > 500


@missing
def test_the_formula_book_also_carries_the_labels() -> None:
    """openpyxl's non-data workbook holds a formula where there is one and
    the literal contents everywhere else, so the row labels are in both of
    its books. Without mirroring that, every cell is named the empty
    string and the linker has nothing to match on."""
    book = read_workbook(str(REAL))
    named = [cell for cell in book.cells.values() if cell.row_label]
    assert len(named) > 1000
    assert book.get("Adjusted Present Value!C56").row_label == "Interest"


@missing
def test_a_formula_is_not_mistaken_for_a_label() -> None:
    """A formula is a string, so a column of formulas counts as a column
    of labels unless something says otherwise — and then every figure on
    the sheet is named after the arithmetic beside it."""
    book = read_workbook(str(REAL))
    assert not any(cell.row_label.startswith("=") for cell in book.cells.values())


@missing
def test_the_audit_finds_the_circularity_the_model_documents() -> None:
    """apv.xls computes interest from the cost of debt, the cost of debt
    from interest coverage, and interest coverage from interest. Its own
    READ ME sheet says « go into calculation options and put a check in
    the iteration box » — so the loop is real, deliberate, and not
    declared in the file, which is exactly what the rule is for."""
    book = read_workbook(str(REAL))
    assert book.iterative is False
    loops = [f for f in audit(book).errors if f.rule == "circular"]
    assert loops
    assert any("C56" in f.ref or "C56" in f.detail for f in loops)
