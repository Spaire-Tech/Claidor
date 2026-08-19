"""The model audit, against a fixture whose defects are known.

Nine planted defects and eight structures that look like defects and are
not. The second half is the point: every one of those eight was a false
positive on a real Damodaran valuation model before the rule that exempts
it existed, and each would come back the moment a rule is loosened.
"""

import sys
from pathlib import Path

import pytest

from polar.tieout.audit import audit
from polar.tieout.workbook import read_workbook

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
sys.path.insert(0, str(CASCADE))

from build_audit_fixture import DEFECTS  # noqa: E402


@pytest.fixture(scope="module")
def found():
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    by_ref: dict[str, set[str]] = {}
    for finding in result.findings:
        by_ref.setdefault(finding.ref, set()).add(finding.rule)
    return by_ref


@pytest.mark.parametrize(("ref", "rule"), sorted(DEFECTS.items()))
def test_every_planted_defect_is_found(found, ref: str, rule: str) -> None:
    assert rule in found.get(ref, set()), f"{ref} should have raised {rule}"


def test_nothing_else_is_reported(found) -> None:
    """The half that matters. A rule loosened to catch one more defect
    brings these back, and there are far more of them in a real model than
    there are defects."""
    assert set(found) == set(DEFECTS)


def test_a_typed_history_is_not_a_hardcode() -> None:
    """Three years of actuals, typed, then a forecast. Every model on
    earth is built this way and a check that flags it flags every model."""
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    typed = {f.ref for f in result.findings if f.rule == "typed-over-formula"}
    assert typed == {"Model!F11"}
    assert not typed & {"Model!B6", "Model!C6", "Model!D6", "Model!C8", "Model!D8"}


def test_circularity_is_reported_only_when_the_model_has_not_declared_it() -> None:
    """Every Damodaran valuation model tested carries deliberate circular
    references and switches on iterative calculation to say so. The
    fixture does not, so its one loop is a defect."""
    book = read_workbook(str(CASCADE / "audit_fixture.xlsx"))
    assert book.iterative is False
    assert any(f.rule == "circular" for f in audit(book).findings)

    book.iterative = True
    assert not any(f.rule == "circular" for f in audit(book).findings)


def test_a_well_built_model_is_quiet() -> None:
    """The Cascade model: 313 cells, 228 formulas, no mechanical errors.
    An audit that cannot be quiet on a good model is not an audit."""
    result = audit(read_workbook(str(CASCADE / "cascade_model.xlsx")))
    assert result.errors == []
    assert result.examined > 300


def test_errors_and_smells_are_never_added_together() -> None:
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    assert {f.severity for f in result.errors} == {"error"}
    assert {f.severity for f in result.smells} == {"smell"}
    assert len(result.findings) == len(result.errors) + len(result.smells)


def test_every_finding_cites_the_standard_it_comes_from() -> None:
    """« Says who » has to have an answer that is not « the tool »."""
    result = audit(read_workbook(str(CASCADE / "audit_fixture.xlsx")))
    assert all(finding.source for finding in result.findings)


def _tmp_book(build) -> "Audit":  # noqa: F821
    """An audit over a workbook built in memory and read off disk."""
    import tempfile
    from pathlib import Path

    from openpyxl import Workbook as Book

    book = Book()
    build(book.active)
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        return audit(read_workbook(str(path)))


def test_a_pasted_block_is_still_typed_over_formula() -> None:
    """Ofwat's queries document confirms four cells hard-keyed into the
    FM02 financial model — a vertical block, every row otherwise a
    formula series. The old veto on any stacked constant scored 0 of 4
    on the one ground truth the audit had."""

    def build(sheet) -> None:
        for row in range(2, 8):
            for column in range(2, 9):
                at = sheet.cell(row=row, column=column)
                if column == 5 and row in (2, 3, 4, 5):
                    at.value = 0.89
                else:
                    at.value = f"=B{row}+1"

    result = _tmp_book(build)
    typed = [f for f in result.findings if f.rule == "typed-over-formula"]
    #: Detected cell by cell, reported as the one paste it was: a single
    #: finding anchored on the first cell, every place in its evidence.
    assert len(typed) == 1
    assert typed[0].ref == "Sheet!E2"
    for coordinate in ("E2", "E3", "E4", "E5"):
        assert coordinate in typed[0].detail


