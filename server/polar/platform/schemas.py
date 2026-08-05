from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from polar.entitlements.schemas import (
    Entitlements,
    TierFeatures,
    TierLimits,
    TransactionFee,
)
from polar.entitlements.tiers import TierKey
from polar.kit.address import Address, AddressInput
from polar.kit.schemas import Schema
from polar.tax.tax_id import TaxID

BillingInterval = Literal["month", "year"]


class TierPlan(Schema):
    """A subscribable tier plan, as exposed to creators in the upgrade UI."""

    tier: TierKey = Field(description="Tier identifier.")
    name: str = Field(description="Display name, e.g. 'Spaire Starter'.")
    description: str | None = Field(description="Marketing description.")
    product_id: UUID | None = Field(
        description=(
            "Platform-org monthly Product id backing this tier (None if "
            "no product has been seeded yet). The annual Product id is "
            "exposed separately via annual_product_id."
        )
    )
    annual_product_id: UUID | None = Field(
        description=(
            "Platform-org annual Product id backing this tier (None if "
            "no annual product has been seeded yet)."
        )
    )
    monthly_price_cents: int = Field(
        description="Monthly recurring price for this tier, in cents."
    )
    annual_price_cents: int | None = Field(
        description=(
            "Total annual cost when billed yearly, in cents. None if "
            "annual billing isn't seeded for this tier."
        )
    )
    annual_savings_percent: int = Field(
        default=20,
        description=(
            "Discount applied when billed annually vs. 12x monthly. "
            "Source of truth for the upgrade-card 'save N%' label."
        ),
    )
    currency: str = Field(default="usd", description="Currency code (lowercased).")
    trial_days: int | None = Field(
        description="Trial duration in days, if any."
    )
    transaction_fee: TransactionFee
    features: TierFeatures
    limits: TierLimits


class TierPlanList(Schema):
    items: list[TierPlan]


class CurrentSpaireSubscription(Schema):
    """The caller's current Spaire subscription state (billing-side info,
    complementary to the entitlements snapshot)."""

    tier: TierKey
    billing_interval: BillingInterval | None = Field(
        description=(
            "The Product's recurring interval ('month' or 'year'). None "
            "when the creator has no platform-org subscription (no plan)."
        )
    )
    status: str = Field(
        description=(
            "Subscription status — 'active', 'trialing', 'past_due', "
            "'canceled', or 'none' when no subscription exists."
        )
    )
    monthly_price_cents: int = Field(
        description="Recurring monthly cost in cents (0 when no plan)."
    )
    currency: str = Field(default="usd")
    current_period_end: datetime | None = Field(
        description=(
            "When the current billing period ends — also the next "
            "renewal date for active subscriptions."
        )
    )
    trial_end: datetime | None = Field(
        description="When the trial period ends, if currently trialing."
    )
    cancel_at_period_end: bool = Field(
        description="Whether the subscription is scheduled to cancel."
    )
    past_due_at: datetime | None = Field(
        default=None,
        description=(
            "When the subscription first entered `past_due` (a Spaire "
            "charge failed). None unless the subscription is past_due."
        ),
    )
    suspension_at: datetime | None = Field(
        default=None,
        description=(
            "The deadline by which the overdue balance must be paid before "
            "the subscription is canceled and the org loses access. Computed "
            "from past_due_at plus the dunning retry window. None unless "
            "past_due. The dashboard uses this for the 'pay by {date}' banner."
        ),
    )
    is_default_trial: bool = Field(
        default=False,
        description=(
            "True when the active subscription is the auto-created Starter "
            "trial from the org-creation hook (i.e. `managed_by=trial`). "
            "Becomes False once the creator goes through upgrade-checkout "
            "and a payment method is captured. The onboarding review "
            "page uses this to verify a Stripe checkout actually "
            "completed when it sees `?upgraded=1` in the URL."
        ),
    )
    entitlements: Entitlements


