"""What the Lecteur is allowed to say about someone else's citations.

The screen puts three words next to a reference — vérifiée, à vérifier,
point faible — and a lawyer will repeat them in front of a court. So the
line between them is tested here rather than left to prose: a reference is
only a « point faible » when it is wrong on its face, and never merely
because our collection does not hold it.
"""

from datetime import date

import pytest

from polar.kit.db.postgres import AsyncSession
from polar.lecteur.citations import Finding
from polar.lecteur.service import lecteur_service
from polar.models import (
    CourtDecision,
    DecisionArticleLink,
    DecisionArticleTreatment,
    DecisionKind,
    DecisionLinkStatus,
    LegalAct,
    LegalActVersion,
    LegalArticle,
    TreatmentStatus,
)
from tests.fixtures.database import SaveFixture

REFORM = date(2024, 2, 16)

#: Reworded, not replaced — the rule survives its revision.
OLD_170 = (
    "À peine d'irrecevabilité, les contestations sont portées devant la "
    "juridiction compétente dans le délai d'un mois à compter de la "
    "dénonciation de la saisie au débiteur."
)
NEW_170 = (
    "À peine d'irrecevabilité, les contestations sont portées devant la "
    "juridiction compétente dans le délai d'un mois à compter de la "
    "dénonciation de la saisie au débiteur saisi."
)
#: Replaced: same number, different provision.
OLD_49 = "La juridiction compétente pour statuer sur tout litige est le président."
NEW_49 = (
    "En matière mobilière, la demande est portée devant le juge de "
    "l'exécution qui statue dans un délai de deux mois."
)
#: Untouched between the two rédactions.
DELAIS = "Les délais prévus dans le présent Acte uniforme sont des délais francs."


class Corpus:
    def __init__(self) -> None:
        self.arret: CourtDecision
        self.avis: CourtDecision


async def _corpus(save_fixture: SaveFixture) -> Corpus:
    fixture = Corpus()
    act = LegalAct(short_code="AUPSRVE", title="Voies d'exécution")
    await save_fixture(act)
    old = LegalActVersion(
        act_id=act.id,
        label="1998",
        in_force_from=date(1998, 7, 10),
        in_force_to=date(2024, 2, 15),
    )
    new = LegalActVersion(act_id=act.id, label="2023", in_force_from=REFORM)
    await save_fixture(old)
    await save_fixture(new)

    articles = {
        ("1998", "170"): OLD_170,
        ("2023", "170"): NEW_170,
        ("1998", "49"): OLD_49,
        ("2023", "49"): NEW_49,
        ("1998", "335"): DELAIS,
        ("2023", "335"): DELAIS,
        # Added by the 2023 revision: it governs nothing before 2024.
        ("2023", "1-5"): "L'exécution est conduite loyalement.",
    }
    stored: dict[tuple[str, str], LegalArticle] = {}
    for (label, number), text in articles.items():
        article = LegalArticle(
            act_version_id=old.id if label == "1998" else new.id,
            number=number,
            sort_key=len(stored),
            text=text,
        )
        await save_fixture(article)
        stored[(label, number)] = article

    fixture.arret = CourtDecision(
        court="CCJA",
        number="090/2018",
        decided_on=date(2018, 4, 26),
        kind=DecisionKind.arret,
        summary="Résumé.",
    )
    second = CourtDecision(
        court="CCJA",
        number="069/2020",
        decided_on=date(2020, 5, 14),
        kind=DecisionKind.arret,
        summary="Résumé.",
    )
    replaced = CourtDecision(
        court="CCJA",
        number="022/2014",
        decided_on=date(2014, 3, 11),
        kind=DecisionKind.arret,
        summary="Résumé.",
    )
    lone = CourtDecision(
        court="CCJA",
        number="011/2016",
        decided_on=date(2016, 1, 21),
        kind=DecisionKind.arret,
        summary="Résumé.",
    )
    fixture.avis = CourtDecision(
        court="CCJA",
        number="003/2015",
        decided_on=date(2015, 6, 18),
        kind=DecisionKind.avis,
        summary="Avis.",
    )
    for decision in (fixture.arret, second, replaced, lone, fixture.avis):
        await save_fixture(decision)

    # A line of two on art. 170; one decision on the replaced art. 49; one
    # alone on the untouched art. 335.
    for decision, article in (
        (fixture.arret, stored[("1998", "170")]),
        (second, stored[("1998", "170")]),
        (fixture.avis, stored[("1998", "170")]),
        (replaced, stored[("1998", "49")]),
        (lone, stored[("1998", "335")]),
    ):
        await save_fixture(
            DecisionArticleLink(
                decision_id=decision.id,
                article_id=article.id,
                treatment=DecisionArticleTreatment.applies,
                treatment_status=TreatmentStatus.unverified,
                status=DecisionLinkStatus.verified,
            )
        )
    return fixture


async def _one(session: AsyncSession, text: str):
    review = await lecteur_service.review(session, text, document_name="test.pdf")
    assert len(review.findings) == 1
    return review.findings[0]