def test_a_parameter_column_is_not_typed_over_formula() -> None:
    """`CollarsAnalysisv3-1.XLS` carries typed parameter columns dozens
    of cells tall. A column is data, not damage."""

    def build(sheet) -> None:
        for row in range(2, 14):
            for column in range(2, 9):
                at = sheet.cell(row=row, column=column)
                if column == 5:
                    at.value = 0.89
                else:
                    at.value = f"=B{row}+1"

    result = _tmp_book(build)
    assert not any(f.rule == "typed-over-formula" for f in result.findings)


def test_a_filled_formula_is_one_finding_not_thousands() -> None:
    """One 625-character formula filled across a grid produced 7,752 of
    a real base-cost model's 8,017 findings. A fill is one decision."""
    long = "=" + "+".join(['INDIRECT("A1")'] * 20)

    def build(sheet) -> None:
        sheet.cell(row=2, column=1).value = "Interest cover"
        for column in range(2, 12):
            sheet.cell(row=2, column=column).value = long

    result = _tmp_book(build)
    lengthy = [f for f in result.findings if f.rule == "long-formula"]
    assert len(lengthy) == 1
    assert "filled across 10 cells" in lengthy[0].detail
    noisy = [f for f in result.findings if f.rule == "volatile"]
    assert len(noisy) == 1


def test_a_block_pasted_over_several_columns_is_caught_down_the_columns() -> None:
    """Yorkshire's FM02 (per Ofwat's queries document): five year-columns
    typed across four adjacent rows, so no row keeps a formula majority
    and the row pass is blind. The columns still show the paste."""

    def build(sheet) -> None:
        for row in range(2, 10):
            for column in range(2, 11):
                at = sheet.cell(row=row, column=column)
                if column >= 6 and row in (3, 4, 5, 6):
                    at.value = 0.52
                else:
                    at.value = f"=B{row}+{column}"

    result = _tmp_book(build)
    typed = [f for f in result.findings if f.rule == "typed-over-formula"]
    #: Every column of the paste is seen, and each column's run reports
    #: once — five findings for a five-column paste, not twenty.
    assert {f.ref for f in typed} == {
        "Sheet!F3",
        "Sheet!G3",
        "Sheet!H3",
        "Sheet!I3",
        "Sheet!J3",
    }
    last = next(f for f in typed if f.ref == "Sheet!J3")
    assert "J6" in last.detail


def test_designed_error_tails_fold_and_interior_breaks_are_loud() -> None:
    """The mentor's discriminator: `#N/A` is a designed return value,
    and the shape of the region says whether the sheet is working. A
    tail past the data's edge folds to one quiet finding; an interior
    `#N/A` in a live column is a break and stays loud; `#REF!` is
    always damage and stays per cell — the result that made a real
    closed-deal file's frozen references land."""

    def build(sheet) -> None:
        # A label column, so the data columns read as data — without it
        # the engine elects column B as the sheet's labels and its
        # numbers never become cells at all.
        for row in range(2, 11):
            sheet.cell(row=row, column=1).value = f"Series row {row}"
        for row in range(2, 7):
            sheet.cell(row=row, column=2).value = row * 1.0
        for row in range(7, 11):
            sheet.cell(row=row, column=2).value = "#N/A"
        for row in range(2, 9):
            sheet.cell(row=row, column=3).value = "#N/A" if row == 4 else row * 2.0
        sheet.cell(row=3, column=4).value = "#REF!"
        sheet.cell(row=4, column=4).value = 5.0

    result = _tmp_book(build)
    errors = [f for f in result.findings if f.rule == "error-value"]
    tails = [f for f in errors if f.figure_unit == "cells past the data's edge"]
    breaks = [f for f in errors if f.figure_unit == "breaks a live column"]
    broken = [f for f in errors if "#REF!" in f.detail]
    assert len(tails) == 1
    assert tails[0].severity == "smell"
    assert "4 cells" in tails[0].detail
    assert len(breaks) == 1
    assert breaks[0].severity == "error"
    assert breaks[0].ref == "Sheet!C4"
    assert len(broken) == 1
    assert broken[0].severity == "error"


def test_a_daily_series_calendar_gaps_fold_quiet() -> None:
    """The corpus's third shape: a daily-rates column with a `#N/A`
    every weekend — thousands of short gaps at a regular rhythm. Many
    short interior runs are the series' calendar, not breaks."""

    def build(sheet) -> None:
        row = 2
        for _week in range(12):
            for _day in range(5):
                sheet.cell(row=row, column=2).value = float(row)
                row += 1
            for _closed in range(2):
                sheet.cell(row=row, column=2).value = "#N/A"
                row += 1
        sheet.cell(row=row, column=2).value = float(row)

    result = _tmp_book(build)
    errors = [f for f in result.findings if f.rule == "error-value"]
    assert len(errors) == 1
    assert errors[0].severity == "smell"
    assert "routine gaps" in errors[0].detail
    assert "24 cells" in errors[0].detail


