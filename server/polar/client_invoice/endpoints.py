from fastapi import Depends, HTTPException
from fastapi.responses import Response
from pydantic import UUID4

from polar.exceptions import ResourceNotFound
from polar.kit.pagination import ListResource, PaginationParamsQuery
from polar.openapi import APITag
from polar.postgres import (
    AsyncReadSession,
    AsyncSession,
    get_db_read_session,
    get_db_session,
)
from polar.routing import APIRouter

from . import auth, sorting
from .schemas import ClientInvoiceCreate, ClientInvoicePreviewRequest, ClientInvoiceSchema
from .service import (
    ClientInvoiceAlreadyVoided,
    ClientInvoiceCannotMarkPaid,
    ClientInvoiceError,
    ClientInvoiceNotDraft,
    client_invoice as client_invoice_service,
)

router = APIRouter(
    prefix="/client-invoices",
    tags=["client_invoices", APITag.public],
)


@router.get(
    "/",
    summary="List Client Invoices",
    response_model=ListResource[ClientInvoiceSchema],
)
async def list_client_invoices(
    auth_subject: auth.ClientInvoicesRead,
    pagination: PaginationParamsQuery,
    sorting: sorting.ListSorting,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ListResource[ClientInvoiceSchema]:
    """List client invoices for the authenticated organization."""
    results, count = await client_invoice_service.list(
        session,
        auth_subject,
        pagination=pagination,
        sorting=sorting,
    )
    return ListResource.from_paginated_results(
        [ClientInvoiceSchema.model_validate(result) for result in results],
        count,
        pagination,
    )


@router.post(
    "/",
    summary="Create Client Invoice",
    response_model=ClientInvoiceSchema,
    status_code=201,
)
async def create_client_invoice(
    create_schema: ClientInvoiceCreate,
    auth_subject: auth.ClientInvoicesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> ClientInvoiceSchema:
    """Create a new draft client invoice. Tax is calculated automatically."""
    try:
        invoice = await client_invoice_service.create_draft(
            session, auth_subject, create_schema
        )
    except ClientInvoiceError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return ClientInvoiceSchema.model_validate(invoice)


@router.post(
    "/preview-pdf",
    summary="Preview Client Invoice PDF",
    response_class=Response,
)
async def preview_client_invoice_pdf(
    preview: ClientInvoicePreviewRequest,
    auth_subject: auth.ClientInvoicesRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Response:
    """Generate a real PDF preview from form data without creating anything."""
    try:
        pdf_bytes = await client_invoice_service.preview_pdf(
            session, auth_subject, preview
        )
    except ClientInvoiceError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="invoice-preview.pdf"'
        },
    )


@router.get(
    "/{id}",
    summary="Get Client Invoice",
    response_model=ClientInvoiceSchema,
)
async def get_client_invoice(
    id: UUID4,
    auth_subject: auth.ClientInvoicesRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> ClientInvoiceSchema:
    """Get a client invoice by ID."""
    invoice = await client_invoice_service.get_by_id(session, auth_subject, id)
    if invoice is None:
        raise ResourceNotFound()
    return ClientInvoiceSchema.model_validate(invoice)


@router.get(
    "/{id}/pdf",
    summary="Download Client Invoice PDF",
    response_class=Response,
)
async def download_client_invoice_pdf(
    id: UUID4,
    auth_subject: auth.ClientInvoicesRead,
    session: AsyncReadSession = Depends(get_db_read_session),
) -> Response:
    """Generate and download a PDF for the given client invoice."""
    invoice = await client_invoice_service.get_by_id(session, auth_subject, id)
    if invoice is None:
        raise ResourceNotFound()

    pdf_bytes = await client_invoice_service.get_pdf_bytes(session, invoice)
    invoice_number = str(invoice.id)[:8].upper()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="invoice-{invoice_number}.pdf"'
        },
    )


@router.post(
    "/{id}/finalize",
    summary="Finalize Client Invoice",
    response_model=ClientInvoiceSchema,
)
async def finalize_client_invoice(
    id: UUID4,
    auth_subject: auth.ClientInvoicesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> ClientInvoiceSchema:
    """Finalize a draft invoice (generates PDF) without sending the email.
    Status moves from draft → open. Use this to preview the invoice before sending."""
    invoice = await client_invoice_service.get_by_id(session, auth_subject, id)
    if invoice is None:
        raise ResourceNotFound()

    try:
        invoice = await client_invoice_service.finalize_draft(session, invoice)
    except ClientInvoiceNotDraft as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    return ClientInvoiceSchema.model_validate(invoice)


@router.post(
    "/{id}/send",
    summary="Send Client Invoice",
    response_model=ClientInvoiceSchema,
)
async def send_client_invoice(
    id: UUID4,
    auth_subject: auth.ClientInvoicesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> ClientInvoiceSchema:
    """Finalize and send a draft invoice to the customer via Stripe."""
    invoice = await client_invoice_service.get_by_id(session, auth_subject, id)
    if invoice is None:
        raise ResourceNotFound()

    try:
        invoice = await client_invoice_service.send(session, invoice)
    except ClientInvoiceNotDraft as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    return ClientInvoiceSchema.model_validate(invoice)


@router.post(
    "/{id}/mark-paid",
    summary="Mark Client Invoice as Paid",
    response_model=ClientInvoiceSchema,
)
async def mark_client_invoice_paid(
    id: UUID4,
    auth_subject: auth.ClientInvoicesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> ClientInvoiceSchema:
    """Mark a draft or open invoice as paid manually without going through Stripe."""
    invoice = await client_invoice_service.get_by_id(session, auth_subject, id)
    if invoice is None:
        raise ResourceNotFound()

    try:
        invoice = await client_invoice_service.mark_as_paid(session, invoice)
    except ClientInvoiceCannotMarkPaid as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    return ClientInvoiceSchema.model_validate(invoice)


@router.post(
    "/{id}/void",
    summary="Void Client Invoice",
    response_model=ClientInvoiceSchema,
)
async def void_client_invoice(
    id: UUID4,
    auth_subject: auth.ClientInvoicesWrite,
    session: AsyncSession = Depends(get_db_session),
) -> ClientInvoiceSchema:
    """Void a draft or open invoice."""
    invoice = await client_invoice_service.get_by_id(session, auth_subject, id)
    if invoice is None:
        raise ResourceNotFound()

    try:
        invoice = await client_invoice_service.void_client_invoice(session, invoice)
    except ClientInvoiceAlreadyVoided as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    return ClientInvoiceSchema.model_validate(invoice)
