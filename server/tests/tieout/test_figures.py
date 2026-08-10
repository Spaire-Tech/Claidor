"""What counts as a figure, and what a figure remembers about itself."""

from decimal import Decimal

import pytest

from polar.tieout.figures import Figure, figures_in, parse_number


@pytest.mark.parametrize(
    ("token", "value", "decimals", "kind"),
    [
        ("$228.9mm", Decimal("228.9"), 1, "currency"),
        ("$484mm", Decimal("484"), 0, "currency"),
        ("9.9x", Decimal("9.9"), 1, "multiple"),
        ("21.4%", Decimal("0.214"), 1, "percent"),
        ("$1.2bn", Decimal("1200"), 1, "currency"),
        ("1,213", Decimal("1213"), 0, "plain"),
        ("(96.4)", Decimal("-96.4"), 1, "plain"),
    ],
)
def test_a_printed_figure_keeps_its_units_and_its_precision(
    token: str, value: Decimal, decimals: int, kind: str
) -> None:
    parsed = parse_number(token)
    assert parsed is not None
    assert parsed == (value, decimals, kind)


@pytest.mark.parametrize("token", ["FY2025A", "FY26E", "Q3", "28-Nov-2025", "2025"])
def test_things_that_look_numeric_and_are_not_figures(token: str) -> None:
    assert figures_in(token) == []


def test_a_bare_integer_is_not_a_figure() -> None:
    """« Weeks 16-20 », « 612 », a slide number. The single biggest source
    of precision in the extractor, and the reason the peer table's LTM
    revenue column never reaches the linker at all."""
    assert figures_in("Weeks 16-20") == []
    assert figures_in("612") == []
    assert [f.printed for f in figures_in("$612mm")] == ["$612mm"]


def test_offsets_point_at_the_token_as_printed() -> None:
    """The labels depend on this: a figure is named by the text between it
    and the figure before it, which is only right if the offsets are."""
    line = "Peer median of 9.9x applied to adjusted EBITDA of $48.9mm."
    found = figures_in(line)
    assert [line[f.start : f.end] for f in found] == ["9.9x", "$48.9mm"]


def test_parentheses_are_recorded_not_just_negated() -> None:
    found = figures_in("Less: total debt (96.4)")
    assert found[0].parenthesised is True
    assert figures_in("21.7")[0].parenthesised is False


def test_comparison_happens_at_the_precision_the_deck_chose() -> None:
    """The claim a deck makes when it prints 9.9x is a claim about one
    decimal place. Holding it to the model's fifteen fails every time;
    rounding both to two lets 10.4x pass."""
    printed = Figure(
        printed="9.9x",
        value=Decimal("9.9"),
        decimals=1,
        kind="multiple",
        slide=6,
        label="Median EV / EBITDA",
        location="slide 6",
    )
    model = Decimal("9.90401938065649")
    assert printed.as_printed_precision(model) == Decimal("9.9")
    assert printed.printed_value_at_precision() == Decimal("9.9")

    wrong = Figure(**{**printed.__dict__, "printed": "10.4x", "value": Decimal("10.4")})
    assert wrong.printed_value_at_precision() != wrong.as_printed_precision(model)


def test_a_percentage_is_compared_as_a_fraction() -> None:
    printed = Figure(
        printed="21.4%",
        value=Decimal("0.214"),
        decimals=1,
        kind="percent",
        slide=2,
        label="FY2025A adjusted EBITDA margin",
        location="slide 2",
    )
    assert printed.as_printed_precision(Decimal("0.213630406290957")) == Decimal("21.4")
    assert printed.printed_value_at_precision() == Decimal("21.4")