def test_cross_column_agreement_tells_a_calendar_from_a_break() -> None:
    """The mentor's stronger signal, with « a break in one column »
    meant literally. Rows 5 and 9 are holidays — every column gaps, no
    stride, only two of them where the stride rule wants ten: calendar.
    Row 11 gaps in columns B and C while D stays live — a family on
    its own calendar, the shape that put two source families on one
    RIIO-3 daily sheet and would otherwise read as 620 breaks: still
    calendar, because a sister gaps with it. Row 13 gaps in C alone
    while B and D carry values — the break, loud even as the only one
    in the file."""

    def build(sheet) -> None:
        gaps = {2: {5, 9, 11}, 3: {5, 9, 11, 13}, 4: {5, 9}}
        for row in range(2, 15):
            sheet.cell(row=row, column=1).value = f"Day {row}"
            for col in (2, 3, 4):
                if row in gaps[col]:
                    sheet.cell(row=row, column=col).value = "#N/A"
                else:
                    sheet.cell(row=row, column=col).value = float(row)

    result = _tmp_book(build)
    errors = [f for f in result.findings if f.rule == "error-value"]
    breaks = [f for f in errors if f.figure_unit == "breaks a live column"]
    quiet = [f for f in errors if f.severity == "smell"]
    assert len(breaks) == 1
    assert breaks[0].ref == "Sheet!C13"
    assert "every sister column holds live values there" in breaks[0].detail
    assert len(quiet) == 1
    assert "8 cells across 3 columns" in quiet[0].detail


def test_broken_cells_sharing_one_formula_fold_to_one_loud_finding() -> None:
    """The RIIO-3 ET3 model carries 334 `#REF!` cells that are exactly
    two formulas, each pasted across its block. One deletion, one
    finding, however many cells it tore — still an error, so nothing
    broken goes quiet, and a lone broken cell reports as it always
    did."""

    def build(sheet) -> None:
        for row in range(2, 8):
            sheet.cell(row=row, column=1).value = f"Row {row}"
            sheet.cell(row=row, column=2).value = "#REF!"
            sheet.cell(row=row, column=3).value = float(row)
        sheet.cell(row=3, column=4).value = "#NAME?"

    result = _tmp_book(build)
    broken = [
        f for f in result.findings if f.rule == "error-value" and f.severity == "error"
    ]
    folded = [f for f in broken if f.figure_unit == "cells sharing one broken formula"]
    assert len(folded) == 1
    assert folded[0].figure == "6"
    assert "shows #REF! across 6 cells" in folded[0].detail
    lone = [f for f in broken if f.detail == "shows #NAME?"]
    assert len(lone) == 1


def test_a_sparse_anchor_column_beside_a_daily_sister_is_not_broken() -> None:
    """The RIIO-3 SONIA sheet: forecast anchors every 182 daily rows,
    `#N/A` between them, beside sisters interpolated for every day.
    Every gap is « alone » — which is the column's design. Aloneness
    is only evidence when it is exceptional for the column."""

    def build(sheet) -> None:
        for row in range(2, 40):
            sheet.cell(row=row, column=1).value = f"Day {row}"
            sheet.cell(row=row, column=2).value = float(row) if row % 3 == 2 else "#N/A"
            #: The daily sister ends two rows early — a tail, which is
            #: what keeps it on the sheet's error-carrying panel, the
            #: way the real interpolation columns are.
            sheet.cell(row=row, column=3).value = row * 2.0 if row < 38 else "#N/A"

    result = _tmp_book(build)
    errors = [f for f in result.findings if f.rule == "error-value"]
    assert not [f for f in errors if f.figure_unit == "breaks a live column"]
    assert len(errors) == 1
    assert errors[0].severity == "smell"


def test_a_circular_loop_is_one_finding_not_one_per_cell() -> None:
    """Heathrow's H7 model put 22,519 cells into circular chains — the
    graph resolves them into components, and the component is the
    finding."""

    def build(sheet) -> None:
        sheet["B2"] = "=C2+1"
        sheet["C2"] = "=B2+1"

    result = _tmp_book(build)
    loops = [f for f in result.findings if f.rule == "circular"]
    assert len(loops) == 1
    assert loops[0].figure == "2"
    assert "loop of 2 cells" in loops[0].detail


