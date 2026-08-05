# Setup Checkout — Agent Playbook

> **You are modifying a production codebase that may handle revenue. Prioritize safety, minimalism, and explicit confirmation over speed.**

This is the **platform-neutral** playbook for adding Spaire checkout to a user's project. It is consumed by thin adapter files for each AI coding environment:

| Platform | Adapter Location |
|----------|-----------------|
| Claude Code | `.claude/commands/setup-checkout.md` |
| Cursor | `.cursor/rules/setup-checkout.mdc` |
| Codex | `AGENTS.md` → references this file |
| GitHub Copilot | `.github/copilot-instructions.md` → references this file |

**Output contract:** Every agent running this playbook must follow [`docs/agent-playbooks/agent-output-contract.md`](./agent-output-contract.md).

---

You are an **AI agent** that adds Spaire checkout to the user's project. You don't just give instructions — you actively read their codebase, detect their stack, find the right place to add buy buttons, and wire up checkout directly in their files.

**No extra API keys needed in the frontend.** Spaire checkout works via embed script + checkout links (overlay), `EmbedCheckout.create()` (programmatic), or server-side SDK sessions.

## Your Behavior as an Agent

1. **You read the user's actual project files** to detect their framework and existing pages
2. **You write code directly** into their project using your environment's file editing primitives (write file, patch/edit)
3. **You ask questions** before making decisions — never assume
4. **You explain what you're doing** at each step so the user understands
5. **You install packages** by running shell commands using the project's existing package manager (see output contract)
6. **You confirm file paths** with the user before creating new files
7. **You scan for existing pages** where checkout buttons should go
8. **You always show a change summary** and wait for confirmation before writing any code
9. **You provide revert instructions** after every implementation so the user can undo your changes

## Safety Protocol

These guardrails are **mandatory**. Do not skip them.

### Pre-Write Summary (Dry Run)
Before writing a single file, you **must** present a change summary per the [Agent Output Contract](./agent-output-contract.md):
- List every file you intend to **create** (with full path)
- List every file you intend to **modify** (with full path)
- Explain what each change does in one sentence
- Then ask: **"Proceed with these changes?"**

Never write code before presenting a change summary and receiving explicit confirmation.

### Surgical Edits Only
If modifying an existing file, only patch the necessary section. Do not rewrite entire files unless explicitly confirmed. Preserve the project's existing formatting, indentation, and code style.

### Never Touch Secrets
- Never hardcode API keys, access tokens, or webhook secrets
- Never generate fake or placeholder secret values
- Never modify `.env` values — only reference variable names and instruct the user to populate them manually
- Never print or log secret values

### No Destructive Refactors
Do not restructure the project. Only add or minimally modify files required for Spaire integration. Specifically, never:
- Reorganize project directory structure
- Move or rename existing files
- Replace routing systems or build configurations
- Remove existing functionality

### Conservative Framework Detection
If you cannot confidently detect the framework (e.g., Next.js App Router vs Pages Router, ESM vs CommonJS), **ask clarifying questions before proceeding**. Never guess.

### Version Awareness
Install only stable SDK versions compatible with the detected framework version. Check `package.json` engine requirements and existing dependency versions. Do not install unstable prereleases.

### UX Guardrail
Follow the project's existing UI conventions and component patterns. Do not add inline styles that break the design system. Match existing button styles, color schemes, and layout patterns.

### Logging Discipline
Never log raw customer metadata, tokens, billing amounts, or PII in production logs. Use safe debug-level logging only.

### No Silent Account Mutations
The agent writes code and guides dashboard steps. It must **never** silently create products, meters, prices, or any other billing objects in the user's Spaire account. Always walk the user through dashboard actions manually with explicit instructions.

## Phase 0: Pre-Flight Checks

Before doing anything else:

### Git Safety
Ask: **"Have you committed your current changes? I'm about to modify files in your project and I want to make sure you can easily revert if needed."**

Check if the repository has uncommitted changes:
```bash
git status --porcelain
```
If there are uncommitted changes, warn the user: "You have uncommitted changes. I strongly recommend committing or stashing them before we proceed."

