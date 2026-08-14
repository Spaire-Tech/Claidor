"""Microsoft Graph, as much of it as a deal room needs.

Six calls: who is this, what sites and drives can they see, what is in a
folder, give me that file, what is in this mail folder, and give me that
message. Everything else Graph does is somebody else's problem.

**Delegated, never application-level.** The token is one person's and
everything read through it is read as them, so this connector can reach
exactly what they can already open and nothing else. The alternative —
application permissions over a whole tenant — needs an administrator's
consent before anybody can try the product at all, and it makes a bug in
this file able to read a company's entire SharePoint. The cost is that a
connection belongs to a person and stops working when they leave, which is
a state the screen has to carry rather than a problem to solve here.

**Written against `httpx` directly rather than the Graph SDK.** The SDK is
a large dependency, generated, and mostly a typed wrapper over four URLs.
What it would buy is retry and paging, both of which are here in twenty
lines and both of which are worth reading.

**Nothing here has ever run against a real tenant.** It is written to the
published API and exercised against a fake transport that replays Graph's
own documented shapes; that is honest about what a test can prove and it
is not the same as working. The first connection against a real tenant
will find something, and the shape of this module — one client, one place
each URL is built — is chosen so that whatever it finds is cheap to fix.
`scripts/graph_stub.py` is the other half of that: the same shapes served
over HTTP, so the screens above this can be looked at rather than assumed.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog

from polar.config import settings

log = structlog.get_logger()


def _graph() -> str:
    """Graph's base URL. See `MICROSOFT_GRAPH_BASE` — a sovereign cloud
    and the development stub are both « the same API, elsewhere »."""
    return settings.MICROSOFT_GRAPH_BASE.rstrip("/")


def _login() -> str:
    return settings.MICROSOFT_LOGIN_BASE.rstrip("/")


#: What the connector asks for, and why each one is needed.
#:
#: `Files.Read.All` reads the drives this person can see — a deal room is a
#: SharePoint document library, and a library is a drive. `Sites.Read.All`
#: is what lists the *sites* to choose from; without it a person has to
#: know a drive id. `offline_access` is the refresh token, without which
#: the connection dies an hour after it is made. `User.Read` is the name
#: to show on screen. `Mail.Read` is the drafts and the sent items, which
#: is where a figure goes out of the building.
#:
#: Read scopes only, and `Mail.Read` rather than `Mail.ReadWrite` on
#: purpose. This connector never writes to a customer's file store and
#: never touches their mailbox: a correction goes into the deal's own
#: copy, or into the draft through the add-in on the writer's own press.
#: Pushing a rewritten deck into a shared library, or editing somebody's
#: outgoing email from a server, are decisions nobody has asked for and
#: mistakes nobody could undo.
SCOPES = (
    "offline_access",
    "User.Read",
    "Files.Read.All",
    "Sites.Read.All",
    "Mail.Read",
)

#: The mail folders this product shows, in the design's order, mapped to
#: the well-known names Graph addresses them by. Well-known names rather
#: than ids because they are stable across mailboxes and localisations —
#: `Drafts` is `drafts` in a French tenant too.
FOLDERS: dict[str, str] = {
    "inbox": "inbox",
    "drafts": "drafts",
    "sent": "sentitems",
    "archive": "archive",
    "deleted": "deleteditems",
}

#: Graph asks for a retry after this many seconds when it throttles. Cap
#: it: a sync that sleeps for four minutes inside a request is a timeout
#: with extra steps.
MAX_BACKOFF = 8.0
ATTEMPTS = 3


class GraphError(Exception):
    """Graph refused, and the message is written to be shown to a person."""


class NotConfigured(GraphError):
    """No Microsoft application is configured on this server."""


def configured() -> bool:
    return bool(settings.MICROSOFT_CLIENT_ID and settings.MICROSOFT_CLIENT_SECRET)


def _require_configured() -> None:
    if not configured():
        raise NotConfigured(
            "Microsoft is not configured on this server, so SharePoint and "
            "OneDrive cannot be connected. Files dropped into the data room "
            "are read exactly as a connected one would be."
        )


@dataclass(frozen=True)
class Token:
    access_token: str
    refresh_token: str | None
    expires_at: datetime
    scopes: list[str]


@dataclass(frozen=True)
class Item:
    """One thing in a drive — a folder, or a file worth reading."""

    id: str
    name: str
    folder: bool
    size: int
    #: Changes when the *content* does, and not when somebody renames it.
    #: The whole basis of « has this moved on since we last read it ».
    ctag: str
    modified_at: str
    modified_by: str
    #: Where it sits, for a person. Never used to find it again.
    path: str
    drive_id: str


@dataclass(frozen=True)
class Message:
    """One email, as much of it as a check needs.

    `body` is empty in a listing and present when one message is fetched.
    Graph will return every body in a collection if asked, and a folder of
    two hundred messages with their HTML in it is megabytes of markup to
    render a list of subjects — so the list carries the preview Graph
    already computes, and the body arrives when somebody opens one.
    """

    id: str
    #: Changes when the message does. A draft being edited is the whole
    #: reason this is here: it is what says « this is not the version we
    #: checked ».
    change_key: str
    subject: str
    from_name: str
    from_email: str
    to: tuple[str, ...]
    received_at: str
    preview: str
    is_draft: bool
    is_read: bool
    has_attachments: bool
    body: str = ""
    #: `html` or `text`. The reader needs to know which it is holding.
    body_type: str = "html"


@dataclass(frozen=True)
class Drive:
    id: str
    name: str
    #: The site or account the drive belongs to, for a screen that has to
    #: tell « Documents » from « Documents ».
    owner: str


def authorize_url(state: str, redirect_uri: str) -> str:
    """Where to send somebody to grant access."""
    _require_configured()
    from urllib.parse import urlencode

    query = urlencode(
        {
            "client_id": settings.MICROSOFT_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "response_mode": "query",
            "scope": " ".join(SCOPES),
            "state": state,
            # Always ask. A connector that silently reuses whichever
            # account the browser happens to be signed into is how a deal
            # ends up pointed at somebody's personal OneDrive.
            "prompt": "select_account",
        }
    )
    return f"{_login()}/{settings.MICROSOFT_TENANT}/oauth2/v2.0/authorize?{query}"


class Graph:
    """A client for one connection's token.

    Holds no state beyond the token it was handed. Refreshing produces a
    new :class:`Token` and hands it back to the caller to store, rather
    than writing to the database from inside an HTTP client — which is how
    a retry ends up committing a transaction somebody else owned.
    """

    def __init__(self, access_token: str, client: httpx.AsyncClient | None = None):
        self._token = access_token
        self._client = client

    # --- the token ------------------------------------------------------

    @staticmethod
    async def exchange(
        code: str, redirect_uri: str, client: httpx.AsyncClient | None = None
    ) -> Token:
        """Turn the code from the redirect into a token."""
        return await Graph._token_request(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            },
            client,
        )

    @staticmethod
    async def refresh(
        refresh_token: str, client: httpx.AsyncClient | None = None
    ) -> Token:
        return await Graph._token_request(
            {"grant_type": "refresh_token", "refresh_token": refresh_token}, client
        )

    @staticmethod
    async def _token_request(
        form: dict[str, str], client: httpx.AsyncClient | None
    ) -> Token:
        _require_configured()
        url = f"{_login()}/{settings.MICROSOFT_TENANT}/oauth2/v2.0/token"
        body = {
            **form,
            "client_id": settings.MICROSOFT_CLIENT_ID,
            "client_secret": settings.MICROSOFT_CLIENT_SECRET,
            "scope": " ".join(SCOPES),
        }
        async with _session(client) as session:
            response = await session.post(url, data=body)
        if response.status_code >= 400:
            # The token endpoint speaks a different dialect from Graph:
            # its body is {"error": "invalid_client", "error_description":
            # "AADSTS7000215: Invalid client secret…"} — a *string* where
            # Graph puts an object. Read through `_reason`, that shape
            # produced « Microsoft refused that as this account » with no
            # detail and advice about site access, on the first real
            # connection attempt whose actual problem was the server's
            # own secret. The AADSTS sentence names its own fix; say it.
            raise GraphError(_token_refusal(response))

        payload = response.json()
        return Token(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token"),
            expires_at=datetime.now(UTC)
            + timedelta(seconds=int(payload.get("expires_in", 3600))),
            scopes=str(payload.get("scope", "")).split(),
        )

    # --- reading --------------------------------------------------------

    async def me(self) -> dict[str, str]:
        """Whose access this is, for the screen to name."""
        found = await self._get("/me")
        return {
            "name": str(found.get("displayName") or ""),
            "email": str(found.get("mail") or found.get("userPrincipalName") or ""),
            "id": str(found.get("id") or ""),
        }

    async def drives(self) -> list[Drive]:
        """Every document library this person can reach, theirs first.

        Their own OneDrive, then the libraries of the sites they follow —
        which is the list a banker recognises, because a deal room is a
        site somebody added them to and it is in « followed sites » the
        moment they open it.
        """
        found: list[Drive] = []
        try:
            mine = await self._get("/me/drive")
            found.append(
                Drive(
                    id=str(mine["id"]),
                    name=str(mine.get("name") or "OneDrive"),
                    owner="Your OneDrive",
                )
            )
        except GraphError:
            # An account with no OneDrive provisioned. The sites below are
            # the interesting half anyway.
            pass

        for site in await self._all("/me/followedSites"):
            site_id = str(site.get("id") or "")
            if not site_id:
                continue
            try:
                drives = await self._all(f"/sites/{site_id}/drives")
            except GraphError as problem:
                log.info("connector.graph.site_unreadable", error=str(problem)[:120])
                continue
            for drive in drives:
                found.append(
                    Drive(
                        id=str(drive["id"]),
                        name=str(drive.get("name") or "Documents"),
                        owner=str(site.get("displayName") or site.get("name") or ""),
                    )
                )
        return found

    async def children(self, drive_id: str, item_id: str | None = None) -> list[Item]:
        """What is in a folder. `None` is the drive's root."""
        where = (
            f"/drives/{drive_id}/items/{item_id}"
            if item_id
            else f"/drives/{drive_id}/root"
        )
        return [_item(one, drive_id) for one in await self._all(f"{where}/children")]

    async def item(self, drive_id: str, item_id: str) -> Item:
        return _item(await self._get(f"/drives/{drive_id}/items/{item_id}"), drive_id)

    # --- mail -----------------------------------------------------------

    async def messages(self, folder: str, top: int = 40) -> list[Message]:
        """A folder's messages, newest first, without their bodies."""
        where = FOLDERS.get(folder)
        if where is None:
            raise GraphError(
                f"There is no « {folder} » folder. Try one of: {', '.join(FOLDERS)}."
            )
        fields = (
            "id,changeKey,subject,from,toRecipients,receivedDateTime,"
            "bodyPreview,isDraft,isRead,hasAttachments"
        )
        found = await self._all(
            f"/me/mailFolders/{where}/messages"
            f"?$select={fields}&$top={top}&$orderby=receivedDateTime desc",
            # One page. « The last forty » is the list a person reads, and
            # paging a mailbox to its end would fetch years of mail to
            # render a pane that shows fifteen rows.
            pages=1,
        )
        return [_message(one) for one in found]

    async def message(self, message_id: str) -> Message:
        """One message, with its body."""
        return _message(await self._get(f"/me/messages/{message_id}"))

    async def download(self, drive_id: str, item_id: str) -> bytes:
        """The file itself.

        Graph answers `/content` with a redirect to storage, which httpx
        follows. The bytes are the document exactly as it sits in the
        library — the same thing a person would get by opening it.
        """
        async with _session(self._client) as session:
            response = await session.get(
                f"{_graph()}/drives/{drive_id}/items/{item_id}/content",
                headers={"Authorization": f"Bearer {self._token}"},
                follow_redirects=True,
            )
        if response.status_code >= 400:
            raise GraphError(_reason(response))
        return response.content

    # --- the plumbing ---------------------------------------------------

    async def _get(self, path: str) -> dict[str, Any]:
        url = path if path.startswith("http") else f"{_graph()}{path}"
        for attempt in range(ATTEMPTS):
            async with _session(self._client) as session:
                response = await session.get(
                    url, headers={"Authorization": f"Bearer {self._token}"}
                )
            if response.status_code == 429 or response.status_code >= 500:
                if attempt + 1 < ATTEMPTS:
                    await _wait(response, attempt)
                    continue
            if response.status_code >= 400:
                raise GraphError(_reason(response))
            return dict(response.json())
        raise GraphError("Microsoft is not answering. Try again in a moment.")

    async def _all(self, path: str, pages: int | None = None) -> list[dict[str, Any]]:
        """Every page of a collection, or the first `pages` of one.

        Graph pages at 200 and hands back a link; a deal room with three
        hundred files in it is ordinary, and a client that read the first
        page and stopped would quietly check two thirds of a room. Mail is
        the one place where stopping is right, and it says so where it
        asks.
        """
        items: list[dict[str, Any]] = []
        url: str | None = path
        read = 0
        while url and (pages is None or read < pages):
            page = await self._get(url)
            items.extend(page.get("value") or [])
            url = page.get("@odata.nextLink")
            read += 1
        return items


