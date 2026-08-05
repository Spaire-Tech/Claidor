# Company Formation Frontend UX Specification

## Partner Referral Flow — doola Integration (V1)

**Author:** Staff Engineering
**Date:** 2026-03-08
**Status:** Design Proposal (V2 — replaces Incorporation UX Spec V1)
**Related:** [incorporation-feature-plan.md](./incorporation-feature-plan.md)
**Partner:** [doola](https://partnersps.doola.com/claidor)

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Architecture Overview](#2-architecture-overview)
3. [Navigation Integration](#3-navigation-integration)
4. [Route Structure](#4-route-structure)
5. [Wizard Flow — Screen-by-Screen](#5-wizard-flow--screen-by-screen)
6. [Recommendation Engine](#6-recommendation-engine)
7. [Component Architecture](#7-component-architecture)
8. [State Management](#8-state-management)
9. [Responsive & Dark Mode](#9-responsive--dark-mode)
10. [Animations & Transitions](#10-animations--transitions)
11. [ASCII Wireframes](#11-ascii-wireframes)
12. [Post-Formation Return Hook](#12-post-formation-return-hook)

---

## 1. Design Philosophy

### Stripe Atlas-Inspired, Partner-Powered

Stripe Atlas succeeds because it:

1. **Feels like filling out one form, not six** — the stepper makes progress visible but doesn't overwhelm.
2. **Provides education inline** — tooltips and "Why does this matter?" sections reduce anxiety about legal decisions.
3. **Defaults are smart** — Delaware is pre-selected, recommendations are explained.

We preserve this UX philosophy but redirect the actual formation to our partner doola. Claidor acts as a **guided intake and recommendation layer** — we help founders understand what they need, then hand them off to doola to execute.

### Claidor Design Principles

We inherit Claidor's existing design system:

- **`DashboardBody`** for page chrome (title, context view, tabs)
- **`@claidor/ui`** components (`Button`, `Input`, `Select`, `Card`, `Banner`)
- **Framer Motion** for step transitions
- **Dark mode first** with `dark:` Tailwind variants
- **12-column grid** collapsing to single column on mobile

### What Claidor Handles vs. doola

| Concern | Claidor (V1) | doola |
|---|---|---|
| Founder intent collection | Yes | — |
| Entity type recommendation | Yes (rule-based) | — |
| Company name collection | Yes | — |
| Founder details (name + email) | Yes | — |
| Payment processing | — | Yes |
| State filings | — | Yes |
| Registered agent | — | Yes |
| EIN assistance | — | Yes |
| Document delivery | — | Yes |
| Address collection | — | Yes |
| Officer details | — | Yes |

---

## 2. Architecture Overview

### V1: Partner Referral Flow

```
┌─────────────────────────────────────────────────┐
│                 Claidor Dashboard                 │
│                                                  │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │  Step 1   │→ │  Step 2   │→ │   Step 3    │──┼──→ doola
│  │ Founder   │  │ Company   │  │  Review &   │  │    (affiliate
│  │  Intent   │  │ Details   │  │  Continue   │  │     redirect)
│  └───────────┘  └───────────┘  └─────────────┘  │
│        │              │              │           │
│        └──────────────┴──────────────┘           │
│              localStorage + analytics            │
└─────────────────────────────────────────────────┘
```

### Key Architectural Decisions

1. **No backend formation API** — V1 does not create incorporations in the database.
2. **Client-side state only** — wizard answers stored in `localStorage` for draft persistence and optionally sent to analytics.
3. **Rule-based recommendation engine** — deterministic, explainable entity type + state recommendations. No AI/LLM.
4. **Affiliate redirect** — final CTA opens `https://partnersps.doola.com/claidor` with optional query parameters.
5. **Future-proof** — component structure allows restoring deep FileForms integration in V2.

---

## 3. Navigation Integration

### Sidebar Addition

Add "Start a Company" to `organizationRoutesList` in `DashboardNavigation.tsx`:

```typescript
// In navigation.tsx — organizationRoutesList
{
  id: 'company-formation',
  title: 'Start a Company',
  icon: <RocketLaunchOutlined className="h-5 w-5" />,
  link: `/${org.slug}/formation`,
  if: true,
}
```

**Placement:** After "Startup Stack" (perks), before account settings.

### Landing Page Header

```
┌──────────────────────────────────────────────────┐
│  Start a Company                                 │
│                                                  │
│  Form your US company in minutes through our     │
│  partner doola.                                  │
│                                                  │
│  ┌──────────────────────┐                        │
│  │  Start Formation →   │                        │
│  └──────────────────────┘                        │
│                                                  │
│  ┌────────────────────────────────────────────┐   │
│  │  Partner Benefits                          │   │
│  │  ✓ 10% founder discount via doola          │   │
│  │  ✓ Delaware C-Corp or LLC formation        │   │
│  │  ✓ Registered agent included               │   │
│  │  ✓ EIN assistance                          │   │
│  │  ✓ Startup perks & banking access          │   │
│  └────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

---

## 4. Route Structure

```
/[org]/formation                → FormationLandingPage
/[org]/formation/new            → FormationWizard (3-step)
/[org]/formation/new?step=1     → FounderIntentStep
/[org]/formation/new?step=2     → CompanyDetailsStep
/[org]/formation/new?step=3     → ReviewRedirectStep
```

### Next.js Page Files

```
clients/apps/web/src/app/(main)/[organization]/(sidebar)/formation/
├── page.tsx                    → Landing page
└── new/
    └── page.tsx                → Wizard shell
```

---

## 5. Wizard Flow — Screen-by-Screen

### Step Indicator

A 3-step horizontal progress bar:

```
  ● Founder Setup ──── ○ Company Details ──── ○ Review & Continue
  ━━━━━━━━━━━━━━━━━━   ─────────────────────   ─────────────────
```

Active step: filled circle + bold label + solid underline
Completed step: check icon + muted label + solid underline
Upcoming step: empty circle + muted label + dashed underline

---

### Step 1 — Founder Intent

**Purpose:** Collect high-level founder context to power the recommendation engine.

**Fields:**

| Field | Type | Options | Required |
|---|---|---|---|
| `product_type` | Select | SaaS, AI, Marketplace, Agency, Consulting, Other | Yes |
| `founder_location` | Select | United States, Outside US | Yes |
| `founder_state` | Select (US states) | All 50 states + DC | If US |
| `planning_to_raise_vc` | Radio group | Yes, Maybe, No | Yes |
| `number_of_founders` | Radio group | Solo, 2–5, 6+ | Yes |
| `equity_plans` | Radio group | Yes, Maybe, No | Yes |

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Step 1 of 3 — Founder Setup                            │
│                                                         │
│  Tell us about your startup so we can recommend         │
│  the best company structure for you.                    │
│                                                         │
│  What are you building?                                 │
│  ┌─────────────────────────────────────┐                │
│  │ SaaS                            ▾   │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  Where are you located?                                 │
│  ┌─────────────────────────────────────┐                │
│  │ United States                    ▾   │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  Which state? (shown if US)                             │
│  ┌─────────────────────────────────────┐                │
│  │ California                       ▾   │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  Are you planning to raise venture capital?              │
│  ( ) Yes    ( ) Maybe    ( ) No                         │
│                                                         │
│  How many founders?                                     │
│  ( ) Solo   ( ) 2–5     ( ) 6+                          │
│                                                         │
│  Do you plan to issue equity (stock options, SAFEs)?     │
│  ( ) Yes    ( ) Maybe    ( ) No                         │
│  ℹ️ Common for startups hiring engineers or raising.     │
│                                                         │
│                              ┌─────────────┐            │
│                              │  Continue →  │            │
│                              └─────────────┘            │
└─────────────────────────────────────────────────────────┘
```

**Validation (Zod):**

```typescript
const founderIntentSchema = z.object({
  product_type: z.enum(['saas', 'ai', 'marketplace', 'agency', 'consulting', 'other']),
  founder_location: z.enum(['us', 'non_us']),
  founder_state: z.string().length(2).optional(),  // US state abbreviation, required if founder_location == 'us'
  planning_to_raise_vc: z.enum(['yes', 'maybe', 'no']),
  number_of_founders: z.enum(['solo', '2_5', '6_plus']),
  equity_plans: z.enum(['yes', 'maybe', 'no']),
}).refine(
  (data) => data.founder_location !== 'us' || data.founder_state,
  { message: 'State is required for US founders', path: ['founder_state'] }
)
```

---

### Step 2 — Company Details

**Purpose:** Collect minimal company information before redirect. Display the recommendation engine output.

**On entry:** The recommendation engine runs against Step 1 inputs and produces a recommendation card.

**Fields:**

| Field | Type | Default | Required |
|---|---|---|---|
| `legal_name` | Text input | — | Yes |
| `entity_type` | Radio group | From recommendation | Yes |
| `formation_state` | Select | From recommendation | Yes |
| `founder_state` | Select (US states) | — | If US + LLC |
| `founders` | Repeatable group (name + email) | Pre-filled with current user | Yes (min 1) |

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Step 2 of 3 — Company Details                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  🏛  Recommended Structure                       │    │
│  │                                                  │    │
│  │  Delaware C-Corporation                          │    │
│  │                                                  │    │
│  │  Why this recommendation?                        │    │
│  │  • You indicated plans to raise venture capital   │    │
│  │  • You're building a SaaS product                │    │
│  │  • You may issue equity to employees             │    │
│  │                                                  │    │
│  │  [Accept recommendation]  [Choose differently]   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Company name                                           │
│  ┌─────────────────────────────────────┐                │
│  │                                      │                │
│  └─────────────────────────────────────┘                │
│  ℹ️ Your legal company name (e.g., "Acme Inc.")         │
│                                                         │
│  Entity type                                            │
│  (●) C-Corporation    ( ) LLC                           │
│                                                         │
│  Formation state                                        │
│  ┌─────────────────────────────────────┐                │
│  │ Delaware                         ▾   │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  Founders                                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Jane Doe              jane@example.com    [×]  │    │
│  └─────────────────────────────────────────────────┘    │
│  [+ Add founder]                                        │
│                                                         │
│                    ┌──────────┐  ┌─────────────┐        │
│                    │  ← Back  │  │  Continue →  │        │
│                    └──────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────┘
```

**Validation (Zod):**

```typescript
const companyDetailsSchema = z.object({
  legal_name: z.string().min(1, 'Company name is required').max(200),
  entity_type: z.enum(['LLC', 'C_CORP']),
  formation_state: z.string().min(2, 'Formation state is required'),  // 'DE', 'WY', or US state abbreviation
  founders: z.array(z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email required'),
  })).min(1, 'At least one founder is required'),
})
```

---

### Step 3 — Review & Start Formation with doola

**Purpose:** Summarize the wizard answers, communicate the partner handoff, and redirect to doola.

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Step 3 of 3 — Review & Continue                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Company Summary                                 │    │
│  │                                                  │    │
│  │  Company name     Acme Inc.                      │    │
│  │  Entity type      Delaware C-Corporation         │    │
│  │  Formation state  Delaware                       │    │
│  │                                                  │    │
│  │  Founders                                        │    │
│  │  • Jane Doe (jane@example.com)                   │    │
│  │  • John Smith (john@example.com)                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Complete Formation with doola                   │    │
│  │                                                  │    │
│  │  You will complete company formation with our    │    │
│  │  partner doola. This usually takes about         │    │
│  │  10 minutes.                                     │    │
│  │                                                  │    │
│  │  What's included:                                │    │
│  │  ✓ 10% founder discount via Claidor               │    │
│  │  ✓ Company formation & state filings             │    │
│  │  ✓ Registered agent (1 year included)            │    │
│  │  ✓ EIN (tax ID) assistance                       │    │
│  │  ✓ Access to startup perks & banking             │    │
│  │                                                  │    │
│  │  ┌──────────────────────────────────────────┐    │    │
│  │  │      Start Formation with doola  →                │    │    │
│  │  └──────────────────────────────────────────┘    │    │
│  │                                                  │    │
│  │  You'll be taken to doola.com to complete          │    │
│  │  formation and payment.                          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│                    ┌──────────┐                          │
│                    │  ← Back  │                          │
│                    └──────────┘                          │
└─────────────────────────────────────────────────────────┘
```

**Redirect behavior:**

```typescript
const DOOLA_AFFILIATE_URL = 'https://partnersps.doola.com/claidor'

function handleContinueToDoola(formData: WizardFormData) {
  // Optional: send analytics event
  trackEvent('formation_redirect_to_doola', {
    entity_type: formData.entity_type,
    formation_state: formData.formation_state,
    product_type: formData.product_type,
    founder_count: formData.founders.length,
  })

  // Redirect to doola affiliate link
  const url = new URL(DOOLA_AFFILIATE_URL)
  // Append query params if doola supports them
  // url.searchParams.set('entity', formData.entity_type)
  // url.searchParams.set('state', formData.formation_state)

  // Same-tab redirect: better for affiliate attribution and avoids popup blockers
  window.location.href = url.toString()
}
```

**CTA button styling:**

```tsx
<Button size="lg" className="w-full" onClick={() => handleContinueToDoola(formData)}>
  Start Formation with doola
  <ArrowRightIcon className="ml-2 h-4 w-4" />
</Button>
```

---

## 6. Recommendation Engine

### Overview

A **deterministic, rule-based scoring system** that recommends entity type and formation state. No AI or LLMs. Every recommendation includes human-readable reasons.

### Inputs

All inputs come from Step 1 of the wizard:

```typescript
interface RecommendationInput {
  product_type: 'saas' | 'ai' | 'marketplace' | 'agency' | 'consulting' | 'other'
  founder_location: 'us' | 'non_us'
  founder_state?: string  // US state abbreviation, collected conditionally when founder_location == 'us'
  planning_to_raise_vc: 'yes' | 'maybe' | 'no'
  number_of_founders: 'solo' | '2_5' | '6_plus'
  equity_plans: 'yes' | 'maybe' | 'no'
}
```

### Output

```typescript
interface RecommendationOutput {
  entity_type: 'LLC' | 'C_CORP'
  formation_state: string  // 'DE', 'WY', or US state abbreviation (e.g., 'CA', 'TX')
  confidence: 'high' | 'medium'
  reasons: string[]
}
```

### Example Output

```json
{
  "entity_type": "C_CORP",
  "formation_state": "DE",
  "confidence": "high",
  "reasons": [
    "You indicated plans to raise venture capital",
    "You are building a SaaS or technology product",
    "You may issue equity to employees"
  ]
}
```

### Scoring Algorithm

```typescript
function getRecommendation(input: RecommendationInput): RecommendationOutput {
  let score_llc = 0
  let score_c_corp = 0
  const reasons: string[] = []

  // Rule 1 — Venture capital intent (strongest signal)
  if (input.planning_to_raise_vc === 'yes') {
    score_c_corp += 5
    reasons.push('You indicated plans to raise venture capital')
  } else if (input.planning_to_raise_vc === 'maybe') {
    score_c_corp += 2
    reasons.push('You may raise venture capital in the future')
  }

  // Rule 2 — Technology startup signals
  const techProducts = ['saas', 'ai', 'marketplace']
  if (techProducts.includes(input.product_type)) {
    score_c_corp += 2
    reasons.push(
      `You are building a ${
        input.product_type === 'saas' ? 'SaaS' :
        input.product_type === 'ai' ? 'AI' : 'marketplace'
      } product`
    )
  }

  // Rule 3 — Equity plans
  if (input.equity_plans === 'yes') {
    score_c_corp += 3
    reasons.push('You plan to issue equity (stock options, SAFEs)')
  } else if (input.equity_plans === 'maybe') {
    score_c_corp += 1
    reasons.push('You may issue equity to employees or investors')
  }

  // Rule 4 — Non-US founders (favors LLC + Wyoming if not raising VC)
  if (input.founder_location === 'non_us') {
    if (input.planning_to_raise_vc !== 'yes') {
      score_llc += 2
      reasons.push('Wyoming LLCs are commonly used by international founders')
    }
  }

  // Rule 5 — Bootstrapped founders
  if (input.planning_to_raise_vc === 'no' && input.equity_plans === 'no') {
    score_llc += 2
    reasons.push('LLCs offer simpler tax treatment for bootstrapped businesses')
  }

  // Rule 6 — Solo founder bootstrapping
  if (input.number_of_founders === 'solo' && input.planning_to_raise_vc === 'no') {
    score_llc += 1
    reasons.push('Solo founders often prefer the simplicity of an LLC')
  }

  // Rule 7 — High-growth tech startup
  if (techProducts.includes(input.product_type) && input.equity_plans !== 'no') {
    score_c_corp += 2
    // Reason already covered by Rules 2+3
  }

  // --- Final decision ---
  const entity_type = score_c_corp > score_llc ? 'C_CORP' : 'LLC'

  // State selection
  let formation_state: string
  if (entity_type === 'C_CORP') {
    formation_state = 'DE' // C-Corps → always Delaware
  } else if (input.founder_location === 'non_us') {
    formation_state = 'WY' // Non-US founders → Wyoming LLC
  } else if (input.founder_state) {
    formation_state = input.founder_state // US founders → home state LLC
    reasons.push('Forming in your home state often simplifies tax compliance')
  } else {
    formation_state = 'WY' // Fallback if no state provided
  }

  // Confidence: high if score difference is >= 3, otherwise medium
  const scoreDiff = Math.abs(score_c_corp - score_llc)
  const confidence = scoreDiff >= 3 ? 'high' : 'medium'

  return { entity_type, formation_state, confidence, reasons }
}
```

### Scoring Reference Table

| Signal | LLC Score | C-Corp Score |
|---|---|---|
| `planning_to_raise_vc == "yes"` | — | +5 |
| `planning_to_raise_vc == "maybe"` | — | +2 |
| `product_type in [saas, ai, marketplace]` | — | +2 |
| `equity_plans == "yes"` | — | +3 |
| `equity_plans == "maybe"` | — | +1 |
| `founder_location == "non_us"` (not raising VC) | +2 | — |
| `planning_to_raise_vc == "no" && equity_plans == "no"` | +2 | — |
| `number_of_founders == "solo" && !raising VC` | +1 | — |
| Tech product + equity plans not "no" | — | +2 |

### State Selection Rules

| Entity Type | Founder Location | Formation State |
|---|---|---|
| C-Corp | Any | Delaware |
| LLC | Non-US | Wyoming |
| LLC | US (state provided) | Founder's home state |
| LLC | US (no state) | Wyoming (fallback) |

### Recommendation Card Component

```tsx
function FormationRecommendationCard({
  recommendation,
  onAccept,
  onOverride,
}: {
  recommendation: RecommendationOutput
  onAccept: () => void
  onOverride: () => void
}) {
  const entityLabel = recommendation.entity_type === 'C_CORP'
    ? 'C-Corporation'
    : 'LLC'
  const stateLabel = US_STATE_NAMES[recommendation.formation_state]
    ?? recommendation.formation_state  // e.g., 'Delaware', 'Wyoming', 'California'

  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AccountBalanceOutlined className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Recommended Structure
          </span>
          {recommendation.confidence === 'high' && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700
                             dark:bg-green-900/30 dark:text-green-400">
              High confidence
            </span>
          )}
        </div>
        <h3 className="text-xl font-semibold">
          {stateLabel} {entityLabel}
        </h3>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Why this recommendation?
        </p>
        <ul className="space-y-1">
          {recommendation.reasons.map((reason, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
              <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
              {reason}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="gap-2">
        <Button onClick={onAccept}>Accept recommendation</Button>
        <Button variant="ghost" onClick={onOverride}>Choose a different structure</Button>
      </CardFooter>
    </Card>
  )
}
```

---

## 7. Component Architecture

### Directory Structure

```
clients/apps/web/src/components/CompanyFormation/
├── FormationLandingPage.tsx         # Landing page with hero CTA + partner benefits
├── FormationWizard.tsx              # Wizard shell (step routing, progress bar)
├── steps/
│   ├── FounderIntentStep.tsx        # Step 1: product type, location, VC intent, etc.
│   ├── CompanyDetailsStep.tsx       # Step 2: name, entity, state, founders
│   └── ReviewRedirectStep.tsx       # Step 3: summary + doola redirect
├── StepIndicator.tsx                # 3-step horizontal progress bar
├── FormationRecommendationCard.tsx  # Recommendation display with accept/override
└── FormationReturnCard.tsx          # Post-redirect dashboard re-engagement card
```

### Removed Components (from V1 spec)

The following components from the original spec are **not needed** in V1:

- ~~IncorporationTimeline.tsx~~ — doola handles status tracking
- ~~IncorporationDocuments.tsx~~ — doola delivers documents
- ~~IncorporationStatusPage.tsx~~ — no post-submission dashboard in Claidor
- ~~AddressStep.tsx~~ — doola collects addresses
- ~~OfficerStep.tsx~~ — doola collects officer details
- ~~PaymentStep.tsx~~ — doola processes payment

### Component Dependency Graph

```
FormationLandingPage
└── Button (CTA → /formation/new)

FormationWizard
├── StepIndicator
├── FounderIntentStep
│   ├── Select (product_type)
│   ├── Select (founder_location)
│   ├── Select (founder_state — conditional, shown if US)
│   ├── RadioGroup (planning_to_raise_vc)
│   ├── RadioGroup (number_of_founders)
│   └── RadioGroup (equity_plans)
├── CompanyDetailsStep
│   ├── FormationRecommendationCard
│   ├── Input (legal_name)
│   ├── RadioGroup (entity_type)
│   ├── Select (formation_state)
│   └── FounderList (repeatable name+email)
└── ReviewRedirectStep
    ├── CompanySummaryCard
    ├── PartnerBenefitsCard
    └── Button (redirect to doola)

FormationReturnCard (standalone — rendered on dashboard)
├── Card (company name, next steps checklist)
├── Button (Continue Setup → /products/new)
└── Button (Dismiss → clears localStorage)
```

### File Inventory

| File | Action | Purpose |
|---|---|---|
| `components/CompanyFormation/FormationLandingPage.tsx` | Create | Landing page with hero + benefits |
| `components/CompanyFormation/FormationWizard.tsx` | Create | Wizard shell with step routing |
| `components/CompanyFormation/steps/FounderIntentStep.tsx` | Create | Step 1: founder intent fields |
| `components/CompanyFormation/steps/CompanyDetailsStep.tsx` | Create | Step 2: company info + recommendation |
| `components/CompanyFormation/steps/ReviewRedirectStep.tsx` | Create | Step 3: review + doola redirect |
| `components/CompanyFormation/StepIndicator.tsx` | Create | 3-step progress bar |
| `components/CompanyFormation/FormationRecommendationCard.tsx` | Create | Recommendation card with reasons |
| `components/CompanyFormation/FormationReturnCard.tsx` | Create | Post-redirect re-engagement card |
| `app/[organization]/(sidebar)/formation/page.tsx` | Create | Landing page route |
| `app/[organization]/(sidebar)/formation/new/page.tsx` | Create | Wizard route |
| `components/Layout/Dashboard/navigation.tsx` | Modify | Add "Start a Company" nav item |

**Total: 10 new files, 1 modified file**

---

## 8. State Management

### Wizard State (React + localStorage)

No TanStack Query needed for V1 — all state is client-side.

```typescript
interface WizardFormData {
  // Step 1
  product_type: string
  founder_location: string
  founder_state?: string  // US state abbreviation
  planning_to_raise_vc: string
  number_of_founders: string
  equity_plans: string
  // Step 2
  legal_name: string
  entity_type: 'LLC' | 'C_CORP'
  formation_state: string  // 'DE', 'WY', or US state abbreviation
  founders: Array<{ name: string; email: string }>
  // Derived
  recommendation: RecommendationOutput | null
}
```

### Draft Persistence

```typescript
const STORAGE_KEY = 'claidor:formation-wizard-draft'

function useDraftPersistence(formData: WizardFormData) {
  // Save on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData))
  }, [formData])

  // Restore on mount
  const restoreDraft = (): Partial<WizardFormData> | null => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  }

  // Clear after redirect
  const clearDraft = () => localStorage.removeItem(STORAGE_KEY)

  return { restoreDraft, clearDraft }
}
```

### Analytics (Optional)

```typescript
// Fire-and-forget analytics — no backend dependency
function trackFormationEvent(event: string, data: Record<string, unknown>) {
  // PostHog, Segment, or custom analytics
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(event, data)
  }
}

// Events to track:
// 'formation_wizard_started'
// 'formation_step_completed' + { step: 1|2|3 }
// 'formation_recommendation_accepted' + { entity_type, formation_state }
// 'formation_recommendation_overridden' + { from, to }
// 'formation_redirect_to_doola' + { entity_type, formation_state, product_type }
// 'formation_return_card_shown'
// 'formation_return_card_clicked'
// 'formation_return_card_dismissed'
```

---

## 9. Responsive & Dark Mode

### Breakpoints

| Breakpoint | Layout |
|---|---|
| `>= 1024px` (lg) | Centered card (max-w-2xl), step indicator horizontal |
| `768–1023px` (md) | Full-width card with padding, step indicator horizontal |
| `< 768px` (sm) | Full-width, step indicator compact (numbers only) |

### Dark Mode

All components use Tailwind `dark:` variants. Key color mappings:

| Element | Light | Dark |
|---|---|---|
| Card background | `bg-white` | `dark:bg-polar-800` |
| Recommendation card | `bg-blue-50` | `dark:bg-blue-950/30` |
| Partner benefits card | `bg-green-50` | `dark:bg-green-950/30` |
| CTA button | `bg-blue-600` | `dark:bg-blue-500` |
| Step indicator active | `text-blue-600` | `dark:text-blue-400` |

### Mobile Step Indicator

On mobile (`< 768px`), collapse step labels to numbers:

```
Desktop:  ● Founder Setup ── ○ Company Details ── ○ Review
Mobile:   ● 1 ────── ○ 2 ────── ○ 3
```

---

## 10. Animations & Transitions

### Step Transitions

Use Framer Motion `AnimatePresence` for step changes:

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={currentStep}
    initial={{ opacity: 0, x: direction === 'forward' ? 20 : -20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: direction === 'forward' ? -20 : 20 }}
    transition={{ duration: 0.2, ease: 'easeInOut' }}
  >
    {stepContent}
  </motion.div>
</AnimatePresence>
```

### Recommendation Card

Slide-in animation when recommendation appears on Step 2:

```tsx
<motion.div
  initial={{ opacity: 0, y: -10 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
>
  <FormationRecommendationCard ... />
</motion.div>
```

### Redirect CTA

Subtle pulse on the "Start Formation with doola" button to draw attention:

```tsx
<motion.div
  animate={{ scale: [1, 1.02, 1] }}
  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
>
  <Button size="lg">Start Formation with doola →</Button>
</motion.div>
```

---

## 11. ASCII Wireframes

### Desktop — Landing Page

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────┐                                                            │
│ │ Logo │  Dashboard  Products  Perks  Start a Company  Settings     │
│ └──────┘                                      ^^^^^^^^^^^           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Start a Company                                                    │
│                                                                      │
│   Form your US company in minutes through our partner doola.         │
│                                                                      │
│   ┌──────────────────────┐                                           │
│   │  Start Formation →   │                                           │
│   └──────────────────────┘                                           │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │                                                              │   │
│   │  🤝 Partner Benefits                                         │   │
│   │                                                              │   │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│   │  │ 10% discount │  │ Company      │  │ Registered   │       │   │
│   │  │ for Claidor   │  │ formation &  │  │ agent        │       │   │
│   │  │ founders     │  │ state filing │  │ included     │       │   │
│   │  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│   │                                                              │   │
│   │  ┌──────────────┐  ┌──────────────┐                          │   │
│   │  │ EIN / tax ID │  │ Startup      │                          │   │
│   │  │ assistance   │  │ perks &      │                          │   │
│   │  │              │  │ banking      │                          │   │
│   │  └──────────────┘  └──────────────┘                          │   │
│   │                                                              │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   Powered by doola  •  Formation typically takes ~10 minutes         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Desktop — Step 2 with Recommendation

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────┐                                                            │
│ │ Logo │  Dashboard  Products  Perks  Start a Company  Settings     │
│ └──────┘                                                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│       ✓ Founder Setup ━━━━━ ● Company Details ───── ○ Review        │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │                                                              │   │
│   │  ┌──────────────────────────────────────────────────────┐    │   │
│   │  │  🏛  Recommended: Delaware C-Corporation              │    │   │
│   │  │                                              [High]   │    │   │
│   │  │                                                       │    │   │
│   │  │  ✓ You indicated plans to raise venture capital       │    │   │
│   │  │  ✓ You're building a SaaS product                    │    │   │
│   │  │  ✓ You plan to issue equity                          │    │   │
│   │  │                                                       │    │   │
│   │  │  [Accept recommendation]  [Choose differently]        │    │   │
│   │  └──────────────────────────────────────────────────────┘    │   │
│   │                                                              │   │
│   │  Company name                                                │   │
│   │  ┌──────────────────────────────────────────────────────┐    │   │
│   │  │ Acme Inc.                                             │    │   │
│   │  └──────────────────────────────────────────────────────┘    │   │
│   │                                                              │   │
│   │  Entity type                                                 │   │
│   │  (●) C-Corporation    ( ) LLC                                │   │
│   │                                                              │   │
│   │  Formation state                                             │   │
│   │  ┌──────────────────────────────────────────────────────┐    │   │
│   │  │ Delaware                                          ▾   │    │   │
│   │  └──────────────────────────────────────────────────────┘    │   │
│   │                                                              │   │
│   │  Founders                                                    │   │
│   │  ┌──────────────────────────────────────────────────────┐    │   │
│   │  │ Jane Doe              jane@example.com          [×]  │    │   │
│   │  ├──────────────────────────────────────────────────────┤    │   │
│   │  │ John Smith            john@example.com          [×]  │    │   │
│   │  └──────────────────────────────────────────────────────┘    │   │
│   │  [+ Add founder]                                             │   │
│   │                                                              │   │
│   │                         ┌──────────┐  ┌─────────────┐        │   │
│   │                         │  ← Back  │  │  Continue →  │        │   │
│   │                         └──────────┘  └─────────────┘        │   │
│   │                                                              │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Desktop — Step 3 Review & Redirect

```
┌──────────────────────────────────────────────────────────────────────┐
│ ┌──────┐                                                            │
│ │ Logo │  Dashboard  Products  Perks  Start a Company  Settings     │
│ └──────┘                                                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│       ✓ Founder Setup ━━━━━ ✓ Company Details ━━━━━ ● Review        │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │                                                              │   │
│   │  Company Summary                                             │   │
│   │  ─────────────────                                           │   │
│   │  Company name      Acme Inc.                                 │   │
│   │  Entity type       Delaware C-Corporation                    │   │
│   │  Formation state   Delaware                                  │   │
│   │                                                              │   │
│   │  Founders                                                    │   │
│   │  • Jane Doe (jane@example.com)                               │   │
│   │  • John Smith (john@example.com)                             │   │
│   │                                                              │   │
│   │  ─────────────────────────────────────────────────────────   │   │
│   │                                                              │   │
│   │  ┌──────────────────────────────────────────────────────┐    │   │
│   │  │                                                      │    │   │
│   │  │  Complete Formation with doola                       │    │   │
│   │  │                                                      │    │   │
│   │  │  You will complete company formation with our        │    │   │
│   │  │  partner doola. This usually takes about 10 minutes. │    │   │
│   │  │                                                      │    │   │
│   │  │  ✓ 10% founder discount via Claidor                   │    │   │
│   │  │  ✓ Company formation & state filings                 │    │   │
│   │  │  ✓ Registered agent (1 year)                         │    │   │
│   │  │  ✓ EIN assistance                                    │    │   │
│   │  │  ✓ Startup perks & banking                           │    │   │
│   │  │                                                      │    │   │
│   │  │  ┌──────────────────────────────────────────────┐    │    │   │
│   │  │  │         Start Formation with doola  →                 │    │    │   │
│   │  │  └──────────────────────────────────────────────┘    │    │   │
│   │  │                                                      │    │   │
│   │  │  You'll be taken to doola.com to complete             │    │   │
│   │  │  formation and payment.                              │    │   │
│   │  │                                                      │    │   │
│   │  └──────────────────────────────────────────────────────┘    │   │
│   │                                                              │   │
│   │                         ┌──────────┐                         │   │
│   │                         │  ← Back  │                         │   │
│   │                         └──────────┘                         │   │
│   │                                                              │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Mobile — Step 1

```
┌─────────────────────────┐
│  ≡  Claidor              │
├─────────────────────────┤
│                         │
│  ● 1 ─── ○ 2 ─── ○ 3   │
│                         │
│  Founder Setup          │
│                         │
│  Tell us about your     │
│  startup so we can      │
│  recommend the best     │
│  company structure.     │
│                         │
│  What are you building? │
│  ┌───────────────────┐  │
│  │ SaaS           ▾  │  │
│  └───────────────────┘  │
│                         │
│  Where are you located? │
│  ┌───────────────────┐  │
│  │ United States   ▾  │  │
│  └───────────────────┘  │
│                         │
│  Which state?           │
│  ┌───────────────────┐  │
│  │ California      ▾  │  │
│  └───────────────────┘  │
│                         │
│  Planning to raise VC?  │
│  ( ) Yes                │
│  ( ) Maybe              │
│  ( ) No                 │
│                         │
│  How many founders?     │
│  ( ) Solo               │
│  ( ) 2–5                │
│  ( ) 6+                 │
│                         │
│  Equity plans?          │
│  ( ) Yes                │
│  ( ) Maybe              │
│  ( ) No                 │
│                         │
│  ┌───────────────────┐  │
│  │   Continue →      │  │
│  └───────────────────┘  │
│                         │
└─────────────────────────┘
```

### Mobile — Step 3

```
┌─────────────────────────┐
│  ≡  Claidor              │
├─────────────────────────┤
│                         │
│  ✓ 1 ─── ✓ 2 ─── ● 3   │
│                         │
│  Review & Continue      │
│                         │
│  ┌───────────────────┐  │
│  │ Acme Inc.         │  │
│  │ Delaware C-Corp   │  │
│  │                   │  │
│  │ Jane Doe          │  │
│  │ John Smith        │  │
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │
│  │ Complete with     │  │
│  │ doola             │  │
│  │                   │  │
│  │ ~10 minutes       │  │
│  │                   │  │
│  │ ✓ 10% discount    │  │
│  │ ✓ Formation       │  │
│  │ ✓ Registered agt  │  │
│  │ ✓ EIN assistance  │  │
│  │ ✓ Startup perks   │  │
│  │                   │  │
│  │ ┌───────────────┐ │  │
│  │ │ Continue to   │ │  │
│  │ │  doola →      │ │  │
│  │ └───────────────┘ │  │
│  │                   │  │
│  │ Redirects to      │  │
│  │ doola.com         │  │
│  └───────────────────┘  │
│                         │
│  ┌───────────────────┐  │
│  │    ← Back         │  │
│  └───────────────────┘  │
│                         │
└─────────────────────────┘
```

---

## 12. Post-Formation Return Hook

### Problem

After redirecting to doola, the founder may not return to Claidor. Without a re-engagement mechanism, we lose the user at the moment they become most valuable — right after forming their company.

### Solution

Store a `formation_started` flag in localStorage when the user clicks "Start Formation with doola". When the founder returns to the Claidor dashboard, display a **Company Setup Card** that guides them back into the product.

### Implementation

```typescript
// Set on redirect
const FORMATION_STARTED_KEY = 'claidor:formation-started'

function handleContinueToDoola(formData: WizardFormData) {
  localStorage.setItem(FORMATION_STARTED_KEY, JSON.stringify({
    startedAt: new Date().toISOString(),
    companyName: formData.legal_name,
    entityType: formData.entity_type,
    formationState: formData.formation_state,
  }))

  trackFormationEvent('formation_redirect_to_doola', { ... })
  window.location.href = DOOLA_AFFILIATE_URL
}
```

### Return Card — Dashboard Widget

When the founder returns and `formation_started` exists in localStorage, show a persistent card on the dashboard:

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  🏢 Finish Setting Up Acme Inc.                          │
│                                                          │
│  You're forming your company with doola.                 │
│  Once completed, come back here to:                      │
│                                                          │
│  ✓ Set up billing with Stripe                            │
│  ✓ Create your first product                             │
│  ✓ Launch subscriptions                                  │
│  ✓ Access startup perks                                  │
│                                                          │
│  ┌─────────────────────────┐  ┌───────────────────────┐  │
│  │ Continue Setup →        │  │ Dismiss               │  │
│  └─────────────────────────┘  └───────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Component

```tsx
function FormationReturnCard() {
  const [formation, setFormation] = useState<FormationStartedData | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(FORMATION_STARTED_KEY)
    if (stored) setFormation(JSON.parse(stored))
  }, [])

  if (!formation) return null

  const handleDismiss = () => {
    localStorage.removeItem(FORMATION_STARTED_KEY)
    setFormation(null)
  }

  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
      <CardHeader>
        <h3 className="text-lg font-semibold">
          Finish Setting Up {formation.companyName}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You&apos;re forming your company with doola. Once completed, come back here to:
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {['Set up billing with Stripe', 'Create your first product',
            'Launch subscriptions', 'Access startup perks'].map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm">
              <CheckCircleIcon className="h-4 w-4 text-green-500" />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="gap-2">
        <Button asChild><Link href="/products/new">Continue Setup</Link></Button>
        <Button variant="ghost" onClick={handleDismiss}>Dismiss</Button>
      </CardFooter>
    </Card>
  )
}
```

### Placement

- Render `<FormationReturnCard />` at the top of the organization dashboard page
- Card auto-expires after 30 days (check `startedAt` timestamp)
- Dismissing removes the localStorage entry permanently

### Analytics Events

```typescript
// 'formation_return_card_shown'    — card rendered on dashboard
// 'formation_return_card_clicked'  — "Continue Setup" clicked
// 'formation_return_card_dismissed' — "Dismiss" clicked
```

### File Addition

| File | Action | Purpose |
|---|---|---|
| `components/CompanyFormation/FormationReturnCard.tsx` | Create | Post-redirect re-engagement card |

This brings the total to **10 new files, 1 modified file**.

---

## Appendix A: Migration from V1 Spec

| V1 Concept | V2 Status | Notes |
|---|---|---|
| 5-step wizard | Replaced by 3-step | Simpler flow |
| Entity Type step | Merged into Step 1 (intent) + Step 2 (recommendation) | Recommendation engine replaces manual selection |
| Company Info step | Simplified into Step 2 | Fewer fields |
| People & Officers step | Removed | doola collects |
| Address step | Removed | doola collects |
| Review & Pay step | Replaced by Review & Redirect | No payment in Claidor |
| Post-submission dashboard | Removed | doola handles status |
| IncorporationTimeline | Removed | Not applicable |
| IncorporationDocuments | Removed | doola delivers |
| IncorporationStatusPage | Removed | Not applicable |
| Backend incorporation API | Not needed | Client-side only |
| Stripe payment integration | Not needed | doola handles payment |
| `components/Incorporation/` | Renamed to `components/CompanyFormation/` | Clean break |
| "Incorporate" nav item | Renamed to "Start a Company" | Clearer messaging |

## Appendix B: Future V2 Considerations

When deep FileForms integration is restored:

1. Re-add address and officer collection steps
2. Add Claidor-managed checkout with Stripe
3. Build formation status polling and timeline dashboard
4. Add document download functionality
5. Expand formation state options beyond DE/WY
6. Backend API for persisting incorporation records
7. Webhook integration with filing service for status updates

The component directory structure (`CompanyFormation/`) and wizard shell (`FormationWizard.tsx`) are designed to accommodate these additions without restructuring.