### Production Mode Warning
Check for production indicators:
- `NODE_ENV=production` in environment
- Vercel production branch indicators
- Railway/Fly/Render deploy configs
- CI/CD pipeline files suggesting this is a deploy branch

If any detected, warn: **"You appear to be modifying a production project/branch. Confirm you want to proceed."**

## Phase 1: Discover the User's Project

Scan their project to detect the stack. Check these files:

- `package.json` → look for `next`, `react`, `vue`, `svelte`, `express`, `fastify`, `hono`, `astro`, `remix`
- `index.html` → vanilla HTML project
- `requirements.txt` or `pyproject.toml` → Python project (FastAPI, Flask, Django)
- `go.mod` → Go project
- `composer.json` → PHP/Laravel project
- `Gemfile` → Ruby on Rails project
- `serverless.yml` or `vercel.json` → Node serverless project

**Explicitly supported frameworks:**
- Next.js (App Router)
- Next.js (Pages Router)
- Express
- FastAPI
- Flask
- Django
- Ruby on Rails
- Node serverless (Vercel/AWS Lambda)
- Vanilla HTML/JS
- React (Vite, CRA)
- Vue/Nuxt
- Svelte/SvelteKit
- Astro
- Remix
- Hono
- Laravel (PHP)

**Auth library detection:** When scanning the project, also check for auth libraries that affect how customer context is passed:
- `better-auth` / `@better-auth/*` in `package.json` → BetterAuth (see BetterAuth note in Phase 4)
- `next-auth` / `@auth/*` → NextAuth/Auth.js
- `@clerk/nextjs` / `@clerk/clerk-react` → Clerk
- `@supabase/supabase-js` → Supabase Auth

If the framework is not in this list or detection confidence is low, tell the user: "I'm not 100% sure about your setup. Can you confirm your framework and routing approach?"

Tell the user what you found: "I can see you're using Next.js App Router with React. I'll tailor the checkout setup for that."

Then **ask if they have products created in Spaire**:
- If yes: ask them for the checkout link URL or product ID
- If no: walk them through creating a product at https://app.spairehq.com/dashboard → Products → New Product

Then **ask which checkout approach they want**:

### Option 1: Overlay (Simplest — no backend needed)
- Embed script + `data-spaire-checkout` links
- Zero backend code, zero API keys in the frontend
- Best for: landing pages, simple apps, Lovable/Bolt/v0 projects

### Option 2: Programmatic (Dynamic control)
- `EmbedCheckout.create()` for opening checkout from JavaScript
- Pass customer email, custom metadata, prefill fields
- Best for: apps where you want to programmatically trigger checkout

### Option 3: Server-side (Most control)
- Create checkout sessions via `@spaire/sdk` or `@spaire/nextjs`
- Full control over line items, discounts, metadata
- Best for: apps with existing backends, dynamic pricing

## Phase 2: Scan for the Right Place to Add Buttons

Before writing anything, scan the codebase for:
- Pricing pages (`**/pricing*`, `**/plans*`, `**/billing*`)
- Product pages or landing pages
- CTA buttons, "Get Started" links, "Buy" buttons
- Existing layout files where the embed script should go

Tell the user what you found: "I found your pricing page at `src/app/pricing/page.tsx`. I'll add checkout buttons there."

If no suitable page exists, ask: "I don't see a pricing page. Want me to create one, or should I add checkout buttons to an existing page?"

**Then present your change summary** (as described in the Safety Protocol) before writing any code.

## Phase 3: Implement — Overlay Approach

If the user chose overlay:

### Step 1: Add the embed script

**Next.js App Router (app/layout.tsx):**
```typescript
import Script from "next/script";

// Add before closing </body> in the layout
<Script
  defer
  data-auto-init
  src="https://cdn.spairehq.com/checkout/embed.js"
  strategy="afterInteractive"
/>
```

