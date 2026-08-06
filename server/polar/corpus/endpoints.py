from uuid import UUID

from fastapi import Depends

from polar.exceptions import ResourceNotFound
from polar.kit.db.postgres import AsyncReadSession
from polar.models import LegalArticle
from polar.openapi import APITag
from polar.postgres import get_db_read_session
from polar.routing import APIRouter

from . import auth
from .repository import CorpusRepository
from .schemas import (
    CorpusAct,
    CorpusActVersion,
    CorpusArticleDetail,
    CorpusArticleEquivalence,
    CorpusArticleListItem,
    CorpusDecisionArticle,
    CorpusDecisionDetail,
    CorpusLinkedDecision,
    CorpusProvenance,
)

router = APIRouter(prefix="/corpus", tags=["corpus", APITag.private])


def _alineas(article: LegalArticle) -> list[str]:
    """Alinéas from the structured breakdown, falling back to text lines."""
    structure = article.structure or {}
    alineas = structure.get("alineas")
    if isinstance(alineas, list) and all(isinstance(a, str) for a in alineas):
        return alineas
    return [line for line in article.text.split("\n") if line.strip()]


def _provenance(article: LegalArticle) -> CorpusProvenance | None:
    provenance = article.provenance
    if not provenance:
        return None
    return CorpusProvenance(
        source=provenance.get("source"),
        kind=provenance.get("kind"),
        authority_crosscheck=provenance.get("authority_crosscheck"),
    )


@router.get("/acts", response_model=list[CorpusAct])
async def list_acts(
    auth_subject: auth.CorpusRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[CorpusAct]:
    """List the loaded acts with their versions."""
    repository = CorpusRepository.from_session(session)
    acts = await repository.list_acts_with_versions()
    article_counts = await repository.count_articles_per_version()
    return [
        CorpusAct(
            id=act.id,
            short_code=act.short_code,
            title=act.title,
            versions=[
                CorpusActVersion(
                    id=version.id,
                    label=version.label,
                    adopted_on=version.adopted_on,
                    in_force_from=version.in_force_from,
                    gazette_reference=version.gazette_reference,
                    transitional_rule=version.transitional_rule,
                    article_count=article_counts.get(version.id, 0),
                )
                for version in sorted(act.versions, key=lambda v: v.label)
            ],
        )
        for act in acts
    ]


@router.get(
    "/versions/{version_id}/articles", response_model=list[CorpusArticleListItem]
)
async def list_version_articles(
    version_id: UUID,
    auth_subject: auth.CorpusRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> list[CorpusArticleListItem]:
    """Ordered article list of one version — numbers only, no text."""
    repository = CorpusRepository.from_session(session)
    version = await repository.get_version_by_id(version_id)
    if version is None:
        raise ResourceNotFound()
    articles = await repository.list_articles_for_version(version_id)
    return [
        CorpusArticleListItem(
            id=article.id,
            number=article.number,
            sort_key=article.sort_key,
            heading=article.heading,
        )
        for article in articles
    ]


@router.get("/articles/{article_id}", response_model=CorpusArticleDetail)
async def get_article(
    article_id: UUID,
    auth_subject: auth.CorpusRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> CorpusArticleDetail:
    """Full article detail: text, equivalences and verified jurisprudence."""
    repository = CorpusRepository.from_session(session)
    article = await repository.get_article_by_id(article_id)
    if article is None:
        raise ResourceNotFound()

    equivalences: list[CorpusArticleEquivalence] = []
    for equivalence in await repository.list_equivalences_for_article(article_id):
        counterpart = (
            equivalence.new_article
            if equivalence.old_article_id == article_id
            else equivalence.old_article
        )
        if counterpart is None:
            continue
        equivalences.append(
            CorpusArticleEquivalence(
                article_id=counterpart.id,
                number=counterpart.number,
                version_label=counterpart.act_version.label,
                relation=equivalence.relation,
                note=equivalence.note,
            )
        )

    links = await repository.list_verified_links_for_article(article_id)
    decisions = [
        CorpusLinkedDecision(
            id=link.decision.id,
            number=link.decision.number,
            decided_on=link.decision.decided_on,
            summary=link.decision.summary,
            # No treatment has been human-accepted yet: always None for now.
            treatment=None,
        )
        for link in links
    ]

    return CorpusArticleDetail(
        id=article.id,
        number=article.number,
        heading=article.heading,
        text=article.text,
        alineas=_alineas(article),
        version_label=article.act_version.label,
        act_short_code=article.act_version.act.short_code,
        provenance=_provenance(article),
        equivalences=equivalences,
        decisions=decisions,
    )


@router.get("/decisions/{decision_id}", response_model=CorpusDecisionDetail)
async def get_decision(
    decision_id: UUID,
    auth_subject: auth.CorpusRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> CorpusDecisionDetail:
    """Full decision detail with its verified article links."""
    repository = CorpusRepository.from_session(session)
    decision = await repository.get_decision_by_id(decision_id)
    if decision is None:
        raise ResourceNotFound()

    links = await repository.list_verified_links_for_decision(decision_id)
    return CorpusDecisionDetail(
        id=decision.id,
        number=decision.number,
        decided_on=decision.decided_on,
        chamber=decision.chamber,
        urn_lex=decision.urn_lex,
        ohadata_code=decision.ohadata_code,
        source_url=decision.source_url,
        summary=decision.summary,
        full_text=decision.full_text,
        articles=[
            CorpusDecisionArticle(
                article_id=link.article.id,
                number=link.article.number,
                version_label=link.article.act_version.label,
            )
            for link in links
        ],
    )
