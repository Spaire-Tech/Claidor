# Simeon Labs cutover — Claude Code brief (2026-09-23)

Bass’s Chief of Staff is coordinating with you. Work independently; he does not want to review a first draft.

## Brand
- **Company:** Simeon Labs (`simeonlabs.com`)
- **Product users see:** Simeon (not “Simeon Labs” in the app chrome)
- **Old brand:** Claidor (`claidor.com` / related)
- Spelling is **Simeon**, never Simon.

## What is already live (infra — do not tear down Claidor/Hetzner)
- Render project for Simeon: web + worker **live**, JWKS secret file mounted at `/etc/secrets/jwks.json`, kid `simeon_prod`
- API: `https://api.simeonlabs.com` (health OK)
- App: `https://app.simeonlabs.com` (Vercel)
- Cookie domain `.simeonlabs.com`, CORS allows `https://app.simeonlabs.com`
- Google OAuth web client for Simeon Labs GCP; JS origin `https://app.simeonlabs.com`; redirects:
  - `https://api.simeonlabs.com/v1/integrations/google/login/callback`
  - `https://api.simeonlabs.com/v1/integrations/google/link/callback`
- S3: `simeonlabs-files` / `simeonlabs-files-public` (eu-central-1)
- Resend From = Simeon / simeonlabs.com
- **Hetzner / old Claidor stack: leave alone** until Bass confirms E2E login on Simeon

## Critical rename rule (Bass asked; answer was NO to blanket replace)
**Do NOT** find-replace `claidor` → `simeonlabs` across the repo.

### Safe now (user-visible / marketing)
- UI copy, titles, logos alt text, emails, legal marketing strings that say “Claidor”
- Hardcoded public hostnames for the Simeon deploy path (`app.claidor.com` → `app.simeonlabs.com`, `api.claidor.com` → `api.simeonlabs.com`) **only where this tree is meant to ship Simeon**
- Display strings toward **Simeon**

### Do NOT rename yet (will take production down)
- Env var prefix **`CLAIDOR_*`** — Render + running API still read this contract
- Auth/cookie/JWKS wiring that keys off those env names
- Anything still required for the live Claidor deploy if this repo still ships both

### Later (separate planned PR, after Bass confirms Google login on app.simeonlabs.com)
- Full identifier rename (`CLAIDOR_*` → `SIMEON_*` or similar) with dual-read alias layer + Render/Vercel env migration
- Repo/package rename

## Your job this session
1. Add a short, durable note to `CLAUDE.md` (and keep this file) so future sessions do not blanket-rename.
2. Inventory: list high-value user-visible “Claidor” strings vs `CLAIDOR_*` env usages (counts + top paths). Do not print secrets.
3. On a **new branch from `main`** (do not pile onto unrelated WIP), implement **safe user-visible rebrand only** for the web app surfaces that ship to `app.simeonlabs.com` (and API user-facing email/copy if clearly branding). Leave `CLAIDOR_*` env readers untouched.
4. Run relevant tests/lint you can locally. Open a PR to `Spaire-Tech/Claidor` with a clear summary of what changed and what was deliberately left alone.
5. Report back: branch, PR URL, test results, residual risks.

## Success criteria
- No change to env var **names** (`CLAIDOR_*` stays)
- User-facing “Claidor” → “Simeon” (or Simeon Labs where company name is correct) on primary app chrome
- PR opened; Chief of Staff will verify diff/tests before calling done
