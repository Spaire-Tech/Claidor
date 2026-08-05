"""Load acquired corpus sources into the database (idempotent).

Usage: ``uv run python -m scripts.corpus_load``

Loads, from ``corpus/raw/`` at the repo root:
- AUPSRVE act + 2023 version + all articles (SenLII AKN HTML)
- Harvested CCJA decision pages (Juricaf HTML)

Decision→article links are seeded (status=proposed) only for decisions whose
target 1998 articles exist — i.e. after the 1998 text is loaded. Running this
script again after new acquisitions picks up whatever is new.
"""

import asyncio
import hashlib
from datetime import date
from pathlib import Path

import structlog
from sqlalchemy import select

from polar.corpus.akn import parse_lawsafrica_act_html
from polar.corpus.juricaf import parse_juricaf_decision_html
from polar.corpus.pdf_act import parse_pdf_act_text
from polar.kit.db.postgres import AsyncSession, create_async_sessionmaker
from polar.models import (
    CourtDecision,
    DecisionArticleLink,
    DecisionLinkStatus,
    LegalAct,
    LegalActVersion,
    LegalArticle,
)
from polar.postgres import create_async_engine
from scripts.corpus_slice_seed import (
    AKN_EXPRESSION_URI_2023,
    AKN_WORK_URI_2023,
    AUPSRVE_SHORT_CODE,
    SEED_DECISIONS,
    TRANSITIONAL_RULE_1998,
)

log = structlog.get_logger()

RAW = Path(__file__).parent.parent.parent / "corpus" / "raw"
SENLII_HTML = RAW / "senlii-aupsrve-2023-fra@2024-07-02.html"
TXT_1998 = RAW / "aupsrve-1998-leganet-extracted.txt"
DECISIONS_DIR = RAW / "decisions"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


async def load_act_2023(session: AsyncSession) -> None:
    act = (
        await session.execute(
            select(LegalAct).where(LegalAct.akn_work_uri == AKN_WORK_URI_2023)
        )
    ).scalar_one_or_none()
    if act is None:
        act = LegalAct(
            akn_work_uri=AKN_WORK_URI_2023,
            short_code=AUPSRVE_SHORT_CODE,
            title=(
                "Acte uniforme portant organisation des procédures simplifiées "
                "de recouvrement et des voies d'exécution"
            ),
        )
        session.add(act)
        await session.flush()

    version = (
        await session.execute(
            select(LegalActVersion).where(
                LegalActVersion.akn_expression_uri == AKN_EXPRESSION_URI_2023
            )
        )
    ).scalar_one_or_none()
    if version is None:
        version = LegalActVersion(
            act_id=act.id,
            akn_expression_uri=AKN_EXPRESSION_URI_2023,
            label="2023",
            adopted_on=date(2023, 10, 17),
            published_on=date(2023, 11, 15),
            gazette_reference="J.O. OHADA, numéro spécial, 15 novembre 2023",
            in_force_from=date(2024, 2, 16),
        )
        session.add(version)
        await session.flush()

    raw = SENLII_HTML.read_bytes()
    parsed = parse_lawsafrica_act_html(raw.decode("utf-8"))
    provenance = {
        "source": "senlii.org",
        "kind": "akoma-ntoso-html",
        "file": SENLII_HTML.name,
        "sha256": _sha256(raw),
        "license": "CC BY 4.0 / no copyright in legislative content",
        "authority_crosscheck": "pending (J.O. OHADA special 2023-11-15)",
    }

    existing = {
        a.number: a
        for a in (
            await session.execute(
                select(LegalArticle).where(LegalArticle.act_version_id == version.id)
            )
        ).scalars()
    }
    created = updated = 0
    for pa in parsed.articles:
        row = existing.get(pa.number)
        if row is None:
            session.add(
                LegalArticle(
                    act_version_id=version.id,
                    number=pa.number,
                    sort_key=pa.sort_key,
                    text=pa.text,
                    akn_eid=pa.akn_eid,
                    structure={"alineas": pa.alineas, "label": pa.number_label},
                    provenance=provenance,
                )
            )
            created += 1
        elif row.text != pa.text:
            row.text = pa.text
            row.structure = {"alineas": pa.alineas, "label": pa.number_label}
            row.provenance = provenance
            session.add(row)
            updated += 1
    log.info(
        "corpus.load.act_2023",
        parsed=len(parsed.articles),
        created=created,
        updated=updated,
    )


