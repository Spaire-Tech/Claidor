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
    # Column 1 is the year index. Read sideways the label rule cannot
    # fire — a transposed column's label is its (here blank) header —
    # so the values carry it instead. Registered as costless when it
    # was found here; the E1 measurement priced it at four rows on
    # `kind` and four on `b5_type`, and it was fixed then.
    assert labels[1].b5_type == "date"
    assert labels[1].kind == "categorical"


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


def test_a_run_of_years_is_a_date_index_whichever_way_it_is_read() -> None:
    from polar.tieout.units.inference import RowEvidence, classify_row, orientation

    years = RowEvidence(
        sheet="S",
        row=1,
        row_label="",
        column_labels=[],
        number_formats=["General"],
        values=[2033.0, 2034.0, 2035.0, 2036.0],
    )
    label = classify_row(years, orientation([years]))
    assert label.b5_type == "date"
    assert label.kind == "categorical"


def test_amounts_that_look_like_years_are_not_a_date_index() -> None:
    # The tightness that keeps the rule honest: whole numbers in
    # range but not stepping by one.
    from polar.tieout.units.inference import RowEvidence, classify_row, orientation

    money = RowEvidence(
        sheet="S",
        row=1,
        row_label="Capex",
        column_labels=["FY2024"],
        number_formats=["#,##0"],
        values=[2000.0, 2100.0, 1950.0],
    )
    assert classify_row(money, orientation([money])).b5_type != "date"


# --- the percent convention, decided by the number format (28 Aug) ---
#
# Every case below is a real cell from the founder's fourth research
# round or from our own corpus. Six real models of six agree that the
# format decides; both a value rule and a label rule are 100× wrong
# on one of these.


def test_a_percent_format_means_the_value_is_a_decimal_fraction() -> None:
    from polar.tieout.units.inference import percent_convention

    assert percent_convention(["0.00%"], "%") == "decimal"
    assert percent_convention(['#,##0.0%;\\(0.0%\\);"-"'], "% p.a.") == "decimal"


def test_no_percent_format_means_a_whole_number_of_percent() -> None:
    # Their three whole-number models store 70, 25.17, 9.25 under
    # `General` beside a declared `%`.
    from polar.tieout.units.inference import percent_convention

    assert percent_convention(["General"], "%") == "percent"
    assert percent_convention(["0.00"], "% p.a.") == "percent"


def test_the_cell_that_kills_a_value_rule() -> None:
    # `Module Degradation`, unit `% p.a.`, value 0.5 — half of one
    # percent under a General format. « Below 1 means a fraction » is
    # out by 100× here, so the value is never consulted.
    from polar.tieout.units.inference import percent_convention

    assert percent_convention(["General"], "% p.a.") == "percent"


def test_one_column_can_carry_both_conventions() -> None:
    # An Australian model: Input!E25 = 65 under General, Input!E61 =
    # 0.065 under #,##0.0% — same sheet, same column, opposite
    # conventions. Per-sheet or per-column inference is wrong.
    from polar.tieout.units.inference import percent_convention

    assert percent_convention(["General"], "%") == "percent"
    assert percent_convention(["#,##0.0%"], "p.a.") == "decimal"


def test_a_percent_inside_quotes_is_not_a_percent_format() -> None:
    # Excel printing the character, not scaling the value.
    from polar.tieout.units.inference import is_percent_format

    assert is_percent_format("0.00%")
    assert not is_percent_format('0.0" % of total"')
    assert not is_percent_format("General")


def test_no_format_at_all_abstains() -> None:
    # The whole lesson: a declared « % » with nothing to read it
    # against claims nothing.
    from polar.tieout.units.inference import percent_convention

    assert percent_convention([], "%") == "unknown"
    assert percent_convention([""], "%") == "unknown"


def test_the_rule_inherits_the_files_own_mistakes() -> None:
    # Five cells in our corpus read exactly 2 under '0.0%' on a cost
    # allocation row — 200%. If the author meant 2%, no format rule
    # can know. A property to state, not a defect to hide.
    from polar.tieout.units.inference import percent_convention

    assert percent_convention(['0.0%;\\(0.0%\\);"-"'], "%") == "decimal"


# --- units kept in a column of their own (28 Aug, build item b) ---


def sheet_with_a_units_column():
    """Labels, values, then a narrow units column — no header saying so."""
    cells = {}
    rows = [
        ("Revenue", 1200.0, "£m"),
        ("Costs", -800.0, "£m"),
        ("Capex", -250.0, "£m"),
        ("Gearing", 0.62, "%"),
        ("Volumes", 41.2, "TWh"),
    ]
    for index, (label, value, unit) in enumerate(rows, start=10):
        cells[f"S!1{index}"] = GridCell("S", index, 1, label)
        cells[f"S!2{index}"] = GridCell("S", index, 2, value)
        cells[f"S!3{index}"] = GridCell("S", index, 3, unit)
    return cells