def test_a_loop_dragged_across_periods_folds_to_one_finding() -> None:
    """A per-period interest loop dragged across ten columns is ten
    identical components and one authoring decision."""
    from openpyxl.utils import get_column_letter

    def build(sheet) -> None:
        for column in range(2, 12):
            letter = get_column_letter(column)
            sheet.cell(row=2, column=column).value = f"={letter}3+1"
            sheet.cell(row=3, column=column).value = f"={letter}2+1"

    result = _tmp_book(build)
    loops = [f for f in result.findings if f.rule == "circular"]
    assert len(loops) == 1
    assert "repeated 10" in loops[0].detail
    assert loops[0].figure == "20"


def test_typed_over_the_same_line_of_repeating_blocks_is_one_finding() -> None:
    """The founder's file: a depreciation schedule of identical blocks,
    27 rows each, the same line typed over in every one — Z23, Z50,
    Z77… Six copies of one sentence bury the report; the drumbeat is
    one decision."""

    def build(sheet) -> None:
        for block in range(6):
            top = 2 + block * 27
            for row in range(top, top + 4):
                for column in range(2, 9):
                    at = sheet.cell(row=row, column=column)
                    if column == 5 and row == top + 2:
                        at.value = 0.89
                    else:
                        at.value = f"=B{row}+1"

    result = _tmp_book(build)
    typed = [f for f in result.findings if f.rule == "typed-over-formula"]
    assert len(typed) == 1
    assert "typed over in 6 places" in typed[0].detail
    assert "E4" in typed[0].detail
    assert "E139" in typed[0].detail
    #: The collapsed finding claims no single figure and offers no
    #: one-cell fix — each place holds its own number.
    assert typed[0].figure == ""
    assert typed[0].fix == ""


def test_two_unrelated_typed_cells_stay_two_findings() -> None:
    """Two typed cells that merely share a column are coincidence, not
    a pattern — the collapse needs a shared label or a constant beat of
    at least three."""

    def build(sheet) -> None:
        for row in (2, 3, 4, 9, 10, 11):
            for column in range(2, 9):
                at = sheet.cell(row=row, column=column)
                if column == 5 and row in (3, 10):
                    at.value = 0.89
                else:
                    at.value = f"=B{row}+1"

    result = _tmp_book(build)
    typed = {f.ref for f in result.findings if f.rule == "typed-over-formula"}
    assert typed == {"Sheet!E3", "Sheet!E10"}


def test_an_input_column_with_a_total_under_it_is_data_not_damage() -> None:
    """A column of typed inputs with one SUM below repeats nothing —
    the island rule requires the column's own formula to repeat."""

    def build(sheet) -> None:
        for row in range(2, 7):
            sheet.cell(row=row, column=2).value = f"=C{row}*2"
            sheet.cell(row=row, column=3).value = row * 1.1
        sheet.cell(row=7, column=3).value = "=SUM(C2:C6)"

    result = _tmp_book(build)
    assert not any(f.rule == "typed-over-formula" for f in result.findings)


def test_a_sibling_view_of_the_summed_range_is_not_a_skipped_row() -> None:
    """The sum that survived eleven versions of Ofgem's ED2 model,
    hand-verified: « impacting tax allowance » `=SUM(AR146:AR147)`
    sits below two neighbours that are themselves derived from the
    same pair — `=-SUM(...)` and a net-debt view reading it too.
    Three views of one authoring decision; adding the neighbours into
    the total would double count. A row that reads the summed range
    is a sibling, not a forgotten input."""

    def build(sheet) -> None:
        sheet["A2"] = "Miscellaneous revenue"
        sheet["B2"] = 4.2
        sheet["A3"] = "Miscellaneous costs"
        sheet["B3"] = -4.7
        sheet["A5"] = "Services contributing to allowed revenue"
        sheet["B5"] = "=-SUM(B2:B3)"
        sheet["A6"] = "Services impacting core net debt"
        sheet["B6"] = "=B5+SUM(B2:B3)"
        sheet["A7"] = "Services impacting tax allowance"
        sheet["B7"] = "=SUM(B2:B3)"

    result = _tmp_book(build)
    assert not [f for f in result.findings if f.rule == "skipped-cell"]


