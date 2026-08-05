# Masterclass Hosted (Custom) Domain — Audit & Implementation Plan

Goal: let a creator serve their masterclass surfaces — landing page, course
landing, public events, and the customer (student) portal — on their **own
domain** (e.g. `learn.milesbecker.com`) instead of only
`space.spairehq.com/{slug}`.

> **Product decisions (founder, 2026-07-07):**
> 1. Hosted domain ships as a **Studio plan** feature — flip
>    `custom_storefront_domain=True` for `TierKey.studio` (and presumably
>    `scale`) in `entitlements/tiers.py`; it is currently `False` for all
>    real tiers.
> 2. **Spaire Space is hidden** — there is no multi-product storefront
>    anymore. The custom domain is the front door to the masterclass
>    landing + student portal only, which simplifies scope: `spacePageLink`
>    references below become "the platform-hosted fallback URL", and the
>    space→custom 301 question mostly disappears.

---

## Part 1 — Audit of the current masterclass surfaces

### 1.1 Customer/visitor-facing URLs (all slug-path based)

| Surface | Route | Source |
|---|---|---|
| Org landing | `/{slug}` — 307-redirects to the course landing when a `category === 'course'` product exists | `clients/apps/web/src/app/(main)/[organization]/(header)/page.tsx` (redirect at ~L92–97) |
| Course landing (cinematic) | `/{slug}/products/{productId}` | `.../products/[productId]/page.tsx` → `components/Courses/PublicPortalView.tsx` |
| Public events | `/{slug}/events/{eventId}` (+ `/ics`) | `.../events/[eventId]/page.tsx` |
| Student portal | `/{slug}/portal/*` (overview, courses, lesson viewer, community, orders, subscriptions, downloads, settings, team) | `app/(main)/[organization]/portal/` |
| Portal auth | `/{slug}/portal/request`, `/authenticate`, `/claim` | same tree |
| Checkout | `/checkout/{clientSecret}` — **not** org-scoped; also `buy.spairehq.com` (`CHECKOUT_LINK_HOST`) for checkout links | `app/checkout/` |

### 1.2 How the org is resolved

- Purely from the `[organization]` **path segment**, in server components:
  `getStorefrontOrNotFound` → `GET /v1/storefronts/{slug}`
  (`clients/apps/web/src/utils/storefront.ts:35`) and
  `getOrganizationOrNotFound` → `GET /v1/customer-portal/organizations/{slug}`
  (`clients/apps/web/src/utils/customerPortal.ts:34`).
- **No host→org mapping exists.** The only host-aware code is
  `clients/apps/web/src/proxy.ts:88–107`, which special-cases the shared
  `space.spairehq.com` host (`SPACE_HOSTNAME`) to block dashboard-ish
  prefixes — it still expects `/{slug}/...` paths.

### 1.3 URL generation

- Frontend helpers: `organizationPageLink` (`FRONTEND_BASE_URL/{slug}/…`) and
  `spacePageLink` (`SPACE_BASE_URL/{slug}/…`) in
  `clients/apps/web/src/utils/nav.ts`. Canonical/OG for the landing uses
  `spacePageLink` (`(header)/page.tsx generateMetadata`).
- Backend: everything funnels through `settings.generate_frontend_url` +
  `org.slug` (`server/polar/config.py:584`). Key call sites:
  `CustomerSession.customer_portal_url`
  (`server/polar/models/customer_session.py:44–51`), portal magic-link/OTP
  email (`server/polar/customer_portal/service/customer_session.py:200`),
  seat claim (`server/polar/customer_seat/sender.py:32`), subscription/order
  emails (`subscription/service.py:2408`, `order/service.py:1387–1534`),
  community event emails (`community/events_tasks.py:109`), checkout
  success (`checkout/service.py:1178,1198`, `models/checkout.py:283,352`),
  course portal URL (`course/endpoints.py:1016`).

### 1.4 Auth model (this is the good news)

- **Student portal auth is a bearer token in the URL**
  (`?customer_session_token=…`), threaded through navigation via
  searchParams; no cookie, no localStorage
  (`CustomerPortalLayoutWrapper.tsx`, `TopBar.tsx buildHref`). Bearer-token
  API calls are already served by the wildcard, non-credentialed CORS config
  (`server/polar/app.py:94–101`). **The portal is therefore
  domain-portable almost for free.**
- The **creator dashboard** is cookie-bound (`spaire_session`,
  `USER_SESSION_COOKIE_DOMAIN`, `auth/service.py:141–156`) and must **never**
  be served from a custom domain.

### 1.5 Existing scaffolding we can build on

1. **Upstream precedent**: Polar once had `organizations.custom_domain`
   (unique varchar), removed in migration
   `2024-06-21-1348_remove_organization_custom_domain.py`. Nothing else
   references it — clean slate.
2. **Entitlement flags already exist and are consumed nowhere**:
   `custom_storefront_domain` and `custom_checkout_domain` in
   `server/polar/entitlements/tiers.py:109–110` (+ `schemas.py:86–87`,
   `exceptions.py:24–25`). The feature is pre-gated per pricing tier.
