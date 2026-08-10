"""The workbook's own format codes, read far enough to draw a number.

Every code below is one a real financial model writes. The ones at the end
are the ones this deliberately refuses, because a wrong number is worse
than an unformatted one.
"""

from decimal import Decimal

import pytest

from polar.tieout.numbers import show


def d(text: str) -> Decimal:
    return Decimal(text)


@pytest.mark.parametrize(
    ("value", "code", "expected"),
    [
        # The case that started this: a margin held as a fraction.
        ("0.1222587719", "0.0%", "12.2%"),
        ("0.1222587719", "0.00%", "12.23%"),
        ("0.1222587719", "0%", "12%"),
        # Money, with and without a thousands separator.
        ("228.9", "#,##0.0", "228.9"),
        ("1234.56", "#,##0.0", "1,234.6"),
        ("1234.56", "0.0", "1234.6"),
        ("1234.56", '"$"#,##0', "$1,235"),
        ("1234.56", "$#,##0.0", "$1,234.6"),
        ("1234.56", "£#,##0.00", "£1,234.56"),
        # A multiple. The suffix survives.
        ("9.94", '#,##0.0"x"', "9.9x"),
        # Accounting: negatives in parentheses, from the second section.
        ("-1234.5", "#,##0.0_);(#,##0.0)", "(1,234.5)"),
        ("-1234.5", "#,##0.0", "-1,234.5"),
        ("-0.052", "0.0%;(0.0%)", "(5.2%)"),
        # Half-up, because that is what Excel shows and what a deck copies.
        ("0.125", "0.00%", "12.50%"),
        ("2.345", "0.00", "2.35"),
        # Zero is a number and formats like one.
        ("0", "#,##0.0", "0.0"),
    ],
)
def test_a_number_reads_as_the_workbook_draws_it(
    value: str, code: str, expected: str
) -> None:
    assert show(d(value), code) == expected


@pytest.mark.parametrize(
    "code",
    [
        None,
        "",
        "General",
        # A date cell holds a serial number. « 45,678.0 » would be a worse
        # answer than the serial, and « 3 May 2025 » is not this function's
        # business.
        "dd/mm/yyyy",
        "d mmm yy",
        "[$-409]mmmm d, yyyy",
        "h:mm:ss",
        # Text, and a code with no numeric core at all.
        "@",
        '"n/a"',
    ],
)
def test_what_it_refuses_to_guess_at(code: str | None) -> None:
    assert show(d("1234.5"), code) is None


def test_no_value_is_not_a_format_problem() -> None:
    # A workbook written by a generator and never opened in Excel has
    # formulas and no cached values at all.
    assert show(None, "#,##0.0") is None
