# Spaire Embedded Finance — Implementation Plan

## Executive Summary

This plan details how to evolve Spaire from "MoR + payouts" into a full business finance operating layer by integrating Stripe Treasury (Financial Accounts for platforms) and Stripe Issuing into the existing Polar codebase. Merchants will be able to hold funds in FDIC pass-through eligible accounts, spend via issued cards, and move money to vendors/contractors through ACH and wire transfers.

**Key simplification:** There are no live merchants today. This eliminates migration risk entirely and lets us design the account architecture and fund lifecycle cleanly from day one.

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Account Architecture Decision](#2-account-architecture-decision)
3. [Fund-State Lifecycle Engine](#3-fund-state-lifecycle-engine)
4. [Target Architecture](#4-target-architecture)
5. [Implementation Phases](#5-implementation-phases)
   - Phase 0: Connect Account Foundation + Fund Lifecycle
   - Phase 1: Treasury Foundation (Financial Accounts + Balances)
   - Phase 2: Card Issuing
   - Phase 3: Money Movement (ACH / Wire / Checks)
   - Phase 4: Frontend Embedded Components
   - Phase 5: Rewards & Cash Back
6. [Database Schema Changes](#6-database-schema-changes)
7. [API Design](#7-api-design)
8. [Webhook Handling](#8-webhook-handling)
9. [Risk-Clearance Policy Gate](#9-risk-clearance-policy-gate)
10. [Policy Controls & Feature Flags](#10-policy-controls--feature-flags)
11. [Testing Strategy](#11-testing-strategy)
12. [Open Questions & Decisions](#12-open-questions--decisions)

---

## 1. Current Architecture Analysis

### What exists today

| Layer | Current State |
|---|---|
| **Connect accounts** | Stripe v2 Express accounts (`dashboard: "express"`) with `recipient` + `merchant` configurations |
| **Capabilities** | `card_payments` (merchant), `stripe_transfers` + `payouts` (recipient) |
| **Fund flow** | Customer pays Polar → Polar transfers to merchant's Connect account → Merchant receives payout to bank |
| **Transaction ledger** | Rich `Transaction` model with types: `payment`, `processor_fee`, `refund`, `dispute`, `balance`, `payout` |
| **Payout flow** | Two-step: (1) `stripe.Transfer` from Polar to merchant Connect account, (2) `stripe.Payout` from merchant account to bank |
| **Account model** | `Account` table with `stripe_id`, status lifecycle (`CREATED → ONBOARDING_STARTED → UNDER_REVIEW → ACTIVE`), fee configuration |
| **Risk controls** | `HeldBalance` system, account review thresholds, identity verification |
| **API version** | `2026-02-25`, using `stripe_client` (StripeClient) for v2 and `stripe_lib` for v1 |

### Key files

- `server/polar/account/service.py` — Account lifecycle (create, onboard, update)
- `server/polar/integrations/stripe/service.py` — Stripe API wrapper (v2 accounts, v1 payments/transfers/payouts)
- `server/polar/integrations/stripe/tasks.py` — Webhook handlers
- `server/polar/payout/service.py` — Two-step payout orchestration
- `server/polar/models/account.py` — Account model (Express Connect)
- `server/polar/models/transaction.py` — Ledger (payment, balance, payout, fees)
- `server/polar/models/payout.py` — Payout records
- `server/polar/models/payment.py` — Payment records

---

## 2. Account Architecture Decision

### The core blocker

**Stripe Treasury and Issuing require Custom connected accounts.** The current codebase uses Express accounts (v2 API with `dashboard: "express"`). There is no in-place migration path from Express to Custom. Additionally, the Accounts v2 API does not support Treasury and Issuing workflows — v1 must be used for `treasury` and `card_issuing` capabilities.

### What Custom accounts require

```python
# Custom account creation (v1 API)
stripe.Account.create(
    type="custom",
    country="US",
    capabilities={
        "card_payments": {"requested": True},
        "transfers": {"requested": True},
        "treasury": {"requested": True},
        "card_issuing": {"requested": True},
        "us_bank_account_ach_payments": {"requested": True},
    },
    controller={
        "stripe_dashboard": {"type": "none"},
        "fees": {"payer": "application"},
        "losses": {"payments": "application"},
        "requirement_collection": "application",
    },
)
```

### Key differences: Express vs Custom

| Aspect | Express (current code) | Custom (required for Treasury/Issuing) |
|---|---|---|
| Dashboard | Stripe-hosted | None (platform provides UI) |
| KYC collection | Stripe handles | Platform must collect & submit |
| Loss liability | Shared | Platform bears full liability |
| Requirement collection | Stripe handles | Platform handles |
| Treasury/Issuing | Not supported | Supported |
| API | v2 Accounts API | v1 Accounts API (for treasury/issuing capabilities) |

### Chosen architecture: Dual-track

Since there are no live merchants, we aren't forced to pick one path under migration pressure. The recommended design:

- **Express rail** — Kept for standard payout-oriented operations. Some future merchants may not need or want embedded finance; they just want to sell and get paid out. This path keeps the existing Express account flow intact.
- **Custom rail** — Created for embedded-finance opt-ins. Merchants who want Treasury, Issuing, and programmable money movement go through the Custom account onboarding.

The dual-track is a deliberate product architecture choice (two tiers of merchant experience), not a migration compromise. The codebase routes through `account_mode` at every decision point.

**Because there are no existing merchants to migrate, both rails can be built and tested cleanly before launch.** No re-onboarding burden, no data migration, no disruption risk.

---

## 3. Fund-State Lifecycle Engine

### Fund states

Every dollar flowing through Spaire will be categorized by a formal lifecycle state:

```
┌──────────────────────────────────────────────────────────────────┐
│                      Fund State Machine                         │
│                                                                  │
│   ┌─────────┐     ┌───────────┐     ┌─────────┐     ┌──────────┐│
│   │ pending │────▶│ available │────▶│ reserve │     │spendable ││
│   │         │     │           │──┬──▶│         │     │          ││
│   └─────────┘     └───────────┘  │   └─────────┘     └──────────┘│
│       ▲               │         │       ▲                ▲       │
│       │               │         │       │                │       │
│   Payment         Risk clear    │   Risk/compliance  Available   │
│   received        + policy OK   │   hold triggered   minus      │
│                                 │                    reserve     │
│                                 └───────────────────▶ floor     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| State | Meaning | What can happen |
|---|---|---|
| `pending` | Funds received but not yet cleared by MoR policy | Cannot be spent, transferred, or paid out. Visible as "pending" in dashboard. |
| `available` | Cleared by risk-clearance policy gate; eligible for movement | Can transition to `reserve` (held back) or `spendable` (released for use). |
| `reserve` | Held back for risk/compliance coverage (e.g., chargeback buffer) | Cannot be spent. Released back to `available` when reserve floor recalculates downward. |
| `spendable` | Eligible for card spend, ACH/wire outbound, or bank transfer | The actual operating cash. Funds in the Treasury Financial Account that can be used. |

### State transitions

| Transition | Trigger | Logic |
|---|---|---|
| `pending → available` | Risk-clearance policy gate passes | Pending window duration elapsed AND no restriction flags |
| `available → reserve` | Reserve floor calculation | `reserve_amount = total_available * reserve_floor_basis_points / 10_000` |
| `available → spendable` | Remainder after reserve allocation | `spendable = available - reserve` |
| `spendable → pending` | Refund/dispute clawback | Funds returned to pending while dispute resolves |
| `reserve → available` | Reserve floor recalculation (downward) | When reserve requirement decreases, excess released |
| Any → `restricted` | Account under review / denied / temporarily restricted | All transitions frozen until restriction lifts |

### Issuing readiness states

In parallel with fund states, each merchant account tracks its readiness to use Issuing features:

| State | Meaning |
|---|---|
| `onboarding_required` | Account exists but has not started Custom account onboarding for Issuing |
| `onboarding_in_progress` | Merchant has started onboarding; KYB/KYC pending with Stripe |
| `issuing_active` | All capabilities active; cards can be created and used |
| `temporarily_restricted` | Issuing paused due to risk event, compliance hold, or Stripe-initiated restriction |

### Dashboard integration

These states will be surfaced in organization payment-status APIs so the dashboard can explain "why funds are/aren't spendable" in plain terms:

```json
// GET /v1/organizations/{org}/finance/status
{
  "fund_summary": {
    "pending_amount": 150000,       // $1,500.00 pending clearance
    "available_amount": 500000,     // $5,000.00 cleared
    "reserve_amount": 50000,        // $500.00 held for risk coverage
    "spendable_amount": 450000,     // $4,500.00 available to spend
    "total_amount": 1150000
  },
  "issuing_status": "issuing_active",
  "restrictions": [],
  "pending_explanation": "3 payments are within the 7-day pending window",
  "reserve_explanation": "10% reserve floor applied per policy"
}
```

---

## 4. Target Architecture

### Fund flow after embedded finance

```
                        ┌──────────────────────────────────────────┐
                        │              Spaire Platform             │
                        │         (Merchant of Record)             │
                        └──────────┬───────────────────────────────┘
                                   │
                     Customer pays │ (Stripe Charge on platform account)
                                   │
                      ┌────────────▼────────────────────────────┐
                      │   Fund-State Lifecycle Engine            │
                      │                                          │
                      │   pending ──▶ available ──▶ reserve      │
                      │                    │                     │
                      │                    └──▶ spendable        │
                      │                                          │
                      │   Risk-clearance policy gate evaluates:  │
                      │   • pending window duration              │
                      │   • reserve floor requirement            │
                      │   • restriction status                   │
                      └────────────┬────────────────────────────┘
                                   │
                     Spendable     │ (Transfer to Financial Account)
                     funds clear   │
                                   │
              ┌────────────────────▼────────────────────┐
              │                                         │
     ┌────────▼──────────┐               ┌──────────────▼──────────┐
     │  Legacy Payout    │               │  Treasury Financial     │
     │  (Express accts)  │               │  Account (Custom accts) │
     │                   │               │                         │
     │  Transfer → Bank  │               │  ┌─────────────────┐   │
     └───────────────────┘               │  │ Spendable       │   │
                                         │  │ Balance         │   │
                                         │  │ (FDIC eligible) │   │
                                         │  └──┬──┬──┬──┬─────┘   │
                                         │     │  │  │  │         │
                                         └─────┼──┼──┼──┼─────────┘
                                               │  │  │  │
                          ┌────────────────────┘  │  │  └──────────────────┐
                          │                       │  │                     │
                   ┌──────▼──────┐     ┌──────────▼──▼───────┐    ┌───────▼───────┐
                   │  Issued     │     │  OutboundPayment    │    │  Outbound     │
                   │  Cards      │     │  (ACH/Wire to       │    │  Transfer     │
                   │  (virtual   │     │   vendors/          │    │  (to own      │
                   │  + physical)│     │   contractors)      │    │   bank acct)  │
                   └─────────────┘     └─────────────────────┘    └───────────────┘
```

### Key architectural principles

1. **MoR compliance stays first-class** — Funds only flow to Treasury after clearing the risk-clearance policy gate. Treasury is downstream of compliance, never a bypass.
2. **Fund states are the source of truth** — Every dollar is in exactly one state (`pending`, `available`, `reserve`, `spendable`). The lifecycle engine governs all transitions.
3. **Treasury replaces "payout queue"** — Instead of funds sitting in a payout queue waiting for withdrawal, cleared funds move to the merchant's Financial Account where they become operating cash.
4. **Cards spend from spendable balance only** — Issued cards draw from Treasury Financial Account balance, which only contains funds that have passed through the full lifecycle.
5. **Existing ledger extended, not replaced** — New `TransactionType` values added for treasury movements; existing ledger stays intact.
6. **Feature-gated and policy-controlled** — Embedded finance is controlled by feature flags and configurable policy parameters (pending window, reserve floor).

---

## 5. Implementation Phases

### Phase 0: Connect Account Foundation + Fund Lifecycle Engine

**Goal:** Build the Custom account infrastructure and the fund-state lifecycle that governs all downstream phases.

#### 0a: Custom Account Rail

1. **Add `AccountMode` enum to Account model**
   - Values: `express` (standard payout merchants), `custom` (embedded finance merchants)
   - Since no live merchants exist, both paths are clean implementations

2. **Create `StripeService.create_custom_account()` method**
   - Uses v1 Accounts API (`stripe.Account.create(type="custom", ...)`)
   - Requests capabilities: `transfers`, `treasury`, `card_issuing`, `us_bank_account_ach_payments`
   - Sets controller: `stripe_dashboard.type=none`, `fees.payer=application`, `losses.payments=application`, `requirement_collection=application`

3. **Build Custom account onboarding flow**
   - **Recommendation:** Use **embedded onboarding components** (Connect embedded components with `account_onboarding` component type). This gives branded onboarding without building KYC collection from scratch.
   - For Custom accounts, you must collect requirements up front (no incremental onboarding)
   - Track issuing readiness states: `onboarding_required → onboarding_in_progress → issuing_active → temporarily_restricted`

4. **Webhook handling for Custom account events**
   - `account.updated` — capability status changes
   - `capability.updated` — individual capability activation (`treasury`, `card_issuing`)
   - Map capability status changes to issuing readiness state transitions

5. **Account Link / Embedded Onboarding generation**
   - `stripe.AccountLink.create(account=acct_id, type="account_onboarding", ...)` (v1)
   - Or use embedded Account Onboarding component via AccountSession

#### 0b: Fund-State Lifecycle Engine

6. **New module: `server/polar/fund_lifecycle/`**
   ```
   fund_lifecycle/
   ├── __init__.py
   ├── engine.py            # State machine + transition logic
   ├── service.py           # Business logic (recalculation, queries)
   ├── repository.py        # Database queries for fund states
   ├── schemas.py           # Pydantic models for fund summaries
   ├── tasks.py             # Scheduled + event-driven recalculation jobs
   └── policy.py            # Policy configuration (pending window, reserve floor)
   ```

7. **Fund state tracking**
   - Each balance entry (or aggregate per account) carries a `fund_state` enum
   - State transitions are logged as events for auditability
   - The engine runs two recalculation modes:
     - **Scheduled recalculation** — Periodic cron job (e.g., every 15 minutes) that evaluates all accounts
     - **Targeted recalculation** — Triggered by specific events (payment received, refund, dispute, hold released, risk review completed)

8. **Policy evaluation logic**
   ```python
   class RiskClearancePolicy:
       async def evaluate(self, account: Account) -> FundStateResult:
           # 1. Check pending window duration
           pending_cutoff = now() - timedelta(days=self.pending_window_days)
           clearable = await self.get_payments_before(account, pending_cutoff)

           # 2. Check restriction statuses
           if account.status in (Status.UNDER_REVIEW, Status.DENIED):
               return FundStateResult(all_restricted=True)
           if account.issuing_status == IssuingStatus.TEMPORARILY_RESTRICTED:
               return FundStateResult(issuing_restricted=True)

           # 3. Compute reserve floor
           total_available = sum(clearable)
           reserve_amount = (total_available * self.reserve_floor_bps) // 10_000
           spendable_amount = total_available - reserve_amount

           # 4. Return projected state
           return FundStateResult(
               pending=...,
               available=total_available,
               reserve=reserve_amount,
               spendable=spendable_amount,
           )
   ```

9. **Projected issuing balance in account metadata**
   - Until full ledger-backed settlement is finalized, the system computes projected issuing balances and stores them in account metadata
   - This drives the dashboard display and authorization decisions
   - As the system matures, these projections are replaced by real ledger balances

#### Database migration (Phase 0)

```sql
-- Account enhancements
ALTER TABLE accounts ADD COLUMN account_mode VARCHAR(10) NOT NULL DEFAULT 'express';
ALTER TABLE accounts ADD COLUMN treasury_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN issuing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN issuing_status VARCHAR(30) NOT NULL DEFAULT 'onboarding_required';
ALTER TABLE accounts ADD COLUMN fund_metadata JSONB NOT NULL DEFAULT '{}';

-- Fund state tracking
CREATE TABLE fund_state_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    account_id UUID NOT NULL REFERENCES accounts(id),
    transaction_id UUID REFERENCES transactions(id),
    state VARCHAR(20) NOT NULL,  -- 'pending', 'available', 'reserve', 'spendable'
    amount BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    pending_until TIMESTAMPTZ,   -- When pending window expires
    transitioned_at TIMESTAMPTZ, -- When state last changed
    previous_state VARCHAR(20),
    transition_reason TEXT
);
CREATE INDEX idx_fund_state_account_state ON fund_state_entries(account_id, state);

-- Fund state snapshots (cached aggregates for fast reads)
CREATE TABLE fund_state_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    account_id UUID NOT NULL REFERENCES accounts(id) UNIQUE,
    pending_amount BIGINT NOT NULL DEFAULT 0,
    available_amount BIGINT NOT NULL DEFAULT 0,
    reserve_amount BIGINT NOT NULL DEFAULT 0,
    spendable_amount BIGINT NOT NULL DEFAULT 0,
    last_recalculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    policy_config JSONB NOT NULL DEFAULT '{}'
);

-- Policy configuration (global + per-account overrides)
CREATE TABLE fund_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    account_id UUID REFERENCES accounts(id),  -- NULL = global default
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    pending_window_days INTEGER NOT NULL DEFAULT 7,
    reserve_floor_basis_points INTEGER NOT NULL DEFAULT 1000,  -- 10%
    CONSTRAINT uq_fund_policy_account UNIQUE (account_id)
);
```

---

### Phase 1: Treasury Foundation (Financial Accounts + Balances)

**Goal:** Merchants with Custom accounts can have a Financial Account that holds their spendable balance as operating cash.

#### Backend tasks

1. **New module: `server/polar/treasury/`**
   ```
   treasury/
   ├── __init__.py
   ├── endpoints.py      # FastAPI routes
   ├── service.py         # Business logic
   ├── repository.py      # Database queries
   ├── schemas.py         # Pydantic models
   └── tasks.py           # Background jobs + webhooks
   ```

2. **Create Financial Account for Custom merchants**
   ```python
   stripe.treasury.FinancialAccount.create(
       supported_currencies=["usd"],
       features={
           "card_issuing": {"requested": True},
           "deposit_insurance": {"requested": True},
           "financial_addresses": {"aba": {"requested": True}},
           "inbound_transfers": {"ach": {"requested": True}},
           "intra_stripe_flows": {"requested": True},
           "outbound_payments": {
               "ach": {"requested": True},
               "us_domestic_wire": {"requested": True},
           },
           "outbound_transfers": {
               "ach": {"requested": True},
               "us_domestic_wire": {"requested": True},
           },
       },
       stripe_account=connected_account_id,
   )
   ```

3. **New database model: `FinancialAccount`**
   - `id` (UUID, PK)
   - `account_id` (FK → accounts)
   - `stripe_financial_account_id` (string, Stripe FA ID `fa_xxx`)
   - `status` (`open`, `closed`)
   - `supported_currencies` (JSON array)
   - `aba_routing_number` (string, populated when `financial_addresses.aba` activates)
   - `aba_account_number` (string, encrypted)
   - `features_status` (JSONB — tracks which features are active/pending/restricted)
   - `balance_cash` (integer, cents — cached from Stripe)
   - `balance_inbound_pending` (integer, cents — cached)
   - `balance_outbound_pending` (integer, cents — cached)
   - `created_at`, `updated_at`

4. **Fund routing: lifecycle engine → Treasury**
   - When the fund-state lifecycle engine transitions funds to `spendable`:
     - **Transfer from Polar platform → Merchant's Financial Account** using `IntraStripeFlows` (Transfer that lands in the FA)
     - The funds become immediately available as operating cash in the FA
   - The existing `payout_service.transfer_stripe()` method needs a conditional branch:
     - `account_mode == "express"` → existing Transfer + Payout flow
     - `account_mode == "custom"` → Transfer that routes to Financial Account
   - Only `spendable` funds (post reserve floor) are eligible for FA transfer

5. **Balance sync service**
   - Periodically sync Financial Account balances from Stripe
   - React to `treasury.financial_account.balance_updated` webhook
   - Cache balances locally for fast dashboard reads
   - Cross-check with fund-state snapshot for consistency

6. **Transaction integration**
   - Add new `TransactionType` values:
     - `treasury_inflow` — funds moved into Financial Account
     - `treasury_outflow` — funds moved out of Financial Account (card spend, ACH, wire)
   - Link Treasury transactions to existing ledger entries

#### Key Stripe API calls
- `stripe.treasury.FinancialAccount.create()` — Create FA
- `stripe.treasury.FinancialAccount.retrieve()` — Get FA + balance
- `stripe.treasury.Transaction.list()` — List transactions in FA
- `stripe.treasury.TransactionEntry.list()` — Detailed entries

---

### Phase 2: Card Issuing

**Goal:** Merchants can create virtual and physical cards that spend from their Financial Account (spendable) balance.

#### Backend tasks

1. **New module: `server/polar/issuing/`**
   ```
   issuing/
   ├── __init__.py
   ├── endpoints.py       # Card & cardholder management routes
   ├── service.py          # Business logic
   ├── repository.py       # Database queries
   ├── schemas.py          # Pydantic models
   └── tasks.py            # Webhooks + background jobs
   ```

2. **Cardholder management**
   ```python
   stripe.issuing.Cardholder.create(
       name="Jane Doe",
       email="jane@merchant.com",
       phone_number="+15551234567",
       type="individual",  # or "company"
       billing={
           "address": { ... }
       },
       stripe_account=connected_account_id,
   )
   ```

3. **Card creation**
   ```python
   stripe.issuing.Card.create(
       cardholder=cardholder_id,
       currency="usd",
       type="virtual",  # or "physical"
       status="active",
       spending_controls={
           "spending_limits": [
               {"amount": 500000, "interval": "monthly"},  # $5,000/month
           ],
           "allowed_categories": [...],
           "blocked_categories": [...],
       },
       financial_account=financial_account_id,  # Fund from Treasury FA
       stripe_account=connected_account_id,
   )
   ```

4. **New database models**

   **`Cardholder`**
   - `id` (UUID, PK)
   - `account_id` (FK → accounts)
   - `stripe_cardholder_id` (string)
   - `name`, `email`, `phone`
   - `type` (`individual`, `company`)
   - `status` (`active`, `inactive`, `blocked`)
   - `billing_address` (JSONB)

   **`IssuedCard`**
   - `id` (UUID, PK)
   - `cardholder_id` (FK → cardholders)
   - `financial_account_id` (FK → financial_accounts)
   - `stripe_card_id` (string)
   - `type` (`virtual`, `physical`)
   - `status` (`active`, `inactive`, `canceled`)
   - `last4` (string)
   - `exp_month`, `exp_year` (integer)
   - `spending_controls` (JSONB)
   - `shipping_status` (string, for physical cards)

5. **Authorization handling**
   - `issuing_authorization.request` webhook → real-time approve/decline
   - Apply Spaire-level controls on top of Stripe spending controls:
     - Account `issuing_status` must be `issuing_active`
     - Financial Account has sufficient `spendable` balance (not `reserve`)
     - No MoR compliance holds or account restrictions active
     - Custom merchant-configured spending limits pass
   - Return `approved: true/false` within Stripe's webhook timeout (~2 seconds)

6. **Transaction recording**
   - `issuing_transaction.created` webhook → record card spend in ledger
   - Link to existing `Transaction` model with type `treasury_outflow` and a new `issuing_transaction_id` reference

---

### Phase 3: Money Movement (ACH / Wire / Checks)

**Goal:** Merchants can pay vendors, contractors, and others from their Financial Account via ACH, domestic wire, or check (where supported).

#### Backend tasks

1. **New module: `server/polar/money_movement/`** (or extend `server/polar/treasury/`)
   ```
   money_movement/
   ├── __init__.py
   ├── endpoints.py         # Payment creation/management routes
   ├── service.py            # Business logic
   ├── schemas.py            # Pydantic models
   ├── repository.py         # Database queries
   └── tasks.py              # Webhooks + async job handlers
   ```

2. **Recipient management**
   - Merchants create "recipients" (payees) with bank account details
   - Use Stripe `PaymentMethod` or `BankAccount` objects attached to the FA
   - Store locally for quick reference:

   **`PaymentRecipient`** model
   - `id` (UUID, PK)
   - `account_id` (FK → accounts)
   - `name`, `email`
   - `type` (`individual`, `company`)
   - `stripe_payment_method_id` (string — the bank account PM)
   - `bank_name`, `last4`, `routing_number_last4` (display fields)
   - `billing_address` (JSONB — required for wire)

3. **OutboundPayment (ACH/Wire to third parties)**
   ```python
   stripe.treasury.OutboundPayment.create(
       financial_account=fa_id,
       amount=50000,  # $500.00
       currency="usd",
       destination_payment_method=payment_method_id,
       description="Invoice #1234 - Contractor payment",
       statement_descriptor="SPAIRE PAY",
       stripe_account=connected_account_id,
   )
   ```
   - Pre-check: requested amount must not exceed `spendable` balance (after reserve floor)
   - Pre-check: account `issuing_status` must be `issuing_active` (or a separate `banking_active` status if decoupled)

4. **OutboundTransfer (to merchant's own bank account)**
   ```python
   stripe.treasury.OutboundTransfer.create(
       financial_account=fa_id,
       amount=100000,  # $1,000.00
       currency="usd",
       destination_payment_method=payment_method_id,
       description="Withdrawal to operating account",
       stripe_account=connected_account_id,
   )
   ```

5. **New database models**

   **`OutboundPaymentRecord`**
   - `id` (UUID, PK)
   - `account_id` (FK → accounts)
   - `financial_account_id` (FK → financial_accounts)
   - `recipient_id` (FK → payment_recipients)
   - `stripe_outbound_payment_id` (string)
   - `amount`, `currency`
   - `method` (`ach`, `us_domestic_wire`)
   - `status` (`processing`, `posted`, `failed`, `canceled`, `returned`)
   - `description`, `statement_descriptor`
   - `expected_arrival_date` (date)
   - `failure_reason` (string, nullable)
   - `transaction_id` (FK → transactions)

   **`OutboundTransferRecord`** (similar schema for own-bank withdrawals)

6. **Checks (future/dependent on partner capabilities)**
   - Check receiving is handled by the ABA routing number + account number on the Financial Account
   - Incoming checks arrive as `ReceivedCredit` objects with `network: "ach"` or via check processing partner
   - This is largely automatic once `financial_addresses.aba` is active
   - Outbound check writing may require additional Stripe partner capabilities or a third-party service (e.g., Lob, Checkbook.io)

7. **Transaction recording**
   - All outbound movements create `Transaction` records with appropriate types
   - Link to `OutboundPaymentRecord` or `OutboundTransferRecord`

---

### Phase 4: Frontend Embedded Components

**Goal:** Merchants see their Financial Account, fund states, cards, transactions, and money movement controls in the Spaire dashboard.

#### Stripe Connect Embedded Components

Stripe provides pre-built, PCI-compliant embedded components that dramatically reduce frontend work:

| Component | Purpose | Priority |
|---|---|---|
| `notification-banner` | Risk/compliance alerts from Stripe | **Must have** (Stripe requires this) |
| `account-onboarding` | KYC collection for Custom accounts | **Must have** |
| `financial-account` | Show FA balance, account details, ABA info | **Must have** |
| `financial-account-transactions` | Transaction history for FA | **Must have** |
| `issuing-cards-list` | List, create, manage cards | **Must have** |
| `issuing-card` | Individual card details, spend controls, PAN reveal | **Must have** |
| `account-management` | Manage account details, requirements | **Should have** |

#### Integration approach

1. **Backend: Account Session creation**
   ```python
   # New endpoint: POST /v1/integrations/stripe/account-session
   stripe.AccountSession.create(
       account=connected_account_id,
       components={
           "notification_banner": {"enabled": True},
           "financial_account": {
               "enabled": True,
               "features": {"external_account_collection": True},
           },
           "financial_account_transactions": {"enabled": True},
           "issuing_cards_list": {
               "enabled": True,
               "features": {
                   "card_management": True,
                   "cardholder_management": True,
                   "card_spend_dispute_management": True,
                   "spend_control_management": True,
               },
           },
           "issuing_card": {
               "enabled": True,
               "features": {
                   "card_management": True,
                   "card_spend_dispute_management": True,
                   "spend_control_management": True,
               },
           },
       },
   )
   ```

2. **Frontend: New dashboard pages** (in `clients/apps/web/`)

   **New routes:**
   - `/dashboard/{org}/finance` — Overview (fund state summary, FA balance, recent transactions, card summary)
   - `/dashboard/{org}/finance/accounts` — Financial Account details (embedded `financial-account` + `financial-account-transactions`)
   - `/dashboard/{org}/finance/cards` — Card management (embedded `issuing-cards-list`)
   - `/dashboard/{org}/finance/cards/{id}` — Individual card (embedded `issuing-card`)
   - `/dashboard/{org}/finance/payments` — Outbound payments (custom UI for ACH/wire)
   - `/dashboard/{org}/finance/recipients` — Manage payment recipients

3. **Stripe.js Connect embedded component integration**
   ```tsx
   // Install @stripe/connect-js
   import { loadConnectAndInitialize } from "@stripe/connect-js";

   const stripeConnectInstance = loadConnectAndInitialize({
     publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
     fetchClientSecret: async () => {
       // Call backend to create AccountSession
       const response = await api.createAccountSession();
       return response.client_secret;
     },
   });

   // Render components
   <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
     <ConnectNotificationBanner />
     <ConnectFinancialAccount financialAccount={faId} />
     <ConnectIssuingCardsList />
   </ConnectComponentsProvider>
   ```

4. **Fund state dashboard (custom, Spaire-built)**
   - Visual breakdown: pending | available | reserve | spendable
   - Explanatory text for each state ("3 payments clearing in 4 days", "10% reserve held for risk coverage")
   - State transition history timeline
   - This is NOT a Stripe embedded component — it's Spaire's value-add UX on top of the lifecycle engine

5. **Custom UI for money movement**
   - Stripe doesn't provide embedded components for OutboundPayment/OutboundTransfer creation
   - Build custom forms:
     - "Pay a vendor" flow (select recipient → enter amount → choose ACH or wire → confirm)
     - "Transfer to bank" flow (select bank account → enter amount → confirm)
   - Use Polar's existing design system (`clients/packages/ui/`)

6. **Finance overview dashboard**
   - Fund state breakdown (pending / available / reserve / spendable)
   - Financial Account balance (cash + pending inbound - pending outbound)
   - Recent transactions (pulled from Treasury API or local cache)
   - Active cards summary
   - Quick actions (issue card, pay vendor, transfer to bank)
   - Issuing readiness status with call-to-action for onboarding

---

### Phase 5: Rewards & Cash Back

**Goal:** Offer card rewards/cash back as a program feature where supported by the issuing program.

#### Considerations

- Stripe Issuing supports **rewards programs** through partner bank arrangements
- This is typically configured at the **program level** with Stripe, not per-card
- Implementation depends on what the Stripe partnership agreement allows
- Cash back is typically credited to the Financial Account balance automatically

#### Tasks (once program terms are established)

1. **Display rewards in dashboard**
   - Show accrued rewards balance
   - Show rewards earned per transaction
   - Allow redemption (typically auto-credited)

2. **Rewards tracking in ledger**
   - New `TransactionType`: `reward_credit`
   - Record reward payouts as income to the Financial Account

3. **Reward notifications**
   - Webhook-driven notifications when rewards are credited

> **Note:** This phase depends heavily on the Stripe issuing program terms negotiated separately. The technical implementation is relatively simple once the business terms are settled.

---

## 6. Database Schema Changes

### New tables

```sql
-- Fund state tracking (Phase 0)
CREATE TABLE fund_state_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    account_id UUID NOT NULL REFERENCES accounts(id),
    transaction_id UUID REFERENCES transactions(id),
    state VARCHAR(20) NOT NULL,  -- 'pending', 'available', 'reserve', 'spendable'
    amount BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    pending_until TIMESTAMPTZ,
    transitioned_at TIMESTAMPTZ,
    previous_state VARCHAR(20),
    transition_reason TEXT
);
CREATE INDEX idx_fund_state_account_state ON fund_state_entries(account_id, state);

-- Fund state snapshots — cached aggregates for fast reads (Phase 0)
CREATE TABLE fund_state_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    account_id UUID NOT NULL REFERENCES accounts(id) UNIQUE,
    pending_amount BIGINT NOT NULL DEFAULT 0,
    available_amount BIGINT NOT NULL DEFAULT 0,
    reserve_amount BIGINT NOT NULL DEFAULT 0,
    spendable_amount BIGINT NOT NULL DEFAULT 0,
    last_recalculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    policy_config JSONB NOT NULL DEFAULT '{}'
);

-- Fund policies — global defaults + per-account overrides (Phase 0)
CREATE TABLE fund_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    account_id UUID REFERENCES accounts(id),  -- NULL = global default
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    pending_window_days INTEGER NOT NULL DEFAULT 7,
    reserve_floor_basis_points INTEGER NOT NULL DEFAULT 1000,  -- 10%
    CONSTRAINT uq_fund_policy_account UNIQUE (account_id)
);

-- Financial accounts — Stripe Treasury (Phase 1)
CREATE TABLE financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    account_id UUID NOT NULL REFERENCES accounts(id),
    stripe_financial_account_id VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    supported_currencies JSONB NOT NULL DEFAULT '["usd"]',
    aba_routing_number VARCHAR(20),
    aba_account_number_encrypted TEXT,  -- Encrypted at rest
    features_status JSONB NOT NULL DEFAULT '{}',
    balance_cash BIGINT NOT NULL DEFAULT 0,
    balance_inbound_pending BIGINT NOT NULL DEFAULT 0,
    balance_outbound_pending BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_financial_account_account FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Cardholders — Stripe Issuing (Phase 2)
CREATE TABLE cardholders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    account_id UUID NOT NULL REFERENCES accounts(id),
    stripe_cardholder_id VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(254),
    phone VARCHAR(20),
    type VARCHAR(20) NOT NULL DEFAULT 'individual',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    billing_address JSONB
);

-- Issued cards — Stripe Issuing (Phase 2)
CREATE TABLE issued_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    cardholder_id UUID NOT NULL REFERENCES cardholders(id),
    financial_account_id UUID NOT NULL REFERENCES financial_accounts(id),
    stripe_card_id VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL,  -- 'virtual' or 'physical'
    status VARCHAR(20) NOT NULL DEFAULT 'inactive',
    last4 VARCHAR(4),
    exp_month INTEGER,
    exp_year INTEGER,
    spending_controls JSONB DEFAULT '{}',
    shipping_status VARCHAR(50),
    shipping_tracking_number VARCHAR(255),
    canceled_reason VARCHAR(100)
);

-- Payment recipients — for outbound payments (Phase 3)
CREATE TABLE payment_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    account_id UUID NOT NULL REFERENCES accounts(id),
    stripe_payment_method_id VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(254),
    type VARCHAR(20) NOT NULL DEFAULT 'individual',
    bank_name VARCHAR(255),
    last4 VARCHAR(4),
    routing_number_last4 VARCHAR(4),
    billing_address JSONB
);

-- Outbound payment records (Phase 3)
CREATE TABLE outbound_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    account_id UUID NOT NULL REFERENCES accounts(id),
    financial_account_id UUID NOT NULL REFERENCES financial_accounts(id),
    recipient_id UUID REFERENCES payment_recipients(id),
    stripe_outbound_payment_id VARCHAR(100) UNIQUE,
    amount BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    method VARCHAR(30) NOT NULL,  -- 'ach', 'us_domestic_wire'
    status VARCHAR(30) NOT NULL DEFAULT 'processing',
    description TEXT,
    statement_descriptor VARCHAR(100),
    expected_arrival_date DATE,
    failure_reason VARCHAR(255),
    transaction_id UUID REFERENCES transactions(id)
);

-- Outbound transfer records — to merchant's own bank (Phase 3)
CREATE TABLE outbound_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    account_id UUID NOT NULL REFERENCES accounts(id),
    financial_account_id UUID NOT NULL REFERENCES financial_accounts(id),
    stripe_outbound_transfer_id VARCHAR(100) UNIQUE,
    amount BIGINT NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'usd',
    method VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'processing',
    description TEXT,
    expected_arrival_date DATE,
    failure_reason VARCHAR(255),
    transaction_id UUID REFERENCES transactions(id)
);
```

### Modified tables

```sql
-- accounts table additions
ALTER TABLE accounts ADD COLUMN account_mode VARCHAR(10) NOT NULL DEFAULT 'express';
ALTER TABLE accounts ADD COLUMN treasury_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN issuing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN issuing_status VARCHAR(30) NOT NULL DEFAULT 'onboarding_required';
ALTER TABLE accounts ADD COLUMN fund_metadata JSONB NOT NULL DEFAULT '{}';

