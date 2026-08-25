"""The sibling-totals check, against families whose defects are known.

Registered round: docs/pierce/a3-sibling-totals.md. The first half
plants the mining round's four witnessed defect shapes into a clean
dragged family and expects exactly one finding each; the second half
builds the structures the guards exist for — a uniform family, a
split family, a block total, a total about a different block — and
expects silence.

The totals sit three columns apart on purpose: side by side they are
a row run, and the row passes rightly claim a deviant first (the
registered dedup — this check never re-reports another rule's cell).
Spread out, no run exists and the sibling witness stands alone,
which is exactly the layout the row passes cannot see.
"""

import tempfile
from pathlib import Path

from polar.tieout.audit import audit
from polar.tieout.workbook import read_workbook

COLUMNS = ("C", "F", "I", "L", "O")


def _audit(build):
    from openpyxl import Workbook as Book

    book = Book()
    build(book.active)
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        return audit(read_workbook(str(path)))


def _family(sheet, deviant_column=None, deviant_formula=None):
    """Five column totals on row 15, data in rows 6-13."""
    for at in COLUMNS:
        for row in range(6, 14):
            sheet[f"{at}{row}"] = 1.0
        sheet[f"{at}15"] = (
            deviant_formula if at == deviant_column else f"=SUM({at}6:{at}13)"
        )


def _totals(result):
    return [f for f in result.findings if f.rule == "inconsistent-total"]


def test_a_plug_outside_the_shared_range_is_caught() -> None:
    result = _audit(lambda s: _family(s, "I", "=SUM(I6:I13)-1000"))
    found = _totals(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!I15"
    assert "arithmetic outside the shared SUM" in found[0].detail
    assert found[0].figure == "-1,000"
    assert found[0].severity == "error"


def test_a_range_off_by_one_is_caught() -> None:
    result = _audit(lambda s: _family(s, "I", "=SUM(I7:I13)"))
    found = _totals(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!I15"
    assert "reads rows 7–13 where they read 6–13" in found[0].detail


def test_a_cross_column_bleed_is_caught() -> None:
    result = _audit(lambda s: _family(s, "I", "=SUM(I6:J13)"))
    found = _totals(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!I15"
    assert "neighbouring column" in found[0].detail


def test_a_mis_dragged_extra_term_is_caught() -> None:
    result = _audit(lambda s: _family(s, "I", "=SUM(I6:I13)+L8"))
    found = _totals(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!I15"
    assert "arithmetic outside the shared SUM" in found[0].detail
    #: An extra reference is not a constant plug: no figure.
    assert found[0].figure == ""


def test_an_agreeing_family_is_silent() -> None:
    result = _audit(lambda s: _family(s))
    assert not _totals(result)


def test_anchoring_variants_still_agree() -> None:
    """`=SUM(I$6:I13)` covers the same cells as its siblings' relative
    spelling — coverage is resolved cells, so anchoring never accuses."""
    result = _audit(lambda s: _family(s, "I", "=SUM(I$6:I13)"))
    assert not _totals(result)


def test_a_split_family_is_two_designs() -> None:
    def build(sheet) -> None:
        for index, at in enumerate(("C", "F", "I", "L", "O", "R")):
            for row in range(6, 14):
                sheet[f"{at}{row}"] = 1.0
            top = 6 if index < 3 else 7
            sheet[f"{at}15"] = f"=SUM({at}{top}:{at}13)"

    assert not _totals(_audit(build))


def test_a_block_total_is_not_a_bleed() -> None:
    """A cell whose range covers its siblings' columns is a summary of
    the family, not a member disagreeing."""

    def build(sheet) -> None:
        for at in ("C", "D", "E", "F", "G"):
            for row in range(6, 14):
                sheet[f"{at}{row}"] = 1.0
            if at != "G":
                sheet[f"{at}15"] = f"=SUM({at}6:{at}13)"
        sheet["G15"] = "=SUM(C6:G13)"

    assert not _totals(_audit(build))


def test_a_total_about_a_different_block_is_not_comparable() -> None:
    def build(sheet) -> None:
        _family(sheet)
        for row in range(2, 5):
            sheet[f"R{row}"] = 1.0
        sheet["R15"] = "=SUM(R2:R4)"

    assert not _totals(_audit(build))


def test_a_staircase_triangle_is_silent() -> None:
    """Round 2's consequence guard, from the GT3 BPFM's depreciation
    triangle: a deviant whose range only over-reaches — empty rows, or
    live rows its own wider spelling must cover — misses nothing the
    consensus spelling covers, and stays silent."""

    def build(sheet) -> None:
        _family(sheet)
        #: The deviant reads five rows further down; they are empty in
        #: its column.
        sheet["I15"] = "=SUM(I6:I18)"

    assert not _totals(_audit(build))


def test_over_reach_into_live_rows_is_a_named_limitation() -> None:
    """The registered limitation, pinned so a change to it is loud: a
    deviant covering *more* live rows than the consensus is how a
    designed triangle's later columns spell their totals, and this
    round cannot tell that from a double-count. Silent."""

    def build(sheet) -> None:
        _family(sheet)
        for row in range(14, 17):
            sheet[f"I{row}"] = 2.0
        sheet["I15"] = "=SUM(I6:I18)"

    assert not _totals(_audit(build))


def test_an_off_by_one_over_an_empty_head_is_silent() -> None:
    """The guard cuts both ways: a narrowed range that skips only an
    empty cell computes the same total, and the round stays quiet."""

    def build(sheet) -> None:
        for at in COLUMNS:
            for row in range(6, 14):
                if not (at == "I" and row == 6):
                    sheet[f"{at}{row}"] = 1.0
            sheet[f"{at}15"] = "=SUM(I7:I13)" if at == "I" else f"=SUM({at}6:{at}13)"

    assert not _totals(_audit(build))


def test_identical_deviants_fold_into_one_finding() -> None:
    def build(sheet) -> None:
        for at in ("C", "F", "I", "L", "O", "R"):
            for row in range(6, 14):
                sheet[f"{at}{row}"] = 1.0
            top = 7 if at in ("I", "L") else 6
            sheet[f"{at}15"] = f"=SUM({at}{top}:{at}13)"

    result = _audit(build)
    found = _totals(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!I15"
    assert "the same disagreement in 2 cells" in found[0].detail
    assert "I15" in found[0].cells
    assert "L15" in found[0].cells


def test_the_column_direction_sees_row_totals() -> None:
    def build(sheet) -> None:
        for row in (3, 5, 7, 9, 11):
            for column in ("C", "D", "E", "F", "G", "H", "I", "J"):
                sheet[f"{column}{row}"] = 1.0
            sheet[f"M{row}"] = "=SUM(C7:I7)" if row == 7 else f"=SUM(C{row}:J{row})"

    result = _audit(build)
    found = _totals(result)
    assert len(found) == 1
    assert found[0].ref == "Sheet!M7"
    assert "reads columns C–I where they read C–J" in found[0].detail
