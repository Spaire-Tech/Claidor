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


# --- propagation through the dependency graph ---


class FakeCell:
    def __init__(self, ref, formula=None, precedents=()):
        self.ref = ref
        self.formula = formula
        self.precedents = precedents
        self.sheet = ref.split("!")[0]


def money(currency="GBP", scale="millions"):
    from polar.tieout.units.inference import UnitLabel

    return UnitLabel(
        kind="continuous",
        b5_type="money",
        currency=currency,
        scale=scale,
        period="annual",
        rate_form="not-a-rate",
        why="seed",
    )


def test_a_sum_carries_the_unit_of_its_terms() -> None:
    from polar.tieout.units.inference import propagate

    cells = {
        "M!A1": FakeCell("M!A1"),
        "M!A2": FakeCell("M!A2"),
        "M!A3": FakeCell("M!A3", "=SUM(A1:A2)", ("M!A1", "M!A2")),
        "M!A4": FakeCell("M!A4", "=A3+A1", ("M!A3", "M!A1")),
    }
    known, conflicts = propagate(cells, {"M!A1": money(), "M!A2": money()})
    assert known["M!A3"].currency == "GBP"
    assert known["M!A3"].scale == "millions"
    assert known["M!A4"].currency == "GBP"  # two hops
    assert conflicts == []


def test_terms_whose_units_disagree_are_recorded_not_averaged() -> None:
    from polar.tieout.units.inference import propagate

    cells = {
        "M!A1": FakeCell("M!A1"),
        "M!A2": FakeCell("M!A2"),
        "M!A3": FakeCell("M!A3", "=A1+A2", ("M!A1", "M!A2")),
    }
    known, conflicts = propagate(
        cells, {"M!A1": money(scale="millions"), "M!A2": money(scale="units")}
    )
    assert "M!A3" not in known
    assert conflicts
    assert conflicts[0].ref == "M!A3"
    assert "disagree" in conflicts[0].why


def test_dividing_like_by_like_is_dimensionless() -> None:
    from polar.tieout.units.inference import propagate

    cells = {
        "M!A1": FakeCell("M!A1"),
        "M!A2": FakeCell("M!A2"),
        "M!A3": FakeCell("M!A3", "=A1/A2", ("M!A1", "M!A2")),
    }
    known, _ = propagate(cells, {"M!A1": money(), "M!A2": money()})
    assert known["M!A3"].b5_type == "rate"
    assert known["M!A3"].currency == "none"


def test_propagation_stops_where_it_knows_nothing() -> None:
    from polar.tieout.units.inference import propagate

    cells = {"M!A1": FakeCell("M!A1"), "M!A2": FakeCell("M!A2", "=A1*2", ("M!A1",))}
    known, conflicts = propagate(cells, {})
    assert known == {}
    assert conflicts == []


# --- the five ways propagation got this wrong on real models ---
#
# Every test below is a bug the ED2 and GD3 workbooks found first: the
# fix is in the module, and the case is here so it stays fixed.


def rate():
    from polar.tieout.units.inference import UnitLabel

    return UnitLabel(
        kind="continuous",
        b5_type="rate",
        currency="none",
        scale="units",
        period="annual",
        rate_form="decimal",
        why="seed",
    )


def test_a_sum_that_leads_a_product_is_not_a_sum() -> None:
    # `=SUM(AP65:AP67) * AP$16` opens with SUM and is a product.
    # Reading it as a sum made £m × dimensionless a unit conflict.
    from polar.tieout.units.inference import propagate

    cells = {
        "M!A1": FakeCell("M!A1"),
        "M!A2": FakeCell("M!A2"),
        "M!A3": FakeCell("M!A3", "=SUM(A1:A1) * A2", ("M!A1", "M!A2")),
    }
    known, conflicts = propagate(cells, {"M!A1": money(), "M!A2": rate()})
    assert conflicts == []
    assert known["M!A3"].currency == "GBP"
    assert known["M!A3"].scale == "millions"


