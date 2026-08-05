from collections.abc import Sequence

from sqlalchemy import select

from polar.kit.repository import RepositoryBase
from polar.models import (
    CourtDecision,
    DecisionArticleLink,
    DecisionLinkStatus,
    LegalActVersion,
    LegalArticle,
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
