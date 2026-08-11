"""Connecting a file store, choosing a folder, and syncing it.

**The OAuth flow is a browser flow, and only a browser can start it.**
Minting the authorize URL requires a web session for the same reason the
panel's token endpoint does: a route that hands out a redirect binding a
*named* organization to whoever completes it is a route worth being strict
about. The `state` is signed and carries the organization, so a callback
cannot be replayed against a different one.

Every failure here is a sentence. « Microsoft is not configured on this
server » and « Microsoft would not renew this connection » are different
problems with different fixes, and a screen that showed either as a 500
would leave a banker with nothing to do.
"""

from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, Query

from polar.auth.dependencies import WebUserRead, WebUserWrite
from polar.config import settings
from polar.exceptions import ResourceNotFound
from polar.kit.db.postgres import AsyncReadSession, AsyncSession
from polar.models import ConnectedFolder, Connection
from polar.openapi import APITag
from polar.postgres import get_db_read_session, get_db_session
from polar.routing import APIRouter
from polar.tieout.ingest import kind_for

from .graph import GraphError, authorize_url, configured
from .repository import ConnectorRepository
from .schemas import (
    ConnectionRead,
    ConnectorState,
    DriveRead,
    FolderRead,
    ItemRead,
    PointAt,
)
from .service import ConnectorError, connector
from .state import sign, unsign

router = APIRouter(prefix="/connector", tags=["connector", APITag.private])


#: Where Microsoft sends the browser back to. Fixed here rather than taken
#: from the request: a redirect URI a caller can name is a way to send
#: somebody else's authorization code somewhere it should not go, and it
#: has to match what is registered on the application anyway.
def redirect_uri() -> str:
    return f"{settings.BASE_URL}/v1/connector/microsoft/callback"


def _connection(connection: Connection) -> ConnectionRead:
    return ConnectionRead(
        id=connection.id,
        provider=connection.provider,
        status=connection.status,
        account_name=connection.account_name,
        account_email=connection.account_email,
        error=connection.error,
        connected_at=connection.created_at,
    )


def _folder(folder: ConnectedFolder, connection: Connection | None) -> FolderRead:
    return FolderRead(
        id=folder.id,
        drive_id=folder.drive_id,
        item_id=folder.item_id,
        name=folder.name,
        path=folder.path,
        site_name=folder.site_name,
        connection=_connection(connection) if connection else None,
        last_synced_at=folder.last_synced_at,
        last_result=folder.last_result or {},
        error=folder.error,
    )


async def _deal(
    session: AsyncSession | AsyncReadSession, dossier_id: UUID, user_id: UUID
) -> Any:
    """The deal, if the caller is on it. Otherwise 404, exactly as tie-out."""
    from polar.dossier.repository import DossierRepository

    deal = await DossierRepository.from_session(session).get_for_user(
        dossier_id, user_id
    )
    if deal is None:
        raise ResourceNotFound("Deal not found.")
    return deal


# --- the connection ------------------------------------------------------


@router.get("/state", response_model=ConnectorState)
async def get_state(
    auth_subject: WebUserRead,
    organization_id: UUID = Query(),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ConnectorState:
    """Whether a store can be connected, and whether one is.

    Three answers, and they are different sentences: this server has no
    Microsoft application, nobody has connected one, or here it is.
    """
    connection = await connector.connection_for(
        session, organization_id=organization_id, user_id=auth_subject.subject.id
    )
    return ConnectorState(
        configured=configured(),
        connection=_connection(connection) if connection else None,
        authorize_url=(
            f"{settings.BASE_URL}/v1/connector/microsoft/authorize"
            f"?organization_id={organization_id}"
            if configured()
            else None
        ),
    )


@router.get("/microsoft/authorize", response_model=None)
async def start(
    auth_subject: WebUserWrite,
    organization_id: UUID = Query(),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Any:
    """Send the browser to Microsoft.

    A web session only, and the state is signed with the organization *and*
    the person in it, so the code that comes back cannot be completed
    against anything else.
    """
    from fastapi.responses import RedirectResponse

    if not configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "Microsoft is not configured on this server, so SharePoint "
                "cannot be connected here."
            ),
        )
    state = sign(
        {
            "organization_id": str(organization_id),
            "user_id": str(auth_subject.subject.id),
        }
    )
    return RedirectResponse(authorize_url(state, redirect_uri()))