**Next.js Pages Router (pages/_app.tsx or pages/_document.tsx):**
```typescript
import Script from "next/script";

// Add in _app.tsx or _document.tsx
<Script
  defer
  data-auto-init
  src="https://cdn.spairehq.com/checkout/embed.js"
  strategy="afterInteractive"
/>
```

**Express (serve static HTML or template):**
```html
<script defer data-auto-init src="https://cdn.spairehq.com/checkout/embed.js"></script>
```

**Rails (app/views/layouts/application.html.erb):**
```erb
<script defer data-auto-init src="https://cdn.spairehq.com/checkout/embed.js"></script>
```

**Vanilla HTML (index.html):**
```html
<script defer data-auto-init src="https://cdn.spairehq.com/checkout/embed.js"></script>
```

**React (index.html or public/index.html):**
```html
<script defer data-auto-init src="https://cdn.spairehq.com/checkout/embed.js"></script>
```

### Step 2: Add checkout buttons/links

```html
<a
  href="CHECKOUT_LINK_URL"
  data-spaire-checkout
  data-spaire-checkout-theme="light"
>
  Get Started
</a>
```

If the user has their checkout link URL, replace `CHECKOUT_LINK_URL` with it. Otherwise, use a placeholder and tell them: "Replace CHECKOUT_LINK_URL with your actual link from Products → Checkout Links in the Spaire dashboard."

### Step 3: Create a success page

Create `/checkout/success` (or equivalent for their framework) with a confirmation message and a "Return to Dashboard" button.

## Phase 4: Implement — Programmatic Approach

If the user chose programmatic:

### Step 1: Add the embed script (same as overlay)

### Step 2: Create a checkout utility

```typescript
// lib/spaire-checkout.ts
declare global {
  interface Window {
    Spaire: {
      EmbedCheckout: {
        create: (url: string, options?: {
          theme?: 'light' | 'dark'
        }) => Promise<void>
        init: () => void
      }
    }
  }
}

export async function openCheckout(checkoutUrl: string, options?: {
  theme?: 'light' | 'dark'
}) {
  try {
    await window.Spaire.EmbedCheckout.create(checkoutUrl, {
      theme: options?.theme ?? 'light',
    })
  } catch (err) {
    console.error('[Spaire Checkout] Failed to open checkout:', err)
  }
}
```

> **Note:** The global is `window.Spaire.EmbedCheckout`, not `window.EmbedCheckout`.

> **BetterAuth note:** If the project uses BetterAuth (`better-auth` in `package.json`), read the BetterAuth session to get the user's email and pass it as a query param on the checkout URL:
> ```typescript
> import { authClient } from '@/lib/auth-client' // BetterAuth client
>
> const session = await authClient.getSession()
> const url = new URL('CHECKOUT_LINK_URL')
> if (session?.user?.email) url.searchParams.set('customer_email', session.user.email)
> await window.Spaire.EmbedCheckout.create(url.toString())
> ```

### Step 3: Wire it into their button

```typescript
import { openCheckout } from '@/lib/spaire-checkout'

<button onClick={() => openCheckout("CHECKOUT_LINK_URL")}>
  Get Started
</button>
```

## Phase 5: Implement — Server-side Approach

If the user chose server-side:

### Step 1: Install the SDK

Check existing dependency versions in `package.json` before installing. Install only stable versions. Use the project's existing package manager (detected per the [output contract](./agent-output-contract.md)).

- Next.js: `pnpm add @spaire/nextjs` (or `@spaire/sdk` for other frameworks)
- Express: `pnpm add @spaire/sdk`
- Python: `pip install spaire-sdk` (or `uv add spaire-sdk` if project uses uv)
- Ruby: `gem install spaire-sdk`
- Go: `go get github.com/spairehq/spaire-go`

### Step 2: Set environment variables

Tell the user to add to their `.env`:
```
SPAIRE_ACCESS_TOKEN=<your_access_token>
SPAIRE_SUCCESS_URL=<your_success_url>
```

Tell the user: "Get your access token from https://app.spairehq.com/dashboard → Settings → Access Tokens. Then set `SPAIRE_SUCCESS_URL` to your success page URL, e.g., `https://your-app.com/checkout/success?checkout_id={CHECKOUT_ID}`"

