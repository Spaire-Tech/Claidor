"""Tier 1's boundary, where the answer is known by construction.

No solver is involved: these pin *which side of the line* a formula
falls on, and that every refusal carries the construct's name.
"""

from polar.tieout.watch.fragment import (
    ARRAY_FORMULA,
    WHOLE_COLUMN,
    classify,
    eligible_pair,
)


class TestInsideTheFragment:
    def test_arithmetic_is_eligible(self) -> None:
        assert classify("=B2*0.4 + C3 - D4/2").eligible

    def test_a_literal_is_eligible(self) -> None:
        assert classify(None).eligible

    def test_the_listed_functions_are_eligible(self) -> None:
        assert classify("=IF(B2>0,MIN(C3,D4),ABS(E5))").eligible
        assert classify("=SUM(A1:A10)+SUMPRODUCT(B1:B3,C1:C3)").eligible

    def test_a_cross_sheet_reference_is_eligible(self) -> None:
        assert classify("='Annual Inflation'!AR29 * 1.02").eligible


class TestTheRefusalBoundary:
    def test_a_lookup_is_refused_by_name(self) -> None:
        verdict = classify("=INDEX($T$29:$AV$29,MATCH($I$14,$T$4:$AV$4,0))")
        assert not verdict.eligible
        assert verdict.construct == "lookup_or_selection"
        assert verdict.detail == "INDEX"

    def test_a_selector_is_a_lookup(self) -> None:
        assert classify("=CHOOSE($B$3,A1,B1)").construct == "lookup_or_selection"

    def test_text_and_date_are_refused_by_name(self) -> None:
        assert classify('=TEXT(B5/B2,"0.0%")').construct == "text_or_date"
        assert classify("=DATE(AR6-1,I11,I12)").construct == "text_or_date"

    def test_a_conditional_aggregate_is_refused_by_name(self) -> None:
        assert classify('=AVERAGEIFS(M1:M9,E1:E9,">=1")').construct == (
            "conditional_aggregate"
        )

    def test_an_environment_function_is_refused_by_name(self) -> None:
        assert classify('=MID(CELL("filename"),1,9)').construct == (
            "volatile_or_environment"
        )

    def test_a_whole_column_aggregate_is_refused_by_name(self) -> None:
        """The LIA* wall from the SQLSolver reading: a range whose
        extent is not concretely known and may differ between the two
        versions."""
        verdict = classify("=SUM('Monthly Inflation'!$M:$M)")
        assert not verdict.eligible
        assert verdict.construct == WHOLE_COLUMN
        assert "$M:$M" in verdict.detail

    def test_a_bounded_range_of_the_same_letters_is_not_whole_column(self) -> None:
        assert classify("=SUM('Monthly Inflation'!$M$5:$M$352)").eligible

    def test_an_unlisted_function_is_refused_rather_than_assumed(self) -> None:
        verdict = classify("=NPV(0.1,A1:A5)")
        assert not verdict.eligible
        assert verdict.construct == "unlisted_function"
        assert verdict.detail == "NPV"

    def test_an_array_formula_is_refused(self) -> None:
        assert classify("{=SUM(A1:A3*B1:B3)}").construct == ARRAY_FORMULA


class TestThePair:
    def test_a_pair_is_only_as_eligible_as_its_worse_half(self) -> None:
        verdict = eligible_pair("=A1+A2", "=VLOOKUP(A1,B:C,2,0)")
        assert not verdict.eligible
        assert verdict.construct == "lookup_or_selection"

    def test_both_eligible_is_eligible(self) -> None:
        assert eligible_pair("=A1+A2", "=(A1+A2)*2/2").eligible
