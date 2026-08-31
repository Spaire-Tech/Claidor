# The security posture — the answers before the questions

25 August 2026. Track H2 of `swens-plan.md`: « closed-by-default
deals, per-deal access, the security answers written down before they
are asked ». This document is those answers, written for the person a
prospect's security team sends to the first call.

One rule governs every line: **a claim about what the product enforces
cites the code that enforces it, and was checked against that code the
day this was written.** Where something is true by deployment
configuration rather than by the product, it says so. Where the honest
answer is « not yet », the answer is « not yet » — a security review
that catches this document overstating once will not believe it twice.

The product's own sentence, from `swens.md` § 7: *« Deals are closed
by default: being at the firm grants nothing, being on the deal grants
everything. »* Everything below is that sentence, enforced or
qualified.

---

## 1. Who can see a deal

**A deal is closed by default. Nobody sees it — including people at
the same firm — unless they are placed on it.**

Enforced, not policy. Access is a row in `dossier_members`
(`server/polar/models/dossier.py`), and every read path joins it:

- Every deal-scoped route resolves the deal through one helper,
  `_deal()` (`server/polar/tieout/endpoints.py:149`), which queries
  the deal *joined to the caller's membership*
  (`DossierRepository.get_for_user`). No membership, no row.
- Routes addressed by artifact, finding, link or correction id resolve
  the object first and then run the same membership check on its deal
  (`_artifact_in_deal`, and the per-object lookups in
  `server/polar/tieout/repository.py`, whose module docstring states
  the rule: every read goes through `DossierMember`).
- All 41 routes in `server/polar/tieout/endpoints.py` were audited for
  this document (25 August 2026). Every deal-scoped route gates on
  membership. The routes that do not are not deal-scoped: the panel
  token (self), the deals list (membership join), house rules and the
  team screen (organization-scoped, § 3), and one-off checks
  (owner-scoped, § 6).

**An outsider gets 404, not 403.** A person not on the deal receives
the same « Deal not found » as a person at a different firm — they do
not learn the deal exists. This is deliberate and uniform
(`endpoints.py:7-11`).

**Organization membership grants nothing on a deal.** There is no
admin override, no firm-wide read, no « partner sees everything »
role. If a firm wants someone on a deal, someone already on it adds
them.

**Who can add people:** membership changes go through the deal's
`lead` role (`server/polar/dossier/endpoints.py` — add and remove
member check `DossierRole.lead`). A member can read and work the deal;
only a lead changes who is on it.

## 2. What being « on the deal » grants

Everything within that deal, and nothing outside it: the files, the
versions, the findings, the links, the corrections, the chain, the
report, the marked-up model, and Ask. Every one of those routes runs
the § 1 check first.

Two write actions are deliberately heavier than a read, because they
create facts other checks rest on:

- **Confirming a link** (« slide 2 means Model!D26 ») requires the
  write scope; a confirmation is recorded with who and when
  (`FigureLink.confirmed_by_id`, `confirmed_at`).
- **Dismissing a finding requires a written reason**, stored in the
  dismisser's own words with their identity and the time
  (`Finding.note`, `dismissed_by_id`). Findings are never silently
  gone.

## 3. The deliberate exceptions, named

Three surfaces are organization-scoped rather than deal-scoped, on
purpose, and this is the full list:

1. **House rules** (materiality, rounding, which checks are off) are
   the firm's, not any deal's. Any organization member can read and
   set them. A rule switched off is recorded, never silent
   (`HouseRules.audit_rules_off`; the audit summary names skipped
   rules).
2. **The team screen** shows the organization's people and, for each,
   *how many* deals they are on — never which. Deal names used to
   appear here; the founder closed that on 26 August 2026, and the
   names now never leave the server (`/tieout/team` reduces each
   membership list to a count before anything is sent —
   `endpoints.py`, `get_team`; the endpoint test asserts no deal name
   appears anywhere in the payload). « Being at the firm grants
   nothing » holds without an asterisk.
3. **The deals list** shows each caller *their own* deals only — it is
   a membership join, not an organization listing.

The repository marks the organization check as deliberately weaker
than the deal check and forbids loosening the deal rule to serve it
(`repository.py:805-809`).

## 4. Authentication, sessions, and the Excel/PowerPoint panel

- **The dashboard** authenticates with a session cookie. Dashboard
  routes require reserved web scopes that API tokens cannot hold, so
  they are reachable only from a signed-in browser
  (`server/polar/tieout/auth.py`).
- **The Office panel** cannot use cookies (it is an iframe on its own
  origin; Safari and Edge block third-party cookies). It holds a
  bearer token minted at `/tieout/panel/token` with three properties
  (`endpoints.py:506-551`):
  - It can only be minted from a fresh browser session — **a token can
    never mint a token**, so a leaked narrow token cannot widen
    itself.
  - Its scopes are fixed server-side (`tieout_read`, `tieout_write`),
    never taken from the request.
  - It expires after 30 days; the panel re-asks before expiry. A token
    left on a shared machine dies on its own.
- **Scope never implies membership.** A scope says what kind of caller
  this is; which deals it can see is always the § 1 check, run per
  request (`auth.py:16-19`).

## 5. Files: intake, storage, retention

**Intake.** Files arrive by upload, the way a firm already sends
models to an external reviewer — the first engagement needs no
integration and no new network access (`swens.md` § 4). Uploads are
capped at 64 MB (`MAX_UPLOAD_BYTES`), well past the largest real model
in our corpus.

**Files are parsed, never executed.** The engine reads workbook XML
and reads what Excel itself calculated and stored; nothing opens the
file in Office, nothing evaluates macros, nothing runs customer code.
The marked-up copy (§ 7) is byte-level surgery on the file's own
archive, verified unaltered before release.