@pytest.mark.asyncio
class TestArticles:
    async def test_an_article_absent_from_the_act_is_a_weak_point(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        finding = await _one(session, "en application de l'article 9999 AUPSRVE")
        assert finding.status is Finding.weak
        assert "Introuvable" in finding.note

    async def test_a_version_that_does_not_hold_the_article_is_a_weak_point(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # Article 1-5 arrived with the 2023 revision; citing it as 1998 law
        # is wrong on the face of the reference.
        await _corpus(save_fixture)
        finding = await _one(session, "l'article 1-5 de l'AUPSRVE (1998)")
        assert finding.status is Finding.weak
        assert "ne figure pas dans la rédaction 1998" in finding.note

    async def test_an_unchanged_article_is_verified(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        finding = await _one(session, "l'article 335 AUPSRVE dispose")
        assert finding.status is Finding.verified
        assert "texte identique" in finding.note

    async def test_a_differing_article_without_a_rédaction_must_be_checked(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        finding = await _one(session, "l'article 49 AUPSRVE")
        assert finding.status is Finding.unverified
        assert "diffère" in finding.note
        assert "date des faits" in finding.note

    async def test_naming_the_rédaction_resolves_it(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        finding = await _one(session, "l'article 49 AUPSRVE (2023)")
        assert finding.status is Finding.verified

    async def test_an_unnamed_act_cannot_be_checked(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        finding = await _one(session, "en application de l'article 49 précité")
        assert finding.status is Finding.unverified
        assert "Acte non nommé" in finding.note
        assert finding.article_id is None

    async def test_case_law_is_counted_across_rédactions(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # The decisions sit on the 1998 row; a citation of the 2023 one must
        # not report zero.
        await _corpus(save_fixture)
        finding = await _one(session, "l'article 170 AUPSRVE (2023)")
        assert finding.status is Finding.verified
        assert "2 décisions vérifiées" in finding.note


@pytest.mark.asyncio
class TestDecisions:
    async def test_a_decision_we_hold_is_verified(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        corpus = await _corpus(save_fixture)
        finding = await _one(session, "CCJA, arrêt n° 090/2018")
        assert finding.status is Finding.verified
        assert finding.decision_id == corpus.arret.id

    async def test_a_decision_we_do_not_hold_is_not_called_false(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # The collection is large, not complete. « Introuvable » is a
        # statement about our holdings, never about their citation.
        await _corpus(save_fixture)
        finding = await _one(session, "CCJA, arrêt n° 250/2031")
        assert finding.status is Finding.unverified
        assert "Introuvable" in finding.note

    async def test_a_national_court_is_reported_as_out_of_scope(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        finding = await _one(
            session, "l'arrêt n° 145/2019 de la Cour d'appel d'Abidjan"
        )
        assert finding.status is Finding.unverified
        assert "Juridiction nationale" in finding.note

    async def test_a_court_of_appeal_nearby_does_not_taint_a_ccja_reference(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        review = await lecteur_service.review(
            session,
            "L'arrêt de la Cour d'appel a été cassé ; la CCJA, dans son arrêt "
            "n° 090/2018, a tranché la question.",
            document_name="test.pdf",
        )
        ccja = [f for f in review.findings if f.cite == "CCJA 090/2018"]
        assert len(ccja) == 1
        assert ccja[0].status is Finding.verified

    async def test_an_avis_is_not_a_precedent(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        finding = await _one(session, "CCJA, avis n° 003/2015")
        assert finding.status is Finding.unverified
        assert "Avis consultatif" in finding.note

    async def test_a_lone_decision_is_flagged_as_limited_authority(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # 011/2016 is the only decision we hold on art. 335.
        await _corpus(save_fixture)
        finding = await _one(session, "CCJA, arrêt n° 011/2016")
        assert finding.status is Finding.unverified
        assert "Autorité limitée" in finding.note

    async def test_a_rewritten_provision_makes_the_reading_historical(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # 022/2014 turns on art. 49, which the 2023 revision replaced.
        await _corpus(save_fixture)
        finding = await _one(session, "CCJA, arrêt n° 022/2014")
        assert finding.status is Finding.unverified
        assert "Interprétation historique" in finding.note
        assert "49" in finding.note

    async def test_a_reworded_provision_is_not_a_warning(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # 090/2018 turns on art. 170, reworded but not replaced: the fact is
        # worth stating, the alarm is not.
        await _corpus(save_fixture)
        finding = await _one(session, "CCJA, arrêt n° 090/2018")
        assert finding.status is Finding.verified
        assert "reformulé" in finding.note


@pytest.mark.asyncio
class TestReview:
    async def test_the_worst_findings_come_first(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        review = await lecteur_service.review(
            session,
            "les articles 335 et 9999 de l'AUPSRVE, ensemble l'article 49 "
            "du même Acte uniforme",
            document_name="test.pdf",
        )
        assert [f.status for f in review.findings] == [
            Finding.weak,
            Finding.unverified,
            Finding.verified,
        ]

    async def test_the_meta_line_counts_what_is_there(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        review = await lecteur_service.review(
            session,
            "les articles 335 et 9999 de l'AUPSRVE",
            document_name="test.pdf",
            page_count=9,
        )
        assert review.weak_count == 1
        assert review.verified_count == 1
        assert "9 pages" in review.meta
        assert "2 références détectées" in review.meta
        assert "1 point faible" in review.meta

    async def test_a_document_without_citations_says_so(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        review = await lecteur_service.review(
            session, "Attendu que la demande est mal fondée.", document_name="x.pdf"
        )
        assert review.findings == []
        assert "aucune référence détectée" in review.meta

    async def test_every_finding_quotes_the_document(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        text = "en application de l'article 170 AUPSRVE et de l'arrêt n° 090/2018"
        review = await lecteur_service.review(session, text, document_name="x.pdf")
        for finding in review.findings:
            assert finding.context
            assert finding.context in " ".join(text.split())
