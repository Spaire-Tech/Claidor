"""The middleman, today: Pipedream Connect.

`docs/maties/connectors.md`, section 3. Everything Pipedream-shaped in
Claidor is in this file and stops at this file — the routes above it see
only `polar.connectors.provider`.

**The one thing to understand before changing anything here.** The
developer access token this module mints is *project-wide*. Whoever
holds it, with our project id, can name any external user id in a header
and reach that person's connected accounts. It is not a per-person
credential; it is the key to every customer we have. So it lives on the
server, in Redis and in memory, and never in a response body, a log line
or an exception message. `_access_token` is the only function that
returns it and three callers use it.

What was read from Pipedream's documentation on 11 September 2026 and is
therefore known rather than assumed:

- `POST /v1/oauth/token` with `grant_type=client_credentials`;
- `POST /v1/connect/{project_id}/tokens` with `external_user_id`,
  answering `token`, `expires_at` and `connect_link_url`, the token
  single-use and good for four hours;
- the Connect Link is that `connect_link_url` with an `app` parameter
  added to its query string;
- `GET /v1/connect/{project_id}/accounts`, filtered by
  `external_user_id`, answering `{"data": [...], "page_info": {...}}`,
  each row carrying `id`, `created_at` and a nested `app.name_slug`;
- `DELETE /v1/connect/{project_id}/accounts/{account_id}`, answering 204;
- every call carrying `x-pd-environment`;
- the MCP server at `https://remote.mcp.pipedream.net/v3`, routed
  entirely by headers.

What could not be confirmed is marked `UNCONFIRMED` where it is used.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, Protocol
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx

from .provider import (
    Connection,
    ConnectorLink,
    ConnectorNotFound,
    ConnectorsNotConfigured,
    ConnectorUpstreamError,
    McpTarget,
)

if TYPE_CHECKING:
    from polar.models import User


API_BASE_URL = "https://api.pipedream.com/v1"
MCP_BASE_URL = "https://remote.mcp.pipedream.net/v3"

#: UNCONFIRMED. Pipedream's REST reference describes the
#: client-credentials exchange and says an access token lasts an hour,
#: but never prints the response body, so these two names are RFC 6749's
#: and not a quotation. If the exchange ever starts failing because the
#: token came back empty, this is the first place to look.
ACCESS_TOKEN_FIELD = "access_token"
EXPIRES_IN_FIELD = "expires_in"
#: Used when the exchange answers without `expires_in` at all. Their docs
#: say an hour; this is deliberately shorter, because minting a token we
#: did not need costs nothing and using a dead one costs a request.
TOKEN_LIFETIME_FALLBACK = timedelta(minutes=45)
#: How long before expiry the cached token is dropped, so a call never
#: starts with a token that dies halfway through it.
TOKEN_EXPIRY_SKEW = timedelta(minutes=2)

#: A person has a handful of accounts, not thousands, so the page loop is
#: a guard against a cursor that never ends rather than real paging.
ACCOUNTS_PAGE_SIZE = 100
ACCOUNTS_PAGE_LIMIT = 5

#: The provider is not on Claidor's network and a sign-in window is not
#: waiting on these; short enough that a route cannot hang on them.
REQUEST_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class TokenStore(Protocol):
    """The little of Redis this needs, written out so the provider can be
    built and tested without one. Neither method is declared `async`:
    redis-py's own are not, and they return something awaitable."""

    def get(self, name: str) -> Any: ...

    def set(self, name: str, value: str, *, ex: int) -> Any: ...


@dataclass(frozen=True)
class PipedreamCredentials:
    """What a Pipedream project is reached with. `client_secret` is never
    printed: the repr below is the only one this class has, so a settings
    dump or a stack trace cannot leak it."""

    client_id: str
    client_secret: str
    project_id: str
    environment: str = "development"

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.project_id)

    def __repr__(self) -> str:
        return (
            f"PipedreamCredentials(project_id={self.project_id!r}, "
            f"environment={self.environment!r}, secret=<redacted>)"
        )


def with_query(url: str, params: dict[str, str]) -> str:
    """`url` with `params` merged into its query string.

    The Connect Link comes back already carrying `token` and
    `connectLink`, so the app slug has to be merged in rather than
    appended with a `?` that would produce two of them.
    """
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update(params)
    return urlunparse(parsed._replace(query=urlencode(query)))


def parse_moment(value: Any) -> datetime | None:
    """An ISO 8601 instant from the provider, or None if it is not one.

    A missing or malformed timestamp is a cosmetic loss — the card shows
    no date — and never a reason to fail a request the person made.
    """
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        moment = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