def test_a_units_column_is_found_without_a_header() -> None:
    from polar.tieout.units.columns import find_units_columns

    found = find_units_columns(sheet_with_a_units_column(), "S")
    assert {d.text for d in found} == {"£m", "%", "TWh"}
    assert {d.column for d in found} == {3}
    assert {d.values_column for d in found} == {2}


def test_a_comment_column_is_not_a_units_column() -> None:
    # Long, all-distinct entries: a description, not units.
    from polar.tieout.units.columns import find_units_columns

    cells = {}
    notes = [
        "Uplifted following the July determination",
        "Excludes the Scottish transmission adjustment",
        "Agreed with the licensee in correspondence",
        "Restated for the revised opening balance",
        "Subject to the pending appeal",
    ]
    for index, note in enumerate(notes, start=10):
        cells[f"S!1{index}"] = GridCell("S", index, 1, f"Row {index}")
        cells[f"S!2{index}"] = GridCell("S", index, 2, float(index))
        cells[f"S!3{index}"] = GridCell("S", index, 3, note)
    assert find_units_columns(cells, "S") == []


def test_a_label_column_with_no_values_beside_it_is_not_units() -> None:
    from polar.tieout.units.columns import find_units_columns

    cells = {}
    for index in range(10, 16):
        cells[f"S!1{index}"] = GridCell("S", index, 1, "£m")
    assert find_units_columns(cells, "S") == []


def test_declarations_are_bound_to_their_own_row() -> None:
    from polar.tieout.units.columns import declarations_by_row

    found = declarations_by_row(sheet_with_a_units_column(), ["S"])
    assert found[("S", 13)] == "%"
    assert found[("S", 10)] == "£m"


# --- the scale ladder and the non-unit class (items c and g) ---
#
# Every string below is from a real units column — the research's 27
# models or our own eight closed-deal ones. The four marked as fixes
# were wrong when I first hand-read the parser's output.


def parse(text, formats=("General",)):
    from polar.tieout.units.declarations import parse_declaration

    return parse_declaration(text, formats)


def test_the_scale_ladder_beyond_our_corpus() -> None:
    assert (parse("£m").currency, parse("£m").scale) == ("GBP", "millions")
    assert parse("£'000s").scale == "thousands"
    assert parse("£'000").scale == "thousands"
    assert parse("$MM").scale == "millions"
    assert parse("EUR'000").scale == "thousands"


def test_non_western_scales() -> None:
    # « Lakh/MW/year » and « Cr/year » three rows apart in one Indian
    # model: a 100× step with no currency sign on either.
    assert parse("Lakh/MW/year").scale == "lakh"
    assert parse("Cr/year").scale == "crore"
    assert parse("千").scale == "thousands"
    assert parse("百万").scale == "millions"


def test_a_currency_code_carries_its_currency() -> None:
    # Fix: « USD Billions » has no sign and was read as a scale with
    # no currency at all.
    assert parse("USD Billions").currency == "USD"
    assert parse("USD Billions").scale == "billions"


def test_switches_are_declared_and_never_dimensional() -> None:
    for text in ("Flag", "Factor", "Choice", "Index", "Check", "[1,0]"):
        assert parse(text).not_a_unit, text
        assert parse(text).b5_type == "untyped"


def test_a_switch_may_name_its_own_states() -> None:
    # Fix: « Toggle YES/NO » was refused as unparseable.
    assert parse("Toggle YES/NO").not_a_unit
    assert parse("Y/N").not_a_unit


def test_a_percentage_value_is_a_qualifier_not_a_unit() -> None:
    # Fix: « Indexing at 0% » parsed as a rate. A digit attached to
    # the sign is what separates « 3% inflation » from « % ».
    assert parse("Indexing at 0%").not_a_unit
    assert parse("Indexing at 2.5%").not_a_unit
    assert not parse("%").not_a_unit
    assert not parse("annual real %").not_a_unit


def test_a_declaration_beside_a_unit_is_refused() -> None:
    # Fix: « Date / £m » parsed as a price of pounds per date.
    assert parse("Date / £m").unparseable


def test_a_price_is_a_rate_not_an_amount() -> None:
    priced = parse("£/kWh")
    assert priced.b5_type == "rate"
    assert priced.currency == "GBP"


def test_what_it_cannot_read_it_refuses_by_name() -> None:
    # Physical units are build item (f) and are not built. A refusal
    # naming the text is a real answer about a corpus.
    for text in ("kWh", "m2", "kgCO2/m2", "No of days"):
        assert parse(text).unparseable, text
        assert text in parse(text).why