class UpgradeCheckoutCreate(Schema):
    tier: TierKey = Field(
        description="Target tier to upgrade to (must be Starter, Studio, or Scale)."
    )
    billing_interval: BillingInterval = Field(
        default="month",
        description=(
            "'month' bills every 30 days. 'year' bills once annually at a "
            "~20% discount (the exact price comes from the matching "
            "platform-org Product row, not the client)."
        ),
    )
    success_url: str | None = Field(
        default=None,
        description=(
            "URL the customer will be redirected to after a successful "
            "checkout. The {CHECKOUT_ID} placeholder is replaced with the "
            "completed checkout's id."
        ),
    )
    billing_email: str | None = Field(
        default=None,
        description=(
            "Email address for Spaire's own billing of this subscription. "
            "If omitted, the calling user's email is used. Stored on the "
            "platform-org customer record so invoices and receipts reach "
            "the creator."
        ),
    )


class UpgradeCheckout(Schema):
    checkout_id: UUID
    checkout_url: str
    client_secret: str


class SwitchPlan(Schema):
    tier: TierKey = Field(
        description=(
            "Target tier. Must be a different paid tier than the current "
            "one (e.g. starter -> studio, studio -> scale). Use the cancel "
            "endpoint to end your paid subscription."
        )
    )
    billing_interval: BillingInterval | None = Field(
        default=None,
        description=(
            "Optional new billing cadence. Omit to keep the current "
            "subscription's interval; set to 'year' or 'month' to switch "
            "annual <-> monthly on the same target tier."
        ),
    )


class CancelSpaireSubscription(Schema):
    """Schedule the current Spaire subscription for cancellation at the
    end of the current billing period. When the cancellation revokes, the
    org has no active plan and resolves to `inactive` (no free fallback)."""

    pass


class CustomerPortalSessionCreate(Schema):
    return_url: str | None = Field(
        default=None,
        description=(
            "URL the customer portal will link back to (shows a 'Back' "
            "control). Use the dashboard URL the creator came from."
        ),
    )


class CustomerPortalSession(Schema):
    token: str = Field(description="Short-lived customer portal token.")
    expires_at: datetime
    customer_portal_url: str = Field(
        description=(
            "URL the creator visits to manage their Spaire subscription "
            "(view invoices, change payment method, cancel)."
        )
    )


class PlatformBillingDetails(Schema):
    """The billing identity used on the org's Spaire invoices — read off
    the org's platform Customer row. Powers the dashboard "Billing address"
    section so the creator never has to leave for the customer portal."""

    billing_name: str | None = Field(description="Name shown on invoices.")
    billing_address: Address | None = Field(
        description="Address shown on invoices."
    )
    tax_id: TaxID | None = Field(description="Validated tax ID, if provided.")
    default_payment_method_id: UUID | None = Field(
        description="Id of the card Spaire charges by default, if any."
    )


class PlatformBillingDetailsUpdate(Schema):
    billing_name: str | None = None
    billing_address: AddressInput | None = None
    tax_id: str | None = None


class PlatformOrder(Schema):
    """One past Spaire charge, trimmed to what the dashboard order-history
    table renders (invoice number, date, description, amount, status,
    whether an invoice PDF is downloadable)."""

    id: UUID
    created_at: datetime
    invoice_number: str | None = Field(description="Human invoice number.")
    description: str = Field(description="What the charge was for.")
    total_amount: int = Field(description="Charged amount in cents.")
    currency: str
    status: str = Field(description="Order status (paid, pending, refunded…).")
    refunded_amount: int = Field(description="Refunded amount in cents.")
    is_invoice_generated: bool = Field(
        description="Whether an invoice PDF exists to download."
    )


class PlatformOrderInvoice(Schema):
    url: str = Field(description="Signed URL to download the invoice PDF.")


class EmailSenderDomainStatus(Schema):
    domain: str | None = Field(
        description="Configured custom sender domain (None if cleared)."
    )
    verified_at: datetime | None = Field(
        description="When DKIM verification last succeeded."
    )
    resend_id: str | None = Field(
        description="Resend's domain id, present once registered."
    )
    dns_records: list[dict[str, str | int | None]] | None = Field(
        description=(
            "DNS records the creator must install (TXT/MX/CNAME). Each "
            "entry follows Resend's payload shape (record, name, value, "
            "type, status, ttl)."
        )
    )
