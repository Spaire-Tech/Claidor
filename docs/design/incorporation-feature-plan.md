# Incorporation Feature — Implementation Plan

## US Company Formation via FileForms API

**Author:** Staff Engineering
**Date:** 2026-03-06
**Status:** Design Proposal

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Repository Analysis](#2-repository-analysis)
3. [Module Structure](#3-module-structure)
4. [FileForms API Lifecycle](#4-fileforms-api-lifecycle)
5. [Internal API Design](#5-internal-api-design)
6. [Database Schema](#6-database-schema)
7. [Checkout Integration](#7-checkout-integration)
8. [Provider Client](#8-provider-client)
9. [Webhook Handling](#9-webhook-handling)
10. [Document Storage](#10-document-storage)
11. [Frontend UX Plan](#11-frontend-ux-plan)
12. [Migration Strategy](#12-migration-strategy)
13. [Implementation Phases](#13-implementation-phases)
14. [Risk Analysis](#14-risk-analysis)
15. [Engineering Effort](#15-engineering-effort)

---

## 1. Executive Summary

This plan introduces a **US company formation feature** into the Spaire platform, allowing founders to incorporate directly from the Spaire dashboard. The integration uses **FileForms** as the backend fulfillment provider while Spaire owns the entire UX and payment flow.

**End-to-end flow:**

```
Founder opens dashboard
  → Starts incorporation wizard
  → Fills multi-step form (entity type, details, founders, ownership)
  → Pays via Spaire Checkout
  → Spaire submits formation to FileForms
  → FileForms files with state
  → Webhook updates status in real-time
  → Formation documents stored in Spaire S3
  → Founder downloads documents from Spaire dashboard
```

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    Spaire Dashboard (Next.js)                │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Incorp.     │  │ Spaire       │  │ Document            │ │
│  │ Wizard      │──│ Checkout     │  │ Viewer              │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼─────────────────────┼────────────┘
          │                │                     │
          ▼                ▼                     ▼
┌──────────────────────────────────────────────────────────────┐
│                  Spaire API (FastAPI)                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │             polar/incorporation/                        │ │
│  │                                                         │ │
│  │  endpoints.py ──► service.py ──► repository.py          │ │
│  │                      │                                  │ │
│  │                      ▼                                  │ │
│  │               provider_client.py                        │ │
│  │                      │                                  │ │
│  │                      ▼                                  │ │
│  │              tasks.py (Dramatiq)                         │ │
│  └──────────┬───────────┼──────────────────────────────────┘ │
│             │           │                                    │
│        ┌────▼───┐  ┌────▼────┐  ┌───────────────┐           │
│        │Postgres│  │  Redis  │  │  S3 / Minio   │           │
│        └────────┘  └─────────┘  └───────────────┘           │
└──────────────────────────┼───────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │    FileForms API       │
              │                        │
              │  POST /users           │
              │  POST /companies       │
              │  POST /orders          │
              │  GET  /documents/{id}  │
              │                        │
              │  Webhooks ──────────►  │
              │  filing.status_changed │
              │  document.uploaded     │
              └────────────────────────┘
```

---

## 2. Repository Analysis

### Current Structure

The Spaire backend (`server/polar/`) contains **59 modules**, each following a consistent pattern:

```
polar/{module}/
├── __init__.py
├── auth.py           # Authenticator dependencies
├── endpoints.py      # FastAPI router
├── service.py        # Business logic (singleton)
├── repository.py     # SQLAlchemy queries
├── schemas.py        # Pydantic models
├── tasks.py          # Dramatiq background jobs
└── sorting.py        # Sort enums
```

### Relevant Existing Modules

| Module | Relevance |
|--------|-----------|
| `checkout/` | Payment flow — we'll trigger checkout before formation |
| `order/` | Order creation post-payment — pattern reference |
| `file/` | S3 file storage — we'll store formation documents here |
| `organization/` | Org context — incorporations are org-scoped |
| `integrations/stripe/` | External API integration pattern reference |
| `webhook/` | Webhook delivery infra — pattern reference for inbound webhooks |
| `integrations/chargeback_stop/` | Inbound webhook handling pattern reference |

### Decision: New Top-Level Module

The incorporation feature should be a **new top-level module** at `server/polar/incorporation/`. Rationale:

1. **Distinct domain** — incorporation is a separate business process, not a sub-feature of billing or checkout.
2. **Clean boundaries** — it has its own lifecycle (draft → payment → filing → completion), separate from subscriptions or orders.
3. **External provider** — FileForms integration is self-contained, similar to how Stripe lives under `integrations/`.
4. **Follows convention** — other domain features (checkout, subscription, order) each have their own module.

The FileForms client abstraction should live **inside** the incorporation module as `provider_client.py`, not under `integrations/`, because:
- It's specific to incorporation (unlike Stripe which is cross-cutting)
- Keeps the module self-contained
- Follows the principle of locality

---

## 3. Module Structure

### `server/polar/incorporation/`

```
polar/incorporation/
├── __init__.py              # Module initialization
├── auth.py                  # Auth dependencies (IncorporationsRead, IncorporationsWrite)
├── endpoints.py             # FastAPI routes: /v1/incorporations
├── service.py               # Business logic (IncorporationService singleton)
├── repository.py            # Database queries (IncorporationRepository, IncorporationDocumentRepository)
├── schemas.py               # Pydantic request/response models
├── tasks.py                 # Background jobs (submit_to_fileforms, download_document, etc.)
├── sorting.py               # Sort property enum
├── provider_client.py       # FileForms API client abstraction
└── webhook_endpoints.py     # POST /webhooks/fileforms handler
```

### File Responsibilities

| File | Purpose |
|------|---------|
| `auth.py` | Defines `IncorporationsRead` and `IncorporationsWrite` auth dependencies. Incorporations are scoped to organizations and only accessible by organization members. |
| `endpoints.py` | REST API routes for creating, reading, and managing incorporations. Mounts on `/v1/incorporations`. |
| `service.py` | Core orchestration: creates incorporations, triggers checkout, coordinates with FileForms after payment, handles status updates. Singleton instance: `incorporation = IncorporationService()`. |
| `repository.py` | SQLAlchemy queries for `Incorporation` and `IncorporationDocument` models. Auth-aware via `get_readable_statement()`. Extends `RepositoryBase`, `RepositorySoftDeletionMixin`. |
| `schemas.py` | Pydantic models for all API input/output. `IncorporationCreate`, `IncorporationRead`, `IncorporationUpdate`, `IncorporationDocumentRead`. |
| `tasks.py` | Dramatiq actors: `incorporation.submit_to_fileforms`, `incorporation.download_document`, `incorporation.sync_status`. |
| `sorting.py` | `IncorporationSortProperty` enum (e.g., `created_at`, `status`, `company_name`). |
| `provider_client.py` | Async HTTP client wrapping FileForms API. Handles auth, retries, error mapping. Never exposed to frontend. |
| `webhook_endpoints.py` | Separate router for `POST /webhooks/fileforms`. Validates webhook signatures, dispatches to service. |

---

## 4. FileForms API Lifecycle

### Sequence Diagram

```
Spaire Dashboard          Spaire API                FileForms
     │                        │                         │
     │  1. Create draft       │                         │
     │───────────────────────►│                         │
     │  POST /incorporations  │                         │
     │◄───────────────────────│                         │
     │  {id, status: draft}   │                         │
     │                        │                         │
     │  2. Checkout           │                         │
     │───────────────────────►│                         │
     │  POST /checkouts       │                         │
     │  (Stripe payment)      │                         │
     │◄───────────────────────│                         │
     │  {payment confirmed}   │                         │
     │                        │                         │
     │                        │  3. Create user         │
     │                        │────────────────────────►│
     │                        │  POST /users            │
     │                        │◄────────────────────────│
     │                        │  {fileforms_user_id}    │
     │                        │                         │
     │                        │  4. Create company      │
     │                        │────────────────────────►│
     │                        │  POST /companies        │
     │                        │◄────────────────────────│
     │                        │  {fileforms_company_id} │
     │                        │                         │
     │                        │  5. Create order        │
     │                        │────────────────────────►│
     │                        │  POST /orders           │
     │                        │◄────────────────────────│
     │                        │  {fileforms_order_id}   │
     │                        │                         │
     │                        │  6. Webhook: status     │
     │                        │◄────────────────────────│
     │                        │  filing.status_changed  │
     │                        │  (processing/completed) │
     │                        │                         │
     │                        │  7. Webhook: document   │
     │                        │◄────────────────────────│
     │                        │  document.uploaded      │
     │                        │                         │
     │                        │  8. Download document   │
     │                        │────────────────────────►│
     │                        │  GET /documents/{id}    │
     │                        │◄────────────────────────│
     │                        │  {fileUrl: presigned}   │
     │                        │                         │
     │                        │  8b. Fetch from fileUrl │
     │                        │────────────► S3 (AWS)   │
     │                        │◄──────────── {bytes}    │
     │                        │                         │
     │                        │  9. Store in S3         │
     │                        │──────► S3               │
     │                        │                         │
     │  10. View documents    │                         │
     │───────────────────────►│                         │
     │  GET /incorporations/  │                         │
     │       {id}/documents   │                         │
     │◄───────────────────────│                         │
     │  [{document list}]     │                         │
```

### FileForms API Reference Summary

> **Base URL:** `https://api.fileforms.com/v1`
> **Auth:** `x-api-key` header with partner API key
> **ID format:** Prefixed strings (e.g., `user_a1b2c3d4e5f6g7h8`, `comp_...`, `order_...`, `doc_...`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/magic-link` | POST | Generate auth link for user (7-day expiry) |
| `/users` | POST | Create user (`fullName`, `email`, `phoneNumber`) |
| `/users/{userIdOrEmail}` | GET | Retrieve user by ID or email |
| `/companies` | POST | Create company (full legal details, officers, addresses) |
| `/companies/{companyIdOrSlug}` | GET | Retrieve company |
| `/companies/{companyIdOrSlug}` | PATCH | Update company |
| `/orders` | POST | Create order (formation, annual report, registered agent) |
| `/documents/{documentId}` | GET | Get document metadata + presigned `fileUrl` (1h expiry) |

**Key distinctions from initial assumptions:**
1. **Entity types are `LLC` and `CORP`** — S-Corp vs C-Corp is a `taxElection` field on the company, not a separate entity type.
2. **`structureType`** (`MEMBER`/`MANAGER`) replaces `management_type` for LLCs.
3. **Officers** (not "founders") are an array on the company, each with `type` (PERSON/COMPANY), `title`, address, and `isPrimary` flag.
4. **Addresses** use `addressStreet/City/State/Zip` format (not `line1/postal_code`).
5. **`formationDate`** is required on company creation (date of initial filing).
6. **Documents** return JSON with a presigned S3 URL (`fileUrl`), not binary content.
7. **Orders** are composable: a single order can include `formation`, `annualReport`, and/or `registeredAgent` services.

### Webhook Events

| Event | Trigger | Key Data Fields |
|-------|---------|-----------------|
| `filing.status_changed` | Filing status updates | `orderType`, `orderId`, `filingStatus` (submitted/pending/filed/exception/cancelled), `subscriptionStatus` |
| `document.uploaded` | Document ready for download | `orderId`, `documentId`, `documentType`, `fileName`, `fileType`, `fileUrl` |

### Service Lifecycle Methods

```python
# polar/incorporation/service.py

class IncorporationService:

    async def create_draft(self, session, auth_subject, create_schema):
        """Step 1: Create local draft incorporation record."""

    async def initiate_checkout(self, session, auth_subject, incorporation_id):
        """Step 2: Create Spaire checkout for incorporation fee."""

    async def on_payment_confirmed(self, session, incorporation_id):
        """Step 3: Called when checkout succeeds. Enqueues FileForms submission."""

    async def submit_to_fileforms(self, session, incorporation_id):
        """Steps 3-5 (background task): Create FileForms user → company → order."""

    async def handle_status_change(self, session, fileforms_order_id, new_status):
        """Step 6: Handle filing.status_changed webhook."""

    async def handle_document_uploaded(self, session, fileforms_document_id, metadata):
        """Step 7: Handle document.uploaded webhook. Enqueues download."""

    async def download_and_store_document(self, session, incorporation_id, document_id):
        """Steps 8-9 (background task): Download from FileForms fileUrl, upload to S3."""
```

---

## 5. Internal API Design

### Endpoints

All endpoints are organization-scoped and require authenticated users who are members of the organization.

#### `POST /v1/incorporations`

Create a new draft incorporation.

**Request:**
```json
{
  "organization_id": "uuid",
  "entity_type": "LLC",
  "formation_state": "DE",
  "legal_name": "Acme LLC",
  "trade_name": "Acme",
  "ein": null,
  "structure_type": "MEMBER",
  "tax_election": null,
  "fiscal_end_month": "December",
  "formation_date": "2026-03-06",
  "include_registered_agent": true,
  "officers": [
    {
      "type": "PERSON",
      "title": "Managing Member",
      "first_name": "Jane",
      "last_name": "Doe",
      "email": "jane@example.com",
      "address_street": "123 Main St",
      "address_city": "San Francisco",
      "address_state": "CA",
      "address_zip": "94105",
      "is_primary": true
    }
  ],
  "address_street": "123 Main St",
  "address_city": "San Francisco",
  "address_state": "CA",
  "address_zip": "94105",
  "mailing_address_street": "123 Main St",
  "mailing_address_city": "San Francisco",
  "mailing_address_state": "CA",
  "mailing_address_zip": "94105"
}
```

**Response:** `201 Created`
```json
{
  "id": "uuid",
  "organization_id": "uuid",
  "entity_type": "LLC",
  "formation_state": "DE",
  "legal_name": "Acme LLC",
  "status": "draft",
  "created_at": "2026-03-06T00:00:00Z",
  "modified_at": null
}
```

#### `GET /v1/incorporations`

List incorporations for the authenticated organization.

**Query params:** `organization_id` (required), `page`, `limit`, `sorting`

**Response:** `200 OK` — `ListResource[Incorporation]`

#### `GET /v1/incorporations/{id}`

Get a single incorporation with full details.

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "organization_id": "uuid",
  "entity_type": "LLC",
  "formation_state": "DE",
  "legal_name": "Acme LLC",
  "trade_name": "Acme",
  "ein": null,
  "structure_type": "MEMBER",
  "tax_election": null,
  "fiscal_end_month": "December",
  "formation_date": "2026-03-06",
  "include_registered_agent": true,
  "officers": [
    {
      "type": "PERSON",
      "title": "Managing Member",
      "first_name": "Jane",
      "last_name": "Doe",
      "is_primary": true,
      "address_street": "123 Main St",
      "address_city": "San Francisco",
      "address_state": "CA",
      "address_zip": "94105"
    }
  ],
  "address_street": "123 Main St",
  "address_city": "San Francisco",
  "address_state": "CA",
  "address_zip": "94105",
  "mailing_address_street": "123 Main St",
  "mailing_address_city": "San Francisco",
  "mailing_address_state": "CA",
  "mailing_address_zip": "94105",
  "status": "processing",
  "status_detail": "Filing submitted to Delaware Division of Corporations",
  "checkout_id": "uuid",
  "fileforms_company_id": "comp_a1b2c3d4e5f6g7h8",
  "fileforms_order_id": "order_a1b2c3d4e5f6g7h8",
  "filed_at": null,
  "created_at": "2026-03-06T00:00:00Z",
  "modified_at": "2026-03-06T01:00:00Z"
}
```

#### `PATCH /v1/incorporations/{id}`

Update a draft incorporation (only allowed in `draft` status).

**Request:** Partial update of any field from `IncorporationCreate`.

**Response:** `200 OK` — Updated `Incorporation`

#### `GET /v1/incorporations/{id}/documents`

List documents for an incorporation.

**Response:** `200 OK`
```json
{
  "items": [
    {
      "id": "uuid",
      "incorporation_id": "uuid",
      "document_type": "articles_of_organization",
      "file_name": "Articles_of_Organization_Acme_LLC.pdf",
      "file_path": "incorporations/uuid/articles_of_organization.pdf",
      "provider_document_id": "ff_doc_xyz789",
      "download_url": "https://...",
      "created_at": "2026-03-07T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "total_count": 1 }
}
```

#### `POST /v1/incorporations/{id}/checkout`

Initiate checkout for a draft incorporation.

**Response:** `201 Created`
```json
{
  "checkout_url": "https://checkout.spairehq.com/...",
  "checkout_id": "uuid"
}
```

### Error Responses

| Status | Error | When |
|--------|-------|------|
| 404 | `ResourceNotFound` | Incorporation not found or not accessible |
| 422 | `ValidationError` | Invalid input data |
| 409 | `IncorporationNotDraft` | Attempt to update non-draft incorporation |
| 409 | `IncorporationAlreadySubmitted` | Duplicate submission attempt |
| 502 | `FileFormsError` | FileForms API failure (background tasks retry) |

---

## 6. Database Schema

### `incorporations` Table

> Field names align with the FileForms API (`entityType` → `entity_type`, etc.)
> to simplify the mapping layer in `provider_client.py`.

```sql
CREATE TABLE incorporations (
    -- Identity
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at             TIMESTAMPTZ,
    deleted_at              TIMESTAMPTZ,

    -- Ownership
    organization_id         UUID NOT NULL REFERENCES organizations(id),

    -- Company details (mirrors FileForms CreateCompanyRequest)
    entity_type             VARCHAR(10) NOT NULL,       -- 'LLC' or 'CORP'
    legal_name              VARCHAR(255) NOT NULL,
    trade_name              VARCHAR(255),               -- DBA name
    ein                     VARCHAR(10),                -- XX-XXXXXXX format
    structure_type          VARCHAR(10),                -- 'MEMBER' or 'MANAGER' (LLC only)
    tax_election            VARCHAR(20),                -- 'C Corporation' or 'S Corporation' (CORP only)
    fiscal_end_month        VARCHAR(10) DEFAULT 'December',
    formation_date          DATE NOT NULL,
    formation_state         VARCHAR(2) NOT NULL,        -- US state code: 'DE', 'WY', etc.

    -- Addresses
    address_street          VARCHAR(255) NOT NULL,
    address_city            VARCHAR(255) NOT NULL,
    address_state           VARCHAR(2) NOT NULL,
    address_zip             VARCHAR(5) NOT NULL,
    mailing_address_street  VARCHAR(255) NOT NULL,
    mailing_address_city    VARCHAR(255) NOT NULL,
    mailing_address_state   VARCHAR(2) NOT NULL,
    mailing_address_zip     VARCHAR(5) NOT NULL,

    -- Officers (stored as JSONB array)
    -- Each: {type, title, firstName, lastName, companyName, addressStreet, ..., isPrimary}
    officers                JSONB NOT NULL DEFAULT '[]',

    -- Service options
    include_registered_agent BOOLEAN DEFAULT true,

    -- Payment
    checkout_id             UUID REFERENCES checkouts(id),

    -- FileForms provider IDs (prefixed strings from FileForms)
    fileforms_user_id       VARCHAR(255),               -- e.g. 'user_a1b2c3d4e5f6g7h8'
    fileforms_company_id    VARCHAR(255),               -- e.g. 'comp_a1b2c3d4e5f6g7h8'
    fileforms_order_id      VARCHAR(255),               -- e.g. 'order_a1b2c3d4e5f6g7h8'

    -- Status tracking
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft',
    status_detail           TEXT,
    filing_status           VARCHAR(20),                -- FileForms filingStatus: submitted/pending/filed/exception/cancelled
    subscription_status     VARCHAR(20),                -- FileForms subscriptionStatus (for registered agent)
    filed_at                TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    rejected_reason         TEXT
);

-- Indexes
CREATE INDEX ix_incorporations_organization_id ON incorporations(organization_id);
CREATE INDEX ix_incorporations_status ON incorporations(status);
CREATE INDEX ix_incorporations_fileforms_order_id ON incorporations(fileforms_order_id);
CREATE INDEX ix_incorporations_created_at ON incorporations(created_at);
CREATE INDEX ix_incorporations_deleted_at ON incorporations(deleted_at);
```

### `incorporation_documents` Table

```sql
CREATE TABLE incorporation_documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at             TIMESTAMPTZ,
    deleted_at              TIMESTAMPTZ,

    -- Parent
    incorporation_id        UUID NOT NULL REFERENCES incorporations(id),

    -- Document metadata
    document_type           VARCHAR(50) NOT NULL,
    file_name               VARCHAR(255) NOT NULL,

    -- S3 storage
    s3_bucket               VARCHAR(255) NOT NULL,
    s3_key                  VARCHAR(512) NOT NULL,
    file_size_bytes         BIGINT,
    mime_type               VARCHAR(100) DEFAULT 'application/pdf',

    -- Provider reference
    provider_document_id    VARCHAR(255) NOT NULL
);

-- Indexes
CREATE INDEX ix_incorporation_documents_incorporation_id ON incorporation_documents(incorporation_id);
CREATE INDEX ix_incorporation_documents_provider_document_id ON incorporation_documents(provider_document_id);
CREATE INDEX ix_incorporation_documents_created_at ON incorporation_documents(created_at);
CREATE INDEX ix_incorporation_documents_deleted_at ON incorporation_documents(deleted_at);
```

### Status Enum (Spaire internal)

```python
class IncorporationStatus(StrEnum):
    """Spaire-side lifecycle status."""
    draft = "draft"                     # Initial state, form being filled
    pending_payment = "pending_payment" # Checkout created, awaiting payment
    submitted = "submitted"             # Paid, submitted to FileForms
    processing = "processing"           # FileForms is processing the filing
    completed = "completed"             # Formation complete, documents available
    failed = "failed"                   # Filing rejected or error (FileForms: "exception")
    cancelled = "cancelled"             # User cancelled or FileForms: "cancelled"
```

### FileForms Filing Status (from webhook `filing.status_changed`)

```python
class FileFormsFilingStatus(StrEnum):
    """Direct mapping to FileForms `filingStatus` values."""
    submitted = "submitted"
    pending = "pending"
    filed = "filed"
    exception = "exception"
    cancelled = "cancelled"
```

### Entity Type Enum

```python
class EntityType(StrEnum):
    """Maps directly to FileForms `entityType`."""
    LLC = "LLC"
    CORP = "CORP"
```

### Structure Type Enum (LLC only)

```python
class StructureType(StrEnum):
    """Maps directly to FileForms `structureType`. Required when entity_type is LLC."""
    MEMBER = "MEMBER"
    MANAGER = "MANAGER"
```

### Tax Election Enum (CORP only)

```python
class TaxElection(StrEnum):
    """Maps directly to FileForms `taxElection`. Required when entity_type is CORP."""
    C_CORPORATION = "C Corporation"
    S_CORPORATION = "S Corporation"
```

### SQLAlchemy Model

```python
# polar/models/incorporation.py

class Incorporation(RecordModel):
    __tablename__ = "incorporations"

    organization_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("organizations.id"), nullable=False, index=True
    )

    # Company details (align with FileForms CreateCompanyRequest)
    entity_type: Mapped[str] = mapped_column(String(10), nullable=False)  # LLC, CORP
    legal_name: Mapped[str] = mapped_column(String(255), nullable=False)
    trade_name: Mapped[str | None] = mapped_column(String(255))
    ein: Mapped[str | None] = mapped_column(String(10))  # XX-XXXXXXX
    structure_type: Mapped[str | None] = mapped_column(String(10))  # MEMBER, MANAGER
    tax_election: Mapped[str | None] = mapped_column(String(20))  # C Corporation, S Corporation
    fiscal_end_month: Mapped[str] = mapped_column(String(10), default="December")
    formation_date: Mapped[date] = mapped_column(Date, nullable=False)
    formation_state: Mapped[str] = mapped_column(String(2), nullable=False)

    # Addresses
    address_street: Mapped[str] = mapped_column(String(255), nullable=False)
    address_city: Mapped[str] = mapped_column(String(255), nullable=False)
    address_state: Mapped[str] = mapped_column(String(2), nullable=False)
    address_zip: Mapped[str] = mapped_column(String(5), nullable=False)
    mailing_address_street: Mapped[str] = mapped_column(String(255), nullable=False)
    mailing_address_city: Mapped[str] = mapped_column(String(255), nullable=False)
    mailing_address_state: Mapped[str] = mapped_column(String(2), nullable=False)
    mailing_address_zip: Mapped[str] = mapped_column(String(5), nullable=False)

    # Officers (JSONB array — each has type, title, name fields, address, isPrimary)
    officers: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Service options
    include_registered_agent: Mapped[bool] = mapped_column(Boolean, default=True)

    # Payment
    checkout_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("checkouts.id"))

    # FileForms provider IDs
    fileforms_user_id: Mapped[str | None] = mapped_column(String(255))
    fileforms_company_id: Mapped[str | None] = mapped_column(String(255))
    fileforms_order_id: Mapped[str | None] = mapped_column(String(255), index=True)

    # Status tracking
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    status_detail: Mapped[str | None] = mapped_column(Text)
    filing_status: Mapped[str | None] = mapped_column(String(20))  # FileForms filingStatus
    subscription_status: Mapped[str | None] = mapped_column(String(20))  # for registered agent
    filed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    rejected_reason: Mapped[str | None] = mapped_column(Text)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", lazy="raise")
    documents: Mapped[list["IncorporationDocument"]] = relationship(
        "IncorporationDocument", lazy="raise", back_populates="incorporation"
    )


class IncorporationDocument(RecordModel):
    __tablename__ = "incorporation_documents"

    incorporation_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("incorporations.id"), nullable=False, index=True
    )
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_bucket: Mapped[str] = mapped_column(String(255), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    mime_type: Mapped[str] = mapped_column(String(100), default="application/pdf")
    provider_document_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # Relationships
    incorporation: Mapped["Incorporation"] = relationship(
        "Incorporation", lazy="raise", back_populates="documents"
    )
```

---

## 7. Checkout Integration

### Flow

The incorporation checkout follows the existing Spaire checkout pattern but is triggered for a **fixed-price service product**, not a recurring subscription.

```
┌─────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────────┐
│  Draft   │────►│ Create       │────►│ Payment  │────►│ Submit to    │
│  Incorp. │     │ Checkout     │     │ Confirmed│     │ FileForms    │
└─────────┘     └──────────────┘     └──────────┘     └──────────────┘
                                          │
                                    Stripe webhook
                                    triggers callback
```

### Implementation

**Step 1: Pre-create a "Company Formation" product in Spaire**

A one-time product should be created in the Spaire product catalog for each formation package (e.g., "LLC Formation — Delaware" at $399). This can be seeded via a data migration or created via the admin backoffice.

**Step 2: Trigger checkout from incorporation**

```python
# polar/incorporation/service.py

async def initiate_checkout(
    self,
    session: AsyncSession,
    auth_subject: AuthSubject[User],
    incorporation_id: UUID,
) -> Checkout:
    repository = IncorporationRepository.from_session(session)
    incorporation = await repository.get_by_id_and_org(
        incorporation_id, auth_subject
    )

    if incorporation is None:
        raise ResourceNotFound()
    if incorporation.status != IncorporationStatus.draft:
        raise IncorporationNotDraft(incorporation_id)

    # Look up the formation product for this entity_type + state
    product = await self._get_formation_product(
        session, incorporation.entity_type, incorporation.state
    )

    # Create a Spaire checkout session
    checkout = await checkout_service.create(
        session,
        auth_subject,
        CheckoutCreate(
            product_id=product.id,
            metadata={"incorporation_id": str(incorporation_id)},
        ),
    )

    # Update incorporation status
    incorporation.status = IncorporationStatus.pending_payment
    incorporation.checkout_id = checkout.id
    await repository.update(incorporation)

    return checkout
```

**Step 3: Handle payment confirmation**

The existing checkout/order flow in Spaire fires events when payment succeeds. We hook into this via a background task:

```python
# polar/incorporation/tasks.py

@actor(actor_name="incorporation.payment_confirmed", priority=TaskPriority.HIGH)
async def payment_confirmed(incorporation_id: UUID) -> None:
    async with AsyncSessionMaker() as session:
        service = IncorporationService()
        await service.submit_to_fileforms(session, incorporation_id)
```

**Where this orchestration lives:** The `IncorporationService.on_payment_confirmed()` method is called from the checkout/order payment success handler. We add a small hook in the order creation flow that checks if the checkout has `incorporation_id` metadata, and if so, enqueues the `incorporation.payment_confirmed` task.

### Minimal Touchpoint to Existing Code

The only change to existing code is a **single hook** in the order service's post-payment logic:

```python
# In the existing order service, after successful payment:
if checkout.metadata and "incorporation_id" in checkout.metadata:
    enqueue_job(
        "incorporation.payment_confirmed",
        incorporation_id=UUID(checkout.metadata["incorporation_id"]),
    )
```

This is a ~3-line addition to the existing order flow — surgical, not disruptive.

---

## 8. Provider Client

### `polar/incorporation/provider_client.py`

The provider client is an async HTTP client wrapping the FileForms REST API v1. It handles authentication via `x-api-key` header, serialization, error handling, and retries.

> **Key API details from FileForms docs:**
> - Base URL: `https://api.fileforms.com/v1`
> - Auth: `x-api-key` header (not Bearer token)
> - Error responses: `{ "message": str, "errors": [...] }` for 400, `{ "message": str }` for 401/404
> - Conflict responses (409): `{ "message": str }` for duplicate users/companies

```python
import httpx
import structlog
from polar.config import settings

log = structlog.get_logger()


class FileFormsError(Exception):
    def __init__(self, status_code: int, message: str, errors: list[dict] | None = None):
        self.status_code = status_code
        self.message = message
        self.errors = errors or []


class FileFormsConflictError(FileFormsError):
    """Raised on 409 — duplicate user or company."""
    pass


class FileFormsClient:
    """Async client for the FileForms company formation API v1.

    API Reference: https://docs.dev.fileforms.dev/
    Base URL: https://api.fileforms.com/v1
    Auth: x-api-key header
    """

    def __init__(self) -> None:
        self.base_url = settings.FILEFORMS_API_URL  # https://api.fileforms.com/v1
        self.api_key = settings.FILEFORMS_API_KEY

    def _get_headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _request(
        self, method: str, path: str, **kwargs
    ) -> dict:
        async with httpx.AsyncClient(
            base_url=self.base_url,
            headers=self._get_headers(),
            timeout=30.0,
        ) as client:
            response = await client.request(method, path, **kwargs)
            if response.status_code >= 400:
                body = response.json()
                error_cls = FileFormsConflictError if response.status_code == 409 else FileFormsError
                raise error_cls(
                    status_code=response.status_code,
                    message=body.get("message", response.text),
                    errors=body.get("errors"),
                )
            return response.json()

    # ── Users ──────────────────────────────────────────────

    async def create_user(
        self,
        *,
        full_name: str,
        email: str,
        phone_number: str | None = None,
    ) -> dict:
        """Create a FileForms user account.

        Returns: { id, fullName, email, phoneNumber, createdAt, updatedAt }
        Raises FileFormsConflictError (409) if user with email already exists.
        """
        payload: dict = {
            "fullName": full_name,
            "email": email,
        }
        if phone_number:
            payload["phoneNumber"] = phone_number
        return await self._request("POST", "/users", json=payload)

    async def get_user(self, user_id_or_email: str) -> dict:
        """Retrieve a user by ID or email.

        Returns: { id, fullName, email, phoneNumber, createdAt, updatedAt }
        """
        return await self._request("GET", f"/users/{user_id_or_email}")

    # ── Authentication ─────────────────────────────────────

    async def create_magic_link(
        self,
        *,
        user_id: str,
        company_id: str | None = None,
    ) -> str:
        """Generate a magic link for user authentication.

        Returns the magic link URL (expires after 7 days).
        """
        payload: dict = {"userId": user_id}
        if company_id:
            payload["companyId"] = company_id
        result = await self._request("POST", "/auth/magic-link", json=payload)
        return result["magicLink"]

    # ── Companies ──────────────────────────────────────────

    async def create_company(
        self,
        *,
        user_id: str,
        legal_name: str,
        entity_type: str,           # 'LLC' or 'CORP'
        formation_date: str,        # ISO date: '2026-03-06'
        formation_state: str,       # 2-letter state code
        address_street: str,
        address_city: str,
        address_state: str,
        address_zip: str,
        mailing_address_street: str,
        mailing_address_city: str,
        mailing_address_state: str,
        mailing_address_zip: str,
        officers: list[dict],       # At least 1 officer required
        trade_name: str | None = None,
        ein: str | None = None,
        structure_type: str | None = None,   # 'MEMBER' or 'MANAGER' (LLC only)
        tax_election: str | None = None,     # 'C Corporation' or 'S Corporation' (CORP only)
        fiscal_end_month: str = "December",
    ) -> dict:
        """Create a company in FileForms.

        Returns: { id, legalName, entityType, ..., createdAt, updatedAt }
        Raises FileFormsConflictError (409) if company already exists.

        Officers format:
        [
            {
                "type": "PERSON",           # or "COMPANY"
                "title": "Managing Member",
                "firstName": "John",        # PERSON only
                "lastName": "Smith",        # PERSON only
                "companyName": "...",       # COMPANY only
                "addressStreet": "123 Main Street",
                "addressCity": "Houston",
                "addressState": "TX",
                "addressZip": "77002",
                "isPrimary": true
            }
        ]
        """
        payload: dict = {
            "userId": user_id,
            "legalName": legal_name,
            "entityType": entity_type,
            "formationDate": formation_date,
            "formationState": formation_state,
            "addressStreet": address_street,
            "addressCity": address_city,
            "addressState": address_state,
            "addressZip": address_zip,
            "mailingAddressStreet": mailing_address_street,
            "mailingAddressCity": mailing_address_city,
            "mailingAddressState": mailing_address_state,
            "mailingAddressZip": mailing_address_zip,
            "officers": officers,
            "fiscalEndMonth": fiscal_end_month,
        }
        if trade_name:
            payload["tradeName"] = trade_name
        if ein:
            payload["ein"] = ein
        if structure_type:
            payload["structureType"] = structure_type
        if tax_election:
            payload["taxElection"] = tax_election
        return await self._request("POST", "/companies", json=payload)

    async def get_company(self, company_id_or_slug: str) -> dict:
        """Retrieve company details from FileForms."""
        return await self._request("GET", f"/companies/{company_id_or_slug}")

    async def update_company(self, company_id_or_slug: str, **fields) -> dict:
        """Update a company in FileForms (PATCH — partial update)."""
        return await self._request("PATCH", f"/companies/{company_id_or_slug}", json=fields)

    # ── Orders ─────────────────────────────────────────────

    async def create_order(
        self,
        *,
        user_id: str,
        filing_state: str,
        company_id: str | None = None,
        formation: dict | None = None,
        annual_report: dict | None = None,
        registered_agent: dict | None = None,
    ) -> dict:
        """Create an order in FileForms.

        At least one service (formation, annualReport, registeredAgent) must be included.
        companyId is required when formation is NOT included.

        Returns: { companyId, items: [{ orderType, orderId, filingStatus, ... }] }

        Formation example:    {"formation": {}}  (no additional fields needed)
        Annual report example: {"annualReport": {"filingYear": "2026"}}
        Registered agent:      {"registeredAgent": {"isChangeOfAgent": false}}
        """
        payload: dict = {
            "userId": user_id,
            "filingState": filing_state,
        }
        if company_id:
            payload["companyId"] = company_id
        if formation is not None:
            payload["formation"] = formation
        if annual_report is not None:
            payload["annualReport"] = annual_report
        if registered_agent is not None:
            payload["registeredAgent"] = registered_agent
        return await self._request("POST", "/orders", json=payload)

    # ── Documents ──────────────────────────────────────────

    async def get_document(self, document_id: str) -> dict:
        """Retrieve document metadata and presigned download URL.

        Returns: {
            documentId, documentType, fileName, fileType (MIME),
            fileUrl (presigned S3 URL, expires 1 hour), createdAt
        }

        NOTE: This returns metadata with a presigned URL, not binary content.
        Use the fileUrl to download the actual file.
        """
        return await self._request("GET", f"/documents/{document_id}")

    async def download_document_content(self, file_url: str) -> bytes:
        """Download actual document bytes from the presigned fileUrl.

        The fileUrl comes from get_document() and expires after 1 hour.
        """
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(file_url)
            response.raise_for_status()
            return response.content


# Singleton
fileforms_client = FileFormsClient()
```

### Configuration Additions

Add to `polar/config.py` Settings class:

```python
# FileForms (Company Formation)
FILEFORMS_API_URL: str = "https://api.fileforms.com/v1"
FILEFORMS_API_KEY: str = ""
FILEFORMS_WEBHOOK_SECRET: str = ""
```

These are loaded from environment variables with `POLAR_` prefix.

### Key Design Decisions

1. **Frontend never calls FileForms** — all requests go through the Spaire API.
2. **`x-api-key` header** — matches FileForms auth pattern (not Bearer token as initially assumed).
3. **Async httpx** — consistent with the existing async patterns in the codebase.
4. **Singleton** — matches the service pattern used throughout the codebase.
5. **Error mapping** — `FileFormsError` and `FileFormsConflictError` are caught in the service layer and mapped to appropriate Spaire errors.
6. **Two-step document download** — `get_document()` returns metadata + presigned URL, then `download_document_content()` fetches the actual file bytes from S3.
7. **409 handling** — `FileFormsConflictError` allows the service to handle idempotent user/company creation (look up existing on conflict).

---

## 9. Webhook Handling

### Inbound Webhook Endpoint

FileForms sends webhook events to a dedicated Spaire endpoint. This follows the pattern used by `integrations/chargeback_stop/` for inbound webhooks.

> **FileForms webhook payload structure (from API docs):**
>
> `filing.status_changed`:
> ```json
> {
>   "id": "evt_a1b2c3d4e5f6g7h8",
>   "type": "filing.status_changed",
>   "createdAt": "2025-01-01T00:00:00Z",
>   "data": {
>     "orderType": "formation",           // or "annual_report", "registered_agent"
>     "orderId": "order_a1b2c3d4e5f6g7h8",
>     "createdAt": "2025-01-01T00:00:00Z",
>     "filingDate": "2025-01-01T00:00:00Z",  // null until filed
>     "filingStatus": "submitted",         // submitted | pending | filed | exception | cancelled
>     "subscriptionStatus": null           // or "active" for registered agent
>   }
> }
> ```
>
> `document.uploaded`:
> ```json
> {
>   "id": "evt_a1b2c3d4e5f6g7h8",
>   "type": "document.uploaded",
>   "createdAt": "2025-01-01T00:00:00Z",
>   "data": {
>     "orderId": "order_a1b2c3d4e5f6g7h8",
>     "documentId": "doc_a1b2c3d4e5f6g7h8",
>     "documentType": "registered_agent",
>     "fileName": "document.pdf",
>     "fileType": "application/pdf",
>     "fileUrl": "https://bucket.s3.us-east-1.amazonaws.com/document.pdf",
>     "createdAt": "2025-01-01T00:00:00Z"
>   }
> }
> ```
>
> **Expected response:** `{ "received": true }` with status 200.

```python
# polar/incorporation/webhook_endpoints.py

router = APIRouter(prefix="/webhooks/fileforms", tags=["webhooks"])

# Webhook event types we handle
HANDLED_WEBHOOK_EVENTS = {
    "filing.status_changed",
    "document.uploaded",
}


@router.post("/", status_code=200)
async def handle_fileforms_webhook(
    request: Request,
    session: AsyncSession,
) -> dict:
    """Receive and process FileForms webhook events.

    FileForms webhook payloads include:
    - id: Event ID (evt_...)
    - type: Event type string
    - createdAt: ISO timestamp
    - data: Event-specific payload
    """
    body = await request.body()

    # Verify webhook signature (exact mechanism TBD — confirm with FileForms partner docs)
    signature = request.headers.get("X-Webhook-Signature", "")
    if not verify_webhook_signature(body, signature, settings.FILEFORMS_WEBHOOK_SECRET):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    event_type = payload.get("type")  # NOTE: field is "type", not "event"
    event_id = payload.get("id")      # e.g. "evt_a1b2c3d4e5f6g7h8"

    if event_type not in HANDLED_WEBHOOK_EVENTS:
        log.info("Ignoring unhandled FileForms webhook", event_type=event_type)
        return {"received": True}

    # Enqueue via ExternalEvent for deduplication and async processing
    await external_event_service.enqueue(
        session,
        ExternalEventSource.fileforms,
        f"fileforms.webhook.{event_type}",
        event_id,
        payload,
    )

    return {"received": True}
```

**Note:** The exact webhook signature verification mechanism is not documented in the FileForms API reference. This needs to be confirmed with the FileForms partner team during Phase 2. The implementation above assumes a header-based HMAC signature similar to Stripe/Chargeback Stop patterns.

### ExternalEvent Integration

Add `fileforms` to `ExternalEventSource` enum:

```python
# polar/models/external_event.py
class ExternalEventSource(StrEnum):
    stripe = "stripe"
    chargeback_stop = "chargeback_stop"
    fileforms = "fileforms"  # NEW
```

### Webhook Event Handling in Service (via Background Tasks)

```python
# polar/incorporation/tasks.py

@actor(actor_name="fileforms.webhook.filing.status_changed")
async def filing_status_changed(event_id: UUID) -> None:
    async with AsyncSessionMaker() as session:
        async with external_event_service.handle(
            session, ExternalEventSource.fileforms, event_id
        ) as event:
            data = event.data["data"]
            await incorporation_service.handle_status_change(
                session,
                fileforms_order_id=data["orderId"],
                order_type=data["orderType"],
                filing_status=data["filingStatus"],
                filing_date=data.get("filingDate"),
                subscription_status=data.get("subscriptionStatus"),
            )


@actor(actor_name="fileforms.webhook.document.uploaded")
async def document_uploaded(event_id: UUID) -> None:
    async with AsyncSessionMaker() as session:
        async with external_event_service.handle(
            session, ExternalEventSource.fileforms, event_id
        ) as event:
            data = event.data["data"]
            await incorporation_service.handle_document_uploaded(
                session,
                fileforms_order_id=data["orderId"],
                document_id=data["documentId"],
                document_type=data["documentType"],
                file_name=data["fileName"],
                file_type=data["fileType"],
                file_url=data["fileUrl"],
            )
```

### Webhook Event Handling in Service

```python
# polar/incorporation/service.py

async def handle_status_change(
    self,
    session: AsyncSession,
    *,
    fileforms_order_id: str,
    order_type: str,              # "formation", "annual_report", "registered_agent"
    filing_status: str,           # "submitted", "pending", "filed", "exception", "cancelled"
    filing_date: str | None = None,
    subscription_status: str | None = None,
) -> None:
    repository = IncorporationRepository.from_session(session)
    incorporation = await repository.get_by_fileforms_order_id(fileforms_order_id)

    if incorporation is None:
        log.warning("Webhook for unknown order", fileforms_order_id=fileforms_order_id)
        return

    # Store raw FileForms status
    incorporation.filing_status = filing_status
    if subscription_status is not None:
        incorporation.subscription_status = subscription_status

    # Map FileForms filingStatus to Spaire internal status
    status_map = {
        "submitted": IncorporationStatus.submitted,
        "pending": IncorporationStatus.processing,
        "filed": IncorporationStatus.completed,
        "exception": IncorporationStatus.failed,
        "cancelled": IncorporationStatus.cancelled,
    }

    new_spaire_status = status_map.get(filing_status)
    if new_spaire_status:
        incorporation.status = new_spaire_status

        if filing_status == "filed":
            incorporation.completed_at = utc_now()
            if filing_date:
                incorporation.filed_at = datetime.fromisoformat(filing_date)

        if filing_status == "exception":
            incorporation.rejected_reason = f"Filing exception on {order_type} order"

        await repository.update(incorporation)


async def handle_document_uploaded(
    self,
    session: AsyncSession,
    *,
    fileforms_order_id: str,
    document_id: str,
    document_type: str,
    file_name: str,
    file_type: str,
    file_url: str,
) -> None:
    repository = IncorporationRepository.from_session(session)
    incorporation = await repository.get_by_fileforms_order_id(fileforms_order_id)

    if incorporation is None:
        log.warning("Document webhook for unknown order", fileforms_order_id=fileforms_order_id)
        return

    # Enqueue background download — pass the presigned fileUrl directly
    enqueue_job(
        "incorporation.download_document",
        incorporation_id=incorporation.id,
        provider_document_id=document_id,
        document_type=document_type,
        file_name=file_name,
        file_type=file_type,
        file_url=file_url,
    )
```

### Webhook Registration

The webhook router is registered in `polar/api.py`:

```python
from polar.incorporation.webhook_endpoints import router as fileforms_webhook_router
# ...
router.include_router(fileforms_webhook_router)  # /webhooks/fileforms
```

The webhook URL is configured in the FileForms partner dashboard to point to:
`https://api.spairehq.com/v1/webhooks/fileforms`

---

## 10. Document Storage

### Download and Store Flow

> **Important:** FileForms `GET /documents/{id}` returns JSON metadata with a presigned
> `fileUrl` (expires 1 hour), not binary content. The download is a two-step process:
> 1. Call FileForms API to get document metadata + presigned URL
> 2. Download the actual file bytes from the presigned S3 URL
>
> Alternatively, the `document.uploaded` webhook already includes `fileUrl` in its payload,
> so we can skip step 1 and download directly from the webhook-provided URL.

```python
# polar/incorporation/tasks.py

@actor(actor_name="incorporation.download_document", priority=TaskPriority.DEFAULT)
async def download_document(
    incorporation_id: UUID,
    provider_document_id: str,
    document_type: str,
    file_name: str,
    file_type: str,
    file_url: str,
) -> None:
    async with AsyncSessionMaker() as session:
        service = IncorporationService()
        await service.download_and_store_document(
            session,
            incorporation_id=incorporation_id,
            provider_document_id=provider_document_id,
            document_type=document_type,
            file_name=file_name,
            file_type=file_type,
            file_url=file_url,
        )
```

```python
# polar/incorporation/service.py

async def download_and_store_document(
    self,
    session: AsyncSession,
    *,
    incorporation_id: UUID,
    provider_document_id: str,
    document_type: str,
    file_name: str,
    file_type: str,
    file_url: str,
) -> IncorporationDocument:
    # Check for duplicate (idempotency)
    doc_repository = IncorporationDocumentRepository.from_session(session)
    existing = await doc_repository.get_by_provider_document_id(provider_document_id)
    if existing:
        return existing

    # 1. Download from the presigned fileUrl (provided by webhook or get_document())
    # If the webhook-provided URL has expired, fall back to fetching a fresh one
    try:
        content = await fileforms_client.download_document_content(file_url)
    except httpx.HTTPStatusError:
        # URL may have expired — get a fresh presigned URL from FileForms
        doc_meta = await fileforms_client.get_document(provider_document_id)
        content = await fileforms_client.download_document_content(doc_meta["fileUrl"])

    # 2. Upload to S3
    bucket = settings.S3_FILES_BUCKET_NAME
    s3_key = f"incorporations/{incorporation_id}/{document_type}/{file_name}"

    s3_service = S3_SERVICES.get(bucket)
    await s3_service.put_object(
        key=s3_key,
        body=content,
        content_type=file_type,
    )

    # 3. Create document record
    document = await doc_repository.create(
        IncorporationDocument(
            incorporation_id=incorporation_id,
            document_type=document_type,
            file_name=file_name,
            s3_bucket=bucket,
            s3_key=s3_key,
            file_size_bytes=len(content),
            mime_type=file_type,
            provider_document_id=provider_document_id,
        )
    )

    return document
```

### Document Retrieval

Documents are served through presigned S3 URLs, following the existing file download pattern:

```python
# polar/incorporation/service.py

async def get_document_download_url(
    self,
    session: AsyncReadSession,
    auth_subject: AuthSubject[User | Organization],
    incorporation_id: UUID,
    document_id: UUID,
) -> str:
    doc = await self._get_document(session, auth_subject, incorporation_id, document_id)

    s3_service = S3_SERVICES.get(doc.s3_bucket)
    url = await s3_service.generate_presigned_url(
        key=doc.s3_key,
        expires_in=settings.S3_FILES_PRESIGN_TTL,
    )
    return url
```

### S3 Bucket

Reuse the existing `polar-s3` bucket with a dedicated prefix (`incorporations/`). No new bucket needed.

**S3 key pattern:**
```
incorporations/{incorporation_id}/{document_type}/{file_name}
```

Example:
```
incorporations/550e8400-e29b-41d4-a716-446655440000/articles_of_organization/Articles_Acme_LLC.pdf
```

---

## 11. Frontend UX Plan

### Dashboard Integration

The incorporation wizard lives under the existing dashboard at:

```
/dashboard/[organization]/(header)/incorporate/
```

This follows the existing pattern for org-scoped dashboard pages (alongside `products/`, `customers/`, `sales/`, etc.).

### Route Structure

```
clients/apps/web/src/app/(main)/dashboard/[organization]/(header)/incorporate/
├── page.tsx                    # Landing/list page
├── new/
│   └── page.tsx                # Multi-step wizard
├── [incorporationId]/
│   ├── page.tsx                # Status/detail view
│   └── documents/
│       └── page.tsx            # Documents view
```

### Multi-Step Wizard Flow

```
┌──────────────────────────────────────────────────┐
│              Start a Company                      │
│                                                   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐  │
│  │ Step 1 │ │ Step 2 │ │ Step 3 │ │  Step 4   │  │
│  │ Entity │►│Details │►│Officers│►│ Address   │  │
│  │ Type   │ │        │ │        │ │           │  │
│  └────────┘ └────────┘ └────────┘ └───────────┘  │
│                                                   │
│  ┌────────┐ ┌────────┐                            │
│  │ Step 5 │ │ Step 6 │                            │
│  │ Review │►│Checkout│                            │
│  │        │ │        │                            │
│  └────────┘ └────────┘                            │
└──────────────────────────────────────────────────┘
```

#### Step 1 — Entity Type

- Select LLC or Corporation
  - LLC → shows `structureType` sub-choice (Member-Managed / Manager-Managed)
  - CORP → shows `taxElection` sub-choice (C Corporation / S Corporation)
- Brief description of each type
- Reuse: `RadioGroup` from `@spaire/ui`, `Card` component

#### Step 2 — Company Details

- Legal name (required)
- Trade name / DBA (optional)
- Formation state (dropdown of all 50 US states, default Delaware)
- Formation date (date picker, defaults to today)
- Fiscal year end month (dropdown, defaults to December)
- EIN (optional, format XX-XXXXXXX)
- Reuse: `Input`, `Select` from `@spaire/ui`

#### Step 3 — Officers

- Dynamic list of officers (add/remove, minimum 1)
- Each officer has:
  - Type: PERSON or COMPANY
  - Title (e.g., "Managing Member", "CEO", "Director")
  - For PERSON: First Name, Last Name
  - For COMPANY: Company Name
  - Address: Street, City, State, Zip
  - Is Primary (radio — exactly one must be primary)
- Reuse: `Form` (React Hook Form + Zod), `Input`, `Button`, `RadioGroup`

#### Step 4 — Address

- Company address: Street, City, State, Zip
- Mailing address: Street, City, State, Zip (with "Same as company address" checkbox)
- Include Registered Agent toggle (default: on)
- Reuse: `Input`, `Select`, `Checkbox` from `@spaire/ui`

#### Step 5 — Review

- Summary of all entered data
- Edit links back to each step
- Reuse: `Card`, `Badge`, `Separator`

#### Step 6 — Checkout

- Redirect to Spaire Checkout (existing checkout flow)
- On success, redirect to incorporation status page
- Reuse: Entire existing checkout infrastructure

### Reusable Components

| Component | Source | Usage |
|-----------|--------|-------|
| `Input` | `@spaire/ui` | All text fields |
| `Select` | `@spaire/ui` | State selector, entity type |
| `Button` | `@spaire/ui` | Navigation, submit |
| `Card` | `@spaire/ui` | Step containers, review cards |
| `Form` | React Hook Form + Zod | Form state management |
| `Badge` | `@spaire/ui` | Status badges |
| `Progress` | `@spaire/ui` | Step progress indicator |
| `Tabs` | `@spaire/ui` | Step navigation |
| `DataTable` | existing | Document list |
| `CopyToClipboardInput` | existing | Document download links |

### Status Page

After submission, the incorporation detail page shows:

```
┌─────────────────────────────────────────┐
│  Acme LLC — Delaware LLC                │
│                                         │
│  Status: ● Processing                   │
│  Filed: March 6, 2026                   │
│  ────────────────────────────────────    │
│                                         │
│  ┌─── Timeline ─────────────────────┐   │
│  │ ✓ Draft created     Mar 6, 2026  │   │
│  │ ✓ Payment received  Mar 6, 2026  │   │
│  │ ✓ Filed with state  Mar 6, 2026  │   │
│  │ ○ Formation complete             │   │
│  └──────────────────────────────────┘   │
│                                         │
│  Documents (0)                          │
│  No documents yet. Documents will       │
│  appear here once formation completes.  │
└─────────────────────────────────────────┘
```

### Navigation

Add "Incorporate" to the dashboard sidebar navigation, after "Settings":

```tsx
// In the sidebar navigation config
{
  title: "Incorporate",
  href: `/dashboard/${organization.slug}/incorporate`,
  icon: Building2,  // from lucide-react
}
```

### Data Fetching

Use TanStack Query hooks (following existing patterns):

```typescript
// hooks/queries/incorporations.ts
export const useIncorporation = (id: string) =>
  useQuery({
    queryKey: ['incorporations', id],
    queryFn: () => api.incorporations.get(id),
  })

export const useIncorporations = (orgId: string) =>
  useQuery({
    queryKey: ['incorporations', 'list', orgId],
    queryFn: () => api.incorporations.list({ organization_id: orgId }),
  })

export const useCreateIncorporation = () =>
  useMutation({
    mutationFn: (data: IncorporationCreate) =>
      api.incorporations.create(data),
  })
```

---

## 12. Migration Strategy

### Principles

1. **Additive only** — no changes to existing tables, no breaking schema modifications.
2. **Feature-flagged** — the incorporation feature can be enabled/disabled per organization.
3. **Backward compatible** — no existing API contracts change.
4. **Independent module** — the `incorporation/` module has no impact on other modules if disabled.

### Database Migration

```python
# migrations/versions/2026_03_xx_add_incorporations.py

def upgrade() -> None:
    op.create_table(
        "incorporations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id"), nullable=False),
        # Company details (aligned with FileForms CreateCompanyRequest)
        sa.Column("entity_type", sa.String(10), nullable=False),  # LLC, CORP
        sa.Column("legal_name", sa.String(255), nullable=False),
        sa.Column("trade_name", sa.String(255)),
        sa.Column("ein", sa.String(10)),  # XX-XXXXXXX
        sa.Column("structure_type", sa.String(10)),  # MEMBER, MANAGER (LLC only)
        sa.Column("tax_election", sa.String(20)),  # C Corporation, S Corporation (CORP only)
        sa.Column("fiscal_end_month", sa.String(10), server_default="December"),
        sa.Column("formation_date", sa.Date(), nullable=False),
        sa.Column("formation_state", sa.String(2), nullable=False),
        # Addresses
        sa.Column("address_street", sa.String(255), nullable=False),
        sa.Column("address_city", sa.String(255), nullable=False),
        sa.Column("address_state", sa.String(2), nullable=False),
        sa.Column("address_zip", sa.String(5), nullable=False),
        sa.Column("mailing_address_street", sa.String(255), nullable=False),
        sa.Column("mailing_address_city", sa.String(255), nullable=False),
        sa.Column("mailing_address_state", sa.String(2), nullable=False),
        sa.Column("mailing_address_zip", sa.String(5), nullable=False),
        # Officers (JSONB array)
        sa.Column("officers", sa.JSON(), nullable=False, server_default="[]"),
        # Service options
        sa.Column("include_registered_agent", sa.Boolean(), server_default="true"),
        # Payment
        sa.Column("checkout_id", sa.Uuid(), sa.ForeignKey("checkouts.id")),
        # FileForms provider IDs
        sa.Column("fileforms_user_id", sa.String(255)),
        sa.Column("fileforms_company_id", sa.String(255)),
        sa.Column("fileforms_order_id", sa.String(255)),
        # Status tracking
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("status_detail", sa.Text()),
        sa.Column("filing_status", sa.String(20)),  # FileForms filingStatus
        sa.Column("subscription_status", sa.String(20)),  # FileForms subscriptionStatus
        sa.Column("filed_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("rejected_reason", sa.Text()),
    )
    op.create_index("ix_incorporations_organization_id", "incorporations", ["organization_id"])
    op.create_index("ix_incorporations_status", "incorporations", ["status"])
    op.create_index("ix_incorporations_fileforms_order_id", "incorporations", ["fileforms_order_id"])
    op.create_index("ix_incorporations_created_at", "incorporations", ["created_at"])
    op.create_index("ix_incorporations_deleted_at", "incorporations", ["deleted_at"])

    op.create_table(
        "incorporation_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("modified_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("incorporation_id", sa.Uuid(), sa.ForeignKey("incorporations.id"), nullable=False),
        sa.Column("document_type", sa.String(50), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("s3_bucket", sa.String(255), nullable=False),
        sa.Column("s3_key", sa.String(512), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger()),
        sa.Column("mime_type", sa.String(100), server_default="application/pdf"),
        sa.Column("provider_document_id", sa.String(255), nullable=False),
    )
    op.create_index("ix_incorporation_documents_incorporation_id", "incorporation_documents", ["incorporation_id"])
    op.create_index("ix_incorporation_documents_provider_document_id", "incorporation_documents", ["provider_document_id"])
    op.create_index("ix_incorporation_documents_created_at", "incorporation_documents", ["created_at"])
    op.create_index("ix_incorporation_documents_deleted_at", "incorporation_documents", ["deleted_at"])


def downgrade() -> None:
    op.drop_table("incorporation_documents")
    op.drop_table("incorporations")
```

### Touchpoints to Existing Code (Minimal)

| File | Change | Lines |
|------|--------|-------|
| `polar/api.py` | Import and register incorporation routers | +3 lines |
| `polar/models/__init__.py` | Import new models | +2 lines |
| `polar/config.py` | Add FileForms config settings | +3 lines |
| `polar/order/service.py` | Hook to enqueue incorporation task on payment | +5 lines |
| `polar/auth/scope.py` | Add `incorporations_read`, `incorporations_write` scopes | +2 lines |

**Total changes to existing code: ~15 lines across 5 files.** Everything else is new code in the new module.

---

## 13. Implementation Phases

### Phase 1 — Backend Scaffolding (3 days)

**Goal:** Module structure, database models, repository, basic CRUD endpoints.

- [ ] Create `polar/incorporation/` module with all files
- [ ] Define SQLAlchemy models (`Incorporation`, `IncorporationDocument`)
- [ ] Create Alembic migration
- [ ] Implement repository with auth-aware queries
- [ ] Implement basic service methods (create_draft, get, list, update)
- [ ] Define Pydantic schemas (create, read, update)
- [ ] Implement auth dependencies
- [ ] Register routes in `polar/api.py`
- [ ] Register models in `polar/models/__init__.py`
- [ ] Add sorting enum
- [ ] Write unit tests for service and repository

### Phase 2 — Provider Client (2 days)

**Goal:** FileForms API client abstraction with error handling.

- [ ] Implement `provider_client.py` with all API methods
- [ ] Add FileForms config to `polar/config.py`
- [ ] Write integration tests with mock HTTP responses
- [ ] Handle error mapping (FileFormsError → PolarError)
- [ ] Add structured logging for all API calls

### Phase 3 — Checkout Integration (2 days)

**Goal:** Incorporation payment via Spaire Checkout.

- [ ] Create formation products in Spaire (via migration or seed)
- [ ] Implement `initiate_checkout()` in service
- [ ] Add `POST /v1/incorporations/{id}/checkout` endpoint
- [ ] Add payment confirmation hook in order service
- [ ] Write tests for checkout flow

### Phase 4 — FileForms Submission Pipeline (2 days)

**Goal:** Background task pipeline for FileForms submission.

- [ ] Implement `submit_to_fileforms()` service method
- [ ] Create Dramatiq tasks: `incorporation.payment_confirmed`, `incorporation.submit_to_fileforms`
- [ ] Handle FileForms API call sequence (user → company → order)
- [ ] Implement retry logic for transient failures
- [ ] Update incorporation status at each step
- [ ] Write tests with mocked FileForms responses

### Phase 5 — Webhooks and Document Storage (3 days)

**Goal:** Inbound webhook processing, document download and S3 storage.

- [ ] Implement `webhook_endpoints.py` with signature verification
- [ ] Implement `handle_status_change()` in service
- [ ] Implement `handle_document_uploaded()` in service
- [ ] Implement `download_and_store_document()` background task
- [ ] S3 upload integration for documents
- [ ] Presigned URL generation for document downloads
- [ ] Register webhook router in `polar/api.py`
- [ ] Write tests for webhook handling
- [ ] Write tests for document storage flow

### Phase 6 — Frontend: Incorporation Wizard (4 days)

**Goal:** Multi-step wizard in the dashboard.

- [ ] Create route structure under `/dashboard/[organization]/(header)/incorporate/`
- [ ] Implement Step 1: Entity Type selection
- [ ] Implement Step 2: Company Details form
- [ ] Implement Step 3: Founders form (dynamic list)
- [ ] Implement Step 4: Ownership allocation
- [ ] Implement Step 5: Review summary
- [ ] Implement Step 6: Checkout redirect
- [ ] Create TanStack Query hooks
- [ ] Add Zod validation schemas
- [ ] Add sidebar navigation entry
- [ ] Responsive design with dark mode

### Phase 7 — Frontend: Status & Documents (2 days)

**Goal:** Status tracking and document viewing.

- [ ] Implement incorporation detail page with timeline
- [ ] Implement document list with download links
- [ ] Status badge component
- [ ] Auto-refresh via polling or SSE

### Phase 8 — Testing and Production Readiness (2 days)

**Goal:** End-to-end testing, error handling, monitoring.

- [ ] End-to-end test with FileForms sandbox
- [ ] Error boundary and fallback UI
- [ ] Structured logging and alerting
- [ ] Rate limiting on webhook endpoint
- [ ] Documentation for ops team

### Total: ~20 engineering days

---

## 14. Risk Analysis

### Edge Cases and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Company name conflict** | Filing rejected by state | Medium | Collect 2 alternative names. Show guidance on naming rules. Allow re-submission with new name. |
| **Filing rejection** | User stuck, needs refund | Low | `failed` status with `rejected_reason`. Email notification to user. Manual refund process via backoffice. |
| **Failed FileForms API call** | Submission not completed | Medium | Dramatiq retry with exponential backoff (up to 20 retries per WORKER_MAX_RETRIES). Idempotency via provider IDs. |
| **Duplicate submission** | Double charge, double filing | Low | Check `status != draft` before accepting checkout. Unique constraint on `fileforms_order_id`. |
| **Webhook delivery failure** | Status not updated | Medium | Implement periodic polling task (`incorporation.sync_status`) as fallback. Runs every 30 min for `submitted`/`processing` incorporations. |
| **Webhook replay/duplicate** | Double processing | Medium | Idempotent webhook handling — check if status already matches before updating. Check if document already exists before downloading. |
| **Document download failure** | Missing documents | Low | Retry via Dramatiq. Manual re-trigger via backoffice. |
| **S3 upload failure** | Document not stored | Low | Retry in background task. Document remains available via FileForms API as fallback. |
| **Payment succeeds but FileForms fails** | User paid but not filed | Low | `submitted` status indicates payment received. Background task retries. Alert on repeated failures. Manual intervention via backoffice. |
| **State-specific requirements** | Different states need different fields | Medium | Start with Delaware and Wyoming (most common). Expand state support incrementally. Entity type + state determines required fields. |
| **Partial wizard completion** | User abandons mid-form | High | Draft saved at each step. User can resume from where they left off. Drafts auto-expire after 30 days. |

### Security Considerations

1. **Webhook signature verification** — Mandatory. Reject unsigned requests.
2. **FileForms API key** — Stored as environment variable, never logged, never exposed to frontend.
3. **PII in founders data** — JSONB column contains personal information. Access controlled via org membership.
4. **Document access** — Presigned S3 URLs with TTL. Auth check before generating URL.
5. **Input validation** — All user input validated via Pydantic schemas. SQL injection prevention via SQLAlchemy ORM.

---

## 15. Engineering Effort

| Phase | Duration | Engineers | Notes |
|-------|----------|-----------|-------|
| Phase 1: Backend scaffolding | 3 days | 1 backend | Foundation work |
| Phase 2: Provider client | 2 days | 1 backend | FileForms integration |
| Phase 3: Checkout integration | 2 days | 1 backend | Payment flow |
| Phase 4: Submission pipeline | 2 days | 1 backend | Background tasks |
| Phase 5: Webhooks + documents | 3 days | 1 backend | Webhooks, S3 |
| Phase 6: Frontend wizard | 4 days | 1 frontend | Multi-step form |
| Phase 7: Frontend status/docs | 2 days | 1 frontend | Status + downloads |
| Phase 8: Testing + polish | 2 days | 1 fullstack | E2E, monitoring |
| **Total** | **20 days** | **1–2 engineers** | ~4 calendar weeks |

### Parallelization Opportunities

- Phases 1–2 can be done sequentially by one backend engineer.
- Phases 3–5 can be done sequentially by the same backend engineer.
- Phase 6 can start **in parallel** with Phase 3 once Phase 1 schemas are defined (frontend can work against mock API).
- Phase 7 can overlap with Phase 5.
- With 2 engineers (1 backend + 1 frontend), calendar time drops to ~3 weeks.

### Dependencies

| Dependency | Owner | Blocker? |
|------------|-------|----------|
| FileForms API key + sandbox access | Partnerships | Yes — needed before Phase 2 |
| FileForms webhook URL registered | Partnerships | Yes — needed before Phase 5 |
| Formation product pricing decisions | Product | Yes — needed before Phase 3 |
| Sidebar navigation approval | Design | No — can ship without |

---

## Appendix A: Configuration Additions

```python
# Added to polar/config.py Settings class:

# FileForms (Company Formation)
FILEFORMS_API_URL: str = "https://api.fileforms.com/v1"
FILEFORMS_API_KEY: str = ""
FILEFORMS_WEBHOOK_SECRET: str = ""
```

Environment variables (added to `.env`):
```bash
POLAR_FILEFORMS_API_URL=https://api.fileforms.com/v1
POLAR_FILEFORMS_API_KEY=ff_key_xxx
POLAR_FILEFORMS_WEBHOOK_SECRET=whsec_xxx
```

## Appendix B: Auth Scope Additions

```python
# Added to polar/auth/scope.py:

class Scope(StrEnum):
    # ... existing scopes ...
    incorporations_read = "incorporations:read"
    incorporations_write = "incorporations:write"
```

## Appendix C: API Router Registration

```python
# Added to polar/api.py:

from polar.incorporation.endpoints import router as incorporation_router
from polar.incorporation.webhook_endpoints import router as fileforms_webhook_router

# /incorporations
router.include_router(incorporation_router)
# /webhooks/fileforms
router.include_router(fileforms_webhook_router)
```

## Appendix D: Model Registration

```python
# Added to polar/models/__init__.py:

from polar.models.incorporation import Incorporation, IncorporationDocument
```
