"""A7: the shape-hash normalizations, tested against the protocol.

Every case pairs two spellings of one authoring decision (must share
a shape) or two genuinely different calculations (must not). The
protocol is docs/pierce/a7-normalization-protocol.md; the mining
round's own examples appear verbatim.
"""

from polar.tieout.audit import _shape
from polar.tieout.workbook import Cell


def _cell(formula: str, ref: str = "Model!F32") -> Cell:
    sheet, at = ref.split("!")
    column = 0
    row_text = ""
    for ch in at:
        if ch.isdigit():
            row_text += ch
        else:
            column = column * 26 + ord(ch) - 64
    return Cell(
        ref=ref,
        sheet=sheet,
        row=int(row_text),
        column=column,
        value=None,
        formula=formula,
        row_label="",
        column_label="",
    )


def same(a: str, b: str, ref_a: str = "Model!F32", ref_b: str = "Model!F32") -> bool:
    return _shape(_cell(a, ref_a)) == _shape(_cell(b, ref_b))


def test_commutative_addition_sorts() -> None:
    assert same("=B1+A1", "=A1+B1")
    assert same("=A1+B1+C1", "=C1+A1+B1")


def test_subtraction_and_mixed_chains_keep_their_order() -> None:
    assert not same("=A1-B1", "=B1-A1")
    assert _shape(_cell("=A1-B1+C1")) != _shape(_cell("=C1-B1+A1"))


def test_commutative_multiplication_sorts_division_does_not() -> None:
    assert same("=B1*A1", "=A1*B1")
    assert not same("=A1/B1", "=B1/A1")


def test_symmetric_function_arguments_sort() -> None:
    assert same("=SUM(B1,A1)", "=SUM(A1,B1)")
    assert same("=MAX(C1,A1,B1)", "=MAX(A1,B1,C1)")
    #: INDEX's argument order is meaning; it never sorts.
    assert not same("=INDEX(B1,A1)", "=INDEX(A1,B1)")


def test_constant_shapes_fold_in_chains() -> None:
    assert same("=A1*2*3", "=A1*6")
    assert same("=A1+2+3", "=A1+5")
    assert same("=(2)*A1", "=2*A1")
    #: A negated constant is not the same decision as a constant.
    assert not same("=A1+2", "=A1-2")


def test_unary_plus_is_erased_unary_minus_is_not() -> None:
    assert same("=+C26+C31", "=C26+C31")
    assert not same("=-A1", "=A1")


def test_the_mining_rounds_own_idiom_pair() -> None:
    """`=+C26+C31` at F32 and `=F26+F31` at I32: the same relative
    calculation, two spellings — one shape (the A3 evidence)."""
    assert same("=+C26+C31", "=F26+F31", "Model!C32", "Model!F32")


def test_whitespace_is_erased() -> None:
    assert same("=A1 + B1", "=A1+B1")


def test_different_calculations_stay_different() -> None:
    assert not same("=SUM(A1:A3)", "=A1+A2+A3")  # out of scope, registered
    assert not same("=A1+B1", "=A1*B1")
    assert not same("=SUM(A1:B2)", "=SUM(A1:B3)")


def test_nesting_normalizes_inside_out() -> None:
    assert same("=SUM(B1+A1,C1)", "=SUM(A1+B1,C1)")
    assert same("=SUM(C1,A1+B1)", "=SUM(B1+A1,C1)")


def test_relative_anchoring_still_governs() -> None:
    #: The same text in different columns is a different calculation
    #: when the references are relative...
    assert not same("=A1+B1", "=A1+B1", "Model!C2", "Model!D2")
    #: ...and the same calculation when they are absolute.
    assert same("=$A$1+$B$1", "=$A$1+$B$1", "Model!C2", "Model!D2")


def test_unparseable_falls_back_without_error() -> None:
    shape = _shape(_cell("={1,2}+A1"))
    assert isinstance(shape, str)
    assert shape != ""
