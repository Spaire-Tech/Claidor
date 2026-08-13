"""Does this connector actually work against a real Microsoft tenant?

Everything in `polar/connector/` was written to Microsoft's published API
and exercised against a fake — `tests/connector/` replays the documented
shapes over a mock transport, and `scripts/graph_stub.py` serves them over
HTTP. Neither of those can be wrong in the way that matters, because both
were written by the same person who wrote the client.

So the first connection against a real tenant will find something. This is
what finds it *legibly*: it makes every call the connector makes, one at a
time, in the order they depend on each other, and says which one failed
and what to do about it. The alternative is a 502 on a screen and an
afternoon.

    uv run python -m scripts.connector_doctor            # everything
    uv run python -m scripts.connector_doctor --email you@firm.com

Run it *after* connecting through the SharePoint screen — it reads the
stored connection rather than doing the browser half. With no `--email` it
takes the most recently connected account.

Nothing here writes. It reads, and it prints.
"""

import asyncio
import sys
from typing import Any

from sqlalchemy import select

from polar.config import settings
from polar.connector.graph import FOLDERS, GraphError, configured
from polar.connector.service import ConnectorError, connector
from polar.kit.db.postgres import create_async_sessionmaker
from polar.models import Connection, ConnectionStatus
from polar.postgres import create_async_engine

OK = "  ok  "
BAD = " fail "


def line(state: str, what: str, detail: str = "") -> None:
    print(f"[{state}] {what}" + (f"\n         {detail}" if detail else ""))


