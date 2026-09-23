"""What one desktop account spent through the model proxy, read-only.

Prints, for the account named by email:

- totals per model: calls, input tokens, cached input, output tokens,
  credits, and the dollars those credits stand for;
- a timeline in ten-minute buckets (UTC), so a runaway loop shows as a
  wall of calls;
- the busiest single hour.

Nothing is written.

    python -m scripts.desktop_usage_report someone@example.com
    python -m scripts.desktop_usage_report someone@example.com --hours 48

Run it where the server runs, so it reads the same ``CLAIDOR_POSTGRES_*``
environment as the API.
"""

import asyncio
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from polar.desktop.pricing import CREDIT_USD_PER_MILLION_INPUT
from polar.kit.db.postgres import AsyncSession, create_async_sessionmaker
from polar.models import DesktopUsage, User
from polar.postgres import create_async_engine

BUCKET = timedelta(minutes=10)


async def find_user(session: AsyncSession, email: str) -> User | None:
    statement = select(User).where(func.lower(User.email) == email.lower())
    return (await session.execute(statement)).unique().scalar_one_or_none()


def dollars(credits: int) -> float:
    """The proxy's own accounting: one credit is one input token on the
    middle model, priced at CREDIT_USD_PER_MILLION_INPUT per million."""
    return credits * CREDIT_USD_PER_MILLION_INPUT / 1_000_000


async def run(email: str, hours: int) -> int:
    engine = create_async_engine("script")
    try:
        sessionmaker = create_async_sessionmaker(engine)
        async with sessionmaker() as session:
            user = await find_user(session, email)
            if user is None:
                print(f"No user with the email {email!r}.")
                return 1
            since = datetime.now(UTC) - timedelta(hours=hours)
            statement = (
                select(DesktopUsage)
                .where(
                    DesktopUsage.user_id == user.id, DesktopUsage.created_at >= since
                )
                .order_by(DesktopUsage.created_at)
            )
            rows = list((await session.execute(statement)).scalars())
    finally:
        await engine.dispose()

    print(f"User {user.email} ({user.id}), last {hours} hours, {len(rows)} calls")
    if not rows:
        return 0

    per_model: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0, 0])
    per_status: Counter[int] = Counter()
    buckets: Counter[datetime] = Counter()
    hours_seen: Counter[datetime] = Counter()
    for row in rows:
        totals = per_model[row.model]
        totals[0] += 1
        totals[1] += row.input_tokens
        totals[2] += row.cache_read_tokens
        totals[3] += row.output_tokens
        totals[4] += row.credits
        per_status[row.upstream_status] += 1
        created = row.created_at.astimezone(UTC)
        floored = created.replace(
            minute=(created.minute // 10) * 10, second=0, microsecond=0
        )
        buckets[floored] += 1
        hours_seen[created.replace(minute=0, second=0, microsecond=0)] += 1

    print()
    print(
        f"{'model':24} {'calls':>6} {'input':>12} {'cached':>12} "
        f"{'output':>10} {'credits':>12} {'dollars':>9}"
    )
    grand = 0.0
    for model_id, (calls, inputs, cached, outputs, credits) in sorted(
        per_model.items()
    ):
        cost = dollars(credits)
        grand += cost
        print(
            f"{model_id:24} {calls:6} {inputs:12,} {cached:12,} "
            f"{outputs:10,} {credits:12,} {cost:9.2f}"
        )
    print(f"{"total dollars, by the proxy's own credits":64} {grand:9.2f}")
    print()
    print("upstream status codes:", dict(sorted(per_status.items())))
    print()
    print("calls per ten minutes (UTC):")
    for when in sorted(buckets):
        count = buckets[when]
        print(f"  {when:%Y-%m-%d %H:%M}  {count:4}  {'#' * min(count, 60)}")
    busiest, count = max(hours_seen.items(), key=lambda item: item[1])
    print()
    print(f"busiest hour: {busiest:%Y-%m-%d %H:00} UTC with {count} calls")
    return 0


def main(argv: list[str]) -> int:
    hours = 24
    arguments: list[str] = []
    index = 0
    while index < len(argv):
        argument = argv[index]
        if argument == "--hours" and index + 1 < len(argv):
            hours = int(argv[index + 1])
            index += 2
            continue
        if argument.startswith("--"):
            print(__doc__, file=sys.stderr)
            return 2
        arguments.append(argument)
        index += 1
    if len(arguments) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    return asyncio.run(run(arguments[0], hours))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
