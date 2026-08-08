"""Retrieval goes through the graph, and never quietly goes thin.

Two promises are tested here, and the second matters more than the first.

**Only what the question is about travels.** A question about one
provision must not arrive beside judgments about another. That is where
the cost went, and — the reason for doing this at all — where the noise
came from.

**A thin mapping widens and says so.** The failure mode that would make
this change harmful is silent under-retrieval: a question that mapped to
nothing, answered confidently from two stray articles. So a set below the
floor is not returned as if it were precise; it widens to the general
fund and the caller is told.
"""

from datetime import date

import pytest

from polar.kit.db.postgres import AsyncSession
from polar.librarian.retrieval import (
    MAX_DECISION_CHARS,
    MIN_DECISIONS,
    TRUNCATION_NOTE,
    decision_text,
    retrieve,
)
from polar.models import (
    CourtDecision,
    DecisionArticleLink,
    DecisionArticleTreatment,
    DecisionLinkStatus,
    LegalAct,
    LegalActVersion,
    LegalArticle,
    TreatmentStatus,
)
from tests.fixtures.database import SaveFixture


class Corpus:
    def __init__(self) -> None:
        self.saisie: LegalArticle
        self.caution: LegalArticle
        self.exec_act_id: object
        self.saisie_decisions: list[CourtDecision] = []
        self.caution_decisions: list[CourtDecision] = []


async def _corpus(save_fixture: SaveFixture) -> Corpus:
    """Two unrelated provisions, each with its own line of judgments."""
    fixture = Corpus()
    aupsrve = LegalAct(short_code="AUPSRVE", title="Voies d'exécution")
    aus = LegalAct(short_code="AUS", title="Sûretés")
    await save_fixture(aupsrve)
    await save_fixture(aus)

    v_exec = LegalActVersion(
        act_id=aupsrve.id, label="1998", in_force_from=date(1998, 7, 10)
    )
    v_sur = LegalActVersion(
        act_id=aus.id, label="2010", in_force_from=date(2010, 5, 15)
    )
    await save_fixture(v_exec)
    await save_fixture(v_sur)
    fixture.exec_act_id = aupsrve.id

    fixture.saisie = LegalArticle(
        act_version_id=v_exec.id,
        number="170",
        sort_key=170,
        text=(
            "À peine d'irrecevabilité, les contestations relatives à la "
            "saisie-attribution sont portées devant la juridiction "
            "compétente dans le délai d'un mois."
        ),
    )
    fixture.caution = LegalArticle(
        act_version_id=v_sur.id,
        number="14",
        sort_key=14,
        text=(
            "Le cautionnement ne se présume pas ; il doit être convenu de "
            "façon expresse et comporter la mention manuscrite de la caution."
        ),
    )
    await save_fixture(fixture.saisie)
    await save_fixture(fixture.caution)

    async def line(prefix: str, article: LegalArticle, count: int):
        made = []
        for index in range(count):
            decision = CourtDecision(
                court="CCJA",
                number=f"{prefix}{index + 1:02d}/2018",
                decided_on=date(2018, 1, 1 + index),
                summary="Résumé.",
                full_text=f"Motifs de {prefix}{index + 1}.",
            )
            await save_fixture(decision)
            await save_fixture(
                DecisionArticleLink(
                    decision_id=decision.id,
                    article_id=article.id,
                    treatment=DecisionArticleTreatment.applies,
                    treatment_status=TreatmentStatus.unverified,
                    status=DecisionLinkStatus.verified,
                )
            )
            made.append(decision)
        return made

    fixture.saisie_decisions = await line("1", fixture.saisie, 5)
    fixture.caution_decisions = await line("9", fixture.caution, 5)
    return fixture


