"""B2: the denylist prescan — what routes, what refuses, what passes clean.

Formulas here are synthetic, written to trip (or pointedly not trip)
one rule each. Detection is tokenized, so words inside strings and
sheet names must never register.
"""

from decimal import Decimal

from polar.tieout.recalc.denylist import (
    Category,
    Route,
    prescan,
    route_for,
    scan_formula,
)
from polar.tieout.workbook import Cell


def categories(formula: str) -> set[Category]:
    return {hit.category for hit in scan_formula("M!B2", formula)}


def test_lambda_is_caught_bare_and_prefixed() -> None:
    assert categories("=LAMBDA(x,x*2)(B1)") == {Category.LAMBDA}
    assert categories("=_xlfn.LAMBDA(x,x*2)(B1)") == {Category.LAMBDA}


def test_lambda_helpers_travel_with_it() -> None:
    assert Category.LAMBDA in categories("=BYROW(A1:A9,LAMBDA(r,SUM(r)))")
    assert categories("=MAP(A1:A9,_xlfn.LAMBDA(v,v+1))") == {Category.LAMBDA}


def test_cube_family_is_caught_by_prefix() -> None:
    assert categories('=CUBEVALUE("conn",A1)') == {Category.CUBE}
    assert categories('=CUBEMEMBER("conn","[M].[X]")') == {Category.CUBE}


def test_rtd_is_caught() -> None:
    assert categories('=RTD("srv.prog",,"topic")') == {Category.RTD}


def test_udf_is_caught_by_stub_prefix_and_by_unknown_name() -> None:
    assert categories("=_xludf.MYMACRO(B1)") == {Category.UDF}
    assert categories("=BLACKSCHOLESDELTA(B1,B2)") == {Category.UDF}


def test_external_reference_is_caught_in_both_spellings() -> None:
    assert categories("=[1]Assumptions!B2*2") == {Category.EXTERNAL}
    assert categories("='[Other model.xlsx]Inputs'!B2*2") == {Category.EXTERNAL}


def test_words_in_strings_and_sheet_names_do_not_trip() -> None:
    assert categories('=IF(B1>0,"LAMBDA discount","RTD feed")') == set()
    assert categories("='RTD data'!A1+'Lambda Corp'!B2") == set()


def test_range_combinator_index_is_not_a_udf() -> None:
    # `AA116:INDEX(...)` — a range whose end INDEX computes; the
    # tokenizer hands over `AA116:INDEX(` as one function token. The
    # H7 PCM files carry 504 such cells; refusing them was this
    # scan's first real-corpus false positive (lane log, 26 Aug).
    assert categories("=SUM(AA116:INDEX($B:$B,MATCH(9.99E+307,$B:$B)))") == set()


def test_implicit_intersection_single_is_a_measured_engine_gap() -> None:
    # `@` in modern Excel, stored as _xlfn.SINGLE — Excel's own
    # wrapper, but LibreOffice 25.8 measurably returns #NAME? for it
    # (probed 26 Aug, both spellings; the GT3 draft PCFM's 976-cell
    # fail was the corpus-scale evidence). Real Excel computes it, so
    # the route is the arbiter, not a refusal.
    assert categories("=SINGLE(A1:A10)*2") == {Category.ENGINE_GAP}
    assert categories("=_xlfn.SINGLE(A1:A10)*2") == {Category.ENGINE_GAP}
    assert route_for(scan_formula("M!B2", "=SINGLE(A1:A10)")) is Route.ARBITER


def test_offset_negative_literal_extent_is_a_measured_engine_gap() -> None:
    # Excel reads OFFSET(A10,0,0,-3,1) as extending backward;
    # LibreOffice 25.8 returns Err:502 (probed 26 Aug; the BPFMs'
    # RatingSimulator cone is the corpus-scale case). Only the
    # literal spelling is statically knowable.
    assert categories("=AVERAGE(OFFSET(A10,0,0,-3,1))") == {Category.ENGINE_GAP}
    assert categories("=AVERAGE(OFFSET(E10,0,0,1,-3))") == {Category.ENGINE_GAP}
    # Positive extents, computed extents, and a minus elsewhere are
    # not statically deniable — measurement (the engine-error bucket)
    # owns those.
    assert categories("=AVERAGE(OFFSET(A1,0,0,3,1))") == set()
    assert categories("=AVERAGE(OFFSET(A10,0,0,MAX(-1,-$G$55),1))") == set()
    assert categories("=SUM(OFFSET(A1,0,0),-3)") == set()
    assert categories("=OFFSET(A1,-3,0)") == set()  # row offset may be negative


def test_ordinary_model_arithmetic_is_clean() -> None:
    assert categories("=SUM(B2:B14)*VLOOKUP($A2,Rates!$A:$C,3,FALSE)") == set()
    assert categories("=XLOOKUP($A2,Names!A:A,Values!B:B)/LET(x,B4,x+1)") == set()


def test_refusal_outranks_the_arbiter() -> None:
    hits = scan_formula("M!B2", '=CUBEVALUE("c",A1)+_xludf.FEED(B1)')
    assert route_for(hits) is Route.REFUSE
    assert route_for(scan_formula("M!B2", "=LAMBDA(x,x)(B1)")) is Route.ARBITER
    assert route_for([]) is None


def test_prescan_reads_only_formula_cells() -> None:
    def cell(ref: str, formula: str | None) -> Cell:
        sheet, _ = ref.split("!")
        return Cell(
            ref=ref,
            sheet=sheet,
            row=2,
            column=2,
            value=Decimal("1"),
            formula=formula,
            row_label="",
            column_label="",
        )

    cells = {
        "M!B2": cell("M!B2", '=RTD("s",,"t")'),
        "M!B3": cell("M!B3", "=B2*2"),
        "M!B4": cell("M!B4", None),
    }
    hits = prescan(cells)
    assert [(h.ref, h.category) for h in hits] == [("M!B2", Category.RTD)]