async def main() -> int:
    #: Counted from the first line, not from the Graph section. A script
    #: that reported « everything answered » under a failure it had just
    #: printed would be the one thing this product is not allowed to be.
    failures = 0
    email = None
    if "--email" in sys.argv:
        email = sys.argv[sys.argv.index("--email") + 1]

    # --- the configuration ------------------------------------------------

    print("\nConfiguration\n")
    if not configured():
        line(
            BAD,
            "No Microsoft application on this server.",
            "Set CLAIDOR_MICROSOFT_CLIENT_ID and CLAIDOR_MICROSOFT_CLIENT_SECRET "
            "in server/.env. Note the CLAIDOR_ prefix.",
        )
        return 1
    line(OK, f"Application {settings.MICROSOFT_CLIENT_ID}")
    line(OK, f"Tenant {settings.MICROSOFT_TENANT}")

    redirect = f"{settings.BASE_URL}/v1/connector/microsoft/callback"
    line(OK, "Redirect URI, which must be registered exactly as it reads here:")
    print(f"         {redirect}")
    if redirect.startswith("http://") and "localhost" not in redirect:
        failures += 1
        line(
            BAD,
            "Entra allows plain http only for localhost.",
            "Set CLAIDOR_BASE_URL to http://localhost:8000, or put the server "
            "behind https (./dev/setup-environment --backend-external-url ...).",
        )

    # --- the connection ---------------------------------------------------

    print("\nConnection\n")
    engine = create_async_engine("script")
    async with create_async_sessionmaker(engine)() as session:
        statement = (
            select(Connection)
            .where(Connection.deleted_at.is_(None))
            .order_by(Connection.created_at.desc())
        )
        if email:
            statement = statement.where(Connection.account_email == email)
        connection = (await session.execute(statement)).scalars().first()

        if connection is None:
            line(
                BAD,
                "Nobody has connected an account.",
                "Open the SharePoint screen and press « Connect Microsoft ». "
                "The browser half of OAuth cannot happen here.",
            )
            return 1
        line(OK, f"{connection.account_name} <{connection.account_email}>")
        if connection.status is not ConnectionStatus.active:
            line(
                BAD,
                f"The connection is {connection.status.value}.",
                connection.error or "Connect it again from the SharePoint screen.",
            )
            return 1
        line(
            OK,
            f"Scopes granted: {' '.join(connection.scopes or []) or '(none recorded)'}",
        )

        try:
            graph = await connector.client_for(session, connection=connection)
        except ConnectorError as problem:
            line(BAD, "The token could not be renewed.", str(problem))
            return 1
        line(OK, "Token is good")

        # --- the six calls -------------------------------------------------

        print("\nGraph\n")

        async def call(what: str, run: Any, hint: str) -> Any:
            nonlocal failures
            try:
                answer = await run()
            except GraphError as problem:
                failures += 1
                line(BAD, what, f"{problem}\n         {hint}")
                return None
            except Exception as problem:
                # An unexpected shape rather than a refusal — which is
                # exactly the class of thing a fake cannot produce, and
                # the reason this script exists.
                failures += 1
                line(
                    BAD,
                    what,
                    f"{type(problem).__name__}: {problem}\n         "
                    "Graph answered with a shape this client did not expect. "
                    "The payload is the bug report — see polar/connector/graph.py.",
                )
                return None
            return answer

        who = await call(
            "/me",
            graph.me,
            "User.Read is missing, or consent was never granted.",
        )
        if who:
            line(OK, f"/me — {who['name']} <{who['email']}>")

        drives = await call(
            "/me/drive and /me/followedSites",
            graph.drives,
            "Files.Read.All and Sites.Read.All are the two this needs. "
            "An empty list is not a failure: it means this account follows "
            "no sites, and following the deal room in SharePoint fixes it.",
        )
        if drives is not None:
            line(
                OK, f"{len(drives)} document librar{'y' if len(drives) == 1 else 'ies'}"
            )
            for one in drives[:8]:
                print(f"         {one.owner or '—'} · {one.name}")
            if not drives:
                line(
                    BAD,
                    "No libraries reachable.",
                    "Open the deal's SharePoint site once in a browser so it "
                    "lands in « followed sites », then run this again.",
                )
                failures += 1

        if drives:
            first = drives[0]
            items = await call(
                f"children of {first.name}",
                lambda: graph.children(first.id),
                "The drive listed but would not open. Usually a permission "
                "scoped to the site rather than the tenant.",
            )
            if items is not None:
                line(
                    OK,
                    f"{len(items)} item{'' if len(items) == 1 else 's'} "
                    f"in {first.name}",
                )
                readable = [one for one in items if not one.folder]
                if not readable:
                    # A library whose root is all folders is the ordinary
                    # arrangement, and downloading is the call most worth
                    # making — it is the only one that leaves Graph for
                    # storage and comes back.
                    for folder in [one for one in items if one.folder][:3]:
                        inside = await call(
                            f"children of {folder.name}",
                            lambda folder=folder: graph.children(  # type: ignore[misc]
                                folder.drive_id, folder.id
                            ),
                            "The folder listed but would not open.",
                        )
                        readable = [one for one in (inside or []) if not one.folder]
                        if readable:
                            break
                if readable:
                    got = await call(
                        f"download {readable[0].name}",
                        lambda: graph.download(readable[0].drive_id, readable[0].id),
                        "Listing worked and fetching did not — check that the "
                        "download redirect to storage is reachable from here.",
                    )
                    if got is not None:
                        line(OK, f"downloaded {len(got):,} bytes")
                else:
                    line(OK, "no files at this level to try downloading")

        for folder in ("inbox", "drafts"):
            messages = await call(
                f"mail/{folder}",
                lambda folder=folder: graph.messages(folder, top=5),  # type: ignore[misc]
                "Mail.Read is missing, or this account has no mailbox — a "
                "service account often does not.",
            )
            if messages is not None:
                line(OK, f"{FOLDERS[folder]}: {len(messages)} messages")
                if messages:
                    one = await call(
                        "one message with its body",
                        lambda: graph.message(messages[0].id),  # type: ignore[index]
                        "The list worked and fetching one did not.",
                    )
                    if one is not None:
                        line(
                            OK,
                            f"read « {one.subject} » — {len(one.body):,} bytes of "
                            f"{one.body_type}",
                        )

        print()
        if failures:
            print(
                f"{failures} call{'s' if failures > 1 else ''} failed. "
                "Each line above says what to do about it.\n"
            )
            return 1
        print("Everything this connector does, Microsoft answered.\n")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
