from datetime import date
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from polar.kit.db.models import RecordModel
from polar.kit.extensions.sqlalchemy.types import StringEnum

if TYPE_CHECKING:
    from polar.models import Customer, Order, Organization


class ClientInvoiceStatus(StrEnum):
    draft = "draft"
    open = "open"  # finalized + sent
    paid = "paid"
    void = "void"
    uncollectible = "uncollectible"


class ClientInvoice(RecordModel):
    __tablename__ = "client_invoices"

    # Relationships
    organization_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    customer_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    # Stripe
    stripe_invoice_id: Mapped[str | None] = mapped_column(
        String, nullable=True, unique=True, default=None, index=True
    )

    # Status
    status: Mapped[ClientInvoiceStatus] = mapped_column(
        StringEnum(ClientInvoiceStatus),
        nullable=False,
        default=ClientInvoiceStatus.draft,
    )

    # Currency & amounts (in smallest currency unit)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    subtotal_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tax_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Tax tracking
    tax_calculation_id: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )
    tax_transaction_id: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )

    # Metadata
    memo: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    po_number: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, default=None)
    on_behalf_of_label: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )

    # Discount (flat amount, pre-tax)
    discount_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    discount_label: Mapped[str | None] = mapped_column(String, nullable=True, default=None)

    # Payment link
    include_payment_link: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    stripe_hosted_invoice_url: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )
    invoice_pdf_url: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )
    # Our checkout link (distinct from Stripe's hosted invoice page)
    checkout_link: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )

    # Display options
    show_logo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    show_mor_attribution: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    # Pass-through metadata
    user_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)

    # Linked order (set after payment)
    order_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, default=None
    )

    # Relationships
    @declared_attr
    def organization(cls) -> Mapped["Organization"]:
        return relationship("Organization", lazy="raise")

    @declared_attr
    def customer(cls) -> Mapped["Customer"]:
        return relationship("Customer", lazy="raise")

    @declared_attr
    def order(cls) -> Mapped["Order | None"]:
        return relationship("Order", lazy="raise", foreign_keys="[ClientInvoice.order_id]")

    @declared_attr
    def line_items(cls) -> Mapped[list["ClientInvoiceLineItem"]]:
        return relationship(
            "ClientInvoiceLineItem",
            back_populates="client_invoice",
            cascade="all, delete-orphan",
            lazy="selectin",
        )


class ClientInvoiceLineItem(RecordModel):
    __tablename__ = "client_invoice_line_items"

    client_invoice_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("client_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stripe_invoice_item_id: Mapped[str | None] = mapped_column(
        String, nullable=True, default=None
    )

    description: Mapped[str] = mapped_column(String, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    tax_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    @declared_attr
    def client_invoice(cls) -> Mapped["ClientInvoice"]:
        return relationship("ClientInvoice", back_populates="line_items", lazy="raise")
