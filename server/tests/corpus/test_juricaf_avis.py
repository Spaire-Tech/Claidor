"""Telling an advisory opinion from a judgment.

Juricaf files the CCJA's avis consultatifs among its arrêts, sometimes
under a reference that parses perfectly well as a judgment number
("01/2006/"). Four of them were sitting in the corpus counted as cases.
An avis answers a question put by a State or a national court (Treaty
art. 14) and decides nothing between parties, so counting one inside
« ligne jurisprudentielle constante » overstates the law — which is why
the kind is decided here, from the document's own heading.

The opposite error matters just as much: « lettre recommandée avec
demande d'avis de réception » is ordinary language in a saisie judgment,
and must never turn that judgment into an opinion.
"""

from polar.corpus.juricaf import parse_juricaf_decision_html

URN = (
    "urn:lex;ohada;cour.commune.justice.arbitrage;arret;{date};{tail}"
)


def page(body: str, *, date: str = "2006-10-17", tail: str = "01.2006") -> str:
    return (
        f"<html><head><title>OHADA, Cour commune de justice et d'arbitrage, "
        f"17 octobre 2006, 01/2006/</title></head><body>"
        f"<a href='{URN.format(date=date, tail=tail)}'>urn</a>"
        f"<div>{body}</div></body></html>"
    )


class TestAvisAreRecognised:
    def test_a_plain_heading(self) -> None:
        parsed = parse_juricaf_decision_html(
            page(
                "AVIS N° 01/2006/JN du 17 octobre 2006. La Cour Commune de "
                "Justice et d'Arbitrage, réunie en formation plénière en sa "
                "séance du 17 octobre 2006…"
            )
        )
        assert parsed.kind == "avis"
        # NOT "01/2006": an avis is cited as an avis.
        assert parsed.number == "Avis 001/2006"
        assert parsed.decided_on == "2006-10-17"

    def test_a_scanned_heading_with_letter_o_for_zero(self) -> None:
        parsed = parse_juricaf_decision_html(
            page(
                "Demande d'avis n0 001/99 AVIS N° OO1/99/JN Séance du 7 "
                "juillet 1999. La Cour, réunie en formation plénière…",
                date="1999-07-07",
                tail="avis.001.99.jn",
            )
        )
        assert parsed.kind == "avis"
        assert parsed.number == "Avis 001/1999"

    def test_a_heading_numbered_without_a_year(self) -> None:
        parsed = parse_juricaf_decision_html(
            page(
                "CCJA, Ass. plén., Avis n° 001 du 17 juin 2015. Avis "
                "favorable à l'adoption de la version révisée de l'AUPCAP.",
                date="2015-06-17",
                tail="001",
            )
        )
        assert parsed.kind == "avis"
        assert parsed.number == "Avis 001/2015"

    def test_the_opinion_number_wins_over_the_request_number(self) -> None:
        # « Demande d'Avis n° 001/2015/AC … AVIS N° 03/2015 »: the document
        # is cited by the opinion's number, not the request's.
        parsed = parse_juricaf_decision_html(
            page(
                "Demande d'Avis n° 001/2015/AC de la République du BENIN "
                "AVIS N° 03/2015 du 05 novembre 2015 SEANCE DU 05 NOVEMBRE "
                "2015. La Cour, réunie en formation plénière…",
                date="2015-11-05",
                tail="003.2015",
            )
        )
        assert parsed.kind == "avis"
        assert parsed.number == "Avis 003/2015"


class TestJudgmentsStayJudgments:
    def test_acknowledgment_of_receipt_is_not_an_advisory_opinion(self) -> None:
        parsed = parse_juricaf_decision_html(
            page(
                "L'acte de dénonciation ayant été délaissé à mairie et le "
                "débiteur saisi ayant été avisé de cette remise par lettre "
                "recommandée avec demande d'avis de réception, le délai d'un "
                "mois prévu à l'article 170 court…",
                date="2010-02-04",
                tail="008",
            )
        )
        assert parsed.kind == "arret"

    def test_an_ordinary_arret_is_untouched(self) -> None:
        parsed = parse_juricaf_decision_html(
            page(
                "Sur le pourvoi enregistré au greffe de la Cour de céans, "
                "ARRET N° 022/2014. PAR CES MOTIFS Casse l'arrêt attaqué ;",
                date="2014-03-11",
                tail="022.2014",
            )
        )
        assert parsed.kind == "arret"
        assert parsed.number == "022/2014"
