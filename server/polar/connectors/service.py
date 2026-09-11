"""The connections, on Claidor's side.

`docs/maties/connectors.md`, sections 4 and 5. Three things live here and
nothing else does: who is allowed to use connections, which middleman is
behind the door today, and the sixty-second cache that keeps opening the
app from being forty network calls.

There is deliberately **no table**. Pipedream holds the accounts and we
keep no copy of them, because a mirror drifts and then lies about what is
connected. Redis holds an answer for a minute; that is a cache, and a
cache that is wrong for a minute is a different thing from a record that
is wrong for ever.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import UUID

from polar.config import settings
from polar.desktop.service import desktop
from polar.models import User
from polar.postgres import AsyncSession
from polar.redis import Redis

from .pipedream import PipedreamCredentials, PipedreamProvider
from .provider import Connection, ConnectorProvider

#: The plans that include connections. Empty on purpose: step 9 of
#: `docs/maties/plan.md` is what creates a plan that is not « Free », and
#: until it lands `quota()` answers « Free » for everybody, so consulting
#: it would be a database aggregate in front of every request whose answer
#: is known. The allowlist below is the only yes today. When the plans
#: exist, this set names them and `entitled` needs no other change.
ENTITLED_PLANS: frozenset[str] = frozenset()

#: How long one person's list of connections is held. Long enough that
#: opening the app is one call rather than forty, short enough that a
#: connection made in another window shows up while the person is still
#: looking at the shelf.
CONNECTIONS_CACHE_TTL_SECONDS = 60


def _cache_key(user_id: UUID) -> str:
    # 👋 Bump the version when the cached shape changes.
    return f"polar:connectors:v1:{user_id}"


def _moment(value: Any) -> datetime | None:
    """A timestamp out of the cache. A date we cannot read costs the card
    its « connected on » line and nothing more, so it is never fatal."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


class ConnectorsService:
    # --- the gate -----------------------------------------------------------

    async def entitled(self, session: AsyncSession, user: User) -> bool:
        """Whether this person may use connections at all.

        The decision is made here and only here, so that a patched app
        gains nothing: every one of the four routes asks this question
        before it does any work. The reason it exists is money — the
        middleman bills per person per month, so a free signup who
        connects one thing costs us every month for ever
        (`docs/maties/connectors.md`, section 5).
        """
        if user.id in settings.CONNECTORS_ENTITLED_USER_IDS:
            return True
        if not ENTITLED_PLANS:
            return False
        quota = await desktop.quota(session, user)
        return str(quota.get("planName", "")) in ENTITLED_PLANS

    # --- the middleman ------------------------------------------------------

    @property
    def configured(self) -> bool:
        return self._credentials().configured

    def provider(self, redis: Redis) -> ConnectorProvider:
        """Today's middleman. The one place in Claidor that names one.

        A second provider — our own sign-ins, or somebody else's — is a
        new class implementing `ConnectorProvider` and a branch here.
        Nothing above this line moves, which is the whole point of
        section 6 and not a thing to open for convenience.
        """
        return PipedreamProvider(self._credentials(), redis)

    def _credentials(self) -> PipedreamCredentials:
        return PipedreamCredentials(
            client_id=settings.PIPEDREAM_CLIENT_ID,
            client_secret=settings.PIPEDREAM_CLIENT_SECRET,
            project_id=settings.PIPEDREAM_PROJECT_ID,
            environment=settings.PIPEDREAM_ENVIRONMENT,
        )

    # --- what is connected --------------------------------------------------

    async def connections(
        self, redis: Redis, provider: ConnectorProvider, user: User
    ) -> list[Connection]:
        """This person's connections, from Redis when it has them."""
        cached = await redis.get(_cache_key(user.id))
        if cached is not None:
            restored = self._decode(cached)
            if restored is not None:
                return restored

        found = await provider.connections(user)
        await redis.set(
            _cache_key(user.id),
            self._encode(found),
            ex=CONNECTIONS_CACHE_TTL_SECONDS,
        )
        return found

    async def invalidate(self, redis: Redis, user: User) -> None:
        """Forget what we last heard about this person.

        Called when a link is minted and when a connection is removed.
        A disconnect is ours to see; a *successful* sign-in is not — it
        happens in a browser window that never reports back to us — so
        the mint stands in for it, which is right because minting a link
        is the only thing that can create a connection in the first
        place.
        """
        await redis.delete(_cache_key(user.id))

    def _encode(self, connections: list[Connection]) -> str:
        return json.dumps(
            [
                {
                    "slug": connection.slug,
                    "account_id": connection.account_id,
                    "connected_at": (
                        connection.connected_at.isoformat()
                        if connection.connected_at is not None
                        else None
                    ),
                }
                for connection in connections
            ]
        )

    def _decode(self, raw: Any) -> list[Connection] | None:
        """A cached answer, or None when it cannot be read.

        Unreadable means « ask the provider », never « this person has
        nothing »: a cache that fails closed would show an empty shelf to
        somebody who has connected eight services.
        """
        try:
            rows = json.loads(raw)
        except (TypeError, ValueError):
            return None
        if not isinstance(rows, list):
            return None
        restored: list[Connection] = []
        for row in rows:
            if not isinstance(row, dict):
                return None
            slug, account_id = row.get("slug"), row.get("account_id")
            if not isinstance(slug, str) or not isinstance(account_id, str):
                return None
            restored.append(
                Connection(
                    slug=slug,
                    account_id=account_id,
                    connected_at=_moment(row.get("connected_at")),
                )
            )
        return restored


connectors = ConnectorsService()

__all__ = [
    "CONNECTIONS_CACHE_TTL_SECONDS",
    "ENTITLED_PLANS",
    "ConnectorsService",
    "connectors",
]
