# Decisions taken from Vesence's own disclosure

Their subprocessor page is a legal document — it has to be complete and
current, which makes it the most reliable thing they publish. Source:
`docs/vesence-clone/stack.md` (research supplied 2026-08-09, sourced from
their subprocessor list updated 20 May 2026, security page, platform pages
and engineering blog).

What follows is what that changes for us. Decisions are recorded here
because they are the ones that are expensive to reverse, and they are being
taken now, before code, for that reason.

---

## First, a correction

In `plan.md` I wrote that the OOXML engine is off the critical path for the
first two months, because with the document open in Word, Office.js plus
`changeTrackingMode` makes Word itself produce the tracked changes.

Their disclosure says: *"The same engine powers both the add-in and the web
app's bulk review across hundreds of files."* That is evidence they route
add-in edits through the engine as well — most likely via
`Range.getOoxml()` / `Range.insertOoxml()` — rather than letting Word do
the work. My claim was stronger than the evidence supported.

What survives the correction:

- **Reporting** a finding needs no engine at all.
- **Simple substitutions** — a defined term, a party name, a cross-reference
  number — are range edits, and under `trackAll` Word produces native
  tracked changes for them without us touching XML.

What does not survive:

- **Rewriting a clause** — anything that changes structure, numbering or
  style — needs the engine on day one of drafting.

So the engine is off the critical path for a **review-only v1** and on it
the moment we ship drafting. That is earlier than I implied. Sequencing
holds; the confidence behind it does not.

Two well-funded teams — Vesence, and Harvey shipping their own Word editing
in September 2025 — independently built this rather than bought it. When
we get there, the answer is not `python-docx`, and we should not spend a
week rediscovering that.

---

## Decision 1 — US hosting, deliberately, and stated

**Already true, now load-bearing.** `AWS_REGION` is `us-east-2`; Render and
Vercel are US. That happened by default, not by choice.

Their entire posture is European: Sweden Central, West Europe, Frankfurt,
EU DataZone, GDPR framing throughout. For a Seattle firm working US law,
"your documents are processed in Sweden" is a question they have to answer
and we do not.

**Decided: US-only data residency, committed publicly, and never quietly
widened.** No EU region, no "global" model deployment, no cross-region
failover outside the US. This costs nothing today and cannot be reclaimed
later — a residency promise is only worth anything if it was true from the
start.

## Decision 2 — bearer tokens for the add-ins, never cookies

An add-in runs in an iframe on its own origin. Our session cookie is
`SameSite=Lax` on `.claidor.com`, so it will not be sent; Safari and Edge
block third-party cookies outright regardless.

**Decided: every add-in call is `Authorization: Bearer`, from the first
commit.** The token comes from an Office.js `displayDialog` OAuth flow into
our existing `oauth2` module and lives in `Office.context.roamingSettings`.

Entra ID SSO — which is what a firm will eventually require, and what
`Office.auth.getAccessToken()` uses natively — replaces the dialog flow
later without changing a single API surface. Building on cookies now would
mean rebuilding the whole client layer then.

### It was written down here and then not implemented — [2026-08-10]

The routes the add-in calls were built requiring `web:read` and
`web:write`. Those two are in `RESERVED_SCOPES`: granted only by
`auth.service.create_user_session`, which sets a cookie, and holdable by no
token and requestable by none. So every check route was reachable *only* by
a browser carrying a session cookie — the one credential this decision says
the add-in cannot send.

The suite passed throughout, because every test authenticated with the
default fixture and the default fixture grants the web scopes. A rule
written in a document and contradicted in code is worth less than no rule,
because it stops anyone looking.

**Fixed by adding `redline:read` and `redline:write`**, following the
convention every other module already uses: the dashboard's own scopes
*plus* a pair a token can carry. Five tests now authenticate the way the
add-in will, holding the check scopes and nothing else. No migration —
scopes are stored as varchar, not a Postgres enum.

