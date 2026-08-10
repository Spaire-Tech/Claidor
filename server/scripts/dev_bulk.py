"""Fill a deal to the size a live one reaches, so the screens can be seen at it.

Development only. The design was drawn at seven findings and nine files;
a real deal is hundreds and thousands. A density pass that is only ever
looked at with the Cascade fixture in front of it is a density pass nobody
has tested — the whole point is the state the drawing never met.

    uv run python -m scripts.dev_bulk --findings 1200 --files 3000
    uv run python -m scripts.dev_bulk --clear

Everything it writes is marked `dev-bulk` in its fingerprint or filename,
so `--clear` can take it all out again and leave the real Cascade rows
untouched. Nothing here is realistic data and none of it should ever be
looked at as a finding: it exists to make a list long.
"""

import argparse
import asyncio
import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import (
    Artifact,
    ArtifactKind,
    ArtifactStatus,
    Dossier,
    Finding,
    FindingKind,
    FindingSeverity,
    User,
)
from polar.postgres import create_async_engine

MARK = "dev-bulk"
DEAL = "Project Cascade"

SHEETS = ["Model", "DCF", "Comps", "Assumptions", "Ops"]
NAMES = [
    "Revenue",
    "Adjusted EBITDA",
    "Reported EBITDA",
    "Gross margin",
    "Unlevered FCF",
    "Enterprise value",
    "Net debt",
    "Terminal value",
    "WACC",
    "Capex",
]
FOLDERS = [
    "01 Corporate",
    "02 Financial",
    "03 Commercial",
    "04 Legal",
    "05 Tax",
    "06 HR",
    "07 IT",
    "08 Property",
]
SUFFIXES = [".pdf", ".docx", ".xlsx", ".pptx"]


async def fill(findings: int, files: int, clear: bool) -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    # Deterministic, so two runs produce the same list and a screenshot
    # can be compared against the one before it.
    random.seed(20260810)

    async with sessionmaker() as session:
        deal = (
            (await session.execute(select(Dossier).where(Dossier.name == DEAL)))
            .scalars()
            .unique()
            .first()
        )
        if deal is None:
            print(f"no deal called {DEAL} — run scripts.seed_cascade_deal first")
            await engine.dispose()
            return

        if clear:
            await session.execute(
                delete(Finding).where(
                    Finding.dossier_id == deal.id, Finding.fingerprint.like(f"{MARK}%")
                )
            )
            await session.execute(
                delete(Artifact).where(
                    Artifact.dossier_id == deal.id, Artifact.filename.like(f"{MARK}%")
                )
            )
            await session.commit()
            print("cleared")
            await engine.dispose()
            return

        user = (
            (await session.execute(select(User).order_by(User.created_at).limit(1)))
            .scalars()
            .unique()
            .first()
        )
        assert user is not None

        for index in range(findings):
            # A realistic mix rather than a uniform one: most findings on a
            # live deal are notes and warnings, and a list that is 100 %
            # critical does not test whether the filter is worth having.
            roll = random.random()
            severity = FindingSeverity.error if roll < 0.35 else FindingSeverity.smell
            one_tick = roll > 0.72
            name = random.choice(NAMES)
            page = random.randint(1, 40)
            printed = f"{random.uniform(10, 900):.1f}"
            expected = f"{float(printed) + random.uniform(-4, 4):.1f}"
            session.add(
                Finding(
                    dossier_id=deal.id,
                    kind=FindingKind.drift,
                    severity=severity,
                    fingerprint=f"{MARK}-{index}",
                    one_tick=one_tick,
                    page=page,
                    printed=printed,
                    expected=expected,
                    title=f"{printed} where the model says {expected}",
                    detail=f"{name} on slide {page}, against {random.choice(SHEETS)}",
                    location=f"slide {page}, row « {name} »",
                    anchor={"kind": "text", "shape_id": index % 40 + 2},
                    evidence={
                        "name": name,
                        "source": f"{random.choice(SHEETS)}!{chr(66 + index % 20)}{index % 90 + 4}",
                        "confidence": round(random.uniform(0.5, 1.0), 3),
                    },
                )
            )

        when = datetime.now(UTC)
        for index in range(files):
            folder = FOLDERS[index % len(FOLDERS)]
            suffix = random.choice(SUFFIXES)
            session.add(
                Artifact(
                    dossier_id=deal.id,
                    kind=ArtifactKind.source,
                    filename=f"{MARK} {folder} · document {index + 1:04d}{suffix}",
                    uploaded_by_id=user.id,
                    lineage_id=__import__("uuid").uuid4(),
                    version=1,
                    status=ArtifactStatus.ready,
                    counts={},
                    created_at=when - timedelta(minutes=index),
                )
            )

        await session.commit()
        print(f"added {findings} findings and {files} files to {DEAL}")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--findings", type=int, default=1200)
    parser.add_argument("--files", type=int, default=3000)
    parser.add_argument("--clear", action="store_true")
    args = parser.parse_args()
    asyncio.run(fill(args.findings, args.files, args.clear))
