# Claidor on the Spaire/Polar stack — reuse audit

**Question:** can this codebase be reused to build Claidor — the definitive record of OHADA
law plus an AI librarian that answers questions in French with article-level citations,
sold as seat-based subscriptions to law firms?

**Verdict: yes, as a chassis — and this repo has already proven the playbook once.**
This is not upstream Polar: it is the Spaire fork, which already repurposed Polar's
payment-infrastructure codebase into a creator-course platform. In doing so it built the
two things Claidor needs most and Polar never had: a **citation-grounded RAG pipeline over
a text corpus** (`course_assistant`) and an **anti-fabrication citation validator**
(`masterclass_architect`). Roughly the entire SaaS chassis (auth, tenancy, jobs, files,
email, webhooks, billing, admin, observability, CI/deploy) transfers. What does *not*
exist anywhere in the repo is Claidor's actual moat: the legal corpus layer — versioned
statute text, document ingestion, semantic retrieval. You would build that regardless of
starting point; the question was only whether the surrounding 80% comes for free. It
largely does.

License: Apache 2.0 — commercial reuse, modification, and closed derivatives are all
permitted (keep the license/notice files).

---

## 1. What the stack is

| Layer | Technology |
|---|---|
| API | Python 3.14, FastAPI, Pydantic v2, SQLAlchemy 2 async + asyncpg, Alembic (407 migrations) |
| Data | PostgreSQL 15 (single DB, `organization_id` tenancy), Redis, S3/MinIO, Tinybird/ClickHouse (analytics) |
| Jobs | Dramatiq + Redis, APScheduler cron, post-commit enqueue, debouncing |
| AI | Anthropic SDK (citations API, prompt caching, streaming), pydantic-ai, Vercel AI SDK v5 on the frontend |
| Frontend | Next.js 16 / React 19 (App Router, Turbopack), Tailwind v4, shadcn/Radix (`@spaire/ui`), TanStack Query v5, `openapi-fetch` over generated types, TipTap, MDX + Shiki |
| Admin | Server-rendered FastAPI backoffice (Tagflow + HTMX + DaisyUI) |
| Ops | Terraform → Render + AWS S3, GitHub Actions CI/deploy, Sentry, Logfire/OTel, Prometheus + Grafana, PostHog |
| Monorepo | `server/` (uv, taskipy), `clients/` (pnpm + Turborepo + Changesets), strict mypy + ruff, pytest harness with per-worker DBs |

---

## 2. Reuse map against Claidor's product

### A. Take nearly as-is — the platform kernel (~60% of Claidor's surface)

- **Auth & identity** — `polar/auth`, `polar/oauth2`, `polar/login_code`,
  `polar/personal_access_token`, `polar/organization_access_token`, plus
  Google/GitHub/Apple social login. Cookie sessions, passwordless email codes, scoped
  API tokens, and a full Authlib OAuth2 authorization server. Law-firm SSO later maps
  onto this cleanly.
- **Multi-tenancy** — `Organization` as tenant root, `UserOrganization` staff
  membership, repository-level scoping via `get_readable_statement(auth_subject)`.
  A firm = an organization; per-tenant custom domains (`organization_custom_domain`)
  and tenant-scoped rate limits already exist.
- **Seats** — `customer_seat` + `member` + `member_session` implement the exact flow
  Claidor sells: seat invitation → email token → claim → revoke, with roles
  (owner / billing manager / member) and SSE live updates.
- **The kernel library** — `polar/kit`: base models (UUID PK, timestamps, first-class
  soft delete), generic repositories with pagination/sorting, JSONB metadata with a
  query DSL, crypto/JWT/JWKS, naming-convention metadata for clean Alembic
  autogeneration, `alembic-utils`-versioned PG triggers/functions.
- **Background work** — `polar/worker`: Dramatiq actors with priority queues, cron via
  APScheduler, jobs flushed only after the request transaction commits, debounce
  middleware. This is the substrate for Claidor's ingestion pipelines and gazette-watch
  alerts.
- **Files** — `polar/file` + `integrations/aws/s3`: presigned multipart browser
  uploads, checksums, signed downloads, private/public bucket routing. This is the
  corpus-ingestion front door (gazette PDFs, scans) with zero changes.
- **Email** — Resend-backed sender with React Email templates, personalization, open/
  click tracking; plus the fork's broadcast/segment/sequence machinery
  (`email_broadcast`, `email_segment`, `email_sequence`, `email_subscriber`) — "here's
  what changed for you this week" alerts are a configuration of this, not a build.
- **Realtime** — `polar/eventstream`: Redis pub/sub → SSE. Needed for streaming
  answers; already wired end to end.
- **Webhooks, notifications, rate limiting, locks, audit log, observability,
  health/migrate-on-boot** — all present and generic.