The general form, worth keeping: **a decision about credentials needs a
test that uses the credential.** Everything else is a note.

### Entra is deferred, Google stays — [2026-08-10]

The founder's call, and right for now: the existing product signs in with
Google and that works. Entra returns when a firm asks for it, which is the
point at which somebody is paying for the answer. Nothing above changes —
the dialog flow is the same shape either way, and Entra swaps in underneath
whatever hands the pane its token.

## Decision 3 — a provider interface now, not later

Their customer-selectable inference is the sharpest thing in the document.
A firm that forbids OpenAI runs Claude through Bedrock; a firm demanding
regional processing gets a regional deployment. That is not an architecture
choice dressed up as sales — it is a sales weapon that happens to live in
the architecture, and it closes objections that otherwise end a deal.

**Decided: a provider interface from the start**, with the *firm* choosing
which routes are enabled:

| Route | Purpose |
|---|---|
| AWS Bedrock, US regions | The Claude path, and the default |
| Anthropic direct | Lower latency where the firm permits it |
| OpenAI, zero-retention endpoints only | For firms standardised on OpenAI |

Bedrock first, mirroring their reasoning: under Bedrock the model provider
gets no access to prompts, logs or completions — which is exactly why
Anthropic does not appear on their subprocessor list at all. The same
structure gives us the same sentence.

Cost: a day or two now. Cost if retrofitted: a rewrite of every call site.

## Decision 4 — the retention waiver is a thing to apply for early

They hold **Microsoft Modified Abuse Monitoring approval** on all
production Azure OpenAI accounts. By default Azure OpenAI stores prompts
and completions for abuse monitoring and a human may review them; the
approval waives the storage and removes the review. It is what backs the
strongest sentence on their security page, and it has to be applied for.

Our equivalents, in the same category — *ask early, because approval takes
time and the answer is a sentence on a security page*:

- **Bedrock**: no model-provider access to prompts or completions by
  construction. Nothing to apply for; it is a reason to prefer this route.
- **Anthropic direct**: zero-data-retention, available on request for
  enterprise accounts. **Apply.**
- **OpenAI**: zero-retention-eligible endpoints only, which requires
  approval. **Apply if we ever enable this route.**

## Decision 5 — documents are never persisted

Their claim: documents processed in memory, not persisted beyond the
session.

**Already true here** — `polar/lecteur/endpoints.py` reads the upload into
memory, reviews it, returns findings, and writes nothing. There is no
document model and no document table.

**Decided: that is an invariant, not an accident.** It gets a test, so that
adding a `documents` table becomes a deliberate act with a failing build
attached rather than a convenient afternoon. This is the single property
that is cheapest to keep and most expensive to recover: once client
documents have been written to a disk, no amount of later deletion makes
the security questionnaire easy again.

## Decision 6 — vendor count is a number we now manage

Their subprocessor list is **three legal entities**: Microsoft (required),
AWS and OpenAI (both optional). No Vercel, no Sentry, no Resend, no
Datadog, no Auth0. Transactional email and telemetry run on Azure too.

That is not laziness. Every vendor is a line a firm's risk team reads and
can veto, so they collapsed the review surface to one required name.

Ours, counted from `server/polar/config.py` today: **Render, Vercel, AWS,
Anthropic, Resend, Google, Sentry, PostHog, Logfire, Loops, Plain, Discord,
Stripe — thirteen.**

Most are inherited from Polar and die with the payments pruning (Stripe,
Discord, Loops, Plain, and probably PostHog). That takes us to roughly
seven without any new work.

**Decided now: add no new vendors.** Not decided now: whether to collapse
onto a single cloud. The honest argument on both sides —

- *For consolidating on AWS*: it is the US mirror of their play. Bedrock,
  RDS, S3, SES, CloudWatch, Cognito covers everything, we already have the
  account, and it gets the list to two or three.
