"""Screen a doctrine's candidates: on point, or a passing mention?

Resumable and idempotent — the queue is pending candidates, so a run that
stops halfway simply finds less to do next time.

    uv run task registry_screen tx-express-negligence [limit]
"""

import asyncio
import sys

from polar.config import settings
from polar.kit.db.postgres import create_async_engine, create_async_sessionmaker
from polar.registry.screen import screen_doctrine


async def main() -> None:
    doctrine = sys.argv[1] if len(sys.argv) > 1 else "tx-express-negligence"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None

    engine = create_async_engine(
        dsn=settings.get_postgres_dsn("asyncpg"),
        application_name="registry_screen",
        pool_size=2,
        pool_recycle=3600,
    )
    sessionmaker = create_async_sessionmaker(engine)
    async with sessionmaker() as session:
        report = await screen_doctrine(session, doctrine, limit=limit)
        await session.commit()
    print(report.summary())
    for failure in report.failures[:10]:
        print("  failure:", failure)
    await engine.dispose()


asyncio.run(main())
