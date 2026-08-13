"""A connected file store, and the folder a deal's documents live in.

Until now a document arrived because somebody dragged it into the data
room. That is fine for the first deal and wrong for every one after it:
the model does not live in this product, it lives in the deal room, and it
is replaced on a Tuesday afternoon by somebody who has never heard of us.
A deck checked against last week's model is worse than one nobody
checked, because it comes with a clean bill of health.

Two rows, and they answer two different questions.

**`Connection` is « who can read that store ».** One person's delegated
access to Microsoft Graph — their token, their permissions, their name on
it. Not the organization's: an application-level grant needs a tenant
administrator, and a product that cannot be tried until IT approves it is
a product nobody tries. What it costs is honesty about whose access it is,
which the screen carries — « connected by R. Duval » — and a state for the
day they leave.

**`ConnectedFolder` is « where this deal's files are ».** A deal points at
one folder in one drive, and the sync pulls what is in it. The folder is
identified by drive id and item id rather than by a path, because a path
is a name somebody can change and an item id is not.

**Identity, at last, is not a filename.** `Artifact.external_id` carries
the drive item id, so « the model » is the same document after it has been
renamed, and two files called `Model.xlsx` in different folders are two
documents. The filename guess that `find_lineage` makes was always a
stand-in for this, and it stays for hand-uploaded files, which have no
better answer.
"""

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel
from polar.kit.extensions.sqlalchemy import StrEnumType

if TYPE_CHECKING:
    from polar.models import Dossier, Organization, User


class ConnectionProvider(StrEnum):
    #: Microsoft Graph — SharePoint document libraries and OneDrive. One
    #: provider covers both because Graph does: a SharePoint library *is*
    #: a drive, and the only difference is which drive you ask for.
    microsoft = "microsoft"


class ConnectionStatus(StrEnum):
    active = "active"
    #: The refresh token stopped working — the password changed, the grant
    #: was revoked, the person left. Recoverable by connecting again, and
    #: the screen says so in those words.
    expired = "expired"
    #: Disconnected here, on purpose.
    revoked = "revoked"


class Connection(RecordModel):
    """One person's access to one file store."""

    __tablename__ = "connections"
    __table_args__ = (
        Index("ix_connections_organization_provider", "organization_id", "provider"),
    )

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:
        return relationship("Organization", lazy="raise")

    #: Whose access this is. The token is theirs, and everything read
    #: through it is read as them — which is the property that makes a
    #: delegated connector safe to offer without an administrator: it can
    #: reach exactly what they can already open.
    user_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="cascade"), nullable=False, index=True
    )

    @declared_attr
    def user(cls) -> Mapped["User"]:
        return relationship("User", lazy="raise")

    provider: Mapped[ConnectionProvider] = mapped_column(
        StrEnumType(ConnectionProvider, length=32), nullable=False
    )
    status: Mapped[ConnectionStatus] = mapped_column(
        StrEnumType(ConnectionStatus, length=16),
        nullable=False,
        default=ConnectionStatus.active,
        index=True,
    )

    #: Who the store thinks this is, for a screen that has to say whose
    #: access a deal is standing on.
    account_name: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    account_email: Mapped[str] = mapped_column(String(320), nullable=False, default="")
    tenant: Mapped[str] = mapped_column(String(128), nullable=False, default="")

    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    expires_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: What was actually granted. Asked for is not the same as given, and a
    #: sync that fails on a permission is a sentence about scopes rather
    #: than a stack trace.
    scopes: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    #: Why it stopped working, in the words the store used.
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)


class ConnectedFolder(RecordModel):
    """« This deal's files are in that folder », and what has been read.

    One deal, one folder, deliberately. A deal room with subfolders is
    handled by reading them; a deal pointing at three separate places is a
    thing to want later and a thing to get wrong now.
    """

    __tablename__ = "connected_folders"
    __table_args__ = (
        UniqueConstraint("dossier_id", name="uq_connected_folders_dossier"),
    )

    dossier_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("dossiers.id", ondelete="cascade"), nullable=False, index=True
    )

    @declared_attr
    def dossier(cls) -> Mapped["Dossier"]:
        return relationship("Dossier", lazy="raise")

    connection_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("connections.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    @declared_attr
    def connection(cls) -> Mapped["Connection"]:
        return relationship("Connection", lazy="raise")

    #: Where it is, in the store's own coordinates. Never a path: a path is
    #: a name somebody renames on a Friday, and an item id is not.
    drive_id: Mapped[str] = mapped_column(String(512), nullable=False)
    item_id: Mapped[str] = mapped_column(String(512), nullable=False)
    #: What to call it on screen, and where it sits — for a person, never
    #: for a lookup.
    name: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    path: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: The site or drive it belongs to, for the same reason.
    site_name: Mapped[str] = mapped_column(String(512), nullable=False, default="")

    #: Which workbook is *the* model, when the folder holds more than one
    #: — chosen when the deal is made, by the person who knows. A deal
    #: room usually carries the operating model beside its working copies,
    #: sensitivities and comps, and reconciling the deck against all four
    #: reports the working copy's every difference as a finding. Null
    #: means nobody chose, and every workbook is read — the behaviour a
    #: one-workbook folder always has. The store's item id, so a rename
    #: does not un-choose it.
    model_item_id: Mapped[str | None] = mapped_column(
        String(512), nullable=True, default=None
    )

    last_synced_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True, default=None
    )
    #: What the last sync did, for the screen: how many were read, how many
    #: were already current, and what was skipped with the reason.
    last_result: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)


__all__ = [
    "ConnectedFolder",
    "Connection",
    "ConnectionProvider",
    "ConnectionStatus",
]