def test_a_product_takes_the_unit_of_its_moneyed_factor() -> None:
    # Taking the first *known* factor instead of the first *moneyed*
    # one labelled « rate × £m » dimensionless whenever the rate came
    # first in precedent order, poisoning every sum below it.
    from polar.tieout.units.inference import propagate

    cells = {
        "M!A1": FakeCell("M!A1"),
        "M!A2": FakeCell("M!A2"),
        "M!A3": FakeCell("M!A3", "=A1*A2", ("M!A1", "M!A2")),
    }
    known, _ = propagate(cells, {"M!A1": rate(), "M!A2": money()})
    assert known["M!A3"].currency == "GBP"
    assert known["M!A3"].scale == "millions"


def test_a_product_with_an_unlabelled_factor_abstains() -> None:
    # `-(SUM($AI101:AQ101))*AR98`: the amounts are blank in the file
    # and only the rate is labelled. « Dimensionless » would be a
    # guess about the blank row, so nothing is claimed.
    from polar.tieout.units.inference import propagate

    cells = {
        "M!A1": FakeCell("M!A1"),
        "M!A2": FakeCell("M!A2"),
        "M!A3": FakeCell("M!A3", "=A1*A2", ("M!A1", "M!A2")),
    }
    known, conflicts = propagate(cells, {"M!A1": rate()})
    assert "M!A3" not in known
    assert conflicts == []


def test_only_a_bare_ratio_is_read_as_dimensionless() -> None:
    # `(AP83/AP$13 - AP84) * AP$16` contains a « / » and is money:
    # £m over an inflation index, less £m, times a factor. Calling it
    # dimensionless put 18 revenue rows into phantom conflict.
    from polar.tieout.units.inference import propagate

    cells = {
        "M!A1": FakeCell("M!A1"),
        "M!A2": FakeCell("M!A2"),
        "M!A3": FakeCell("M!A3"),
        "M!A4": FakeCell("M!A4", "=(A1/A3 - A2) * A3", ("M!A1", "M!A2", "M!A3")),
    }
    known, conflicts = propagate(cells, {"M!A1": money(), "M!A2": money()})
    assert conflicts == []
    assert known["M!A4"].currency == "GBP"


def test_a_conclusion_is_revised_when_the_other_terms_arrive() -> None:
    # A 20k-cell model is walked in dictionary order, so a sum is
    # reached before some of its own terms. A conclusion drawn from
    # two of five terms and never revisited missed the disagreement
    # that arrived later — 14 of 20 planted mismatches, on ED2.
    from polar.tieout.units.inference import propagate

    cells = {
        # The sum comes first in iteration order, on purpose.
        "M!A9": FakeCell("M!A9", "=A1+A8", ("M!A1", "M!A8")),
        "M!A1": FakeCell("M!A1"),
        "M!A7": FakeCell("M!A7"),
        "M!A8": FakeCell("M!A8", "=A7+A7", ("M!A7",)),
    }
    known, conflicts = propagate(
        cells, {"M!A1": money(scale="millions"), "M!A7": money(scale="units")}
    )
    assert "M!A9" not in known
    assert [c.ref for c in conflicts] == ["M!A9"]


# --- reading a record sheet sideways (registered 28 Aug) ---


class GridCell:
    def __init__(
        self,
        sheet,
        row,
        column,
        value,
        row_label="",
        column_label="",
        number_format="General",
    ):
        self.sheet = sheet
        self.row = row
        self.column = column
        self.value = value
        self.formula = None
        self.row_label = row_label
        self.column_label = column_label
        self.number_format = number_format


def record_sheet():
    """Years down, RPI and CPI across — the shape that broke the typing.

    Each row is labelled with its year and holds that year's number,
    so read row-wise every row is « a year holding its own year »
    and three real rates freeze.
    """
    cells = {}
    for index, year in enumerate((2022, 2023, 2024), start=6):
        for column, header, value, fmt in (
            (1, "", float(year), "General"),
            (2, "RPI", 5.8 + index, "0.00"),
            (3, "CPI", 4.0 + index, "0.00"),
        ):
            cells[f"S!{column}{index}"] = GridCell(
                "S",
                index,
                column,
                value,
                row_label=f"{year - 1}/{str(year)[2:]}",
                column_label=header,
                number_format=fmt,
            )
    return cells


