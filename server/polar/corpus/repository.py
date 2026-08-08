from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import contains_eager, joinedload, selectinload

from polar.kit.repository import RepositoryBase
from polar.models import (
    CourtDecision,
    DecisionArticleLink,
    DecisionArticleTreatment,
    DecisionKind,
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

    async def get_version_by_label(
        self, label: str, *, act_short_code: str = "AUPSRVE"
    ) -> LegalActVersion | None:
        """A version by its label, scoped to one act — bare labels are
        ambiguous ("1998" is both AUPSRVE 1998 and AUPC 1998)."""
        statement = (
            select(LegalActVersion)
            .join(LegalAct)
            .where(
                LegalAct.short_code == act_short_code,
                LegalActVersion.label == label,
            )
        )
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

    async def get_article_ref(self, article_id: object) -> tuple[str, str, str] | None:
        """(number, act short code, version label) — for authority labels."""
        statement = (
            select(
                LegalArticle.number,
                LegalAct.short_code,
                LegalActVersion.label,
            )
            .join(LegalActVersion, LegalActVersion.id == LegalArticle.act_version_id)
            .join(LegalAct, LegalAct.id == LegalActVersion.act_id)
            .where(LegalArticle.id == article_id)
        )
        row = (await self.session.execute(statement)).first()
        return (row[0], row[1], row[2]) if row else None

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
            .where(
                CourtDecision.id.in_(decision_ids),
                # The authority signal counts judgments; an avis is quoted
                # on its own terms, never as one more case in a line.
                CourtDecision.kind == DecisionKind.arret,
            )
            .order_by(CourtDecision.decided_on)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def list_top_decisions_for_articles(
        self, article_ids: Sequence[object], *, limit: int
    ) -> Sequence[CourtDecision]:
        """The decisions most tied to these articles, capped.

        Ranked by number of verified links into the article set (a decision
        citing four slice articles outranks one citing a single article),
        then by recency — a deterministic relevance order that keeps the
        prompt within model limits now that the corpus holds the full CCJA
        collection.
        """
        link_counts = (
            select(
                DecisionArticleLink.decision_id.label("decision_id"),
                func.count(DecisionArticleLink.id).label("n_links"),
            )
            .where(
                DecisionArticleLink.article_id.in_(list(article_ids)),
                DecisionArticleLink.status == DecisionLinkStatus.verified,
            )
            .group_by(DecisionArticleLink.decision_id)
            .subquery()
        )
        statement = (
            select(CourtDecision)
            .join(link_counts, link_counts.c.decision_id == CourtDecision.id)
            .order_by(
                link_counts.c.n_links.desc(),
                CourtDecision.decided_on.desc(),
            )
            .limit(limit)
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

    async def count_verified_decisions_for_article(self, article_id: UUID) -> int:
        """How many decisions cite this article, verified links only.

        The denominator behind « N décisions vérifiées ». Distinct
        decisions, not links: a decision citing one article twice is one
        decision, and an authority figure that double-counts is a lie.
        """
        statement = (
            select(func.count(func.distinct(DecisionArticleLink.decision_id)))
            .join(CourtDecision, CourtDecision.id == DecisionArticleLink.decision_id)
            .where(
                DecisionArticleLink.article_id == article_id,
                DecisionArticleLink.status == DecisionLinkStatus.verified,
                CourtDecision.kind == DecisionKind.arret,
            )
        )
        return (await self.session.execute(statement)).scalar_one()

    async def count_verified_decisions_for_article_set(
        self, article_ids: Sequence[UUID]
    ) -> int:
        """The same count over one article across every rédaction.

        Decisions attach to the wording they read, so the case law on
        « article 170 » sits on the 1998 row and none of it on the 2023
        one. Counting the set is the only way « N décisions vérifiées »
        means what a lawyer reads it to mean.
        """
        if not article_ids:
            return 0
        statement = (
            select(func.count(func.distinct(DecisionArticleLink.decision_id)))
            .join(CourtDecision, CourtDecision.id == DecisionArticleLink.decision_id)
            .where(
                DecisionArticleLink.article_id.in_(list(article_ids)),
                DecisionArticleLink.status == DecisionLinkStatus.verified,
                CourtDecision.kind == DecisionKind.arret,
            )
        )
        return (await self.session.execute(statement)).scalar_one()

    async def list_co_cited_articles(
        self, article_id: UUID, *, limit: int = 6
    ) -> Sequence[tuple[LegalArticle, int]]:
        """Articles that travel with this one, and how often.

        Two verified links on one decision mean the court read the two
        provisions together — that co-occurrence is the entire content of
        « le plus souvent cité avec ». Nothing is inferred about why.
        """
        anchor = (
            select(DecisionArticleLink.decision_id)
            .where(
                DecisionArticleLink.article_id == article_id,
                DecisionArticleLink.status == DecisionLinkStatus.verified,
            )
            .subquery()
        )
        counts = (
            select(
                DecisionArticleLink.article_id.label("article_id"),
                func.count(func.distinct(DecisionArticleLink.decision_id)).label("n"),
            )
            .where(
                DecisionArticleLink.decision_id.in_(select(anchor.c.decision_id)),
                DecisionArticleLink.article_id != article_id,
                DecisionArticleLink.status == DecisionLinkStatus.verified,
            )
            .group_by(DecisionArticleLink.article_id)
            .subquery()
        )
        statement = (
            select(LegalArticle, counts.c.n)
            .join(counts, counts.c.article_id == LegalArticle.id)
            .options(
                joinedload(LegalArticle.act_version).joinedload(LegalActVersion.act)
            )
            .order_by(counts.c.n.desc(), LegalArticle.sort_key)
            .limit(limit)
        )
        return list((await self.session.execute(statement)).tuples().all())

    async def list_similar_decisions(
        self, decision_id: UUID, *, limit: int = 5
    ) -> Sequence[tuple[CourtDecision, int]]:
        """Decisions reading the same provisions, most overlap first.

        Similarity here is citation overlap and nothing else: two decisions
        that turn on the same articles are the ones a lawyer wants side by
        side. It is a claim about the corpus, not about the reasoning, so
        the count of shared provisions travels with each row.
        """
        mine = (
            select(DecisionArticleLink.article_id)
            .where(
                DecisionArticleLink.decision_id == decision_id,
                DecisionArticleLink.status == DecisionLinkStatus.verified,
            )
            .subquery()
        )
        counts = (
            select(
                DecisionArticleLink.decision_id.label("decision_id"),
                func.count(func.distinct(DecisionArticleLink.article_id)).label("n"),
            )
            .where(
                DecisionArticleLink.article_id.in_(select(mine.c.article_id)),
                DecisionArticleLink.decision_id != decision_id,
                DecisionArticleLink.status == DecisionLinkStatus.verified,
            )
            .group_by(DecisionArticleLink.decision_id)
            .subquery()
        )
        statement = (
            select(CourtDecision, counts.c.n)
            .join(counts, counts.c.decision_id == CourtDecision.id)
            .order_by(counts.c.n.desc(), CourtDecision.decided_on.desc())
            .limit(limit)
        )
        return list((await self.session.execute(statement)).tuples().all())

    async def list_versions_for_act(self, act_id: UUID) -> Sequence[LegalActVersion]:
        """Every version of one act, oldest first, with the act loaded."""
        statement = (
            select(LegalActVersion)
            .where(LegalActVersion.act_id == act_id)
            .options(joinedload(LegalActVersion.act))
            .order_by(LegalActVersion.label)
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

    async def get_act_by_short_code(self, short_code: str) -> LegalAct | None:
        """One act by the code practitioners cite, versions loaded."""
        statement = (
            select(LegalAct)
            .where(LegalAct.short_code == short_code)
            .options(selectinload(LegalAct.versions))
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def list_articles_by_number_for_act(
        self, act_id: UUID, number: str
    ) -> Sequence[LegalArticle]:
        """One article number across every version of an act, oldest first.

        The same number is not the same provision in every act: AUPSRVE
        kept its numbering in 2023, AUS renumbered wholesale in 2010. So
        this returns what each version actually holds under that number and
        leaves the comparison to the caller.
        """
        statement = (
            select(LegalArticle)
            .join(LegalActVersion, LegalActVersion.id == LegalArticle.act_version_id)
            .where(
                LegalActVersion.act_id == act_id,
                LegalArticle.number == number,
            )
            .options(
                joinedload(LegalArticle.act_version).joinedload(LegalActVersion.act)
            )
            .order_by(LegalActVersion.label)
        )
        return (await self.session.execute(statement)).scalars().all()

    async def get_decision_by_number(
        self, number: str, *, court: str = "CCJA"
    ) -> CourtDecision | None:
        """A decision as it is cited — « 090/2018 ».

        Numbers repeat across years only with the year attached, so the
        pair is unique in practice; where it is not, the earliest is
        returned rather than an arbitrary one.
        """
        statement = (
            select(CourtDecision)
            .where(CourtDecision.court == court, CourtDecision.number == number)
            .order_by(CourtDecision.decided_on)
            .limit(1)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def count_decisions_by_kind(self) -> dict[DecisionKind, int]:
        """How much of the collection is loaded — the honest denominator."""
        statement = select(CourtDecision.kind, func.count(CourtDecision.id)).group_by(
            CourtDecision.kind
        )
        result = await self.session.execute(statement)
        return {kind: count for kind, count in result.tuples().all()}

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
        self, article_id: UUID, *, judgments_only: bool = False
    ) -> Sequence[DecisionArticleLink]:
        """Verified decision links for one article, decisions eagerly loaded.

        ``judgments_only`` excludes avis consultatifs. An advisory opinion
        decided no case between parties, so it cannot be evidence that a
        solution is *held* — the authority line asks for judgments, the
        citation map asks for citations of any kind.
        """
        statement = (
            select(DecisionArticleLink)
            .join(DecisionArticleLink.decision)
            .where(
                DecisionArticleLink.article_id == article_id,
                DecisionArticleLink.status == DecisionLinkStatus.verified,
                *([CourtDecision.kind == DecisionKind.arret] if judgments_only else []),
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
                contains_eager(DecisionArticleLink.article)
                .joinedload(LegalArticle.act_version)
                # The act too: a citation is displayed as « art. 170
                # (AUPSRVE 1998) », and the short code lives on the act.
                .joinedload(LegalActVersion.act)
            )
            .order_by(LegalArticle.sort_key)
        )
        return (await self.session.execute(statement)).scalars().all()