-- transactions table: extend TransactionType enum
-- Add: 'treasury_inflow', 'treasury_outflow', 'card_spend', 'reward_credit'
-- Add new FK columns:
ALTER TABLE transactions ADD COLUMN financial_account_id UUID REFERENCES financial_accounts(id);
ALTER TABLE transactions ADD COLUMN outbound_payment_id UUID REFERENCES outbound_payments(id);
ALTER TABLE transactions ADD COLUMN outbound_transfer_id UUID REFERENCES outbound_transfers(id);
ALTER TABLE transactions ADD COLUMN issuing_transaction_id VARCHAR(100);
```

---

## 7. API Design

### New endpoints

Following the existing Polar pattern (`{module}/endpoints.py`):

```
# Fund Lifecycle
GET    /v1/organizations/{org}/finance/status            # Fund state summary + issuing status
GET    /v1/organizations/{org}/finance/fund-states        # Detailed fund state entries

# Treasury / Financial Accounts
GET    /v1/financial-accounts                             # List merchant's FAs
POST   /v1/financial-accounts                             # Create FA (triggers Stripe creation)
GET    /v1/financial-accounts/{id}                        # Get FA details + balance
GET    /v1/financial-accounts/{id}/transactions           # List FA transactions

# Card Issuing
GET    /v1/cardholders                                    # List cardholders
POST   /v1/cardholders                                    # Create cardholder
PATCH  /v1/cardholders/{id}                               # Update cardholder
GET    /v1/issued-cards                                   # List cards
POST   /v1/issued-cards                                   # Create card
PATCH  /v1/issued-cards/{id}                              # Update card (status, spending controls)
GET    /v1/issued-cards/{id}                              # Get card details