@pytest.mark.asyncio
class TestOnlyWhatWasAsked:
    async def test_a_cited_article_pulls_its_own_judgments(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)
        result = await retrieve(session, "Que dit l'article 170 de l'AUPSRVE ?")

        assert not result.widened
        assert fixture.saisie.id in result.article_ids
        numbers = {r.decision.number for r in result.decisions}
        assert numbers == {d.number for d in fixture.saisie_decisions}

    async def test_the_other_provisions_judgments_stay_out(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # The whole point: a question about the saisie must not arrive with
        # the cautionnement's case law attached.
        fixture = await _corpus(save_fixture)
        result = await retrieve(session, "Que dit l'article 170 de l'AUPSRVE ?")

        numbers = {r.decision.number for r in result.decisions}
        assert numbers.isdisjoint({d.number for d in fixture.caution_decisions})
        assert fixture.caution.id not in result.article_ids

    async def test_a_question_without_a_citation_reaches_the_text(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)
        result = await retrieve(
            session, "Un cautionnement sans mention manuscrite est-il valable ?"
        )

        assert fixture.caution.id in result.article_ids
        numbers = {r.decision.number for r in result.decisions}
        assert numbers & {d.number for d in fixture.caution_decisions}


@pytest.mark.asyncio
class TestExplainable:
    async def test_every_judgment_names_the_provision_that_brought_it(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # « Why was this arrêt considered? » has to have an answer a lawyer
        # can check. That is the whole reason for going through the graph
        # rather than through similarity.
        await _corpus(save_fixture)
        result = await retrieve(session, "Que dit l'article 170 de l'AUPSRVE ?")

        assert result.decisions
        for retrieved in result.decisions:
            assert retrieved.via, "a decision arrived with no reason"
            assert "art. 170" in retrieved.reason

    async def test_articles_say_why_they_are_there(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        result = await retrieve(session, "Que dit l'article 170 de l'AUPSRVE ?")
        reasons = {r.reason for r in result.articles}
        assert any("citée dans la question" in reason for reason in reasons)


@pytest.mark.asyncio
class TestWidensRatherThanGuesses:
    async def test_a_question_about_nothing_we_hold_widens(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        result = await retrieve(
            session, "Quelles sont les obligations du transporteur aérien ?"
        )

        assert result.widened
        assert "fonds général" in result.reason

    async def test_widening_still_brings_something_to_answer_from(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # Widening that produced nothing would be under-retrieval wearing a
        # different name.
        await _corpus(save_fixture)
        result = await retrieve(
            session, "Quelles sont les obligations du transporteur aérien ?"
        )
        assert len(result.decisions) >= MIN_DECISIONS

    async def test_a_well_mapped_question_does_not_widen(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        result = await retrieve(session, "Que dit l'article 170 de l'AUPSRVE ?")
        assert not result.widened


@pytest.mark.asyncio
class TestBothRedactions:
    async def test_a_retrieved_article_brings_its_counterpart(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # The version gate compares two rédactions; handed one, it would be
        # concluding from silence.
        from polar.models import ArticleEquivalenceRelation, LegalArticleEquivalence

        fixture = await _corpus(save_fixture)
        act_id = fixture.exec_act_id
        revised = LegalActVersion(
            act_id=act_id, label="2023", in_force_from=date(2024, 2, 16)
        )
        await save_fixture(revised)
        new_article = LegalArticle(
            act_version_id=revised.id,
            number="170",
            sort_key=170,
            text="À peine d'irrecevabilité, les contestations sont portées…",
        )
        await save_fixture(new_article)
        await save_fixture(
            LegalArticleEquivalence(
                old_article_id=fixture.saisie.id,
                new_article_id=new_article.id,
                relation=ArticleEquivalenceRelation.amended,
                note="test",
            )
        )

        result = await retrieve(session, "Que dit l'article 170 de l'AUPSRVE ?")
        assert new_article.id in result.article_ids


class TestDecisionText:
    def test_an_ordinary_judgment_travels_whole(self) -> None:
        text = "Motifs." * 100
        assert decision_text(text) == text

    def test_an_over_long_judgment_is_cut_from_the_front(self) -> None:
        # The rule lives at the end of an arrêt — motifs then dispositif —
        # so the front is what goes.
        ending = "\nPAR CES MOTIFS, casse et annule."
        text = ("Rappel de la procédure.\n" * 5000) + ending
        cut = decision_text(text)

        assert len(cut) <= MAX_DECISION_CHARS + len(TRUNCATION_NOTE)
        assert cut.endswith(ending.strip())
        assert cut.startswith(TRUNCATION_NOTE)

    def test_the_cut_starts_at_a_paragraph_boundary(self) -> None:
        text = ("Ligne de procédure.\n" * 5000) + "\nPAR CES MOTIFS."
        cut = decision_text(text).removeprefix(TRUNCATION_NOTE)
        assert cut.startswith("Ligne de procédure.")

    def test_a_missing_text_is_empty_not_an_error(self) -> None:
        assert decision_text(None) == ""
