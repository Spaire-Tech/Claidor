"""What the connector screens are built against."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from polar.kit.schemas import Schema
from polar.models import ConnectionProvider, ConnectionStatus


class ConnectionRead(Schema):
    """A connected file store, and whose access it is.

    The account is on it deliberately. A deal syncing through somebody's
    credentials is a fact the team should be able to see — both because it
    stops working when they leave, and because « why can this product read
    our deal room » should never be a question without an answer on screen.
    """

    id: UUID
    provider: ConnectionProvider
    status: ConnectionStatus
    account_name: str
    account_email: str
    #: Why it stopped, in the store's own words. Present on `expired`.
    error: str | None
    connected_at: datetime


class ConnectorState(Schema):
    """What the SharePoint screen asks for before it draws anything.

    Three states, and they are different sentences: this server has no
    Microsoft application at all, nobody has connected one, or here is the
    connection. A screen that could not tell the first two apart would
    offer a button that cannot work.
    """

    configured: bool
    connection: ConnectionRead | None
    #: Where to send somebody to connect. Null when it is not configured.
    authorize_url: str | None


class DriveRead(Schema):
    id: str
    name: str
    #: The site or account it belongs to — « Rothmoor Deals », « Your
    #: OneDrive » — because two libraries called Documents are ordinary.
    owner: str


class ItemRead(Schema):
    id: str
    name: str
    folder: bool
    size: int
    modified_at: str
    modified_by: str
    drive_id: str
    #: Whether this product could read it if it were pulled in — a `.pptx`
    #: yes, a `.zip` no. Shown so the folder picker is honest about what a
    #: sync would actually take.
    readable: bool


class FolderRead(Schema):
    """Where a deal's files are, and what the last sync made of it."""

    id: UUID
    drive_id: str
    item_id: str
    name: str
    path: str
    site_name: str
    connection: ConnectionRead | None
    last_synced_at: datetime | None
    #: `read`, `unchanged`, `failed`, and everything skipped with a reason.
    #: A sync that read four of fifty files and reported « 4 » would be
    #: deciding on its own that the other forty-six do not matter.
    last_result: dict[str, Any] = Field(default_factory=dict)
    error: str | None


class PointAt(Schema):
    drive_id: str
    item_id: str


__all__ = [
    "ConnectionRead",
    "ConnectorState",
    "DriveRead",
    "FolderRead",
    "ItemRead",
    "PointAt",
]