3. **Domain-verification pattern already exists** for email:
   `Organization.email_sender_domain` + `email_sender_dns_records` +
   `email_sender_verified_at` (Resend DKIM flow,
   `models/organization.py:395–425`). We mirror this UX for storefront DNS.
4. **Host-based routing primitives already exist** on both sides:
   Starlette `app.host()` for backoffice/checkout-link hosts
   (`server/polar/app.py:239–245`) and the `SPACE_HOSTNAME` branch in
   `clients/apps/web/src/proxy.ts`.
5. **Natural settings UI home**: the "Public URL" row in
   `components/Customization/SpaceSettingsTab.tsx` (~L216), which already
   shows `spacePageLink(organization)` with copy-to-clipboard, and
   `BrowserChrome.tsx` for the preview URL bar.

### 1.6 Gaps

- No domain column/table, no verification flow, no host→org lookup API.
- `proxy.ts` has no arbitrary-host handling; unknown hosts fall through to
  the normal tree (would 404 or, worse, serve the marketing site).
- CORS credentialed matcher is a static set (`app.py:69–103`).
- All absolute URLs (emails, portal links, canonical/OG, checkout
  success) hardcode platform hosts.
- No TLS/issuance story for arbitrary customer domains.

---

## Part 2 — Implementation plan

### Design decisions (proposed)

- **Slug-less paths on the custom domain.** `learn.creator.com/` is the
  landing, `/portal/...` the portal, `/products/{id}` the course landing.
  The middleware rewrites internally to `/{slug}{path}` so the existing app
  tree is untouched.
- **Scope v1 to the storefront + portal.** Dashboard, login, signup and
  checkout stay on platform hosts (`SPACE_BLOCKED_PREFIXES` already models
  this). Checkout-on-own-domain is a follow-up behind the existing
  `custom_checkout_domain` entitlement.
- **One verified domain per organization** in v1; model it as a separate
  table so multiple domains / per-course domains stay possible later.
- **Subdomains only in v1** (CNAME). Apex domains need A/ALIAS handling —
  document as unsupported initially.

### Phase 1 — Data model + API (backend, ~2–3 days)

New model `server/polar/models/organization_domain.py`:

```
OrganizationDomain
  id, organization_id (FK, unique in v1), domain (citext, unique),
  status: enum(pending | verifying | active | failed | disabled),
  verification_token (for TXT record), dns_records (JSONB, like
  email_sender_dns_records), verified_at, last_checked_at
```

- New module `server/polar/organization_domain/` (endpoints/service/
  repository/schemas/tasks per repo convention):
  - `PUT /v1/organizations/{id}/domain` — set/replace domain (validate
    hostname: public-suffix check, not a spairehq.com host, lowercase).
  - `GET /v1/organizations/{id}/domain` — status + required DNS records
    (CNAME `learn.creator.com → domains.spairehq.com`, TXT
    `_spaire-verify.learn.creator.com = {token}`).
  - `POST /v1/organizations/{id}/domain/verify` — trigger check now.
  - `DELETE /v1/organizations/{id}/domain`.
  - Gate all writes behind the existing `custom_storefront_domain`
    entitlement (`entitlements/`), raising the existing entitlement error.
- **Public resolution endpoint** for the frontend middleware:
  `GET /v1/storefronts/lookup/domain/{hostname}` → `{ slug }`
  (anonymous, aggressively cached — Redis + HTTP cache headers — and
  rate-limited; mirrors the existing `lookup/product/{id}` helpers in
  `storefront/endpoints.py`).
- **Verification task** (dramatiq, like the email-sender flow): resolve
  TXT + CNAME via DNS, flip `pending → active`, re-check periodically
  (daily cron) and demote to `failed` after N misses. On activation /
  removal, call the TLS provisioning hook (Phase 2) and bust the lookup +
  CORS caches.

### Phase 2 — TLS + traffic (infra, ~1–2 days + provider setup)

The web app deploys on Vercel (`clients/apps/web/vercel.json`). Two options:

1. **Vercel for Platforms (recommended)**: on domain activation the backend
   calls the Vercel API to attach the domain to the web project; Vercel
   issues certs automatically. Creator only needs the CNAME.
2. Alternative: Cloudflare for SaaS / Caddy on-demand TLS fronting the app,
   forwarding `X-Forwarded-Host` (the devcontainer Caddyfile already
   forwards it).

Either way the app receives the original host via `host`/`x-forwarded-host`,
which `proxy.ts` already reads.

### Phase 3 — Frontend host routing (~2–3 days)

Extend `clients/apps/web/src/proxy.ts`:

- Classify the hostname: platform hosts (`FRONTEND`, `SPACE`, localhost)
  keep today's behavior; **any other host** is a candidate custom domain.
- Resolve host → slug via the new lookup endpoint (`fetch` with
  `next: { revalidate: 300 }`; unresolved → redirect to the marketing
  site).
- `NextResponse.rewrite('/{slug}{pathname}')` for allowed prefixes
  (`/`, `/products`, `/events`, `/portal`); apply the same
  `SPACE_BLOCKED_PREFIXES` redirect for dashboard/login/checkout/etc.
  Skip the `/v1/users/me` dashboard-auth fetch entirely on custom hosts.
