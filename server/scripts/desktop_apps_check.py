"""Check one account's apps (Gmail, LinkedIn and the rest served through
`simeon/desktop/apps.py`) end to end, against the live provider.

For every app the account has a sign-in for, it prints when that sign-in was
made and its status, then makes one read-only call through the very path the
agent's tool calls take (`apps._handle`, a `tools/call`) and prints what came
back: for Gmail the address, for LinkedIn the name. So it answers both "was it
connected already?" (a sign-in older than the account's reset) and "does it
really work?".

    python -m scripts.desktop_apps_check someone@example.com
    python -m scripts.desktop_apps_check someone@example.com --disconnect gmail

`--disconnect <app>` removes that app's sign-ins for the account, so the next
Add on its card asks to sign in again. Nothing else is changed.

Run it where the server runs (the API service's shell on Render), so it reads
the provider's key and the database like the API does.
"""

import asyncio
import re
import sys
from typing import Any

from simeon.desktop import apps
from simeon.desktop.composio import composio_user_id, configured
from simeon.kit.db.postgres import create_async_sessionmaker
from simeon.models import User
from simeon.postgres import create_async_engine

from .desktop_reset_account import find_user

#: The read-only call that names the account, per app.
PROBES = {
    "gmail": "GMAIL_GET_PROFILE",
    "linkedin": "LINKEDIN_GET_MY_INFO",
}
#: For an app without a known probe: a tool that reads who is signed in.
PROBE_PATTERN = re.compile(
    r"_(GET_(MY_)?PROFILE|GET_MY_INFO|GET_CURRENT_USER|GET_USER_INFO|WHOAMI|GET_ME|GET_AUTHENTICATED_USER)$"
)


async def sign_ins(user: User) -> list[dict[str, Any]]:
    """Every sign-in the provider holds for this account, any app, any status."""
    status, payload = await apps._call(
        "GET",
        "api/v3.1/connected_accounts",
        params={"user_ids": [composio_user_id(user)], "limit": 100},
    )
    if status >= 400 or not isinstance(payload, dict):
        raise apps.AppsUpstreamError(apps._upstream_message(payload), status)
    rows: list[dict[str, Any]] = []
    for item in payload.get("items") or []:
        if not isinstance(item, dict):
            continue
        toolkit = item.get("toolkit")
        slug = toolkit.get("slug") if isinstance(toolkit, dict) else None
        rows.append(
            {
                "app": str(slug or "?"),
                "id": str(item.get("id", "")),
                "status": str(item.get("status", "")),
                "created_at": str(item.get("created_at", "")),
            }
        )
    return rows


async def probe_tool(toolkit: str) -> str | None:
    known = PROBES.get(toolkit)
    names = [tool["name"] for tool in await apps.toolkit_tools(toolkit)]
    if known is not None and known in names:
        return known
    return next((name for name in names if PROBE_PATTERN.search(name)), None)


async def probe(user: User, toolkit: str) -> str:
    """One read-only call through the agent's own path; what it answered."""
    tool = await probe_tool(toolkit)
    if tool is None:
        return "no read-only 'who am I' tool found for this app; not called"
    answer = await apps._handle(
        user,
        toolkit,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool, "arguments": {}},
        },
    )
    if not isinstance(answer, dict):
        status = getattr(answer, "status_code", "?")
        return f"{tool}: refused with HTTP {status} (not connected)"
    if "error" in answer:
        return f"{tool}: FAILED: {answer['error'].get('message')}"
    result = answer.get("result") or {}
    text = " ".join(
        str(part.get("text", "")) for part in result.get("content") or []
    ).strip()
    verdict = "FAILED" if result.get("isError") else "works"
    return f"{tool}: {verdict}: {text[:400]}"


async def disconnect(user: User, toolkit: str) -> int:
    removed = 0
    for account in await apps.active_account_ids(user, toolkit):
        status, _ = await apps._call("DELETE", f"api/v3.1/connected_accounts/{account}")
        if status < 400:
            removed += 1
    apps._accounts_cache.pop((composio_user_id(user), toolkit), None)
    return removed


async def check(user: User) -> list[str]:
    lines: list[str] = []
    rows = await sign_ins(user)
    if not rows:
        lines.append(
            "No app sign-ins on file for this account: every Add will ask to sign in."
        )
        return lines
    for row in sorted(rows, key=lambda row: (row["app"], row["created_at"])):
        lines.append(
            f"{row['app']:16} {row['status']:12} signed in {row['created_at'] or '?'}  ({row['id']})"
        )
    for toolkit in sorted(
        {row["app"] for row in rows if row["status"].upper() == "ACTIVE"}
    ):
        try:
            lines.append(f"  {toolkit}: {await probe(user, toolkit)}")
        except Exception as error:  # one app failing must not hide the others
            lines.append(f"  {toolkit}: FAILED: {type(error).__name__}: {error}")
    return lines


async def run(email: str, disconnect_toolkit: str | None) -> int:
    if not configured():
        print(apps.NOT_CONFIGURED)
        return 1
    engine = create_async_engine("script")
    try:
        sessionmaker = create_async_sessionmaker(engine)
        async with sessionmaker() as session:
            user = await find_user(session, email)
            if user is None:
                print(f"No user with the email {email!r}.")
                return 1
            print(
                f"User {user.email} ({user.id}), known to the provider as {composio_user_id(user)}"
            )
            if disconnect_toolkit is not None:
                removed = await disconnect(user, disconnect_toolkit)
                print(
                    f"Removed {removed} {disconnect_toolkit} sign-in(s). The next Add asks to sign in."
                )
            for line in await check(user):
                print(line)
            return 0
    finally:
        await engine.dispose()


def main(argv: list[str]) -> int:
    arguments = list(argv)
    disconnect_toolkit: str | None = None
    if "--disconnect" in arguments:
        at = arguments.index("--disconnect")
        if at + 1 >= len(arguments) or not apps.valid_toolkit(arguments[at + 1]):
            print(__doc__, file=sys.stderr)
            return 2
        disconnect_toolkit = arguments[at + 1]
        del arguments[at : at + 2]
    if len(arguments) != 1 or arguments[0].startswith("--"):
        print(__doc__, file=sys.stderr)
        return 2
    return asyncio.run(run(arguments[0], disconnect_toolkit))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
