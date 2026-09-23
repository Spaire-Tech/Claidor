# Simeon Labs rebrand inventory (23 September 2026)

## CLAIDOR_* environment variables — NOT renamed (123 unique keys)

These are read by Render, Vercel, and the running API. They stay until a
planned migration PR with dual-read aliases.

Top files by reference count:
- `render.yaml` — 61 refs (deployment config)
- `server/.env.template` — 55 refs
- `server/polar/config.py` — 7 refs (reads env into settings)
- `runner/src/settings.ts` — 11 refs
- `clients/apps/web/src/components/Integrations/integrations.ts` — 66 refs (code samples shown to users)

## User-visible "Claidor" strings — RENAMED to Simeon / Simeon Labs

### Web dashboard (clients/apps/web/)
- Auth copy (AuthModal, Login) — "Simeon"
- Settings & billing (ClaidorTier components, ConnectAppSettings) — "Simeon", tier names "Simeon Starter/Studio/Scale"
- SEO metadata (layout.tsx, portal pages) — siteName, og:title, twitter cards
- Navigation & footer (LogoType, Footer, Topbar, PolarMenu) — alt text, copyright "Simeon Labs"
- Onboarding (LovableStep, IntegrateStep, PlanPage) — system prompts, feature descriptions
- Integrations (integrations.ts, AgentPlatforms) — taglines, SDK descriptions
- Perks/Startup Stack — "Simeon credits", "Simeon Startup Stack"

### Server (server/polar/)
- Invoice legal text (generator.py, service.py) — "Simeon Labs, Inc."
- Email templates (28 .tsx files) — headers, footers, notification copy
- OpenAPI spec (openapi.py) — API title, summary, description
- OAuth2 constants — issuer URL, service docs
- Config defaults (config.py) — EMAIL_FROM_NAME, INVOICES_NAME, STRIPE_STATEMENT_DESCRIPTOR
- Payout/subscription (payout/service.py, subscription/service.py) — fee labels, plan names
- Webhooks (slack.py, tasks.py) — user-agent, alt_text
- Backoffice (components/_layout.py, _base.py) — page title
- Redline (ooxml.py, fix.py) — revision author
- Seed data (seed_platform_products.py) — product names

### Packages
- package.json description/author fields (ui, client, checkout, currency)
- README files (client, checkout)

### Word add-in
- manifest.dev.xml — ProviderName, DisplayName, label/tip strings

### API client
- v1.ts — @description doc strings (type/variable names unchanged)

## Hostnames updated
- `app.claidor.com` → `app.simeonlabs.com` (in user-visible contexts)
- `api.claidor.com` → `api.simeonlabs.com` (in user-visible contexts)
- `claidor.com` → `simeonlabs.com` (email domains, docs URLs)

## Deliberately left alone
- All `CLAIDOR_*` env var key names (123 keys)
- `render.yaml` env var values (per-deploy-target config)
- Component names, CSS classes, file paths (`ClaidorTier`, `dark:bg-claidor-700`)
- Token prefixes (`claidor_ci_`, `claidor_da_`), cookie keys (`claidor_session`)
- HTTP headers (`X-Claidor-Signature`, `X-Claidor-Event`)
- Import paths, `@claidor/*` package scope
- Internal code comments about architecture
- Hetzner / old Claidor stack (stays until Bass confirms E2E on Simeon)
- `desktop/` tree (separate product, already branded Simeon)
