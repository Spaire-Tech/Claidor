"""Mint a browser session against the local database, and print the cookie.

Development only, and it exists for one reason: **every screen that shows
real data needs a signed-in session, and without one they cannot be looked
at.** Building an interface you have never seen against live data is how a
list ships sorted the wrong way round, and a screenshot of an error page is
not a check.

Signing in properly means an email round trip, which is not available here.
This does the same thing the sign-in route does — writes a `UserSession`
row and hands back the plaintext token — with no email in the middle.

    uv run python -m scripts.dev_session

It prints the cookie to set. Drive a browser with it, or:

    curl -s http://127.0.0.1:8000/v1/tieout/deals \\
      -H "Cookie: claidor_session=<token>"

Refuses to run outside development, because a script that mints a session
for an arbitrary user is exactly what it looks like.
"""

import asyncio

from sqlalchemy import select

from polar.auth.scope import Scope
from polar.auth.service import USER_SESSION_TOKEN_PREFIX
from polar.config import Environment, settings
from polar.kit.crypto import generate_token_hash_pair
from polar.kit.db.postgres import create_async_sessionmaker
from polar.kit.utils import utc_now
from polar.models import User, UserSession
from polar.postgres import create_async_engine


async def mint() -> None:
    if settings.ENV not in (Environment.development, Environment.testing):
        print(f"refusing to run in {settings.ENV}")
        return

    engine = create_async_engine("script")
    sessionmaker = create_async_sessionmaker(engine)

    async with sessionmaker() as session:
        user = (
            (await session.execute(select(User).order_by(User.created_at).limit(1)))
            .scalars()
            .unique()
            .first()
        )
        if user is None:
            print("no user in this database — seed one first")
            await engine.dispose()
            return

        token, token_hash = generate_token_hash_pair(
            secret=settings.SECRET, prefix=USER_SESSION_TOKEN_PREFIX
        )
        session.add(
            UserSession(
                token=token_hash,
                user_agent="dev_session.py",
                user=user,
                # The two reserved scopes a browser session carries, and
                # the only two it can: no token may hold or request them.
                scopes=[Scope.web_read, Scope.web_write],
                expires_at=utc_now() + settings.USER_SESSION_TTL,
            )
        )
        await session.commit()

        print(f"user   {user.email}")
        print(f"cookie {settings.USER_SESSION_COOKIE_KEY}={token}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(mint())
