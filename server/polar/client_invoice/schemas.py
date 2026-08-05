from datetime import date
from typing import Any

from pydantic import UUID4, Field, field_validator

from polar.kit.schemas import IDSchema, Schema, TimestampedSchema
from polar.models.client_invoice import ClientInvoiceStatus


class ClientInvoiceLineItemCreate(Schema):
    description: str = Field(description="Line item description shown on the invoice.")
    quantity: int = Field(default=1, ge=1, description="Quantity.")
    unit_amount: int = Field(
        ge=1, description="Unit price in the smallest currency unit (e.g. cents)."
    )


class ClientInvoiceLineItemPreview(Schema):
    """Relaxed line item for preview — allows zero amounts for in-progress editing."""

    description: str = Field(default="—", description="Line item description.")
    quantity: int = Field(default=1, ge=1, description="Quantity.")
    unit_amount: int = Field(
        default=0, ge=0, description="Unit price in cents (0 allowed for preview)."
    )


class ClientInvoiceCreate(Schema):
    customer_id: UUID4 = Field(description="ID of the Spaire customer to invoice.")
    currency: str = Field(
        min_length=3, max_length=3, description="ISO 4217 currency code (e.g. 'usd')."
    )
    line_items: list[ClientInvoiceLineItemCreate] = Field(
        min_length=1, description="Invoice line items. At least one required."
    )
    due_date: date | None = Field(
        default=None,
        description="Payment due date. Determines days_until_due on the Stripe invoice.",
    )
    memo: str | None = Field(
        default=None, description="Internal memo / invoice description."
    )
    po_number: str | None = Field(
        default=None, max_length=64, description="Purchase order number."
    )
    on_behalf_of_label: str | None = Field(
        default=None,
        description=(
            "Name shown in 'on behalf of' display on the invoice. "
            "Defaults to the organization name."
        ),
    )
    discount_amount: int = Field(
        default=0,
        ge=0,
        description="Flat discount amount in the smallest currency unit (e.g. cents). Applied before tax.",
    )
    discount_label: str | None = Field(
        default=None,
        description="Label shown for the discount line on the invoice (e.g. 'Promo code').",
    )
    include_payment_link: bool = Field(
        default=True,
        description="Whether to include a hosted payment link in the invoice email.",
    )
    show_logo: bool = Field(
        default=True,
        description="Whether to show the organization logo on the PDF.",
    )
    show_mor_attribution: bool = Field(
        default=True,
        description="Whether to show 'via spaire' label under the logo.",
    )
    user_metadata: dict[str, Any] | None = Field(
        default=None,
        description="Arbitrary key-value metadata to attach to the invoice.",
    )

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        return v.lower()


class ClientInvoicePreviewRequest(Schema):
    """Request body for generating a real-time PDF preview without persisting."""

    organization_id: UUID4 = Field(description="Organization ID.")
    customer_id: UUID4 | None = Field(
        default=None, description="Optional customer ID to pull name/address from."
    )
    currency: str = Field(
        min_length=3, max_length=3, description="ISO 4217 currency code."
    )
    line_items: list[ClientInvoiceLineItemPreview] = Field(
        min_length=1, description="Invoice line items."
    )
    due_date: date | None = Field(default=None)
    memo: str | None = Field(default=None)
    po_number: str | None = Field(default=None)
    on_behalf_of_label: str | None = Field(default=None)
    discount_amount: int = Field(default=0, ge=0)
    discount_label: str | None = Field(default=None)
    include_payment_link: bool = Field(default=True)
    checkout_link_url: str | None = Field(default=None)

    # Display options
    show_logo: bool = Field(
        default=True, description="Whether to show the organization logo on the PDF."
    )
    show_mor_attribution: bool = Field(
        default=True,
        description="Whether to show 'via spaire' label under the logo.",
    )

    # Customer address overrides (from the form)
    billing_name: str | None = Field(default=None)
    billing_line1: str | None = Field(default=None)
    billing_line2: str | None = Field(default=None)
    billing_city: str | None = Field(default=None)
    billing_state: str | None = Field(default=None)
    billing_postal_code: str | None = Field(default=None)
    billing_country: str | None = Field(default=None)

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        return v.lower()


class ClientInvoiceLineItemSchema(TimestampedSchema, IDSchema):
    client_invoice_id: UUID4
    stripe_invoice_item_id: str | None
    description: str
    quantity: int
    unit_amount: int
    currency: str
    amount: int
    tax_amount: int


class ClientInvoiceSchema(TimestampedSchema, IDSchema):
    organization_id: UUID4
    customer_id: UUID4
    stripe_invoice_id: str | None
    status: ClientInvoiceStatus
    currency: str
    subtotal_amount: int
    discount_amount: int
    tax_amount: int
    total_amount: int
    memo: str | None
    po_number: str | None
    due_date: date | None
    on_behalf_of_label: str | None
    discount_label: str | None
    include_payment_link: bool
    show_logo: bool
    show_mor_attribution: bool
    stripe_hosted_invoice_url: str | None
    invoice_pdf_url: str | None
    checkout_link: str | None
    user_metadata: dict[str, Any] | None
    order_id: UUID4 | None
    line_items: list[ClientInvoiceLineItemSchema] = Field(default_factory=list)
