"""Reset one desktop account, so the app onboards it from the start again.

Keeps the user itself and deletes everything Simeon holds for it:

- ``desktop_sessions``    every signed-in app (tokens stop working at once)
- ``desktop_auth_codes``  sign-ins in flight
- ``desktop_usage``       the metered calls behind the usage page
- ``desktop_memory_files`` the synced memory
- ``maty_jobs``           queued or finished cloud jobs
- ``sand_automations``    the routines the server fires (their fires go too)
- ``sand_boxes``          the cloud computer: its container and its two
  volumes are removed on its server first, so Simeon, the agents and their
  files go with it, and the next sign-in makes a new one

Before deleting, it prints what the account spent (the usage rows are part
of what goes), so a "before" for a cost comparison is not lost unseen.

What it does **not** touch: the ``users`` row, organizations, connections
made through Composio (they reappear when an app is connected again), and
the Mac. On the Mac, after this:

    pkill -x Simeon; rm -rf ~/.simeon ~/Library/Application\\ Support/Simeon; open /Applications/Simeon.app

Dry run by default. Nothing is deleted without ``--yes``.

    python -m scripts.desktop_reset_account someone@example.com
    python -m scripts.desktop_reset_account someone@example.com --yes

Run it where the server runs (the API service's shell on Render), so it
reads the same ``POSTGRES_*`` environment and box-server settings as the API.
"""

import asyncio
import sys
from collections.abc import Awaitable, Callable

from sqlalchemy import delete, func, select

from simeon.desktop.pricing import CREDIT_USD_PER_MILLION_INPUT
from simeon.kit.db.postgres import AsyncSession, create_async_sessionmaker
from simeon.models import (
    DesktopAuthCode,
    DesktopMemoryFile,
    DesktopSession,
    DesktopUsage,
    MatyJob,
    SandAutomation,
    SandBox,
    User,
)
from simeon.postgres import create_async_engine
from simeon.sand.box_hosts import BoxHostError, find_box_host
from simeon.sand.box_service import BoxBrokerService

TABLES = (
    ("desktop_usage", DesktopUsage),
    ("desktop_auth_codes", DesktopAuthCode),
    ("sand_automations", SandAutomation),
    ("sand_boxes", SandBox),
    ("desktop_sessions", DesktopSession),
    ("maty_jobs", MatyJob),
    ("desktop_memory_files", DesktopMemoryFile),
)

#: How a box's container and volumes are removed on its server; a seam for
#: the tests, which have no box server.
RemoveBox = Callable[[SandBox], Awaitable[None]]


async def remove_box_on_its_server(box: SandBox) -> None:
    host = await find_box_host(box.provider) if box.provider else None
    if host is None:
        if box.provider_box_id:
            raise BoxHostError(
                f"The computer's server {box.provider!r} is not configured here, "
                "so its container cannot be removed."
            )
        return
    await host.remove(
        box.provider_box_id or f"simeon-box-{box.id.hex}",
        volumes=list(BoxBrokerService.volumes(box.id)),
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


async def spent_dollars(session: AsyncSession, user: User) -> float:
    statement = select(func.coalesce(func.sum(DesktopUsage.credits), 0)).where(
        DesktopUsage.user_id == user.id
    )
    credits = int((await session.execute(statement)).scalar_one())
    return credits * CREDIT_USD_PER_MILLION_INPUT / 1_000_000


async def reset(
    session: AsyncSession,
    user: User,
    *,
    confirmed: bool,
    remove_box: RemoveBox = remove_box_on_its_server,
) -> dict[str, int] | None:
    """Prints what the account holds and, when confirmed, deletes it.
    Returns what was deleted, or None for a dry run or a refusal."""
    counts = await count_rows(session, user)
    for name, count in counts.items():
        print(f"  {name:22} {count}")
    print(
        f"  spent so far, by the proxy's credits: ${await spent_dollars(session, user):.2f}"
    )
    if sum(counts.values()) == 0:
        print("Nothing to delete: the account is already clean on the server.")
        return None
    if not confirmed:
        print("Dry run. Re-run with --yes to delete all of this.")
        return None

    boxes = list(
        (await session.execute(select(SandBox).where(SandBox.user_id == user.id)))
        .unique()
        .scalars()
        .all()
    )
    for box in boxes:
        try:
            await remove_box(box)
        except BoxHostError as error:
            # Nothing is deleted: a row gone while its container lives on
            # would leave a computer nobody can reach or remove.
            print(f"Stopped, nothing deleted: {error}")
            return None
        print(f"Removed the cloud computer simeon-box-{box.id.hex} and its files.")

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
            deleted = await reset(session, user, confirmed=confirmed)
            if deleted is None:
                return 0
            await session.commit()
            print("Deleted:")
            for name, count in deleted.items():
                print(f"  {name:22} {count}")
            print(
                "Done on the server. Now on the Mac: pkill -x Simeon; "
                "rm -rf ~/.simeon ~/Library/Application\\ Support/Simeon; "
                "open /Applications/Simeon.app"
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