- **Backoffice chrome** — the layout/datatable/forms/modal/impersonation scaffold
  (~10 files) gives an internal admin — including the human-review consoles Claidor's
  "pipelines with human checks" require — in days. The Polar feature screens are
  throwaway.
- **Test harness** — per-xdist-worker databases, transaction-rollback isolation,
  `@pytest.mark.auth` parameterization that systematically tests tenant isolation,
  2,400 lines of object factories, fakeredis, VCR. This is expensive to rebuild and
  transfers wholesale.
- **Infra** — Terraform modules for Render services + S3 buckets, deploy/test/backup
  GitHub Actions workflows.

### B. The crown jewel — the citation RAG pipeline

`polar/course_assistant/ai.py` (1,300 lines, deliberately import-light and
unit-testable) is architecturally Claidor's librarian, built for course transcripts
instead of statutes:

- **Corpus → document with offset tracking**: `assemble_knowledge_base_with_refs()`
  concatenates sources into one labelled document and records the character range each
  source occupies.
- **Real citations**: the corpus goes to Claude as a `document` content block with
  `citations: {enabled: true}`; `extract_citations()` + `map_citations_to_lessons()`
  resolve model citations back through the offset map to the originating source —
  rendered client-side as clickable cards that deep-link into the source. Rename
  "lesson" to "article / CCJA decision paragraph" and this is Claidor's core UX.
- **Grounding discipline**: authority-hierarchy system prompt, strictness modes
  (`course_only` vs labelled general knowledge), a cheap Haiku guardrail call gating
  out-of-domain input, prompt caching on the stable corpus prefix, token budgeting
  against a 600k-token context ceiling, streaming via SSE.
- **Question log**: append-only, written best-effort after the answer streams, with
  normalized grouping — Claidor's "what are lawyers asking / what couldn't we answer"
  analytics for free.
- **Anti-fabrication validator** (`masterclass_architect/architect_ai.py`): every
  quote/source an AI output cites must exist in the evidence pack or it is stripped.
  Exactly the integrity property legal citations demand.
- Offline eval harness: `scripts/course_assistant_eval.py`.

Frontend side: working Vercel AI SDK v5 streaming chat routes and tool-call UI, a
streaming-friendly memoized Markdown renderer, and TipTap/MDX/Shiki document plumbing.

### C. Take as a pattern, adapt

- **Search** — `polar/search`: Postgres FTS done properly (trigger-maintained
  `tsvector` columns versioned via alembic-utils, `websearch_to_tsquery`, `ts_rank`,
  cross-entity `union_all` with per-type scope gating). French config (`'french'`
  instead of `'english'/'simple'`) is a parameter. This becomes lexical search over
  articles/decisions; the migrations from 2025-12 are a copyable template.
- **Billing** — two viable paths:
  1. **Keep the fork's self-billing** (`polar/platform`, "Spaire-on-Spaire"): the app
     already sells its own tiered plans through itself, with 14-day trials, upgrades,
     entitlement gating (`polar/entitlements`), and seat management. Fastest path to
     charging firms; the cost is carrying the merchant-of-record machinery underneath.
  2. **Strip to plain Stripe Billing**: delete the MoR core (§3) and keep only the
     seat/member flow shape. Less surface to own; more upfront surgery.
  Recommendation: start on path 1 (it works today), plan for path 2 once Claidor has
  revenue and the unused MoR surface starts costing maintenance.
- **Usage metering** — `event`/`meter`/`quotas`/`entitlements` generalize to
  per-seat query quotas and tier gating.
- **Custom fields / forms** — generic, useful for firm onboarding.

### D. Delete — the merchant-of-record core (~35 of 81 backend modules)

Claidor is a SaaS with subscriptions, not payment infrastructure. Unless path C.1 keeps
some of it temporarily: `account`, `account_credit`, `held_balance`, `payout`,
`transaction`, `processor_transaction`, `payment`, `payment_method`, `dispute`,
`refund`, `tax`, `invoice`, `client_invoice`, `wallet`, `pledge`, `campaign`,
`checkout*`, `discount`, `order`, `storefront`, `benefit`, `license_key`,
`product_review`, Stripe Connect integration, chargeback tooling — plus the fork's
course/community vertical (`course`, `community`, `masterclass_architect` product code —
keep its validator) and the Expo mobile app. Also drop the MUI/Emotion dependency
(three styling systems currently coexist in `apps/web`).

---

## 3. What Claidor must build net-new (nothing in the repo does this)