# Money Movement
GET    /v1/payment-recipients                             # List recipients
POST   /v1/payment-recipients                             # Create recipient
PATCH  /v1/payment-recipients/{id}                        # Update recipient
DELETE /v1/payment-recipients/{id}                        # Delete recipient
POST   /v1/outbound-payments                              # Send ACH/wire to recipient
GET    /v1/outbound-payments                              # List outbound payments
GET    /v1/outbound-payments/{id}                         # Get payment details
POST   /v1/outbound-payments/{id}/cancel                  # Cancel (if still processing)
POST   /v1/outbound-transfers                             # Transfer to own bank
GET    /v1/outbound-transfers                             # List transfers
GET    /v1/outbound-transfers/{id}                        # Get transfer details

# Stripe Connect Embedded Components
POST   /v1/integrations/stripe/account-session            # Create AccountSession for embedded components
```

### Authorization model

- All endpoints scoped to authenticated user + organization
- Financial Account operations require `treasury_enabled` on the account
- Card operations require `issuing_status == issuing_active` on the account
- Outbound payments check `spendable` balance (not just FA cash balance)
- Outbound payments may require additional authorization (e.g., 2FA for large amounts)

---

## 8. Webhook Handling

### New webhook events to handle

Add to `server/polar/integrations/stripe/tasks.py`:

```python
# Treasury webhooks
"treasury.financial_account.created"
"treasury.financial_account.closed"
"treasury.financial_account.features_status_updated"   # Feature activation
"treasury.inbound_transfer.created"
"treasury.inbound_transfer.succeeded"
"treasury.inbound_transfer.failed"
"treasury.outbound_payment.created"
"treasury.outbound_payment.posted"
"treasury.outbound_payment.failed"
"treasury.outbound_payment.canceled"
"treasury.outbound_payment.returned"
"treasury.outbound_transfer.created"
"treasury.outbound_transfer.posted"
"treasury.outbound_transfer.failed"
"treasury.outbound_transfer.canceled"
"treasury.outbound_transfer.returned"
"treasury.received_credit.created"                     # Incoming ACH/wire/check
"treasury.received_credit.succeeded"
"treasury.received_credit.failed"
"treasury.received_debit.created"                      # Debit from FA