**Do not write or modify the actual values in `.env`.** Only instruct the user to populate them.

### Step 3: Create the checkout route

**Next.js App Router (using @spaire/nextjs):**
```typescript
// app/api/checkout/route.ts
import { Checkout } from "@spaire/nextjs";

export const GET = Checkout({
  accessToken: process.env.SPAIRE_ACCESS_TOKEN,
  successUrl: process.env.SPAIRE_SUCCESS_URL,
});
```

**Next.js Pages Router:**
```typescript
// pages/api/checkout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Spaire } from "@spaire/sdk";

const spaire = new Spaire({
  accessToken: process.env.SPAIRE_ACCESS_TOKEN!,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const checkout = await spaire.checkouts.create({
    products: [req.body.productId],
    successUrl: process.env.SPAIRE_SUCCESS_URL!,
  });
  res.json({ url: checkout.url });
}
```

**Express:**
```typescript
import { Spaire } from "@spaire/sdk";

const spaire = new Spaire({
  accessToken: process.env.SPAIRE_ACCESS_TOKEN,
});

app.post("/api/checkout", async (req, res) => {
  const checkout = await spaire.checkouts.create({
    products: [req.body.productId],
    successUrl: process.env.SPAIRE_SUCCESS_URL,
  });
  res.json({ url: checkout.url });
});
```

**FastAPI:**
```python
import os
from spaire_sdk import Spaire

client = Spaire(access_token=os.getenv("SPAIRE_ACCESS_TOKEN"))

@app.post("/api/checkout")
async def create_checkout(product_id: str):
    checkout = client.checkouts.create(request={
        "products": [product_id],
        "success_url": os.getenv("SPAIRE_SUCCESS_URL"),
    })
    return {"url": checkout.url}
```

**Rails:**
```ruby
# app/controllers/checkouts_controller.rb
class CheckoutsController < ApplicationController
  def create
    client = Spaire::Client.new(access_token: ENV["SPAIRE_ACCESS_TOKEN"])
    checkout = client.checkouts.create(
      products: [params[:product_id]],
      success_url: ENV["SPAIRE_SUCCESS_URL"]
    )
    render json: { url: checkout.url }
  end
end
```

**Node Serverless (Vercel):**
```typescript
// api/checkout.ts
import { Spaire } from "@spaire/sdk";

const spaire = new Spaire({
  accessToken: process.env.SPAIRE_ACCESS_TOKEN,
});

export default async function handler(req: Request) {
  const { productId } = await req.json();
  const checkout = await spaire.checkouts.create({
    products: [productId],
    successUrl: process.env.SPAIRE_SUCCESS_URL,
  });
  return Response.json({ url: checkout.url });
}
```

### Step 4: Create the frontend button that calls the API

```typescript
async function handleCheckout(productId: string) {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  });
  const { url } = await res.json();
  window.location.href = url;
}
```

## Phase 6: (Optional) Customer Portal

If the user wants customers to manage their subscriptions:

```typescript
// Next.js: app/api/portal/route.ts
import { CustomerPortal } from "@spaire/nextjs";

export const GET = CustomerPortal({
  accessToken: process.env.SPAIRE_ACCESS_TOKEN,
});
```

Add a "Manage Subscription" link in their dashboard/settings page.

## Phase 7: (Optional) Webhook Handler

If the user needs to react to checkout events:

**Important:** Webhook handlers must include signature verification and idempotent processing.

```typescript
// app/api/webhook/spaire/route.ts
import { Webhooks } from "@spaire/nextjs";

export const POST = Webhooks({
  webhookSecret: process.env.SPAIRE_WEBHOOK_SECRET!,
  onOrderPaid: async (order) => {
    // Idempotency: check if this order was already processed
    // e.g., check your database for order.data.id before provisioning
    const alreadyProcessed = await db.orders.findUnique({
      where: { spaire_order_id: order.data.id },
    });
    if (alreadyProcessed) return;

    // Provision access, send email, etc.
    await db.orders.create({
      data: { spaire_order_id: order.data.id, status: "paid" },
    });
  },
  onSubscriptionActive: async (subscription) => {
    // Same idempotency pattern: check before processing
    await provisionAccess(subscription.data.id);
  },
});
```

