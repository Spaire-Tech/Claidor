"""Connecting a file store, and keeping a deal in step with it.

**Against a fake Graph, and that is not the same as working.** There is no
Microsoft tenant here and there will not be one until somebody connects a
real account, so every response below is a hand-written replay of the
shapes Microsoft's own documentation publishes. What that can prove is the
half that is ours: that a token is refreshed before it expires and stored
when it rotates, that a rename is not a new document, that a file whose
content has not changed is not downloaded again, that a folder pointed at
by path would break and by id does not.

What it cannot prove is that Graph answers the way the documentation says.
The first connection against a real tenant will find something; the shape
of `graph.py` — one client, one place each URL is built — is chosen so
that whatever it finds is cheap to fix.
"""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest

from polar.config import settings
from polar.connector.repository import ConnectorRepository
from polar.connector.service import ConnectorError, connector
from polar.connector.state import LIFETIME, sign, unsign
from polar.kit.db.postgres import AsyncSession
from polar.models import (
    ArtifactKind,
    ConnectedFolder,
    Connection,
    ConnectionProvider,
    ConnectionStatus,
    Dossier,
    DossierMember,
    DossierRole,
    Organization,
    User,
)
from polar.tieout.repository import TieOutRepository
from tests.fixtures.database import SaveFixture
from tests.fixtures.random_objects import create_organization, create_user

CASCADE = Path(__file__).resolve().parents[2] / "scripts" / "cascade"
MODEL = CASCADE / "cascade_model.xlsx"
DECK = CASCADE / "cascade_deck.pptx"


# --- a Graph that is not Microsoft ---------------------------------------


class FakeGraph:
    """Microsoft's documented shapes, and a record of what was asked for.

    The counting matters as much as the answers: « was this file
    downloaded again » is the question the whole sync design turns on, and
    it is invisible in the result.
    """

    def __init__(self, items: list[dict[str, Any]] | None = None) -> None:
        self.items = items or []
        self.downloads: list[str] = []
        self.token_calls: list[dict[str, str]] = []
        self.refresh_token = "refresh-1"
        #: Messages, by folder. Keyed the way Graph addresses them.
        self.mail: dict[str, list[dict[str, Any]]] = {}

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self._handle)

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self.transport())

    def _handle(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)

        if "oauth2/v2.0/token" in url:
            form = dict(
                pair.split("=", 1)
                for pair in request.content.decode().split("&")
                if "=" in pair
            )
            self.token_calls.append(form)
            return httpx.Response(
                200,
                json={
                    "access_token": f"access-{len(self.token_calls)}",
                    "refresh_token": self.refresh_token,
                    "expires_in": 3600,
                    "scope": "offline_access User.Read Files.Read.All Sites.Read.All",
                },
            )

        if url.endswith("/me"):
            return httpx.Response(
                200,
                json={
                    "id": "u-1",
                    "displayName": "R. Duval",
                    "mail": "r.duval@rothmoor.example",
                },
            )

        if url.endswith("/me/drive"):
            return httpx.Response(200, json={"id": "drive-1", "name": "OneDrive"})

        if url.endswith("/me/followedSites"):
            return httpx.Response(
                200,
                json={
                    "value": [
                        {"id": "site-1", "displayName": "Rothmoor Deals"},
                    ]
                },
            )

        if url.endswith("/sites/site-1/drives"):
            return httpx.Response(
                200, json={"value": [{"id": "drive-2", "name": "Documents"}]}
            )

        if "/mailFolders/" in url:
            folder = url.split("/mailFolders/")[1].split("/")[0]
            return httpx.Response(
                200,
                json={"value": [_graph_mail(one) for one in self.mail.get(folder, [])]},
            )

        if "/me/messages/" in url:
            message_id = url.rsplit("/me/messages/", 1)[1]
            for held in self.mail.values():
                for one in held:
                    if one["id"] == message_id:
                        return httpx.Response(200, json=_graph_mail(one, body=True))
            return httpx.Response(
                404, json={"error": {"message": "The message was not found."}}
            )

        if "/content" in url:
            item_id = url.split("/items/")[1].split("/content")[0]
            self.downloads.append(item_id)
            payload = next((one for one in self.items if one["id"] == item_id), None)
            return httpx.Response(200, content=payload["bytes"] if payload else b"")

        if url.endswith("/children"):
            return httpx.Response(
                200, json={"value": [_graph_item(one) for one in self.items]}
            )

        if "/items/" in url:
            item_id = url.rsplit("/items/", 1)[1]
            found = next((one for one in self.items if one["id"] == item_id), None)
            if found is None:
                return httpx.Response(
                    404, json={"error": {"message": "Item does not exist"}}
                )
            return httpx.Response(200, json=_graph_item(found))

        return httpx.Response(404, json={"error": {"message": f"no stub for {url}"}})