# Issuing webhooks
"issuing_authorization.request"                        # REAL-TIME: approve/decline card spend
"issuing_authorization.created"
"issuing_authorization.updated"
"issuing_transaction.created"                          # Card transaction settled
"issuing_transaction.updated"
"issuing_card.created"
"issuing_card.updated"
"issuing_cardholder.created"
"issuing_cardholder.updated"
"issuing_dispute.created"
"issuing_dispute.updated"
"issuing_dispute.closed"
```

### Critical: Real-time authorization

The `issuing_authorization.request` webhook is **synchronous** — Stripe expects an approve/decline response within ~2 seconds. This must be handled with a dedicated, fast endpoint:

```python
@router.post("/webhooks/stripe/issuing-authorization")
async def handle_issuing_authorization(request: Request):
    event = stripe.Webhook.construct_event(...)
    authorization = event.data.object

    # Fast checks (must complete in <2s total):
    # 1. Account issuing_status == issuing_active?
    # 2. No account restrictions active?
    # 3. Fund state snapshot: spendable >= authorization.amount?
    # 4. Spending controls pass?

    approved = await issuing_service.evaluate_authorization(authorization)

    if approved:
        return stripe.issuing.Authorization.approve(authorization.id)
    else:
        return stripe.issuing.Authorization.decline(authorization.id)