- *Against, or at least not yet*: Azure has one advantage AWS structurally
  cannot match — the product lives inside Microsoft Office, and "it runs in
  your Azure tenant" is an easy sentence for a firm already standardised on
  M365. Part of why they chose it. And neither migration is on the critical
  path for having something to look at.

So: scoped as its own project, not started. Revisit when a firm asks, which
is the moment it starts mattering.

## Decision 7 — keep our backend, and stop worrying about it

They publish infrastructure and data handling in exhaustive detail and
disclose **nothing** about backend language, framework, database, job
queue, vector store, retrieval architecture or evaluation tooling.

Two things follow. Their security page is written for a firm's IT and
compliance team, because that is who decides — worth copying as a document
in its own right. And their backend is unobservable, so there is nothing
to clone there even if we wanted to. FastAPI, SQLAlchemy, Postgres and
Dramatiq stay.

---

## How the add-in actually reaches a firm — [verified 2026-08-09]

Worth getting right, because it determines whether anything Microsoft
controls is on the critical path. It is not. There are three routes and
only the third involves Microsoft at all:

1. **Sideloading.** The manifest is loaded locally. This is development.
   No account, no approval, no Microsoft involvement.
2. **Centralized deployment as a line-of-business app.** The *firm's own*
   admin uploads our manifest — Microsoft 365 admin center → Settings →
   Integrated apps → Add-ins → Deploy Add-in — and assigns it to users or
   groups. **No AppSource listing and no Microsoft approval.** Microsoft's
   own documentation describes exactly this path for custom and LOB
   add-ins: ask the developer for a manifest file or URL, then deploy it.
   Requirements are on the firm's side: an Exchange admin to do it,
   Microsoft 365 for enterprise, and Exchange Online mailboxes — all of
   which a Seattle law firm on M365 already has.
3. **AppSource.** The public marketplace. This is for discovery and
   self-serve, and it is the only route that needs Partner Center.

**So route 2 is the one that matters for selling to firms**, and it is a
sales conversation with the firm's IT, not an application to Microsoft.

### On Partner Center specifically — [verified]

It is **not a competitive acceptance**. It is business identity
verification: typically **3–5 business days**, and a rejection comes with
a stated reason and a « Fix now » path to resolve it. Rejections are about
documentation — a business registration document dated within twelve
months, an individual work email rather than a group alias — not about
merit. Nobody decides whether we are worthy.

> **Correction.** I previously listed this as "verification takes weeks"
> alongside SOC 2, which made it read as a bottleneck. It is days, it is
> appealable, and it gates the public marketplace only. Neither building
> nor selling to a firm waits on it.

## What to apply for, starting now

Only two of these have lead times that matter:

1. **Microsoft Entra ID app registration** — needed for add-in SSO and for
   Graph connectors. Free, immediate, blocks nothing but should exist.
2. **Anthropic zero-data-retention** on the account. Ask early; the answer
   is a sentence on a security page.
3. **SOC 2 Type I** — point-in-time, achievable in weeks, and the honest
   answer to a firm asking before Type II's observation window has closed.
   **This is the only genuine calendar risk on the list.**
4. **Microsoft Partner Center** — worth starting so it exists, but see
   above: days, not weeks, and it gates nothing we need first.

## Assumption ledger — additions

| # | Assumption | Basis | How it gets falsified |
|---|---|---|---|
| 6 | Their add-in edits route through the OOXML engine, not plain Office.js | [research] — "the same engine powers both" | Watching a demo, or their blog |
| 7 | US residency is a real advantage with Seattle firms | [estimate] — plausible, untested | Asking one firm |
| 8 | Bedrock in US regions serves the models we need at acceptable latency | [assumption] — unmeasured | Wiring the provider interface |
| 9 | Payments pruning removes 5 of 13 vendors | [verified] from config.py grep | The pruning commit |
| 10 | `trackAll` + range edits suffice for substitution-class fixes | [verified] WordApi 1.4; unverified at document scale | Phase 1, week 5 |