def _graph_item(one: dict[str, Any]) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": one["id"],
        "name": one["name"],
        "size": len(one.get("bytes") or b""),
        "cTag": one.get("ctag", "c1"),
        "lastModifiedDateTime": "2026-08-10T09:00:00Z",
        "lastModifiedBy": {"user": {"displayName": "R. Duval"}},
        "parentReference": {"driveId": "drive-2", "path": "/drive/root:/Cascade"},
    }
    if one.get("folder"):
        payload["folder"] = {"childCount": 0}
    return payload


def _graph_mail(one: dict[str, Any], body: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": one["id"],
        "changeKey": one.get("change_key", "k1"),
        "subject": one.get("subject", ""),
        "from": {
            "emailAddress": {
                "name": one.get("from", "J. Mercer"),
                "address": "j.mercer@rothmoor.example",
            }
        },
        "toRecipients": [{"emailAddress": {"address": "helena.vos@kestrel.example"}}],
        "receivedDateTime": "2026-08-11T08:22:00Z",
        "bodyPreview": one.get("body", "")[:80],
        "isDraft": one.get("draft", False),
        "isRead": True,
        "hasAttachments": False,
    }
    if body:
        payload["body"] = {"contentType": "html", "content": one.get("body", "")}
    return payload


def a_message(
    subject: str,
    body: str,
    id: str = "msg-1",
    change_key: str = "k1",
    draft: bool = True,
) -> dict[str, Any]:
    return {
        "id": id,
        "subject": subject,
        "body": body,
        "change_key": change_key,
        "draft": draft,
    }


def a_file(name: str, path: Path, ctag: str = "c1", id: str = "") -> dict[str, Any]:
    return {
        "id": id or f"item-{name}",
        "name": name,
        "bytes": path.read_bytes(),
        "ctag": ctag,
    }


# --- the state that crosses the redirect ---------------------------------


def test_the_state_names_the_organization_and_cannot_be_edited() -> None:
    """The browser coming back from Microsoft may carry no cookie at all,
    so the state *is* the credential."""
    state = sign({"organization_id": "org-1", "user_id": "user-1"})
    assert unsign(state)["organization_id"] == "org-1"

    body, signature = state.split(".", 1)
    with pytest.raises(ValueError, match="signature"):
        unsign(f"{body}x.{signature}")
    with pytest.raises(ValueError, match="malformed state"):
        unsign("nonsense")


def test_a_state_left_in_a_browser_history_stops_working() -> None:
    import time

    from polar.connector import state as module

    made = sign({"organization_id": "org-1", "user_id": "user-1"})
    then = time.time
    try:
        module.time.time = lambda: then() + LIFETIME + 1  # type: ignore[assignment]
        with pytest.raises(ValueError, match="expired"):
            unsign(made)
    finally:
        module.time.time = then  # type: ignore[assignment]


# --- connecting ----------------------------------------------------------


