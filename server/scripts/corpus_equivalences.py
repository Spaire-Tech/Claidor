"""Build the 1998↔2023 article equivalence map for the slice — mechanically.

Usage: ``CLAIDOR_ENV=development uv run python -m scripts.corpus_equivalences``

Method (code, not model judgment):
1. Same-number candidate: similarity ≥ 0.90 → unchanged; 0.50–0.90 → amended.
2. Below 0.50 or missing: best-similarity search across all 2023 articles;
   ≥ 0.50 → renumbered (or renumbered+amended); otherwise the article is
   left UNMAPPED and reported — never guessed.
Idempotent; reruns update notes but never duplicate rows.
"""

import asyncio
import difflib

import structlog
from sqlalchemy import select

from polar.corpus.slice import SLICE_ARTICLES_1998
from polar.kit.db.postgres import AsyncSession, create_async_sessionmaker
from polar.models import (
    LegalAct,
    LegalActVersion,
    LegalArticle,
    LegalArticleEquivalence,
)
from polar.models.legal_act import ArticleEquivalenceRelation
from polar.postgres import create_async_engine

log = structlog.get_logger()

UNCHANGED_THRESHOLD = 0.90
MATCH_THRESHOLD = 0.50


def _similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, a, b).ratio()


_DOMAIN_TERMS = [
    "tiers saisi",
    "saisie",
    "créancier",
    "débiteur",
    "juridiction compétente",
    "président",
    "dénonc",
    "contestation",
    "exécution",
    "délai",
]


def _shares_domain(a: str, b: str) -> bool:
    """Same-subject check: both texts use ≥2 of the same domain terms."""
    a_low, b_low = a.lower(), b.lower()
    shared = sum(1 for t in _DOMAIN_TERMS if t in a_low and t in b_low)
    return shared >= 2


async def build(session: AsyncSession) -> None:
    # Scoped to AUPSRVE: version labels are NOT globally unique — AUPC also
    # has a "1998" — and an unscoped {label: version} dict resolves to
    # whichever row the database returns last. In development that happened
    # to be AUPSRVE and the script worked by luck; in production it was
    # AUPC, and the map came out empty.
    versions = {
        v.label: v
        for v in (
            await session.execute(
                select(LegalActVersion)
                .join(LegalAct)
                .where(LegalAct.short_code == "AUPSRVE")
            )
        ).scalars()
    }
    arts_1998 = {
        a.number: a
        for a in (
            await session.execute(
                select(LegalArticle).where(
                    LegalArticle.act_version_id == versions["1998"].id
                )
            )
        ).scalars()
    }
    arts_2023 = {
        a.number: a
        for a in (
            await session.execute(
                select(LegalArticle).where(
                    LegalArticle.act_version_id == versions["2023"].id
                )
            )
        ).scalars()
    }

    created = updated = unmapped = 0
    for number in SLICE_ARTICLES_1998:
        old = arts_1998.get(number)
        if old is None:
            continue

        relation: ArticleEquivalenceRelation | None = None
        target: LegalArticle | None = None
        note = ""

        same = arts_2023.get(number)
        sim_same = _similarity(old.text, same.text) if same else 0.0
        if same is not None and sim_same >= UNCHANGED_THRESHOLD:
            relation, target = ArticleEquivalenceRelation.unchanged, same
            note = f"Texte inchangé (similarité {sim_same:.0%})."
        elif same is not None and sim_same >= MATCH_THRESHOLD:
            relation, target = ArticleEquivalenceRelation.amended, same
            note = f"Même numéro, texte modifié (similarité {sim_same:.0%})."
        elif same is not None and _shares_domain(old.text, same.text):
            # Same number, deeply rewritten, same subject vocabulary: map as
            # amended with an explicit caveat rather than losing the pair.
            relation, target = ArticleEquivalenceRelation.amended, same
            note = (
                f"Même numéro, texte profondément remanié en 2023 "
                f"(similarité {sim_same:.0%}) — correspondance par numéro et "
                "vocabulaire, à confirmer en revue."
            )
        else:
            # Search the whole 2023 act for the best content match.
            best_number, best_sim = None, 0.0
            for cand_number, cand in arts_2023.items():
                sim = _similarity(old.text, cand.text)
                if sim > best_sim:
                    best_number, best_sim = cand_number, sim
            if best_number is not None and best_sim >= MATCH_THRESHOLD:
                target = arts_2023[best_number]
                relation = (
                    ArticleEquivalenceRelation.renumbered
                    if best_sim >= UNCHANGED_THRESHOLD
                    else ArticleEquivalenceRelation.amended
                )
                note = (
                    f"Art. {number} (1998) → art. {best_number} (2023), "
                    f"similarité {best_sim:.0%}."
                )
            else:
                unmapped += 1
                log.warning(
                    "corpus.equivalence.unmapped",
                    article=number,
                    best=best_number,
                    similarity=f"{best_sim:.2f}",
                )
                continue

        existing = (
            await session.execute(
                select(LegalArticleEquivalence).where(
                    LegalArticleEquivalence.old_article_id == old.id,
                    LegalArticleEquivalence.new_article_id == target.id,
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            session.add(
                LegalArticleEquivalence(
                    old_article_id=old.id,
                    new_article_id=target.id,
                    relation=relation,
                    note=note,
                )
            )
            created += 1
        elif existing.note != note or existing.relation != relation:
            existing.relation = relation
            existing.note = note
            session.add(existing)
            updated += 1

    log.info(
        "corpus.equivalence.built",
        created=created,
        updated=updated,
        unmapped=unmapped,
    )


async def main() -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        await build(session)
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
