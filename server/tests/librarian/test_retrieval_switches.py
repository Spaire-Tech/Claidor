"""The composer's switches change the request, not the prompt's manners.

« Actes uniformes » and « Jurisprudence » are not a hint to the model about
what to prefer — switching one off removes those documents from the request
entirely. « Recherche approfondie » reaches further into the collection we
hold, and nowhere else: there is no doctrine indexed and none is claimed.

Tested at the retrieval layer rather than through an answer, because that
is where the honesty lives. A control that changes nothing here changes
nothing at all, whatever the toast says.
"""

from datetime import date

import pytest

from polar.kit.db.postgres import AsyncSession
from polar.librarian.service import (
    ALL_SOURCES,
    DECISIONS_DEEP,
    DECISIONS_NORMAL,
    SOURCE_ACTS,
    SOURCE_CASE_LAW,
    librarian,
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

#: One of the slice articles, so build_documents actually retrieves it.
SLICE_NUMBER = "170"


async def _corpus(save_fixture: SaveFixture, *, decisions: int = 3) -> None:
    act = LegalAct(short_code="AUPSRVE", title="Voies d'exécution")
    await save_fixture(act)
    old = LegalActVersion(
        act_id=act.id, label="1998", in_force_from=date(1998, 7, 10)
    )
    new = LegalActVersion(
        act_id=act.id, label="2023", in_force_from=date(2024, 2, 16)
    )
    await save_fixture(old)
    await save_fixture(new)

    article = LegalArticle(
        act_version_id=old.id,
        number=SLICE_NUMBER,
        sort_key=170,
        text="À peine d'irrecevabilité, les contestations sont portées…",
    )
    await save_fixture(article)

    for index in range(decisions):
        decision = CourtDecision(
            court="CCJA",
            number=f"{index + 1:03d}/2018",
            decided_on=date(2018, 1, 1),
            summary="Résumé.",
            full_text="Texte de la décision.",
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


def _kinds(refs) -> set[str]:
    return {ref.kind for ref in refs}


@pytest.mark.asyncio
class TestSourceSwitches:
    async def test_both_sources_bring_both_kinds(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        _, refs = await librarian.build_documents(session, sources=ALL_SOURCES)
        assert _kinds(refs) == {"article", "decision"}

    async def test_turning_off_jurisprudence_removes_the_decisions(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        _, refs = await librarian.build_documents(
            session, sources=frozenset({SOURCE_ACTS})
        )
        assert _kinds(refs) == {"article"}

    async def test_turning_off_the_acts_removes_the_articles(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        _, refs = await librarian.build_documents(
            session, sources=frozenset({SOURCE_CASE_LAW})
        )
        assert _kinds(refs) == {"decision"}

    async def test_no_sources_retrieves_nothing(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # The endpoint turns this into an error rather than an answer: a
        # reply grounded in nothing is the one thing never on offer.
        await _corpus(save_fixture)
        documents, refs = await librarian.build_documents(
            session, sources=frozenset()
        )
        assert documents == []
        assert refs == []


@pytest.mark.asyncio
class TestDepth:
    async def test_deep_reaches_further_into_the_collection(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # More decisions than the normal cap, fewer than the deep one, so
        # the two settings must disagree on the count.
        await _corpus(save_fixture, decisions=DECISIONS_NORMAL + 5)
        _, shallow = await librarian.build_documents(session)
        _, deep = await librarian.build_documents(session, deep=True)

        shallow_decisions = [r for r in shallow if r.kind == "decision"]
        deep_decisions = [r for r in deep if r.kind == "decision"]
        assert len(shallow_decisions) == DECISIONS_NORMAL
        assert len(deep_decisions) == DECISIONS_NORMAL + 5
        assert len(deep_decisions) <= DECISIONS_DEEP

    async def test_depth_does_not_change_the_articles(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        await _corpus(save_fixture)
        _, shallow = await librarian.build_documents(session)
        _, deep = await librarian.build_documents(session, deep=True)
        assert [r.title for r in shallow if r.kind == "article"] == [
            r.title for r in deep if r.kind == "article"
        ]