def test_the_example_preapp_model_reports_the_defensible_seven() -> None:
    """The founder's real file, kept as the audit's conscience.

    Sixteen findings before this test existed; nine were the audit
    misreading structure. A year-counter column's typed seeds read as
    hardcodes (six findings) and its `=Z23+1` as a row departure (one);
    a conditional that picks two loan rows read as a broken total with
    an invented 8.5bn miss; a Total Revenue that rightly excludes the
    detail rows already inside an included subtotal read as incomplete.
    What survives is what a person would defend: one genuinely broken
    total (debt service missing its interest — 12.5m, not the 512.5m a
    balance row inflated it to), two buried assumptions, three
    unreadable formulas, and an empty very-hidden sheet said plainly.
    """
    from polar.tieout.structure import read_structure

    book = read_workbook(str(CASCADE / "example_preapp_model.xlsx"))
    result = audit(book, read_structure(book).axes)

    assert sorted((f.rule, f.ref) for f in result.findings) == [
        ("hardcode-in-formula", "Assumptions Processing!E17"),
        ("hardcode-in-formula", "Control Panel!E56"),
        ("hidden-sheet", "Module1!A1"),
        ("long-formula", "Assumptions Processing!E23"),
        ("long-formula", "Assumptions Processing!E37"),
        ("long-formula", "Assumptions Processing!E47"),
        ("skipped-cell", "Assumptions Processing!E41"),
    ]

    #: The real miss is the interest row; the outstanding-balance row
    #: between the components does not belong in a service total.
    skipped = next(f for f in result.findings if f.rule == "skipped-cell")
    assert skipped.figure == "12.5m"
    assert "E40" in skipped.detail
    assert "E38" not in skipped.detail

    #: An empty, unreferenced very-hidden sheet is a note, not a threat.
    hidden = next(f for f in result.findings if f.rule == "hidden-sheet")
    assert hidden.severity == "smell"
    assert "empty and nothing in the model reads it" in hidden.detail

    #: A bound tested twice reads once.
    validation = next(f for f in result.findings if f.ref == "Control Panel!E56")
    assert validation.figure == "20"


def test_hidden_and_very_hidden_sheets_are_findings() -> None:
    """The document panel's concealment facts, folded into the audit:
    hidden is a smell (one right-click from visible), very hidden is an
    error (absent from Excel's own unhide menu)."""
    import tempfile

    from openpyxl import Workbook as Book

    book = Book()
    sheet = book.active
    assert sheet is not None
    sheet.title = "Model"
    sheet["A1"] = 1
    shy = book.create_sheet("Workings")
    shy["A1"] = 2
    shy.sheet_state = "hidden"
    dark = book.create_sheet("Plug")
    dark["A1"] = 3
    dark.sheet_state = "veryHidden"
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        result = audit(read_workbook(str(path)))
    found = {f.sheet: f.severity for f in result.findings if f.rule == "hidden-sheet"}
    assert found == {"Workings": "smell", "Plug": "error"}


def test_a_dragged_break_reports_once_not_per_cell() -> None:
    """The founder's file: a counter column dragged through a
    depreciation block came back as 114 findings — one decision,
    reported 114 times. One finding, with the span in the sentence."""

    def build(sheet) -> None:
        for row in range(2, 12):
            for column in range(2, 8):
                at = sheet.cell(row=row, column=column)
                if column == 5:
                    at.value = f"=E{row - 1}+1" if row > 2 else 1
                else:
                    at.value = f"=B{row}+{column}"

    result = _tmp_book(build)
    broken = [f for f in result.findings if f.rule == "inconsistent-row"]
    assert len(broken) <= 2, [f.ref for f in broken]
    if broken:
        assert "filled across" in broken[0].detail or len(broken) == 1


def test_notation_numbers_are_not_hardcodes() -> None:
    """A fifth of all hardcode noise in the judged corpus sample was
    numbers that are notation, not assumptions: date-constructor
    arguments, text-function counts, rounding precisions, powers of
    ten, ABS tolerances, and equality selectors. A real assumption in
    the same column still reports."""

    def build(sheet) -> None:
        sheet["A2"] = "Lines"
        sheet["B2"] = "=DATE(2025,4,1)"
        sheet["B3"] = "=EOMONTH(DATE(2025,4,1),6)"
        sheet["B4"] = '=REPT("-",25)'
        sheet["B5"] = "=ROUND(Z5,8)=ROUND(Y5,8)"
        sheet["B6"] = "=Z6*10^6"
        sheet["B7"] = "=ABS(Z7-Y7)<0.005"
        sheet["B8"] = "=IF(Z8=2025,1,0)"
        sheet["B9"] = "=Z9*1.2345"

    result = _tmp_book(build)
    hardcodes = [f for f in result.findings if f.rule == "hardcode-in-formula"]
    assert [f.ref for f in hardcodes] == ["Sheet!B9"], [
        (f.ref, f.detail) for f in hardcodes
    ]
    assert "1.2345" in hardcodes[0].detail


