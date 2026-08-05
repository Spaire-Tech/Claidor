import base64
import uuid
from collections.abc import Sequence
from datetime import date, datetime
from typing import Any

import httpx
import stripe as stripe_lib
import structlog

from polar.auth.models import AuthSubject, Organization, User
from polar.config import settings
from polar.email.react import render_email_template
from polar.email.schemas import (
    ClientInvoiceEmail,
    ClientInvoiceEmailProps,
    EmailAdapter,
)
from polar.email.sender import Attachment, enqueue_email
from polar.exceptions import PolarError
from polar.integrations.stripe.service import stripe as stripe_service
from polar.invoice.generator import Invoice, InvoiceGenerator, InvoiceItem
from polar.kit.pagination import PaginationParams
from polar.kit.sorting import Sorting
from polar.logging import Logger
from polar.models.client_invoice import (
    ClientInvoice,
    ClientInvoiceLineItem,
    ClientInvoiceStatus,
)
from polar.models.customer import Customer
from polar.models.order import Order, OrderBillingReasonInternal, OrderStatus
from polar.models.order_item import OrderItem
from polar.models.organization import Organization as OrganizationModel
from polar.order.repository import OrderRepository
from polar.organization.repository import OrganizationRepository
from polar.organization.service import organization as organization_service
from polar.postgres import AsyncReadSession, AsyncSession
from polar.tax.calculation import (
    TaxCalculationError,
    TaxCode,
    get_tax_behavior_from_option,
    get_tax_service,
)
from polar.worker import enqueue_job

from .repository import ClientInvoiceLineItemRepository, ClientInvoiceRepository
from .schemas import ClientInvoiceCreate, ClientInvoicePreviewRequest
from .sorting import ClientInvoiceSortProperty

log: Logger = structlog.get_logger()


class ClientInvoiceError(PolarError): ...


class ClientInvoiceNotFound(ClientInvoiceError):
    def __init__(self, invoice_id: uuid.UUID) -> None:
        self.invoice_id = invoice_id
        super().__init__(f"Client invoice {invoice_id} not found.")


class ClientInvoiceNotDraft(ClientInvoiceError):
    def __init__(self, invoice: ClientInvoice) -> None:
        self.invoice = invoice
        super().__init__(
            f"Client invoice {invoice.id} is not a draft (status={invoice.status})."
        )


class ClientInvoiceAlreadyVoided(ClientInvoiceError):
    def __init__(self, invoice: ClientInvoice) -> None:
        self.invoice = invoice
        super().__init__(f"Client invoice {invoice.id} has already been voided.")


class ClientInvoiceCannotMarkPaid(ClientInvoiceError):
    def __init__(self, invoice: ClientInvoice) -> None:
        self.invoice = invoice
        super().__init__(
            f"Client invoice {invoice.id} cannot be marked as paid (status={invoice.status})."
        )


