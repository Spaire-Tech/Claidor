import secrets
from collections.abc import Sequence
from uuid import UUID

import structlog
from slugify import slugify
from sqlalchemy import asc, desc

from polar.auth.models import AuthSubject, Organization, User
from polar.custom_field.data import validate_custom_field_data
from polar.custom_field.schemas import AttachedCustomFieldCreate
from polar.custom_field.service import custom_field as custom_field_service
from polar.email_subscriber.service import (
    email_subscriber as email_subscriber_service,
)
from polar.entitlements.exceptions import TierLimitReachedError
from polar.exceptions import SpaireRequestValidationError, ValidationError
from polar.file.repository import FileRepository
from polar.file.service import file as file_service
from polar.kit.pagination import PaginationParams
from polar.kit.sorting import Sorting
from polar.models import Form, FormCustomField, FormSubmission
from polar.models.file import FileServiceTypes
from polar.organization.resolver import get_payload_organization
from polar.postgres import AsyncReadSession, AsyncSession
from polar.worker import enqueue_job

from .repository import FormRepository, FormSubmissionRepository
from .schemas import (
    FormCreate,
    FormDownload,
    FormPublic,
    FormSubmit,
    FormSubmitResult,
    FormUpdate,
)
from .sorting import FormSortProperty

log = structlog.get_logger()