1. **The versioned corpus model — the moat, and a day-one requirement.** Nothing in
   this codebase versions content. `File.version` is an S3 label; courses have no
   revision history; soft delete is the only temporal affordance. Claidor's core
   tables — uniform acts → articles → article *versions* with validity intervals
   (point-in-time "what did Article 147 say on this date"), amendments as first-class
   links, CCJA decisions linked to the articles they interpret *with the version they
   interpret* — are a new design. This cannot be deferred: the flagship act, AUPSRVE,
   was replaced by the revised act in force 16 February 2024, while the 1998 act
   continues to govern proceedings started before that date — two versions in active
   legal life simultaneously, and which one applies depends on when the proceeding
   began. The kernel (`RecordModel`, repositories, alembic-utils triggers) is a good
   substrate, but the temporal model is original work. Get this schema right first;
   everything else hangs off it.
2. **Document ingestion.** No PDF parsing or OCR exists (only WebVTT transcript
   parsing and PDF *generation* via fpdf2). Gazette-scan → structured-article pipelines
   with human review are new — though they slot naturally into the Dramatiq worker +
   S3 upload + backoffice-review scaffolding.
3. **Semantic retrieval.** No pgvector, no embeddings, no chunking, no reranking
   anywhere. Add the `pgvector` extension alongside the existing FTS for hybrid
   retrieval — the alembic-utils extension mechanism and the search-service shape make
   this an extension, not a rearchitecture. Note: the corpus-as-one-document approach
   in `course_assistant` works to ~600k tokens; the full OHADA corpus (uniform acts +
   CCJA case law) will exceed a single context window, so retrieval-then-cite is
   required, not optional.
4. **French-first UI.** `@spaire/i18n` is a sound 121-line runtime with 10 locales
   including French — but it is wired into checkout only; the entire dashboard is
   hardcoded English and there is no locale routing. For a product whose primary
   language is French, build French-first (or swap in `next-intl`) rather than
   retrofitting translations.
5. **Legal-reading UX.** Article reader with version diffing, cross-reference
   navigation, citation graph. TipTap/MDX/Shiki and the citation-card patterns help;
   the product surface is new.

---

## 4. Risks and caveats inherited with the fork

- **Half-finished rename.** Polar naming survives in env vars, cookies
  (`polar_session` fallback), and package internals. Claidor would be the second
  rebrand on this codebase; budget a cleanup pass or accept the archaeology.
- **A known local-dev break**: `course_assistant/DESIGN-v2.md` notes pytest/alembic
  were blocked locally by a Python 3.14 / pydantic-settings crash at the time of
  writing. Verify the dev loop runs before committing to the stack.
- **Tenancy is a discipline, not a guarantee.** Scoping lives in each repository's
  `get_readable_statement`; every new repository must implement it. The auth-fixture
  test parameterization is the safety net — keep using it. For legal-privilege-grade
  confidentiality expectations, consider adding Postgres RLS as a backstop.
- **Frontend tests are thin** (23 files, no E2E) and dark mode is force-disabled
  behind a CSS workaround.
- **Operational footprint**: Postgres + Redis + S3 + Tinybird + Resend + Sentry +
  Logfire + PostHog + Render. Fine, but it's a real platform to run — Tinybird/
  ClickHouse and the mobile push stack are droppable for Claidor v1.

---

## 5. Suggested path

1. **Spike the librarian on AUPSRVE.** AUPSRVE is the right first act for reasons
   beyond familiarity: it alone generates the majority (reported >70%) of CCJA
   litigation, making it both the most valuable single act to ship and the densest
   stress test of the citation graph. It is also the hardest honest test: because of
   the 2024 revision, the spike must load *both* versions (1998 and 2023) into the
   `acts/articles/article_versions` schema from day one, tag each CCJA link with the
   version it interprets (most existing decisions predate the reform and interpret
   the 1998 text), and the answer engine must resolve or ask for the temporal anchor
   ("when did the proceeding begin?") before answering. Eval questions must be
   version-aware. The demo that proves the product is answering "under the old act or
   the new one?" correctly — the question currently on every practitioner's desk.
   Start with a thin vertical slice inside the act (e.g. the saisie-attribution
   articles) before structuring all of it.
2. **Design the temporal corpus schema** (article versions, amendments, decision
   links) on the `kit` substrate; build ingestion as Dramatiq pipelines with
   backoffice review screens.
3. **Add hybrid retrieval**: French-config tsvector (copy `polar/search`) + pgvector
   embeddings + rerank, feeding retrieved fragments into the citation pipeline.
4. **Strip the vertical you don't need** (courses/community/MoR per §2D) as you go —
   don't do a big-bang deletion up front; the modules are decoupled enough to remove
   incrementally.
5. **Charge money** through the existing platform self-billing + seats, migrating to
   plain Stripe Billing later if the MoR surface becomes a tax.

**Bottom line:** the stack is a strong fit — modern, strictly typed, well-tested on
the backend, already AI-native with the exact citation mechanism Claidor's credibility
depends on, and already proven to survive one full product pivot. Reusing it buys the
SaaS chassis and the librarian's skeleton. The library itself — the versioned OHADA
record — was always going to be built from scratch. That's not a weakness of the
stack; it's the moat.
