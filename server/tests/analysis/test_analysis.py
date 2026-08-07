"""What the analyses promise, checked against the data they compute from.

The screen makes quantitative claims about the law — « ligne
jurisprudentielle constante · 4 décisions vérifiées », « en vigueur depuis
le 16.02.2024 ». Each of those is arithmetic, so each is tested here:
the count is of distinct decisions, unverified links never enter it, the
denominator names the article it is computed on, and an unknown stays
unknown rather than defaulting to the reassuring answer.
"""

from datetime import date

import pytest

from polar.analysis.service import analysis_service
from polar.kit.db.postgres import AsyncSession
from polar.models import (
    ArticleEquivalenceRelation,
    CourtDecision,
    DecisionArticleLink,
    DecisionArticleTreatment,
    DecisionLinkStatus,
    LegalAct,
    LegalActVersion,
    LegalArticle,
    LegalArticleEquivalence,
    TreatmentStatus,
)
from tests.fixtures.database import SaveFixture

OLD_TEXT = (
    "À peine d'irrecevabilité, les contestations sont portées devant la "
    "juridiction compétente.\n\n"
    "Le délai de contestation est d'un mois.\n\n"
    "La mainlevée est ordonnée sans délai."
)
NEW_TEXT = (
    "À peine d'irrecevabilité, les contestations sont portées devant la "
    "juridiction compétente.\n\n"
    "La notification peut être faite par voie électronique.\n\n"
    "Le délai de contestation est d'un mois à compter de la dénonciation."
)

REFORM = date(2024, 2, 16)


class Corpus:
    """A miniature AUPSRVE: two versions, one concordance, four decisions."""

    def __init__(self) -> None:
        self.act: LegalAct
        self.old_article: LegalArticle
        self.new_article: LegalArticle
        self.companion: LegalArticle
        self.decisions: list[CourtDecision] = []


async def _corpus(save_fixture: SaveFixture) -> Corpus:
    fixture = Corpus()
    fixture.act = LegalAct(short_code="AUPSRVE", title="Voies d'exécution")
    await save_fixture(fixture.act)

    old_version = LegalActVersion(
        act_id=fixture.act.id,
        label="1998",
        in_force_from=date(1998, 7, 10),
        in_force_to=date(2024, 2, 15),
    )
    new_version = LegalActVersion(
        act_id=fixture.act.id, label="2023", in_force_from=REFORM
    )
    await save_fixture(old_version)
    await save_fixture(new_version)

    fixture.old_article = LegalArticle(
        act_version_id=old_version.id, number="170", sort_key=170, text=OLD_TEXT
    )
    fixture.new_article = LegalArticle(
        act_version_id=new_version.id, number="172", sort_key=172, text=NEW_TEXT
    )
    fixture.companion = LegalArticle(
        act_version_id=old_version.id,
        number="49",
        sort_key=49,
        text="Le président statue en matière d'urgence.",
    )
    for article in (fixture.old_article, fixture.new_article, fixture.companion):
        await save_fixture(article)

    await save_fixture(
        LegalArticleEquivalence(
            old_article_id=fixture.old_article.id,
            new_article_id=fixture.new_article.id,
            relation=ArticleEquivalenceRelation.amended,
            note="renuméroté",
        )
    )

    # Four decisions across three years — a line, by the service's rule.
    for number, day in [
        ("090/2018", date(2018, 5, 3)),
        ("001/2013", date(2013, 2, 7)),
        ("038/2010", date(2010, 6, 10)),
        ("025/2010", date(2010, 3, 18)),
    ]:
        decision = CourtDecision(
            court="CCJA",
            number=number,
            decided_on=day,
            summary=f"Résumé de {number}.",
        )
        await save_fixture(decision)
        fixture.decisions.append(decision)
        await save_fixture(
            DecisionArticleLink(
                decision_id=decision.id,
                article_id=fixture.old_article.id,
                treatment=DecisionArticleTreatment.applies,
                treatment_status=TreatmentStatus.unverified,
                status=DecisionLinkStatus.verified,
                treatment_quote="le délai de contestation court à compter de…",
            )
        )
    # The first decision also reads article 49: that co-occurrence is the
    # entire basis for « le plus souvent cité avec ».
    await save_fixture(
        DecisionArticleLink(
            decision_id=fixture.decisions[0].id,
            article_id=fixture.companion.id,
            treatment=DecisionArticleTreatment.cites,
            treatment_status=TreatmentStatus.unverified,
            status=DecisionLinkStatus.verified,
        )
    )
    return fixture


