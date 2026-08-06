"""Load acquired corpus sources into the database (idempotent).

Usage: ``uv run python -m scripts.corpus_load``

Driven by ``scripts.corpus_registry``:
- every registered act + its temporal versions + articles (Laws.Africa AKN
  HTML under ``corpus/raw/acts/``), plus the 1998 AUPSRVE PDF extraction;
- harvested CCJA decision pages (Juricaf HTML under ``corpus/raw/decisions/``);
- the citation graph: seeded slice edges are confirmed against decision
  text, and new edges are discovered from the text itself — an edge exists
  only when the decision literally cites the article with act-identifying
  context, targeting the version in force at the decision date.

Running the script again after new acquisitions picks up whatever is new.
"""

import asyncio
import hashlib
import re
from datetime import date
from pathlib import Path

import structlog
from sqlalchemy import select

from polar.corpus.akn import article_sort_key, parse_lawsafrica_act_html
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
from scripts.corpus_registry import REGISTRY, ActSpec, version_for_date
from scripts.corpus_slice_seed import SEED_DECISIONS

log = structlog.get_logger()

RAW = Path(__file__).parent.parent.parent / "corpus" / "raw"
ACTS_DIR = RAW / "acts"
DECISIONS_DIR = RAW / "decisions"
TXT_1998 = RAW / "aupsrve-1998-leganet-extracted.txt"
PDF_1998 = RAW / "aupsrve-1998-leganet.pdf"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _decision_number_key(number: str) -> str:
    """Zero-padding-insensitive decision number: "035/2010" ≡ "35/2010".

    Juricaf lists some decisions under both spellings; they are the same
    decision and must not enter the corpus twice.
    """
    m = re.match(r"^0*(\d+)\s*/\s*(\d{4})$", number.strip())
    if m is None:
        return number.strip()
    return f"{int(m.group(1))}/{m.group(2)}"


async def _upsert_act(session: AsyncSession, spec: ActSpec) -> LegalAct:
    act = (
        await session.execute(
            select(LegalAct).where(LegalAct.akn_work_uri == spec.akn_work_uri)
        )
    ).scalar_one_or_none()
    if act is None:
        act = LegalAct(
            akn_work_uri=spec.akn_work_uri,
            short_code=spec.short_code,
            title=spec.title,
        )
        session.add(act)
        await session.flush()
    return act


async def load_acts(session: AsyncSession) -> None:
    """Upsert every registered act, version and (AKN-sourced) article set."""
    for spec in REGISTRY:
        act = await _upsert_act(session, spec)
        for vspec in spec.versions:
            version = (
                await session.execute(
                    select(LegalActVersion).where(
                        LegalActVersion.act_id == act.id,
                        LegalActVersion.label == vspec.label,
                    )
                )
            ).scalar_one_or_none()
            if version is None:
                version = LegalActVersion(
                    act_id=act.id,
                    akn_expression_uri=vspec.akn_expression_uri,
                    label=vspec.label,
                    adopted_on=vspec.adopted_on,
                    published_on=vspec.published_on,
                    gazette_reference=vspec.gazette_reference,
                    in_force_from=vspec.in_force_from,
                    transitional_rule=vspec.transitional_rule,
                )
                session.add(version)
                await session.flush()

            if vspec.file is None:
                continue  # non-AKN source; dedicated loader below
            path = ACTS_DIR / vspec.file
            if not path.exists():
                log.warning(
                    "corpus.load.act_file_missing",
                    act=spec.short_code,
                    version=vspec.label,
                    file=vspec.file,
                )
                continue

            raw = path.read_bytes()
            parsed = parse_lawsafrica_act_html(raw.decode("utf-8"))
            provenance = {
                "source": "senlii.org",
                "kind": "akoma-ntoso-html",
                "file": vspec.file,
                "sha256": _sha256(raw),
                "license": "CC BY 4.0 / no copyright in legislative content",
                "authority_crosscheck": (
                    f"pending ({vspec.gazette_reference or 'J.O. OHADA'})"
                ),
            }
            existing = {
                a.number: a
                for a in (
                    await session.execute(
                        select(LegalArticle).where(
                            LegalArticle.act_version_id == version.id
                        )
                    )
                ).scalars()
            }
            created = updated = 0
            seen: set[str] = set()
            for pa in parsed.articles:
                if pa.number in seen:
                    # Source anomaly (one known dupe in the 1997 AUDCG
                    # rendering): first occurrence wins, never silently
                    # overwrite it.
                    log.warning(
                        "corpus.load.duplicate_article",
                        act=spec.short_code,
                        version=vspec.label,
                        number=pa.number,
                    )
                    continue
                seen.add(pa.number)
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
                "corpus.load.act",
                act=spec.short_code,
                version=vspec.label,
                parsed=len(parsed.articles),
                created=created,
                updated=updated,
            )


