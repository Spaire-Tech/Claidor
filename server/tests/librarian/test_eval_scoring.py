"""The conclusion checker must catch the failure the judges waved through.

Three production answers computed a deadline one day short. Every citation
in them was real and supported its sentence, so citation_precision stayed
high and the harness reported success. The literal check exists so that a
wrong date fails in code, without asking a model's opinion about it.
"""

from scripts.librarian_eval import check_conclusion_literally

DEADLINE = {
    "must_contain": [["14 février 2024", "14/02/2024"]],
    "must_not_contain": ["13 février", "13/02/2024"],
}


class TestLiteralConclusionChecks:
    def test_the_right_date_passes(self) -> None:
        answer = "Le dernier jour utile pour contester est le 14 février 2024."
        assert check_conclusion_literally(answer, DEADLINE) == []

    def test_an_alternative_notation_is_accepted(self) -> None:
        assert check_conclusion_literally("dernier jour : 14/02/2024.", DEADLINE) == []

    def test_the_day_short_answer_fails(self) -> None:
        # The exact regression: fluent, well-cited, and wrong.
        answer = (
            "Le dernier jour utile est le 13 février 2024. Aux termes de "
            "l'article 170 AUPSRVE, la contestation doit être formée dans "
            "le mois de la dénonciation."
        )
        failures = check_conclusion_literally(answer, DEADLINE)
        assert len(failures) == 2
        assert any("manque" in f for f in failures)
        assert any("conclusion erronée" in f for f in failures)

    def test_a_correct_answer_may_show_its_intermediate_steps(self) -> None:
        # The derivation passes through 13/02 on the way to 14/02. A right
        # answer must not be failed for showing its work.
        answer = (
            "Le dernier jour utile pour contester est le 14 février 2024.\n\n"
            "Dérivation : dies a quo (12/01/2024) exclu, le délai court du "
            "13/01/2024 ; même quantième un mois plus tard, 13/02/2024 ; "
            "dies ad quem exclu, dernier jour 14/02/2024."
        )
        assert check_conclusion_literally(answer, DEADLINE) == []

    def test_a_missing_date_fails_even_if_nothing_wrong_is_said(self) -> None:
        answer = "La contestation se forme dans le délai d'un mois franc."
        assert check_conclusion_literally(answer, DEADLINE) == [
            "manque : 14 février 2024 | 14/02/2024"
        ]

    def test_matching_ignores_case_and_line_wrapping(self) -> None:
        # Answers are wrapped prose; the date must still be found across a
        # newline and regardless of capitalisation.
        answer = "Dernier jour utile :\n   14 FÉVRIER\n   2024."
        assert check_conclusion_literally(answer, DEADLINE) == []

    def test_every_required_group_must_be_present(self) -> None:
        conclusion = {"must_contain": [["huit jours", "8 jours"], ["caducité"]]}
        answer = "La dénonciation intervient dans les huit jours."
        assert check_conclusion_literally(answer, conclusion) == ["manque : caducité"]

    def test_a_conclusion_without_literal_checks_never_fails_here(self) -> None:
        # Prose conclusions are the judge's business, not the checker's.
        assert check_conclusion_literally("n'importe quoi", {"statement": "x"}) == []
