"""Connecting a file store, and keeping a deal in step with it.

The product's answer to the question the data room could not answer: *the
model is not in here, it is in the deal room, and somebody replaced it on
Tuesday afternoon.* A deck checked against last week's model is worse than
one nobody checked, because it comes with a clean bill of health.

Three things happen in this file.

**A person connects their own access.** The token is theirs and everything
read through it is read as them — see :mod:`polar.connector.graph` for why
that is the right trade and what it costs.

**A deal is pointed at a folder.** By drive id and item id, never by path,
because a path is a name somebody changes on a Friday.

**A sync reads what has moved.** Every file in the folder whose content
has changed since it was last read becomes a new *version* of the same
document, and the check re-runs. Which is the whole point: nobody has to
remember to re-upload anything, and « the deck ties to the model » stops
meaning « it did on Tuesday ».
"""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import httpx
import structlog

from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.models import (
    ConnectedFolder,
    Connection,
    ConnectionProvider,
    ConnectionStatus,
)

from .graph import Graph, GraphError, Item, Token
from .repository import ConnectorRepository

log = structlog.get_logger()

#: Refresh this long before the token actually expires. A sync that starts
#: valid and finishes expired is a failure nobody can reproduce.
MARGIN = timedelta(minutes=5)

#: How many files one sync will read. A deal room is tens of documents; a
#: SharePoint library somebody points at the root of is tens of thousands,
#: and reading all of them inline would be an outage rather than a sync.
#: What is skipped is reported rather than dropped quietly.
MAX_FILES = 200


class ConnectorError(Exception):
    """Something a person can act on, in words they can act on."""


