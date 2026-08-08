"""A watch must not shout, and must not repeat itself.

Two failures would make Veilles useless in opposite ways. If a new watch
reported everything already in the corpus, watching art. 170 would open
with two hundred signals from 2001 onwards and nobody would look again.
If a scan re-reported what it reported yesterday, a nightly job would
turn the feed into noise within a week.
"""

from datetime import date

import pytest

from polar.kit.db.postgres import AsyncSession
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
    Veille,
    WatchTarget,
)
from polar.veille.service import veille_service
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization, create_user


async def _article(save_fixture: SaveFixture) -> LegalArticle:
    act = LegalAct(short_code="AUPSRVE", title="Voies d'exécution")
    await save_fixture(act)
    version = LegalActVersion(act_id=act.id, label="1998")
    await save_fixture(version)
    article = LegalArticle(
        act_version_id=version.id, number="170", sort_key=170, text="Contestations…"
    )
    await save_fixture(article)
    return article


async def _decision_citing(
    save_fixture: SaveFixture, article: LegalArticle, number: str, day: date
) -> CourtDecision:
    decision = CourtDecision(court="CCJA", number=number, decided_on=day)
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
    return decision


@pytest.mark.asyncio
class TestScanning:
    async def test_a_scan_reports_a_decision_citing_the_watched_article(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        organization = await create_organization(save_fixture)
        user = await create_user(save_fixture)
        article = await _article(save_fixture)
        veille = Veille(
            organization_id=organization.id,
            created_by_id=user.id,
            target=WatchTarget.article,
            target_id=article.id,
            label="Art. 170 (AUPSRVE 1998)",
            active=True,
        )
        await save_fixture(veille)
        await _decision_citing(save_fixture, article, "090/2018", date(2018, 5, 3))

        signals = await veille_service.scan(session, [veille])

        assert len(signals) == 1
        assert "090/2018" in signals[0].text
        assert "Art. 170" in signals[0].text

    async def test_scanning_twice_does_not_repeat_a_signal(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        organization = await create_organization(save_fixture)
        user = await create_user(save_fixture)
        article = await _article(save_fixture)
        veille = Veille(
            organization_id=organization.id,
            created_by_id=user.id,
            target=WatchTarget.article,
            target_id=article.id,
            label="Art. 170 (AUPSRVE 1998)",
            active=True,
        )
        await save_fixture(veille)
        await _decision_citing(save_fixture, article, "090/2018", date(2018, 5, 3))

        first = await veille_service.scan(session, [veille])
        second = await veille_service.scan(session, [veille])

        assert len(first) == 1
        assert second == []

    async def test_a_suspended_watch_is_silent(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        organization = await create_organization(save_fixture)
        user = await create_user(save_fixture)
        article = await _article(save_fixture)
        veille = Veille(
            organization_id=organization.id,
            created_by_id=user.id,
            target=WatchTarget.article,
            target_id=article.id,
            label="Art. 170 (AUPSRVE 1998)",
            active=False,
        )
        await save_fixture(veille)
        await _decision_citing(save_fixture, article, "090/2018", date(2018, 5, 3))

        assert await veille_service.scan(session, [veille]) == []

    async def test_an_avis_does_not_trigger_a_case_law_signal(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # « une décision cite le texte » means a judgment. An advisory
        # opinion is not a decision on anyone's case.
        organization = await create_organization(save_fixture)
        user = await create_user(save_fixture)
        article = await _article(save_fixture)
        veille = Veille(
            organization_id=organization.id,
            created_by_id=user.id,
            target=WatchTarget.article,
            target_id=article.id,
            label="Art. 170 (AUPSRVE 1998)",
            active=True,
        )
        await save_fixture(veille)
        avis = CourtDecision(
            court="CCJA",
            kind=DecisionKind.avis,
            number="Avis 001/2015",
            decided_on=date(2015, 6, 17),
        )
        await save_fixture(avis)
        await save_fixture(
            DecisionArticleLink(
                decision_id=avis.id,
                article_id=article.id,
                treatment=DecisionArticleTreatment.cites,
                treatment_status=TreatmentStatus.unverified,
                status=DecisionLinkStatus.verified,
            )
        )

        assert await veille_service.scan(session, [veille]) == []

    async def test_unverified_citations_do_not_raise_a_signal(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        organization = await create_organization(save_fixture)
        user = await create_user(save_fixture)
        article = await _article(save_fixture)
        veille = Veille(
            organization_id=organization.id,
            created_by_id=user.id,
            target=WatchTarget.article,
            target_id=article.id,
            label="Art. 170 (AUPSRVE 1998)",
            active=True,
        )
        await save_fixture(veille)
        decision = CourtDecision(
            court="CCJA", number="777/2021", decided_on=date(2021, 1, 5)
        )
        await save_fixture(decision)
        await save_fixture(
            DecisionArticleLink(
                decision_id=decision.id,
                article_id=article.id,
                treatment=DecisionArticleTreatment.cites,
                treatment_status=TreatmentStatus.unverified,
                status=DecisionLinkStatus.proposed,
            )
        )

        assert await veille_service.scan(session, [veille]) == []