def test_a_label_documented_constant_is_not_a_hardcode() -> None:
    """« 70% Grid / 30% Water » over a `*0.7` documents the number
    where the reader is already looking. The same constant under a
    label that does not state it still reports."""

    def build(sheet) -> None:
        sheet["A2"] = "Split 70% Grid / 30% Water"
        sheet["B2"] = "=Z2*0.7"
        sheet["A3"] = "Grid share"
        sheet["B3"] = "=Z3*0.7"

    result = _tmp_book(build)
    hardcodes = [f for f in result.findings if f.rule == "hardcode-in-formula"]
    assert [f.ref for f in hardcodes] == ["Sheet!B3"], [
        (f.ref, f.detail) for f in hardcodes
    ]


def test_a_drifted_selector_is_the_finding_and_agreeing_ones_are_not() -> None:
    """`IF(C$1=2025,…)` filled across a row: the equality literals are
    switch settings, not hardcodes — but the one cell testing 2022
    among seven testing 2025 is a stale copy or an unwritten
    exception, and shapes cannot see it because shapes erase numbers."""

    def build(sheet) -> None:
        from openpyxl.utils import get_column_letter

        for column in range(3, 11):
            letter = get_column_letter(column)
            sheet.cell(row=1, column=column).value = 2025
            year = 2022 if letter == "G" else 2025
            sheet.cell(
                row=3, column=column
            ).value = f"=IF({letter}$1={year},{letter}2,0)"

    result = _tmp_book(build)
    assert not any(f.rule == "hardcode-in-formula" for f in result.findings)
    drifted = [f for f in result.findings if f.rule == "inconsistent-row"]
    assert [f.ref for f in drifted] == ["Sheet!G3"], [
        (f.ref, f.detail) for f in drifted
    ]
    assert "2022" in drifted[0].detail
    assert "2025" in drifted[0].detail


def test_a_row_total_column_is_not_an_inconsistent_row() -> None:
    """A bare SUM across its own row is the row's totals column — it
    departs from the series because it is about the series."""

    def build(sheet) -> None:
        from openpyxl.utils import get_column_letter

        sheet["A4"] = "Revenue"
        for column in (3, 4, 5, 7, 8):
            letter = get_column_letter(column)
            sheet.cell(row=4, column=column).value = f"={letter}3*2"
        sheet["F4"] = "=SUM(C4:E4)"

    result = _tmp_book(build)
    assert not any(f.rule == "inconsistent-row" for f in result.findings), [
        (f.ref, f.detail) for f in result.findings if f.rule == "inconsistent-row"
    ]


def test_a_long_enumeration_is_not_a_long_formula() -> None:
    """Forty references joined by plus signs: nothing nests, nothing
    branches, and splitting it would not make it clearer."""
    chain = "=" + "+".join(f"C{row}" for row in range(1, 60))

    def build(sheet) -> None:
        assert len(chain) > 180
        sheet["B2"] = chain

    result = _tmp_book(build)
    assert not any(f.rule == "long-formula" for f in result.findings)


def test_a_multi_area_sum_is_one_total_not_three() -> None:
    """`SUM(B5:B8,B2:B3,B4)` reads rows 2 through 8 in three pieces.
    Judging each piece alone accused the formula of leaving out rows
    its other pieces include — the bug the usefulness audit caught in
    its own sample."""

    def build(sheet) -> None:
        for row in range(2, 9):
            sheet.cell(row=row, column=2).value = row * 10
        sheet["B10"] = "=SUM(B5:B8,B2:B3,B4)"

    result = _tmp_book(build)
    assert not any(f.rule == "skipped-cell" for f in result.findings), [
        f.detail for f in result.findings if f.rule == "skipped-cell"
    ]


def test_partitioned_detail_rows_are_not_skipped_but_bare_ones_are() -> None:
    """Ofgem's RoRE tables sum one slice while a sibling bare SUM in
    the same column covers the rest: a partition, not a miss. Remove
    the sibling and the same rows are genuinely unclaimed."""

    def partitioned(sheet) -> None:
        for row in range(2, 10):
            sheet.cell(row=row, column=2).value = row * 10
        sheet["B11"] = "=SUM(B6:B9)"
        sheet["B12"] = "=SUM(B2:B5)"

    result = _tmp_book(partitioned)
    assert not any(f.rule == "skipped-cell" for f in result.findings), [
        f.detail for f in result.findings if f.rule == "skipped-cell"
    ]

    def unclaimed(sheet) -> None:
        for row in range(2, 10):
            sheet.cell(row=row, column=2).value = row * 10
        sheet["B12"] = "=SUM(B2:B5)"

    result = _tmp_book(unclaimed)
    skipped = [f for f in result.findings if f.rule == "skipped-cell"]
    assert len(skipped) == 1, [f.detail for f in skipped]
    assert "B6" in skipped[0].detail


