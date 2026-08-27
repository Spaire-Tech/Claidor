"""E2's inference on hand-built evidence whose right answer is known.

Every case here is a row I could label myself in one glance, so the
test says what the module *should* conclude — including the cases
where it should conclude nothing.
"""

from polar.tieout.units import Orientation, classify_sheet, orientation
from polar.tieout.units.inference import RowEvidence, classify_row


def row(**kw) -> RowEvidence:
    base = dict(
        sheet="S", row=1, row_label="", column_labels=(), number_formats=(), values=()
    )
    base.update(kw)
    return RowEvidence(**base)


# --- orientation, decided before anything is typed ---


def test_period_headers_make_a_sheet_read_row_wise() -> None:
    rows = [
        row(row_label="Opex", column_labels=("FY2024", "FY2025"), values=(1.0, 2.0))
    ]
    assert orientation(rows) is Orientation.ROW_WISE


def test_field_headers_make_a_sheet_read_column_wise() -> None:
    rows = [
        row(
            row_label="45961-8",
            column_labels=("Date", "Maturity"),
            values=(45961.0, 8.0),
        )
    ]
    assert orientation(rows) is Orientation.COLUMN_WISE


def test_a_record_row_is_labelled_mixed_never_typed() -> None:
    rows = [
        row(
            row_label="45961-8",
            column_labels=("Date", "Maturity"),
            values=(45961.0, 8.0, 4.3),
        )
    ]
    labels = classify_sheet(rows)
    label = labels[("S", 1)]
    assert label.kind == "mixed"
    assert "record" in label.why


# --- the decisive formats ---


def test_a_percent_format_is_a_rate_stored_as_a_decimal() -> None:
    label = classify_row(
        row(
            row_label="Risk-free rate",
            column_labels=("FY2024",),
            number_formats=("0.00%",),
            values=(0.0146,),
        )
    )
    assert (label.kind, label.b5_type, label.rate_form) == (
        "continuous",
        "rate",
        "decimal",
    )
    assert label.period == "annual"


def test_a_date_format_is_categorical_and_never_scaled() -> None:
    label = classify_row(row(number_formats=("mm-dd-yy",), values=(47331.0,)))
    assert (label.kind, label.b5_type) == ("categorical", "date")


def test_a_year_row_holding_its_own_year_is_an_index() -> None:
    label = classify_row(
        row(row_label="2033/34", number_formats=("General",), values=(2034.0,))
    )
    assert (label.kind, label.b5_type) == ("categorical", "date")
    assert "year" in label.why


def test_tenor_headers_mark_a_rate_curve_in_percent() -> None:
    label = classify_row(
        row(
            row_label="FY2020",
            column_labels=("ON", "1W"),
            number_formats=("0.0000",),
            values=(0.0659, 0.148),
        )
    )
    assert (label.b5_type, label.rate_form) == ("rate", "percent")


# --- abstention is a first-class outcome ---


def test_scale_is_never_guessed_from_magnitude() -> None:
    # A plain £m-style amount with no declared units: continuous and
    # annual are supported by the headers; scale and currency are not.
    label = classify_row(
        row(
            row_label="Actual controllable opex",
            column_labels=("FY2024", "FY2025"),
            number_formats=("#,##0.0_);\\(#,##0.0\\)",),
            values=(43.13, 43.21),
        )
    )
    assert label.kind == "continuous"
    assert label.period == "annual"
    assert label.scale == "unknown"
    assert label.currency == "unknown"


def test_nothing_decisive_means_nothing_claimed() -> None:
    label = classify_row(row(number_formats=("0.0",), values=(2.8,)))
    assert label.kind == "unknown"
    assert label.b5_type == "untyped"


def test_a_currency_in_the_format_gives_currency_but_not_scale() -> None:
    label = classify_row(
        row(
            row_label="Fees",
            column_labels=("FY2024",),
            number_formats=('"£"#,##0.0',),
            values=(12.0,),
        )
    )
    assert label.currency == "GBP"
    assert label.scale == "unknown"


# --- the Units column: read only when the caller asks ---


def test_the_units_column_is_ignored_unless_the_caller_opts_in() -> None:
    rows = [
        row(
            row_label="Opex",
            column_labels=("FY2027",),
            number_formats=("#,##0.0",),
            values=(31.0,),
            declared_units="£m 23/24 prices",
        )
    ]
    blind = classify_sheet(rows)[("S", 1)]
    assert blind.declared is False
    assert blind.scale == "unknown"

    sighted = classify_sheet(rows, read_declared=True)[("S", 1)]
    assert sighted.declared is True
    assert (sighted.currency, sighted.scale, sighted.b5_type) == (
        "GBP",
        "millions",
        "money",
    )