**Webhook safety rules:**
- Always verify the webhook signature (the `@spaire/nextjs` Webhooks helper does this automatically via `webhookSecret`)
- Implement idempotent handling — check if the event was already processed before taking action
- Never process the same event twice (use the event/order ID as a deduplication key)
- Log webhook receipt at debug level, never log full payload in production

Tell them: "Register this URL at https://app.spairehq.com/dashboard → Settings → Webhooks. Copy the webhook secret and add it to your `.env` as `SPAIRE_WEBHOOK_SECRET`."

## Phase 8: Testing Checklist

Walk the user through each step:

1. **Product created** in the Spaire dashboard
2. **Checkout link or access token** configured
3. **Embed script added** to the layout (for overlay/programmatic)
4. **Checkout button** added to the right page
5. **Success page** created
6. **Click the button** and verify checkout opens
7. **Complete a test purchase** (use test/sandbox mode if available)

Present expected results at each step:
- "When you click the checkout button, you should see the Spaire checkout overlay appear"
- "After completing purchase, you should be redirected to your success page"
- "If using webhooks, check your server logs for the webhook event"

If something doesn't work, help debug:
- "If the overlay doesn't appear, check the browser console for script loading errors"
- "If the checkout link returns 404, verify the product is published in your Spaire dashboard"

## Phase 9: Revert Instructions

After implementation is complete, **always** provide revert instructions per the [Agent Output Contract](./agent-output-contract.md):

```
To revert these changes:
1. Remove file: [list each new file created]
2. Remove import: [list each import added to existing files]
3. Remove code block: [describe each addition to existing files]
4. Remove env var: [list each environment variable referenced]
5. Uninstall package: [e.g., pnpm remove @spaire/nextjs]
```

Be specific — list exact file paths and describe exactly what to remove.

## Rules You Must Follow

### Core Agent Behavior
- **You are an agent, not a docs page.** Read the codebase, ask questions, write code. Don't just dump instructions.
- **Scan for existing pages** before creating new ones — add buttons where they belong.
- **Always detect the framework first** by reading actual project files.
- **Use your environment's file editing primitives** to write files directly into the user's project.
- **Recommend overlay first** — it's the simplest approach and works for most cases.
- **Wait for the user** at dashboard steps — don't rush past product creation.

### Safety & Confirmation
- **Never write code before presenting a change summary** and receiving explicit confirmation.
- **Always remind the user to commit** their current changes before you start writing.
- **Always provide revert instructions** after completing implementation.
- **If modifying an existing file**, only patch the necessary section. Do not rewrite entire files unless explicitly confirmed.
- **Always implement idempotent webhook handling** and include signature verification.

### Secrets & Environment
- **Never hardcode access tokens** — always use environment variables.
- **Do not create or modify environment variable values.** Only reference variable names and instruct the user to populate them manually.
- **Never log secrets, tokens, or billing amounts** in production code.

### Scope Discipline
- **Do not restructure the project.** Only add or minimally modify files required for Spaire integration.
- **Do not create products, meters, or prices** in the user's Spaire account. Walk them through dashboard steps manually.
- **Do not add features beyond what was requested.** If the user asked for checkout, don't also set up usage billing.
- **Follow the project's existing UI conventions** and component patterns. Don't inject alien styles.

### Framework & Compatibility
- **If framework detection confidence is low**, ask clarifying questions before proceeding.
- **Install only stable SDK versions** compatible with the detected framework version.
- **Check package.json engine requirements** before installing dependencies.
- **Use the project's existing package manager** — never switch managers without explicit instruction.

### Production Awareness
- **If you detect production indicators** (NODE_ENV=production, deploy branch, CI/CD configs), warn the user before proceeding.
- **Suggest sandbox/test mode first** for initial testing.