class ConnectorService:
    # --- connecting -----------------------------------------------------

    async def complete(
        self,
        session: AsyncSession,
        *,
        organization_id: UUID,
        user_id: UUID,
        code: str,
        redirect_uri: str,
        client: httpx.AsyncClient | None = None,
    ) -> Connection:
        """Turn the code from the redirect into a stored connection.

        Replaces this person's existing connection rather than adding a
        second: two live tokens for one account in one organization means
        a sync that works or fails depending on which row it picked up.
        """
        token = await Graph.exchange(code, redirect_uri, client)
        who = await Graph(token.access_token, client).me()

        repository = ConnectorRepository.from_session(session)
        connection = await repository.for_user(
            organization_id, user_id, ConnectionProvider.microsoft
        ) or Connection(
            organization_id=organization_id,
            user_id=user_id,
            provider=ConnectionProvider.microsoft,
        )
        connection.status = ConnectionStatus.active
        connection.account_name = who["name"]
        connection.account_email = who["email"]
        connection.error = None
        _store(connection, token)
        return await repository.save(connection)

    async def disconnect(
        self, session: AsyncSession, *, connection: Connection
    ) -> Connection:
        """Stop using it, and forget the token.

        The folders a deal was pointed at are left alone. Reconnecting is
        then one press rather than a re-setup, and a deal that has stopped
        syncing says why rather than silently forgetting where its files
        came from.
        """
        connection.status = ConnectionStatus.revoked
        connection.access_token = ""
        connection.refresh_token = None
        connection.expires_at = None
        return await ConnectorRepository.from_session(session).save(connection)

    async def client_for(
        self,
        session: AsyncSession,
        *,
        connection: Connection,
        client: httpx.AsyncClient | None = None,
    ) -> Graph:
        """A Graph client with a token that is good right now.

        Refreshing here rather than on a schedule: a token is only ever
        needed at the moment somebody asks for something, and a background
        refresher is a second thing to run and a second thing to be broken.
        """
        if connection.status is ConnectionStatus.revoked:
            raise ConnectorError(
                "This connection was disconnected. Connect Microsoft again "
                "to keep the deal in step with the site."
            )

        expiring = (
            connection.expires_at is None
            or connection.expires_at <= datetime.now(UTC) + MARGIN
        )
        if expiring and connection.refresh_token:
            try:
                token = await Graph.refresh(connection.refresh_token, client)
            except GraphError as problem:
                connection.status = ConnectionStatus.expired
                connection.error = str(problem)
                await ConnectorRepository.from_session(session).save(connection)
                raise ConnectorError(
                    "Microsoft would not renew this connection — "
                    f"{problem} Connect it again to carry on."
                ) from problem
            _store(connection, token)
            connection.status = ConnectionStatus.active
            connection.error = None
            await ConnectorRepository.from_session(session).save(connection)

        return Graph(connection.access_token, client)

    # --- pointing a deal at a folder ------------------------------------

    async def point(
        self,
        session: AsyncSession,
        *,
        dossier_id: UUID,
        connection: Connection,
        drive_id: str,
        item_id: str,
        client: httpx.AsyncClient | None = None,
    ) -> ConnectedFolder:
        """« This deal's files are in that folder. »"""
        graph = await self.client_for(session, connection=connection, client=client)
        try:
            folder = await graph.item(drive_id, item_id)
        except GraphError as problem:
            raise ConnectorError(str(problem)) from problem
        if not folder.folder:
            raise ConnectorError(
                f"« {folder.name} » is a file, not a folder. Point the deal "
                "at the folder its documents are in."
            )

        repository = ConnectorRepository.from_session(session)
        pointed = await repository.folder_of(dossier_id) or ConnectedFolder(
            dossier_id=dossier_id
        )
        pointed.connection_id = connection.id
        pointed.drive_id = drive_id
        pointed.item_id = item_id
        pointed.name = folder.name
        pointed.path = folder.path
        pointed.error = None
        return await repository.save_folder(pointed)

    async def unpoint(self, session: AsyncSession, *, folder: ConnectedFolder) -> None:
        """Stop watching. The documents already read stay in the deal —
        they are what every check and every confirmed link stand on."""
        await ConnectorRepository.from_session(session).delete_folder(folder)

    # --- the sync -------------------------------------------------------

    async def sync(
        self,
        session: AsyncSession,
        *,
        folder: ConnectedFolder,
        user_id: UUID,
        client: httpx.AsyncClient | None = None,
    ) -> dict[str, Any]:
        """Read what has changed in the folder, and re-check the deal.

        **Content, not names.** A file is read again when its `cTag` moves,
        which Graph changes when the bytes change and not when somebody
        renames it — so a forty-megabyte model is not downloaded again
        because of a typo in its title.

        **A new version, never an overwrite**, exactly as an upload makes
        one: the deal keeps every state it has been in, and « what moved
        since Tuesday » stays answerable.

        Everything skipped is counted with its reason. A sync that reads
        four of fifty files and says « 4 read » is a sync that has quietly
        decided the other forty-six do not matter.
        """
        from polar.tieout.ingest import kind_for
        from polar.tieout.service import tieout

        repository = ConnectorRepository.from_session(session)
        connection = await repository.get(folder.connection_id)
        if connection is None:
            raise ConnectorError("The connection behind this folder is gone.")

        graph = await self.client_for(session, connection=connection, client=client)
        try:
            items = await graph.children(folder.drive_id, folder.item_id)
        except GraphError as problem:
            folder.error = str(problem)
            await repository.save_folder(folder)
            raise ConnectorError(str(problem)) from problem

        known = await repository.artifacts_by_external_id(folder.dossier_id)
        read = 0
        unchanged = 0
        skipped: dict[str, int] = {}
        failed = 0

        for item in _readable(items, skipped):
            if read >= MAX_FILES:
                skipped["more files than one sync will read"] = (
                    skipped.get("more files than one sync will read", 0) + 1
                )
                continue
            current = known.get(item.id)
            if current is not None and current.external_version == item.ctag:
                unchanged += 1
                continue

            kind = kind_for(item.name)
            if kind is None:
                continue
            try:
                payload = await graph.download(item.drive_id, item.id)
            except GraphError as problem:
                log.info("connector.sync.download_failed", error=str(problem)[:160])
                skipped[str(problem)[:80]] = skipped.get(str(problem)[:80], 0) + 1
                continue

            artifact = await tieout.ingest(
                session,
                dossier_id=folder.dossier_id,
                kind=kind,
                filename=item.name,
                payload=payload,
                user_id=user_id,
                # The store's own identity, which is what makes a rename a
                # rename rather than a second document.
                external_id=item.id,
                external_version=item.ctag,
                lineage_of=current.lineage_id if current is not None else None,
            )
            read += 1
            if artifact.status.value == "failed":
                failed += 1

        result = {
            "read": read,
            "unchanged": unchanged,
            "failed": failed,
            "skipped": [
                {"reason": reason, "count": count}
                for reason, count in sorted(skipped.items(), key=lambda one: -one[1])
            ],
        }
        folder.last_result = result
        folder.last_synced_at = datetime.now(UTC)
        folder.error = None
        await repository.save_folder(folder)

        if read:
            # The same unconditional re-check an upload does, and for the
            # same reason: a document that moved changes what is true about
            # the ones it was checked against.
            await tieout.run_tieout(
                session, dossier_id=folder.dossier_id, user_id=user_id
            )
            await tieout.run_audit(
                session, dossier_id=folder.dossier_id, user_id=user_id
            )
            await tieout.run_crosscheck(
                session, dossier_id=folder.dossier_id, user_id=user_id
            )
        return result

    # --- mail -----------------------------------------------------------

    async def check_message(
        self,
        session: AsyncSession,
        *,
        dossier_id: UUID,
        connection: Connection,
        message_id: str,
        user_id: UUID,
        client: httpx.AsyncClient | None = None,
    ) -> Any:
        """Read one message into the deal and reconcile it.

        **One message, on a press, and never the mailbox.** A product that
        quietly read every mail somebody received would be a surveillance
        tool that also checks numbers, and the only thing stopping it from
        becoming one is that this takes an id. What gets checked is what
        somebody opened.

        Re-checking the same message is a *version* of it, exactly as
        re-uploading a deck is, keyed on Graph's `changeKey`: a draft
        being edited between two checks is a new draft, and « the figure
        we flagged is not in there any more » has to be answerable.
        """
        from polar.tieout.service import tieout

        graph = await self.client_for(session, connection=connection, client=client)
        try:
            message = await graph.message(message_id)
        except GraphError as problem:
            raise ConnectorError(str(problem)) from problem

        repository = ConnectorRepository.from_session(session)
        known = (await repository.artifacts_by_external_id(dossier_id)).get(message.id)
        if known is not None and known.external_version == message.change_key:
            # Unchanged since it was last read. Re-running the check is
            # still right — the *model* may have moved under it, which is
            # the ordinary case — but re-reading the message is not.
            return await tieout.run_tieout(
                session, dossier_id=dossier_id, user_id=user_id
            )

        await tieout.ingest_message(
            session,
            dossier_id=dossier_id,
            subject=message.subject,
            body=message.body,
            html=message.body_type == "html",
            user_id=user_id,
            external_id=message.id,
            external_version=message.change_key,
            lineage_of=known.lineage_id if known is not None else None,
        )
        return await tieout.run_tieout(session, dossier_id=dossier_id, user_id=user_id)

    # --- reading --------------------------------------------------------

    async def connection_for(
        self,
        session: AsyncSession | AsyncReadSession,
        *,
        organization_id: UUID,
        user_id: UUID,
    ) -> Connection | None:
        """This person's connection for this organization, if any.

        Theirs, not the organization's. A connection is one person's
        delegated access and showing somebody else's as though it were
        theirs would be the screen claiming access they do not have.
        """
        return await ConnectorRepository.from_session(session).for_user(
            organization_id, user_id, ConnectionProvider.microsoft
        )