class PipedreamProvider:
    """`ConnectorProvider` over Pipedream Connect."""

    def __init__(
        self,
        credentials: PipedreamCredentials,
        token_store: TokenStore,
        *,
        api_base_url: str = API_BASE_URL,
        mcp_base_url: str = MCP_BASE_URL,
        client_factory: Callable[[], httpx.AsyncClient] | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self._credentials = credentials
        self._token_store = token_store
        self._api_base_url = api_base_url.rstrip("/")
        self._mcp_base_url = mcp_base_url.rstrip("/")
        self._client_factory = client_factory or self._default_client
        self._now = now or (lambda: datetime.now(UTC))

    # --- the four answers ---------------------------------------------------

    async def link(self, user: User, slug: str) -> ConnectorLink:
        """A one-use address the person signs in at.

        The identity we give Pipedream is the person's Claidor user id:
        it already exists, it is stable, and it is not a secret
        (`docs/maties/connectors.md`, section 4). It is created here and
        nowhere else, which is what makes a Pipedream person cost money
        only once somebody actually clicks Connect (section 7).
        """
        payload = await self._request(
            "POST",
            f"/connect/{self._credentials.project_id}/tokens",
            json_body={"external_user_id": self._external_user_id(user)},
        )
        connect_link_url = payload.get("connect_link_url")
        if not isinstance(connect_link_url, str) or not connect_link_url:
            # Without a URL there is nothing to open, and `token` alone
            # would mean building their page's address ourselves.
            raise ConnectorUpstreamError(
                "The connection service answered without a sign-in address."
            )
        expires_at = parse_moment(payload.get("expires_at"))
        return ConnectorLink(
            url=with_query(connect_link_url, {"app": slug}),
            # Their token lives four hours; if they stopped saying so, a
            # link the app believes is good for ever is worse than one it
            # re-mints, so an unreadable answer expires now.
            expires_at=expires_at or self._now(),
        )

    async def connections(self, user: User) -> list[Connection]:
        """Everything this person has connected, asked of Pipedream.

        They hold the accounts and we keep no copy, because a mirror
        drifts and then lies about what is connected (section 4). The
        sixty-second cache above this lives in `polar.connectors.service`.
        """
        external_user_id = self._external_user_id(user)
        found: list[Connection] = []
        after: str | None = None
        for _ in range(ACCOUNTS_PAGE_LIMIT):
            params: dict[str, str] = {
                "external_user_id": external_user_id,
                "limit": str(ACCOUNTS_PAGE_SIZE),
            }
            if after is not None:
                params["after"] = after
            payload = await self._request(
                "GET",
                f"/connect/{self._credentials.project_id}/accounts",
                params=params,
            )
            rows = payload.get("data")
            if not isinstance(rows, list) or not rows:
                break
            for row in rows:
                connection = self._connection(row)
                if connection is not None:
                    found.append(connection)
                # `include_credentials` is never asked for, so the
                # credentials themselves never reach this process at all.
            page_info = payload.get("page_info")
            after = page_info.get("end_cursor") if isinstance(page_info, dict) else None
            if (
                not isinstance(after, str)
                or not after
                or len(rows) < ACCOUNTS_PAGE_SIZE
            ):
                break
        return found

    async def disconnect(self, user: User, account_id: str) -> None:
        """One account, removed.

        Their delete is addressed by account id alone and the id says
        nothing about whose it is, so a person who sent somebody else's
        id would be deleting a stranger's connection with our
        project-wide token. The list this person owns is therefore read
        first and an id that is not in it never reaches Pipedream.
        """
        owned = await self.connections(user)
        if not any(connection.account_id == account_id for connection in owned):
            raise ConnectorNotFound("This connection does not exist.")
        await self._request(
            "DELETE",
            f"/connect/{self._credentials.project_id}/accounts/{account_id}",
            expect_json=False,
        )

    async def mcp_target(self, user: User, slug: str) -> McpTarget:
        """Where the engine's MCP conversation for one service goes.

        Pipedream's MCP server is one address for every app and every
        person: who is speaking and about what is decided entirely by
        these headers. That is exactly why they are built here, from the
        authenticated person, and why the proxy applies them last.
        """
        return McpTarget(
            url=self._mcp_base_url,
            headers={
                "Authorization": f"Bearer {await self._access_token()}",
                "x-pd-project-id": self._credentials.project_id,
                "x-pd-environment": self._credentials.environment,
                "x-pd-external-user-id": self._external_user_id(user),
                "x-pd-app-slug": slug,
            },
        )

    # --- the credential -----------------------------------------------------

    async def _access_token(self) -> str:
        """The project-wide developer token, kept in Redis until shortly
        before it expires.

        Cached rather than minted per request for two reasons: their
        exchange is a network round trip in front of every call the
        person is waiting on, and a token minted per MCP message would be
        thousands a day for one person's afternoon.
        """
        if not self._credentials.configured:
            raise ConnectorsNotConfigured("Connections are not configured.")

        key = f"polar:connectors:pipedream:token:{self._credentials.client_id}"
        cached = await self._token_store.get(key)
        if cached:
            # Claidor's Redis decodes responses, but a store that does not
            # would hand back bytes and `str()` would quietly turn a token
            # into the four characters `b'...`.
            return cached.decode() if isinstance(cached, bytes) else str(cached)

        async with self._client_factory() as client:
            try:
                response = await client.post(
                    f"{self._api_base_url}/oauth/token",
                    json={
                        "grant_type": "client_credentials",
                        "client_id": self._credentials.client_id,
                        "client_secret": self._credentials.client_secret,
                    },
                    headers={"content-type": "application/json"},
                )
            except httpx.HTTPError as error:
                raise ConnectorUpstreamError(
                    "The connection service could not be reached."
                ) from error

        if response.status_code >= 400:
            # Their body is never quoted here: this is the one exchange
            # that carries the client secret, and a refusal that echoed
            # the request would put it in a log.
            raise ConnectorUpstreamError(
                "The connection service refused Claidor's credentials.",
                status=response.status_code,
            )
        try:
            payload = response.json()
        except ValueError as error:
            raise ConnectorUpstreamError(
                "The connection service answered with something that is not JSON."
            ) from error
        token = payload.get(ACCESS_TOKEN_FIELD) if isinstance(payload, dict) else None
        if not isinstance(token, str) or not token:
            raise ConnectorUpstreamError(
                "The connection service answered without an access token."
            )

        await self._token_store.set(key, token, ex=self._token_ttl(payload))
        return token

    def _token_ttl(self, payload: dict[str, Any]) -> int:
        lifetime = payload.get(EXPIRES_IN_FIELD)
        seconds = (
            float(lifetime)
            if isinstance(lifetime, int | float) and lifetime > 0
            else TOKEN_LIFETIME_FALLBACK.total_seconds()
        )
        # One second is the floor a cache can hold; a provider answering
        # with a lifetime shorter than the skew must not cache for ever.
        return max(1, int(seconds - TOKEN_EXPIRY_SKEW.total_seconds()))

    # --- the plumbing -------------------------------------------------------

    def _default_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=REQUEST_TIMEOUT)

    def _external_user_id(self, user: User) -> str:
        return str(user.id)

    def _connection(self, row: Any) -> Connection | None:
        """One row of their accounts list, or None when it is not one we
        can name: a connection with no app slug is nothing the app can
        draw a card for."""
        if not isinstance(row, dict):
            return None
        account_id = row.get("id")
        app = row.get("app")
        slug = app.get("name_slug") if isinstance(app, dict) else None
        if not isinstance(account_id, str) or not isinstance(slug, str):
            return None
        if not account_id or not slug:
            return None
        return Connection(
            slug=slug,
            account_id=account_id,
            connected_at=parse_moment(row.get("created_at")),
        )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
        expect_json: bool = True,
    ) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {await self._access_token()}",
            "x-pd-environment": self._credentials.environment,
            "accept": "application/json",
        }
        async with self._client_factory() as client:
            try:
                response = await client.request(
                    method,
                    f"{self._api_base_url}{path}",
                    params=params,
                    json=json_body,
                    headers=headers,
                )
            except httpx.HTTPError as error:
                raise ConnectorUpstreamError(
                    "The connection service could not be reached."
                ) from error

        if response.status_code >= 400:
            raise ConnectorUpstreamError(
                _refusal(response), status=response.status_code
            )
        if not expect_json:
            return {}
        try:
            payload = response.json()
        except ValueError as error:
            raise ConnectorUpstreamError(
                "The connection service answered with something that is not JSON."
            ) from error
        if not isinstance(payload, dict):
            raise ConnectorUpstreamError(
                "The connection service answered with an unexpected shape."
            )
        return payload


def _refusal(response: httpx.Response) -> str:
    """Their reason, if they gave a readable one. Bounded, because an
    upstream message ends up in our own logs and a page of HTML from a
    proxy in front of them is not a reason."""
    try:
        payload = response.json()
    except ValueError:
        return f"The connection service refused the request ({response.status_code})."
    if isinstance(payload, dict):
        for key in ("error", "message", "error_description"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:300]
    return (
        f"The connection service refused the request ({response.status_code}): "
        f"{json.dumps(payload)[:300]}"
    )


__all__ = [
    "ACCESS_TOKEN_FIELD",
    "ACCOUNTS_PAGE_LIMIT",
    "ACCOUNTS_PAGE_SIZE",
    "API_BASE_URL",
    "EXPIRES_IN_FIELD",
    "MCP_BASE_URL",
    "REQUEST_TIMEOUT",
    "TOKEN_EXPIRY_SKEW",
    "TOKEN_LIFETIME_FALLBACK",
    "PipedreamCredentials",
    "PipedreamProvider",
    "TokenStore",
    "parse_moment",
    "with_query",
]
