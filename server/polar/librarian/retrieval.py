"""Choosing what the librarian reads, through the citation graph.

Every question used to arrive with the same pile: sixteen slice articles
and the thirty most-linked judgments in the collection, whatever was
asked. A question about article 336 was answered beside thirty decisions
about article 49. That is expensive — around 148,000 tokens a question —
and worse than expensive, it is noise: the model had to find the relevant
provision inside a stack of irrelevant ones, on every single question.

We already pay for a citation graph, so retrieval goes through it:

1. **Which articles is the question about?** Ones it cites by name, read
   by the same deterministic extractor the Lecteur uses, and ones the
   corpus's own full-text search surfaces for the words used.
2. **Which decisions read those articles?** Exactly the judgments with a
   *verified* link into that article set — nothing else travels.

The difference from similarity search is not size, it is accountability.
Every decision in the request can be traced to the provision that put it
there, so « why was this arrêt considered? » has an answer a lawyer can
check: because it is verified as citing article 336. A vector store would
give a smaller prompt and no such sentence.

**Under-retrieval is the danger, and it fails loudly.** A question that
maps to nothing, or to almost nothing, does not get answered from a thin
set — it widens to the general fund and says it widened. Silence about a
narrow reading is the one way this could make the product worse.
"""

from dataclasses import dataclass, field
from uuid import UUID

from polar.corpus.repository import CorpusRepository
from polar.corpus.search_repository import SearchRepository
from polar.corpus.slice import SLICE_ARTICLES_1998
from polar.kit.db.postgres import AsyncReadSession
from polar.lecteur.citations import extract
from polar.models import CourtDecision, LegalArticle

#: Articles are cheap and judgments are not — about 500 tokens against
#: 3,300 — so precision is spent on the decisions and generosity on the
#: provisions. Missing the article the question turns on is the expensive
#: mistake; carrying one extra is nearly free.
MAX_ARTICLES = 26

#: Distinct *provisions* from full-text search, counted before rédactions
#: are added. Counting rows instead would let one provision eat two slots:
#: « dans quel délai contester une saisie-attribution » ranks art. 170 —
#: the article that answers it — seventh, behind three provisions holding
#: six rows between them.
SEARCH_PROVISIONS = 10
#: Rows to ask for, knowing each provision may occupy several.
SEARCH_ROWS = 40
#: An unqualified « article 170 » can exist in several acts; take a few.
MAX_UNQUALIFIED = 4

#: Judgments per request. They dominate the token count, so this is the
#: number that decides the bill.
MAX_DECISIONS = 8

#: Longest judgment text sent whole. The median arrêt runs about 11,000
#: characters and passes untouched; the occasional 48,000-character one
#: would otherwise eat a third of the request on its own.
MAX_DECISION_CHARS = 20_000

#: When one must be cut, the *front* goes. A CCJA arrêt opens with parties,
#: procedure and the arrêt attaqué, and closes with the motifs and the
#: dispositif — the part that states the rule is at the end, so trimming
#: from the start keeps what the answer needs to cite.
TRUNCATION_NOTE = "[…début de l'arrêt omis…]\n\n"


def decision_text(full_text: str | None) -> str:
    """The judgment as it travels, cut from the front when over-long."""
    text = full_text or ""
    if len(text) <= MAX_DECISION_CHARS:
        return text
    tail = text[-MAX_DECISION_CHARS:]
    # Start at a paragraph boundary so no sentence arrives half-quoted.
    boundary = tail.find("\n")
    if boundary != -1:
        tail = tail[boundary + 1 :]
    return TRUNCATION_NOTE + tail


#: Below either of these the mapping is too thin to trust, and retrieval
#: widens to the general fund rather than answering from a sliver.
MIN_ARTICLES = 1
MIN_DECISIONS = 3

#: What the widened fund is: the phase-1 slice and the collection's
#: most-linked judgments — exactly the old fixed pile, now a fallback
#: instead of the default.
WIDENED_DECISIONS = 20


@dataclass(frozen=True)
class RetrievedArticle:
    article: LegalArticle
    #: Why this article is in the request, in words a lawyer can read.
    reason: str


@dataclass(frozen=True)
class RetrievedDecision:
    decision: CourtDecision
    #: The provisions whose verified links put this judgment here.
    via: list[str] = field(default_factory=list)

    @property
    def reason(self) -> str:
        if not self.via:
            return "fonds général"
        return "lien vérifié vers " + ", ".join(self.via)


@dataclass(frozen=True)
class Retrieval:
    articles: list[RetrievedArticle]
    decisions: list[RetrievedDecision]
    #: True when the question did not map cleanly and the general fund was
    #: consulted instead. Never silent: the caller says so.
    widened: bool
    reason: str

    @property
    def article_ids(self) -> list[UUID]:
        return [r.article.id for r in self.articles]


def _label(article: LegalArticle) -> str:
    version = article.act_version
    return f"art. {article.number} ({version.act.short_code} {version.label})"


