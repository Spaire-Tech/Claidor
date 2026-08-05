import uuid
from collections.abc import Sequence
from datetime import datetime

import structlog

from polar.auth.models import AuthSubject
from polar.kit.pagination import PaginationParams
from polar.models import Organization, ProductMedia, User
from polar.models.file import File, FileServiceTypes, ProductMediaFile
from polar.postgres import AsyncReadSession, AsyncSession, sql
from polar.quotas.definitions import QuotaKey
from polar.quotas.producers import emit_storage_delta, enforce

from .repository import FileRepository
from .s3 import S3_SERVICES
from .schemas import (
    FileCreate,
    FileDownload,
    FilePatch,
    FileUpload,
    FileUploadCompleted,
)

log = structlog.get_logger()

# Branding / storefront-chrome images (profile picture, storefront banner,
# link cover) are small, public assets required for basic profile setup. They
# must never be gated by — or counted against — the course-content storage
# quota. Otherwise a creator can't even set a profile picture until they pick a
# plan: a brand-new org resolves to the `inactive` tier (storage_gb=0) during
# onboarding, so the storage check would reject every avatar upload.
STORAGE_EXEMPT_SERVICES: frozenset[FileServiceTypes] = frozenset(
    {
        FileServiceTypes.organization_avatar,
        FileServiceTypes.storefront_header,
        FileServiceTypes.storefront_link,
    }
)


class FileService:
    async def list(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        *,
        organization_id: Sequence[uuid.UUID] | None = None,
        ids: Sequence[uuid.UUID] | None = None,
        pagination: PaginationParams,
    ) -> tuple[Sequence[File], int]:
        repository = FileRepository.from_session(session)

        statement = repository.get_readable_statement(auth_subject).where(
            File.is_uploaded.is_(True)
        )

        if organization_id is not None:
            statement = statement.where(File.organization_id.in_(organization_id))

        if ids is not None:
            statement = statement.where(File.id.in_(ids))

        return await repository.paginate(
            statement, limit=pagination.limit, page=pagination.page
        )

    async def get(
        self,
        session: AsyncSession,
        auth_subject: AuthSubject[User | Organization],
        id: uuid.UUID,
    ) -> File | None:
        repository = FileRepository.from_session(session)
        statement = repository.get_readable_statement(auth_subject).where(File.id == id)
        return await repository.get_one_or_none(statement)

    async def patch(
        self,
        session: AsyncSession,
        *,
        file: File,
        patches: FilePatch,
    ) -> File:
        changes = False
        if patches.name:
            file.name = patches.name
            changes = True

        if patches.version:
            file.version = patches.version
            changes = True

        if not changes:
            return file

        session.add(file)
        await session.flush()
        return file

    async def generate_presigned_upload(
        self,
        session: AsyncSession,
        *,
        organization: Organization,
        create_schema: FileCreate,
    ) -> FileUpload:
        # Block uploads that would push the org past its tier's storage cap.
        # Done before creating the S3 multipart upload to avoid leaving
        # orphaned uploads on quota failures. Best-effort under concurrent
        # uploads — see polar/quotas/producers.py:enforce. Branding/storefront
        # chrome images are exempt (see STORAGE_EXEMPT_SERVICES).
        if create_schema.service not in STORAGE_EXEMPT_SERVICES:
            await enforce(
                session,
                organization,
                QuotaKey.storage_gb,
                requested_storage_units=create_schema.size,
            )

        s3_service = S3_SERVICES[create_schema.service]
        upload = s3_service.create_multipart_upload(
            create_schema, namespace=create_schema.service.value
        )

        instance = File(
            organization=organization,
            service=create_schema.service,
            is_enabled=True,
            is_uploaded=False,
            **upload.model_dump(exclude={"upload", "organization_id", "size_readable"}),
        )
        session.add(instance)
        await session.flush()
        assert instance.id is not None

        return FileUpload(
            is_uploaded=instance.is_uploaded,
            version=instance.version,
            service=create_schema.service,
            **upload.model_dump(),
        )

    async def complete_upload(
        self,
        session: AsyncSession,
        *,
        file: File,
        completed_schema: FileUploadCompleted,
    ) -> File:
        s3_service = S3_SERVICES[file.service]
        s3file = s3_service.complete_multipart_upload(completed_schema)

        file.is_uploaded = True

        if s3file.checksum_etag:
            file.checksum_etag = s3file.checksum_etag

        if s3file.last_modified_at:
            file.last_modified_at = s3file.last_modified_at

        if s3file.storage_version:
            file.storage_version = s3file.storage_version

        session.add(file)
        await session.flush()
        assert file.checksum_etag is not None
        assert file.last_modified_at is not None

        # Record the storage usage now that the upload has succeeded.
        # Emitting only on completion (not generate_presigned_upload)
        # avoids counting orphaned/abandoned uploads. Branding/storefront
        # chrome images don't count against the quota (see
        # STORAGE_EXEMPT_SERVICES).
        if file.service not in STORAGE_EXEMPT_SERVICES:
            emit_storage_delta(
                session, organization_id=file.organization_id, bytes_delta=file.size
            )

        return file

    def generate_download_url(self, file: File) -> tuple[str, datetime]:
        """Generate a presigned download URL for a file."""
        s3_service = S3_SERVICES[file.service]
        return s3_service.generate_presigned_download_url(
            path=file.path,
            filename=file.name,
            mime_type=file.mime_type,
        )

    def generate_downloadable_schema(self, file: File) -> FileDownload:
        url, expires_at = self.generate_download_url(file)
        return FileDownload.from_presigned(file, url=url, expires_at=expires_at)

    async def delete(self, session: AsyncSession, *, file: File) -> bool:
        file.set_deleted_at()
        session.add(file)
        assert file.deleted_at is not None

        # Free up the storage quota the file was occupying. Only emit
        # for files that were actually uploaded — abandoned uploads
        # never added storage in the first place. Branding/storefront
        # chrome images were never counted, so don't refund them either.
        if file.is_uploaded and file.service not in STORAGE_EXEMPT_SERVICES:
            emit_storage_delta(
                session,
                organization_id=file.organization_id,
                bytes_delta=-file.size,
            )

        # Delete ProductMedia association table records
        statement = sql.delete(ProductMedia).where(ProductMedia.file_id == file.id)
        await session.execute(statement)

        s3_service = S3_SERVICES[file.service]
        deleted = s3_service.delete_file(file.path)
        log.info("file.delete", file_id=file.id, s3_deleted=deleted)
        return True

    async def get_selectable_product_media_file(
        self,
        session: AsyncSession,
        id: uuid.UUID,
        *,
        organization_id: uuid.UUID,
    ) -> ProductMediaFile | None:
        statement = sql.select(ProductMediaFile).where(
            File.id == id,
            File.organization_id == organization_id,
            File.is_uploaded.is_(True),
            File.is_enabled.is_(True),
            File.deleted_at.is_(None),
        )
        result = await session.execute(statement)
        return result.scalar_one_or_none()


file = FileService()