def test_the_walk_above_a_total_stops_at_a_section_break() -> None:
    """A total's claim ends with its own block: two blank rows are a
    section break, and the table beyond them belongs to someone else.
    The live row inside the block still reports."""

    def build(sheet) -> None:
        sheet["B2"] = 10
        sheet["B3"] = 20
        sheet["B4"] = 30
        for row in range(7, 11):
            sheet.cell(row=row, column=2).value = row * 10
        sheet["B12"] = "=SUM(B2:B3)"

    result = _tmp_book(build)
    skipped = [f for f in result.findings if f.rule == "skipped-cell"]
    assert len(skipped) == 1, [f.detail for f in skipped]
    assert "B4" in skipped[0].detail
    assert "B7" not in skipped[0].detail


def test_a_mnemonic_column_is_not_typed_over() -> None:
    """A defined name repeated down a column is the sheet's text
    scaffolding — a value typed between its rows is a heading, not a
    paste over a calculation."""
    import tempfile
    from pathlib import Path

    from openpyxl import Workbook as Book
    from openpyxl.workbook.defined_name import DefinedName

    book = Book()
    sheet = book.active
    book.defined_names["price_label"] = DefinedName(
        "price_label", attr_text="Sheet!$Z$1"
    )
    for row in range(2, 9):
        sheet.cell(row=row, column=1).value = f"=Z{row}*2"
        if row == 5:
            sheet.cell(row=row, column=2).value = 7
        else:
            sheet.cell(row=row, column=2).value = "=price_label"
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        result = audit(read_workbook(str(path)))
    assert not any(f.rule == "typed-over-formula" for f in result.findings), [
        f.detail for f in result.findings if f.rule == "typed-over-formula"
    ]


def test_one_value_pasted_across_a_row_folds_and_an_input_row_drops() -> None:
    """A typed row crossing many calculated columns: one value in ten
    columns is one paste, said once; ten different values are an input
    series the column pass misread, and data is not damage."""

    def one_value(sheet) -> None:
        from openpyxl.utils import get_column_letter

        for column in range(2, 14):
            letter = get_column_letter(column - 1)
            for row in range(2, 9):
                at = sheet.cell(row=row, column=column)
                if row == 5 and 3 <= column <= 12:
                    at.value = 0.89
                else:
                    at.value = f"={letter}{row}*2"

    result = _tmp_book(one_value)
    typed = [f for f in result.findings if f.rule == "typed-over-formula"]
    assert len(typed) == 1, [(f.ref, f.detail) for f in typed]
    assert "10 cells" in typed[0].detail

    def input_series(sheet) -> None:
        from openpyxl.utils import get_column_letter

        for column in range(2, 14):
            letter = get_column_letter(column - 1)
            for row in range(2, 9):
                at = sheet.cell(row=row, column=column)
                if row == 5 and 3 <= column <= 12:
                    at.value = column * 1.7
                else:
                    at.value = f"={letter}{row}*2"

    result = _tmp_book(input_series)
    assert not any(f.rule == "typed-over-formula" for f in result.findings)


def test_the_same_hardcode_on_sibling_sheets_is_one_finding() -> None:
    """Ofgem's ED2 model types the same pool balance into fourteen DNO
    sheets — one decision per company workbook, one sentence."""
    import tempfile
    from pathlib import Path

    from openpyxl import Workbook as Book

    book = Book()
    for name in ("DNOa", "DNOb", "DNOc"):
        sheet = book.create_sheet(name)
        sheet["B2"] = "=719.23+0"
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        result = audit(read_workbook(str(path)))
    hardcodes = [f for f in result.findings if f.rule == "hardcode-in-formula"]
    assert len(hardcodes) == 1, [(f.ref, f.detail) for f in hardcodes]
    assert "3 sheets" in hardcodes[0].detail


