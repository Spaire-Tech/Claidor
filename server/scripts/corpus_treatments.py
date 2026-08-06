"""Propose treatment labels for verified decision-article links.

Usage: ``CLAIDOR_ENV=development uv run python -m scripts.corpus_treatments``

For each VERIFIED link with treatment_status='unverified', the model proposes
how the decision treats the article — applique / interprète / distingue /
mentionne — with a short supporting quote. Guards, in code:
- the quote must literally appear in the decision text (whitespace-
  normalized); otherwise the proposal is DISCARDED and the link stays
  unverified — a label without a real quote is worthless;
- proposals land as treatment_status='proposed'; nothing surfaces in the
  product until a human accepts/corrects in the backoffice review screen.
"""

import asyncio
import json
import re

import structlog
from sqlalchemy import select

from polar.config import settings
from polar.kit.db.postgres import AsyncSession, create_async_sessionmaker
from polar.models import (
    CourtDecision,
    DecisionArticleLink,
    DecisionArticleTreatment,
    DecisionLinkStatus,
    LegalArticle,
    TreatmentStatus,
)
from polar.postgres import create_async_engine

log = structlog.get_logger()

MODEL = "claude-sonnet-4-6"

LABELS = {
    "applique": DecisionArticleTreatment.applies,
    "interprète": DecisionArticleTreatment.interprets,
    "interprete": DecisionArticleTreatment.interprets,
    "distingue": DecisionArticleTreatment.distinguishes,
    "mentionne": DecisionArticleTreatment.cites,
}


def _normalize(text: str) -> str:
    """Match-tolerant form: unify apostrophes/quotes, drop all whitespace.

    Decision texts carry curly apostrophes and PDF spacing artifacts
    ("constatan t"); the model outputs clean typography. Removing all
    whitespace and unifying punctuation lets a genuine quote match through
    both."""
    text = text.lower()
    for ch in "\u2019\u2018`\u00b4":
        text = text.replace(ch, "'")
    for ch in "\u00ab\u00bb\u201c\u201d":
        text = text.replace(ch, '"')
    return re.sub(r"\s+", "", text)


async def propose(session: AsyncSession) -> None:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    links = (
        (
            await session.execute(
                select(DecisionArticleLink).where(
                    DecisionArticleLink.status == DecisionLinkStatus.verified,
                    DecisionArticleLink.treatment_status == TreatmentStatus.unverified,
                )
            )
        )
        .scalars()
        .all()
    )
    proposed = discarded = 0
    for link in links:
        decision = (
            await session.execute(
                select(CourtDecision).where(CourtDecision.id == link.decision_id)
            )
        ).scalar_one()
        article = (
            await session.execute(
                select(LegalArticle).where(LegalArticle.id == link.article_id)
            )
        ).scalar_one()

        prompt = (
            "Décision CCJA (texte intégral) :\n\n"
            f"{(decision.full_text or '')[:50_000]}\n\n---\n\n"
            f"Comment cette décision traite-t-elle l'article {article.number} "
            "de l'AUPSRVE ? Choisis UN label :\n"
            "- applique : la cour fonde sa solution sur cet article\n"
            "- interprète : la cour en précise le sens ou la portée\n"
            "- distingue : la cour l'écarte ou en limite l'application au cas\n"
            "- mentionne : simple visa ou référence sans rôle décisif\n\n"
            'Réponds UNIQUEMENT en JSON : {"label": "...", "quote": '
            '"citation textuelle EXACTE de la décision (une ou deux phrases) '
            'qui justifie le label"}'
        )
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}],
            )
            text = "".join(b.text for b in response.content if b.type == "text")
            payload = json.loads(text[text.find("{") : text.rfind("}") + 1])
            label = LABELS.get(str(payload.get("label", "")).strip().lower())
            quote = str(payload.get("quote", "")).strip()
        except Exception as e:
            log.warning("treatments.propose.failed", error=str(e)[:120])
            continue

        # Fabrication guard: the quote must exist in the decision text.
        if (
            label is None
            or not quote
            or _normalize(quote) not in _normalize(decision.full_text or "")
        ):
            discarded += 1
            log.warning(
                "treatments.propose.discarded",
                decision=decision.number,
                article=article.number,
                reason="label invalide ou citation introuvable dans la décision",
            )
            continue

        link.treatment = label
        link.treatment_quote = quote[:1000]
        link.treatment_status = TreatmentStatus.proposed
        session.add(link)
        proposed += 1
        log.info(
            "treatments.proposed",
            decision=decision.number,
            article=article.number,
            label=label.value,
        )

    log.info("treatments.done", proposed=proposed, discarded=discarded)


async def main() -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        await propose(session)
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
