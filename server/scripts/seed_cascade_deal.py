"""Put the real Cascade files into a real deal, so the screens have truth.

Promised in the UI work order: *« a seeded deal with the real Cascade files
in it, so the screens have true findings and not lorem ipsum. This will be
there before the deal page is. »*

It is also the end-to-end test of the spine. Everything the product does
happens here in order — a file is ingested into rows, a check reads only
those rows, links are proposed, findings are written, a coverage line
falls out — and if any of it is wrong the numbers below stop matching what
the offline scripts produce from the same files.

    uv run python -m scripts.seed_cascade_deal [--broken]

Run as a module, not as a path: `scripts/platform.py` shadows the standard
library's `platform` when the script's own directory leads `sys.path`, and
SQLAlchemy imports it.

`--broken` seeds the broken deck as a second version of the same lineage,
which is the realistic case: not a new deal, a new upload of the deck that
is already in one.
"""

import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import (
    ArtifactKind,
    Dossier,
    DossierMember,
    DossierRole,
    Organization,
    User,
)
from polar.postgres import create_async_engine
from polar.tieout.repository import TieOutRepository
from polar.tieout.service import tieout

CASCADE = Path(__file__).resolve().parent / "cascade"
DEAL_NAME = "Project Cascade"


async def seed(broken: bool) -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)

    async with sessionmaker() as session:
        # `.unique()` because these models eager-load collections, so one
        # entity arrives as several rows.
        user = (
            (await session.execute(select(User).order_by(User.created_at).limit(1)))
            .scalars()
            .unique()
            .first()
        )
        organization = (
            (
                await session.execute(
                    select(Organization).order_by(Organization.created_at).limit(1)
                )
            )
            .scalars()
            .unique()
            .first()
        )
        if user is None or organization is None:
            print("no user or organization in this database — sign up once first")
            return

        deal = (
            (
                await session.execute(
                    select(Dossier).where(
                        Dossier.name == DEAL_NAME, Dossier.deleted_at.is_(None)
                    )
                )
            )
            .scalars()
            .unique()
            .first()
        )
        if deal is None:
            deal = Dossier(
                organization_id=organization.id,
                name=DEAL_NAME,
                client_name="Cascade Industrial Holdings",
                created_by_id=user.id,
            )
            session.add(deal)
            await session.flush()
            session.add(
                DossierMember(
                    dossier_id=deal.id, user_id=user.id, role=DossierRole.lead
                )
            )
            await session.flush()
            print(f"created deal {deal.id}")
        else:
            print(f"reusing deal {deal.id}")

        uploads = [
            ("cascade_model.xlsx", ArtifactKind.model),
            ("cascade_deck.pptx", ArtifactKind.deck),
        ]
        if broken:
            # Same filename on purpose: a new *version* of the deck already
            # in the deal, which is what a banker actually does.
            uploads = [("cascade_deck.pptx", ArtifactKind.deck)]

        for filename, kind in uploads:
            source = CASCADE / (
                "cascade_deck_broken.pptx"
                if broken and kind is ArtifactKind.deck
                else filename
            )
            artifact = await tieout.ingest(
                session,
                dossier_id=deal.id,
                kind=kind,
                filename=filename,
                payload=source.read_bytes(),
                user_id=user.id,
            )
            print(
                f"  {filename:<24} v{artifact.version}  {artifact.status.value:<10} "
                f"{artifact.counts or artifact.error}"
            )

        tie = await tieout.run_tieout(session, dossier_id=deal.id, user_id=user.id)
        audit = await tieout.run_audit(session, dossier_id=deal.id, user_id=user.id)
        await session.commit()

        repository = TieOutRepository.from_session(session)
        findings = await repository.findings_of(deal.id)
        links = await repository.links_of(deal.id)

        print()
        print(f"tie-out : {tie.status.value}  {tie.summary or tie.error}")
        print(f"audit   : {audit.status.value}  {audit.summary or audit.error}")
        print(f"links   : {len(links)} proposed")
        print(f"findings: {len(findings)}")
        for finding in findings[:14]:
            print(
                f"    {finding.kind.value:<10} {finding.severity.value:<6} "
                f"p{finding.page:<3} {finding.printed:>9} → {finding.expected:<9} "
                f"{finding.location[:44]}"
            )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed("--broken" in sys.argv))
