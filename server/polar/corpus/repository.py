from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import contains_eager, joinedload, selectinload

from polar.kit.repository import RepositoryBase
from polar.models import (
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


class CorpusRepository(RepositoryBase[LegalArticle]):
    """Read access to the legal corpus (global data — not tenant-scoped)."""

    model = LegalArticle

    async def get_version_by_label(self, label: str) -> LegalActVersion | None:
        statement = select(LegalActVersion).where(LegalActVersion.label == label)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_articles_by_numbers(
        self, act_version_id: object, numbers: Sequence[str]
    ) -> Sequence[LegalArticle]:
        statement = (
            select(LegalArticle)
            .where(
                LegalArticle.act_version_id == act_version_id,
                LegalArticle.number.in_(list(numbers)),
            )
            .order_by(LegalArticle.sort_key)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def list_articles_matching(
        self, act_version_id: object, needle: str
    ) -> Sequence[LegalArticle]:
        statement = (
            select(LegalArticle)
            .where(
                LegalArticle.act_version_id == act_version_id,
                LegalArticle.text.ilike(f"%{needle}%"),
            )
            .order_by(LegalArticle.sort_key)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def list_decisions_with_verified_links(self) -> Sequence[CourtDecision]:
        decision_ids = select(DecisionArticleLink.decision_id).where(
            DecisionArticleLink.status == DecisionLinkStatus.verified
        )
        statement = (
            select(CourtDecision)
            .where(CourtDecision.id.in_(decision_ids))
            .order_by(CourtDecision.decided_on)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def list_verified_decisions_for_articles(
        self, article_ids: Sequence[object]
    ) -> Sequence[CourtDecision]:
        """Distinct decisions with a verified link to any of these articles."""
        decision_ids = select(DecisionArticleLink.decision_id).where(
            DecisionArticleLink.article_id.in_(list(article_ids)),
            DecisionArticleLink.status == DecisionLinkStatus.verified,
        )
        statement = (
            select(CourtDecision)
            .where(CourtDecision.id.in_(decision_ids))
            .order_by(CourtDecision.decided_on)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def list_equivalent_new_articles(
        self, old_article_ids: Sequence[object]
    ) -> Sequence[LegalArticle]:
        """New-version articles mapped (via equivalences) from these articles."""
        new_ids = select(LegalArticleEquivalence.new_article_id).where(
            LegalArticleEquivalence.old_article_id.in_(list(old_article_ids))
        )
        statement = (
            select(LegalArticle)
            .where(LegalArticle.id.in_(new_ids))
            .order_by(LegalArticle.sort_key)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def list_acts_with_versions(self) -> Sequence[LegalAct]:
        """All acts with their versions eagerly loaded."""
        statement = (
            select(LegalAct)
            .options(selectinload(LegalAct.versions))
            .order_by(LegalAct.short_code)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def count_articles_per_version(self) -> dict[UUID, int]:
        """Article count keyed by act version id."""
        statement = select(
            LegalArticle.act_version_id, func.count(LegalArticle.id)
        ).group_by(LegalArticle.act_version_id)
        result = await self.session.execute(statement)
        return {version_id: count for version_id, count in result.tuples().all()}

    async def get_version_by_id(self, version_id: UUID) -> LegalActVersion | None:
        statement = select(LegalActVersion).where(LegalActVersion.id == version_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_articles_for_version(
        self, act_version_id: UUID
    ) -> Sequence[LegalArticle]:
        """Ordered articles of one version — the sidebar list."""
        statement = (
            select(LegalArticle)
            .where(LegalArticle.act_version_id == act_version_id)
            .order_by(LegalArticle.sort_key)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def get_article_by_id(self, article_id: UUID) -> LegalArticle | None:
        """One article with its version and act eagerly loaded."""
        statement = (
            select(LegalArticle)
            .where(LegalArticle.id == article_id)
            .options(
                joinedload(LegalArticle.act_version).joinedload(LegalActVersion.act)
            )
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_equivalences_for_article(
        self, article_id: UUID
    ) -> Sequence[LegalArticleEquivalence]:
        """Equivalence rows touching this article, in either direction."""
        statement = (
            select(LegalArticleEquivalence)
            .where(
                or_(
                    LegalArticleEquivalence.old_article_id == article_id,
                    LegalArticleEquivalence.new_article_id == article_id,
                )
            )
            .options(
                joinedload(LegalArticleEquivalence.old_article).joinedload(
                    LegalArticle.act_version
                ),
                joinedload(LegalArticleEquivalence.new_article).joinedload(
                    LegalArticle.act_version
                ),
            )
        )
        return (await self.session.execute(statement)).scalars().all()

    async def list_verified_links_for_article(
        self, article_id: UUID
    ) -> Sequence[DecisionArticleLink]:
        """Verified decision links for one article, decisions eagerly loaded."""
        statement = (
            select(DecisionArticleLink)
            .join(DecisionArticleLink.decision)
            .where(
                DecisionArticleLink.article_id == article_id,
                DecisionArticleLink.status == DecisionLinkStatus.verified,
            )
            .options(contains_eager(DecisionArticleLink.decision))
            .order_by(CourtDecision.decided_on)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def get_decision_by_id(self, decision_id: UUID) -> CourtDecision | None:
        statement = select(CourtDecision).where(CourtDecision.id == decision_id)
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def list_links_by_treatment_status(
        self, treatment_status: TreatmentStatus
    ) -> Sequence[DecisionArticleLink]:
        """Links in one treatment-review state, decision & article eagerly loaded."""
        statement = (
            select(DecisionArticleLink)
            .join(DecisionArticleLink.decision)
            .join(DecisionArticleLink.article)
            .where(DecisionArticleLink.treatment_status == treatment_status)
            .options(
                contains_eager(DecisionArticleLink.decision),
                contains_eager(DecisionArticleLink.article)
                .joinedload(LegalArticle.act_version)
                .joinedload(LegalActVersion.act),
            )
            .order_by(
                CourtDecision.decided_on,
                CourtDecision.number,
                LegalArticle.sort_key,
            )
        )
        return (await self.session.execute(statement)).scalars().all()

    async def count_links_by_treatment_status(self) -> dict[TreatmentStatus, int]:
        """Link count keyed by treatment-review status."""
        statement = select(
            DecisionArticleLink.treatment_status, func.count(DecisionArticleLink.id)
        ).group_by(DecisionArticleLink.treatment_status)
        result = await self.session.execute(statement)
        return {status: count for status, count in result.tuples().all()}

    async def get_link_by_id(self, link_id: UUID) -> DecisionArticleLink | None:
        """One link with its decision, article, version and act eagerly loaded."""
        statement = (
            select(DecisionArticleLink)
            .where(DecisionArticleLink.id == link_id)
            .options(
                joinedload(DecisionArticleLink.decision),
                joinedload(DecisionArticleLink.article)
                .joinedload(LegalArticle.act_version)
                .joinedload(LegalActVersion.act),
            )
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def set_link_treatment_review(
        self,
        link: DecisionArticleLink,
        *,
        treatment_status: TreatmentStatus,
        treatment: DecisionArticleTreatment | None = None,
    ) -> DecisionArticleLink:
        """Record a human review of the proposed treatment label."""
        if treatment is not None:
            link.treatment = treatment
        link.treatment_status = treatment_status
        self.session.add(link)
        await self.session.flush()
        return link

    async def list_verified_links_for_decision(
        self, decision_id: UUID
    ) -> Sequence[DecisionArticleLink]:
        """Verified article links of one decision, articles eagerly loaded."""
        statement = (
            select(DecisionArticleLink)
            .join(DecisionArticleLink.article)
            .where(
                DecisionArticleLink.decision_id == decision_id,
                DecisionArticleLink.status == DecisionLinkStatus.verified,
            )
            .options(
                contains_eager(DecisionArticleLink.article).joinedload(
                    LegalArticle.act_version
                )
            )
            .order_by(LegalArticle.sort_key)
        )
        return (await self.session.execute(statement)).scalars().all()