**Storage.** A deal's documents live in a private object-store bucket
(the same one the case-file store uses — never publicly readable),
keyed per deal, per version
(`server/polar/tieout/storage.py`: `tieout/{deal}/{artifact}/{file}`).
Downloads go through presigned URLs that expire (60 minutes by
default, `S3_FILES_PRESIGN_TTL`); there are no permanent public links.

**Retention — « keep the chain, drop the documents ».** Everything the
checks need is extracted into rows at ingestion: figures, cells,
labels, formulas, links. Re-checking never reopens a file. The
uploaded bytes are kept for exactly one purpose — writing an accepted
correction into a real new version of the file — and a deal can drop
its documents and lose only that: every check still runs, every chain
still renders, and the screen that offers to write says to upload the
file again (`server/polar/models/tieout.py`, `Artifact.storage_path`).

**Deletion.** Deletes in the product are soft: the deal disappears
from every screen and every list, and the rows a team wrote —
findings, decisions, notes — are not destroyed by a cleanup. A firm
that requires hard erasure of file bytes and rows on offboarding gets
that as an operational action on request; the product does not yet
expose a self-serve hard-delete, and this document will say so until
it does.

## 6. Checks outside a deal

A one-off check (a loose file forwarded at 11pm) is the strictest form
of the posture: **the file is read, checked and dropped in one
request. The bytes are never stored** — what is kept is the answer,
as a private « recent » visible only to the person who ran it (owner
check, 404 for anyone else; `endpoints.py:1277`, `OneOffCheck`
docstring in `models/tieout.py`).

## 7. What Swens writes, and where

**Swens never writes into the customer's own file store or mailbox.
Ever.** This is enforced by construction, not by policy — there is no
code path that writes outward:

- A correction is **proposed, never applied** on the product's own
  authority. It becomes a change only when a person on the deal
  accepts it, and what it produces is a **new version of the file held
  in Swens's custody**, which people on the deal may download
  (`Correction` in `models/tieout.py`; `swens.md` § 3f).
- Where the firm later connects a document store (§ 9), the connection
  is read-only: « Where Swens reads from a firm's document store, it
  writes to nothing » (`swens.md` § 7).
- The marked-up model download is generated fresh per request from the
  stored model and the open findings, released under a *different
  filename* so the original is never at risk, and never persisted
  (`endpoints.py:1869`).

## 8. The AI boundary — what reaches a model, and what cannot

Ask (chat about a deal) runs an agent whose workspace is **loaded
once, before the loop starts, from that deal only**: its files, its
findings, their chains, its named cells. The tools are offline lookups
over that fixed set — *the agent cannot issue queries*, so it cannot
reach outside the deal it was asked about
(`server/polar/tieout/agent/service.py:1-19`). Ask about a one-off
check holds only that check's stored answer — no deal, no history
(`endpoints.py:2111`).

Model calls go to Anthropic's API through one construction point
(`build_client`, `server/polar/dossier/agent/service.py`), with the
key held server-side in configuration. Honest status of the § 7
promise « route through one configurable client so a firm can point
Swens at its own cloud deployment »: the single choke point exists;
the *endpoint* is not yet configurable — pointing at a firm's own
cloud deployment (Bedrock/Vertex) is planned, not shipped. No customer
file bytes are sent to the model; the workspace is the extracted rows.

Anthropic's API terms do not train on API customer data by default.
A firm that wants zero third-party AI calls can be told plainly: today
that means not using Ask; every check, finding, chain and report is
deterministic code that involves no model call.

## 9. Connection mode (later, opt-in)

The first engagement is files-only by design — nothing touches the
firm's network. Connection mode (pointing Swens at a document folder,
read through the firm's own identity and permissions, designated model
only) is a convenience sold to an existing customer, never a condition
of sale, and is off the critical path (`swens-plan.md` H3). The
security review for it happens with a vendor whose findings the firm
already relies on.

## 10. The honest « not yet » list

Answers a security questionnaire will ask for, in their current true
state. Each of these is an answer we give before being asked, not a
gap discovered by the asker:

- **Encryption at rest** is a property of the deployed object store
  and database (bucket/volume encryption at the infrastructure layer),
  not something the application code enforces per object. Deployment
  documentation, not product code, is the evidence for it.
- **Encryption in transit** is TLS at the edge, standard.
- **SSO / SAML / SCIM**: not shipped. Sign-in is the platform's
  existing auth (email login codes, GitHub and Google OAuth).
- **A customer-visible audit log of reads** (who opened which deal
  when): partially — the product records last-visit per person per
  deal (`DealVisit`), confirmations, dismissals and decisions with
  identity and time, but there is no exportable access log yet.
- **Malware scanning of uploads**: none. The mitigations are the 64 MB
  cap, parsing-never-executing (§ 5), and storage in a private bucket.
- **Penetration test / SOC 2**: none yet. The honest sentence for a
  prospect: the posture above is enforced in code and auditable in an
  afternoon; certifications follow customers, and we will not invent
  them before they exist.
- **Data residency**: single-region deployment; no per-customer
  residency selection yet.

## 11. How this document stays true

Every « enforced » claim above names its file. The route audit in § 1
is repeatable mechanically (list every route in
`server/polar/tieout/endpoints.py`, check each for the membership
gate), and the endpoint test suite exercises the outsider-gets-404
posture. When a claim here stops matching the code, the code is right
and this document is wrong — fix the document in the same commit, or
fix the code. A posture doc that drifts is worse than none: it is
exactly the overstatement the preamble promises never to make.