class FormService:
    async def list(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        *,
        organization_id: UUID | None = None,
        status: str | None = None,
        query: str | None = None,
        pagination: PaginationParams,
        sorting: list[Sorting[FormSortProperty]],
    ) -> tuple[Sequence[Form], int]:
        repository = FormRepository.from_session(session)
        statement = repository.get_readable_statement(auth_subject)

        if organization_id is not None:
            statement = statement.where(Form.organization_id == organization_id)
        if status is not None:
            statement = statement.where(Form.status == status)
        if query is not None and query.strip():
            statement = statement.where(Form.title.ilike(f"%{query.strip()}%"))

        order_clauses = []
        for criterion, is_desc in sorting:
            clause = desc if is_desc else asc
            if criterion == FormSortProperty.created_at:
                order_clauses.append(clause(Form.created_at))
            elif criterion == FormSortProperty.title:
                order_clauses.append(clause(Form.title))
            elif criterion == FormSortProperty.slug:
                order_clauses.append(clause(Form.slug))
        if order_clauses:
            statement = statement.order_by(*order_clauses)

        return await repository.paginate(
            statement, limit=pagination.limit, page=pagination.page
        )

    async def get(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        id: UUID,
    ) -> Form | None:
        repository = FormRepository.from_session(session)
        return await repository.get_readable_by_id(auth_subject, id)

    async def get_published(self, session: AsyncReadSession, id: UUID) -> Form | None:
        repository = FormRepository.from_session(session)
        return await repository.get_published_by_id(id)

    async def list_published(
        self, session: AsyncReadSession, organization_id: UUID
    ) -> Sequence[Form]:
        repository = FormRepository.from_session(session)
        return await repository.list_published_by_organization(organization_id)

    async def create(
        self,
        session: AsyncSession,
        auth_subject: AuthSubject[User | Organization],
        form_create: FormCreate,
    ) -> Form:
        organization = await get_payload_organization(
            session, auth_subject, form_create
        )
        await self._validate_file(session, organization.id, form_create.file_id)
        slug = await self._resolve_slug(
            session, organization.id, form_create.slug, form_create.title
        )

        form = Form(
            organization=organization,
            slug=slug,
            title=form_create.title,
            subtitle=form_create.subtitle,
            button_label=form_create.button_label,
            success_message=form_create.success_message,
            status=form_create.status,
            file_id=form_create.file_id,
            image_url=form_create.image_url,
            style=form_create.style.model_dump(),
        )
        await self._set_attached_custom_fields(
            session, organization.id, form, form_create.attached_custom_fields
        )

        session.add(form)
        await session.flush()
        return form

    async def update(
        self,
        session: AsyncSession,
        form: Form,
        form_update: FormUpdate,
    ) -> Form:
        organization_id = form.organization_id

        if "file_id" in form_update.model_fields_set:
            await self._validate_file(session, organization_id, form_update.file_id)
            form.file_id = form_update.file_id

        if form_update.slug is not None:
            normalized = slugify(form_update.slug) or form.slug
            if normalized != form.slug:
                repository = FormRepository.from_session(session)
                existing = await repository.get_by_organization_and_slug(
                    organization_id, normalized
                )
                if existing is not None and existing.id != form.id:
                    raise SpaireRequestValidationError(
                        [
                            {
                                "type": "value_error",
                                "loc": ("body", "slug"),
                                "msg": "A form with this slug already exists.",
                                "input": form_update.slug,
                            }
                        ]
                    )
                form.slug = normalized

        data = form_update.model_dump(
            exclude_unset=True,
            exclude={"attached_custom_fields", "slug", "file_id"},
        )
        for attr, value in data.items():
            setattr(form, attr, value)

        if form_update.attached_custom_fields is not None:
            await self._set_attached_custom_fields(
                session, organization_id, form, form_update.attached_custom_fields
            )

        session.add(form)
        await session.flush()
        return form

    async def delete(self, session: AsyncSession, form: Form) -> Form:
        form.set_deleted_at()
        session.add(form)
        return form

    async def list_submissions(
        self,
        session: AsyncReadSession,
        form: Form,
        *,
        pagination: PaginationParams,
    ) -> tuple[Sequence[FormSubmission], int]:
        repository = FormSubmissionRepository.from_session(session)
        statement = (
            repository.get_base_statement()
            .where(FormSubmission.form_id == form.id)
            .order_by(FormSubmission.created_at.desc())
        )
        return await repository.paginate(
            statement, limit=pagination.limit, page=pagination.page
        )

    async def submit(
        self, session: AsyncSession, form: Form, form_submit: FormSubmit
    ) -> FormSubmitResult:
        custom_field_data = validate_custom_field_data(
            form.attached_custom_fields,
            form_submit.custom_field_data,
            error_loc_prefix=("body", "custom_field_data"),
        )

        email = form_submit.email.lower().strip()

        subscriber_id: UUID | None = None
        try:
            subscriber = await email_subscriber_service.subscribe_from_form(
                session,
                organization_id=form.organization_id,
                email=email,
                name=form_submit.name,
                form_id=form.id,
            )
            subscriber_id = subscriber.id
        except TierLimitReachedError:
            # Over the subscriber cap: still capture the submission and deliver
            # the magnet — failing the visitor would be a worse outcome than
            # the creator simply not gaining a new list contact until they
            # upgrade.
            log.info(
                "form.subscriber_cap_reached",
                form_id=str(form.id),
                organization_id=str(form.organization_id),
            )

        submission = FormSubmission(
            form_id=form.id,
            organization_id=form.organization_id,
            email=email,
            name=form_submit.name,
            email_subscriber_id=subscriber_id,
            custom_field_data=custom_field_data,
        )
        session.add(submission)
        await session.flush()

        download: FormDownload | None = None
        if form.file_id is not None and form.file is not None:
            url, expires_at = file_service.generate_download_url(form.file)
            download = FormDownload(url=url, expires_at=expires_at)
            # Deliver a fresh link by email too (the inline one above can expire
            # before the visitor checks their inbox).
            enqueue_job(
                "form.deliver_lead_magnet",
                form_id=form.id,
                email=email,
                name=form_submit.name,
            )

        return FormSubmitResult(
            success=True,
            success_message=form.success_message,
            download=download,
        )

    def build_public(self, form: Form) -> FormPublic:
        has_lead_magnet = form.file_id is not None and form.file is not None
        return FormPublic.model_validate(
            {
                "id": form.id,
                "organization_id": form.organization_id,
                "title": form.title,
                "subtitle": form.subtitle,
                "button_label": form.button_label,
                "success_message": form.success_message,
                "has_lead_magnet": has_lead_magnet,
                "lead_magnet_name": form.file.name if has_lead_magnet else None,
                "image_url": form.image_url,
                "style": form.style,
                "attached_custom_fields": form.attached_custom_fields,
            }
        )

    async def _validate_file(
        self, session: AsyncSession, organization_id: UUID, file_id: UUID | None
    ) -> None:
        if file_id is None:
            return
        repository = FileRepository.from_session(session)
        files = await repository.get_uploaded_by_ids_in_org(
            organization_id, {file_id}, service=FileServiceTypes.downloadable
        )
        if len(files) == 0:
            raise SpaireRequestValidationError(
                [
                    {
                        "type": "value_error",
                        "loc": ("body", "file_id"),
                        "msg": (
                            "File does not exist, is not yet uploaded, or is not "
                            "a downloadable file."
                        ),
                        "input": str(file_id),
                    }
                ]
            )

    async def _set_attached_custom_fields(
        self,
        session: AsyncSession,
        organization_id: UUID,
        form: Form,
        attached_custom_fields: Sequence[AttachedCustomFieldCreate],
    ) -> None:
        errors: list[ValidationError] = []
        resolved: list[FormCustomField] = []
        for order, attached in enumerate(attached_custom_fields):
            custom_field = await custom_field_service.get_by_organization_and_id(
                session, attached.custom_field_id, organization_id
            )
            if custom_field is None:
                errors.append(
                    {
                        "type": "value_error",
                        "loc": ("body", "attached_custom_fields", order),
                        "msg": "Custom field does not exist.",
                        "input": str(attached.custom_field_id),
                    }
                )
                continue
            resolved.append(
                FormCustomField(
                    custom_field=custom_field,
                    order=order,
                    required=attached.required,
                )
            )
        if errors:
            raise SpaireRequestValidationError(errors)
        form.attached_custom_fields = resolved

    async def _resolve_slug(
        self,
        session: AsyncSession,
        organization_id: UUID,
        provided: str | None,
        title: str,
    ) -> str:
        repository = FormRepository.from_session(session)
        base = (slugify(provided) if provided else slugify(title)) or "form"
        base = base[:200]
        candidate = base
        for _ in range(5):
            existing = await repository.get_by_organization_and_slug(
                organization_id, candidate
            )
            if existing is None:
                return candidate
            candidate = f"{base}-{secrets.token_hex(3)}"
        return f"{base}-{secrets.token_hex(6)}"


form = FormService()