async def _deal(
    session: AsyncSession, save_fixture: SaveFixture, owner: User
) -> tuple[Dossier, Organization]:
    organization = await create_organization(save_fixture)
    deal = Dossier(
        organization_id=organization.id,
        name="Project Cascade",
        created_by_id=owner.id,
    )
    session.add(deal)
    await session.flush()
    session.add(
        DossierMember(dossier_id=deal.id, user_id=owner.id, role=DossierRole.lead)
    )
    await session.flush()
    return deal, organization


def configure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "MICROSOFT_CLIENT_ID", "client-1")
    monkeypatch.setattr(settings, "MICROSOFT_CLIENT_SECRET", "secret-1")


@pytest.mark.asyncio
class TestConnecting:
    async def test_a_connection_records_whose_access_it_is(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A deal syncing through somebody's credentials is a fact the team
        should be able to see on screen."""
        configure(monkeypatch)
        owner = await create_user(save_fixture)
        _, organization = await _deal(session, save_fixture, owner)
        graph = FakeGraph()

        connection = await connector.complete(
            session,
            organization_id=organization.id,
            user_id=owner.id,
            code="code-1",
            redirect_uri="https://example.test/callback",
            client=graph.client(),
        )

        assert connection.account_name == "R. Duval"
        assert connection.account_email == "r.duval@rothmoor.example"
        assert connection.status is ConnectionStatus.active
        assert connection.refresh_token == "refresh-1"
        assert "Files.Read.All" in connection.scopes

    async def test_connecting_twice_replaces_rather_than_stacks(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Two live tokens for one account means a sync that works or fails
        depending on which row it picked up."""
        configure(monkeypatch)
        owner = await create_user(save_fixture)
        _, organization = await _deal(session, save_fixture, owner)
        graph = FakeGraph()

        first = await connector.complete(
            session,
            organization_id=organization.id,
            user_id=owner.id,
            code="code-1",
            redirect_uri="https://example.test/callback",
            client=graph.client(),
        )
        second = await connector.complete(
            session,
            organization_id=organization.id,
            user_id=owner.id,
            code="code-2",
            redirect_uri="https://example.test/callback",
            client=graph.client(),
        )

        assert first.id == second.id
        # The second grant's token, not the first's — one row, kept current.
        assert second.access_token == "access-2"
        assert len(graph.token_calls) == 2

    async def test_a_token_about_to_expire_is_refreshed_first(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A sync that starts valid and finishes expired is a failure
        nobody can reproduce."""
        configure(monkeypatch)
        owner = await create_user(save_fixture)
        _, organization = await _deal(session, save_fixture, owner)
        graph = FakeGraph()
        connection = Connection(
            organization_id=organization.id,
            user_id=owner.id,
            provider=ConnectionProvider.microsoft,
            access_token="stale",
            refresh_token="refresh-1",
            expires_at=datetime.now(UTC) + timedelta(seconds=30),
        )
        session.add(connection)
        await session.flush()

        client = await connector.client_for(
            session, connection=connection, client=graph.client()
        )

        assert graph.token_calls[0]["grant_type"] == "refresh_token"
        assert connection.access_token == "access-1"
        assert client is not None

    async def test_a_refresh_token_microsoft_does_not_rotate_is_kept(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Microsoft does not always send a new one, and overwriting with
        null would end the connection an hour later for no findable
        reason."""
        configure(monkeypatch)
        owner = await create_user(save_fixture)
        _, organization = await _deal(session, save_fixture, owner)
        graph = FakeGraph()
        graph.refresh_token = ""
        connection = Connection(
            organization_id=organization.id,
            user_id=owner.id,
            provider=ConnectionProvider.microsoft,
            access_token="stale",
            refresh_token="refresh-original",
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
        session.add(connection)
        await session.flush()

        await connector.client_for(
            session, connection=connection, client=graph.client()
        )

        assert connection.refresh_token == "refresh-original"

    async def test_a_connection_microsoft_will_not_renew_says_so(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        configure(monkeypatch)
        owner = await create_user(save_fixture)
        _, organization = await _deal(session, save_fixture, owner)
        connection = Connection(
            organization_id=organization.id,
            user_id=owner.id,
            provider=ConnectionProvider.microsoft,
            access_token="stale",
            refresh_token="revoked",
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
        session.add(connection)
        await session.flush()

        refusing = httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    400, json={"error": {"message": "AADSTS70000: expired"}}
                )
            )
        )
        with pytest.raises(ConnectorError, match="Connect it again"):
            await connector.client_for(session, connection=connection, client=refusing)

        # The state is on the record, so the screen can say which of the
        # two kinds of « not working » this is.
        assert connection.status is ConnectionStatus.expired
        assert "AADSTS70000" in (connection.error or "")


# --- the sync ------------------------------------------------------------


async def _connected(
    session: AsyncSession,
    save_fixture: SaveFixture,
    owner: User,
    graph: FakeGraph,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[Dossier, ConnectedFolder]:
    configure(monkeypatch)
    deal, organization = await _deal(session, save_fixture, owner)
    connection = await connector.complete(
        session,
        organization_id=organization.id,
        user_id=owner.id,
        code="code-1",
        redirect_uri="https://example.test/callback",
        client=graph.client(),
    )
    graph.items.append({"id": "folder-1", "name": "Cascade", "folder": True})
    folder = await connector.point(
        session,
        dossier_id=deal.id,
        connection=connection,
        drive_id="drive-2",
        item_id="folder-1",
        client=graph.client(),
    )
    graph.items = [one for one in graph.items if one["id"] != "folder-1"]
    return deal, folder


@pytest.mark.asyncio
class TestTheSync:
    async def test_it_reads_the_folder_into_the_deal_and_checks_it(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The whole point: nobody uploaded anything, and the deal is
        checked against what is in the room."""
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        deal, folder = await _connected(
            session, save_fixture, owner, graph, monkeypatch
        )
        graph.items = [
            a_file("cascade_model.xlsx", MODEL),
            a_file("cascade_deck.pptx", DECK),
            {"id": "item-notes", "name": "notes.txt", "bytes": b"not ours"},
        ]

        result = await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        await session.flush()

        assert result["read"] == 2
        assert result["skipped"] == [{"reason": "not a file this can read", "count": 1}]

        repository = TieOutRepository.from_session(session)
        kinds = {one.kind for one in await repository.current_artifacts(deal.id)}
        assert kinds == {ArtifactKind.model, ArtifactKind.deck}
        # And the deal has been checked, without anybody pressing anything.
        assert (await repository.latest_run(deal.id)) is not None

    async def test_the_deal_chose_its_model_and_the_working_copy_is_not_read(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A deal room carries the model beside its working copies, and
        reconciling the deck against a working copy reports the copy's
        every difference as a finding. The choice is made when the deal
        is made; the copy is counted as skipped, never silently."""
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        deal, folder = await _connected(
            session, save_fixture, owner, graph, monkeypatch
        )
        connection = await ConnectorRepository.from_session(session).get(
            folder.connection_id
        )
        assert connection is not None
        graph.items = [{"id": "folder-1", "name": "Cascade", "folder": True}]
        folder = await connector.point(
            session,
            dossier_id=deal.id,
            connection=connection,
            drive_id="drive-2",
            item_id="folder-1",
            model_item_id="item-cascade_model.xlsx",
            client=graph.client(),
        )
        graph.items = [
            a_file("cascade_model.xlsx", MODEL),
            a_file("cascade_working_v3.xlsx", MODEL, id="item-working"),
            a_file("cascade_deck.pptx", DECK),
        ]

        result = await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        await session.flush()

        assert result["read"] == 2
        assert result["skipped"] == [
            {"reason": "a second spreadsheet — the deal chose its model", "count": 1}
        ]
        repository = TieOutRepository.from_session(session)
        names = {one.filename for one in await repository.current_artifacts(deal.id)}
        assert names == {"cascade_model.xlsx", "cascade_deck.pptx"}

    async def test_a_file_that_has_not_changed_is_not_downloaded_again(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A forty-megabyte model re-read on every sync is a connector
        nobody leaves switched on."""
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        _, folder = await _connected(session, save_fixture, owner, graph, monkeypatch)
        graph.items = [a_file("cascade_model.xlsx", MODEL)]

        await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        await session.flush()
        graph.downloads.clear()

        again = await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )

        assert again == {"read": 0, "unchanged": 1, "failed": 0, "skipped": []}
        assert graph.downloads == []

    async def test_new_content_is_a_new_version_of_the_same_document(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        deal, folder = await _connected(
            session, save_fixture, owner, graph, monkeypatch
        )
        graph.items = [a_file("cascade_model.xlsx", MODEL)]
        await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        await session.flush()

        # Somebody saved over it in the deal room on Tuesday afternoon.
        graph.items = [a_file("cascade_model.xlsx", MODEL, ctag="c2")]
        await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        await session.flush()

        repository = TieOutRepository.from_session(session)
        current = await repository.current_artifacts(deal.id)
        assert len(current) == 1
        assert current[0].version == 2
        assert current[0].external_version == "c2"

    async def test_a_rename_is_not_a_second_document(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The whole reason the drive item id is stored.

        By filename this is `cascade_model.xlsx` and `Model FINAL.xlsx` —
        two documents, two lineages, and a deal that suddenly holds two
        models and reconciles the deck against whichever is newer.
        """
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        deal, folder = await _connected(
            session, save_fixture, owner, graph, monkeypatch
        )
        graph.items = [a_file("cascade_model.xlsx", MODEL, id="item-model")]
        await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        await session.flush()

        graph.items = [a_file("Model FINAL.xlsx", MODEL, ctag="c2", id="item-model")]
        await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        await session.flush()

        repository = TieOutRepository.from_session(session)
        current = await repository.current_artifacts(deal.id)
        assert len(current) == 1, "a rename made a second document"
        assert current[0].filename == "Model FINAL.xlsx"
        assert current[0].version == 2

    async def test_a_folder_that_is_gone_says_what_to_do(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        _, folder = await _connected(session, save_fixture, owner, graph, monkeypatch)

        gone = httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    404, json={"error": {"message": "itemNotFound"}}
                )
            )
        )
        with pytest.raises(ConnectorError, match="pick it again"):
            await connector.sync(session, folder=folder, user_id=owner.id, client=gone)
        assert folder.error is not None

    async def test_a_file_the_reader_cannot_open_is_counted_not_hidden(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A deck that cannot be read is a state of the deal, exactly as it
        is for an upload."""
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        _, folder = await _connected(session, save_fixture, owner, graph, monkeypatch)
        graph.items = [{"id": "item-broken", "name": "broken.pptx", "bytes": b"nope"}]

        result = await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )

        assert result["read"] == 1
        assert result["failed"] == 1

    async def test_pointing_at_a_file_rather_than_a_folder_is_refused(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        configure(monkeypatch)
        owner = await create_user(save_fixture)
        deal, organization = await _deal(session, save_fixture, owner)
        graph = FakeGraph([a_file("cascade_model.xlsx", MODEL, id="item-model")])
        connection = await connector.complete(
            session,
            organization_id=organization.id,
            user_id=owner.id,
            code="code-1",
            redirect_uri="https://example.test/callback",
            client=graph.client(),
        )

        with pytest.raises(ConnectorError, match="is a file, not a folder"):
            await connector.point(
                session,
                dossier_id=deal.id,
                connection=connection,
                drive_id="drive-2",
                item_id="item-model",
                client=graph.client(),
            )


# --- mail ----------------------------------------------------------------


@pytest.mark.asyncio
class TestMail:
    async def test_a_draft_is_checked_against_the_model(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The whole argument for reading mail.

        A deck can be pulled back out of a data room. A sent message
        cannot be pulled back out of anything, so a figure that is wrong
        in a draft is the one worth catching before the press.
        """
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        deal, folder = await _connected(
            session, save_fixture, owner, graph, monkeypatch
        )
        graph.items = [a_file("cascade_model.xlsx", MODEL)]
        await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        await session.flush()

        # The model says 228.9. The draft says 235.3 — a paper written
        # against last week's model, which is the realistic failure.
        graph.mail["drafts"] = [
            a_message(
                "Cascade — FY2025A summary",
                "<p>The business generated $235.3mm of revenue in FY2025A.</p>",
            )
        ]
        await connector.check_message(
            session,
            dossier_id=deal.id,
            connection=(
                await ConnectorRepository.from_session(session).get(
                    folder.connection_id
                )
            ),
            message_id="msg-1",
            user_id=owner.id,
            client=graph.client(),
        )
        await session.flush()

        repository = TieOutRepository.from_session(session)
        messages = [
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.message
        ]
        assert len(messages) == 1
        assert messages[0].filename == "Cascade — FY2025A summary"

        drifts = [
            one
            for one in await repository.findings_of(deal.id)
            if one.artifact_id == messages[0].id
        ]
        assert [one.printed for one in drifts] == ["$235.3mm"]
        assert drifts[0].expected == "$228.9mm"

    async def test_an_edited_draft_is_a_new_version_of_the_same_draft(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Somebody fixes the figure and checks again.

        Not a second message in the deal — the same one, moved on. « The
        figure we flagged is not in there any more » has to be answerable,
        and it is only answerable if both versions are on one lineage.
        """
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        deal, folder = await _connected(
            session, save_fixture, owner, graph, monkeypatch
        )
        graph.items = [a_file("cascade_model.xlsx", MODEL)]
        await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        await session.flush()
        connection = await ConnectorRepository.from_session(session).get(
            folder.connection_id
        )
        assert connection is not None

        async def check() -> None:
            await connector.check_message(
                session,
                dossier_id=deal.id,
                connection=connection,
                message_id="msg-1",
                user_id=owner.id,
                client=graph.client(),
            )
            await session.flush()

        graph.mail["drafts"] = [
            a_message(
                "Cascade — FY2025A summary",
                "<p>The business generated $235.3mm of revenue in FY2025A.</p>",
            )
        ]
        await check()

        graph.mail["drafts"] = [
            a_message(
                "Cascade — FY2025A summary",
                "<p>The business generated $228.9mm of revenue in FY2025A.</p>",
                change_key="k2",
            )
        ]
        await check()

        repository = TieOutRepository.from_session(session)
        messages = [
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.message
        ]
        assert len(messages) == 1
        assert messages[0].version == 2
        assert [
            one
            for one in await repository.findings_of(deal.id)
            if one.artifact_id == messages[0].id
        ] == []

    async def test_a_draft_that_has_not_moved_is_not_read_again(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Checking twice re-runs the check and not the read.

        The *model* moving under a draft is the ordinary case, so the
        check has to run; the draft has not changed, so it is not a new
        version of anything.
        """
        owner = await create_user(save_fixture)
        graph = FakeGraph()
        deal, folder = await _connected(
            session, save_fixture, owner, graph, monkeypatch
        )
        graph.items = [a_file("cascade_model.xlsx", MODEL)]
        await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        graph.mail["drafts"] = [
            a_message("Cascade", "<p>Revenue was $235.3mm in FY2025A.</p>")
        ]
        connection = await ConnectorRepository.from_session(session).get(
            folder.connection_id
        )
        assert connection is not None

        for _ in range(2):
            await connector.check_message(
                session,
                dossier_id=deal.id,
                connection=connection,
                message_id="msg-1",
                user_id=owner.id,
                client=graph.client(),
            )
            await session.flush()

        repository = TieOutRepository.from_session(session)
        messages = [
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.message
        ]
        assert len(messages) == 1
        assert messages[0].version == 1

    async def test_a_message_is_corrected_in_outlook_and_says_so(
        self,
        session: AsyncSession,
        save_fixture: SaveFixture,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The server has no write scope on a mailbox and never will.

        « Cannot » is not the useful half of that sentence; where it *can*
        be done is.
        """
        from polar.tieout.writing import NotCorrectable, writing

        owner = await create_user(save_fixture)
        graph = FakeGraph()
        deal, folder = await _connected(
            session, save_fixture, owner, graph, monkeypatch
        )
        graph.items = [a_file("cascade_model.xlsx", MODEL)]
        await connector.sync(
            session, folder=folder, user_id=owner.id, client=graph.client()
        )
        graph.mail["drafts"] = [
            a_message(
                "Cascade",
                "<p>The business generated $235.3mm of revenue in FY2025A.</p>",
            )
        ]
        connection = await ConnectorRepository.from_session(session).get(
            folder.connection_id
        )
        assert connection is not None
        await connector.check_message(
            session,
            dossier_id=deal.id,
            connection=connection,
            message_id="msg-1",
            user_id=owner.id,
            client=graph.client(),
        )
        await session.flush()

        repository = TieOutRepository.from_session(session)
        messages = [
            one
            for one in await repository.current_artifacts(deal.id)
            if one.kind is ArtifactKind.message
        ]
        finding = next(
            one
            for one in await repository.findings_of(deal.id)
            if one.artifact_id == messages[0].id
        )
        with pytest.raises(NotCorrectable, match="corrected in Outlook"):
            await writing.propose(session, finding=finding, user_id=owner.id)


# --- what the screens see ------------------------------------------------


@pytest.mark.asyncio
class TestTheRoutes:
    @pytest.mark.auth
    async def test_a_server_with_no_microsoft_application_says_so(
        self, client: Any, save_fixture: SaveFixture, session: AsyncSession, user: User
    ) -> None:
        """Not « connect » on a button that cannot work."""
        _, organization = await _deal(session, save_fixture, user)
        await session.flush()

        response = await client.get(
            "/v1/connector/state", params={"organization_id": str(organization.id)}
        )

        assert response.status_code == 200
        assert response.json() == {
            "configured": False,
            "connection": None,
            "authorize_url": None,
        }

    @pytest.mark.auth
    async def test_starting_the_flow_without_a_configuration_is_refused(
        self, client: Any, save_fixture: SaveFixture, session: AsyncSession, user: User
    ) -> None:
        _, organization = await _deal(session, save_fixture, user)
        await session.flush()

        response = await client.get(
            "/v1/connector/microsoft/authorize",
            params={"organization_id": str(organization.id)},
            follow_redirects=False,
        )

        assert response.status_code == 503
        assert "not configured" in response.json()["detail"]

    @pytest.mark.auth
    async def test_a_deal_you_are_not_on_has_no_folder(
        self, client: Any, save_fixture: SaveFixture, session: AsyncSession
    ) -> None:
        stranger = await create_user(save_fixture)
        deal, _ = await _deal(session, save_fixture, stranger)
        await session.flush()

        assert (
            await client.get(f"/v1/connector/deals/{deal.id}/folder")
        ).status_code == 404
        assert (
            await client.post(f"/v1/connector/deals/{deal.id}/sync")
        ).status_code == 404

    @pytest.mark.auth
    async def test_a_deal_with_nothing_connected_says_nothing_rather_than_failing(
        self, client: Any, save_fixture: SaveFixture, session: AsyncSession, user: User
    ) -> None:
        deal, _ = await _deal(session, save_fixture, user)
        await session.flush()

        response = await client.get(f"/v1/connector/deals/{deal.id}/folder")

        assert response.status_code == 200
        assert response.json() is None

    @pytest.mark.auth
    async def test_asking_for_drives_before_connecting_says_what_to_do(
        self, client: Any, save_fixture: SaveFixture, session: AsyncSession, user: User
    ) -> None:
        _, organization = await _deal(session, save_fixture, user)
        await session.flush()

        response = await client.get(
            "/v1/connector/drives", params={"organization_id": str(organization.id)}
        )

        assert response.status_code == 428
        assert "Connect Microsoft" in response.json()["detail"]

    @pytest.mark.auth
    async def test_the_folder_a_deal_watches_comes_back_with_its_last_sync(
        self,
        client: Any,
        save_fixture: SaveFixture,
        session: AsyncSession,
        user: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        graph = FakeGraph()
        deal, folder = await _connected(session, save_fixture, user, graph, monkeypatch)
        graph.items = [a_file("cascade_model.xlsx", MODEL)]
        await connector.sync(
            session, folder=folder, user_id=user.id, client=graph.client()
        )
        await session.flush()

        body = (await client.get(f"/v1/connector/deals/{deal.id}/folder")).json()

        assert body["name"] == "Cascade"
        assert body["last_result"]["read"] == 1
        assert body["connection"]["account_name"] == "R. Duval"
        assert body["last_synced_at"] is not None

    @pytest.mark.auth
    async def test_what_the_deal_holds_is_the_tag_it_was_read_at(
        self,
        client: Any,
        save_fixture: SaveFixture,
        session: AsyncSession,
        user: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The library screen's status column, and the only thing it needs.

        « Synced » and « Changed » are one comparison: the tag this deal
        was read at against the tag the room is at now. A screen that could
        not make it would be down to saying « we have a file called that »,
        which is the filename guess the drive item id exists to replace.
        """
        graph = FakeGraph()
        deal, folder = await _connected(session, save_fixture, user, graph, monkeypatch)
        graph.items = [a_file("cascade_model.xlsx", MODEL, id="item-model")]
        await connector.sync(
            session, folder=folder, user_id=user.id, client=graph.client()
        )
        await session.flush()

        held = (await client.get(f"/v1/connector/deals/{deal.id}/held")).json()
        assert held == {"item-model": "c1"}

        # Somebody saves over it. The deal still holds the old bytes until
        # a sync runs, and the tag is how the screen can say so.
        graph.items = [a_file("cascade_model.xlsx", MODEL, id="item-model", ctag="c2")]
        assert (await client.get(f"/v1/connector/deals/{deal.id}/held")).json() == {
            "item-model": "c1"
        }

        await connector.sync(
            session, folder=folder, user_id=user.id, client=graph.client()
        )
        await session.flush()

        # And after it, the newest version's tag — not both versions'.
        assert (await client.get(f"/v1/connector/deals/{deal.id}/held")).json() == {
            "item-model": "c2"
        }

    @pytest.mark.auth
    async def test_what_a_deal_you_are_not_on_holds_is_not_yours_to_ask(
        self, client: Any, save_fixture: SaveFixture, session: AsyncSession
    ) -> None:
        stranger = await create_user(save_fixture)
        deal, _ = await _deal(session, save_fixture, stranger)
        await session.flush()

        assert (
            await client.get(f"/v1/connector/deals/{deal.id}/held")
        ).status_code == 404


@pytest.mark.asyncio
async def test_disconnecting_keeps_the_folder_and_forgets_the_token(
    session: AsyncSession,
    save_fixture: SaveFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Reconnecting is then one press rather than a re-setup."""
    owner = await create_user(save_fixture)
    graph = FakeGraph()
    deal, folder = await _connected(session, save_fixture, owner, graph, monkeypatch)
    repository = ConnectorRepository.from_session(session)
    connection = await repository.get(folder.connection_id)
    assert connection is not None

    await connector.disconnect(session, connection=connection)
    await session.flush()

    assert connection.access_token == ""
    assert connection.refresh_token is None
    assert await repository.folder_of(deal.id) is not None
