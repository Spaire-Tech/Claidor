# Draft Invoices / Sales-Assisted Billing — Technical Design

**Status**: Proposal
**Date**: 2026-02-22
**Author**: Engineering

## Problem Statement

Our current invoicing is "receipt-style" — invoices are generated post-payment as PDF receipts. We need sales-assisted billing where merchants can:

1. Create a draft invoice (manually-collected transaction)
2. Edit invoice items/customer details until ready
3. Issue/finalize the invoice (status = billed)
4. Let customers pay manually (bank transfer) or via checkout link
5. Have subscriptions created at issue-time for recurring lines, with renewals continuing as invoiced/manual collection

Target semantics inspired by Paddle: `draft → issued → paid → voided`

## Current Architecture Findings

### Payment Processor

- `PaymentProcessor` enum (`server/polar/enums.py:12`) has a single value: `stripe`
- No abstraction interface — conditional checks: `if payment_method.processor == PaymentProcessor.stripe`
- All checkouts hardcode `payment_processor=PaymentProcessor.stripe`

### Order Model (`server/polar/models/order.py`)

- `OrderStatus`: `pending → paid → refunded → partially_refunded`
- Orders created with immutable items and an `invoice_number` assigned immediately
- `stripe_invoice_id` field exists for legacy Stripe Billing integration
- `trigger_invoice_generation` enforces `order.paid` — purely post-payment PDF

### Subscription Model (`server/polar/models/subscription.py`)

- Polar runs its own billing engine (no longer delegates to Stripe Subscriptions)
- `legacy_stripe_subscription_id` is a migration artifact
- Scheduler at `server/polar/subscription/scheduler.py` handles renewal cycling
- Creates `BillingEntry` records, then `Order` with `status=pending`, then triggers `order.trigger_payment`
- No `collection_method` concept exists (all subscriptions auto-charge)

### Invoice Service (`server/polar/invoice/service.py`)

- PDF generation via FPDF, uploaded to S3
- `Invoice.from_order(order)` — requires a paid Order
- Separate payout invoice ("reverse invoice") generation for organizations

## Architecture Decision: New `ManualInvoice` Domain Model

### Why NOT Extend Order

The `Order` model is deeply coupled to "payment has happened or is imminent":
- Items are immutable once created (no update path)
- Invoice number assigned at creation — drafts shouldn't consume numbers
- `_create_order_from_checkout` and `create_subscription_order` assume financial finality
- Tax calculation happens at creation, but draft items change
- Adding a `draft` status would require invasive changes and risk regressions across checkout, renewal, refund, and payout flows

### Recommended: ManualInvoice creates an Order at issue-time

```
ManualInvoice (draft/editable) → [issue action] → Order (immutable financial record)
                                                 → Subscription (if recurring lines)
```

### Lifecycle: `draft → issued → paid → voided`

| Status  | Meaning |
|---------|---------|
| draft   | Editable. No invoice number, no financial commitment. |
| issued  | Finalized. Invoice number assigned, Order created (status=pending), subscription created if recurring. Customer can pay. |
| paid    | Order marked paid (via manual confirmation or checkout link payment). |
| voided  | Cancelled before payment. Order voided if created. |

## Data Models

### ManualInvoice (new table: `manual_invoices`)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| status | ManualInvoiceStatus | draft/issued/paid/voided |
| organization_id | FK → organizations | The seller |
| customer_id | FK → customers | Nullable in draft |
| currency | str(3) | Required |
| billing_name | str | Customer billing name |
| billing_address | Address | Customer billing address |
| tax_id | TaxID | Customer tax ID |
| due_date | datetime | Payment deadline |
| notes | text | Free-form memo |
| issued_at | datetime | When finalized |
| paid_at | datetime | When payment confirmed |
| voided_at | datetime | When cancelled |
| order_id | FK → orders | Set at issue-time |
| subscription_id | FK → subscriptions | Set at issue-time if recurring |
| checkout_id | FK → checkouts | Optional pay-via-checkout link |
| collection_method | enum | manual / checkout_link |
| metadata | JSONB | User-defined metadata |

### ManualInvoiceItem (new table: `manual_invoice_items`)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| manual_invoice_id | FK → manual_invoices | |
| description | str | Free-text line item |
| product_id | FK → products | Optional |
| product_price_id | FK → product_prices | Optional, for recurring |
| quantity | int | Default 1 |
| unit_amount | int | Cents |
| amount | int | quantity x unit_amount |
| is_recurring | bool | Drives subscription creation |

## API Endpoints

New module: `server/polar/manual_invoice/`

| Method | Path | Purpose |
|--------|------|---------|
| POST | /v1/manual-invoices | Create draft |
| GET | /v1/manual-invoices | List with filters |
| GET | /v1/manual-invoices/{id} | Get detail |
| PATCH | /v1/manual-invoices/{id} | Update draft |
| POST | /v1/manual-invoices/{id}/issue | Finalize |
| POST | /v1/manual-invoices/{id}/mark-paid | Manual payment confirmation |
| POST | /v1/manual-invoices/{id}/void | Cancel/void |
| DELETE | /v1/manual-invoices/{id} | Delete draft only |

