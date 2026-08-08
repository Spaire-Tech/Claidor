"""Scan every active veille and record what has appeared since last time.

Usage: ``uv run python -m scripts.veille_scan``

Meant to run on a schedule. Idempotent by construction: a signal is
emitted once per (veille, source), so an overlapping run, a retry, or a
corpus reload cannot flood the feed. Email delivery is a separate step —
this only makes the record.
"""

import asyncio

import structlog
from sqlalchemy import select

from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import Veille
from polar.postgres import create_async_engine
from polar.veille.service import veille_service

log = structlog.get_logger()


async def main() -> None:
    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        veilles = (
            (
                await session.execute(
                    select(Veille).where(
                        Veille.active.is_(True), Veille.deleted_at.is_(None)
                    )
                )
            )
            .scalars()
            .all()
        )
        signals = await veille_service.scan(session, list(veilles))
        await session.commit()
        log.info("veille.scan.done", watched=len(veilles), signals=len(signals))
        for signal in signals[:20]:
            log.info("veille.signal", text=signal.text)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