- Set `x-spaire-storefront-host: learn.creator.com` on the rewritten
  request so server components can build host-correct canonical/OG URLs
  and know to render slug-less links.
- Redirect `/{slug}/...` → `/...` when requested **on** the custom domain
  (canonical hygiene), and optionally 301 the space URL → custom domain
  once active (SEO consolidation; portal URLs keep working on both hosts
  so old emails don't break).

### Phase 4 — URL generation (~2–3 days, mechanical but wide)

- Expose the active domain on the org schemas used by the storefront and
  portal (`/v1/storefronts/{slug}` and
  `/v1/customer-portal/organizations/{slug}` responses:
  `custom_domain: string | null`).
- Frontend: add `storefrontLink(org, path)` in `utils/nav.ts` that prefers
  the active custom domain (slug-less) over `spacePageLink`; update
  canonical/OG in `(header)/page.tsx` and portal pages, the share/copy
  URLs (`SpaceSettingsTab`, `CustomizeTab` "view live"), and
  `BrowserChrome` preview. Inside the portal, prefer **relative** links
  (the token-threading `buildHref` in `TopBar.tsx` is already relative).
- Backend: add `generate_storefront_url(organization, path)` next to
  `generate_frontend_url` in `config.py` (or as an
  `Organization.storefront_base_url` property) and thread it through the
  call sites listed in §1.3 — portal magic-link URL,
  `CustomerSession.customer_portal_url`, seat-claim email, subscription/
  order/community-event emails, course `portal_url`, default checkout
  `success_url`. This is the widest-touch part; do it as one focused PR
  with tests per call site.

### Phase 5 — CORS, cookies, security (~1–2 days)

- **CORS**: portal API calls use `Authorization: Bearer` and are already
  allowed by the wildcard non-credentialed config (`app.py:94–101`) — so
  v1 likely needs **no credentialed CORS change**. If anything
  cookie-credentialed ever runs on the custom domain, extend
  `polar_frontend_matcher` (`app.py:81`) with a Redis-cached set of active
  domains.
- **Cookies**: never set `spaire_session` on custom domains (blocked
  prefixes prevent login/dashboard there). Keep
  `USER_SESSION_COOKIE_DOMAIN` untouched.
- **Open redirect**: validate `return_url` / `success_url` hosts against
  {platform hosts ∪ the org's *active* domain} (`kit/http.py`,
  checkout service).
- **Takeover safety**: TXT ownership proof before activation; periodic
  re-verification; release the domain row when an org is deleted/blocked;
  reject domains already claimed by another org (unique index).
- **CSP/headers**: audit `next.config.mjs` header matchers — they are
  path-based so they apply on any host; confirm `frame-ancestors` and
  PostHog `/ingest` proxying behave on custom hosts.

### Phase 6 — Dashboard settings UI (~2 days)

In `SpaceSettingsTab.tsx`, under the existing "Public URL" row:

- "Custom domain" card: input → DNS instructions (copyable CNAME + TXT
  rows, same presentation as the email-sender-domain flow) → status chip
  (`Pending DNS` / `Verifying` / `Live` / `Failed`) → "Check now" +
  "Remove" actions.
- Entitlement-gated upsell state when the tier lacks
  `custom_storefront_domain` (labels already exist in
  `entitlements/exceptions.py`).
- Backoffice: read-only domain status + force-verify/remove for support
  (`server/polar/backoffice/organizations/`).

### Phase 7 — SEO + rollout (~1–2 days)

- Canonical = custom domain once active; 301 space→custom for
  landing/product/event pages; keep portal dual-host.
- Per-host `sitemap.xml`/`robots.txt` for custom domains (landing +
  course pages), respecting `storefront_settings.index`.
- Feature-flag the middleware branch; logging/metrics on domain lookups
  and verification outcomes; docs for creators (DNS how-to).

### Testing

- Unit: hostname validation, DNS verification service (mock resolver),
  lookup endpoint caching, `generate_storefront_url` per call site.
- Middleware: host classification + rewrite/redirect matrix (custom host ×
  blocked prefix × unknown host).
- E2E dev loop: `/etc/hosts` entry + Caddy with `X-Forwarded-Host`
  (devcontainer Caddyfile already forwards it).

### Open questions

1. Vercel for Platforms vs Cloudflare for SaaS for TLS (cost/limits).
2. Apex-domain support timing (needs A/ALIAS + provider support).
3. Should the space URL 301 to the custom domain immediately or only when
   the creator toggles "make primary"?
4. Checkout on the custom domain (`custom_checkout_domain` is scaffolded) —
   follow-up phase; v1 keeps checkout on platform hosts with `success_url`
   returning to the custom domain.

### Rough sequencing

Phases 1–2 unlock end-to-end serving; 3–4 make it usable; 5 hardens; 6–7
ship it. Total ≈ 2–3 engineer-weeks, with Phase 4 (URL call sites) the
largest and most mechanical chunk.