def _session(client: httpx.AsyncClient | None) -> Any:
    """The caller's client, or a short-lived one.

    A passed client is *not* closed — it belongs to whoever passed it,
    which is how the tests hand in a fake transport.
    """
    if client is not None:
        return _Borrowed(client)
    return httpx.AsyncClient(timeout=30.0)


class _Borrowed:
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def __aenter__(self) -> httpx.AsyncClient:
        return self._client

    async def __aexit__(self, *_: object) -> None:
        return None


async def _wait(response: httpx.Response, attempt: int) -> None:
    import asyncio

    after = response.headers.get("Retry-After")
    delay = float(after) if after and after.isdigit() else 2.0**attempt
    await asyncio.sleep(min(delay, MAX_BACKOFF))


def _token_refusal(response: httpx.Response) -> str:
    """The sign-in service's own sentence for a refused token request.

    `error_description` starts with an AADSTS code — searchable, and
    usually carrying the fix in plain words (« Invalid client secret
    provided »). Shown as it stands for the same reason every other
    message here is.
    """
    detail = ""
    try:
        payload = response.json()
        found = payload.get("error_description") or payload.get("error", {})
        if isinstance(found, dict):
            # Some refusals arrive in Graph's dialect anyway; read both.
            found = found.get("message", "")
        detail = str(found).split("\n")[0]
    except Exception:
        detail = ""
    if detail:
        return f"Microsoft refused the connection: {detail}"
    return (
        f"Microsoft refused the connection ({response.status_code}) "
        "without saying why. The server's client id and secret are the "
        "usual suspects."
    )