def _readable(items: list[Item], skipped: dict[str, int]) -> list[Item]:
    """The files worth reading, and a count of everything else.

    Folders are not recursed into. A deal room's own folder is what the
    deal was pointed at; walking down into « Archive » and « Old versions »
    is how a check ends up reconciling a deck against a model somebody
    superseded in March.
    """
    from polar.tieout.ingest import kind_for

    keep: list[Item] = []
    for item in items:
        if item.folder:
            skipped["subfolders are not read"] = (
                skipped.get("subfolders are not read", 0) + 1
            )
            continue
        if kind_for(item.name) is None:
            skipped["not a file this can read"] = (
                skipped.get("not a file this can read", 0) + 1
            )
            continue
        keep.append(item)
    return keep


def _store(connection: Connection, token: Token) -> None:
    connection.access_token = token.access_token
    #: Microsoft rotates refresh tokens and does not always send a new one.
    #: Overwriting with `None` would end the connection an hour later, for
    #: no reason anybody could find.
    if token.refresh_token:
        connection.refresh_token = token.refresh_token
    connection.expires_at = token.expires_at
    if token.scopes:
        connection.scopes = token.scopes


connector = ConnectorService()

__all__ = ["MAX_FILES", "ConnectorError", "ConnectorService", "connector"]
