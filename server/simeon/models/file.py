from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    TIMESTAMP,
    BigInteger,
    Boolean,
    ForeignKey,
    String,
    Uuid,
)
from sqlalchemy.orm import (
    Mapped,
    declared_attr,
    mapped_column,
    relationship,
)

from simeon.kit.db.models import RecordModel

if TYPE_CHECKING:
    from simeon.models import (
        Organization,
    )


class FileServiceTypes(StrEnum):
    downloadable = "downloadable"
    product_media = "product_media"
    organization_avatar = "organization_avatar"
    storefront_header = "storefront_header"
    storefront_link = "storefront_link"
    # A retired file type: no new file is created with it, and rows made
    # before it was retired stay readable. The stored value is unchanged.
    archived_document = "dossier_document"


class File(RecordModel):
    __tablename__ = "files"

    organization_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("organizations.id", ondelete="cascade"),
        nullable=False,
        index=True,
    )

    @declared_attr
    def organization(cls) -> Mapped["Organization"]:
        return relationship("Organization", lazy="raise")

    name: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str | None] = mapped_column(String, nullable=True)
    path: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)

    service: Mapped[FileServiceTypes] = mapped_column(String, nullable=False)

    last_modified_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=True,
    )

    storage_version: Mapped[str | None] = mapped_column(String, nullable=True)
    checksum_etag: Mapped[str | None] = mapped_column(String, nullable=True)
    checksum_sha256_base64: Mapped[str | None] = mapped_column(String, nullable=True)
    checksum_sha256_hex: Mapped[str | None] = mapped_column(String, nullable=True)

    is_uploaded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Flag for Simeon to disable consumption of file
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __mapper_args__ = {
        "polymorphic_on": "service",
    }


class DownloadableFile(File):
    __mapper_args__ = {
        "polymorphic_identity": FileServiceTypes.downloadable,
    }


class ProductMediaFile(File):
    __mapper_args__ = {
        "polymorphic_identity": FileServiceTypes.product_media,
    }


class OrganizationAvatarFile(File):
    __mapper_args__ = {
        "polymorphic_identity": FileServiceTypes.organization_avatar,
    }


class StorefrontHeaderFile(File):
    __mapper_args__ = {
        "polymorphic_identity": FileServiceTypes.storefront_header,
    }


class StorefrontLinkFile(File):
    __mapper_args__ = {
        "polymorphic_identity": FileServiceTypes.storefront_link,
    }


class ArchivedDocumentFile(File):
    __mapper_args__ = {
        "polymorphic_identity": FileServiceTypes.archived_document,
    }
