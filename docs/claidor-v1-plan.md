# Claidor v1 — phase plan

Companion to `claidor-stack-audit.md`. Division of labor: the founder handles accounts,
purchases, corpus sourcing, and legal/business decisions; Claude Code does the
engineering. Calendar time is dominated by corpus work and lawyer feedback loops, not
code. Target: a paying pilot in roughly 3–4 months.

---

## Phase 0 — Separation & scaffolding (~1 week)

**Founder:**
- Create a new private GitHub repository for Claidor (fresh repo, e.g.
  `Spaire-Tech/claidor` or a new org) and grant Claude Code access to it.
- Create an Anthropic API account (console.anthropic.com), add billing with a low
  monthly spend cap, generate a key named for testing (e.g. `claidor-test`). Needed
  from Phase 1 onward; a separate production key replaces it at launch. (Anthropic
  has no sandbox mode — test and prod keys differ only in name and spend cap.)
- Decision (2026-08): domain purchase and all other paid accounts are deferred until
  the product is validated. Testing runs on free platform subdomains (`*.vercel.app`,
  `*.onrender.com`); the custom domain, Google OAuth, Resend, etc. move to
  Phase 3/4. Email-code login covers auth until Google sign-in lands.

**Engineering:**
- Copy the Spaire codebase into the new repo (Spaire untouched thereafter).
- Prune the obvious non-Claidor verticals: courses, community, masterclass architect
  (keep its citation validator), mobile app, storefront. Keep the chassis: auth,
  organizations, seats, billing/self-billing, email (incl. broadcast machinery for
  future alerts), files, worker, backoffice, search, observability, tests.
- Rebrand pass (names, cookies, env vars — finishing the rename Spaire started).
- Dev environment runs clean (API, worker, web, tests, migrations), CI green.

## Phase 1 — Proof: the librarian on a thin slice (2–3 weeks)

The riskiest assumption, tested smallest: citation-grade, version-aware French answers
over statute + case law. Scope: the saisie-attribution articles of AUPSRVE, **both**
the 1998 and 2023 texts, with their CCJA decisions.

**Founder:**
- Source authoritative texts: official AUPSRVE 1998 and 2023 (OHADA Journal Officiel /
  official publications) and the CCJA decisions touching the slice (CCJA publications,
  Juricaf, OHADATA). Quality of source documents matters more than quantity.
- Recruit 2–3 practicing OHADA lawyers as reviewers and line up their time for the end
  of this phase. Their verdict is the phase gate.

**Engineering:**
- The temporal corpus schema: acts → articles → article versions with validity
  intervals; decision-to-article links tagged with the version interpreted; the
  1998↔2023 concordance as a first-class table.
- Load the slice (AI-assisted extraction, human-checkable output).
- Adapt the citation pipeline: French prompts, version anchoring (resolve or ask
  "when did the proceeding begin?"), authority signal computed per version.
- Minimal reader UI (article + versions + linked decisions) and chat UI.
- Version-aware eval set; run it before the lawyers do.

**Gate:** the reviewers judge the answers and citations. Iterate here until they'd
show it to a colleague. Do not proceed on our own opinion of the answers.

## Phase 2 — The record: full AUPSRVE + the factory (3–6 weeks, overlaps Phase 3)

**Founder:**
- Corpus acquisition at scale: the full CCJA decision set, and a settled position on
  sourcing (public court decisions; note provenance for every document).
- Editorial capacity: who does human verification of links — founder time at first, a
  French-legally-literate reviewer as it scales. This becomes Claidor's permanent
  editorial function.

**Engineering:**
- Ingestion pipelines: PDF/scan → OCR → structured articles/decisions → proposed
  links, as background jobs.
- Backoffice review consoles: verify/correct extracted text and proposed links;
  nothing ships to the corpus unreviewed.
- Complete AUPSRVE: all articles, both versions, all published CCJA decisions linked
  and version-tagged; concordance complete.
- Citation-graph surfaces: article hub (cited-in, cited-with, version diff).

## Phase 3 — The product: real app, real deployment (3–4 weeks, overlaps Phase 2)

**Founder — accounts to create (an afternoon or two, engineering-guided):**
- **Vercel** account + project (frontend hosting), connect the domain.
- **Render** account (API, worker, Postgres, Redis — the existing Terraform targets
  Render, so this is the path of least resistance).
- **AWS** account: S3 buckets for documents/files + an IAM user (Terraform exists).
- **Google Cloud** OAuth credentials for "Sign in with Google" (consent screen wants
  the domain + a privacy-policy URL; starts in testing mode, verify later).
- **Resend** account for email + DNS records on the domain.
- **Sentry** account (error monitoring). PostHog optional.

**Engineering:**
- French-first product UI: search, reader, chat, authority signals, firm workspaces,
  seat invitations, onboarding.
- Auth wired: Google sign-in + passwordless email codes.
- Staging + production deployed via adapted Terraform/CI; backups enabled; Sentry
  and monitoring wired.

## Phase 4 — Money & pilot (2–3 weeks + outreach time)

**Founder:**
- A legal entity + bank account (Stripe requires it — start incorporation earlier if
  not already done).
- **Stripe** account under that entity.
- Pricing decision (per-seat monthly, firm tiers — the existing trial machinery
  supports 14-day trials).
- Terms of service + privacy policy (have a lawyer draft; also feeds Google OAuth
  verification).
- Support inbox on the domain.
- Pilot firms: 3–5 firms in Paris/Abidjan/Dakar from the Phase 1 reviewer network.

**Engineering:**
- Billing live on the self-billing machinery: tiers, trials, seats, invoices.
- Usage analytics (questions asked, unanswered questions log — already in the
  pipeline's design).
- Hardening: rate limits tuned, tenant-isolation review (consider Postgres RLS
  backstop), legal pages, data export.

**Exit:** pilot firms on trials converting to paid seats. That is v1.

## Phase 5 — Scale the library (ongoing)

Remaining uniform acts in order of litigation volume (AUSCGIE and AUS next), the
ingestion factory getting cheaper per act, gazette monitoring → the "what changed for
you" alerts on the email machinery, then the roadmap's workflow and API layers.

---

## Founder checklist by deadline

| Needed by | Item |
|---|---|
| Phase 0 | New GitHub repo + access; Anthropic API key + billing; domain |
| Phase 1 | AUPSRVE 1998 + 2023 official texts; slice CCJA decisions; 2–3 lawyer reviewers |
| Phase 2 | Full CCJA corpus source; editorial reviewer capacity |
| Phase 3 | Vercel, Render, AWS, Google OAuth, Resend (+DNS), Sentry |
| Phase 4 | Legal entity + bank, Stripe, pricing, ToS/privacy, support inbox, pilot firms |

## Running costs (rough, monthly, pre-scale)

Render (API + worker + Postgres + Redis) ~$50–150 · Vercel ~$0–20 · AWS S3 a few
dollars · Resend ~$0–20 · Sentry ~$0–30 · Anthropic usage-based (corpus building is
the spike; answering costs are modest per question thanks to prompt caching —
double-digit to low-hundreds during heavy ingestion months). Total order of
magnitude: $100–300/month plus AI usage.
