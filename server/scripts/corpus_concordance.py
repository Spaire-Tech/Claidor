"""Compute and store the old↔new concordance for every revised act.

Usage: ``uv run python -m scripts.corpus_concordance [--apply] [--act CODE]``

Fourteen mappings existed, all AUPSRVE, all made by hand. Everywhere else
« Comparer les versions » and « Retracer l'historique » had nothing to
work with and said so. This fills the gap by alignment (see
``polar.corpus.concordance``) across the six acts that have two versions.

Two rules govern what it writes:

- **a human's mapping is never overwritten.** The hand-made rows encode
  legal judgment the text alone cannot yield — AUPSRVE 1998 art. 335
  (delays are franc) answers to 2023 art. 87, which refers to art. 239
  and shares almost no words with it. No aligner will ever find that, and
  none should be allowed to overwrite it.
- **computed rows say they are computed**, carrying the similarity that
  produced them, so a reader can weigh them and nobody mistakes them for
  the legislator's own table of concordance.

Dry run by default.
"""

import asyncio
import sys
from collections import Counter

import structlog
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from polar.corpus.concordance import ArticleRef, Mapping, align
from polar.kit.db.postgres import AsyncSession, create_async_sessionmaker
from polar.models import (
    ArticleEquivalenceRelation,
    LegalAct,
    LegalActVersion,
    LegalArticle,
    LegalArticleEquivalence,
)
from polar.postgres import create_async_engine

log = structlog.get_logger()

#: The acts that exist in two versions, oldest first.
REVISED_ACTS = [
    ("AUA", "1999", "2017"),
    ("AUDCG", "1997", "2010"),
    ("AUPC", "1998", "2015"),
    ("AUPSRVE", "1998", "2023"),
    ("AUS", "1997", "2010"),
    ("AUSCGIE", "1997", "2014"),
]

COMPUTED_NOTE = "concordance calculée"


async def _articles(
    session: AsyncSession, short_code: str, label: str
) -> list[LegalArticle]:
    version = (
        await session.execute(
            select(LegalActVersion)
            .join(LegalAct)
            .where(LegalAct.short_code == short_code, LegalActVersion.label == label)
        )
    ).scalar_one_or_none()
    if version is None:
        return []
    return list(
        (
            await session.execute(
                select(LegalArticle)
                .where(LegalArticle.act_version_id == version.id)
                .order_by(LegalArticle.sort_key)
            )
        )
        .scalars()
        .all()
    )


def _relation(mapping: Mapping) -> ArticleEquivalenceRelation:
    return {
        "unchanged": ArticleEquivalenceRelation.unchanged,
        "renumbered": ArticleEquivalenceRelation.renumbered,
        "amended": ArticleEquivalenceRelation.amended,
    }[mapping.relation]


async def main() -> None:
    apply = "--apply" in sys.argv
    only = None
    if "--act" in sys.argv:
        only = sys.argv[sys.argv.index("--act") + 1].upper()

    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        existing_rows = (
            (
                await session.execute(
                    select(LegalArticleEquivalence).options(
                        joinedload(LegalArticleEquivalence.old_article),
                        joinedload(LegalArticleEquivalence.new_article),
                    )
                )
            )
            .unique()
            .scalars()
            .all()
        )
        # Anything already mapped from this old article stays as it is.
        already_mapped = {
            row.old_article_id for row in existing_rows if row.old_article_id
        }
        log.info("concordance.existing", rows=len(existing_rows))

        totals: Counter[str] = Counter()
        for short_code, old_label, new_label in REVISED_ACTS:
            if only and short_code != only:
                continue
            old = await _articles(session, short_code, old_label)
            new = await _articles(session, short_code, new_label)
            if not old or not new:
                log.warning("concordance.skip", act=short_code)
                continue

            mappings = align(
                [ArticleRef(number=a.number, text=a.text) for a in old],
                [ArticleRef(number=b.number, text=b.text) for b in new],
            )
            by_old = {a.number: a for a in old}
            by_new = {b.number: b for b in new}

            created = kept = 0
            relations: Counter[str] = Counter()
            for mapping in mappings:
                if not mapping.is_pair:
                    relations[mapping.relation] += 1
                    continue
                assert mapping.old is not None
                assert mapping.new is not None
                old_article = by_old[mapping.old.number]
                new_article = by_new[mapping.new.number]
                if old_article.id in already_mapped:
                    kept += 1
                    continue
                relations[mapping.relation] += 1
                created += 1
                if apply:
                    session.add(
                        LegalArticleEquivalence(
                            old_article_id=old_article.id,
                            new_article_id=new_article.id,
                            relation=_relation(mapping),
                            note=f"{COMPUTED_NOTE} · similarité {mapping.similarity:.2f}",
                        )
                    )
            log.info(
                "concordance.act",
                act=f"{short_code} {old_label}->{new_label}",
                created=created,
                kept_human=kept,
                **relations,
            )
            totals.update(relations)
            totals["created"] += created

        if apply:
            await session.commit()
        log.info("concordance.done", applied=apply, dry_run=not apply, **totals)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
