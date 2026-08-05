# Spaire → "The MasterClass Builder" — Reposition Implementation Plan

> **Status:** Plan / not yet executed.
> **Goal:** Strip the Spaire dashboard and buyer-facing surfaces down to a single, premium
> course-creation product (internally "Spaire Originals"), hiding everything that belongs to the
> generic "run your digital business" (Whop/Kajabi) model — **without deleting any backend**.
> **Source:** Multi-agent codebase audit (nav, settings, onboarding, payouts/KYC, product/benefit
> coupling, marketing/automation, terminology) + architecture / legal-MoR / completeness critique.

---

## 0. The governing principle

**Hide ≠ delete.** The course product is built _on top of_ the digital-business machinery:

- A **Course is a Product** (`CourseWizard` creates a Product + a Course row, 1:1).
- **Enrollment is a Benefit grant**: `Order → grant_benefit → BenefitCourseAccessService.grant → CourseEnrollment`,
  routed through `BenefitType.course_access` + a `ProductBenefit` join row.
- The nav is flag-driven (`components/Dashboard/navigation.tsx`, every route has `if:`), so hiding is a
  one-line, reversible change with **zero backend impact**.

Therefore every task below is **UI masking + copy rename over a fully-wired backend**. The reposition is
mostly a buyer-facing + onboarding job; the dashboard nav is the easy 10%.

### Locked decisions (from founder)

1. **Buyer landing:** the public link `/{slug}` should resolve to the course's own portal/landing
   (not the multi-product shop). Requires migrating existing `storefront_enabled` orgs + 301 of the old shop.
2. **Onboarding order:** keep the plan/pricing step **before** course creation (it can carry the
   onboarding-complete stamp — lowest redirect-loop risk).
3. **Deliverable:** this phased, file-level plan; execution begins at Phase 1.

### 🚫 Do-not-touch invariants (backend must stay live & wired)

- [ ] `BenefitType.course_access` strategy + the `ProductBenefit` join (`server/polar/benefit/strategies/course_access/*`)
- [ ] `_ensure_course_access_benefit` auto-creation in `server/polar/course/service.py`
- [ ] The `email_sequence` engine: `server/polar/email_sequence/{service,tasks}.py`, `flow_engine.py`, and the
      course triggers `on_purchase` / `on_lesson_completed` / `on_course_completed`
- [ ] All compliance controls: Stripe identity verification, KYB business-details, AI acceptable-use review
      (`server/polar/organization/ai_validation.py`), volume/account review, `is_blocked`, dispute handling
- [ ] **Never prune "orphaned" products/benefits.** `ondelete='cascade'` on `courses.product_id` and
      `email_sequences.organization_id` means deleting a stray-looking Product cascades into Course + enrollments.

---

## Phase 0 — Legal gate (BLOCKING, do first)

> The founder's belief that payout verification can be dropped is **wrong**, and the gate is broader than
> payouts: KYB business-details + identity verification gate **checkout itself** (`is_organization_ready_for_payment`
> in `server/polar/organization/service.py`). As a Merchant of Record, Spaire eats chargeback liability.

- [ ] Confirm with legal/compliance that identity verification, KYB business-details, AI acceptable-use review,
      and volume/account review all **stay**. No code change until this returns.
- [ ] Treat **tax-behavior config** (inclusive/exclusive/location-based) as compliance-load-bearing, not a
      SaaS toggle — group it with this gate, not the Phase 5 cosmetic hides.
- [ ] Allowed now: soften _copy only_ — e.g. "Verify your identity to get paid", "Account & identity verification".
      Do not erase "business" framing where `business_type` legally drives KYB.

**Open policy decisions to resolve here:** course refund window, dispute/chargeback handling, VAT-invoice flow.

---

## Phase 1 — Reversible nav hides + rename (pure `if:false`, zero backend)

File: `clients/apps/web/src/components/Dashboard/navigation.tsx`

