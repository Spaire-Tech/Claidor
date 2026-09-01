"""Currency and scale mismatches — E3a.

Registered round: `docs/pierce/e3a-unit-mismatch.md`. Armed only on
the dimensions Dynamo's E2 verdict measured as wrong on none, and
silent wherever E2 abstains.

The silence tests matter as much as the firing one. A unit check that
speaks where the inference declined would be inventing a
disagreement, and the orders are explicit that a unit finding which
cries wolf is worse than none at all.
"""

import tempfile
from pathlib import Path

from polar.tieout.audit import audit, plain_words
from polar.tieout.workbook import read_workbook


def _audit(build):
    """Runs `_unit_mismatch` directly — it is **not wired** into
    `audit()`.

    The round refused on its false-positive price (103 of 103 wrong
    on the closed-deal corpus), so the rule reports to nobody. These
    tests keep it honest until the correction lands, the way
    `_typed_beats` is kept.
    """
    from openpyxl import Workbook as Book

    from polar.tieout.audit import Audit, _unit_mismatch

    book = Book()
    build(book.active)
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        read = read_workbook(str(path))
        result = Audit(examined=len(read.cells))
        _unit_mismatch(read, result)
        return result


def _found(result, rule):
    return [f for f in result.findings if f.rule == rule]


def _money_sheet(sheet, *, second_format: str) -> None:
    """A row-wise sheet: labels down the side, periods across."""
    sheet["A1"] = "Cashflow model"
    for offset, column in enumerate("BCDE"):
        sheet[f"{column}2"] = f"FY{2025 + offset}"
    sheet["A3"] = "Sterling revenue"
    sheet["A4"] = "Dollar revenue"
    sheet["A5"] = "Total revenue"
    for column in "BCDE":
        sheet[f"{column}3"] = 100.0
        sheet[f"{column}3"].number_format = "£#,##0"
        sheet[f"{column}4"] = 200.0
        sheet[f"{column}4"].number_format = second_format
        sheet[f"{column}5"] = f"={column}3+{column}4"


def test_pounds_added_to_dollars_is_an_error() -> None:
    result = _audit(lambda s: _money_sheet(s, second_format="$#,##0"))
    found = _found(result, "currency-mismatch")
    assert found, [f.rule for f in result.findings]
    assert found[0].severity == "error"
    assert "GBP" in plain_words(found[0])
    assert "USD" in plain_words(found[0])
    assert "may only carry one currency" in plain_words(found[0])


def test_one_currency_throughout_is_silent() -> None:
    result = _audit(lambda s: _money_sheet(s, second_format="£#,##0"))
    assert not _found(result, "currency-mismatch")


def test_a_sum_whose_terms_the_inference_declined_is_not_a_finding() -> None:
    """The guard the orders insisted on: `unknown` is an abstention.

    The second row carries no currency-bearing format, so E2 declines
    on it. One answered value against a declination is not a
    disagreement, and saying otherwise would invent one.
    """
    result = _audit(lambda s: _money_sheet(s, second_format="General"))
    assert not _found(result, "currency-mismatch")
    assert not _found(result, "scale-mismatch")


def test_the_period_dimension_is_never_raised() -> None:
    """E3b is not armed, and no rule may quote `period`."""
    result = _audit(lambda s: _money_sheet(s, second_format="$#,##0"))
    assert not [f for f in result.findings if "period" in f.rule]


def test_the_rule_is_not_wired_into_the_audit() -> None:
    """The refusal, pinned. `audit()` must stay silent on units.

    103 of 103 corpus findings were false alarms, so the rule reports
    to nobody until the correction is registered and measured. A
    future edit that wires it back without that round should fail
    here.
    """
    from openpyxl import Workbook as Book

    book = Book()
    _money_sheet(book.active, second_format="$#,##0")
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "built.xlsx"
        book.save(path)
        result = audit(read_workbook(str(path)))
    assert not [f for f in result.findings if "mismatch" in f.rule]
    assert not [a for a in result.abstentions if "mismatch" in a.rule]


def test_scale_is_abstained_on_not_silently_clean() -> None:
    """`scale-mismatch` cannot fire on today's inference, and says so.

    Measured, not assumed: with rows labelled « Revenue (£m) » and
    « Costs (£000) » the inference still returns `scale=unknown` for
    every one, because it answers scale only from a declared Units
    column and refuses to guess it from magnitude or label. So the
    check must abstain rather than report a clean sheet — the A4
    distinction between « looked and found nothing » and « could not
    look ».
    """

    def build(sheet) -> None:
        sheet["A1"] = "Model"
        for offset, column in enumerate("BCDE"):
            sheet[f"{column}2"] = f"FY{2025 + offset}"
        for row, label in enumerate(["Revenue (£m)", "Costs (£000)"], start=3):
            sheet[f"A{row}"] = label
            for column in "BCDE":
                sheet[f"{column}{row}"] = 100.0
                sheet[f"{column}{row}"].number_format = "£#,##0"
        for column in "BCDE":
            sheet[f"{column}5"] = f"={column}3+{column}4"

    result = _audit(build)
    assert not _found(result, "scale-mismatch")
    assert any(a.rule == "scale-mismatch" for a in result.abstentions), (
        result.abstentions
    )


def test_a_dimensionless_term_is_not_a_competing_currency() -> None:
    """The correction, pinned: `none` is not a currency.

    A cashflow adds money to rates and counts all day. Counting
    « has no currency » as a currency that disagrees with sterling
    made 103 of 103 corpus findings false, which is what refused the
    first round.
    """

    def build(sheet) -> None:
        sheet["A1"] = "Cashflow"
        for offset, column in enumerate("BCDE"):
            sheet[f"{column}2"] = f"FY{2025 + offset}"
        sheet["A3"] = "Revenue"
        sheet["A4"] = "Utilisation %"
        sheet["A5"] = "Total"
        for column in "BCDE":
            sheet[f"{column}3"] = 100.0
            sheet[f"{column}3"].number_format = "£#,##0"
            sheet[f"{column}4"] = 0.5
            sheet[f"{column}4"].number_format = "0.0%"
            sheet[f"{column}5"] = f"={column}3-{column}4"

    result = _audit(build)
    assert not _found(result, "currency-mismatch"), [f.detail for f in result.findings]