```

**Performance requirements:**
- This endpoint must NOT perform scheduled recalculation — it reads the cached `fund_state_snapshot`
- Must be isolated from heavy request processing (consider dedicated worker or priority routing)
- Database queries must be indexed and minimal (snapshot lookup by account_id)

---

## 9. Risk-Clearance Policy Gate

### Overview

The risk-clearance policy gate is the engine that evaluates fund state transitions. It runs in two modes:

### Scheduled recalculation

- Runs periodically (configurable, default every 15 minutes) via background job
- Iterates over all accounts with `treasury_enabled=True`
- For each account:
  1. Evaluate `pending` funds against `pending_window_days`
  2. Transition eligible funds to `available`
  3. Compute `reserve` floor from `available` using `reserve_floor_basis_points`
  4. Compute `spendable = available - reserve`
  5. Update `fund_state_snapshot` for fast reads
  6. If `spendable` increased and auto-sweep is enabled, trigger Treasury fund transfer

### Targeted recalculation

Triggered by specific events for specific accounts:

| Event | Trigger | What happens |
|---|---|---|
| Payment received | `payment_intent.succeeded` webhook | New `pending` fund state entry created |
| Hold released | `held_balance_service.release_account()` | Targeted recalculation for that account |
| Refund issued | `refund.created` webhook | Clawback from `spendable` → `pending` if needed |
| Dispute opened | `charge.dispute.created` webhook | Clawback + potential reserve increase |
| Account reviewed | Backoffice action | May lift restriction, enabling state transitions |
| Account restricted | Risk detection | All states frozen, issuing_status → `temporarily_restricted` |

### Policy evaluation pseudocode

```python
class RiskClearanceGate:
    async def recalculate(self, account_id: UUID, *, reason: str) -> FundStateSnapshot:
        policy = await self.get_policy(account_id)  # Account-specific or global default

        if not policy.enabled:
            return current_snapshot  # No-op if feature flag is off

        # 1. Check restrictions
        account = await self.get_account(account_id)
        if account.status in (Status.UNDER_REVIEW, Status.DENIED):
            return FundStateSnapshot(all_restricted=True, reason="Account under review")
        if account.issuing_status == IssuingStatus.TEMPORARILY_RESTRICTED:
            return FundStateSnapshot(issuing_restricted=True)

        # 2. Evaluate pending window
        pending_cutoff = utcnow() - timedelta(days=policy.pending_window_days)
        newly_available = await self.get_pending_entries_before(account_id, pending_cutoff)
        for entry in newly_available:
            await self.transition(entry, from_state="pending", to_state="available", reason=reason)

        # 3. Compute totals
        total_available = await self.sum_by_state(account_id, "available")
        reserve_amount = (total_available * policy.reserve_floor_basis_points) // 10_000
        spendable_amount = total_available - reserve_amount

        # 4. Update snapshot
        snapshot = FundStateSnapshot(
            pending_amount=await self.sum_by_state(account_id, "pending"),
            available_amount=total_available,
            reserve_amount=reserve_amount,
            spendable_amount=spendable_amount,
            last_recalculated_at=utcnow(),
            policy_config={
                "pending_window_days": policy.pending_window_days,
                "reserve_floor_basis_points": policy.reserve_floor_basis_points,
            },
        )
        await self.save_snapshot(account_id, snapshot)

        # 5. Trigger downstream (auto-sweep to FA if enabled)
        if spendable_amount > 0 and account.treasury_enabled:
            await self.maybe_sweep_to_financial_account(account_id, spendable_amount)

        return snapshot
