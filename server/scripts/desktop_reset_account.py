"""Reset one desktop account on the server, so the app onboards it again.

Deletes every desktop row the account owns and keeps the user itself:

- ``desktop_sessions``    every signed-in app (tokens stop working at once)
- ``desktop_auth_codes``  sign-ins in flight
- ``desktop_usage``       the metered calls behind the usage page
- ``desktop_memory_files`` the synced memory
- ``maty_jobs``           queued or finished cloud jobs

What it does **not** touch: the ``users`` row, organizations, the legal
product's ``connections`` (Microsoft Graph, not the desktop's), and anything
on the person's Mac. The app's own state (agents, transcripts, the
onboarding flag, the box) lives on the Mac and in the two Docker volumes,
not on this server; the reply that ships this script says how to clear
those.

Dry run by default. Nothing is deleted without ``--yes``.

    python -m scripts.desktop_reset_account someone@example.com
    python -m scripts.desktop_reset_account someone@example.com --yes

Run it where the server runs (the ``claidor-api`` shell on Render), so it
reads the same ``POSTGRES_*`` environment as the API.
"""

import asyncio
import sys

from sqlalchemy import delete, func, select

from polar.kit.db.postgres import AsyncSession, create_async_sessionmaker
from polar.models import (
    DesktopAuthCode,
    DesktopMemoryFile,
    DesktopSession,
    DesktopUsage,
    MatyJob,
    User,
)
from polar.postgres import create_async_engine

TABLES = (
    ("desktop_usage", DesktopUsage),
    ("desktop_auth_codes", DesktopAuthCode),
    ("desktop_sessions", DesktopSession),
    ("maty_jobs", MatyJob),
    ("desktop_memory_files", DesktopMemoryFile),
)


async def find_user(session: AsyncSession, email: str) -> User | None:
    statement = select(User).where(func.lower(User.email) == email.lower())
    return (await session.execute(statement)).unique().scalar_one_or_none()


async def count_rows(session: AsyncSession, user: User) -> dict[str, int]:
    counts: dict[str, int] = {}
    for name, model in TABLES:
        statement = (
            select(func.count()).select_from(model).where(model.user_id == user.id)
        )
        counts[name] = int((await session.execute(statement)).scalar_one())
    return counts


async def delete_rows(session: AsyncSession, user: User) -> dict[str, int]:
    deleted: dict[str, int] = {}
    for name, model in TABLES:
        result = await session.execute(delete(model).where(model.user_id == user.id))
        deleted[name] = int(getattr(result, "rowcount", 0) or 0)
    return deleted


async def run(email: str, confirmed: bool) -> int:
    engine = create_async_engine("script")
    try:
        sessionmaker = create_async_sessionmaker(engine)
        async with sessionmaker() as session:
            user = await find_user(session, email)
            if user is None:
                print(f"No user with the email {email!r}. Nothing to do.")
                return 1
            print(f"User {user.email} ({user.id})")
            counts = await count_rows(session, user)
            for name, count in counts.items():
                print(f"  {name:22} {count}")
            if sum(counts.values()) == 0:
                print("Nothing to delete: the account is already clean on the server.")
                return 0
            if not confirmed:
                print("Dry run. Re-run with --yes to delete these rows.")
                return 0
            deleted = await delete_rows(session, user)
            await session.commit()
            print("Deleted:")
            for name, count in deleted.items():
                print(f"  {name:22} {count}")
            print(
                "Done. Every signed-in app for this account is signed out. "
                "Clear the Mac next; the server keeps nothing else for it."
            )
            return 0
    finally:
        await engine.dispose()


def main(argv: list[str]) -> int:
    arguments = [argument for argument in argv if not argument.startswith("--")]
    flags = {argument for argument in argv if argument.startswith("--")}
    unknown = flags - {"--yes"}
    if len(arguments) != 1 or unknown:
        print(__doc__, file=sys.stderr)
        return 2
    return asyncio.run(run(arguments[0], "--yes" in flags))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
