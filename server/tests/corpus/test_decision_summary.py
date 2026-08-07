"""The summary quotes the judgment; it never characterises it.

Every string this module returns is shown to a lawyer as what the court
said. So the tests care about two things above all: that the extracted
passage is genuinely present in the decision, and that a decision we
cannot parse yields nothing rather than something plausible.
"""

from polar.corpus.decision_summary import (
    extract_argued,
    extract_held,
    summarize,
)

DECISION = (
    "ARRÊT N° 090/2018 du 3 mai 2018\n"
    "Sur le rapport de Monsieur le Juge…\n"
    "Attendu que la requérante fait grief à l'arrêt attaqué d'avoir déclaré "
    "irrecevable sa contestation, alors que la dénonciation lui avait été "
    "faite le 12 janvier 2024 ;\n"
    "Attendu qu'aux termes de l'article 170 de l'Acte uniforme, les "
    "contestations sont portées dans le délai d'un mois ;\n"
    "PAR CES MOTIFS\n"
    "Statuant publiquement, après en avoir délibéré,\n"
    "Casse l'Arrêt n° 32 rendu le 8 mars 2006 par la Cour d'Appel de "
    "Niamey ; Evoquant et statuant au fond, Se déclare compétente ;"
)


class TestHeld:
    def test_the_dispositif_is_extracted(self) -> None:
        held = extract_held(DECISION)
        assert held is not None
        assert held.startswith("Casse l'Arrêt n° 32")

    def test_procedural_preamble_is_dropped(self) -> None:
        # « Statuant publiquement, après en avoir délibéré » says nothing
        # about the outcome and would push it out of view.
        held = extract_held(DECISION)
        assert held is not None
        assert "Statuant publiquement" not in held
        assert "délibéré" not in held

    def test_lowercase_dispositif_is_recognised(self) -> None:
        text = "Par ces motifs, Statuant publiquement, Rejette le pourvoi ;"
        held = extract_held(text)
        assert held is not None
        assert held.startswith("Rejette le pourvoi")

    def test_a_decision_without_a_dispositif_yields_nothing(self) -> None:
        assert extract_held("Attendu que le pourvoi est régulier ;") is None
        assert extract_held(None) is None
        assert extract_held("") is None


class TestArgued:
    def test_the_ground_of_appeal_is_extracted(self) -> None:
        argued = extract_argued(DECISION)
        assert argued is not None
        assert argued.startswith("fait grief à l'arrêt attaqué")
        assert "irrecevable sa contestation" in argued

    def test_reproche_is_recognised_too(self) -> None:
        text = "Attendu que le demandeur reproche à la Cour d'appel d'avoir violé l'article 49 ;"
        argued = extract_argued(text)
        assert argued is not None
        assert argued.startswith("reproche à la Cour d'appel")

    def test_a_rejected_complaint_is_not_reported_as_the_ground(self) -> None:
        # « il ne peut lui être fait grief d'avoir saisi… » is the court
        # DISMISSING a complaint. Reporting it as the ground would state
        # the opposite of what was argued.
        text = (
            "Attendu que, dès lors, il ne peut lui être fait grief d'avoir "
            "saisi la juridiction indiquée par le procès-verbal ;"
        )
        assert extract_argued(text) is None

    def test_the_real_ground_is_found_past_a_negated_one(self) -> None:
        text = (
            "Attendu qu'il ne peut être fait grief au juge d'avoir statué ; "
            "Attendu que la société fait grief à l'arrêt d'avoir violé "
            "l'article 170 de l'Acte uniforme ;"
        )
        argued = extract_argued(text)
        assert argued is not None
        assert "d'avoir violé" in argued


class TestQuotationIntegrity:
    def test_extracts_are_present_in_the_source_text(self) -> None:
        # The whole promise: what is shown can be found in the decision.
        summary = summarize(DECISION)
        collapsed = " ".join(DECISION.split())
        for passage in (summary.argued, summary.held):
            assert passage is not None
            assert passage.rstrip("…").strip() in collapsed

    def test_an_unparseable_decision_produces_an_empty_summary(self) -> None:
        summary = summarize("Texte sans structure reconnaissable.")
        assert summary.is_empty
        assert summary.argued is None
        assert summary.held is None

    def test_long_passages_are_clipped_at_a_clause_boundary(self) -> None:
        text = "PAR CES MOTIFS Casse " + "et annule la décision entreprise " * 20
        held = extract_held(text)
        assert held is not None
        assert len(held) <= 261
        assert held.endswith("…")
