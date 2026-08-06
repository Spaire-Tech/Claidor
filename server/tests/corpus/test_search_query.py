from polar.corpus.search_query import (
    QueryKind,
    normalize_decision_number,
    parse_query,
)


class TestCitationShapedQueries:
    """The queries practitioners actually type land on the document."""

    def test_article_with_act(self) -> None:
        parsed = parse_query("article 170 AUPSRVE")
        assert parsed.kind == QueryKind.article
        assert parsed.number == "170"
        assert parsed.act_code == "AUPSRVE"

    def test_abbreviated_article(self) -> None:
        parsed = parse_query("art. 160-2")
        assert parsed.kind == QueryKind.article
        assert parsed.number == "160-2"
        assert parsed.act_code is None

    def test_compound_article_number(self) -> None:
        assert parse_query("art 245-11 aupsrve").number == "245-11"

    def test_act_code_then_bare_number(self) -> None:
        parsed = parse_query("AUPSRVE 170")
        assert parsed.kind == QueryKind.article
        assert parsed.number == "170"
        assert parsed.act_code == "AUPSRVE"

    def test_decision_number(self) -> None:
        parsed = parse_query("CCJA 090/2018")
        assert parsed.kind == QueryKind.decision
        assert parsed.number == "090/2018"
        assert parsed.year == 2018

    def test_decision_number_wins_over_article_pattern(self) -> None:
        # "arrêt n° 22/2010" contains digits an article rule would claim.
        parsed = parse_query("arrêt n° 22/2010")
        assert parsed.kind == QueryKind.decision
        assert parsed.number == "22/2010"

    def test_long_form_act_name(self) -> None:
        parsed = parse_query("article 49 voies d'exécution")
        assert parsed.act_code == "AUPSRVE"
        assert parsed.number == "49"

    def test_act_alias_does_not_fire_inside_another_code(self) -> None:
        # "aus" must not match inside "auscgie".
        assert parse_query("article 137 AUSCGIE").act_code == "AUSCGIE"
        assert parse_query("article 137 AUS").act_code == "AUS"


class TestTextQueries:
    def test_plain_question_is_text(self) -> None:
        parsed = parse_query("délai de contestation de la saisie-attribution")
        assert parsed.kind == QueryKind.text
        assert parsed.number is None

    def test_court_without_a_year_does_not_guess_a_decision(self) -> None:
        parsed = parse_query("CCJA saisie attribution")
        assert parsed.kind == QueryKind.text
        assert parsed.number is None

    def test_topic_with_act_keeps_the_act_as_a_filter(self) -> None:
        parsed = parse_query("saisie-attribution AUPSRVE")
        assert parsed.kind == QueryKind.text
        assert parsed.act_code == "AUPSRVE"

    def test_empty_query(self) -> None:
        assert parse_query("   ").kind == QueryKind.text


class TestDecisionNumberNormalization:
    def test_zero_padding_is_ignored(self) -> None:
        assert normalize_decision_number("090/2018") == "90/2018"
        assert normalize_decision_number("90/2018") == "90/2018"

    def test_non_matching_form_is_returned_as_is(self) -> None:
        assert normalize_decision_number("J-16-198") == "J-16-198"