def _reason(response: httpx.Response) -> str:
    """Graph's own sentence, or ours when it did not write one.

    Every message here is shown to a person as it stands, so the common
    failures get words with a next step in them rather than a status code.
    """
    if response.status_code in (401, 403):
        try:
            detail = response.json()["error"]["message"]
        except Exception:
            detail = ""
        return (
            "Microsoft refused that as this account"
            + (f" — {detail}" if detail else "")
            + ". Connecting again, or asking whoever owns the site for "
            "access to it, is the fix."
        )
    if response.status_code == 404:
        return (
            "That folder is not there any more. Somebody may have moved or "
            "deleted it; pick it again."
        )
    if response.status_code == 429:
        return "Microsoft is rate-limiting this connection. Try again shortly."
    try:
        detail = response.json()["error"]["message"]
    except Exception:
        detail = response.text[:200]
    return f"Microsoft answered {response.status_code}: {detail}"


def _message(payload: dict[str, Any]) -> Message:
    sender = ((payload.get("from") or {}).get("emailAddress")) or {}
    body = payload.get("body") or {}
    return Message(
        id=str(payload["id"]),
        change_key=str(payload.get("changeKey") or ""),
        subject=str(payload.get("subject") or "(no subject)"),
        # A draft to a new recipient has no name yet, only an address.
        # Falling back the other way — an address where a name exists —
        # would put a machine identifier in a column people read.
        from_name=str(sender.get("name") or sender.get("address") or ""),
        from_email=str(sender.get("address") or ""),
        to=tuple(
            str(((one or {}).get("emailAddress") or {}).get("address") or "")
            for one in (payload.get("toRecipients") or [])
        ),
        # A draft has never been received. Graph fills `receivedDateTime`
        # with its creation time anyway, which is the date a person means.
        received_at=str(payload.get("receivedDateTime") or ""),
        preview=str(payload.get("bodyPreview") or ""),
        is_draft=bool(payload.get("isDraft")),
        is_read=bool(payload.get("isRead", True)),
        has_attachments=bool(payload.get("hasAttachments")),
        body=str(body.get("content") or ""),
        body_type=str(body.get("contentType") or "html").lower(),
    )


def _item(payload: dict[str, Any], drive_id: str) -> Item:
    reference = payload.get("parentReference") or {}
    modified = payload.get("lastModifiedBy") or {}
    return Item(
        id=str(payload["id"]),
        name=str(payload.get("name") or ""),
        folder="folder" in payload,
        size=int(payload.get("size") or 0),
        # `cTag` is content; `eTag` also changes on a rename. Reading a
        # forty-megabyte model again because somebody fixed a typo in its
        # name is exactly the sort of waste a sync should not produce.
        ctag=str(payload.get("cTag") or payload.get("eTag") or ""),
        modified_at=str(payload.get("lastModifiedDateTime") or ""),
        modified_by=str((modified.get("user") or {}).get("displayName") or ""),
        path=str(reference.get("path") or ""),
        drive_id=str(reference.get("driveId") or drive_id),
    )


__all__ = [
    "FOLDERS",
    "SCOPES",
    "Drive",
    "Graph",
    "GraphError",
    "Item",
    "Message",
    "NotConfigured",
    "Token",
    "authorize_url",
    "configured",
]
