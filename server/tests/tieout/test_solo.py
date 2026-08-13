"""The file-against-itself check, rule by rule.

Every rule in `solo.py` earned its place on the public corpus — 29 real
decks by real authors, read by hand before and after each gate. These
tests pin the rules; the numbers behind them live in
`docs/pierce/accuracy-backlog.md`.
"""

from decimal import Decimal
from pathlib import Path

from polar.tieout.deck import read_deck
from polar.tieout.figures import Extraction, Figure
from polar.tieout.solo import Disagreement, disagreements

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"


def figure(label: str, printed: str, value: str, **kwargs: object) -> Figure:
    defaults = dict(
        printed=printed,
        value=Decimal(value),
        decimals=1,
        kind="currency",
        slide=3,
        label=label,
        location="slide 3",
        context=f"{label} of {printed}",
        anchor={"kind": "text", "shape_id": 1, "shape_name": "TextBox 1"},
    )
    defaults.update(kwargs)
    return Figure(**defaults)  # type: ignore[arg-type]


def found(*figures: Figure) -> list[Disagreement]:
    return disagreements(Extraction(figures=list(figures)))


class TestTheDrift:
    def test_one_name_two_figures_is_a_disagreement(self) -> None:
        result = found(
            figure("FY2026E EBITDA", "$48.9mm", "48.9", slide=12),
            figure(
                "FY2026E EBITDA",
                "$49.4mm",
                "49.4",
                slide=21,
                anchor={"kind": "text", "shape_id": 7, "shape_name": "TextBox 7"},
            ),
        )
        assert len(result) == 1
        assert result[0].label == "FY2026E EBITDA"
        assert result[0].first.page == 12
        assert result[0].other.page == 21
        assert result[0].statements == 2

    def test_agreeing_statements_are_silence(self) -> None:
        assert not found(
            figure("FY2026E EBITDA", "$48.9mm", "48.9", slide=12),
            figure("FY2026E EBITDA", "$48.9mm", "48.9", slide=21),
        )

    def test_rounding_is_not_a_disagreement(self) -> None:
        # « $48.9mm » on the summary page and « $48.87mm » in the detail
        # are one figure said at two precisions.
        assert not found(
            figure("FY2026E EBITDA", "$48.9mm", "48.9", slide=2),
            figure("FY2026E EBITDA", "$48.87mm", "48.87", slide=14),
        )

    def test_three_values_is_one_finding(self) -> None:
        result = found(
            figure("FY2026E EBITDA", "$48.9mm", "48.9", slide=2),
            figure("FY2026E EBITDA", "$49.4mm", "49.4", slide=12),
            figure("FY2026E EBITDA", "$50.1mm", "50.1", slide=21),
        )
        assert len(result) == 1
        assert result[0].statements == 3


class TestWhatAlabelIs:
    def test_the_year_is_part_of_the_name(self) -> None:
        # `tokens` drops bare years; the solo key must not. « 2018 Aldi »
        # against « 2019 Aldi » was eleven of the corpus false positives.
        assert not found(
            figure("2018 Aldi", "45%", "0.45", kind="percent", slide=5),
            figure("2019 Aldi", "1.35%", "0.0135", kind="percent", slide=14),
        )

    def test_a_fragment_is_not_a_name(self) -> None:
        # « Events = » is the front half of a sentence about one exam
        # board; the words telling two boards apart came after the number.
        assert not found(
            figure("Events =", "6,080", "6080", kind="plain"),
            figure("Events =", "5,514", "5514", kind="plain", slide=18),
        )

    def test_one_word_is_a_heading_not_a_name(self) -> None:
        # « Average » names a row of whatever table it sits in.
        assert not found(
            figure("Average", "4.55", "4.55", kind="plain", slide=23),
            figure("Average", "4.7", "4.7", kind="plain", slide=24),
        )

    def test_different_kinds_never_disagree(self) -> None:
        assert not found(
            figure("FY2026E EBITDA margin", "19.3%", "0.193", kind="percent"),
            figure("FY2026E EBITDA margin", "$39.6mm", "39.6", slide=9),
        )


class TestWhereAfigureSits:
    def test_points_inside_one_chart_are_data_not_statements(self) -> None:
        chart = {"kind": "chart", "shape_id": 4, "shape_name": "Chart 0"}
        assert not found(
            figure("Double mark score", "7.5", "7.5", kind="plain", anchor=chart),
            figure(
                "Double mark score",
                "8.5",
                "8.5",
                kind="plain",
                anchor={**chart, "point": 1},
            ),
        )

    def test_two_charts_never_disagree_with_each_other(self) -> None:
        assert not found(
            figure(
                "Yes 2018 share",
                "52%",
                "0.52",
                kind="percent",
                slide=8,
                anchor={"kind": "chart", "shape_id": 4, "shape_name": "Chart 3"},
            ),
            figure(
                "Yes 2018 share",
                "49%",
                "0.49",
                kind="percent",
                slide=10,
                anchor={"kind": "chart", "shape_id": 6, "shape_name": "Chart 5"},
            ),
        )

    def test_a_chart_against_a_table_is_the_real_thing(self) -> None:
        # The Cascade drift: same slide, same shape_id even — PowerPoint
        # numbers charts and tables independently — but two shapes.
        result = found(
            figure(
                "Adjusted EBITDA FY2023A",
                "37.8",
                "37.8",
                anchor={"kind": "chart", "shape_id": 4, "shape_name": "Chart 0"},
            ),
            figure(
                "Adjusted EBITDA FY2023A",
                "30.8",
                "30.8",
                anchor={"kind": "table", "shape_id": 4, "shape_name": "Table 0"},
            ),
        )
        assert len(result) == 1

    def test_paragraphs_are_always_two_places(self) -> None:
        # Memo anchors carry no shape identity, and must never be merged
        # into « one shape » by the absence of one.
        result = found(
            figure(
                "purchase price for Falcon",
                "$455mm",
                "455",
                slide=0,
                anchor={"kind": "paragraph", "paragraph": 4},
            ),
            figure(
                "purchase price for Falcon",
                "$462mm",
                "462",
                slide=0,
                anchor={"kind": "paragraph", "paragraph": 19},
            ),
        )
        assert len(result) == 1


class TestCascade:
    def test_both_decks_catch_the_chart_table_drift_and_nothing_else(self) -> None:
        # The « clean » deck genuinely carries this drift — its slide-3
        # chart was drawn from pre-adjustment EBITDA and never redrawn
        # (see deck.py). Both decks, the same two findings, nothing more.
        for name in ("cascade_deck.pptx", "cascade_deck_broken.pptx"):
            result = disagreements(read_deck(str(CASCADE / name)))
            assert [
                (one.label, one.first.printed, one.other.printed) for one in result
            ] == [
                ("Adjusted EBITDA FY2023A", "37.8", "30.8"),
                ("Adjusted EBITDA FY2024A", "43.0", "39.6"),
            ], name
