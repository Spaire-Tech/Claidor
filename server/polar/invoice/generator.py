import textwrap
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from typing import ClassVar, Self

import pycountry
from babel.dates import format_date as _format_date
from babel.numbers import format_decimal as _format_decimal
from babel.numbers import format_percent as _format_percent
from fpdf import FPDF
from fpdf.enums import Align, TableBordersLayout, XPos, YPos
from fpdf.fonts import FontFace
from pydantic import BaseModel

from polar.config import Environment, settings
from polar.kit.address import Address
from polar.kit.currency import format_currency
from polar.kit.utils import utc_now
from polar.models import Order
from polar.platform.service import platform as platform_service
from polar.tax.calculation import TaxabilityReason, TaxRate


def format_number(n: int) -> str:
    return _format_decimal(n, locale="en_US")


def format_percent(basis_points: int) -> str:
    return _format_percent(basis_points / 10000, locale="en_US")


def format_date(d: date | datetime) -> str:
    return _format_date(d, format="long", locale="en_US")


class InvoiceItem(BaseModel):
    description: str
    quantity: int
    unit_amount: int
    amount: int


class InvoiceHeadingItem(BaseModel):
    label: str
    value: str | datetime | date

    @property
    def display_value(self) -> str:
        if isinstance(self.value, (datetime, date)):
            return format_date(self.value)
        return self.value


class InvoiceTotalsItem(BaseModel):
    label: str
    amount: int
    currency: str


class Invoice(BaseModel):
    number: str
    date: datetime
    seller_name: str
    seller_address: Address | None = None
    seller_additional_info: str | None = None
    customer_name: str
    customer_address: Address | None = None
    customer_additional_info: str | None = None
    subtotal_amount: int
    applied_balance_amount: int | None = None
    discount_amount: int
    taxability_reason: TaxabilityReason | None
    tax_amount: int
    tax_rate: TaxRate | None
    net_amount: int
    currency: str
    items: list[InvoiceItem]
    notes: str | None = None
    extra_heading_items: list[InvoiceHeadingItem] | None = None
    extra_totals_items: list[InvoiceTotalsItem] | None = None
    # Client invoice extras
    checkout_link: str | None = None
    due_date: date | None = None
    on_behalf_of_label: str | None = None
    # True when Spaire itself is the seller (platform self-billing: Spaire
    # billing a creator for their plan). The Merchant-of-Record footer is
    # about reselling on behalf of a creator; for a first-party invoice
    # "issued by Spaire, Inc. on behalf of Spaire, Inc. … Merchant of
    # Record" is legally wrong framing.
    first_party: bool = False

    @property
    def total(self) -> int:
        return self.subtotal_amount - self.discount_amount + self.tax_amount

    @property
    def heading_items(self) -> list[InvoiceHeadingItem]:
        items = [
            InvoiceHeadingItem(label="Invoice number", value=self.number),
            InvoiceHeadingItem(label="Date of issue", value=self.date),
        ]
        if self.due_date:
            items.append(InvoiceHeadingItem(label="Date due", value=self.due_date))
        if self.on_behalf_of_label:
            items.append(
                InvoiceHeadingItem(label="On behalf of", value=self.on_behalf_of_label)
            )
        items.extend(self.extra_heading_items or [])
        return items

    @property
    def tax_displayed(self) -> bool:
        return self.taxability_reason is not None and self.taxability_reason in {
            TaxabilityReason.standard_rated,
            TaxabilityReason.reverse_charge,
        }

    @property
    def tax_label(self) -> str:
        if self.tax_rate is None:
            return "Tax"

        label = self.tax_rate["display_name"]

        if self.taxability_reason == TaxabilityReason.reverse_charge:
            return f"{label} (0% Reverse Charge)"

        if self.tax_rate["country"] is not None:
            country = pycountry.countries.get(alpha_2=self.tax_rate["country"])
            if country is not None:
                label += f" — {country.name}"

        if self.tax_rate["basis_points"] is not None:
            label += f" ({format_percent(self.tax_rate['basis_points'])})"

        return label

    @property
    def totals_items(self) -> list[InvoiceTotalsItem]:
        items: list[InvoiceTotalsItem] = [
            InvoiceTotalsItem(
                label="Subtotal",
                amount=self.subtotal_amount,
                currency=self.currency,
            )
        ]

        if self.discount_amount > 0:
            items.append(
                InvoiceTotalsItem(
                    label="Discount",
                    amount=-self.discount_amount,
                    currency=self.currency,
                )
            )

        if self.tax_displayed:
            items.append(
                InvoiceTotalsItem(
                    label="Total excluding tax",
                    amount=self.net_amount,
                    currency=self.currency,
                )
            )
            items.append(
                InvoiceTotalsItem(
                    label=self.tax_label,
                    amount=self.tax_amount,
                    currency=self.currency,
                )
            )

        total = self.net_amount + self.tax_amount
        items.append(
            InvoiceTotalsItem(
                label="Total",
                amount=total,
                currency=self.currency,
            )
        )

        if self.applied_balance_amount:
            items.append(
                InvoiceTotalsItem(
                    label="Applied balance",
                    amount=self.applied_balance_amount,
                    currency=self.currency,
                )
            )
            items.append(
                InvoiceTotalsItem(
                    label="To be paid",
                    amount=total + self.applied_balance_amount,
                    currency=self.currency,
                )
            )

        items.extend(self.extra_totals_items or [])
        return items

    @classmethod
    def from_order(cls, order: Order) -> Self:
        assert order.billing_name is not None
        assert order.billing_address is not None
        assert order.invoice_number is not None

        return cls(
            number=order.invoice_number,
            date=order.created_at,
            seller_name=settings.INVOICES_NAME,
            seller_address=settings.INVOICES_ADDRESS,
            seller_additional_info=settings.INVOICES_ADDITIONAL_INFO,
            customer_name=order.billing_name,
            customer_additional_info=order.tax_id[0] if order.tax_id else None,
            customer_address=order.billing_address,
            subtotal_amount=order.subtotal_amount,
            applied_balance_amount=order.applied_balance_amount,
            discount_amount=order.discount_amount,
            taxability_reason=order.taxability_reason,
            tax_amount=order.tax_amount,
            tax_rate=order.tax_rate,
            net_amount=order.net_amount,
            currency=order.currency,
            items=[
                InvoiceItem(
                    description=item.label,
                    quantity=1,
                    unit_amount=item.amount,
                    amount=item.amount,
                )
                for item in order.items
            ],
            first_party=platform_service.is_platform_organization(
                order.product.organization_id
            )
            if order.product is not None
            else False,
        )