## Issue Action — Core Logic

1. Validate draft completeness (customer, items, billing address)
2. Assign invoice number via `organization_service.get_next_invoice_number()`
3. Calculate tax using existing tax service
4. Create Order with `status=pending`, `billing_reason=manual_invoice`
5. Create OrderItems from ManualInvoiceItems
6. If recurring lines: Create Subscription with `status=active`, `collection_method=manual`
7. If collection_method=checkout_link: Create Checkout session, return URL
8. Update ManualInvoice status to `issued`
9. Send webhook `manual_invoice.issued`
10. Send customer email with invoice PDF + payment instructions

## Integration Approach

Provider-agnostic from the start, Stripe as first implementation.

- ManualInvoice model has zero Stripe references
- Manual confirmation: Admin clicks "mark paid" — no processor involved
- Checkout link: Uses existing Checkout flow (which routes through Stripe)
- Adding future processors only requires extending the Checkout abstraction

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Async state reconciliation (checkout webhook → ManualInvoice status) | Add listener in `order.handle_payment` to sync ManualInvoice status |
| Entitlement timing (issue vs paid) | Grant on issue by default (Paddle model); void action revokes |
| Partial failure in issue action | DB transaction for Order+Subscription; benefit grants as separate idempotent jobs |
| Invoice number gaps | Numbers assigned only at issue-time, not draft creation |
| Manual-collection subscription renewal | Branch in `create_subscription_order`: if `collection_method=manual`, create ManualInvoice instead of triggering payment |

## Difficulty Estimate

**Size: L — 6-8 engineering weeks full, 3-4 weeks MVP**

## MVP Scope

Backoffice-only, one-time items, manual payment confirmation:

- ManualInvoice + ManualInvoiceItem models + migration
- CRUD + issue + mark-paid + void endpoints
- Backoffice UI: list, create, edit draft, issue, mark paid, void
- One-time line items only (free-text description + amount)
- Manual payment confirmation only (no checkout link)
- Order created at issue-time (status=pending), marked paid manually
- Webhook events, customer email with PDF

Deferred: recurring lines, checkout link payment, customer portal, dashboard frontend, reminders, collection_method on Subscription.

## Phased Implementation

### Phase 1: Foundation (MVP) — ~3-4 weeks

Admin can create, edit, issue, and mark-paid a one-time manual invoice via backoffice.

| Step | Description | Acceptance Criteria |
|------|-------------|-------------------|
| 1.1 | Models + migration | Tables exist with correct schema |
| 1.2 | Repository + service | CRUD ops, issue creates Order with pending status |
| 1.3 | API endpoints | All 8 endpoints with proper auth |
| 1.4 | Backoffice list + create | Admin can see list, create draft |
| 1.5 | Backoffice edit + detail | Admin can edit items, view details |
| 1.6 | Issue + mark-paid | Finalize invoice, mark paid, PDF generated |
| 1.7 | Void flow | Voiding voids linked pending Order |
| 1.8 | Webhooks | manual_invoice.created/issued/paid/voided |
| 1.9 | Customer email | Email on issue with PDF attachment |

### Phase 2: Payment Collection — ~2 weeks

Customer can pay via checkout link.

| Step | Description |
|------|-------------|
| 2.1 | Checkout link generation at issue-time |
| 2.2 | Payment reconciliation (checkout → ManualInvoice paid) |
| 2.3 | Customer portal outstanding invoices view |
| 2.4 | Payment reminder cron |

### Phase 3: Recurring / Subscription — ~3 weeks

Recurring lines create subscriptions with manual collection.

| Step | Description |
|------|-------------|
| 3.1 | collection_method field on Subscription |
| 3.2 | Subscription creation at issue-time |
| 3.3 | Entitlement grants at issue-time |
| 3.4 | Manual-collection renewal creates ManualInvoice |
| 3.5 | Overdue handling + entitlement revocation |

### Phase 4: Dashboard Frontend — ~2 weeks

Full lifecycle management from Next.js merchant dashboard.

## Files Modified (Existing Code)

| File | Change | Phase |
|------|--------|-------|
| server/polar/models/__init__.py | Register new models | 1 |
| server/polar/models/order.py | Add manual_invoice billing reason | 1 |
| server/polar/models/webhook_endpoint.py | Add manual_invoice events | 1 |
| server/polar/backoffice/__init__.py | Register router | 1 |
| server/polar/backoffice/navigation.py | Add nav item | 1 |
| server/polar/order/service.py | handle_payment hook for ManualInvoice sync | 2 |
| server/polar/enums.py | Add CollectionMethod enum | 3 |
| server/polar/models/subscription.py | Add collection_method field | 3 |
| server/polar/subscription/service.py | create_from_manual_invoice + cycle branch | 3 |
