"""Fetch opinion text for a doctrine's candidates. Resumable.

CourtListener allows this account 10/min, 75/hour, 300/day, so a full
doctrine takes a few sittings. The run stops cleanly when an allowance is
exhausted and picks up where it left off next time — the queue is
"candidates with no text yet", so there is no cursor to keep and nothing
to corrupt by running it twice.

    uv run python scripts/registry_fetch.py tx-express-negligence [limit]
"""

import asyncio
import sys

from polar.config import settings
from polar.kit.db.postgres import create_async_engine, create_async_sessionmaker
from polar.registry.fetch import fetch_texts


async def main() -> None:
    doctrine = sys.argv[1] if len(sys.argv) > 1 else "tx-express-negligence"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None

    engine = create_async_engine(
        dsn=settings.get_postgres_dsn("asyncpg"),
        application_name="registry_fetch",
        pool_size=2,
        pool_recycle=3600,
    )
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        report = await fetch_texts(
            session,
            doctrine,
            token=settings.COURTLISTENER_API_TOKEN,
            limit=limit,
        )
        await session.commit()
    print(report.summary())
    for failure in report.failures[:20]:
        print("  failure:", failure)
    await engine.dispose()


asyncio.run(main())
