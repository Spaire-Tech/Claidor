"""The planter's own mechanics — Excel's reference update, pinned.

The harness plants edits with Excel's semantics; if the planter got
those wrong, the recovery numbers would be about the planter, not
the aligner. These tests hold the rewriter to the spec on cases
where Excel's behaviour is documented and known.
"""

from scripts.watch_plant import Planted, _shift_refs, _truth_variants


class TestRowInsert:
    def test_references_at_and_below_the_insert_shift_down(self) -> None:
        assert _shift_refs("A5+A10", "S", axis="row", at=5, delta=1) == "A6+A11"
        assert _shift_refs("A4+B4", "S", axis="row", at=5, delta=1) == "A4+B4"

    def test_anchored_references_shift_too(self) -> None:
        assert _shift_refs("$A$5*B$7", "S", axis="row", at=5, delta=1) == "$A$6*B$8"

    def test_a_range_spanning_the_insert_grows(self) -> None:
        assert (
            _shift_refs("SUM(A1:A10)", "S", axis="row", at=5, delta=1) == "SUM(A1:A11)"
        )

    def test_other_sheets_references_hold_still(self) -> None:
        assert (
            _shift_refs("Other!A5+A5", "S", axis="row", at=5, delta=1) == "Other!A5+A6"
        )
        assert (
            _shift_refs("'My Sheet'!A5", "My Sheet", axis="row", at=5, delta=1)
            == "'My Sheet'!A6"
        )

    def test_strings_pass_untouched(self) -> None:
        assert (
            _shift_refs('IF(A5>0,"A5 up",A5)', "S", axis="row", at=5, delta=1)
            == 'IF(A6>0,"A5 up",A6)'
        )


class TestRowDelete:
    def test_a_single_reference_to_the_deleted_row_breaks(self) -> None:
        assert _shift_refs("A5+A6", "S", axis="row", at=5, delta=-1) == "#REF!+A5"

    def test_a_range_endpoint_on_the_deleted_row_survives(self) -> None:
        assert (
            _shift_refs("SUM(A5:A10)", "S", axis="row", at=5, delta=-1) == "SUM(A5:A9)"
        )
        assert (
            _shift_refs("SUM(A1:A5)", "S", axis="row", at=5, delta=-1) == "SUM(A1:A5)"
        )


class TestColumnOps:
    def test_column_insert_shifts_letters(self) -> None:
        assert _shift_refs("B1+C1", "S", axis="column", at=2, delta=1) == "C1+D1"
        assert _shift_refs("A1", "S", axis="column", at=2, delta=1) == "A1"

    def test_column_delete_breaks_direct_references(self) -> None:
        assert _shift_refs("B1+C1", "S", axis="column", at=2, delta=-1) == "#REF!+B1"


class TestTruthVariants:
    def test_a_copied_insert_accepts_either_twin_as_the_new_one(self) -> None:
        planted = Planted("insert_copied_row", "rows", 5, 1)
        variants = _truth_variants([3, 5, 8], planted, "rows")
        assert len(variants) == 2
        strict, loose = variants
        assert strict[0] == {3: 3, 5: 6, 8: 9}
        assert loose[0] == {3: 3, 5: 5, 8: 9}
        assert strict[1][0]["first"] == 5
        assert loose[1][0]["first"] == 6

    def test_a_blank_insert_expects_a_pure_shift(self) -> None:
        planted = Planted("insert_blank_row", "rows", 5, 1)
        (mapping, structure), *rest = _truth_variants([3, 5, 8], planted, "rows")
        assert not rest
        assert mapping == {3: 3, 5: 6, 8: 9}
        assert structure == []

    def test_a_delete_drops_its_line_from_the_truth(self) -> None:
        planted = Planted("delete_row", "rows", 5, -1)
        (mapping, structure), *rest = _truth_variants([3, 5, 8], planted, "rows")
        assert not rest
        assert mapping == {3: 3, 8: 7}
        assert structure == [{"kind": "deleted_rows", "first": 5, "last": 5}]

    def test_the_untouched_axis_expects_identity(self) -> None:
        planted = Planted("insert_copied_row", "rows", 5, 1)
        (mapping, structure), *rest = _truth_variants([1, 2], planted, "columns")
        assert not rest
        assert mapping == {1: 1, 2: 2}
        assert structure == []
