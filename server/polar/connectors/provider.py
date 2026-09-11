"""The door the connections work is built behind.

`docs/maties/connectors.md`, section 6. The founder's word was « for
now », so the middleman sits behind an interface of our own and nothing
outside this package — not the routes, not the desktop app, not the
engine's config — learns which middleman it is. Replacing them is one
new class and a setting.

That is why there is not a single vendor word in the names below. The
things that would quietly reopen the door are an app slug shape, a
header name or an account id format leaking outwards, so the four
answers are deliberately small: a URL to open, a list of what is
connected, nothing at all, and an address the MCP conversation is
proxied to. Everything else stays on the far side.

This module imports nothing from the rest of Claidor at runtime, so the
implementations behind it stay testable on their own.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from polar.models import User


@dataclass(frozen=True)
class ConnectorLink:
    """Where to send the person so they can sign in to one service, and
    when that address stops working. The app opens it in a window and
    waits for the window to close; nothing comes back to us through it."""

    url: str
    expires_at: datetime


@dataclass(frozen=True)
class Connection:
    """One service this person has connected.

    `account_id` is an opaque string as far as everything above this
    module is concerned: it is handed back on a disconnect and is never
    parsed, compared or built anywhere else.
    """

    slug: str
    account_id: str
    connected_at: datetime | None = None


@dataclass(frozen=True)
class McpTarget:
    """Where one person's MCP conversation for one service is forwarded,
    and what to send with it.

    `headers` carries a credential, so this object never prints itself:
    a stack trace or a debug log that dumped it would put a project-wide
    key in a file, which is the one thing section 4 exists to prevent.
    """

    url: str
    headers: Mapping[str, str] = field(default_factory=dict)

    def __repr__(self) -> str:
        return f"McpTarget(url={self.url!r}, headers=<redacted>)"


class ConnectorProvider(Protocol):
    """Whoever holds the sign-in plumbing, today and after the swap."""

    async def link(self, user: User, slug: str) -> ConnectorLink: ...

    async def connections(self, user: User) -> list[Connection]: ...

    async def disconnect(self, user: User, account_id: str) -> None: ...

    async def mcp_target(self, user: User, slug: str) -> McpTarget: ...


class ConnectorError(Exception):
    """Anything the provider could not do. Plain exceptions rather than
    `PolarError`s, so this side of the door stays free of the web
    framework; `polar.connectors.endpoints` turns them into statuses."""


class ConnectorsNotConfigured(ConnectorError):
    """No credentials for the provider. A deployment without them must
    say so plainly and identically on every route, never half-work."""


class ConnectorNotFound(ConnectorError):
    """An account id that is not this person's. It is raised rather than
    ignored because the only way to reach one is to have gone looking."""


class ConnectorUpstreamError(ConnectorError):
    """The provider answered with something we cannot use. `status` is
    theirs, and is kept only so the route can tell « they refused us »
    from « they are down »."""

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


__all__ = [
    "Connection",
    "ConnectorError",
    "ConnectorLink",
    "ConnectorNotFound",
    "ConnectorProvider",
    "ConnectorUpstreamError",
    "ConnectorsNotConfigured",
    "McpTarget",
]
