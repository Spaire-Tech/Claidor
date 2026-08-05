"""Librarian prototype: one grounded, cited answer from the loaded corpus.

Usage: ``CLAIDOR_ENV=development uv run python -m scripts.librarian_prototype "<question>"``

Assembles the saisie-attribution slice (both act versions + harvested CCJA
decisions) as one document block per source with citations enabled, asks
Claude the question in French, and prints the answer with its citations
mapped back to the exact source rows. No streaming, no endpoint — this is
the smallest thing that proves the product.
"""

import asyncio
import sys
from typing import Any

import structlog
from sqlalchemy import select

from polar.config import settings
from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import (
    CourtDecision,
    DecisionArticleLink,
    DecisionLinkStatus,
    LegalActVersion,
    LegalArticle,
)
from polar.postgres import create_async_engine
from scripts.corpus_slice_seed import SLICE_ARTICLES_1998, TRANSITIONAL_RULE_1998

log = structlog.get_logger()

ANSWER_MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = f"""Tu es Claidor, l'assistant de recherche juridique sur le droit OHADA.

Règles absolues :
- Tu réponds UNIQUEMENT à partir des documents fournis (articles des Actes
  uniformes et décisions de la CCJA). Si les documents ne permettent pas de
  répondre, dis-le clairement — ne complète jamais avec des connaissances
  générales.
- Deux versions de l'AUPSRVE coexistent : {TRANSITIONAL_RULE_1998}
  Si la réponse dépend de la version applicable, indique d'abord la règle
  pour chaque régime, et précise que la version applicable dépend de la date
  d'engagement de la procédure.
- Cite toujours l'article précis (et sa version : 1998 ou 2023) et les
  décisions CCJA pertinentes. Utilise les citations pour ancrer chaque
  affirmation juridique.
- Réponds en français, de manière concise et structurée, comme à un confrère
  avocat pressé.
- Termine par une ligne « Autorité : … » qualifiant l'assise
  jurisprudentielle (p. ex. « jurisprudence constante — N décisions » ou
  « décision unique » ou « texte seul, pas de jurisprudence fournie »)."""


async def build_documents() -> list[dict[str, Any]]:
    """One citations-enabled document block per source row."""
    engine = create_async_engine("script")
    sm = create_async_sessionmaker(engine)
    documents: list[dict[str, Any]] = []
    async with sm() as s:
        versions = {
            v.label: v for v in (await s.execute(select(LegalActVersion))).scalars()
        }
        # 1998 slice articles.
        arts_1998 = (
            (
                await s.execute(
                    select(LegalArticle)
                    .where(
                        LegalArticle.act_version_id == versions["1998"].id,
                        LegalArticle.number.in_(SLICE_ARTICLES_1998),
                    )
                    .order_by(LegalArticle.sort_key)
                )
            )
            .scalars()
            .all()
        )
        # 2023 counterparts: articles mentioning saisie-attribution.
        arts_2023 = (
            (
                await s.execute(
                    select(LegalArticle)
                    .where(
                        LegalArticle.act_version_id == versions["2023"].id,
                        LegalArticle.text.ilike("%saisie-attribution%"),
                    )
                    .order_by(LegalArticle.sort_key)
                )
            )
            .scalars()
            .all()
        )
        for art in [*arts_1998, *arts_2023]:
            label = "1998" if art.act_version_id == versions["1998"].id else "2023"
            documents.append(
                {
                    "type": "document",
                    "source": {
                        "type": "text",
                        "media_type": "text/plain",
                        "data": art.text,
                    },
                    "title": f"AUPSRVE ({label}) — Article {art.number}",
                    "citations": {"enabled": True},
                }
            )
        # Decisions with at least one verified link (the trusted graph).
        decision_ids = {
            row[0]
            for row in await s.execute(
                select(DecisionArticleLink.decision_id).where(
                    DecisionArticleLink.status == DecisionLinkStatus.verified
                )
            )
        }
        decisions = (
            (
                await s.execute(
                    select(CourtDecision)
                    .where(CourtDecision.id.in_(decision_ids))
                    .order_by(CourtDecision.decided_on)
                )
            )
            .scalars()
            .all()
        )
        for d in decisions:
            documents.append(
                {
                    "type": "document",
                    "source": {
                        "type": "text",
                        "media_type": "text/plain",
                        "data": (d.full_text or "")[:60_000],
                    },
                    "title": f"CCJA, arrêt n° {d.number} du {d.decided_on:%d/%m/%Y}",
                    "citations": {"enabled": True},
                }
            )
    await engine.dispose()
    return documents


def ask(documents: list[dict[str, Any]], question: str) -> None:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=ANSWER_MODEL,
        max_tokens=1500,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [*documents, {"type": "text", "text": question}],
            }
        ],
    )

    print("=" * 72)
    print("QUESTION :", question)
    print("=" * 72)
    citations: list[tuple[str, str]] = []
    for block in response.content:
        if block.type != "text":
            continue
        marks = ""
        for c in getattr(block, "citations", None) or []:
            title = getattr(c, "document_title", None) or "?"
            quote = (getattr(c, "cited_text", "") or "").strip()[:160]
            citations.append((title, quote))
            marks += f"[{len(citations)}]"
        print(block.text + marks, end="")
    print("\n" + "-" * 72)
    print("SOURCES CITÉES :")
    for i, (title, quote) in enumerate(citations, 1):
        print(f"  [{i}] {title}")
        print(f"      « {quote}… »")
    print("-" * 72)
    print(
        f"(documents fournis : {len(documents)} | "
        f"tokens: in={response.usage.input_tokens}, out={response.usage.output_tokens})"
    )


async def main() -> None:
    question = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "Dans quel délai le débiteur peut-il contester une saisie-attribution, "
        "et devant quel juge ?"
    )
    documents = await build_documents()
    log.info("librarian.prototype.corpus", documents=len(documents))
    ask(documents, question)


if __name__ == "__main__":
    asyncio.run(main())