@router.get("/microsoft/callback", response_model=None)
async def callback(
    state: str = Query(),
    code: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> Any:
    """Where Microsoft sends the browser back.

    **No session dependency, and the state is what authorizes it.** The
    browser arriving here is Microsoft's redirect and may not carry the
    cookie at all — `SameSite` on a cross-site redirect is exactly the
    trap the panel's token flow was written around. The signed state is
    the credential: it names the organization and the person, it was
    minted by a route that required a web session, and it cannot be
    forged or edited.
    """
    from fastapi.responses import RedirectResponse

    try:
        claims = unsign(state)
    except ValueError as problem:
        raise HTTPException(
            status_code=400,
            detail=(
                "That sign-in link is not valid any more. Start again from "
                "the SharePoint screen."
            ),
        ) from problem

    landing = f"{settings.FRONTEND_BASE_URL}/dashboard"
    if error_description or not code:
        # Microsoft's own sentence — « the user cancelled », « admin
        # consent required » — carried back rather than swallowed.
        return RedirectResponse(
            f"{landing}?connector=failed&reason={error_description or 'no code'}"
        )

    try:
        await connector.complete(
            session,
            organization_id=UUID(claims["organization_id"]),
            user_id=UUID(claims["user_id"]),
            code=code,
            redirect_uri=redirect_uri(),
        )
    except GraphError as problem:
        return RedirectResponse(f"{landing}?connector=failed&reason={problem}")
    return RedirectResponse(f"{landing}?connector=connected")


@router.delete("/connections/{connection_id}", status_code=204)
async def disconnect(
    connection_id: UUID,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Stop using it, and forget the token.

    Only the person whose access it is. A connection is delegated: it
    reaches what *they* can open, and somebody else revoking it is not the
    same act as them revoking it.
    """
    repository = ConnectorRepository.from_session(session)
    connection = await repository.get(connection_id)
    if connection is None or connection.user_id != auth_subject.subject.id:
        raise ResourceNotFound("Connection not found.")
    await connector.disconnect(session, connection=connection)


# --- browsing ------------------------------------------------------------


@router.get("/drives", response_model=list[DriveRead])
async def list_drives(
    auth_subject: WebUserRead,
    organization_id: UUID = Query(),
    session: AsyncSession = Depends(get_db_session),
) -> list[DriveRead]:
    """The document libraries this person can reach."""
    connection = await _their_connection(session, organization_id, auth_subject)
    try:
        graph = await connector.client_for(session, connection=connection)
        drives = await graph.drives()
    except (ConnectorError, GraphError) as problem:
        raise HTTPException(status_code=502, detail=str(problem)) from problem
    return [DriveRead(id=one.id, name=one.name, owner=one.owner) for one in drives]


@router.get("/drives/{drive_id}/items", response_model=list[ItemRead])
async def list_items(
    drive_id: str,
    auth_subject: WebUserRead,
    organization_id: UUID = Query(),
    item_id: str | None = Query(default=None, description="A folder; root if absent."),
    session: AsyncSession = Depends(get_db_session),
) -> list[ItemRead]:
    """What is in a folder, for the picker.

    Folders first, then files, each saying whether this product could
    actually read it — so the picker is honest about what a sync would
    take before anybody points a deal at it.
    """
    connection = await _their_connection(session, organization_id, auth_subject)
    try:
        graph = await connector.client_for(session, connection=connection)
        items = await graph.children(drive_id, item_id)
    except (ConnectorError, GraphError) as problem:
        raise HTTPException(status_code=502, detail=str(problem)) from problem

    rows = [
        ItemRead(
            id=one.id,
            name=one.name,
            folder=one.folder,
            size=one.size,
            modified_at=one.modified_at,
            modified_by=one.modified_by,
            drive_id=one.drive_id,
            readable=not one.folder and kind_for(one.name) is not None,
            content_tag=one.ctag,
        )
        for one in items
    ]
    rows.sort(key=lambda one: (not one.folder, one.name.lower()))
    return rows


# --- a deal's folder -----------------------------------------------------


@router.get("/deals/{dossier_id}/folder", response_model=FolderRead | None)
async def get_folder(
    dossier_id: UUID,
    auth_subject: WebUserRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> FolderRead | None:
    """Where this deal's files come from. `null` when nobody has said."""
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = ConnectorRepository.from_session(session)
    folder = await repository.folder_of(dossier_id)
    if folder is None:
        return None
    return _folder(folder, await repository.get(folder.connection_id))


@router.get("/deals/{dossier_id}/held", response_model=dict[str, str])
async def held(
    dossier_id: UUID,
    auth_subject: WebUserRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> dict[str, str]:
    """What this deal already holds from the store, keyed by the store's id.

    The value is the content tag it was read at, which is what turns a
    library listing into a status column: the same tag is « synced », a
    different one is « changed », and an id that is not here at all has
    never been read. The deal's *documents* are not enough to answer that —
    a deal room is tens of files and only three of them are the model, the
    deck and the memo.
    """
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = ConnectorRepository.from_session(session)
    return {
        external_id: artifact.external_version or ""
        for external_id, artifact in (
            await repository.artifacts_by_external_id(dossier_id)
        ).items()
    }


@router.put("/deals/{dossier_id}/folder", response_model=FolderRead)
async def point_at(
    dossier_id: UUID,
    body: PointAt,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> FolderRead:
    """« This deal's files are in that folder. »"""
    deal = await _deal(session, dossier_id, auth_subject.subject.id)
    connection = await _their_connection(session, deal.organization_id, auth_subject)
    try:
        folder = await connector.point(
            session,
            dossier_id=dossier_id,
            connection=connection,
            drive_id=body.drive_id,
            item_id=body.item_id,
        )
    except ConnectorError as problem:
        raise HTTPException(status_code=422, detail=str(problem)) from problem
    return _folder(folder, connection)


@router.delete("/deals/{dossier_id}/folder", status_code=204)
async def stop_watching(
    dossier_id: UUID,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Stop watching. Everything already read stays in the deal."""
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = ConnectorRepository.from_session(session)
    folder = await repository.folder_of(dossier_id)
    if folder is None:
        raise ResourceNotFound("This deal is not connected to a folder.")
    await connector.unpoint(session, folder=folder)


@router.post("/deals/{dossier_id}/sync", response_model=FolderRead)
async def sync_now(
    dossier_id: UUID,
    auth_subject: WebUserWrite,
    session: AsyncSession = Depends(get_db_session),
) -> FolderRead:
    """Read what has changed, and re-check the deal.

    Inline, like ingestion, and for the same reason: a deal room is tens
    of documents and the shape is already right for the day it moves
    behind the worker.
    """
    await _deal(session, dossier_id, auth_subject.subject.id)
    repository = ConnectorRepository.from_session(session)
    folder = await repository.folder_of(dossier_id)
    if folder is None:
        raise ResourceNotFound("This deal is not connected to a folder.")
    try:
        await connector.sync(session, folder=folder, user_id=auth_subject.subject.id)
    except ConnectorError as problem:
        raise HTTPException(status_code=502, detail=str(problem)) from problem
    return _folder(folder, await repository.get(folder.connection_id))


async def _their_connection(
    session: AsyncSession | AsyncReadSession, organization_id: UUID, auth_subject: Any
) -> Connection:
    connection = await connector.connection_for(
        session, organization_id=organization_id, user_id=auth_subject.subject.id
    )
    if connection is None:
        raise HTTPException(
            status_code=428,
            detail=(
                "Nothing is connected yet. Connect Microsoft from the "
                "SharePoint screen and this deal can read the site directly."
            ),
        )
    return connection


__all__ = ["router"]