class InvoiceGenerator(FPDF):
    """Class to generate an invoice PDF using fpdf2."""

    logo: ClassVar[Path] = Path(__file__).parent / "invoicelogo.png"
    """Path to the fallback logo image (used when no org logo is provided)."""

    regular_font_file = Path(__file__).parent / "fonts/Geist-Regular.otf"
    bold_font_file = Path(__file__).parent / "fonts/Geist-Bold.otf"

    font_name: ClassVar[str] = "geist"
    base_font_size: ClassVar[int] = 10
    footer_font_size: ClassVar[int] = 8
    table_header_font_size: ClassVar[int] = 8

    # Blue — "Pay online" link only
    link_color: ClassVar[tuple[int, int, int]] = (37, 99, 235)
    # Light grey — table borders, dividers
    table_borders_color: ClassVar[tuple[int, int, int]] = (220, 220, 220)
    # Grey — footer text, logo label
    footer_text_color: ClassVar[tuple[int, int, int]] = (100, 100, 100)

    line_height_percentage: ClassVar[float] = 1.5
    elements_y_margin: ClassVar[int] = 10
    items_table_row_height: ClassVar[int] = 7
    totals_table_row_height: ClassVar[int] = 6

    # Bottom margin for footer (MOR text + separator + summary)
    footer_height_mm: ClassVar[int] = 36

    def __init__(
        self,
        data: Invoice,
        heading_title: str = "Invoice",
        add_sandbox_warning: bool = settings.ENV == Environment.sandbox,
        logo_bytes: bytes | None = None,
        logo_label: str | None = None,
    ) -> None:
        super().__init__()

        self.add_font(self.font_name, fname=self.regular_font_file)
        self.add_font(self.font_name, fname=self.bold_font_file, style="B")
        self.set_font(self.font_name, size=self.base_font_size)
        self.set_auto_page_break(auto=True, margin=self.footer_height_mm)

        self.alias_nb_pages()
        self.data = data
        self.heading_title = heading_title
        self.add_sandbox_warning = add_sandbox_warning
        self.logo_bytes = logo_bytes
        self.logo_label = logo_label

    def cell_height(self, font_size: float | None = None) -> float:
        font_size = font_size or self.base_font_size
        return font_size * 0.35 * self.line_height_percentage

    def header(self) -> None:
        if self.add_sandbox_warning:
            self.set_xy(0, 0)
            self.set_fill_color(239, 177, 0)
            self.cell(
                self.w,
                10,
                "SANDBOX ENVIRONMENT: This invoice is for testing purposes only. No actual payment has been processed.",
                align=Align.C,
                fill=True,
            )
            self.ln(10)

    def footer(self) -> None:
        self.set_y(-self.footer_height_mm)
        self.set_font(self.font_name, size=self.footer_font_size)
        self.set_text_color(*self.footer_text_color)

        # Separator line
        self.set_draw_color(*self.table_borders_color)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

        # Legal text (centered). First-party invoices (Spaire billing a
        # creator for their own plan) carry no Merchant-of-Record framing.
        if self.data.first_party:
            legal_text = "This invoice is issued by Spaire, Inc."
        else:
            on_behalf = self.data.on_behalf_of_label or self.data.seller_name
            legal_text = (
                f"This invoice is issued by Spaire, Inc. on behalf of {on_behalf}. "
                f"Spaire, Inc. acts as the Merchant of Record for this transaction."
            )
        self.multi_cell(
            w=0,
            h=self.cell_height(self.footer_font_size),
            text=legal_text,
            align=Align.C,
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.ln(1)
        copyright_text = f"© {date.today().year} Spaire, Inc. All rights reserved."
        self.cell(
            w=0,
            h=self.cell_height(self.footer_font_size),
            text=copyright_text,
            align=Align.C,
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.set_text_color(0, 0, 0)

    def _render_logo(self) -> None:
        """Render org logo (or fallback) top-right, with optional label below."""
        logo_w = 20
        if self.logo_bytes:
            self.image(BytesIO(self.logo_bytes), x=Align.R, y=10, w=logo_w)
        else:
            self.image(str(self.logo), x=Align.R, y=10, w=15)
            return  # no label for the generic fallback logo

        if self.logo_label:
            logo_x = self.w - self.r_margin - logo_w
            saved_y = self.get_y()
            self.set_xy(logo_x, 31)
            self.set_font(size=6)
            self.set_text_color(*self.footer_text_color)
            self.cell(logo_w, 4, self.logo_label, align=Align.C)
            self.set_text_color(0, 0, 0)
            self.set_font(size=self.base_font_size)
            self.set_y(saved_y)

    def generate(self) -> None:
        self.set_metadata()
        self.add_page()

        # Title
        self.set_font(style="B", size=18)
        self.cell(
            text=self.heading_title,
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )

        # Logo (absolute positioned, top-right)
        self._render_logo()

        self.set_y(self.get_y() + self.elements_y_margin)

        # Heading items (invoice number, date of issue, date due, on behalf of)
        label_width = 30
        self.set_font(size=self.base_font_size)
        for heading_item in self.data.heading_items:
            self.set_font(style="B")
            self.cell(
                label_width, self.cell_height(), text=heading_item.label, align=Align.L
            )
            self.set_font(style="")
            self.cell(
                h=self.cell_height(),
                text=heading_item.display_value,
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )

        # Billing addresses
        self.set_y(self.get_y() + self.elements_y_margin)
        addresses_y_start = self.get_y()

        # Seller — left column
        self.set_font(style="B")
        self.multi_cell(
            80,
            self.cell_height(),
            text=self.data.seller_name,
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.set_font(style="")
        if self.data.seller_address is not None:
            self.multi_cell(
                80,
                self.cell_height(),
                text=self.data.seller_address.to_text(),
                new_x=XPos.LEFT,
                new_y=YPos.NEXT,
            )
        if self.data.seller_additional_info:
            self.multi_cell(
                80,
                self.cell_height(),
                text=self.data.seller_additional_info,
                markdown=True,
            )
        left_seller_end_y = self.get_y()

        # Customer — right column
        self.set_xy(110, addresses_y_start)
        self.set_font(style="B")
        self.cell(
            h=self.cell_height(), text="Bill to", new_x=XPos.LEFT, new_y=YPos.NEXT
        )
        self.set_font(style="B")
        self.multi_cell(
            80,
            self.cell_height(),
            text=self.data.customer_name,
            new_x=XPos.LEFT,
            new_y=YPos.NEXT,
        )
        self.set_font(style="")
        if self.data.customer_address is not None:
            self.multi_cell(
                80,
                self.cell_height(),
                self.data.customer_address.to_text(),
                new_x=XPos.LEFT,
                new_y=YPos.NEXT,
            )
        if self.data.customer_additional_info:
            self.multi_cell(
                80,
                self.cell_height(),
                text=self.data.customer_additional_info,
                markdown=True,
            )
        right_seller_end_y = self.get_y()
        bottom = max(left_seller_end_y, right_seller_end_y)

        # Prominent amount due headline
        self.set_y(bottom + self.elements_y_margin)
        amount_str = format_currency(self.data.total, self.data.currency)
        currency_upper = self.data.currency.upper()
        if self.data.due_date:
            headline = f"{amount_str} due {format_date(self.data.due_date)}"
        else:
            headline = f"{amount_str} {currency_upper}"
        self.set_font(style="B", size=14)
        self.cell(
            w=0,
            h=self.cell_height(14),
            text=headline,
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.set_font(size=self.base_font_size)

        # "Pay online" link — blue
        if self.data.checkout_link:
            self.set_y(self.get_y() + 3)
            self.set_text_color(*self.link_color)
            self.cell(
                w=0,
                h=self.cell_height(),
                text="Pay online",
                link=self.data.checkout_link,
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )
            self.set_text_color(0, 0, 0)

        # Invoice items table — all black
        self.set_y(self.get_y() + self.elements_y_margin)
        self.set_draw_color(*self.table_borders_color)
        with self.table(
            col_widths=(90, 30, 30, 30),
            text_align=(Align.L, Align.R, Align.R, Align.R),
            headings_style=FontFace(
                size_pt=self.table_header_font_size,
                color=(0, 0, 0),
            ),
            line_height=self.items_table_row_height,
            borders_layout=TableBordersLayout.HORIZONTAL_LINES,
        ) as table:
            header = table.row()
            header.cell("Description")
            header.cell("Qty")
            header.cell("Unit price")
            header.cell("Amount")

            for item in self.data.items:
                row = table.row()
                row.cell(textwrap.shorten(item.description, width=90, placeholder="…"))
                row.cell(format_number(item.quantity))
                row.cell(format_currency(item.unit_amount, self.data.currency))
                row.cell(format_currency(item.amount, self.data.currency))

        # Totals
        self.set_y(self.get_y() + self.elements_y_margin)
        totals = self.data.totals_items
        with self.table(
            col_widths=(150, 30),
            text_align=(Align.R, Align.R),
            first_row_as_headings=False,
            line_height=self.totals_table_row_height,
            borders_layout=TableBordersLayout.NONE,
        ) as totals_table:
            for total_item in totals:
                self.set_font(style="B")
                row = totals_table.row()
                row.cell(total_item.label)
                self.set_font(style="")
                row.cell(format_currency(total_item.amount, total_item.currency))

        # "Amount due" row — bold label and bold amount with currency
        self.set_y(self.get_y() + 2)
        with self.table(
            col_widths=(150, 30),
            text_align=(Align.R, Align.R),
            first_row_as_headings=False,
            line_height=self.totals_table_row_height,
            borders_layout=TableBordersLayout.NONE,
        ) as due_table:
            self.set_font(style="B")
            row = due_table.row()
            row.cell("Amount due")
            amount_due = format_currency(self.data.total, self.data.currency)
            row.cell(f"{amount_due} {currency_upper}")

        # Notes / memo
        self.set_font(style="")
        if self.data.notes:
            self.set_xy(self.l_margin, self.get_y() + self.elements_y_margin)
            self.multi_cell(
                w=0,
                h=self.cell_height(),
                text=self.data.notes,
                markdown=True,
            )

        # Bank transfer section
        self._render_bank_transfer_section()

    def _render_bank_transfer_section(self) -> None:
        """Render bank transfer payment instructions if bank details are configured."""
        if not settings.INVOICES_BANK_NAME:
            return

        self.set_y(self.get_y() + self.elements_y_margin)

        amount_str = format_currency(self.data.total, self.data.currency)
        self.set_font(style="B")
        self.cell(
            w=0,
            h=self.cell_height(),
            text=f"Pay {amount_str} with a bank transfer",
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.set_font(style="")
        self.set_y(self.get_y() + 2)
        self.multi_cell(
            w=120,
            h=self.cell_height(),
            text=(
                "Bank transfers can take up to two business days. To pay via bank "
                "transfer, transfer funds using the following bank information."
            ),
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        self.set_y(self.get_y() + 3)

        label_w = 35
        bank_rows: list[tuple[str, str | None]] = [
            ("Bank name", settings.INVOICES_BANK_NAME),
            ("Routing number", settings.INVOICES_BANK_ROUTING_NUMBER),
            ("Account number", settings.INVOICES_BANK_ACCOUNT_NUMBER),
            ("SWIFT code", settings.INVOICES_BANK_SWIFT_CODE),
            ("Reference", self.data.number),
        ]
        for label, value in bank_rows:
            if value is None:
                continue
            self.set_font(style="B")
            self.cell(label_w, self.cell_height(), text=label)
            self.set_font(style="")
            self.cell(
                w=0,
                h=self.cell_height(),
                text=value,
                new_x=XPos.LMARGIN,
                new_y=YPos.NEXT,
            )

    def set_metadata(self) -> None:
        self.set_title(f"Invoice {self.data.number}")
        self.set_creator("Spaire")
        self.set_author(settings.INVOICES_NAME)
        self.set_creation_date(utc_now())


__all__ = ["Invoice", "InvoiceGenerator", "InvoiceItem"]
