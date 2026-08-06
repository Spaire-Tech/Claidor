from datetime import date
from uuid import UUID

from fastapi import Depends, Query

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
    CorpusSearchArticleResult,
    CorpusSearchDecisionResult,
    CorpusSearchInterpretation,
    CorpusSearchResults,
)
from .search_query import QueryKind, parse_query
from .search_repository import SearchRepository

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


def _excerpt(text: str | None, *, limit: int = 260) -> str:
    """First readable lines of a document, for a result row."""
    if not text:
        return ""
    collapsed = " ".join(text.split())
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[:limit].rsplit(" ", 1)[0] + "…"


@router.get("/search", response_model=CorpusSearchResults)
async def search(
    auth_subject: auth.CorpusRead,
    q: str = Query("", max_length=300, description="Query as a lawyer types it."),
    act: str | None = Query(None, description="Registry short code, e.g. AUPSRVE."),
    version: str | None = Query(None, description="Version label, e.g. 1998."),
    decided_from: date | None = Query(None),
    decided_to: date | None = Query(None),
    chamber: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> CorpusSearchResults:
    """Search the corpus the way practitioners look things up.

    A citation-shaped query (« article 170 AUPSRVE », « CCJA 090/2018 »)
    lands on the document itself; anything else is full-text with filters.
    How the query was read is returned alongside the results, so a
    surprising result set is explainable rather than mysterious.
    """
    repository = SearchRepository.from_session(session)
    parsed = parse_query(q)
    act_code = act or parsed.act_code

    articles: list[CorpusSearchArticleResult] = []
    decisions: list[CorpusSearchDecisionResult] = []

    if parsed.kind == QueryKind.article and parsed.number is not None:
        for article in await repository.find_articles_by_number(
            parsed.number, act_code=act_code, version_label=version
        ):
            articles.append(
                CorpusSearchArticleResult(
                    id=article.id,
                    number=article.number,
                    act_short_code=article.act_version.act.short_code,
                    act_title=article.act_version.act.title,
                    version_label=article.act_version.label,
                    in_force_from=article.act_version.in_force_from,
                    excerpt=_excerpt(article.text),
                    exact=True,
                )
            )
    elif parsed.kind == QueryKind.decision and parsed.number is not None:
        for decision in await repository.find_decisions_by_number(parsed.number):
            decisions.append(
                CorpusSearchDecisionResult(
                    id=decision.id,
                    number=decision.number,
                    decided_on=decision.decided_on,
                    chamber=decision.chamber,
                    keyword_header=decision.keyword_header,
                    excerpt=_excerpt(decision.keyword_header or decision.full_text),
                    exact=True,
                )
            )

    # Text search always runs alongside an exact landing: a lawyer who
    # types an article number often also wants what discusses it.
    if q.strip():
        for article, _score in await repository.search_articles(
            q, act_code=act_code, version_label=version, limit=limit
        ):
            if any(existing.id == article.id for existing in articles):
                continue
            articles.append(
                CorpusSearchArticleResult(
                    id=article.id,
                    number=article.number,
                    act_short_code=article.act_version.act.short_code,
                    act_title=article.act_version.act.title,
                    version_label=article.act_version.label,
                    in_force_from=article.act_version.in_force_from,
                    excerpt=_excerpt(article.text),
                )
            )
        for decision, _score in await repository.search_decisions(
            q,
            decided_from=decided_from,
            decided_to=decided_to,
            chamber=chamber,
            limit=limit,
        ):
            if any(existing.id == decision.id for existing in decisions):
                continue
            decisions.append(
                CorpusSearchDecisionResult(
                    id=decision.id,
                    number=decision.number,
                    decided_on=decision.decided_on,
                    chamber=decision.chamber,
                    keyword_header=decision.keyword_header,
                    excerpt=_excerpt(decision.keyword_header or decision.full_text),
                )
            )
    elif decided_from or decided_to or chamber:
        # Filters with no query: browsing, e.g. "all decisions since 2015".
        for decision in await repository.list_decisions_filtered(
            decided_from=decided_from,
            decided_to=decided_to,
            chamber=chamber,
            limit=limit,
        ):
            decisions.append(
                CorpusSearchDecisionResult(
                    id=decision.id,
                    number=decision.number,
                    decided_on=decision.decided_on,
                    chamber=decision.chamber,
                    keyword_header=decision.keyword_header,
                    excerpt=_excerpt(decision.keyword_header or decision.full_text),
                )
            )

    return CorpusSearchResults(
        interpretation=CorpusSearchInterpretation(
            kind=str(parsed.kind),
            number=parsed.number,
            act_code=act_code,
            year=parsed.year,
        ),
        articles=articles[:limit],
        decisions=decisions[:limit],
        chambers=list(await repository.list_chambers()),
    )