async def load_act_1998_articles(session: AsyncSession) -> None:
    """The 1998 AUPSRVE text — PDF extraction, no AKN source available."""
    version = (
        await session.execute(
            select(LegalActVersion)
            .join(LegalAct)
            .where(LegalAct.short_code == "AUPSRVE", LegalActVersion.label == "1998")
        )
    ).scalar_one()

    raw = TXT_1998.read_bytes()
    parsed = parse_pdf_act_text(raw.decode("utf-8"))
    provenance = {
        "source": "leganet.cd",
        "kind": "pdf-extraction",
        "file": PDF_1998.name,
        "sha256": _sha256(PDF_1998.read_bytes()),
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
    # CCJA chambers number decisions independently (two 010/2009 exist), so
    # seed identity is number + date.
    seed_by_key = {(d.number, d.decided_on): d for d in SEED_DECISIONS}
    existing_urns = {
        urn
        for (urn,) in (await session.execute(select(CourtDecision.urn_lex))).tuples()
        if urn is not None
    }
    existing_keys = {
        (_decision_number_key(number), decided_on)
        for number, decided_on in (
            await session.execute(
                select(CourtDecision.number, CourtDecision.decided_on).where(
                    CourtDecision.court == "CCJA"
                )
            )
        ).tuples()
    }
    created = skipped = unparsed = duplicates = 0
    for path in sorted(DECISIONS_DIR.glob("*.html")):
        raw = path.read_bytes()
        parsed = parse_juricaf_decision_html(raw.decode("utf-8", errors="replace"))
        if parsed.number is None or parsed.decided_on is None:
            unparsed += 1
            log.warning("corpus.load.decision_unparsed", file=path.name)
            continue
        if parsed.urn_lex in existing_urns:
            skipped += 1
            continue
        key = (_decision_number_key(parsed.number), date.fromisoformat(parsed.decided_on))
        if key in existing_keys:
            # Juricaf occasionally lists the same decision under two slugs
            # (e.g. an avis and its duplicate entry). First file wins.
            duplicates += 1
            log.warning(
                "corpus.load.decision_duplicate",
                file=path.name,
                number=parsed.number,
                decided_on=parsed.decided_on,
            )
            continue
        existing_keys.add(key)
        seed = seed_by_key.get((parsed.number, parsed.decided_on))
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
        if parsed.urn_lex is not None:
            existing_urns.add(parsed.urn_lex)
        created += 1
    log.info(
        "corpus.load.decisions",
        created=created,
        already_present=skipped,
        unparsed=unparsed,
        duplicates=duplicates,
    )


async def seed_links(session: AsyncSession) -> None:
    """Create proposed decision→article edges for the 1998 slice articles.

    No-op until the 1998 act version and its articles are loaded.
    """
    version_1998 = (
        await session.execute(
            select(LegalActVersion)
            .join(LegalAct)
            .where(LegalAct.short_code == "AUPSRVE", LegalActVersion.label == "1998")
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
                select(CourtDecision).where(
                    CourtDecision.number == seed.number,
                    CourtDecision.decided_on == date.fromisoformat(seed.decided_on),
                )
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


ARTICLE_CITE = re.compile(r"(?i)\bart(?:icles?|\.)\s[^.;]{0,120}?\b(\d+(?:-\d+)?)\b")
_CITE_WINDOW = 240


def _cites_loose(text: str, number: str) -> bool:
    return (
        re.search(
            rf"(?i)\bart(?:icles?|\.)\s[^.;]{{0,120}}?\b{re.escape(number)}\b", text
        )
        is not None
    )


async def auto_verify_links(session: AsyncSession) -> None:
    """Machine verification of the citation graph against decision text.

    - Existing proposed edges: verified when the decision text cites the
      article; otherwise they stay proposed with a note — and never surface.
    - New edges: for every "article N" mention whose surrounding passage
      (±240 chars) names a registered act, an edge is created directly as
      verified — targeting the version of THAT act in force at the decision
      date. A mention with no recognizable act context ("article 1289 du
      code civil") creates nothing; a decision predating every loaded
      version of the named act creates nothing (honest gap until prior
      versions are acquired).
    """
    # In-memory corpus index: per act, compiled context pattern and, per
    # version, the article map. ~3,700 articles — comfortably in memory.
    act_index: list[
        tuple[ActSpec, re.Pattern[str], dict[str, dict[str, LegalArticle]]]
    ] = []
    articles_by_id: dict[object, LegalArticle] = {}
    for spec in REGISTRY:
        act = (
            await session.execute(
                select(LegalAct).where(LegalAct.akn_work_uri == spec.akn_work_uri)
            )
        ).scalar_one_or_none()
        if act is None:
            continue
        by_version: dict[str, dict[str, LegalArticle]] = {}
        versions = (
            (
                await session.execute(
                    select(LegalActVersion).where(LegalActVersion.act_id == act.id)
                )
            )
            .scalars()
            .all()
        )
        for version in versions:
            articles = {
                a.number: a
                for a in (
                    await session.execute(
                        select(LegalArticle).where(
                            LegalArticle.act_version_id == version.id
                        )
                    )
                ).scalars()
            }
            if articles:
                by_version[version.label] = articles
                articles_by_id.update({a.id: a for a in articles.values()})
        act_index.append((spec, re.compile(spec.context_pattern, re.I), by_version))

    decisions = (await session.execute(select(CourtDecision))).scalars().all()
    confirmed = unconfirmed = discovered = 0
    for decision in decisions:
        text = decision.full_text or ""
        links = (
            (
                await session.execute(
                    select(DecisionArticleLink).where(
                        DecisionArticleLink.decision_id == decision.id
                    )
                )
            )
            .scalars()
            .all()
        )
        linked_article_ids = {link.article_id for link in links}
        for link in links:
            if link.status != DecisionLinkStatus.proposed:
                continue
            article = articles_by_id.get(link.article_id)
            if article is None:
                continue
            if _cites_loose(text, article.number):
                link.status = DecisionLinkStatus.verified
                link.note = (
                    (link.note or "")
                    + " [auto-vérifié : article cité dans le texte de la décision]"
                ).strip()
                session.add(link)
                confirmed += 1
            else:
                link.note = (
                    (link.note or "")
                    + " [non confirmé : article introuvable dans le texte — à revoir]"
                ).strip()
                session.add(link)
                unconfirmed += 1

        # Discover edges directly from the decision text.
        for m in ARTICLE_CITE.finditer(text):
            window = text[max(0, m.start() - _CITE_WINDOW) : m.end() + _CITE_WINDOW]
            number = m.group(1)
            for spec, context, by_version in act_index:
                if not context.search(window):
                    continue
                vspec = version_for_date(spec, decision.decided_on)
                if vspec is None:
                    continue
                version_articles = by_version.get(vspec.label)
                if version_articles is None:
                    continue
                article = version_articles.get(number)
                if article is None or article.id in linked_article_ids:
                    continue
                linked_article_ids.add(article.id)
                session.add(
                    DecisionArticleLink(
                        decision_id=decision.id,
                        article_id=article.id,
                        status=DecisionLinkStatus.verified,
                        seed_source="decision_text",
                        note=(
                            "[auto-vérifié : article cité dans le texte de la décision]"
                        ),
                    )
                )
                discovered += 1
    log.info(
        "corpus.load.auto_verify",
        confirmed=confirmed,
        unconfirmed=unconfirmed,
        discovered=discovered,
    )


async def main() -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        await load_acts(session)
        await load_act_1998_articles(session)
        await load_decisions(session)
        await seed_links(session)
        await auto_verify_links(session)
        await session.commit()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