def test_read_row_wise_a_record_row_is_a_year_and_its_rates_freeze() -> None:
    # The defect itself, held as a test so the fix has something to
    # be a fix of. Measured on the RoE model: 26 rate cells typed
    # `date`, coverage 10 of 193 down to 0.
    from polar.tieout.units.inference import classify_sheet, rows_from_cells

    labels = classify_sheet(rows_from_cells(record_sheet(), "S"))
    assert all(label.b5_type == "date" for label in labels.values())


def test_read_sideways_the_rate_columns_are_rates() -> None:
    from polar.tieout.units.inference import classify_columns, columns_from_cells

    labels = classify_columns(columns_from_cells(record_sheet(), "S"))
    # Columns 2 and 3 are RPI and CPI, and read sideways they stop
    # being dates — which is the fix.
    assert labels[2].b5_type != "date"
    assert labels[3].b5_type != "date"
    # Column 1 is the year index, and this is the round's registered
    # surprise: read sideways it is **not** recognised as a date.
    # The year-index rule reads the *row label*, and a transposed
    # column's label is its (here blank) header. It lands on
    # `unknown-quantity`, which B5 holds — right outcome, wrong
    # reason — so it costs no coverage and is registered as the next
    # round's fix rather than patched mid-round.
    assert labels[1].b5_type == "unknown-quantity"


def test_a_transposed_column_carries_the_headers_row_labels() -> None:
    from polar.tieout.units.inference import columns_from_cells

    columns = dict(columns_from_cells(record_sheet(), "S"))
    assert columns[2].row_label == "RPI"
    assert list(columns[2].column_labels) == ["2021/22", "2022/23", "2023/24"]
    assert columns[2].values == [11.8, 12.8, 13.8]


# --- rate form read from usage (registered 28 Aug) ---


def consumer_sheet(consumer_formula, precedents=("S!C6",)):
    cells = {
        "S!C6": GridCell(
            "S",
            6,
            3,
            5.8,
            row_label="2021/22",
            column_label="RPI",
            number_format="0.00",
        ),
        "S!F6": GridCell("S", 6, 6, 0.0, row_label="2021/22", column_label="wedge"),
    }
    cells["S!F6"].formula = consumer_formula
    cells["S!F6"].precedents = precedents
    return cells


def test_a_row_its_consumers_divide_by_100_is_a_percent() -> None:
    # The RoE blocker, from the model's own formula.
    from polar.tieout.units.inference import rate_form_from_usage

    verdicts = rate_form_from_usage(consumer_sheet("=GEOMEAN(1+(C6:C25/100))-1"))
    assert verdicts["S!C6"][0] == "percent"


def test_a_row_a_consumer_names_in_one_plus_is_a_decimal() -> None:
    from polar.tieout.units.inference import rate_form_from_usage

    verdicts = rate_form_from_usage(consumer_sheet("=(1+C6)*100"))
    assert verdicts["S!C6"][0] == "decimal"


def test_a_bare_one_plus_elsewhere_is_not_evidence_about_this_row() -> None:
    # The measured false positive: matching « 1 + » anywhere in a
    # consumer turned ten of E1's inflation *index* rows into
    # « decimal rates » and took rate_form from 80/4 to 71/14.
    from polar.tieout.units.inference import rate_form_from_usage

    verdicts = rate_form_from_usage(consumer_sheet("=C6*(1+$B$2)"))
    assert "S!C6" not in verdicts


def test_a_row_consumed_both_ways_is_an_abstention() -> None:
    from polar.tieout.units.inference import rate_form_from_usage

    cells = consumer_sheet("=(C6/100) + 1 + C6")
    verdicts = rate_form_from_usage(cells)
    assert "S!C6" not in verdicts


def test_usage_never_overturns_a_format_that_already_decided() -> None:
    from polar.tieout.units.inference import UnitLabel, with_usage

    decided = UnitLabel(
        kind="continuous",
        b5_type="rate",
        currency="none",
        scale="units",
        period="annual",
        rate_form="percent",
        why="the number format says so",
    )
    assert with_usage(decided, ("decimal", "consumers add it to 1")) == decided