```

---

## 10. Policy Controls & Feature Flags

### Configuration model

Rollout and policy behavior will be configurable via the `fund_policies` table:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Master switch — when off, fund lifecycle engine is inactive for this account/globally |
| `pending_window_days` | integer | `7` | How many days funds stay in `pending` before becoming `available` |
| `reserve_floor_basis_points` | integer | `1000` (10%) | Percentage of `available` funds held back as `reserve` |

### Layered configuration

1. **Global default** — `fund_policies` row where `account_id IS NULL`
2. **Per-account override** — `fund_policies` row with specific `account_id`
3. **Resolution order:** Account-specific → Global default → Hardcoded fallback

### Phased rollout strategy

Since there are no live merchants, rollout phases are about testing maturity rather than cohort migration:

| Stage | `enabled` | `pending_window_days` | `reserve_floor_bps` | Purpose |
|---|---|---|---|---|
| **Dev/Test** | `true` | `0` (instant) | `0` | Fast iteration, no delays |
| **Internal dogfood** | `true` | `3` | `500` (5%) | Team tests with realistic constraints |
| **Beta (first merchants)** | `true` | `7` | `1000` (10%) | Conservative defaults for early merchants |
| **GA (general availability)** | `true` | `5` | `750` (7.5%) | Tuned based on beta data |

### Risk-tier adjustments

As the platform matures, per-account overrides allow risk-based differentiation:

- **Low-risk merchant** (established, high volume, low chargebacks): `pending=3, reserve=500`
- **Standard merchant**: `pending=7, reserve=1000`
- **High-risk merchant** (new, flagged patterns): `pending=14, reserve=2000`
- **Restricted merchant**: `enabled=false` (lifecycle engine disabled, no spendable funds)

---

## 11. Testing Strategy

### Stripe sandbox testing

All Treasury and Issuing APIs are fully testable in Stripe's sandbox environment:

- Financial Account creation and feature activation
- Card creation and authorization simulation
- OutboundPayment/OutboundTransfer lifecycle simulation
- ReceivedCredit simulation (test incoming ACH/wire)
- Use Stripe's test clock feature for time-sensitive flows (pending window expiry)

### Test categories

1. **Unit tests** — Fund lifecycle engine state transitions, policy evaluation, authorization logic
2. **Integration tests** — Stripe API interaction with mocked responses (existing pattern in codebase)
3. **Webhook tests** — Simulated webhook event processing
4. **E2E tests** — Full flow from account creation → FA creation → card issuance → authorization → settlement

### Key test scenarios

**Fund lifecycle engine:**
- Payment received → fund state entry created as `pending`
- Pending window expires → scheduled recalculation transitions to `available`
- Reserve floor computed correctly from `available`
- `spendable` = `available` - `reserve`
- Refund claws back from `spendable` then `available`
- Dispute freezes affected funds
- Account restriction freezes all transitions
- Targeted recalculation fires on payment/refund/dispute events
- Policy parameter changes apply on next recalculation
- Per-account policy override takes precedence over global

**Treasury + Issuing:**
- Custom account creation with correct capabilities
- Financial Account creation with all features
- Fund sweep from `spendable` to FA balance
- Card issuance and real-time authorization (approve + decline paths)
- Authorization checks `spendable` balance, not raw FA balance
- OutboundPayment lifecycle (ACH: processing → posted; wire: processing → posted)
- OutboundPayment failure and return handling
- Negative balance recovery
- Account suspension freezing all Treasury/Issuing operations
- Concurrent authorization requests under load

---

## 12. Open Questions & Decisions

### Must decide before implementation

| # | Question | Options | Impact |
|---|---|---|---|
| 1 | **Onboarding UX** | Stripe-hosted vs. embedded components vs. API-based | Frontend effort, UX quality |
| 2 | **US-only or international?** | Treasury is currently US-only for commercial businesses | Market scope |
| 3 | **Auto-sweep vs. manual** | Should spendable funds auto-flow to FA, or should merchant manually pull? | UX, risk |
| 4 | **Outbound payment approval flow** | Self-serve vs. maker-checker vs. configurable | Risk, compliance |
| 5 | **Stripe program approval** | Have you applied for Treasury + Issuing access with Stripe? | Hard blocker for live testing |
| 6 | **Issuing and banking as one status or separate?** | `issuing_active` gates both cards and ACH/wire, or separate `banking_active` | Granularity of controls |

### Must clarify with Stripe

| # | Question | Why it matters |
|---|---|---|
| 1 | What are the specific KYB fields required for `treasury` + `card_issuing` capabilities? | Onboarding flow design |
| 2 | Is check receiving available in the current Treasury program? | Feature scope for Phase 3 |
| 3 | What rewards/cash back program options are available? | Phase 5 feasibility |
| 4 | What is the timeline for Same-Day ACH availability? | OutboundPayment SLA |
| 5 | Platform-level exposure limits for negative FA balances? | Risk modeling |

---

## Summary: Implementation Order

```
Phase 0 ─── Connect Account Foundation + Fund Lifecycle Engine
  │         • Custom account creation (v1 API)
  │         • Issuing readiness states
  │         • Fund-state machine (pending → available → reserve → spendable)
  │         • Risk-clearance policy gate (scheduled + targeted)
  │         • Policy controls (feature flags, pending window, reserve floor)
  │         ↓ Prerequisite for everything else
  │
