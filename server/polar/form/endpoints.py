from uuid import UUID

from fastapi import Depends, Query
from pydantic import UUID4

from polar.exceptions import ResourceNotFound
from polar.kit.pagination import ListResource, PaginationParamsQuery
from polar.models import Form
from polar.openapi import APITag
from polar.postgres import (
    AsyncReadSession,
    AsyncSession,
    get_db_read_session,
    get_db_session,
)
from polar.routing import APIRouter

from . import auth, sorting
from .schemas import Form as FormSchema
from .schemas import (
    FormCreate,
    FormPublic,
    FormSubmit,
    FormSubmitResult,
    FormUpdate,
)
from .schemas import FormSubmission as FormSubmissionSchema
from .service import form as form_service

router = APIRouter(prefix="/forms", tags=["forms", APITag.private])

FormNotFound = {
    "description": "Form not found.",
    "model": ResourceNotFound.schema(),
}


@router.get("/", summary="List Forms", response_model=ListResource[FormSchema])
async def list_forms(
    auth_subject: auth.FormsRead,
    pagination: PaginationParamsQuery,
    sorting: sorting.ListSorting,
    organization_id: UUID4 | None = Query(
        None, description="Filter by organization ID."
    ),
    status: str | None = Query(None, description="Filter by status."),
    query: str | None = Query(None, description="Filter by title."),
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[FormSchema]:
    """List lead-magnet forms."""
    results, count = await form_service.list(
        session,
        auth_subject,
        organization_id=organization_id,
        status=status,
        query=query,
        pagination=pagination,
        sorting=sorting,
    )
    return ListResource.from_paginated_results(
        [FormSchema.model_validate(result) for result in results],
        count,
        pagination,
    )


@router.post(
    "/",
    summary="Create Form",
    response_model=FormSchema,
    status_code=201,
)
async def create_form(
    form_create: FormCreate,
    auth_subject: auth.FormsWrite,
    session: AsyncSession = Depends(get_db_session),
) -> Form:
    """Create a lead-magnet form."""
    return await form_service.create(session, auth_subject, form_create)


@router.get(
    "/{id}",
    summary="Get Form",
    response_model=FormSchema,
    responses={404: FormNotFound},
)
async def get_form(
    id: UUID,
    auth_subject: auth.FormsRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Form:
    """Get a form by ID."""
    form = await form_service.get(session, auth_subject, id)
    if form is None:
        raise ResourceNotFound()
    return form


@router.patch(
    "/{id}",
    summary="Update Form",
    response_model=FormSchema,
    responses={404: FormNotFound},
)
async def update_form(
    id: UUID,
    form_update: FormUpdate,
    auth_subject: auth.FormsWrite,
    session: AsyncSession = Depends(get_db_session),
) -> Form:
    """Update a form."""
    form = await form_service.get(session, auth_subject, id)
    if form is None:
        raise ResourceNotFound()
    return await form_service.update(session, form, form_update)


@router.delete(
    "/{id}",
    summary="Delete Form",
    status_code=204,
    responses={404: FormNotFound},
)
async def delete_form(
    id: UUID,
    auth_subject: auth.FormsWrite,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a form."""
    form = await form_service.get(session, auth_subject, id)
    if form is None:
        raise ResourceNotFound()
    await form_service.delete(session, form)


@router.get(
    "/{id}/submissions",
    summary="List Form Submissions",
    response_model=ListResource[FormSubmissionSchema],
    responses={404: FormNotFound},
)
async def list_form_submissions(
    id: UUID,
    auth_subject: auth.FormsRead,
    pagination: PaginationParamsQuery,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[FormSubmissionSchema]:
    """List submissions for a form."""
    form = await form_service.get(session, auth_subject, id)
    if form is None:
        raise ResourceNotFound()
    results, count = await form_service.list_submissions(
        session, form, pagination=pagination
    )
    return ListResource.from_paginated_results(
        [FormSubmissionSchema.model_validate(result) for result in results],
        count,
        pagination,
    )


@router.get(
    "/{id}/public",
    summary="Get Public Form",
    response_model=FormPublic,
    responses={404: FormNotFound},
)
async def get_public_form(
    id: UUID,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> FormPublic:
    """Public endpoint: get a published form's renderable definition."""
    form = await form_service.get_published(session, id)
    if form is None:
        raise ResourceNotFound()
    return form_service.build_public(form)


@router.post(
    "/{id}/submit",
    summary="Submit Form",
    response_model=FormSubmitResult,
    status_code=201,
    responses={404: FormNotFound},
)
async def submit_form(
    id: UUID,
    form_submit: FormSubmit,
    session: AsyncSession = Depends(get_db_session),
) -> FormSubmitResult:
    """Public endpoint: submit a form. Enrolls the email as a subscriber and,
    when the form has a lead magnet, returns an immediate download link and
    emails one."""
    form = await form_service.get_published(session, id)
    if form is None:
        raise ResourceNotFound()
    return await form_service.submit(session, form, form_submit)
