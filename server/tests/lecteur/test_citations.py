"""The reader may miss a citation; it may never invent one.

Everything the Lecteur reports is shown to a lawyer as something the
*other side* wrote. A missed reference costs a check they would have done
anyway; a reference that is not in the document costs their credibility in
front of a court. So these tests care most about what extraction refuses
to do: read a date as an article number, attach an act that sits nowhere
near the reference, or produce a reference whose span does not quote back.
"""

from polar.lecteur.citations import extract

CONCLUSIONS = (
    "Attendu que la saisie-attribution pratiquée le 3 mars 2023 est nulle "
    "au regard des articles 157 et 160 de l'AUPSRVE ; que la contestation "
    "est recevable en application de l'article 170 AUPSRVE (2023) ;\n"
    "Que la Cour de céans a jugé, dans son arrêt n° 090/2018 du 24 mai "
    "2018, que le délai de l'article 49 court à compter de la "
    "dénonciation ;\n"
    "Que l'article 14 de l'AUS impose la mention manuscrite, ensemble les "
    "articles 33, 34 et 35 du même Acte uniforme."
)


def numbers(text: str, kind: str = "article") -> list[str]:
    return [c.number for c in extract(text) if c.kind == kind]


class TestArticles:
    def test_reads_every_number_under_one_heading(self) -> None:
        assert numbers("les articles 33, 34 et 35 de l'AUS") == ["33", "34", "35"]

    def test_reads_a_range_by_its_endpoints(self) -> None:
        # « articles 157 à 160 » — the two written numbers, not the four
        # implied ones: only what the document says is quotable back.
        assert numbers("les articles 157 à 160 de l'AUPSRVE") == ["157", "160"]

    def test_keeps_sub_article_numbering(self) -> None:
        assert numbers("l'article 160-2 AUPSRVE") == ["160-2"]

    def test_a_date_after_a_comma_is_not_an_article(self) -> None:
        assert numbers("l'article 170, 12 avril 2023, a été respecté") == ["170"]

    def test_the_verb_a_is_not_a_range(self) -> None:
        # « à » ranges; « a » is the verb. Reading the second as the first
        # would invent an article 5 that the document never cites.
        assert numbers("l'article 3 a 5 alinéas") == ["3"]

    def test_abbreviated_form(self) -> None:
        assert numbers("art. 49 AUPSRVE") == ["49"]

    def test_no_reference_no_finding(self) -> None:
        assert extract("Attendu que la demande est mal fondée.") == []
        assert extract("") == []


class TestActAttachment:
    def test_nearest_act_wins(self) -> None:
        text = (
            "les articles 169 et 170 AUPSRVE, ensemble l'article 33 de l'AUS"
        )
        by_number = {c.number: c.act for c in extract(text)}
        assert by_number == {"169": "AUPSRVE", "170": "AUPSRVE", "33": "AUS"}

    def test_act_named_in_words(self) -> None:
        text = "l'article 14 de l'Acte uniforme portant organisation des sûretés"
        assert extract(text)[0].act == "AUS"

    def test_no_act_named_leaves_it_open(self) -> None:
        # Better an unattached reference than one attached to a guess.
        assert extract("l'article 49 doit recevoir application")[0].act is None

    def test_société_commerciale_is_not_the_sûretés_act(self) -> None:
        assert extract("l'article 387 de l'AUSCGIE")[0].act == "AUSCGIE"


class TestVersionClaims:
    def test_parenthesised_year_is_read_as_a_version(self) -> None:
        assert extract("l'article 170 AUPSRVE (2023)")[0].version == "2023"

    def test_rédaction_de_is_read_as_a_version(self) -> None:
        assert extract("l'article 49, rédaction de 1998")[0].version == "1998"

    def test_a_date_year_is_not_a_version_claim(self) -> None:
        # « du 24 mai 2018 » dates the decision; it claims nothing about
        # which wording of the act applies.
        assert extract("l'article 49, appliqué le 24 mai 2018")[0].version is None


class TestDecisions:
    def test_reads_the_court_and_number(self) -> None:
        assert numbers("CCJA, arrêt n° 090/2018 du 24 mai 2018", "decision") == [
            "090/2018"
        ]

    def test_pads_the_number_as_the_court_writes_it(self) -> None:
        assert numbers("arrêt n° 90/2018", "decision") == ["090/2018"]

    def test_chamber_between_court_and_number(self) -> None:
        assert numbers("CCJA, 1re ch., arrêt n° 022/2014", "decision") == [
            "022/2014"
        ]

    def test_a_bare_year_is_not_a_decision(self) -> None:
        assert numbers("la loi du 12/2018 n'est pas visée", "decision") == []


class TestQuotability:
    def test_every_span_quotes_back_to_the_document(self) -> None:
        for citation in extract(CONCLUSIONS):
            assert CONCLUSIONS[citation.start : citation.end] == citation.raw
            assert citation.number in citation.raw

    def test_context_comes_from_the_document(self) -> None:
        for citation in extract(CONCLUSIONS):
            # Whitespace is normalised; the words are the document's.
            assert citation.context
            assert citation.context in " ".join(CONCLUSIONS.split())

    def test_findings_are_in_reading_order(self) -> None:
        positions = [c.start for c in extract(CONCLUSIONS)]
        assert positions == sorted(positions)


class TestDeduplication:
    def test_the_same_reference_twice_is_one_finding(self) -> None:
        text = "l'article 49 AUPSRVE … et encore l'article 49 AUPSRVE"
        assert numbers(text) == ["49"]

    def test_the_version_claim_survives_the_versionless_repeat(self) -> None:
        text = "l'article 170 AUPSRVE (2023) … puis l'article 170 AUPSRVE"
        found = extract(text)
        assert [(c.number, c.version) for c in found] == [("170", "2023")]

    def test_the_same_number_in_two_acts_is_two_findings(self) -> None:
        text = "l'article 33 de l'AUS et l'article 33 de l'AUPSRVE"
        assert [(c.number, c.act) for c in extract(text)] == [
            ("33", "AUS"),
            ("33", "AUPSRVE"),
        ]