Phase 1 ─── Treasury Foundation (Financial Accounts + fund routing)
  │         • Financial Account creation with Stripe
  │         • Fund sweep: spendable → FA balance
  │         • Balance sync + caching
  │         ↓ Enables "funds as operating cash"
  │
Phase 2 ─── Card Issuing (Cardholders + cards + authorization)
  │         • Cardholder/card CRUD
  │         • Real-time authorization with fund-state checks
  │         ↓ Enables "spend with cards"
  │         ↓ Can run in parallel with Phase 3
  │
Phase 3 ─── Money Movement (ACH + Wire + Checks)
  │         • Recipient management
  │         • OutboundPayment / OutboundTransfer
  │         • Spendable balance checks before send
  │         ↓ Enables "pay vendors/contractors"
  │
Phase 4 ─── Frontend (Embedded components + custom fund-state UI)
  │         • Stripe embedded components (FA, cards, notifications)
  │         • Custom fund-state breakdown dashboard
  │         • Custom money movement forms
  │         ↓ Can start as early as Phase 0 and iterate per-phase
  │
Phase 5 ─── Rewards & Cash Back (program-dependent)
            ↓ Depends on Stripe program terms
```

**Phase 4 (Frontend) should be developed incrementally alongside Phases 0–3**, not sequentially after. Each backend phase should ship with its corresponding UI.

---

## Appendix: Key Stripe Documentation References

- [Stripe Treasury (Financial Accounts for platforms)](https://docs.stripe.com/treasury)
- [Embedded Finance Integration Guide](https://docs.stripe.com/baas/start-integration/integration-guides/embedded-finance)
- [Stripe Issuing](https://docs.stripe.com/issuing)
- [Issuing + Connect Setup](https://docs.stripe.com/issuing/connect)
- [Financial Account Features](https://docs.stripe.com/financial-accounts/connect/account-management/financial-account-features)
- [Connected Accounts for Treasury](https://docs.stripe.com/financial-accounts/connect/account-management/connected-accounts)
- [Treasury Accounts Structure](https://docs.stripe.com/treasury/account-management/treasury-accounts-structure)
- [Financial Accounts Onboarding Guide](https://docs.stripe.com/treasury/examples/onboarding-guide)
- [OutboundPayments (ACH/Wire)](https://docs.stripe.com/treasury/moving-money/financial-accounts/out-of/outbound-payments)
- [OutboundTransfers](https://docs.stripe.com/treasury/moving-money/financial-accounts/out-of/outbound-transfers)
- [ReceivedCredits](https://docs.stripe.com/treasury/moving-money/financial-accounts/into/received-credits)
- [Issuing Spending Controls](https://docs.stripe.com/issuing/controls/spending-controls)
- [Connect Embedded Components](https://docs.stripe.com/connect/supported-embedded-components)
- [Issuing Embedded Components](https://docs.stripe.com/issuing/connect/embedded-components)
- [Stripe Issuing + Treasury Samples (GitHub)](https://github.com/stripe-samples/issuing-treasury)