async def load_act_1998(session: AsyncSession) -> None:
    from polar.corpus.akn import article_sort_key

    act = (
        await session.execute(
            select(LegalAct).where(LegalAct.akn_work_uri == AKN_WORK_URI_2023)
        )
    ).scalar_one()

    version = (
        await session.execute(
            select(LegalActVersion).where(
                LegalActVersion.act_id == act.id, LegalActVersion.label == "1998"
            )
        )
    ).scalar_one_or_none()
    if version is None:
        version = LegalActVersion(
            act_id=act.id,
            label="1998",
            adopted_on=date(1998, 4, 10),
            published_on=date(1998, 6, 1),
            gazette_reference="J.O. OHADA n° 6, 1er juin 1998",
            in_force_from=date(1998, 7, 10),
            transitional_rule=TRANSITIONAL_RULE_1998,
        )
        session.add(version)
        await session.flush()

    raw = TXT_1998.read_bytes()
    parsed = parse_pdf_act_text(raw.decode("utf-8"))
    provenance = {
        "source": "leganet.cd",
        "kind": "pdf-extraction",
        "file": "aupsrve-1998-leganet.pdf",
        "sha256": _sha256((RAW / "aupsrve-1998-leganet.pdf").read_bytes()),
        "extraction": "pypdf; spacing artifacts possible",
        "authority_crosscheck": "pending (J.O. OHADA n° 6, 1998 / ohada.com PDF)",
    }
    existing = {
        a.number: a
        for a in (
            await session.execute(
                select(LegalArticle).where(LegalArticle.act_version_id == version.id)
            )
        ).scalars()
    }
    created = 0
    for pa in parsed:
        if pa.number in existing:
            continue
        session.add(
            LegalArticle(
                act_version_id=version.id,
                number=pa.number,
                sort_key=article_sort_key(pa.number),
                text=pa.text,
                structure={"alineas": pa.alineas},
                provenance=provenance,
            )
        )
        created += 1
    log.info("corpus.load.act_1998", parsed=len(parsed), created=created)


async def load_decisions(session: AsyncSession) -> None:
    seed_by_number = {d.number: d for d in SEED_DECISIONS}
    created = skipped = 0
    for path in sorted(DECISIONS_DIR.glob("*.html")):
        raw = path.read_bytes()
        parsed = parse_juricaf_decision_html(raw.decode("utf-8", errors="replace"))
        if parsed.number is None or parsed.decided_on is None:
            log.warning("corpus.load.decision_unparsed", file=path.name)
            continue
        existing = (
            await session.execute(
                select(CourtDecision).where(
                    CourtDecision.urn_lex == parsed.urn_lex,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            skipped += 1
            continue
        seed = seed_by_number.get(parsed.number)
        session.add(
            CourtDecision(
                court="CCJA",
                number=parsed.number,
                decided_on=date.fromisoformat(parsed.decided_on),
                chamber=seed.chamber if seed else None,
                urn_lex=parsed.urn_lex,
                ohadata_code=seed.ohadata_code if seed else None,
                source_url=(
                    "https://juricaf.org/arret/" + path.stem.replace("juricaf-", "")
                ),
                keyword_header=parsed.keyword_header,
                summary=seed.note if seed else None,
                full_text=parsed.full_text,
                provenance={
                    "source": "juricaf.org",
                    "file": path.name,
                    "sha256": _sha256(raw),
                },
            )
        )
        created += 1
    log.info("corpus.load.decisions", created=created, already_present=skipped)


async def seed_links(session: AsyncSession) -> None:
    """Create proposed decision→article edges for the 1998 slice articles.

    No-op until the 1998 act version and its articles are loaded.
    """
    version_1998 = (
        await session.execute(
            select(LegalActVersion).where(LegalActVersion.label == "1998")
        )
    ).scalar_one_or_none()
    if version_1998 is None:
        log.info("corpus.load.links_skipped", reason="1998 act not loaded yet")
        return

    articles = {
        a.number: a
        for a in (
            await session.execute(
                select(LegalArticle).where(
                    LegalArticle.act_version_id == version_1998.id
                )
            )
        ).scalars()
    }
    created = 0
    for seed in SEED_DECISIONS:
        decision = (
            await session.execute(
                select(CourtDecision).where(CourtDecision.number == seed.number)
            )
        ).scalar_one_or_none()
        if decision is None:
            continue
        for number in seed.articles_1998:
            article = articles.get(number)
            if article is None:
                log.warning(
                    "corpus.load.link_missing_article",
                    decision=seed.number,
                    article=number,
                )
                continue
            existing = (
                await session.execute(
                    select(DecisionArticleLink).where(
                        DecisionArticleLink.decision_id == decision.id,
                        DecisionArticleLink.article_id == article.id,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                session.add(
                    DecisionArticleLink(
                        decision_id=decision.id,
                        article_id=article.id,
                        status=DecisionLinkStatus.proposed,
                        seed_source="acquisition_sheet",
                        note=seed.note or None,
                    )
                )
                created += 1
    log.info("corpus.load.links", created=created)


async def main() -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        await load_act_2023(session)
        await load_act_1998(session)
        await load_decisions(session)
        await seed_links(session)
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