def test_a_sheets_volatile_idiom_is_one_finding() -> None:
    """OFFSET in row after row with varying arguments defeats the fill
    collapse — the shapes differ — but « this sheet is built on
    OFFSET » is one fact about one sheet."""

    def build(sheet) -> None:
        sheet["B2"] = "=OFFSET(A1,1,1)"
        sheet["B3"] = "=OFFSET(A1,2,1)"
        sheet["B4"] = "=OFFSET(A2,1,1)*2"
        sheet["B5"] = "=OFFSET(A1,1,2)"

    result = _tmp_book(build)
    noisy = [f for f in result.findings if f.rule == "volatile"]
    assert len(noisy) == 1, [(f.ref, f.detail) for f in noisy]
    assert "4 places" in noisy[0].detail


def test_a_convention_constant_across_many_formulas_is_one_finding() -> None:
    """The 0.5 of a half-period adjustment appears in row after row of
    otherwise different formulas: one convention, one finding."""

    def build(sheet) -> None:
        sheet["B2"] = "=Z2*0.5"
        sheet["B3"] = "=Z3+0.5*Y3"
        sheet["B4"] = "=SUM(Z4:Y4)*0.5"

    result = _tmp_book(build)
    hardcodes = [f for f in result.findings if f.rule == "hardcode-in-formula"]
    assert len(hardcodes) == 1, [(f.ref, f.detail) for f in hardcodes]
    assert "convention" in hardcodes[0].detail


def test_an_array_formula_is_a_formula_not_a_typed_value() -> None:
    """The reader dropped ArrayFormula objects, so every array-entered
    cell registered as a typed value — the single largest source of
    false typed-over findings in the judged sample."""
    import tempfile
    from pathlib import Path

    from openpyxl import Workbook as Book
    from openpyxl.worksheet.formula import ArrayFormula

    book = Book()
    sheet = book.active
    for row in range(1, 5):
        sheet.cell(row=row, column=1).value = row
    sheet["B1"] = ArrayFormula("B1:B4", "=TRANSPOSE(A1:A4)")
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        read = read_workbook(str(path))
    cell = read.cells.get("Sheet!B1")
    assert cell is not None
    assert cell.formula == "=TRANSPOSE(A1:A4)"


def test_the_same_long_formula_on_sibling_sheets_is_one_finding() -> None:
    """The sibling-sheet fold is not only for hardcodes: ED2's array
    formulas sit at the same address on fourteen company sheets, and
    fourteen copies of « 343 characters » is one finding."""
    import tempfile
    from pathlib import Path

    from openpyxl import Workbook as Book

    long = "=" + "+".join(f"IF(Z{n}>0,Z{n},0)" for n in range(1, 20))

    book = Book()
    for name in ("DNOa", "DNOb", "DNOc"):
        sheet = book.create_sheet(name)
        sheet["B2"] = long
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        result = audit(read_workbook(str(path)))
    lengthy = [f for f in result.findings if f.rule == "long-formula"]
    assert len(lengthy) == 1, [(f.ref, f.detail) for f in lengthy]
    assert "3 sheets" in lengthy[0].detail


def test_a_row_of_near_identical_long_formulas_is_one_finding() -> None:
    """ED2's transpose rows array-enter the same formula with one
    anchored index hand-walked per column, so no two shapes match and
    the fill collapse is blind. Same row, same length, one pattern."""

    def build(sheet) -> None:
        from openpyxl.utils import get_column_letter

        for column in range(3, 7):
            letter = get_column_letter(column)
            row_picked = 10 + column
            sheet.cell(row=4, column=column).value = "=" + "+".join(
                f"IF($Z${row_picked}>{n},{letter}{n},0)" for n in range(1, 14)
            )

    result = _tmp_book(build)
    lengthy = [f for f in result.findings if f.rule == "long-formula"]
    assert len(lengthy) == 1, [(f.ref, f.detail) for f in lengthy]
    assert "4 cells of one row" in lengthy[0].detail


def test_an_index_table_including_its_own_cell_is_not_a_loop() -> None:
    """Excel resolves INDEX's pick before hunting circular references —
    `=INDEX(B1:B10,3)` written inside its own table calculates, and
    modellers use exactly this to break a deliberate cycle without
    OFFSET's volatility. Two shipped regulator models carry chains
    that close only through INDEX tables; neither warns in Excel."""

    def build(sheet) -> None:
        for row in range(1, 11):
            if row == 5:
                sheet.cell(row=row, column=2).value = "=INDEX(B1:B10,3)"
            else:
                sheet.cell(row=row, column=2).value = row

    result = _tmp_book(build)
    assert not any(f.rule == "circular" for f in result.findings), [
        f.detail for f in result.findings if f.rule == "circular"
    ]