@pytest.mark.asyncio
class TestAuthority:
    async def test_a_line_of_cases_is_counted_on_one_named_article(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        result = await analysis_service.authority(
            session, decision_id=fixture.decisions[0].id
        )

        assert result is not None
        assert result.level == "constante"
        assert result.decision_count == 4
        assert result.year_span == 3
        # The denominator is named on screen, so it can be checked.
        assert "art. 170 (AUPSRVE 1998)" in result.label
        assert result.anchor_label == "art. 170 (AUPSRVE 1998)"
        # Newest first, and every row is a distinct decision.
        assert [r.decided_on.year for r in result.rows] == [2018, 2013, 2010, 2010]
        assert len({r.decision_id for r in result.rows}) == 4

    async def test_the_anchor_is_the_provision_the_court_applied(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        # CCJA 090/2018 applies article 170 and merely cites article 49.
        # Anchoring on the lower article number would measure the passing
        # mention and report an isolated case.
        fixture = await _corpus(save_fixture)

        result = await analysis_service.authority(
            session, decision_id=fixture.decisions[0].id
        )

        assert result is not None
        assert result.anchor_article_id == fixture.old_article.id
        assert result.also_cited == ["art. 49 (AUPSRVE 1998)"]

    async def test_running_it_from_the_article_gives_the_same_count(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        from_decision = await analysis_service.authority(
            session, decision_id=fixture.decisions[2].id
        )
        from_article = await analysis_service.authority(
            session, article_id=fixture.old_article.id
        )

        assert from_decision is not None
        assert from_article is not None
        # Same anchor, same arithmetic — the figure cannot drift with the
        # door the lawyer came through.
        assert from_decision.decision_count == from_article.decision_count
        assert from_decision.label == from_article.label

    async def test_unverified_links_never_reach_the_count(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)
        extra = CourtDecision(
            court="CCJA", number="777/2021", decided_on=date(2021, 1, 5)
        )
        await save_fixture(extra)
        await save_fixture(
            DecisionArticleLink(
                decision_id=extra.id,
                article_id=fixture.old_article.id,
                treatment=DecisionArticleTreatment.cites,
                treatment_status=TreatmentStatus.unverified,
                status=DecisionLinkStatus.proposed,
            )
        )

        result = await analysis_service.authority(
            session, article_id=fixture.old_article.id
        )

        assert result is not None
        assert result.decision_count == 4
        assert all("777/2021" not in row.reference for row in result.rows)

    async def test_a_decision_without_verified_citations_says_so(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        orphan = CourtDecision(
            court="CCJA", number="500/2020", decided_on=date(2020, 9, 1)
        )
        await save_fixture(orphan)

        result = await analysis_service.authority(session, decision_id=orphan.id)

        assert result is not None
        assert result.level == "aucune"
        assert result.anchor_article_id is None
        assert result.rows == []
        assert "Aucune citation vérifiée" in result.label

    async def test_a_single_holding_is_not_dressed_up_as_a_line(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        result = await analysis_service.authority(
            session, article_id=fixture.companion.id
        )

        assert result is not None
        assert result.level == "isolee"
        assert result.decision_count == 1
        assert "Décision isolée" in result.label


@pytest.mark.asyncio
class TestHistory:
    async def test_the_version_governing_the_date_of_the_facts(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        before = await analysis_service.history(
            session, article_id=fixture.old_article.id, on=date(2024, 1, 12)
        )
        after = await analysis_service.history(
            session, article_id=fixture.old_article.id, on=date(2024, 3, 1)
        )

        assert before is not None
        assert after is not None
        assert before.governing_label == "1998"
        assert after.governing_label == "2023"
        assert [v.label for v in before.versions] == ["1998", "2023"]

    async def test_without_a_date_no_version_is_declared_to_govern(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        result = await analysis_service.history(
            session, article_id=fixture.old_article.id
        )

        assert result is not None
        assert result.governing_label is None
        assert all(not v.governs for v in result.versions)

    async def test_the_concordance_carries_the_new_number(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        result = await analysis_service.history(
            session, article_id=fixture.old_article.id
        )

        assert result is not None
        new_row = next(v for v in result.versions if v.label == "2023")
        assert new_row.article_number == "172"
        assert new_row.note == "renuméroté"
        assert result.changes_unavailable is False
        assert [c.sign for c in result.changes] == ["+", "~", "−"]

    async def test_an_article_without_a_concordance_admits_it(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        result = await analysis_service.history(
            session, article_id=fixture.companion.id
        )

        assert result is not None
        # No equivalence recorded: the screen must not read as "nothing
        # changed", which is a different and much stronger claim.
        assert result.changes_unavailable is True
        assert result.changes == []


@pytest.mark.asyncio
class TestCompare:
    async def test_the_two_texts_line_up_with_what_moved(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        result = await analysis_service.compare(
            session, article_id=fixture.old_article.id
        )

        assert result is not None
        assert result.left.version_label == "1998"
        assert result.right.version_label == "2023"
        assert len(result.left.alineas) == 3
        assert len(result.right.alineas) == 3
        # The added alinéa is highlighted where the reader will look for it.
        assert 2 in result.right.highlighted
        assert any("voie électronique" in c.text for c in result.changes)
        assert result.identical is False

    async def test_comparison_is_refused_when_no_counterpart_is_recorded(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        assert (
            await analysis_service.compare(session, article_id=fixture.companion.id)
            is None
        )


@pytest.mark.asyncio
class TestCitations:
    async def test_the_map_counts_decisions_and_the_company_they_keep(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        result = await analysis_service.citations(
            session, article_id=fixture.old_article.id
        )

        assert result is not None
        assert result.decision_count == 4
        assert [c.label for c in result.cited_with] == ["art. 49 (AUPSRVE 1998)"]
        assert result.cited_with[0].count == 1
        assert [r.decided_on.year for r in result.rows] == [2018, 2013, 2010, 2010]

    async def test_an_article_nobody_cites_is_reported_as_such(
        self, session: AsyncSession, save_fixture: SaveFixture
    ) -> None:
        fixture = await _corpus(save_fixture)

        result = await analysis_service.citations(
            session, article_id=fixture.new_article.id
        )

        assert result is not None
        assert result.decision_count == 0
        assert result.cited_with == []
        assert result.rows == []
