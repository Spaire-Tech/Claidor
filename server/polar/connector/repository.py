"""All connector database access.

Two tables and a lookup into a third. The lookup is the interesting one:
`artifacts_by_external_id` is what makes a sync able to tell « this is the
model again » from « this is a new document », which is the whole reason
the drive item id is stored.
"""

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select

from polar.kit.repository import RepositoryBase
from polar.models import (
    Artifact,
    ConnectedFolder,
    Connection,
    ConnectionProvider,
    ConnectionStatus,
)


class ConnectorRepository(RepositoryBase[Connection]):
    model = Connection

    async def get(self, connection_id: UUID) -> Connection | None:
        statement = select(Connection).where(
            Connection.id == connection_id, Connection.deleted_at.is_(None)
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def for_user(
        self, organization_id: UUID, user_id: UUID, provider: ConnectionProvider
    ) -> Connection | None:
        statement = (
            select(Connection)
            .where(
                Connection.organization_id == organization_id,
                Connection.user_id == user_id,
                Connection.provider == provider,
                Connection.deleted_at.is_(None),
            )
            .order_by(Connection.created_at.desc())
            .limit(1)
        )
        return (await self.session.execute(statement)).scalars().first()

    async def active_in(self, organization_id: UUID) -> Sequence[Connection]:
        statement = select(Connection).where(
            Connection.organization_id == organization_id,
            Connection.status == ConnectionStatus.active,
            Connection.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalars().all()

    async def save(self, connection: Connection) -> Connection:
        self.session.add(connection)
        await self.session.flush()
        return connection

    # --- folders --------------------------------------------------------

    async def folder_of(self, dossier_id: UUID) -> ConnectedFolder | None:
        statement = select(ConnectedFolder).where(
            ConnectedFolder.dossier_id == dossier_id,
            ConnectedFolder.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalar_one_or_none()

    async def folders_of(self, connection_id: UUID) -> Sequence[ConnectedFolder]:
        statement = select(ConnectedFolder).where(
            ConnectedFolder.connection_id == connection_id,
            ConnectedFolder.deleted_at.is_(None),
        )
        return (await self.session.execute(statement)).scalars().all()

    async def save_folder(self, folder: ConnectedFolder) -> ConnectedFolder:
        self.session.add(folder)
        await self.session.flush()
        return folder

    async def delete_folder(self, folder: ConnectedFolder) -> None:
        folder.set_deleted_at()
        self.session.add(folder)
        await self.session.flush()

    # --- what the sync has already read ---------------------------------

    async def artifacts_by_external_id(self, dossier_id: UUID) -> dict[str, Artifact]:
        """The newest version of each document that came from a store.

        Keyed by the store's own id, which is what a sync compares against:
        same item, same content tag, nothing to do. Newest only — an older
        version's content tag is the answer to a question nobody asked, and
        matching against it would re-read every file on every sync.
        """
        statement = (
            select(Artifact)
            .where(
                Artifact.dossier_id == dossier_id,
                Artifact.external_id.is_not(None),
                Artifact.deleted_at.is_(None),
            )
            .order_by(Artifact.version.asc())
        )
        found: dict[str, Artifact] = {}
        for artifact in (await self.session.execute(statement)).scalars().all():
            if artifact.external_id:
                found[artifact.external_id] = artifact
        return found


__all__ = ["ConnectorRepository"]