- [ ] `id: 'space'` (L181-190) → `if: false`
- [ ] `id: 'customers'` (L224-233) → `if: false` (roster already lives in the course editor's Customers/Students tab)
- [ ] `id: 'marketing'` (L264-273) → `if: false` — **route/nav only; the email engine stays (moat)**
- [ ] `id: 'developers'` (L274-283) → `if: false` (it's an SDK-docs hub, _not_ payment links)
- [ ] `id: 'founder-tools'` (L284-293) → `if: false`
- [ ] `id: 'developer'` account route (L311-317) → `if: false` (the real API-key/OAuth surface; founder missed this)
- [ ] `id: 'courses'` (L214-223): `title: 'Courses'` → **`'MasterClass'`**; keep route `/courses`. Make it the
      primary item after Overview.
- [ ] Org switcher in `components/Layout/Dashboard/DashboardSidebar.tsx`: hide the **"New Organization"** create
      affordance, but **keep switching** among orgs a user already owns (don't strand existing multi-org users).

**Verification gate for this phase (do NOT defer to the end):**

- [ ] Smoke-test that a course purchase still fires its lifecycle email sequence after the Marketing hide
      (the generic UI and the in-course `AutomationSequenceBuilder` write to the same `email_sequences` table).

---

## Phase 2 — Promote-then-hide Products (ordering matters)

> `Payment Links` and `Discounts` are **children of the `catalog`/Products route** (navigation.tsx L202-211).
> Hiding Products as-is silently kills both features the founder wants to keep.

- [ ] Promote **Payment Links** (`/products/checkout-links`) to a top-level entry in `generalRoutesList`.
- [ ] Promote **Discounts** (`/products/discounts`) to a top-level entry (or under Settings). Decision: **keep** — discounts apply to courses.
- [ ] Verify both work standalone, **then** set `id: 'catalog'` (L191-213) → `if: false`.
- [ ] Re-point `CourseWizard.tsx` `handleClose()` (currently `router.push('…/products')`) → `/courses`, so closing
      the wizard doesn't dump the creator on a hidden/gated route. _(verify current target)_
- [ ] URL-gate orphan routes reachable by direct link even when nav-hidden: `…/founder-tools/*` (`startup-stack`,
      `formation`), `…/email-marketing/*`, account `developer`.
  - [ ] **Whitelist** `/products/new?type=course` and the product-pricing edit path the course editor uses — a
        blanket `/products/**` guard breaks course creation and pricing edits.
- [ ] Lock generic digital-product pricing options (usage/metered, seats) in the **shared product editor**
      (`CreateProductSplitPage` / `ProductPriceCustom` usage components). _Note: `CourseWizard` already hardcodes
      `amount_type: 'fixed'`, so the course path is safe — the exposure is only the generic editor._

---

## Phase 3 — Onboarding rework (HIGHEST RISK — ship atomically, smoke-test new account)

> The dashboard plan-gate (`app/(main)/dashboard/[organization]/layout.tsx`) only releases when
> `ai_onboarding_completed_at` is stamped **or** a real non-trial subscription exists. Today the **only** stampers
> are `onboarding/review/ReviewPage.tsx` ("Create your Space" card) and `onboarding/assistant/chat/route.ts`.
> `CourseWizard` does **not** stamp it. Removing the Space card without re-homing the stamp = infinite redirect to
> `/onboarding/plan`.

- [ ] **Keep** `/onboarding/plan` before course creation (locked decision) and make the **plan-step completion**
      carry the `POST /v1/organizations/{id}/ai-onboarding-complete` stamp, so onboarding always terminates the gate
      _before_ routing into the wizard. (Avoids the abandonment-trap of stamping only at final course-create.)
- [ ] Replace the `/onboarding/review` Space-card terminus with a handoff into `CourseWizard`; deep-link
      `?type=course` so the product-type chooser never shows.
- [ ] Strip storefront writes from `OrganizationStep` (cover-image → `storefront_settings`, "Space Card" copy,
      the multi-org "workspace/team" branch). Stop flipping `storefront_settings.enabled = true`.
      _(Verified safe: checkout + customer portal do not gate course delivery on `storefront_enabled`.)_
- [ ] Fix `OnboardingProgressBar` / `OnboardingStepper` step counts + copy (currently org/"first product"/workspace framing).
- [ ] Update the `auto=true` express-create redirect target (`onboarding`-adjacent `create/page.tsx`).
- [ ] Hide legacy `/onboarding/integrate` + `/onboarding/lovable` (developer-integration onboarding).
- [ ] Audit the **AI AssistantStep** path (`onboarding/assistant/chat/route.ts`, PostHog `onboarding_flow_v1`):
      confirm where it captures `organization.details` (KYB) and that it still stamps completion.
- [ ] Rename `/welcome` splash copy ("Monetize your creativity" → "Launch your MasterClass").

**⚠️ Confirm before merging:** whichever onboarding step captures `organization.details` (business description,
customer_acquisition) is **load-bearing for KYC** — `is_organization_ready_for_payment` blocks _checkout_ without it.
Do not remove a step until the details payload is still collected before first checkout.

**Smoke test:** brand-new org created **after 2025-08-04** (the grandfather cutoff in `organization/service.py`) —
an older test account won't reproduce the gate behavior. Verify: signup → plan → wizard → publish → **take a test payment**.

---

## Phase 4 — Terminology (student-facing emails + SEO first)

> Buyer-facing wording undermines the positioning more than dashboard copy. Prioritize accordingly.

### 4a. Transactional emails (`server/emails/src/emails/*.tsx`)

- [ ] `order_confirmation.tsx` — the **most-received** email for one-time course buyers ("Thank you for your order",
      renders `<Benefits>`). Rework first.
- [ ] `subscription_confirmation.tsx`, `subscription_revoked.tsx`, `subscription_cycled/cancellation/past_due/updated.tsx`
- [ ] `components/Benefits.tsx` ("Included benefits" → "Course includes / What you get")
- [ ] Creator notifications: `notification_new_sale.tsx`, `notification_new_subscription.tsx`
- [ ] Hide `seat_invitation.tsx` (unless team licensing is intentionally kept — see open decisions)

### 4b. SEO / OG metadata (leaks "Spaire Space" / "Customer Portal | … on Spaire" to Google + social)

- [ ] Public storefront `generateMetadata`: `app/(main)/[organization]/(header)/page.tsx` (title `… — Spaire Space`)
- [ ] All portal pages: `app/(main)/[organization]/portal/**/page.tsx` (title `Customer Portal | … on Spaire`)
- [ ] `components/Customization/SpaceSettingsTab.tsx` placeholder `${name} — Spaire Space`

### 4c. Dashboard + portal copy (cross-cutting renames)

| From | To | Where |
|---|---|---|
| Organization / workspace / team | Account / Creator profile | nav, settings, sidebar (UI/copy only — Organization stays the backend tenant) |
| Courses | MasterClass | nav title, headers, portal |
| Space / Storefront | "Your Page" / Course portal | Space nav, slug field → "Your Page URL" |
| benefits / benefits granted | Course access / What students get | `Benefit/*`, `CustomerPortal/*`, emails, product schema **description** (not wire field) |
| Customers | Students / Learners | Customers page, portal |
| subscriber / subscription | student / enrollment | buyer emails (backend model stays) |
| Order / New Order | Enrollment / New Enrollment | email + notification settings |

- [ ] After schema-description renames (`benefits_granted` → "course includes"), run `pnpm generate`. **Keep the wire
      field name stable** — change description only — to avoid breaking the client.

### 4d. Student/buyer portal nav (do **both** desktop + mobile)

- [ ] `app/(main)/[organization]/portal/_components/TopBar.tsx` and `MobileTabBar.tsx`: hide
      **Downloads / Wallet / Usage / Team** tabs; rename **Orders → Enrollments**; "Customer Portal" → "Student Portal".

---

## Phase 5 — Settings restructure

- [ ] Rename **Organization** tab → **Account / Creator Profile**; hide internal ID; relabel slug → "Your Page URL".
- [ ] Hide tabs: **Members**, **Webhooks**, **Custom Fields**, **Cost-Insights/Features**.
  - [ ] _Before hiding Custom Fields:_ confirm no existing course checkout references a custom field (else an
        un-editable field orphans on the public checkout).
- [ ] Keep **Plan** (load-bearing for the gate; consider rename → "Subscription") and currency/tax (compliance).
- [ ] Billing tab: hide seat / metered / multi-subscription toggles; rename "Benefit Revocation Grace Period" →
      "Course Access Revocation Grace Period".
  - [ ] **Keep proration logic active** — courses can be sold as subscriptions; hide the _toggle_ at most, don't
        change billing behavior. (Only "multiple subscriptions" + "seats" are safely lockable.)
- [ ] Disambiguate the two **"Events"**: hide usage-metering events (`server/polar/event/`), **keep** Community
      live/cohort events. Verify what `/analytics/events` actually queries before hiding (it may show
      benefit-grant/student-activity, which is course-relevant → rename to "Student Activity" and keep).

---

## Phase 6 — Public buyer surface + install-base migration (the real reposition)

> Hiding the dashboard "Space" nav does **nothing** to the public shop at `/{slug}`
> (`app/(main)/[organization]/(header)/page.tsx` → `AppPage.tsx` → `getStorefrontOrNotFound`), which is gated
> server-side by `Organization.storefront_enabled` (`server/polar/storefront/service.py`).

- [ ] Implement locked decision #1: make `/{slug}` render the single course's own portal/landing (or repurpose the
      storefront page to render only the course); **301** the old multi-product shop.
- [ ] Migration for the existing install base:
  - [ ] Existing orgs with `storefront_enabled = true` — decide migrate vs grandfather; set new default.
  - [ ] Existing multi-org users / orgs with members / non-course products still live & billable — per-cohort decision.
- [ ] Per-org `settings.index` defaults to indexable — decide de-index/301 policy so old "Spaire Space" titles leave Google.
- [ ] Verify stored `success_url` deep-links (`/{slug}/portal/orders/{id}`) still resolve after any portal restructure
      (historical + in-flight orders must not 404).
- [ ] Audit `app/embed/*` (generated-portal, watch, etc.) — this, plus Payment Links, is the real vehicle for the
      "creator has their own site" use case. Keep + rebrand rather than orphan.

---

## Open decisions still owned by the founder

1. **Refund / dispute / chargeback policy** for high-ticket courses (MoR liability). _(Phase 0)_
2. **VAT-invoice** flow for EU/UK course buyers — keep compliant; don't "simplify" tax behavior away. _(Phase 0)_
3. **Team/seat sales** — fully remove, or keep for B2B "company buys course for employees"? Drives whether
   `seat_invitation` email + portal Team tab are hidden or kept. _(Phase 4/5)_
4. **Install-base cohorts** — how to treat existing multi-org / multi-product / storefront-enabled accounts. _(Phase 6)_

---

## Risk register (condensed)

| Risk | Trigger | Mitigation |
|---|---|---|
| Onboarding redirect loop | Hide Space card without re-homing the `ai_onboarding_completed_at` stamp | Move stamp into plan-step completion; ship atomically; smoke-test new post-cutoff account |
| Checkout breakage (worse than payout) | Onboarding skips KYB business-details capture | Preserve the details step (relabel only); confirm payload collected before first checkout |
| Dropping KYC / AUP / volume review | "Everyone just sells a course" | Non-removable as MoR; Phase 0 legal gate; soften copy only |
| Hiding Products kills Payment Links + Discounts | They're children of `catalog` | Promote both to top-level _before_ hiding Products |
| Killing the email moat | "Hide Marketing" touches `email_sequence` | Hide route/nav only; integration-test course→sequence at hide-time (Phase 1) |
| Cascade deletion | Pruning "orphaned" products/benefits | Never prune — the course IS the product (`ondelete='cascade'`) |
| Buyer-facing leakage | Old shop/SEO/portal tabs/mobile left untouched | Phase 4 (emails+SEO) and Phase 6 (public surface) are the real deliverables |
| Stranding existing users | Org-switcher "create" hidden = no switching | Hide create affordance, keep switching |
