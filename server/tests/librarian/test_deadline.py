"""Deadlines are counted by code, and by the right rule.

Two failures sit behind this file. First, a model computed the art. 170
contestation deadline one day short three times running, while quoting the
precedent that shows the correct count — so the arithmetic moved into code.
Second, the code then applied that one-month arithmetic to ANY dated
question mentioning a delay, which would answer the fifteen-day appeal
delay with a one-month date carried under a « vérifié par code » banner.
Both are pinned here.
"""

from datetime import date

from polar.librarian.deadline import (
    APPEL,
    CONTESTATION,
    day_franc_deadline,
    deadline_for,
    identify_delay,
    month_franc_deadline,
    steering_block,
)


class TestCcjaMethod:
    def test_the_arret_030_2010_worked_example(self) -> None:
        # « dénonciation 21 décembre → expiration 23 janvier », the court's
        # own example, quoted in the corpus.
        assert month_franc_deadline(date(2023, 12, 21)).deadline == date(2024, 1, 23)

    def test_the_production_answer_that_was_a_day_short(self) -> None:
        # Three answers said 13 February. The count is 14 February.
        assert month_franc_deadline(date(2024, 1, 12)).deadline == date(2024, 2, 14)

    def test_month_end_start_clamps_then_prorogues(self) -> None:
        # 31 January + 1 month has no 31 February: clamp to 01/03, franc
        # day 02/03 is a Saturday, so it moves to Monday 04/03.
        computed = month_franc_deadline(date(2024, 1, 31))
        assert computed.deadline == date(2024, 3, 4)
        assert computed.deadline.weekday() == 0
        assert any("prorogation" in step for step in computed.derivation)

    def test_a_deadline_already_on_a_working_day_is_left_alone(self) -> None:
        # 30/05 lands on Monday 01/07 by the count itself; prorogation must
        # not add a further day on top of it.
        computed = month_franc_deadline(date(2024, 5, 30))
        assert computed.deadline == date(2024, 7, 1)
        assert not any("prorogation" in step for step in computed.derivation)

    def test_holidays_are_declared_not_applied(self) -> None:
        # Public holidays differ per member state: the derivation says so
        # instead of silently pretending to know them.
        derivation = " ".join(month_franc_deadline(date(2024, 1, 12)).derivation)
        assert "fériés" in derivation
        assert "à vérifier localement" in derivation


class TestDayDelays:
    def test_fifteen_day_franc_appeal_delay(self) -> None:
        # Notification 12/01/2024: 15 days counted to 27/01, dies ad quem
        # excluded → 28/01, a Sunday → Monday 29/01.
        computed = day_franc_deadline(date(2024, 1, 12), APPEL)
        assert computed.deadline == date(2024, 1, 29)

    def test_a_day_delay_states_its_own_duration_and_source(self) -> None:
        block = steering_block(day_franc_deadline(date(2024, 3, 4), APPEL))
        assert "15 jours" in block
        assert "art. 172 AUPSRVE" in block
        assert "notification de la décision" in block


class TestWhichDelayApplies:
    def test_a_contestation_question_gets_the_one_month_rule(self) -> None:
        rule = identify_delay(
            "La saisie a été dénoncée le 12 janvier 2024, dans quel délai contester ?"
        )
        assert rule is CONTESTATION
        assert deadline_for(date(2024, 1, 12), rule).deadline == date(2024, 2, 14)

    def test_an_appeal_question_does_not_get_a_one_month_deadline(self) -> None:
        # The bug this rule exists for: « délai » alone used to trigger a
        # one-month computation, presented to the model as fait foi.
        rule = identify_delay(
            "Le jugement m'a été notifié le 12 janvier 2024. Quel est le "
            "délai pour faire appel ?"
        )
        assert rule is APPEL
        assert deadline_for(date(2024, 1, 12), rule).deadline == date(2024, 1, 29)

    def test_appeal_wins_when_a_question_names_both(self) -> None:
        # « délai d'appel contre la décision tranchant la contestation »
        # mentions both; the question is about the appeal.
        assert (
            identify_delay(
                "Quel est le délai d'appel contre la décision tranchant la "
                "contestation ?"
            )
            is APPEL
        )

    def test_a_delay_we_do_not_compute_gets_no_computation(self) -> None:
        # Prescription runs in years and varies by matter: no date is far
        # better than a confident wrong one.
        assert identify_delay("Quel est le délai de prescription de l'action ?") is None
        assert identify_delay("Dans quel délai le juge doit-il statuer ?") is None

    def test_the_steering_block_names_the_rule_it_used(self) -> None:
        block = steering_block(deadline_for(date(2024, 1, 12), CONTESTATION))
        assert "1 mois" in block
        assert "art. 170 AUPSRVE" in block
        assert "14/02/2024" in block