async def _cited_articles(
    repository: CorpusRepository, question: str
) -> list[RetrievedArticle]:
    """Articles the question names outright.

    Read by the Lecteur's extractor, which is deterministic: it may miss a
    reference, and it never invents one.
    """
    found: list[RetrievedArticle] = []
    seen: set[UUID] = set()
    for citation in extract(question):
        if citation.kind != "article":
            continue
        if citation.act:
            act = await repository.get_act_by_short_code(citation.act)
            if act is None:
                continue
            articles = await repository.list_articles_by_number_for_act(
                act.id, citation.number
            )
            reason = f"citée dans la question ({citation.act})"
        else:
            articles = await repository.list_articles_by_number_any_act(
                citation.number, limit=MAX_UNQUALIFIED
            )
            reason = "citée dans la question (acte non précisé)"
        for article in articles:
            if article.id in seen:
                continue
            seen.add(article.id)
            found.append(RetrievedArticle(article=article, reason=reason))
    return found


async def retrieve(
    session: AsyncReadSession, question: str, *, deep: bool = False
) -> Retrieval:
    """The articles and judgments this question is actually about."""
    repository = CorpusRepository.from_session(session)
    search = SearchRepository.from_session(session)

    articles = await _cited_articles(repository, question)
    seen = {r.article.id for r in articles}

    # The corpus's own search for the words used, for questions that
    # describe a problem instead of citing a provision. Counted by
    # provision, not by row: the counterpart pass below adds the other
    # rédaction anyway, so letting one provision hold two slots here would
    # buy nothing and cost breadth.
    if len(articles) < MAX_ARTICLES:
        provisions: set[tuple[str, str]] = set()
        for article, _score in await search.search_articles(
            question, limit=SEARCH_ROWS
        ):
            if article.id in seen or len(articles) >= MAX_ARTICLES:
                continue
            provision = (article.act_version.act.short_code, article.number)
            if provision not in provisions:
                if len(provisions) >= SEARCH_PROVISIONS:
                    continue
                provisions.add(provision)
            seen.add(article.id)
            articles.append(
                RetrievedArticle(article=article, reason="recherche plein texte")
            )

    # Whichever rédaction we reached, its counterpart comes too — the
    # version gate must never compare a text against silence.
    for counterpart in await repository.list_counterpart_articles(list(seen)):
        if counterpart.id in seen:
            continue
        seen.add(counterpart.id)
        articles.append(
            RetrievedArticle(
                article=counterpart, reason="autre rédaction du même article"
            )
        )

    decisions = await _decisions_for(repository, articles, deep=deep)

    if len(articles) >= MIN_ARTICLES and len(decisions) >= MIN_DECISIONS:
        return Retrieval(
            articles=articles,
            decisions=decisions,
            widened=False,
            reason="articles de la question et décisions qui les citent",
        )

    # Too thin to trust. Widen rather than answer from a sliver — and say
    # that is what happened.
    return await _widened(repository, articles, seen, deep=deep)


async def _decisions_for(
    repository: CorpusRepository,
    articles: list[RetrievedArticle],
    *,
    deep: bool,
) -> list[RetrievedDecision]:
    """Judgments verified as reading these provisions, best-connected first."""
    links = await repository.list_links_into_articles([r.article.id for r in articles])
    by_decision: dict[UUID, list[str]] = {}
    rows: dict[UUID, CourtDecision] = {}
    for link in links:
        rows.setdefault(link.decision_id, link.decision)
        label = _label(link.article)
        via = by_decision.setdefault(link.decision_id, [])
        if label not in via:
            via.append(label)

    limit = MAX_DECISIONS * 2 if deep else MAX_DECISIONS
    ordered = sorted(
        by_decision.items(),
        # More links into the question's provisions is a better reason to
        # be here than a single passing citation; recency breaks ties.
        key=lambda item: (-len(item[1]), -rows[item[0]].decided_on.toordinal()),
    )
    return [
        RetrievedDecision(decision=rows[decision_id], via=via)
        for decision_id, via in ordered[:limit]
    ]


async def _widened(
    repository: CorpusRepository,
    articles: list[RetrievedArticle],
    seen: set[UUID],
    *,
    deep: bool,
) -> Retrieval:
    """The general fund, when the question did not map to provisions."""
    version = await repository.get_version_by_label("1998")
    if version is not None:
        for article in await repository.list_articles_by_numbers(
            version.id, SLICE_ARTICLES_1998
        ):
            if article.id in seen:
                continue
            seen.add(article.id)
            articles.append(RetrievedArticle(article=article, reason="fonds général"))
        for counterpart in await repository.list_counterpart_articles(list(seen)):
            if counterpart.id in seen:
                continue
            seen.add(counterpart.id)
            articles.append(
                RetrievedArticle(article=counterpart, reason="fonds général")
            )

    linked = await _decisions_for(repository, articles, deep=deep)
    if len(linked) < MIN_DECISIONS:
        # Still nothing: fall all the way back to the most-linked judgments
        # in the collection, so the answer is grounded in something.
        top = await repository.list_top_decisions_for_articles(
            [r.article.id for r in articles],
            limit=WIDENED_DECISIONS * 2 if deep else WIDENED_DECISIONS,
        )
        linked = [RetrievedDecision(decision=d, via=[]) for d in top]

    return Retrieval(
        articles=articles,
        decisions=linked,
        widened=True,
        reason=(
            "la question n'a pas été rattachée précisément à des articles ; "
            "le fonds général a été consulté"
        ),
    )
