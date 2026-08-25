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