class ClientInvoiceService:
    async def list(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        *,
        pagination: PaginationParams,
        sorting: list[Sorting[ClientInvoiceSortProperty]] = [
            (ClientInvoiceSortProperty.created_at, True)
        ],
    ) -> tuple[Sequence[ClientInvoice], int]:
        repository = ClientInvoiceRepository.from_session(session)
        statement = repository.get_readable_statement(auth_subject)
        statement = repository.apply_sorting(statement, sorting)
        return await repository.paginate(
            statement, limit=pagination.limit, page=pagination.page
        )

    async def get_by_id(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        invoice_id: uuid.UUID,
    ) -> ClientInvoice | None:
        repository = ClientInvoiceRepository.from_session(session)
        statement = repository.get_readable_statement(auth_subject).where(
            ClientInvoice.id == invoice_id
        )
        return await repository.get_one_or_none(statement)

    async def create_draft(
        self,
        session: AsyncSession,
        auth_subject: AuthSubject[User | Organization],
        create_schema: ClientInvoiceCreate,
    ) -> ClientInvoice:
        from polar.customer.repository import CustomerRepository
        from polar.organization.repository import OrganizationRepository

        customer_repository = CustomerRepository.from_session(session)
        customer = await customer_repository.get_by_id(create_schema.customer_id)
        if customer is None:
            raise ClientInvoiceError(
                f"Customer {create_schema.customer_id} not found."
            )

        # Resolve organization from auth subject or customer.
        # Access customer.organization_id (a plain column) rather than the
        # lazy='raise' relationship to avoid an InvalidRequestError.
        if isinstance(auth_subject.subject, Organization):
            organization = auth_subject.subject
        else:
            org_repository = OrganizationRepository.from_session(session)
            organization = await org_repository.get_by_id(customer.organization_id)
            if organization is None:
                raise ClientInvoiceError(
                    f"Organization {customer.organization_id} not found."
                )

        # Ensure the Stripe customer exists on the platform account
        async def _ensure_stripe_customer() -> str:
            nonlocal customer
            create_params: dict[str, Any] = {"email": customer.email}
            if customer.billing_name is not None:
                create_params["name"] = customer.billing_name
            elif customer.name is not None:
                create_params["name"] = customer.name
            if customer.billing_address is not None:
                create_params["address"] = customer.billing_address.to_dict()
            stripe_customer = await stripe_service.create_customer(**create_params)
            customer = await customer_repository.update(
                customer,
                update_dict={"stripe_customer_id": stripe_customer.id},
                flush=True,
            )
            return stripe_customer.id

        if customer.stripe_customer_id is None:
            await _ensure_stripe_customer()
        else:
            # Verify the customer still exists and is not deleted in Stripe;
            # re-create if stale (deleted customers return deleted=True, not an error)
            needs_recreate = False
            try:
                existing = await stripe_service.get_customer(
                    customer.stripe_customer_id
                )
                if getattr(existing, "deleted", False):
                    needs_recreate = True
            except stripe_lib.InvalidRequestError as e:
                if e.code == "resource_missing":
                    needs_recreate = True
                else:
                    raise

            if needs_recreate:
                log.warning(
                    "client_invoice.create_draft.stripe_customer_stale",
                    stripe_customer_id=customer.stripe_customer_id,
                    customer_id=str(customer.id),
                )
                await _ensure_stripe_customer()

        assert customer.stripe_customer_id is not None

        currency = create_schema.currency.lower()
        subtotal_amount = sum(
            item.unit_amount * item.quantity for item in create_schema.line_items
        )
        discount_amount = min(create_schema.discount_amount, subtotal_amount)
        taxable_amount = subtotal_amount - discount_amount

        # Calculate tax before creating the Stripe invoice draft
        tax_processor = settings.DEFAULT_TAX_PROCESSOR
        tax_calculation_id: str | None = None
        tax_amount = 0

        if taxable_amount > 0 and customer.billing_address is not None:
            tax_service = get_tax_service(tax_processor)
            try:
                tax_calculation = await tax_service.calculate(
                    uuid.uuid4(),
                    currency,
                    taxable_amount,
                    get_tax_behavior_from_option(
                        organization.default_tax_behavior,
                        customer.billing_address,
                    ),
                    TaxCode.general_electronically_supplied_services,
                    customer.billing_address,
                    [customer.tax_id] if customer.tax_id is not None else [],
                    False,
                )
                tax_calculation_id = tax_calculation["processor_id"]
                tax_amount = tax_calculation["amount"]
            except TaxCalculationError:
                log.warning(
                    "client_invoice.create_draft.tax_calculation_failed",
                    customer_id=str(customer.id),
                    organization_id=str(organization.id),
                )

        total_amount = taxable_amount + tax_amount
        on_behalf_of_label = create_schema.on_behalf_of_label or organization.name

        # Compute days_until_due from explicit due_date.
        # Stripe requires days_until_due for collection_method="send_invoice" —
        # default to 30 days (Net 30) when no due date is specified.
        if create_schema.due_date is not None:
            delta = create_schema.due_date - date.today()
            days_until_due: int = max(1, delta.days)
        else:
            days_until_due = 30

        custom_fields: list[dict[str, str]] = [
            {"name": "On behalf of", "value": on_behalf_of_label}
        ]
        if create_schema.po_number is not None:
            custom_fields.append(
                {"name": "PO Number", "value": create_schema.po_number}
            )
        if discount_amount > 0 and create_schema.discount_label:
            custom_fields.append(
                {"name": create_schema.discount_label, "value": "Applied"}
            )

        footer = (
            f"This invoice is issued by Spaire, Inc. on behalf of {on_behalf_of_label}. "
            f"Spaire, Inc. acts as the Merchant of Record for this transaction. "
            f"© {date.today().year} Spaire, Inc. All rights reserved."
        )

        new_id = uuid.uuid4()

        # Create Stripe draft invoice
        stripe_metadata: dict[str, str] = {
            "client_invoice_id": str(new_id),
            "organization_id": str(organization.id),
            "spaire_mor": "true",
        }
        if create_schema.user_metadata:
            for k, v in create_schema.user_metadata.items():
                stripe_metadata[str(k)] = str(v)

        stripe_invoice = await stripe_service.create_invoice(
            customer=customer.stripe_customer_id,
            currency=currency,
            collection_method="send_invoice",
            days_until_due=days_until_due,
            description=create_schema.memo,
            footer=footer,
            custom_fields=custom_fields,
            metadata=stripe_metadata,
        )

        # Create discount invoice item first (negative amount)
        if discount_amount > 0:
            await stripe_service.create_invoice_item(
                customer=customer.stripe_customer_id,
                invoice=stripe_invoice.id,
                amount=-discount_amount,
                currency=currency,
                description=create_schema.discount_label or "Discount",
            )

        # Create Stripe invoice items
        stripe_item_ids: list[str] = []
        for item in create_schema.line_items:
            item_amount = item.unit_amount * item.quantity
            stripe_item = await stripe_service.create_invoice_item(
                customer=customer.stripe_customer_id,
                invoice=stripe_invoice.id,
                amount=item_amount,
                currency=currency,
                description=item.description,
            )
            stripe_item_ids.append(stripe_item.id)

        # Add a single tax line item if tax was calculated
        if tax_amount > 0:
            await stripe_service.create_invoice_item(
                customer=customer.stripe_customer_id,
                invoice=stripe_invoice.id,
                amount=tax_amount,
                currency=currency,
                description="Tax",
            )

        # Persist
        repository = ClientInvoiceRepository.from_session(session)
        client_invoice = await repository.create(
            ClientInvoice(
                id=new_id,
                organization_id=organization.id,
                customer_id=customer.id,
                stripe_invoice_id=stripe_invoice.id,
                status=ClientInvoiceStatus.draft,
                currency=currency,
                subtotal_amount=subtotal_amount,
                discount_amount=discount_amount,
                tax_amount=tax_amount,
                total_amount=total_amount,
                tax_calculation_id=tax_calculation_id,
                memo=create_schema.memo,
                po_number=create_schema.po_number,
                due_date=create_schema.due_date,
                on_behalf_of_label=on_behalf_of_label,
                discount_label=create_schema.discount_label,
                include_payment_link=create_schema.include_payment_link,
                show_logo=create_schema.show_logo,
                show_mor_attribution=create_schema.show_mor_attribution,
                stripe_hosted_invoice_url=stripe_invoice.hosted_invoice_url,
                invoice_pdf_url=stripe_invoice.invoice_pdf,
                checkout_link=(
                    (create_schema.user_metadata or {}).get("checkout_link_url")
                    or stripe_invoice.hosted_invoice_url
                ),
                user_metadata=create_schema.user_metadata,
            ),
            flush=True,
        )

        line_item_repository = ClientInvoiceLineItemRepository.from_session(session)
        for item, stripe_item_id in zip(create_schema.line_items, stripe_item_ids):
            await line_item_repository.create(
                ClientInvoiceLineItem(
                    client_invoice_id=client_invoice.id,
                    stripe_invoice_item_id=stripe_item_id,
                    description=item.description,
                    quantity=item.quantity,
                    unit_amount=item.unit_amount,
                    currency=currency,
                    amount=item.unit_amount * item.quantity,
                    tax_amount=0,
                )
            )

        # Flush line items then reload the invoice so the selectin relationship
        # is populated before Pydantic serializes the response.
        await session.flush()
        refreshed = await repository.get_by_id(client_invoice.id)
        assert refreshed is not None
        return refreshed

    async def finalize_draft(
        self,
        session: AsyncSession,
        invoice: ClientInvoice,
    ) -> ClientInvoice:
        """Finalize a draft invoice on Stripe (generates PDF) without sending any email.
        Moves status from draft → open."""
        if invoice.status != ClientInvoiceStatus.draft:
            raise ClientInvoiceNotDraft(invoice)

        assert invoice.stripe_invoice_id is not None

        finalized = await stripe_service.finalize_invoice(invoice.stripe_invoice_id)

        update_dict: dict[str, Any] = {
            "status": ClientInvoiceStatus.open,
            "stripe_hosted_invoice_url": finalized.hosted_invoice_url,
            "invoice_pdf_url": finalized.invoice_pdf,
        }
        if not invoice.checkout_link:
            update_dict["checkout_link"] = finalized.hosted_invoice_url

        repository = ClientInvoiceRepository.from_session(session)
        return await repository.update(invoice, update_dict=update_dict)

    def _build_invoice_pdf_bytes(
        self,
        invoice: ClientInvoice,
        organization: OrganizationModel,
        customer: Customer,
        logo_bytes: bytes | None = None,
    ) -> bytes:
        """Generate a PDF for the given client invoice and return as bytes."""
        inv = Invoice(
            number=str(invoice.id)[:8].upper(),
            date=invoice.created_at,
            seller_name=settings.INVOICES_NAME,
            seller_address=settings.INVOICES_ADDRESS,
            seller_additional_info=settings.INVOICES_ADDITIONAL_INFO,
            customer_name=customer.name or customer.email,
            customer_address=customer.billing_address,
            items=[
                InvoiceItem(
                    description=item.description,
                    quantity=item.quantity,
                    unit_amount=item.unit_amount,
                    amount=item.amount,
                )
                for item in invoice.line_items
            ],
            subtotal_amount=invoice.subtotal_amount,
            discount_amount=invoice.discount_amount,
            taxability_reason=None,
            tax_amount=invoice.tax_amount,
            tax_rate=None,
            currency=invoice.currency,
            notes=invoice.memo or None,
            checkout_link=(
                invoice.checkout_link if invoice.include_payment_link else None
            ),
            due_date=invoice.due_date,
            on_behalf_of_label=invoice.on_behalf_of_label,
        )
        # Respect stored display preferences
        effective_logo = logo_bytes if invoice.show_logo else None
        effective_label: str | None = None
        if effective_logo and invoice.show_mor_attribution:
            effective_label = "via spaire"

        generator = InvoiceGenerator(
            inv,
            heading_title="Invoice",
            logo_bytes=effective_logo,
            logo_label=effective_label,
        )
        generator.generate()
        return bytes(generator.output())

    @staticmethod
    async def _fetch_logo_bytes(url: str | None) -> bytes | None:
        if not url:
            return None
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    return response.content
        except Exception:
            pass
        return None

    async def get_pdf_bytes(
        self,
        session: AsyncReadSession,
        invoice: ClientInvoice,
    ) -> bytes:
        """Load dependencies and generate the invoice PDF."""
        from polar.customer.repository import CustomerRepository

        customer_repo = CustomerRepository.from_session(session)
        customer = await customer_repo.get_by_id(invoice.customer_id)
        assert customer is not None

        org_repo = OrganizationRepository.from_session(session)
        organization = await org_repo.get_by_id(invoice.organization_id)
        assert organization is not None

        logo_bytes = await self._fetch_logo_bytes(organization.avatar_url)
        return self._build_invoice_pdf_bytes(invoice, organization, customer, logo_bytes)

    async def preview_pdf(
        self,
        session: AsyncReadSession,
        auth_subject: AuthSubject[User | Organization],
        preview: ClientInvoicePreviewRequest,
    ) -> bytes:
        """Generate a real PDF preview from form data without persisting anything."""
        from polar.customer.repository import CustomerRepository

        org_repo = OrganizationRepository.from_session(session)
        organization = await org_repo.get_by_id(preview.organization_id)
        if organization is None:
            raise ClientInvoiceError(
                f"Organization {preview.organization_id} not found."
            )

        # Resolve customer name from DB if provided
        customer_name: str | None = preview.billing_name
        if preview.customer_id is not None and not customer_name:
            customer_repo = CustomerRepository.from_session(session)
            customer = await customer_repo.get_by_id(preview.customer_id)
            if customer is not None:
                customer_name = customer.name or customer.email

        from polar.kit.address import Address

        customer_address: Address | None = None
        if preview.billing_line1 or preview.billing_city or preview.billing_country:
            customer_address = Address(
                line1=preview.billing_line1,
                line2=preview.billing_line2,
                city=preview.billing_city,
                state=preview.billing_state,
                postal_code=preview.billing_postal_code,
                country=preview.billing_country,
            )

        subtotal_amount = sum(
            item.unit_amount * item.quantity for item in preview.line_items
        )
        discount_amount = min(preview.discount_amount, subtotal_amount)
        total_amount = subtotal_amount - discount_amount

        on_behalf_of_label = preview.on_behalf_of_label or organization.name

        inv = Invoice(
            number="DRAFT",
            date=datetime.utcnow(),
            seller_name=settings.INVOICES_NAME,
            seller_address=settings.INVOICES_ADDRESS,
            seller_additional_info=settings.INVOICES_ADDITIONAL_INFO,
            customer_name=customer_name or "—",
            customer_address=customer_address,
            items=[
                InvoiceItem(
                    description=item.description or "—",
                    quantity=item.quantity,
                    unit_amount=item.unit_amount,
                    amount=item.unit_amount * item.quantity,
                )
                for item in preview.line_items
            ],
            subtotal_amount=subtotal_amount,
            discount_amount=discount_amount,
            taxability_reason=None,
            tax_amount=0,
            tax_rate=None,
            currency=preview.currency,
            notes=preview.memo or None,
            checkout_link=preview.checkout_link_url if preview.include_payment_link else None,
            due_date=preview.due_date,
            on_behalf_of_label=on_behalf_of_label,
        )

        # Fetch logo only if show_logo is enabled
        logo_bytes: bytes | None = None
        if preview.show_logo:
            logo_bytes = await self._fetch_logo_bytes(organization.avatar_url)

        logo_label: str | None = None
        if logo_bytes and preview.show_mor_attribution:
            logo_label = "via spaire"

        generator = InvoiceGenerator(
            inv,
            heading_title="Invoice",
            logo_bytes=logo_bytes,
            logo_label=logo_label,
        )
        generator.generate()
        return bytes(generator.output())

    async def send(
        self,
        session: AsyncSession,
        invoice: ClientInvoice,
    ) -> ClientInvoice:
        """Finalize (if draft) and send the invoice email to the customer.
        Works for both draft and open status — open invoices skip finalization
        (e.g. user already downloaded/previewed the invoice first)."""
        if invoice.status not in {ClientInvoiceStatus.draft, ClientInvoiceStatus.open}:
            raise ClientInvoiceNotDraft(invoice)

        assert invoice.stripe_invoice_id is not None

        repository = ClientInvoiceRepository.from_session(session)

        if invoice.status == ClientInvoiceStatus.draft:
            # Finalize on Stripe to lock amounts and generate PDF
            finalized = await stripe_service.finalize_invoice(invoice.stripe_invoice_id)
            update_dict: dict[str, Any] = {
                "status": ClientInvoiceStatus.open,
                "stripe_hosted_invoice_url": finalized.hosted_invoice_url,
                "invoice_pdf_url": finalized.invoice_pdf,
            }
            if not invoice.checkout_link:
                update_dict["checkout_link"] = finalized.hosted_invoice_url
            invoice = await repository.update(invoice, update_dict=update_dict)

        # Load customer + organization for email
        from polar.customer.repository import CustomerRepository

        customer_repo = CustomerRepository.from_session(session)
        customer = await customer_repo.get_by_id(invoice.customer_id)
        assert customer is not None

        org_repo = OrganizationRepository.from_session(session)
        organization = await org_repo.get_by_id(invoice.organization_id)
        assert organization is not None

        # Send our own invoice email (not Stripe's)
        try:
            # Generate PDF attachment
            logo_bytes = await self._fetch_logo_bytes(organization.avatar_url)
            pdf_bytes = self._build_invoice_pdf_bytes(
                invoice, organization, customer, logo_bytes
            )
            invoice_number = str(invoice.id)[:8].upper()
            attachment: Attachment = {
                "filename": f"invoice-{invoice_number}.pdf",
                "content": base64.b64encode(pdf_bytes).decode(),
            }

            email_props = ClientInvoiceEmailProps(
                email=customer.email,
                organization_name=organization.name,
                organization_avatar_url=organization.avatar_url,
                customer_name=customer.name or customer.email,
                invoice_id=invoice_number,
                due_date=invoice.due_date.isoformat() if invoice.due_date else None,
                currency=invoice.currency.upper(),
                line_items=[
                    {
                        "description": item.description,
                        "quantity": item.quantity,
                        "amount": item.amount,
                    }
                    for item in invoice.line_items
                ],
                subtotal_amount=invoice.subtotal_amount,
                discount_amount=invoice.discount_amount,
                discount_label=invoice.discount_label,
                tax_amount=invoice.tax_amount,
                total_amount=invoice.total_amount,
                checkout_link=invoice.checkout_link,
                memo=invoice.memo,
            )
            email_obj = ClientInvoiceEmail(props=email_props)
            html = render_email_template(EmailAdapter.validate_python(email_obj.model_dump()))
            enqueue_email(
                **organization.email_from_reply,
                to_email_addr=customer.email,
                subject=f"Invoice from {organization.name}",
                html_content=html,
                attachments=[attachment],
            )
        except Exception:
            log.warning(
                "client_invoice.send.email_failed",
                invoice_id=str(invoice.id),
            )

        return invoice

    async def void_client_invoice(
        self,
        session: AsyncSession,
        invoice: ClientInvoice,
    ) -> ClientInvoice:
        if invoice.status in {ClientInvoiceStatus.void, ClientInvoiceStatus.paid}:
            raise ClientInvoiceAlreadyVoided(invoice)

        assert invoice.stripe_invoice_id is not None

        await stripe_service.void_invoice(invoice.stripe_invoice_id)

        repository = ClientInvoiceRepository.from_session(session)
        return await repository.update(
            invoice, update_dict={"status": ClientInvoiceStatus.void}
        )

    async def mark_as_paid(
        self,
        session: AsyncSession,
        invoice: ClientInvoice,
    ) -> ClientInvoice:
        """Mark an invoice as paid manually without interacting with Stripe.
        Only allowed for draft or open invoices."""
        if invoice.status not in {ClientInvoiceStatus.draft, ClientInvoiceStatus.open}:
            raise ClientInvoiceCannotMarkPaid(invoice)

        repository = ClientInvoiceRepository.from_session(session)
        return await repository.update(
            invoice, update_dict={"status": ClientInvoiceStatus.paid}
        )

    async def handle_stripe_invoice_paid(
        self,
        session: AsyncSession,
        stripe_invoice_id: str,
    ) -> ClientInvoice | None:
        """Called from the invoice.paid webhook. Creates the Order and records tax."""
        repository = ClientInvoiceRepository.from_session(session)
        invoice = await repository.get_by_stripe_invoice_id(stripe_invoice_id)

        if invoice is None:
            log.info(
                "client_invoice.stripe_paid.not_found",
                stripe_invoice_id=stripe_invoice_id,
            )
            return None

        if invoice.status == ClientInvoiceStatus.paid:
            return invoice

        # Record tax transaction
        tax_transaction_id: str | None = None
        if (
            invoice.tax_calculation_id is not None
            and invoice.tax_transaction_id is None
        ):
            tax_service = get_tax_service(settings.DEFAULT_TAX_PROCESSOR)
            try:
                tax_transaction_id = await tax_service.record(
                    invoice.tax_calculation_id, str(invoice.id)
                )
            except Exception:
                log.warning(
                    "client_invoice.stripe_paid.tax_transaction_failed",
                    invoice_id=str(invoice.id),
                    calculation_id=invoice.tax_calculation_id,
                )

        # Load customer (needed for invoice number generation and order fields)
        from polar.customer.repository import CustomerRepository

        customer_repo = CustomerRepository.from_session(session)
        customer = await customer_repo.get_by_id(invoice.customer_id)
        assert customer is not None

        invoice_number = await organization_service.get_next_invoice_number(
            session, customer.organization, customer
        )

        # Create the paid Order; stripe_invoice_id set → bypasses pending-status check
        order_repository = OrderRepository.from_session(session)
        order = await order_repository.create(
            Order(
                status=OrderStatus.paid,
                subtotal_amount=invoice.subtotal_amount,
                discount_amount=invoice.discount_amount,
                tax_amount=invoice.tax_amount,
                currency=invoice.currency,
                billing_reason=OrderBillingReasonInternal.client_invoice,
                billing_name=customer.billing_name,
                billing_address=customer.billing_address,
                tax_id=customer.tax_id,
                tax_processor=settings.DEFAULT_TAX_PROCESSOR
                if invoice.tax_calculation_id
                else None,
                tax_calculation_processor_id=invoice.tax_calculation_id,
                tax_transaction_processor_id=tax_transaction_id,
                stripe_invoice_id=stripe_invoice_id,
                invoice_number=invoice_number,
                customer_id=invoice.customer_id,
            ),
            flush=True,
        )

        # Create OrderItems from line items
        for line_item in invoice.line_items:
            session.add(
                OrderItem(
                    order_id=order.id,
                    label=line_item.description,
                    amount=line_item.amount,
                    net_amount=line_item.amount,
                    tax_amount=line_item.tax_amount,
                )
            )

        # Update invoice
        update_dict: dict[str, Any] = {
            "status": ClientInvoiceStatus.paid,
            "order_id": order.id,
        }
        if tax_transaction_id is not None:
            update_dict["tax_transaction_id"] = tax_transaction_id

        invoice = await repository.update(invoice, update_dict=update_dict)

        enqueue_job("order.confirmation_email", order.id)

        log.info(
            "client_invoice.paid",
            invoice_id=str(invoice.id),
            order_id=str(order.id),
        )

        return invoice

    async def handle_stripe_invoice_voided(
        self,
        session: AsyncSession,
        stripe_invoice_id: str,
    ) -> ClientInvoice | None:
        repository = ClientInvoiceRepository.from_session(session)
        invoice = await repository.get_by_stripe_invoice_id(stripe_invoice_id)

        if invoice is None:
            return None

        if invoice.status == ClientInvoiceStatus.void:
            return invoice

        return await repository.update(
            invoice, update_dict={"status": ClientInvoiceStatus.void}
        )


client_invoice = ClientInvoiceService()
